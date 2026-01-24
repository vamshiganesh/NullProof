import { solidityPackedKeccak256, zeroPadValue } from "ethers";

import { IndexedMerkleTree } from "./IndexedMerkleTree";
import type {
  HexString,
  IMTLeaf,
  IMTNonMembershipProofInput,
  IMTPath,
  IMTProofInput,
} from "./types";

function toHex32(value: string): HexString {
  return zeroPadValue(value, 32) as HexString;
}

export function hashAddressToLeaf(address: string): HexString {
  return toHex32(
    solidityPackedKeccak256(["address"], [address]),
  );
}

export function pathToProofInput(path: IMTPath): IMTProofInput {
  return {
    root: path.root,
    leaf: path.leaf.value,
    siblings: path.siblings.map((sibling) => sibling.value),
    pathIndices: path.pathIndices,
  };
}

export function createMembershipProof(
  tree: IndexedMerkleTree,
  leaf: HexString,
): IMTProofInput {
  const index = tree.indexOf(leaf);

  if (index === -1) {
    throw new Error("MerkleProof: leaf not found in tree");
  }

  const path = tree.buildPath(index);
  return pathToProofInput(path);
}

export interface NonMembershipContext {
  queriedLeaf: HexString;
  exists: boolean;
  exactLeaf: IMTLeaf | null;
  lowLeaf: IMTLeaf | null;
  lowLeafPath: IMTPath | null;
  highLeaf: IMTLeaf | null;
}

export function createNonMembershipProof(
  tree: IndexedMerkleTree,
  queriedLeaf: HexString,
): IMTNonMembershipProofInput {
  const bounds = tree.findBounds(queriedLeaf);

  if (bounds.lowLeaf && bounds.lowLeaf.value === queriedLeaf) {
    throw new Error("MerkleProof: queried leaf already exists in tree");
  }

  if (!bounds.lowLeaf || bounds.lowIndex < 0) {
    throw new Error(
      "MerkleProof: cannot generate non-membership proof without a lower bound leaf",
    );
  }

  const lowLeafPath = tree.buildPath(bounds.lowIndex);

  return {
    root: tree.root,
    queriedLeaf,
    lowLeaf: bounds.lowLeaf.value,
    lowLeafIndex: bounds.lowIndex,
    lowLeafPath,
  };
}

export function inspectNonMembership(
  tree: IndexedMerkleTree,
  queriedLeaf: HexString,
): NonMembershipContext {
  const bounds = tree.findBounds(queriedLeaf);
  const exists =
    !!bounds.lowLeaf &&
    !!bounds.highLeaf &&
    bounds.lowIndex === bounds.highIndex &&
    bounds.lowLeaf.value === queriedLeaf;

  const lowLeafPath =
    bounds.lowLeaf && bounds.lowIndex >= 0
      ? tree.buildPath(bounds.lowIndex)
      : null;

  return {
    queriedLeaf,
    exists,
    exactLeaf: exists ? bounds.lowLeaf : null,
    lowLeaf: bounds.lowLeaf,
    lowLeafPath,
    highLeaf: bounds.highLeaf,
  };
}

export function serializePath(path: IMTPath) {
  return {
    leafIndex: path.leafIndex,
    leaf: path.leaf.value,
    siblings: path.siblings.map((sibling) => sibling.value),
    pathIndices: [...path.pathIndices],
    root: path.root,
    depth: path.depth,
  };
}

export function serializeNonMembershipProof(
  proof: IMTNonMembershipProofInput,
) {
  return {
    root: proof.root,
    queriedLeaf: proof.queriedLeaf,
    lowLeaf: proof.lowLeaf,
    lowLeafIndex: proof.lowLeafIndex,
    lowLeafPath: serializePath(proof.lowLeafPath),
  };
}
