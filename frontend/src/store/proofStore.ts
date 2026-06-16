import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { Hex } from "viem";

import { PROOF_PUBLIC_INPUT_COUNT } from "@/lib/constants";
import { isPlaceholderTxHash, readHistoryConfirmedMeta, readHistorySubmission } from "@/lib/proof/resolveSubmission";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Lifecycle of a single proof attempt:
 *
 *  idle → generating → generated → submitting → confirmed
 *                ↓                      ↓
 *             error ←────────────── error
 */
export type ProofStatus =
  | "idle"
  | "generating"
  | "generated"
  | "submitting"
  | "confirmed"
  | "error";

/**
 * Individual steps shown in the proof generation progress stepper.
 * Maps directly to the proofStep Framer Motion variant states.
 */
export type StepState = "idle" | "active" | "done" | "error";

export interface ProofStep {
  id: string;
  label: string;
  state: StepState;
}

export interface ProofResult {
  proof: Hex;
  publicInputs: Hex[];  // always length PROOF_PUBLIC_INPUT_COUNT (1)
  nullifier: Hex;
  rootUsed: Hex;
  generatedAt: number;  // Unix ms
}

export interface SubmissionResult {
  txHash: Hex;
  confirmedAt: number;  // Unix ms
  blockNumber: bigint;
}

export interface ProofState {
  // Lifecycle
  status: ProofStatus;
  error: string | null;

  // Timing
  startedAt: number | null;   // Unix ms — when generation began
  elapsedMs: number | null;   // ms taken to generate the proof

  // Progress stepper
  steps: ProofStep[];

  // Outputs
  result: ProofResult | null;
  submission: SubmissionResult | null;

  // Actions — generation
  startGeneration: () => void;
  setStepActive: (stepId: string) => void;
  setStepDone: (stepId: string) => void;
  setStepError: (stepId: string) => void;
  setGenerated: (result: ProofResult) => void;

  // Actions — submission
  startSubmission: () => void;
  setConfirmed: (submission: SubmissionResult) => void;

