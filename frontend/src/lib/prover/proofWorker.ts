// frontend/src/lib/prover/proofWorker.ts
//
// REAL ZK proof generation worker.
//
// Pipeline:
//   1. Load the live OFAC sanctions snapshot (/data/sanctions-imt.json).
//   2. Rebuild the circuit-exact Indexed Merkle Tree and compute the real
//      non-membership witness for the connected wallet address.
//   3. Execute the compiled Noir circuit (this runs the actual non-membership
//      assertions — a sanctioned address fails here).
//   4. Generate a real UltraHonk proof with Barretenberg (bb.js).
//
// Everything runs off the main thread. The proof is real and verifiable.
//
// Message flow:
//   Main → Worker:  { type: "PROVE", payload: ProveRequest }
//   Worker → Main:  { type: "STEP",    payload: StepUpdate }
//                   { type: "WITNESS", payload: WitnessData }
//                   { type: "DONE",    payload: ProveResult }
//                   { type: "ERROR",   payload: { message, code? } }

import {
  CircuitIMT,
  addressToValue,
  toNoirInputs,
  type NonMembershipWitness,
} from "@/lib/prover/circuitImt";
import {
  computeCircuitNullifier,
  getValidityEpoch,
  nullifierToHex,
} from "@/lib/prover/nullifier";

// ---------------------------------------------------------------------------
// Message types (re-exported for use by the page)
// ---------------------------------------------------------------------------

export interface ProveRequest {
  address: string;
}

/**
 * Witness data forwarded to the UI for the IMT visualizer. Field elements are
 * hex strings; values are decimal strings (u64).
 */
export interface WitnessData {
  merkleRoot:       string;   // 0x field hex (public input)
  merklePath:       string[]; // 20 sibling field hashes (0x hex)
  pathIndices:      number[]; // 20 entries: 0 = sibling-left, 1 = sibling-right
  leafIndex:        number;   // low-leaf index in the sorted tree
  addressHash:      string;   // address as 0x (display)
  queryValue:       string;   // u64 fingerprint of the user's address
  lowLeafValue:     string;   // u64
  lowLeafNextValue: string;   // u64
  addressCount:     number;   // # sanctioned addresses in the snapshot
  builtAt:          string;   // snapshot build time (ISO)
}

export interface ProveResult {
  proofHex:     string;
  publicInputs: string[];
  nullifier:    string;
  rootUsed:     string;
  generatedAt:  number;
  elapsedMs:    number;
  witness:      WitnessData;
}

export type WorkerOutMessage =
  | { type: "STEP";    payload: { stepId: string; state: "active" | "done" | "error" } }
  | { type: "WITNESS"; payload: WitnessData }
  | { type: "DONE";    payload: ProveResult }
  | { type: "ERROR";   payload: { message: string; code?: "SANCTIONED" | "NO_SNAPSHOT" } };

export type WorkerInMessage =
  | { type: "PROVE";   payload: ProveRequest };

// ---------------------------------------------------------------------------
// Snapshot types
// ---------------------------------------------------------------------------

