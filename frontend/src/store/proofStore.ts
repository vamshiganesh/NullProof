import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { Hex } from "viem";

import { PROOF_PUBLIC_INPUT_COUNT } from "@/lib/constants";

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
// Global persistence — write proof to localStorage immediately on generation.
//
// This runs at module load time (once, for the lifetime of the app) so the
// proof is persisted even if the user never visits the Proofs history page.
// ---------------------------------------------------------------------------

const _HISTORY_KEY = "nullproof:history";

function _persistPendingProof(result: ProofResult, elapsedMs: number | null): void {
  try {
    const entry = {
      id:           result.nullifier,
      nullifier:    result.nullifier,
      rootUsed:     result.rootUsed,
      publicInputs: result.publicInputs,
      elapsedMs,
      generatedAt:  result.generatedAt,
      txHash:       null,
      confirmedAt:  null,
      blockNumber:  null,
      pending:      true,
    };
    const raw = localStorage.getItem(_HISTORY_KEY);
    const existing = raw ? (JSON.parse(raw) as typeof entry[]) : [];
    const filtered = existing.filter((e) => e.id !== entry.id);
    localStorage.setItem(_HISTORY_KEY, JSON.stringify([entry, ...filtered]));
  } catch { /* storage quota exceeded or unavailable */ }
}

// Subscribe at module level — fires on every state change regardless of mounted
// components. We track the previous status to detect a genuine transition.
let _prevProofStatus: ProofStatus = "idle";
useProofStore.subscribe((state) => {
  if (
    state.status === "generated" &&
    _prevProofStatus !== "generated" &&
    state.result !== null
  ) {
    _persistPendingProof(state.result, state.elapsedMs);
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
