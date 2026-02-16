// frontend/src/lib/prover/proofWorker.ts
//
// Web Worker that runs UltraHonk proof generation off the main thread.
// Communicates via structured postMessage.
//
// Message flow:
//   Main → Worker:  { type: "PROVE", payload: ProveRequest }
//   Worker → Main:  { type: "STEP",  payload: StepUpdate   }
//                   { type: "DONE",  payload: ProveResult   }
//                   { type: "ERROR", payload: { message }   }

import { ORACLE_BASE_URL } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Message types (re-exported for use by the page)
// ---------------------------------------------------------------------------

export interface ProveRequest {
  address: string;
}

export interface WitnessData {
  merkleRoot:  string;
  merklePath:  string[];
  pathIndices: number[];
  leafIndex:   number;
  addressHash: string;
}

export interface ProveResult {
  proofHex:     string;
  publicInputs: string[];
  nullifier:    string;
  rootUsed:     string;
  generatedAt:  number;
  elapsedMs:    number;
  witness:      WitnessData;   // ← forwarded for IMT visualizer
}

export type WorkerOutMessage =
  | { type: "STEP";    payload: { stepId: string; state: "active" | "done" | "error" } }
  | { type: "DONE";    payload: ProveResult }
  | { type: "ERROR";   payload: { message: string } };

export type WorkerInMessage =
  | { type: "PROVE";   payload: ProveRequest };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function post(msg: WorkerOutMessage) {
  self.postMessage(msg);
}

function proofToHex(proof: Uint8Array): string {
  return "0x" + Array.from(proof).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function toHex(value: string): string {
  return value.startsWith("0x") ? value : `0x${value}`;
}

async function deriveNullifier(proof: Uint8Array, address: string): Promise<string> {
  const encoder  = new TextEncoder();
  const combined = new Uint8Array([...proof, ...encoder.encode(address.toLowerCase())]);
  const hashBuf  = await crypto.subtle.digest("SHA-256", combined);
  return "0x" + Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

self.addEventListener("message", async (event: MessageEvent<WorkerInMessage>) => {
  if (event.data.type !== "PROVE") return;

  const { address } = event.data.payload;
  const startedAt   = Date.now();

  try {
    // ── Step 1: Fetch witness from oracle ──────────────────────────────
    post({ type: "STEP", payload: { stepId: "witness", state: "active" } });

    const witnessRes = await fetch(
      `${ORACLE_BASE_URL}/api/witness/${encodeURIComponent(address)}`,
    );
    if (!witnessRes.ok) {
      post({ type: "STEP", payload: { stepId: "witness", state: "error" } });
      post({ type: "ERROR", payload: { message: `Oracle error ${witnessRes.status}: ${await witnessRes.text()}` } });
      return;
    }

    const witness = await witnessRes.json() as WitnessData;
    if (!witness.merkleRoot || witness.merklePath.length === 0) {
      post({ type: "STEP", payload: { stepId: "witness", state: "error" } });
      post({ type: "ERROR", payload: { message: "Oracle returned empty witness" } });
      return;
    }
    post({ type: "STEP", payload: { stepId: "witness", state: "done" } });

    // ── Step 2: Load circuit + generate proof ──────────────────────────
    post({ type: "STEP", payload: { stepId: "prove", state: "active" } });

    const [{ Noir }, { UltraHonkBackend }] = await Promise.all([
      import("@noir-lang/noir_js"),
      import("@aztec/bb.js"),
    ]);

    const circuitRes = await fetch("/circuit/nullproof.json");
    if (!circuitRes.ok) {
      post({ type: "STEP", payload: { stepId: "prove", state: "error" } });
      post({ type: "ERROR", payload: { message: "Failed to load circuit artifact" } });
      return;
    }
    const circuit = await circuitRes.json() as { bytecode: unknown };

    const backend = new UltraHonkBackend(circuit.bytecode);
    const noir    = new Noir(circuit);

    const executed = await noir.execute({
      address:      address.toLowerCase(),
      merkle_root:  witness.merkleRoot,
      merkle_path:  witness.merklePath,
      path_indices: witness.pathIndices,
      leaf_index:   witness.leafIndex,
    });

    const rawProof = await backend.generateProof(executed.witness) as {
      proof: Uint8Array;
      publicInputs: string[];
    };
    post({ type: "STEP", payload: { stepId: "prove", state: "done" } });

    // ── Step 3: Validate public inputs ────────────────────────────────
    post({ type: "STEP", payload: { stepId: "validate", state: "active" } });

    if (!rawProof.publicInputs || rawProof.publicInputs.length === 0) {
      post({ type: "STEP", payload: { stepId: "validate", state: "error" } });
      post({ type: "ERROR", payload: { message: "Proof produced no public inputs" } });
      return;
    }

    const proofHex     = proofToHex(rawProof.proof);
    const publicInputs = rawProof.publicInputs.map(toHex);
    const rootUsed     = publicInputs[0] as string;
    const nullifier    = await deriveNullifier(rawProof.proof, address);

    post({ type: "STEP", payload: { stepId: "validate", state: "done" } });

    // ── Step 4: Ready ─────────────────────────────────────────────────
    post({ type: "STEP", payload: { stepId: "ready", state: "active" } });

    const result: ProveResult = {
      proofHex,
      publicInputs,
      nullifier,
      rootUsed,
      generatedAt: Date.now(),
      elapsedMs:   Date.now() - startedAt,
      witness,
    };

    post({ type: "STEP", payload: { stepId: "ready", state: "done" } });
    post({ type: "DONE", payload: result });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Proof generation failed";
    post({ type: "ERROR", payload: { message } });
  }
});