// frontend/src/lib/proof/resolveSubmission.ts
//
// Recover on-chain submission metadata (tx hash, block, timestamp) for a
// consumed nullifier. Used when localStorage is missing the tx hash — e.g.
// after NullifierAlreadyUsed reconciliation or a page refresh.

import type { Hex } from "viem";

import {
  fetchNullifierSubmission,
  readNullifierUsedAt,
} from "@/lib/chain/contracts";
import type { SubmissionResult } from "@/store/proofStore";

const HISTORY_KEY = "nullproof:history";

/** Internal sentinel — means confirmed on-chain but tx hash not resolved yet. Never link to Etherscan. */
export const PLACEHOLDER_TX_HASH =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;

/** True for the all-zero placeholder hash we must never persist or link out. */
export function isPlaceholderTxHash(txHash: string): boolean {
  return /^0x0+$/i.test(txHash);
}

export function readHistorySubmission(nullifier: string): SubmissionResult | null {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return null;
    const entries = JSON.parse(raw) as Array<{
      id:          string;
      txHash:      string | null;
      confirmedAt: number | null;
      blockNumber: string | null;
      pending?:    boolean;
    }>;
    const match = entries.find((e) => e.id === nullifier);
    if (!match || match.pending) return null;
    // Only return when we have a real tx hash — never return the placeholder here.
    if (!match.txHash || isPlaceholderTxHash(match.txHash)) return null;
    if (match.confirmedAt === null) return null;
    return {
      txHash:      match.txHash as Hex,
      confirmedAt: match.confirmedAt,
      blockNumber: match.blockNumber ? BigInt(match.blockNumber) : 0n,
    };
  } catch {
    return null;
  }
}

/** Confirmed on-chain metadata from history even when tx hash is not stored yet. */
export function readHistoryConfirmedMeta(
  nullifier: string,
): { confirmedAt: number; blockNumber: bigint } | null {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return null;
    const entries = JSON.parse(raw) as Array<{
      id: string; confirmedAt: number | null; blockNumber: string | null; pending?: boolean;
      txHash: string | null;
    }>;
    const match = entries.find((e) => e.id === nullifier);
    if (!match || match.pending) return null;
    const hasRealTx = match.txHash && !isPlaceholderTxHash(match.txHash);
    if (!hasRealTx && match.confirmedAt === null) return null;
    return {
      confirmedAt: match.confirmedAt ?? 0,
      blockNumber: match.blockNumber ? BigInt(match.blockNumber) : 0n,
    };
  } catch {
    return null;
  }
}

/**
 * Resolve submission details for a nullifier:
 *   1. localStorage history (fast)
 *   2. ComplianceGate ProofVerified / NullifierConsumed logs (authoritative)
 */
export async function resolveNullifierSubmission(
  nullifier: Hex,
): Promise<SubmissionResult | null> {
  const fromHistory = readHistorySubmission(nullifier);
  if (fromHistory) return fromHistory;

  const fromChain = await fetchNullifierSubmission(nullifier);
  if (fromChain) return fromChain;

  // Last resort: nullifier is marked used but logs weren't found (RPC lag, etc.)
  try {
    const usedAt = await readNullifierUsedAt(nullifier);
    if (usedAt > 0n) {
      return null; // caller should keep polling / show partial state
    }
  } catch {
    /* ignore */
  }

  return null;
}

/**
 * If the nullifier is already consumed on-chain, mark the store confirmed.
 * Resolves the real tx hash when possible; otherwise uses a placeholder so
 * all screens agree on "submitted" while Etherscan links stay hidden.
 */
export async function promoteIfNullifierOnChain(
  nullifier: Hex,
  setConfirmed: (s: SubmissionResult) => void,
  current: SubmissionResult | null = null,
): Promise<boolean> {
  const { readIsNullifierUsed, readNullifierUsedAt } =
    await import("@/lib/chain/contracts");
  const used = await readIsNullifierUsed(nullifier);
  if (!used) return false;

  const resolved = await resolveNullifierSubmission(nullifier);
  if (resolved && !isPlaceholderTxHash(resolved.txHash)) {
    setConfirmed(resolved);
    return true;
  }

  // Already confirmed (even with placeholder tx) — do not reset state.
  if (current) return true;

  const usedAt = await readNullifierUsedAt(nullifier);
  const meta   = readHistoryConfirmedMeta(nullifier);
  setConfirmed({
    txHash:      PLACEHOLDER_TX_HASH,
    confirmedAt: meta?.confirmedAt ?? Number(usedAt) * 1000,
    blockNumber: meta?.blockNumber ?? 0n,
  });
  return true;
}
