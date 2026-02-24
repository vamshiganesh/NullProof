// frontend/src/lib/prover/circuitImt.ts
//
// EXACT JavaScript replica of the on-chain Noir circuit's Indexed Merkle Tree.
//
// This is the single source of truth for tree math on the client. It MUST stay
// byte-for-byte compatible with circuit/src — otherwise generated proofs will
// not verify. The reference Noir source (from circuit/src/hash/poseidon.nr and
// circuit/src/imt/*.nr) is:
//
//   hash_pair(l, r)            = ((l + 17) * (r + 31)) + l + r + 97        (mod p)
//   hash_leaf(v, nv, ni)       = hash_pair(hash_pair(v, nv), ni)
//   compute_merkle_root(leaf, siblings[20], path_indices[20]):
//       current = leaf
//       for i in 0..20:
//           if !path_indices[i]: current = hash_pair(current, siblings[i])
//           else:                current = hash_pair(siblings[i], current)
//
//   main(query_value, low_leaf_value, low_leaf_next_value, low_leaf_next_index,
//        siblings, path_indices, root) asserts:
//       - low_leaf_value < low_leaf_next_value           (monotonic)
//       - low_leaf_value != low_leaf_next_index          (distinct)
//       - membership of hash_leaf(low_leaf) at the given path == root
//       - low_leaf_value < query_value < low_leaf_next_value   (interval)
//
// The interval assertion is the actual non-membership proof: a query strictly
// between a real leaf and its successor cannot itself be a leaf.

import { solidityPackedKeccak256 } from "ethers";

// ---------------------------------------------------------------------------
// Field + tree constants (must match the circuit)
// ---------------------------------------------------------------------------

/** BN254 scalar field prime — the modulus of Noir's `Field` type. */
export const FIELD_PRIME =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/** Merkle depth — matches `[Field; 20]` / `[bool; 20]` in the circuit. */
export const TREE_DEPTH = 20;

/** u64 bounds — used for the head/tail sentinel leaves. */
export const U64_MIN = 0n;
export const U64_MAX = (1n << 64n) - 1n; // 18_446_744_073_709_551_615

// ---------------------------------------------------------------------------
// Field hashing (exact circuit replica)
// ---------------------------------------------------------------------------

function fmod(x: bigint): bigint {
  const r = x % FIELD_PRIME;
  return r < 0n ? r + FIELD_PRIME : r;
}

/** hash_pair(left, right) = ((l+17)*(r+31)) + l + r + 97   (mod p) */
export function hashPair(left: bigint, right: bigint): bigint {
  return fmod((left + 17n) * (right + 31n) + left + right + 97n);
}

/** hash_leaf(value, next_value, next_index) = hash_pair(hash_pair(v, nv), ni) */
export function hashLeaf(value: bigint, nextValue: bigint, nextIndex: bigint): bigint {
  return hashPair(hashPair(value, nextValue), nextIndex);
}

// ---------------------------------------------------------------------------
// Address → u64 mapping
//
// An Ethereum address is 160 bits; the circuit works over u64. We fingerprint
// the address by taking the top 64 bits of keccak256(address). This is
// deterministic and identical on the oracle and the client. (A 64-bit
// fingerprint means a vanishingly small theoretical collision rate — acceptable
// for the demo, and dictated by the circuit's u64 interface.)
// ---------------------------------------------------------------------------

export function addressToValue(address: string): bigint {
  const hash = solidityPackedKeccak256(["address"], [address]); // 0x + 64 hex
  const full = BigInt(hash);
  return full >> 192n; // top 64 bits → u64
}

// ---------------------------------------------------------------------------
// Indexed Merkle Tree (sorted linked-list form)
// ---------------------------------------------------------------------------

export interface IndexedLeaf {
  value:     bigint;
  nextValue: bigint;
  nextIndex: bigint;
}

export interface NonMembershipWitness {
  queryValue:       bigint;
  lowLeafValue:     bigint;
  lowLeafNextValue: bigint;
  lowLeafNextIndex: bigint;
  lowLeafIndex:     number;
  siblings:         bigint[];   // length TREE_DEPTH
  pathIndices:      boolean[];  // length TREE_DEPTH
  root:             bigint;
}

/**
 * Build the sorted leaf set from a list of u64 sanctioned values.
 *
 * Sentinels: a head leaf with value 0 and a tail leaf with value U64_MAX are
 * always present so that ANY query in (0, U64_MAX) has a well-defined low leaf
 * whose `next_value` is strictly greater — required by the circuit's interval
 * and monotonicity assertions.
 */
export function buildSortedLeaves(values: bigint[]): IndexedLeaf[] {
  const set = new Set<bigint>();
  set.add(U64_MIN);
  set.add(U64_MAX);
  for (const v of values) {
    if (v > U64_MIN && v < U64_MAX) set.add(v);
  }

  const sorted = Array.from(set).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  return sorted.map((value, i) => {
    const isLast = i === sorted.length - 1;
    return {
      value,
      nextValue: isLast ? 0n : sorted[i + 1]!,
      nextIndex: isLast ? 0n : BigInt(i + 1),
    };
  });
}