  // Actions — shared
  setError: (message: string) => void;
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Initial steps — mirrors the proof generation pipeline stages
// ---------------------------------------------------------------------------

const INITIAL_STEPS: ProofStep[] = [
  { id: "witness",  label: "Computing witness",       state: "idle" },
  { id: "prove",    label: "Generating ZK proof",     state: "idle" },
  { id: "validate", label: "Validating public inputs", state: "idle" },
  { id: "ready",    label: "Proof ready",              state: "idle" },
];

function resetSteps(): ProofStep[] {
  return INITIAL_STEPS.map((s) => ({ ...s, state: "idle" }));
}

function updateStep(
  steps: ProofStep[],
  stepId: string,
  state: StepState,
): ProofStep[] {
  return steps.map((s) => (s.id === stepId ? { ...s, state } : s));
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const INITIAL_STATE = {
  status:     "idle" as ProofStatus,
  error:      null,
  startedAt:  null,
  elapsedMs:  null,
  steps:      resetSteps(),
  result:     null,
  submission: null,
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useProofStore = create<ProofState>()(
  devtools(
    (set, get) => ({
      ...INITIAL_STATE,

      // -----------------------------------------------------------------------
      // Generation actions
      // -----------------------------------------------------------------------

      startGeneration: () =>
        set(
          {
            ...INITIAL_STATE,
            status:    "generating",
            startedAt: Date.now(),
            steps:     resetSteps(),
          },
          false,
          "proof/startGeneration",
        ),

      setStepActive: (stepId) =>
        set(
          (state) => ({ steps: updateStep(state.steps, stepId, "active") }),
          false,
          "proof/setStepActive",
        ),

      setStepDone: (stepId) =>
        set(
          (state) => ({ steps: updateStep(state.steps, stepId, "done") }),
          false,
          "proof/setStepDone",
        ),

      setStepError: (stepId) =>
        set(
          (state) => ({ steps: updateStep(state.steps, stepId, "error") }),
          false,
          "proof/setStepError",
        ),

      setGenerated: (result) => {
        // Runtime guard: publicInputs must always be exactly 1 element
        if (result.publicInputs.length !== PROOF_PUBLIC_INPUT_COUNT) {
          console.error(
            `proofStore: expected ${PROOF_PUBLIC_INPUT_COUNT} public input(s), got ${result.publicInputs.length}`,
          );
        }

        const startedAt = get().startedAt;

        set(
          {
            status:   "generated",
            result,
            elapsedMs: startedAt ? Date.now() - startedAt : null,
            steps:    resetSteps().map((s) => ({ ...s, state: "done" })),
            error:    null,
          },
          false,
          "proof/setGenerated",
        );
      },

      // -----------------------------------------------------------------------
      // Submission actions
      // -----------------------------------------------------------------------

      startSubmission: () =>
        set(
          { status: "submitting", error: null },
          false,
          "proof/startSubmission",
        ),

      setConfirmed: (submission) =>
        set(
          { status: "confirmed", submission, error: null },
          false,
          "proof/setConfirmed",
        ),

      // -----------------------------------------------------------------------
      // Shared actions
      // -----------------------------------------------------------------------

      setError: (message) =>
        set(
          (state) => ({
            status: "error",
            error: message,
            // Mark whichever step is currently active as errored
            steps: state.steps.map((s) =>
              s.state === "active" ? { ...s, state: "error" } : s,
            ),
          }),
          false,
          "proof/setError",
        ),

      reset: () =>
        set(INITIAL_STATE, false, "proof/reset"),
    }),
    { name: "ProofStore" },
  ),
);

// ---------------------------------------------------------------------------
// Global persistence — write proof to localStorage immediately on generation
// or confirmation, and hydrate the store back from storage on app startup.
//
// Two localStorage keys:
//   "nullproof:history"      — display metadata list (Proofs tab)
//   "nullproof:latest-proof" — full ProofResult + SubmissionResult for store
//                              hydration (Dashboard, Ledger, etc.)
// ---------------------------------------------------------------------------

const _HISTORY_KEY     = "nullproof:history";
const _LATEST_KEY      = "nullproof:latest-proof";
const _VALIDITY_MS     = 24 * 60 * 60 * 1_000; // 24 hours

// bigint-safe serialisation for SubmissionResult
interface _SerializedSubmission {
  txHash:      string;
  confirmedAt: number;
  blockNumber: string;  // bigint serialised as decimal string
}

interface _PersistedProof {
  result:     ProofResult;
  submission: _SerializedSubmission | null;
  status:     "generated" | "confirmed";
  elapsedMs:  number | null;
}

function _persistHistoryEntry(
  result:     ProofResult,
  submission: SubmissionResult | null,
  elapsedMs:  number | null,
): void {
  try {
    const raw      = localStorage.getItem(_HISTORY_KEY);
    const existing = raw ? (JSON.parse(raw) as Array<{
      id: string; txHash: string | null; confirmedAt: number | null; pending?: boolean;
    }>) : [];
    const prev = existing.find((e) => e.id === result.nullifier);

    // Never downgrade a confirmed history row back to pending.
    if (submission === null && prev) {
      const wasConfirmed =
        (prev.txHash && !isPlaceholderTxHash(prev.txHash)) ||
        prev.confirmedAt !== null ||
        prev.pending === false;
      if (wasConfirmed && (prev.txHash || prev.confirmedAt !== null)) {
        return;
      }
    }

    const entry = {
      id:           result.nullifier,
      nullifier:    result.nullifier,
      rootUsed:     result.rootUsed,
      publicInputs: result.publicInputs,
      elapsedMs,
      generatedAt:  result.generatedAt,
      txHash:       submission?.txHash ?? null,
      confirmedAt:  submission?.confirmedAt ?? null,
      blockNumber:  submission ? submission.blockNumber.toString() : null,
      pending:      submission === null,
    };
    const filtered = existing.filter((e) => e.id !== entry.id);
    localStorage.setItem(_HISTORY_KEY, JSON.stringify([entry, ...filtered]));
  } catch { /* quota exceeded */ }
}

function _saveLatestProof(
  result: ProofResult,
  submission: SubmissionResult | null,
  status: "generated" | "confirmed",
  elapsedMs: number | null,
): void {
  // Never overwrite a confirmed latest-proof snapshot with a pending one.
  if (status === "generated") {
    try {
      const raw = localStorage.getItem(_LATEST_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as _PersistedProof;
        if (
          parsed.status === "confirmed" &&
          parsed.result.nullifier === result.nullifier
        ) {
          return;
        }
      }
    } catch { /* ignore */ }
  }

  try {
    const data: _PersistedProof = {
      result,
      submission: submission
        ? { txHash: submission.txHash, confirmedAt: submission.confirmedAt, blockNumber: submission.blockNumber.toString() }
        : null,
      status,
      elapsedMs,
    };
    localStorage.setItem(_LATEST_KEY, JSON.stringify(data));
  } catch { /* quota exceeded */ }
}

function _loadLatestProof(): {
  result:     ProofResult;
  submission: SubmissionResult | null;
  status:     "generated" | "confirmed";
  elapsedMs:  number | null;
} | null {
  try {
    const raw = localStorage.getItem(_LATEST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as _PersistedProof;
    if (!parsed?.result?.proof || !parsed?.result?.nullifier) return null;

    const isConfirmed =
      parsed.status === "confirmed" || parsed.submission !== null;

    // Drop stale *unsubmitted* proofs only — keep confirmed records so the
    // dashboard can show expired state and guide renewal.
    const refTime = parsed.submission?.confirmedAt ?? parsed.result.generatedAt;
    if (!isConfirmed && Date.now() - refTime > _VALIDITY_MS) {
      localStorage.removeItem(_LATEST_KEY);
      return null;
    }

    const submission: SubmissionResult | null = parsed.submission
      ? {
          txHash:      parsed.submission.txHash as `0x${string}`,
          confirmedAt: parsed.submission.confirmedAt,
          blockNumber: BigInt(parsed.submission.blockNumber),
        }
      : null;

    // Promote generated snapshot when history has confirmed metadata.
    if (parsed.status === "generated" && !submission) {
      const fromHistory = readHistorySubmission(parsed.result.nullifier);
      if (fromHistory) {
        return {
          result:     parsed.result,
          submission: fromHistory,
          status:     "confirmed",
          elapsedMs:  parsed.elapsedMs,
        };
      }
      const meta = readHistoryConfirmedMeta(parsed.result.nullifier);
      if (meta) {
        return {
          result:     parsed.result,
          submission: null,
          status:     "generated",
          elapsedMs:  parsed.elapsedMs,
        };
      }
    }

    return {
      result:     parsed.result,
      submission,
      status:     parsed.status,
      elapsedMs:  parsed.elapsedMs,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Hydrate store from localStorage on module load (runs once, synchronously).
// This restores Dashboard and Ledger state across page refreshes.
// ---------------------------------------------------------------------------
let _hydrating = false;
(function _hydrateFromStorage() {
  const saved = _loadLatestProof();
  if (!saved) return;
  _hydrating = true;
  useProofStore.setState({
    status:     saved.status,
    result:     saved.result,
    submission: saved.submission,
    elapsedMs:  saved.elapsedMs,
    // Steps are not meaningful after hydration — mark all done
    steps: [
      { id: "witness",  label: "Computing witness",       state: "done" },
      { id: "prove",    label: "Generating ZK proof",     state: "done" },
      { id: "validate", label: "Validating public inputs", state: "done" },
      { id: "ready",    label: "Proof ready",              state: "done" },
    ],
    error: null,
  });
  _hydrating = false;
})();

// If hydrated without a fully-resolved tx hash, reconcile on-chain (upgrade hash or confirm).
void import("@/lib/proof/resolveSubmission").then(({ promoteIfNullifierOnChain, isPlaceholderTxHash }) => {
  const { result, submission, status, setConfirmed } = useProofStore.getState();
  if (!result) return;
  const needsReconcile =
    status !== "confirmed" ||
    submission === null ||
    isPlaceholderTxHash(submission.txHash);
  if (!needsReconcile) return;
  void promoteIfNullifierOnChain(result.nullifier, setConfirmed, submission);
});

// Subscribe at module level — fires on every state change regardless of which
// component is mounted. Persists on "generated" and "confirmed" transitions.
// Skips re-persistence during the initial hydration setState call.
let _prevProofStatus: ProofStatus = useProofStore.getState().status;
let _lastPersistedTxHash: string | null = null;
useProofStore.subscribe((state) => {
  if (_hydrating) return;
  const statusChanged = state.status !== _prevProofStatus;

  if (statusChanged && state.status === "generated" && state.result !== null) {
    const existingConfirmed = readHistorySubmission(state.result.nullifier);
    if (existingConfirmed) {
      queueMicrotask(() => {
        useProofStore.getState().setConfirmed(existingConfirmed);
      });
    } else {
      _persistHistoryEntry(state.result, null, state.elapsedMs);
      _saveLatestProof(state.result, null, "generated", state.elapsedMs);
      _lastPersistedTxHash = null;

      // Async: if nullifier is already on-chain, promote immediately.
      void import("@/lib/proof/resolveSubmission").then(({ promoteIfNullifierOnChain }) =>
        promoteIfNullifierOnChain(
          state.result!.nullifier,
          useProofStore.getState().setConfirmed,
          useProofStore.getState().submission,
        ),
      );
    }
  }

  if (
    state.status === "confirmed" &&
    state.result !== null &&
    state.submission !== null &&
    state.submission.txHash !== _lastPersistedTxHash
  ) {
    _persistHistoryEntry(state.result, state.submission, state.elapsedMs);
    _saveLatestProof(state.result, state.submission, "confirmed", state.elapsedMs);
    _lastPersistedTxHash = state.submission.txHash;
  }

  _prevProofStatus = state.status;
});

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export const selectProofStatus    = (s: ProofState) => s.status;
export const selectProofError     = (s: ProofState) => s.error;
export const selectProofSteps     = (s: ProofState) => s.steps;
export const selectProofResult    = (s: ProofState) => s.result;
export const selectSubmission     = (s: ProofState) => s.submission;
export const selectElapsedMs      = (s: ProofState) => s.elapsedMs;
export const selectStartedAt      = (s: ProofState) => s.startedAt;

/** True while the UI should block user input (generating or submitting). */
export const selectIsBusy = (s: ProofState) =>
  s.status === "generating" || s.status === "submitting";

/** True when a proof exists and hasn't been submitted yet. */
export const selectReadyToSubmit = (s: ProofState) =>
  s.status === "generated" && s.result !== null;

/** True when the full flow is complete (confirmed on-chain). */
export const selectIsConfirmed = (s: ProofState) =>
  s.status === "confirmed" && s.submission !== null;

/**
 * Formatted elapsed time string for the proof result screen.
 * "12.4s" | null
 */
export const selectElapsedLabel = (s: ProofState): string | null => {
  if (s.elapsedMs === null) return null;
  return `${(s.elapsedMs / 1000).toFixed(1)}s`;
};
