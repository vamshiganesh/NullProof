import { solidityPackedKeccak256, toBeHex, zeroPadValue } from "ethers";

import type {
  HexString,
  IMTBounds,
  IMTInsertionResult,
  IMTLeaf,
  IMTNode,
  IMTPath,
  IMTRoot,
  IMTSearchResult,
  IMTSerializedTree,
  IMTSibling,
  IMTSnapshotLike,
} from "./types";

const DEFAULT_ZERO_VALUE =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as HexString;

function toHex32(value: bigint | string): HexString {
  return zeroPadValue(typeof value === "bigint" ? toBeHex(value) : value, 32) as HexString;
}

function normaliseHex(value: string): HexString {
  return toHex32(value.toLowerCase());
}

function hashPair(left: HexString, right: HexString): HexString {
  return toHex32(
    solidityPackedKeccak256(["bytes32", "bytes32"], [left, right]),
  );
}

function compareHex(a: HexString, b: HexString): number {
  const av = BigInt(a);
  const bv = BigInt(b);
  if (av < bv) return -1;
  if (av > bv) return 1;
  return 0;
}

export class IndexedMerkleTree {
  public readonly depth: number;
  public readonly zeroValue: HexString;

  private leaves: HexString[];
  private levels: HexString[][];

  constructor(depth: number, leaves: HexString[] = [], zeroValue: HexString = DEFAULT_ZERO_VALUE) {
    if (!Number.isInteger(depth) || depth <= 0) {
      throw new Error(`IndexedMerkleTree: invalid depth "${depth}"`);
    }

    this.depth = depth;
    this.zeroValue = normaliseHex(zeroValue);
    this.leaves = [...leaves].map(normaliseHex).sort(compareHex);
    this.levels = [];

    const maxLeaves = 2 ** this.depth;
    if (this.leaves.length > maxLeaves) {
      throw new Error(
        `IndexedMerkleTree: ${this.leaves.length} leaves exceed capacity ${maxLeaves}`,
      );
    }

    this.rebuild();
  }

  static fromSnapshot(snapshot: IMTSnapshotLike): IndexedMerkleTree {
    return new IndexedMerkleTree(snapshot.depth, snapshot.leaves, DEFAULT_ZERO_VALUE);
  }

  static deserialize(tree: IMTSerializedTree): IndexedMerkleTree {
    return new IndexedMerkleTree(
      tree.depth,
      tree.leaves,
      tree.zeroValue ?? DEFAULT_ZERO_VALUE,
    );
  }

  get root(): IMTRoot {
    const top = this.levels[this.depth];
    if (!top || top.length === 0) {
      return this.zeroValue;
    }

    return top[0] as IMTRoot;
  }

  get leafCount(): number {
    return this.leaves.length;
  }

  get capacity(): number {
    return 2 ** this.depth;
  }

  getLeaves(): HexString[] {
    return [...this.leaves];
  }

  getLevels(): HexString[][] {
    return this.levels.map((level) => [...level]);
  }

  getLeaf(index: number): IMTLeaf | null {
    if (index < 0 || index >= this.leaves.length) {
      return null;
    }

    return {
      index,
      level: 0,
      value: this.leaves[index] as HexString,
    };
  }

  has(leaf: HexString): boolean {
    return this.indexOf(leaf) !== -1;
  }

  indexOf(leaf: HexString): number {
    const target = normaliseHex(leaf);

    let low = 0;
    let high = this.leaves.length - 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const cmp = compareHex(this.leaves[mid] as HexString, target);

      if (cmp === 0) return mid;
      if (cmp < 0) low = mid + 1;
      else high = mid - 1;
    }

