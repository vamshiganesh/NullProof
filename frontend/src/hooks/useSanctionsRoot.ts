import { useEffect, useCallback } from "react";

import { useSanctionsStore }    from "@/store/sanctionsStore";
import { readIsKnownRoot }      from "@/lib/chain/contracts";
import type { Hex }             from "viem";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Re-fetch sanctions data if it is older than this threshold. */
const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseSanctionsRootReturn {
  // Data
  currentRoot:      Hex | null;
  lastUpdatedAt:    bigint | null;
  addressCount:     bigint | null;
  validityWindow:   bigint | null;
  submissionPaused: boolean;
  rootHistory:      import("@/store/sanctionsStore").RootHistoryItem[];

  // Status
  isLoading:        boolean;
  isLoaded:         boolean;
  isError:          boolean;
  isStale:          boolean;
  isOperational:    boolean;
  error:            string | null;
  lastFetchedAt:    number | null;

  // Actions
  refresh:          () => Promise<void>;
  checkRootKnown:   (root: Hex) => Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSanctionsRoot(): UseSanctionsRootReturn {
  const currentRoot      = useSanctionsStore((s) => s.currentRoot);
  const lastUpdatedAt    = useSanctionsStore((s) => s.lastUpdatedAt);
  const addressCount     = useSanctionsStore((s) => s.addressCount);
  const validityWindow   = useSanctionsStore((s) => s.validityWindow);
  const submissionPaused = useSanctionsStore((s) => s.submissionPaused);
  const rootHistory      = useSanctionsStore((s) => s.rootHistory);
  const status           = useSanctionsStore((s) => s.status);
  const error            = useSanctionsStore((s) => s.error);
  const lastFetchedAt    = useSanctionsStore((s) => s.lastFetchedAt);

  const { fetchAll } = useSanctionsStore.getState();

  // ---------------------------------------------------------------------------
  // Auto-fetch on mount if data is absent or stale
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const isAbsent = status === "idle" || currentRoot === null;
    const isStaleNow =
      lastFetchedAt === null ||
      Date.now() - lastFetchedAt > STALE_THRESHOLD_MS;

    if (isAbsent || isStaleNow) {
      void fetchAll();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally run once on mount only

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const isLoading     = status === "loading";
  const isLoaded      = status === "loaded";
  const isError       = status === "error";
  const isStale       =
    lastFetchedAt === null ||
    Date.now() - lastFetchedAt > STALE_THRESHOLD_MS;
  const isOperational = isLoaded && !submissionPaused && currentRoot !== null;

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const refresh = useCallback(async () => {
    await fetchAll();
  }, [fetchAll]);

  /**
   * Checks whether a specific root is recognised by the SanctionsList contract.
   * Used by the proof pre-flight screen to validate the root the proof was
   * built against before prompting the user to sign.
   */
  const checkRootKnown = useCallback(async (root: Hex): Promise<boolean> => {
    try {
      return await readIsKnownRoot(root);
    } catch {
      return false;
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Return
  // ---------------------------------------------------------------------------

  return {
    currentRoot,
    lastUpdatedAt,
    addressCount,
    validityWindow,
    submissionPaused,
    rootHistory,
    isLoading,
    isLoaded,
    isError,
    isStale,
    isOperational,
    error,
    lastFetchedAt,
    refresh,
    checkRootKnown,
  };
}
