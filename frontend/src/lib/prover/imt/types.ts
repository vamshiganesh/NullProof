export type HexString = `0x${string}`;

export type IMTNodeValue = bigint | HexString;
export type IMTRoot = HexString;

export interface IMTNode {
  index: number;
  level: number;
  value: HexString;
}

export interface IMTLeaf extends IMTNode {
  level: 0;
  address?: string;
  isEmpty?: boolean;
}

export interface IMTSibling {
  index: number;
  level: number;
  value: HexString;
  direction: "left" | "right";
}

export interface IMTPath {
  leafIndex: number;
  leaf: IMTLeaf;
  siblings: IMTSibling[];
  pathIndices: number[];
  root: IMTRoot;
  depth: number;
}

export interface IMTSerializedTree {
  depth: number;
  root: IMTRoot;
  leafCount: number;
  leaves: HexString[];
  levels?: HexString[][];
  zeroValue?: HexString;
  builtAt?: string;
}

export interface IMTInsertionResult {
  leaf: IMTLeaf;
  leafIndex: number;
  root: IMTRoot;
}

export interface IMTSearchResult {
  index: number;
  leaf: IMTLeaf | null;
  exactMatch: boolean;
}

export interface IMTBounds {
  lowLeaf: IMTLeaf | null;
  highLeaf: IMTLeaf | null;
  lowIndex: number;
  highIndex: number;
}

export interface IMTProofInput {
  root: IMTRoot;
  leaf: HexString;
  siblings: HexString[];
  pathIndices: number[];
}

export interface IMTNonMembershipProofInput {
  root: IMTRoot;
  queriedLeaf: HexString;
  lowLeaf: HexString;
  lowLeafIndex: number;
  lowLeafPath: IMTPath;
}

export interface IMTSnapshotLike {
  root: IMTRoot;
  depth: number;
  leaves: HexString[];
  addressCount: number;
  builtAt: string;
}
