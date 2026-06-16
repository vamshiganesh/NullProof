// frontend/src/lib/constants.ts

// ---------------------------------------------------------------------------
// Chain
// ---------------------------------------------------------------------------

/** Sepolia testnet chain ID. All wallet and contract calls must be on this chain. */
export const SUPPORTED_CHAIN_ID = 11_155_111;

/** Human-readable network name shown in the UI. */
export const SUPPORTED_CHAIN_NAME = "Sepolia";

/** Public Sepolia block explorer base URL (no trailing slash). */
export const BLOCK_EXPLORER_URL = "https://sepolia.etherscan.io";

// ---------------------------------------------------------------------------
// Contract addresses (injected at build time via Vite env vars)
// ---------------------------------------------------------------------------

export const COMPLIANCE_GATE_ADDRESS =
  (import.meta.env.VITE_COMPLIANCE_GATE_ADDRESS as string | undefined) ?? "";

export const SANCTIONS_LIST_ADDRESS =
  (import.meta.env.VITE_SANCTIONS_LIST_ADDRESS as string | undefined) ?? "";

export const VERIFIER_ADDRESS =
  (import.meta.env.VITE_VERIFIER_ADDRESS as string | undefined) ?? "";

export const SUBMISSION_ROUTER_ADDRESS =
  (import.meta.env.VITE_SUBMISSION_ROUTER_ADDRESS as string | undefined) ?? "";

export const COMPLIANT_VAULT_ADDRESS =
  (import.meta.env.VITE_COMPLIANT_VAULT_ADDRESS as string | undefined) ?? "";

/** Use relayer API when router address is configured (override with VITE_USE_RELAYER). */
export const USE_RELAYER =
  import.meta.env.VITE_USE_RELAYER === "false"
    ? false
    : Boolean(SUBMISSION_ROUTER_ADDRESS);

/** Allow direct wallet → ComplianceGate when relayer unavailable (dev only). */
export const ALLOW_DIRECT_SUBMIT =
  import.meta.env.VITE_ALLOW_DIRECT_SUBMIT === "true";

/** Require EIP-712 relayer auth (disable after in-circuit nullifier binding). */
export const REQUIRE_RELAYER_AUTH =
  import.meta.env.VITE_REQUIRE_RELAYER_AUTH !== "false";

// ---------------------------------------------------------------------------
// Protocol parameters (mirrors on-chain defaults; used for pre-flight UI)
// ---------------------------------------------------------------------------

/**
 * Default validity window in seconds (24 hours).
 * Matches the ComplianceGate constructor default.
 * The actual on-chain value is fetched via readValidityWindow() at runtime —
 * this constant is used only for UI copy and skeleton states before the
 * chain read resolves.
 */
export const DEFAULT_VALIDITY_WINDOW_SECONDS = 86_400n; // 24 h

/** Merkle tree depth used by the Noir circuit and the oracle. */
export const MERKLE_TREE_DEPTH = 20;

// ---------------------------------------------------------------------------
// Proof / prover
// ---------------------------------------------------------------------------

/**
 * Expected number of public inputs passed to Verifier.verify().
 * For NullProof this is exactly 1: the sanctions list Merkle root.
 */
export const PROOF_PUBLIC_INPUT_COUNT = 2;

/**
 * Timeout in milliseconds for the in-browser proof generation call.
 * UltraHonk proving on consumer hardware typically takes 5–20 s.
 */
export const PROOF_GENERATION_TIMEOUT_MS = 60_000; // 60 s

// ---------------------------------------------------------------------------
// Oracle / backend
// ---------------------------------------------------------------------------

/**
 * Base URL of the NullProof Node.js oracle backend.
 * Used by the frontend to fetch the current Merkle witness for a given address.
 * Falls back to localhost in development.
 */
export const ORACLE_BASE_URL =
  (import.meta.env.VITE_ORACLE_BASE_URL as string | undefined) ??
  "http://localhost:3001";

// ---------------------------------------------------------------------------
// Block explorer helpers
// ---------------------------------------------------------------------------

export const txUrl = (hash: string): string | null => {
  if (!hash || /^0x0+$/i.test(hash)) return null;
  return `${BLOCK_EXPLORER_URL}/tx/${hash}`;
};
export const addrUrl = (address: string) => `${BLOCK_EXPLORER_URL}/address/${address}`;