    return -1;
  }

  search(leaf: HexString): IMTSearchResult {
    const target = normaliseHex(leaf);

    let low = 0;
    let high = this.leaves.length - 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const current = this.leaves[mid] as HexString;
      const cmp = compareHex(current, target);

      if (cmp === 0) {
        return {
          index: mid,
          leaf: {
            index: mid,
            level: 0,
            value: current,
          },
          exactMatch: true,
        };
      }

      if (cmp < 0) low = mid + 1;
      else high = mid - 1;
    }

    const insertionIndex = low;
    return {
      index: insertionIndex,
      leaf: null,
      exactMatch: false,
    };
  }

  findBounds(leaf: HexString): IMTBounds {
    const result = this.search(leaf);

    if (this.leaves.length === 0) {
      return {
        lowLeaf: null,
        highLeaf: null,
        lowIndex: -1,
        highIndex: -1,
      };
    }

    if (result.exactMatch) {
      const exactLeaf = this.getLeaf(result.index);

      return {
        lowLeaf: exactLeaf,
        highLeaf: exactLeaf,
        lowIndex: result.index,
        highIndex: result.index,
      };
    }

    const lowIndex = result.index - 1;
    const highIndex = result.index;

    return {
      lowLeaf: this.getLeaf(lowIndex),
      highLeaf: this.getLeaf(highIndex),
      lowIndex,
      highIndex,
    };
  }

  insert(leaf: HexString): IMTInsertionResult {
    const target = normaliseHex(leaf);
    const result = this.search(target);

    if (result.exactMatch) {
      return {
        leaf: result.leaf as IMTLeaf,
        leafIndex: result.index,
        root: this.root,
      };
    }

    if (this.leaves.length >= this.capacity) {
      throw new Error("IndexedMerkleTree: tree is full");
    }

    this.leaves.splice(result.index, 0, target);
    this.rebuild();

    return {
      leaf: {
        index: result.index,
        level: 0,
        value: target,
      },
      leafIndex: result.index,
      root: this.root,
    };
  }

  buildPath(leafIndex: number): IMTPath {
    if (!Number.isInteger(leafIndex) || leafIndex < 0 || leafIndex >= this.leaves.length) {
      throw new Error(`IndexedMerkleTree: invalid leaf index ${leafIndex}`);
    }

    const leaf = this.getLeaf(leafIndex);
    if (!leaf) {
      throw new Error(`IndexedMerkleTree: leaf not found at index ${leafIndex}`);
    }

    const siblings: IMTSibling[] = [];
    const pathIndices: number[] = [];

    let currentIndex = leafIndex;

    for (let level = 0; level < this.depth; level += 1) {
      const isRightNode = currentIndex % 2 === 1;
      const siblingIndex = isRightNode ? currentIndex - 1 : currentIndex + 1;
      const siblingValue = this.getNodeValue(level, siblingIndex);
      const direction = isRightNode ? "left" : "right";

      siblings.push({
        index: siblingIndex,
        level,
        value: siblingValue,
        direction,
      });

      pathIndices.push(isRightNode ? 1 : 0);
      currentIndex = Math.floor(currentIndex / 2);
    }

    return {
      leafIndex,
      leaf,
      siblings,
      pathIndices,
      root: this.root,
      depth: this.depth,
    };
  }

  getNode(level: number, index: number): IMTNode {
    return {
      level,
      index,
      value: this.getNodeValue(level, index),
    };
  }

  serialize(): IMTSerializedTree {
    return {
      depth: this.depth,
      root: this.root,
      leafCount: this.leafCount,
      leaves: this.getLeaves(),
      levels: this.getLevels(),
      zeroValue: this.zeroValue,
    };
  }

  private rebuild(): void {
    this.levels = [];
    this.levels[0] = this.buildLeafLevel();

    for (let level = 1; level <= this.depth; level += 1) {
      const previousLevel = this.levels[level - 1] as HexString[];
      const nextLevel: HexString[] = [];

      for (let i = 0; i < previousLevel.length; i += 2) {
        const left = previousLevel[i] as HexString;
        const right = (i + 1 < previousLevel.length
          ? previousLevel[i + 1]
          : this.getZeroValue(level - 1)) as HexString;

        nextLevel.push(hashPair(left, right));
      }

      if (nextLevel.length === 0) {
        nextLevel.push(this.getZeroValue(level));
      }

      this.levels[level] = nextLevel;
    }
  }

  private buildLeafLevel(): HexString[] {
    const level = [...this.leaves];

    if (level.length === 0) {
      level.push(this.getZeroValue(0));
    }

    if (level.length % 2 === 1) {
      level.push(this.getZeroValue(0));
    }

    return level;
  }

  private getNodeValue(level: number, index: number): HexString {
    const currentLevel = this.levels[level];

    if (!currentLevel || index < 0 || index >= currentLevel.length) {
      return this.getZeroValue(level);
    }

    return currentLevel[index] as HexString;
  }

  private getZeroValue(level: number): HexString {
    if (level === 0) {
      return this.zeroValue;
    }

    let value = this.zeroValue;
    for (let i = 0; i < level; i += 1) {
      value = hashPair(value, value);
    }

    return value;
  }
}
