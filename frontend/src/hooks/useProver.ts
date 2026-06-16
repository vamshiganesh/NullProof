import { useCallback, useRef, useEffect } from "react";
import type { Hex } from "viem";

import { useProofStore }     from "@/store/proofStore";
import { useSanctionsStore } from "@/store/sanctionsStore";
import { useWalletStore }    from "@/store/walletStore";
import {
  PROOF_GENERATION_TIMEOUT_MS,
  ORACLE_BASE_URL,
} from "@/lib/constants";
import { submitAssertCompliant } from "@/lib/chain/submitProof";
import type { ProofResult, SubmissionResult } from "@/store/proofStore";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WitnessResponse {
  merkleRoot:  string;
  merklePath:  string[];
  pathIndices: number[];
  leafIndex:   number;
  addressHash: string;
}

interface RawProofOutput {
  proof:        Uint8Array;
  publicInputs: string[];
}

export interface UseProverReturn {
  status:        import("@/store/proofStore").ProofStatus;
  steps:         import("@/store/proofStore").ProofStep[];
  result:        ProofResult | null;
  submission:    SubmissionResult | null;
  error:         string | null;
  elapsedLabel:  string | null;
  isBusy:        boolean;
  isConfirmed:   boolean;
  readyToSubmit: boolean;
  prove:         (address: string) => Promise<void>;
  submit:        () => Promise<void>;
  reset:         () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function proofToHex(proof: Uint8Array): Hex {
  return ("0x" +
    Array.from(proof)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")) as Hex;
}

function toHex(value: string): Hex {
  return (value.startsWith("0x") ? value : `0x${value}`) as Hex;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useProver(): UseProverReturn {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    status,
    steps,
    result,
    submission,
    error,
    startGeneration,
    setStepActive,
    setStepDone,
    setStepError,
    setGenerated,
    startSubmission,
    setConfirmed,
    setError,
    reset,
  } = useProofStore();

  const currentRoot = useSanctionsStore((s) => s.currentRoot);
  const address     = useWalletStore((s) => s.address);

  const isBusy        = status === "generating" || status === "submitting";
  const readyToSubmit = status === "generated" && result !== null;
  const isConfirmed   = status === "confirmed" && submission !== null;
  const elapsedLabel  = useProofStore((s) =>
    s.elapsedMs !== null ? `${(s.elapsedMs / 1000).toFixed(1)}s` : null,
  );

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Internal proving pipeline
  // ---------------------------------------------------------------------------

  async function _prove(targetAddress: string): Promise<void> {
    // Step 1: Witness
    setStepActive("witness");

    const witnessRes = await fetch(
      `${ORACLE_BASE_URL}/api/witness/${encodeURIComponent(targetAddress)}`,
    );
    if (!witnessRes.ok) {
      setStepError("witness");
      throw new Error(`Oracle error ${witnessRes.status}: ${await witnessRes.text()}`);
    }
    const witness: WitnessResponse = await witnessRes.json() as WitnessResponse;
    if (!witness.merkleRoot || witness.merklePath.length === 0) {
      setStepError("witness");
      throw new Error("Oracle returned an invalid or empty witness");
    }
    setStepDone("witness");

    // Step 2: Generate ZK proof
    setStepActive("prove");

    const [{ Noir }, { UltraHonkBackend }] = await Promise.all([
      import("@noir-lang/noir_js"),
      import("@aztec/bb.js"),
    ]);

    const circuitRes = await fetch("/circuit/nullproof.json");
    if (!circuitRes.ok) {
      setStepError("prove");
      throw new Error("Failed to load circuit artifact");
    }
    const circuit = await circuitRes.json() as { bytecode: unknown };

    const backend = new UltraHonkBackend(circuit.bytecode);
    const noir    = new Noir(circuit);

    const circuitInputs = {
      address:      targetAddress.toLowerCase(),
      merkle_root:  witness.merkleRoot,
      merkle_path:  witness.merklePath,
      path_indices: witness.pathIndices,
      leaf_index:   witness.leafIndex,
    };

    const executed = await noir.execute(circuitInputs);
    const rawProof = await backend.generateProof(executed.witness) as RawProofOutput;

    setStepDone("prove");

    // Step 3: Validate public inputs
    setStepActive("validate");

    if (!rawProof.publicInputs || rawProof.publicInputs.length === 0) {
      setStepError("validate");
      throw new Error("Proof produced no public inputs");
    }

    const proofHex     = proofToHex(rawProof.proof);
    const publicInputs = rawProof.publicInputs.map(toHex);
    const rootUsed     = publicInputs[0] as Hex;
    const nullifier    = (publicInputs[1] ?? publicInputs[0]) as Hex;

    if (currentRoot && rootUsed.toLowerCase() !== currentRoot.toLowerCase()) {
      setStepError("validate");
      throw new Error("Proof root does not match current sanctions root. Please regenerate.");
    }

    setStepDone("validate");

    // Step 4: Ready
    setStepActive("ready");

    const proofResult: ProofResult = {
      proof:       proofHex,
      publicInputs,
      nullifier,
      rootUsed,
      generatedAt: Date.now(),
    };

    setGenerated(proofResult);
    setStepDone("ready");
  }

  // ---------------------------------------------------------------------------
  // prove()
  // ---------------------------------------------------------------------------

  const prove = useCallback(
    async (targetAddress: string) => {
      if (isBusy) return;
      startGeneration();

      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutRef.current = setTimeout(() => {
          reject(new Error(`Proof generation timed out after ${PROOF_GENERATION_TIMEOUT_MS / 1000}s`));
        }, PROOF_GENERATION_TIMEOUT_MS);
      });

      try {
        await Promise.race([_prove(targetAddress), timeoutPromise]);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Proof generation failed";
        setError(message);
      } finally {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isBusy, startGeneration, setError, currentRoot],
  );

  // ---------------------------------------------------------------------------
  // submit()
  // ---------------------------------------------------------------------------

  const submit = useCallback(
    async () => {
      if (!result)  throw new Error("No proof to submit — call prove() first");
      if (!address) throw new Error("Wallet not connected");
      if (isBusy)   return;

      startSubmission();

      try {
        const { txHash, blockNumber } = await submitAssertCompliant({
          proof:        result.proof,
          publicInputs: result.publicInputs,
          nullifier:    result.nullifier,
          account:      address,
        });

        const submissionResult: SubmissionResult = {
          txHash,
          confirmedAt: Date.now(),
          blockNumber,
        };

        setConfirmed(submissionResult);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Transaction failed";
        setError(message);
      }
    },
    [result, address, isBusy, startSubmission, setConfirmed, setError],
  );

  // ---------------------------------------------------------------------------
  // Return
  // ---------------------------------------------------------------------------

  return {
    status,
    steps,
    result,
    submission,
    error,
    elapsedLabel,
    isBusy,
    isConfirmed,
    readyToSubmit,
    prove,
    submit,
    reset,
  };
}