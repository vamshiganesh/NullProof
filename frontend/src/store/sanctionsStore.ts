import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { Hex } from "viem";

import { readProtocolStatus, readRecentRoots } from "@/lib/chain/contracts";
import type { ProtocolStatus } from "@/lib/chain/contracts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SanctionsLoadStatus = "idle" | "loading" | "loaded" | "error";

export interface RootHistoryItem {
  root: Hex;
  timestamp: bigint;
}

export interface SanctionsState {
  // Protocol status (from readProtocolStatus batch call)
  currentRoot: Hex | null;
  lastUpdatedAt: bigint | null;
  addressCount: bigint | null;
  validityWindow: bigint | null;
  submissionPaused: boolean;

  // Root history (from readRecentRoots)
  rootHistory: RootHistoryItem[];

  // Loading state
  status: SanctionsLoadStatus;
  error: string | null;
  lastFetchedAt: number | null; // Unix ms

  // Actions
  fetchStatus: () => Promise<void>;
  fetchRootHistory: (n?: bigint) => Promise<void>;
  fetchAll: () => Promise<void>;
  setError: (message: string) => void;
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const INITIAL_STATE = {
  currentRoot:      null,
  lastUpdatedAt:    null,
  addressCount:     null,
  validityWindow:   null,
  submissionPaused: false,
  rootHistory:      [] as RootHistoryItem[],
  status:           "idle" as SanctionsLoadStatus,
  error:            null,
  lastFetchedAt:    null,
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useSanctionsStore = create<SanctionsState>()(
  devtools(
    (set, _get) => ({
      ...INITIAL_STATE,

      // -----------------------------------------------------------------------
      // Fetch protocol status (currentRoot, lastUpdatedAt, addressCount,
      // validityWindow, submissionPaused) in one batched Promise.all call
      // -----------------------------------------------------------------------
      fetchStatus: async () => {
        set({ status: "loading", error: null }, false, "sanctions/fetchStatus:start");

        try {
          const protocol: ProtocolStatus = await readProtocolStatus();

          set(
            {
              currentRoot:      protocol.currentRoot,
              lastUpdatedAt:    protocol.lastUpdatedAt,
              addressCount:     protocol.currentAddressCount,
              validityWindow:   protocol.validityWindow,
              submissionPaused: protocol.submissionPaused,
              status:           "loaded",
              lastFetchedAt:    Date.now(),
              error:            null,
            },
            false,
            "sanctions/fetchStatus:done",
          );
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Failed to fetch protocol status";
          set(
            { status: "error", error: message },
            false,
            "sanctions/fetchStatus:error",
          );
        }
      },

      // -----------------------------------------------------------------------
      // Fetch recent root history (default: last 10 roots)
      // -----------------------------------------------------------------------
      fetchRootHistory: async (n = 10n) => {
        try {
          const { roots, timestamps } = await readRecentRoots(n);

          const rootHistory: RootHistoryItem[] = roots.map((root, i) => ({
            root,
            timestamp: timestamps[i] ?? 0n,
          }));

          set(
            { rootHistory },
            false,
            "sanctions/fetchRootHistory:done",
          );
        } catch (err) {
          // Root history is supplementary — don't flip status to error,
          // just log and leave existing history in place.
          console.warn(
            "sanctionsStore: failed to fetch root history —",
            err instanceof Error ? err.message : err,
          );
        }
      },

      // -----------------------------------------------------------------------
      // Fetch everything in parallel
      // -----------------------------------------------------------------------
      fetchAll: async () => {
        set({ status: "loading", error: null }, false, "sanctions/fetchAll:start");

        try {
          const [protocol, recentRoots] = await Promise.all([
            readProtocolStatus(),
            readRecentRoots(10n),
          ]);

          const rootHistory: RootHistoryItem[] = recentRoots.roots.map(
            (root, i) => ({ root, timestamp: recentRoots.timestamps[i] ?? 0n }),
          );

          set(
            {
              currentRoot:      protocol.currentRoot,
              lastUpdatedAt:    protocol.lastUpdatedAt,
              addressCount:     protocol.currentAddressCount,
              validityWindow:   protocol.validityWindow,
              submissionPaused: protocol.submissionPaused,
              rootHistory,
              status:           "loaded",
              lastFetchedAt:    Date.now(),
              error:            null,
            },
            false,
            "sanctions/fetchAll:done",
          );
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Failed to fetch sanctions data";
          set(
            { status: "error", error: message },
            false,
            "sanctions/fetchAll:error",
          );
        }
      },

      setError: (message) =>
        set(
          { status: "error", error: message },
          false,
          "sanctions/setError",
        ),

      reset: () => set(INITIAL_STATE, false, "sanctions/reset"),
    }),
    { name: "SanctionsStore" },
  ),
);

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export const selectCurrentRoot      = (s: SanctionsState) => s.currentRoot;
export const selectLastUpdatedAt    = (s: SanctionsState) => s.lastUpdatedAt;
export const selectAddressCount     = (s: SanctionsState) => s.addressCount;
export const selectValidityWindow   = (s: SanctionsState) => s.validityWindow;
export const selectSubmissionPaused = (s: SanctionsState) => s.submissionPaused;
export const selectRootHistory      = (s: SanctionsState) => s.rootHistory;
export const selectSanctionsStatus  = (s: SanctionsState) => s.status;
export const selectSanctionsError   = (s: SanctionsState) => s.error;
export const selectLastFetchedAt    = (s: SanctionsState) => s.lastFetchedAt;

/** True while the initial load is in progress and no data exists yet. */
export const selectIsInitialLoading = (s: SanctionsState) =>
  s.status === "loading" && s.currentRoot === null;

/** True when data is loaded and the protocol is accepting submissions. */
export const selectIsOperational = (s: SanctionsState) =>
  s.status === "loaded" && !s.submissionPaused && s.currentRoot !== null;

/**
 * Staleness check — true if data is older than the given threshold (ms).
 * Default threshold: 5 minutes.
 * Used by the protocol status card to show a "Refresh" hint.
 */
export const selectIsStale =
  (thresholdMs = 5 * 60 * 1000) =>
  (s: SanctionsState): boolean => {
    if (s.lastFetchedAt === null) return true;
    return Date.now() - s.lastFetchedAt > thresholdMs;
  };
