/**
 * buildIMT.ts
 *
 * Takes a list of checksummed Ethereum addresses, hashes each one with
 * keccak256, inserts them into an Indexed Merkle Tree (depth 20), and
 * returns the root plus the full serialisable snapshot needed by the
 * frontend prover.
 *
 * Uses @zk-kit/imt which is the same library imported by the Solidity
 * verifier — guarantees root parity between off-chain and on-chain.
 */

import { IMT, IMTNode } from "@zk-kit/imt";
import { solidityPackedKeccak256, zeroPadValue, toBeHex } from "ethers";

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Tree depth must match the constant in ComplianceGate.sol.
 * Depth 20 supports up to 2^20 = 1,048,576 leaves.
 */
const TREE_DEPTH = 20;

/**
 * Zero value used for empty leaves — must match the Solidity circuit.
 * Convention: keccak256("nullproof.zeroLeaf") truncated to 31 bytes so it
 * fits in a BN254 field element (< ~2^254).
 */
const ZERO_VALUE = BigInt(
  "0x0000000000000000000000000000000000000000000000000000000000000000"
);

// ── Types ─────────────────────────────────────────────────────────────────────

export interface IMTSnapshot {
  root:        string;          // 0x-prefixed hex, 32 bytes
  depth:       number;
  leaves:      string[];        // keccak256 hashes of addresses, as 0x hex
  addressCount: number;
  builtAt:     string;          // ISO-8601
}

export interface BuildIMTResult {
  root:     string;
  tree:     IMT;
  snapshot: IMTSnapshot;
}

// ── Hash function ─────────────────────────────────────────────────────────────

/**
 * Leaf hash: keccak256(abi.encodePacked(address))
 * Matches the leaf hashing in the Circom circuit and MockVerifier.
 */
function hashAddress(address: string): bigint {
  const hash = solidityPackedKeccak256(["address"], [address]);
  // Shift right by 8 bits to ensure the value fits in BN254 scalar field
  return BigInt(hash) >> 8n;
}

/**
 * Internal node hash: keccak256(abi.encodePacked(left, right))
 * Must match the hasher used by the Solidity verifier.
 */
function poseidonMimc(nodes: IMTNode[]): bigint {
  const left  = BigInt(nodes[0] ?? 0n);
  const right = BigInt(nodes[1] ?? 0n);
  const l = zeroPadValue(toBeHex(left),  32);
  const r = zeroPadValue(toBeHex(right), 32);
  const hash = solidityPackedKeccak256(["bytes32", "bytes32"], [l, r]);
  return BigInt(hash) >> 8n;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Build a depth-20 IMT from a list of sanctioned addresses.
 *
 * @param addresses - Checksummed EVM addresses from fetchOFACAddresses()
 * @returns root (hex), the live IMT instance, and a serialisable snapshot
 */
export function buildIMT(addresses: string[]): BuildIMTResult {
  if (addresses.length === 0) {
    throw new Error("buildIMT: address list is empty — refusing to build");
  }

  const maxLeaves = 2 ** TREE_DEPTH;
  if (addresses.length > maxLeaves) {
    throw new Error(
      `buildIMT: ${addresses.length} addresses exceeds tree capacity ${maxLeaves}`
    );
  }

  // ── 1. Instantiate tree ───────────────────────────────────────────────────
  const tree = new IMT(poseidonMimc, TREE_DEPTH, ZERO_VALUE, 2);

  // ── 2. Hash & insert every address ───────────────────────────────────────
  const leaves: string[] = [];

  for (const addr of addresses) {
    const leaf = hashAddress(addr);
    tree.insert(leaf);
    leaves.push(zeroPadValue(toBeHex(leaf), 32));
  }

  // ── 3. Read root ──────────────────────────────────────────────────────────
  const rootBigInt = tree.root as bigint;
  const root       = zeroPadValue(toBeHex(rootBigInt), 32);

  // ── 4. Build snapshot ─────────────────────────────────────────────────────
  const snapshot: IMTSnapshot = {
    root,
    depth:        TREE_DEPTH,
    leaves,
    addressCount: addresses.length,
    builtAt:      new Date().toISOString(),
  };

  return { root, tree, snapshot };
}

/**
 * Generate a Merkle proof for a single address.
 * Used by the frontend to assemble the ZK proof inputs.
 *
 * @param tree     - Live IMT returned by buildIMT()
 * @param address  - The address to prove membership for
 * @returns siblings and pathIndices arrays (compatible with Circom inputs)
 */
export function generateProof(
  tree:    IMT,
  address: string,
): { siblings: string[]; pathIndices: number[] } {
  const leaf  = hashAddress(address);
  const index = tree.indexOf(leaf);

  if (index === -1) {
    throw new Error(`generateProof: address ${address} not found in tree`);
  }

  const proof = tree.createProof(index);

  const siblings = proof.siblings.map((s) =>
    zeroPadValue(toBeHex(s as bigint), 32)
  );

  return {
    siblings,
    pathIndices: proof.pathIndices,
  };
}
