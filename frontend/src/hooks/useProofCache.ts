import { useCallback } from "react";
import type { Hex }    from "viem";

import { useProofStore }  from "@/store/proofStore";
import type { ProofResult } from "@/store/proofStore";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Proofs older than this are considered expired and must be regenerated. */
const PROOF_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CachedProofMeta {
  isPresent:     boolean;
  isExpired:     boolean;
  isValid:       boolean;   // present AND not expired AND root matches
  ageMs:         number | null;
  ageLabel:      string | null;
  rootUsed:      Hex | null;
  nullifier:     Hex | null;
  generatedAt:   number | null;
}

export interface UseProofCacheReturn {
  meta:          CachedProofMeta;
  result:        ProofResult | null;

  /** True when a valid, unexpired proof exists for the current sanctions root. */
  canReuse:      boolean;

  /** Check whether a cached proof is still valid against a given root. */
  isValidForRoot: (root: Hex) => boolean;

  /** Discard the current cached proof and reset the store to idle. */
  invalidate:    () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ageLabel(ms: number): string {
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  return `${Math.floor(ms / 3_600_000)}h ago`;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useProofCache(currentRoot?: Hex | null): UseProofCacheReturn {
  const result = useProofStore((s) => s.result);
  const reset  = useProofStore((s) => s.reset);

  // ---------------------------------------------------------------------------
  // Derived metadata
  // ---------------------------------------------------------------------------

  const now        = Date.now();
  const isPresent  = result !== null;
  const ageMs      = isPresent ? now - result.generatedAt : null;
  const isExpired  = ageMs !== null && ageMs > PROOF_MAX_AGE_MS;
  const rootMatch  =
    currentRoot != null &&
    result?.rootUsed != null &&
    result.rootUsed.toLowerCase() === currentRoot.toLowerCase();
  const isValid    = isPresent && !isExpired && (currentRoot == null || rootMatch);

  const meta: CachedProofMeta = {
    isPresent,
    isExpired,
    isValid,
    ageMs,
    ageLabel:    ageMs !== null ? ageLabel(ageMs) : null,
    rootUsed:    result?.rootUsed    ?? null,
    nullifier:   result?.nullifier   ?? null,
    generatedAt: result?.generatedAt ?? null,
  };

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const isValidForRoot = useCallback(
    (root: Hex): boolean => {
      if (!result || isExpired) return false;
      return result.rootUsed.toLowerCase() === root.toLowerCase();
    },
    [result, isExpired],
  );

  const invalidate = useCallback(() => {
    reset();
  }, [reset]);

  // ---------------------------------------------------------------------------
  // Return
  // ---------------------------------------------------------------------------

  return {
    meta,
    result,
    canReuse: isValid,
    isValidForRoot,
    invalidate,
  };
}
