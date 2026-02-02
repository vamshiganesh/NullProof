import { useState, useEffect, useCallback, useRef } from "react";
import type { Hex } from "viem";

import {
  readCurrentRoot,
  readLastUpdatedAt,
  readCurrentAddressCount,
  readIsKnownRoot,
  readRootHistory,
  readRecentRoots,
  readIsNullifierUsed,
  readNullifierUsedAt,
  readValidityWindow,
  readSubmissionPaused,
  readCheckCompliant,
  createDefaultPublicClient,
  type RootHistoryEntry,
  type RecentRootsResult,
  type CheckCompliantParams,
} from "@/lib/chain/contracts";
import type { PublicClient } from "viem";

// ---------------------------------------------------------------------------
// Generic async read state
// ---------------------------------------------------------------------------

type ReadStatus = "idle" | "loading" | "success" | "error";

interface ReadState<T> {
  data:      T | null;
  status:    ReadStatus;
  error:     string | null;
  isLoading: boolean;
  isSuccess: boolean;
  isError:   boolean;
}

function initialState<T>(): ReadState<T> {
  return {
    data:      null,
    status:    "idle",
    error:     null,
    isLoading: false,
    isSuccess: false,
    isError:   false,
  };
}

// ---------------------------------------------------------------------------
// Internal generic hook
// ---------------------------------------------------------------------------

function useAsyncRead<T>(
  fetcher: (client: PublicClient) => Promise<T>,
  deps:    unknown[],
  enabled: boolean = true,
): ReadState<T> & { refetch: () => void } {
  const [state, setState] = useState<ReadState<T>>(initialState<T>());
  const counterRef        = useRef(0);

  const run = useCallback(() => {
    if (!enabled) return;

    const ticket = ++counterRef.current;
    setState({ data: null, status: "loading", error: null, isLoading: true, isSuccess: false, isError: false });

    const client = createDefaultPublicClient();

    fetcher(client)
      .then((data) => {
        if (ticket !== counterRef.current) return; // stale response
        setState({ data, status: "success", error: null, isLoading: false, isSuccess: true, isError: false });
      })
      .catch((err: unknown) => {
        if (ticket !== counterRef.current) return;
        const message = err instanceof Error ? err.message : "Contract read failed";
        setState({ data: null, status: "error", error: message, isLoading: false, isSuccess: false, isError: true });
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  useEffect(() => {
    run();
  }, [run]);

  return { ...state, refetch: run };
}

// ---------------------------------------------------------------------------
// SanctionsList reads
// ---------------------------------------------------------------------------

/** Read the current Merkle root from SanctionsList. */
export function useCurrentRoot() {
  return useAsyncRead<Hex>(
    (client) => readCurrentRoot(client),
    [],
  );
}

/** Read the timestamp of the last sanctions list update. */
export function useLastUpdatedAt() {
  return useAsyncRead<bigint>(
    (client) => readLastUpdatedAt(client),
    [],
  );
}

/** Read the current address count in the sanctions list. */
export function useCurrentAddressCount() {
  return useAsyncRead<bigint>(
    (client) => readCurrentAddressCount(client),
    [],
  );
}

/** Check whether a specific Merkle root is recognised by SanctionsList. */
export function useIsKnownRoot(root: Hex | null) {
  return useAsyncRead<boolean>(
    (client) => readIsKnownRoot(root as Hex, client),
    [root],
    root !== null,
  );
}

/** Fetch historical metadata for a specific Merkle root. */
export function useRootHistory(root: Hex | null) {
  return useAsyncRead<RootHistoryEntry>(
    (client) => readRootHistory(root as Hex, client),
    [root],
    root !== null,
  );
}

/** Fetch the N most recent Merkle roots and their timestamps. */
export function useRecentRoots(n: bigint = 5n) {
  return useAsyncRead<RecentRootsResult>(
    (client) => readRecentRoots(n, client),
    [n.toString()],
  );
}

// ---------------------------------------------------------------------------
// ComplianceGate reads
// ---------------------------------------------------------------------------

/** Check whether a nullifier has already been used. */
export function useIsNullifierUsed(nullifier: Hex | null) {
  return useAsyncRead<boolean>(
    (client) => readIsNullifierUsed(nullifier as Hex, client),
    [nullifier],
    nullifier !== null,
  );
}

/** Fetch the block timestamp at which a nullifier was used (0n if unused). */
export function useNullifierUsedAt(nullifier: Hex | null) {
  return useAsyncRead<bigint>(
    (client) => readNullifierUsedAt(nullifier as Hex, client),
    [nullifier],
    nullifier !== null,
  );
}

/** Read the proof validity window from ComplianceGate (in seconds). */
export function useValidityWindow() {
  return useAsyncRead<bigint>(
    (client) => readValidityWindow(client),
    [],
  );
}

/** Check whether the ComplianceGate submission is currently paused. */
export function useSubmissionPaused() {
  return useAsyncRead<boolean>(
    (client) => readSubmissionPaused(client),
    [],
  );
}

/**
 * Simulate checkCompliant() on ComplianceGate.
 * Pass null params to skip the read until all values are ready.
 */
export function useCheckCompliant(params: CheckCompliantParams | null) {
  return useAsyncRead<boolean>(
    (client) => readCheckCompliant(params as CheckCompliantParams, client),
    [params?.proof, params?.nullifier],
    params !== null,
  );
}
