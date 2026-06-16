// frontend/src/lib/prover/nullifier.ts
//
// Validity-epoch scoping + in-circuit nullifier (hash_triple) matching Noir.

import type { Hex } from "viem";

import { DEFAULT_VALIDITY_WINDOW_SECONDS } from "@/lib/constants";
import { hashTriple, toFieldHex } from "@/lib/prover/circuitImt";

/** Validity epoch index for a timestamp (matches on-chain validity window). */
export function getValidityEpoch(
  timestampMs: number,
  windowSeconds: bigint = DEFAULT_VALIDITY_WINDOW_SECONDS,
): number {
  const windowMs = Number(windowSeconds) * 1_000;
  return Math.floor(timestampMs / windowMs);
}

/** Seconds remaining until the validity epoch that contains `refTimeMs` ends. */
export function secondsRemainingInEpoch(
  refTimeMs: number,
  nowMs: number = Date.now(),
  windowSeconds: bigint = DEFAULT_VALIDITY_WINDOW_SECONDS,
): number {
  const windowMs = Number(windowSeconds) * 1_000;
  const epoch    = getValidityEpoch(refTimeMs, windowSeconds);
  const epochEnd = (epoch + 1) * windowMs;
  return Math.max(0, Math.floor((epochEnd - nowMs) / 1_000));
}

export function isWithinValidityWindow(
  refTimeMs: number,
  nowMs: number = Date.now(),
  windowSeconds: bigint = DEFAULT_VALIDITY_WINDOW_SECONDS,
): boolean {
  return secondsRemainingInEpoch(refTimeMs, nowMs, windowSeconds) > 0;
}

/**
 * Compute the circuit nullifier field element:
 * hash_triple(query_value, root, validity_epoch)
 */
export function computeCircuitNullifier(
  queryValue: bigint,
  root: bigint,
  validityEpoch: number,
): bigint {
  return hashTriple(queryValue, root, BigInt(validityEpoch));
}

/** Hex bytes32 nullifier for contract calldata. */
export function nullifierToHex(nullifierField: bigint): Hex {
  return toFieldHex(nullifierField) as Hex;
}