export class CircuitIMT {
  readonly leaves: IndexedLeaf[];
  readonly depth: number;
  private readonly leafHashes: bigint[];
  private readonly zeros: bigint[]; // zero-subtree hash per level (0..depth)

  constructor(leaves: IndexedLeaf[], depth: number = TREE_DEPTH) {
    this.leaves = leaves;
    this.depth = depth;
    this.leafHashes = leaves.map((l) => hashLeaf(l.value, l.nextValue, l.nextIndex));

    // Precompute the hash of a fully-empty subtree at each level.
    this.zeros = new Array(depth + 1);
    this.zeros[0] = 0n;
    for (let k = 1; k <= depth; k++) {
      this.zeros[k] = hashPair(this.zeros[k - 1]!, this.zeros[k - 1]!);
    }
  }

  static fromValues(values: bigint[], depth: number = TREE_DEPTH): CircuitIMT {
    return new CircuitIMT(buildSortedLeaves(values), depth);
  }

  /** Sparse root: occupied leaves first, everything else is a zero-subtree. */
  get root(): bigint {
    let cur = this.leafHashes;
    if (cur.length === 0) return this.zeros[this.depth]!;

    for (let level = 0; level < this.depth; level++) {
      const next: bigint[] = [];
      for (let i = 0; i < Math.ceil(cur.length / 2); i++) {
        const left  = cur[2 * i]!;
        const right = 2 * i + 1 < cur.length ? cur[2 * i + 1]! : this.zeros[level]!;
        next.push(hashPair(left, right));
      }
      cur = next;
    }
    return cur[0] ?? this.zeros[this.depth]!;
  }

  /** Build the Merkle authentication path for a leaf at `index`. */
  buildPath(index: number): { siblings: bigint[]; pathIndices: boolean[]; root: bigint } {
    if (index < 0 || index >= this.leafHashes.length) {
      throw new Error(`CircuitIMT: leaf index ${index} out of range`);
    }

    const siblings: bigint[] = [];
    const pathIndices: boolean[] = [];

    let cur = this.leafHashes;
    let idx = index;

    for (let level = 0; level < this.depth; level++) {
      const isRight = idx % 2 === 1;
      const sibIdx  = isRight ? idx - 1 : idx + 1;
      const sibling = sibIdx < cur.length ? cur[sibIdx]! : this.zeros[level]!;

      siblings.push(sibling);
      pathIndices.push(isRight);

      // Hash up to the next level (sparse).
      const next: bigint[] = [];
      for (let i = 0; i < Math.ceil(cur.length / 2); i++) {
        const left  = cur[2 * i]!;
        const right = 2 * i + 1 < cur.length ? cur[2 * i + 1]! : this.zeros[level]!;
        next.push(hashPair(left, right));
      }
      cur = next;
      idx = Math.floor(idx / 2);
    }

    return { siblings, pathIndices, root: cur[0] ?? this.zeros[this.depth]! };
  }

  /**
   * Find the low leaf for a query value and assemble the non-membership witness.
   * Throws if the query value is already present (i.e. the address is sanctioned).
   */
  nonMembershipWitness(queryValue: bigint): NonMembershipWitness {
    // Locate the largest leaf strictly less than queryValue (binary search).
    let lo = 0;
    let hi = this.leaves.length - 1;
    let lowIndex = -1;

    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const v = this.leaves[mid]!.value;
      if (v === queryValue) {
        throw new Error("SANCTIONED"); // exact match — query IS in the list
      }
      if (v < queryValue) {
        lowIndex = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    if (lowIndex < 0) {
      throw new Error("CircuitIMT: no low leaf found (query below head sentinel)");
    }

    const low = this.leaves[lowIndex]!;
    if (!(queryValue > low.value && queryValue < low.nextValue)) {
      throw new Error("CircuitIMT: query not strictly within low-leaf interval");
    }

    const { siblings, pathIndices, root } = this.buildPath(lowIndex);

    return {
      queryValue,
      lowLeafValue:     low.value,
      lowLeafNextValue: low.nextValue,
      lowLeafNextIndex: low.nextIndex,
      lowLeafIndex:     lowIndex,
      siblings,
      pathIndices,
      root,
    };
  }
}

// ---------------------------------------------------------------------------
// Noir input formatting
// ---------------------------------------------------------------------------

/** Convert a field element to a 0x-prefixed 32-byte hex string for Noir. */
export function toFieldHex(v: bigint): string {
  return "0x" + fmod(v).toString(16).padStart(64, "0");
}

/**
 * Format a witness into the exact input map expected by the compiled circuit's
 * ABI (see frontend/public/circuits/nullproof.json).
 */
export function toNoirInputs(w: NonMembershipWitness): Record<string, unknown> {
  return {
    query_value:         w.queryValue.toString(),
    low_leaf_value:      w.lowLeafValue.toString(),
    low_leaf_next_value: w.lowLeafNextValue.toString(),
    low_leaf_next_index: w.lowLeafNextIndex.toString(),
    siblings:            w.siblings.map(toFieldHex),
    path_indices:        w.pathIndices,
    root:                toFieldHex(w.root),
  };
}