interface SnapshotEntry { address: string; value: string }
interface Snapshot {
  source:       string;
  fetchedAt:    string;
  builtAt:      string;
  depth:        number;
  addressCount: number;
  root:         string;
  entries:      SnapshotEntry[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function post(msg: WorkerOutMessage): void {
  self.postMessage(msg);
}

function toHex(bytes: Uint8Array): string {
  return "0x" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

self.addEventListener("message", async (event: MessageEvent<WorkerInMessage>) => {
  if (event.data.type !== "PROVE") return;

  const { address } = event.data.payload;
  const startedAt   = Date.now();

  try {
    // ── Step 1: Compute witness from the live OFAC snapshot ─────────────────
    post({ type: "STEP", payload: { stepId: "witness", state: "active" } });

    const snapRes = await fetch("/data/sanctions-imt.json", { cache: "no-store" });
    if (!snapRes.ok) {
      post({ type: "STEP", payload: { stepId: "witness", state: "error" } });
      post({
        type: "ERROR",
        payload: {
          code: "NO_SNAPSHOT",
          message:
            "OFAC sanctions snapshot not found. Run `pnpm snapshot` to fetch the live list.",
        },
      });
      return;
    }

    const snapshot = (await snapRes.json()) as Snapshot;
    const values   = snapshot.entries.map((e) => BigInt(e.value));
    const tree     = CircuitIMT.fromValues(values, snapshot.depth);

    const queryValue = addressToValue(address);

    let witness: NonMembershipWitness;
    try {
      witness = tree.nonMembershipWitness(queryValue);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      post({ type: "STEP", payload: { stepId: "witness", state: "error" } });
      if (msg === "SANCTIONED") {
        post({
          type: "ERROR",
          payload: {
            code: "SANCTIONED",
            message:
              "This address matches an entry on the OFAC sanctions list. " +
              "A non-membership proof cannot be generated.",
          },
        });
      } else {
        post({ type: "ERROR", payload: { message: `Witness error: ${msg}` } });
      }
      return;
    }

    const rootHex = "0x" + witness.root.toString(16).padStart(64, "0");

    const witnessData: WitnessData = {
      merkleRoot:       rootHex,
      merklePath:       witness.siblings.map((s) => "0x" + s.toString(16).padStart(64, "0")),
      pathIndices:      witness.pathIndices.map((b) => (b ? 1 : 0)),
      leafIndex:        witness.lowLeafIndex,
      addressHash:      address.toLowerCase(),
      queryValue:       witness.queryValue.toString(),
      lowLeafValue:     witness.lowLeafValue.toString(),
      lowLeafNextValue: witness.lowLeafNextValue.toString(),
      addressCount:     snapshot.addressCount,
      builtAt:          snapshot.builtAt,
    };

    post({ type: "STEP",    payload: { stepId: "witness", state: "done" } });
    post({ type: "WITNESS", payload: witnessData });

    // ── Step 2: Execute circuit + generate UltraHonk proof ──────────────────
    post({ type: "STEP", payload: { stepId: "prove", state: "active" } });

    const [noirMod, bbMod] = await Promise.all([
      import("@noir-lang/noir_js"),
      import("@aztec/bb.js"),
    ]);

    // bb.js ships node/browser builds; cast to the stable runtime surface we use.
    // BackendType.Wasm = 1 — we pass this explicitly so Barretenberg skips the
    // NativeUnixSocket attempt (which always fails in a browser Web Worker since
    // `typeof window === "undefined"` is true in workers, triggering the Node path).
    const bb = bbMod as unknown as {
      Barretenberg: {
        new: (opts?: {
          wasmPath?: string;
          crsPath?: string;
          backend?: number;  // BackendType enum
        }) => Promise<unknown>;
      };
      BackendType: { Wasm: number };
      UltraHonkBackend: new (
        bytecode: string,
        api: unknown,
      ) => {
        generateProof: (
          w: Uint8Array,
          opts?: { verifierTarget?: string },
        ) => Promise<{ proof: Uint8Array; publicInputs: string[] }>;
      };
    };

    const circuitRes = await fetch("/circuits/nullproof.json");
    if (!circuitRes.ok) {
      post({ type: "STEP", payload: { stepId: "prove", state: "error" } });
      post({ type: "ERROR", payload: { message: "Failed to load compiled circuit artifact" } });
      return;
    }
    const circuit = (await circuitRes.json()) as { bytecode: string };

    const noir = new noirMod.Noir(circuit as never);
    const generatedAt   = Date.now();
    const validityEpoch = getValidityEpoch(generatedAt);
    const nullifierField = computeCircuitNullifier(
      witness.queryValue,
      witness.root,
      validityEpoch,
    );
    const inputs = toNoirInputs(witness, validityEpoch, nullifierField);

    // Execute — runs every constraint. Throws if the address is sanctioned.
    const { witness: solvedWitness } = await noir.execute(inputs as never);

    // Real UltraHonk proof generation via Barretenberg.
    // - wasmPath: self-hosted WASM avoids Vite bundler resolution of .wasm.gz assets
    // - backend: BackendType.Wasm (1) — skips the NativeUnixSocket fallback that
    //   Barretenberg tries when window is undefined (i.e. inside a Web Worker)
    const wasmBackend = bb.BackendType?.Wasm ?? 1;
    const api      = await bb.Barretenberg.new({
      backend:  wasmBackend,
      wasmPath: "/bb/barretenberg.wasm.gz",
    });
    const backend  = new bb.UltraHonkBackend(circuit.bytecode, api);
    // verifierTarget: 'evm' → keccak Fiat-Shamir + variable-size proof for logN=12,
    // producing exactly the proof layout the on-chain BaseZKHonkVerifier expects.
    // The default (poseidon2) produces a fixed-size proof (logN=25) for Noir
    // recursive aggregation, which is incompatible with the EVM verifier.
    const rawProof = await backend.generateProof(solvedWitness, { verifierTarget: "evm" });

    post({ type: "STEP", payload: { stepId: "prove", state: "done" } });

    // ── Step 3: Validate public inputs ──────────────────────────────────────
    post({ type: "STEP", payload: { stepId: "validate", state: "active" } });

    if (!rawProof.publicInputs || rawProof.publicInputs.length === 0) {
      post({ type: "STEP", payload: { stepId: "validate", state: "error" } });
      post({ type: "ERROR", payload: { message: "Proof produced no public inputs" } });
      return;
    }

    const proofHex     = toHex(rawProof.proof);
    const publicInputs = rawProof.publicInputs;
    const rootUsed     = publicInputs[0] as string;
    const nullifier    = (publicInputs[1] ?? nullifierToHex(nullifierField)) as string;

    post({ type: "STEP", payload: { stepId: "validate", state: "done" } });

    // ── Step 4: Ready ───────────────────────────────────────────────────────
    post({ type: "STEP", payload: { stepId: "ready", state: "active" } });

    const result: ProveResult = {
      proofHex,
      publicInputs,
      nullifier,
      rootUsed,
      generatedAt,
      elapsedMs:   Date.now() - startedAt,
      witness:     witnessData,
    };

    post({ type: "STEP", payload: { stepId: "ready", state: "done" } });
    post({ type: "DONE", payload: result });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Proof generation failed";
    post({ type: "ERROR", payload: { message } });
  }
});
