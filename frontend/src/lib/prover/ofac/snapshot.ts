import type { IMTSnapshot, SnapshotManifest } from "@/types/api";

import { IndexedMerkleTree } from "../imt/IndexedMerkleTree";
import {
  createNonMembershipProof,
  hashAddressToLeaf,
  inspectNonMembership,
} from "../imt/MerkleProof";
import type { HexString, IMTLeaf, IMTPath, IMTSnapshotLike } from "../imt/types";

const SNAPSHOT_URL = "/data/imt-snapshot.json";
const MANIFEST_URL = "/data/imt-manifest.json";

function isHexString32(value: unknown): value is HexString {
  return (
    typeof value === "string" &&
    /^0x[a-fA-F0-9]{64}$/.test(value)
  );
}

function assertSnapshot(value: unknown): asserts value is IMTSnapshot {
  if (!value || typeof value !== "object") {
    throw new Error("snapshot: invalid snapshot payload");
  }

  const candidate = value as Record<string, unknown>;

  if (!isHexString32(candidate.root)) {
    throw new Error("snapshot: invalid root");
  }

  if (typeof candidate.depth !== "number" || candidate.depth <= 0) {
    throw new Error("snapshot: invalid depth");
  }

  if (!Array.isArray(candidate.leaves) || !candidate.leaves.every(isHexString32)) {
    throw new Error("snapshot: invalid leaves array");
  }

  if (typeof candidate.addressCount !== "number" || candidate.addressCount < 0) {
    throw new Error("snapshot: invalid addressCount");
  }

  if (typeof candidate.builtAt !== "string") {
    throw new Error("snapshot: invalid builtAt");
  }
}

function assertManifest(value: unknown): asserts value is SnapshotManifest {
  if (!value || typeof value !== "object") {
    throw new Error("snapshot: invalid manifest payload");
  }

  const candidate = value as Record<string, unknown>;

  if (!isHexString32(candidate.root)) {
    throw new Error("snapshot: invalid manifest root");
  }

  if (typeof candidate.addressCount !== "number") {
    throw new Error("snapshot: invalid manifest addressCount");
  }

  if (typeof candidate.builtAt !== "string") {
    throw new Error("snapshot: invalid manifest builtAt");
  }

  if (typeof candidate.publishedAt !== "string") {
    throw new Error("snapshot: invalid manifest publishedAt");
  }

  if (typeof candidate.txHash !== "string") {
    throw new Error("snapshot: invalid manifest txHash");
  }

  if (typeof candidate.blockNumber !== "number") {
    throw new Error("snapshot: invalid manifest blockNumber");
  }
}

function toIMTSnapshotLike(snapshot: IMTSnapshot): IMTSnapshotLike {
  return {
    root: snapshot.root as HexString,
    depth: snapshot.depth,
    leaves: snapshot.leaves as HexString[],
    addressCount: snapshot.addressCount,
    builtAt: snapshot.builtAt,
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`snapshot: failed to fetch ${url} (${response.status})`);
  }

  return (await response.json()) as T;
}

export async function loadSnapshot(url: string = SNAPSHOT_URL): Promise<IMTSnapshot> {
  const snapshot = await fetchJson<IMTSnapshot>(url);
  assertSnapshot(snapshot);
  return snapshot;
}

export async function loadManifest(
  url: string = MANIFEST_URL,
): Promise<SnapshotManifest | null> {
  try {
    const manifest = await fetchJson<SnapshotManifest>(url);
    assertManifest(manifest);
    return manifest;
  } catch {
    return null;
  }
}

export interface LoadedSnapshotContext {
  snapshot: IMTSnapshot;
  manifest: SnapshotManifest | null;
  tree: IndexedMerkleTree;
}

export async function loadSnapshotContext(): Promise<LoadedSnapshotContext> {
  const [snapshot, manifest] = await Promise.all([
    loadSnapshot(),
    loadManifest(),
  ]);

  const tree = IndexedMerkleTree.fromSnapshot(toIMTSnapshotLike(snapshot));

  if (tree.root !== (snapshot.root as HexString)) {
    throw new Error(
      `snapshot: rebuilt root ${tree.root} does not match snapshot root ${snapshot.root}`,
    );
  }

  return {
    snapshot,
    manifest,
    tree,
  };
}

export interface SnapshotQueryResult {
  walletAddress: string;
  queriedLeaf: HexString;
  exists: boolean;
  root: HexString;
  depth: number;
  lowLeaf: IMTLeaf | null;
  lowLeafIndex: number;
  lowLeafPath: IMTPath | null;
  highLeaf: IMTLeaf | null;
  addressCount: number;
  builtAt: string;
  publishedAt?: string;
}

export async function findLowLeafForAddress(
  walletAddress: string,
): Promise<SnapshotQueryResult> {
  const { snapshot, manifest, tree } = await loadSnapshotContext();
  const queriedLeaf = hashAddressToLeaf(walletAddress);
  const inspection = inspectNonMembership(tree, queriedLeaf);

  return {
    walletAddress,
    queriedLeaf,
    exists: inspection.exists,
    root: tree.root,
    depth: tree.depth,
    lowLeaf: inspection.lowLeaf,
    lowLeafIndex: inspection.lowLeaf ? inspection.lowLeaf.index : -1,
    lowLeafPath: inspection.lowLeafPath,
    highLeaf: inspection.highLeaf,
    addressCount: snapshot.addressCount,
    builtAt: snapshot.builtAt,
    ...(manifest?.publishedAt ? { publishedAt: manifest.publishedAt } : {}),
  };
}

export interface PreparedNonMembershipWitnessInput {
  walletAddress: string;
  queriedLeaf: HexString;
  root: HexString;
  lowLeaf: HexString;
  lowLeafIndex: number;
  siblings: HexString[];
  pathIndices: number[];
  addressCount: number;
  builtAt: string;
  publishedAt?: string;
}

export async function prepareNonMembershipWitnessInput(
  walletAddress: string,
): Promise<PreparedNonMembershipWitnessInput> {
  const { snapshot, manifest, tree } = await loadSnapshotContext();
  const queriedLeaf = hashAddressToLeaf(walletAddress);

  const proof = createNonMembershipProof(tree, queriedLeaf);

  return {
    walletAddress,
    queriedLeaf,
    root: proof.root,
    lowLeaf: proof.lowLeaf,
    lowLeafIndex: proof.lowLeafIndex,
    siblings: proof.lowLeafPath.siblings.map((sibling) => sibling.value),
    pathIndices: proof.lowLeafPath.pathIndices,
    addressCount: snapshot.addressCount,
    builtAt: snapshot.builtAt,
    ...(manifest?.publishedAt ? { publishedAt: manifest.publishedAt } : {}),
  };
}

export async function isSnapshotStale(
  expectedRoot?: HexString,
): Promise<boolean> {
  const manifest = await loadManifest();

  if (!manifest || !expectedRoot) {
    return false;
  }

  return (manifest.root as HexString) !== expectedRoot;
}
