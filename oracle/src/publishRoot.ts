/**
 * publishRoot.ts
 *
 * Signs and broadcasts an updateRoot() transaction to the SanctionsList
 * contract on Sepolia, then waits for 2-block confirmation.
 */

import {
  JsonRpcProvider,
  Wallet,
  Contract,
  isHexString,
  toBeHex,
  zeroPadValue,
} from "ethers";

// ── Minimal ABI — only what we need ──────────────────────────────────────────

const SANCTIONS_LIST_ABI = [
  // Read
  "function latestRoot() external view returns (bytes32)",
  "function addressCount() external view returns (uint256)",

  // Write
  "function updateRoot(bytes32 newRoot, uint256 newAddressCount) external",

  // Events
  "event RootUpdated(bytes32 indexed previousRoot, bytes32 indexed newRoot, uint256 addressCount, uint256 updatedAt)",
] as const;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PublishConfig {
  rpcUrl:            string;
  privateKey:        string;
  contractAddress:   string;
  confirmations?:    number;   // default: 2
}

export interface PublishResult {
  txHash:        string;
  blockNumber:   number;
  previousRoot:  string;
  newRoot:       string;
  addressCount:  number;
  gasUsed:       bigint;
  publishedAt:   Date;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadConfig(): PublishConfig {
  const rpcUrl          = process.env["SEPOLIA_RPC_URL"];
  const privateKey      = process.env["ORACLE_PRIVATE_KEY"];
  const contractAddress = process.env["SANCTIONS_LIST_ADDRESS"];

  if (!rpcUrl)
    throw new Error("publishRoot: SEPOLIA_RPC_URL is not set");
  if (!privateKey)
    throw new Error("publishRoot: ORACLE_PRIVATE_KEY is not set");
  if (!contractAddress)
    throw new Error("publishRoot: SANCTIONS_LIST_ADDRESS is not set");

  return { rpcUrl, privateKey, contractAddress };
}

function normaliseRoot(root: string): string {
  if (!isHexString(root))
    throw new Error(`publishRoot: invalid root — not a hex string: ${root}`);
  return zeroPadValue(root, 32);
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Publish a new Merkle root to SanctionsList.sol on Sepolia.
 *
 * @param root         - 0x-prefixed 32-byte hex root from buildIMT()
 * @param addressCount - Number of sanctioned addresses in the tree
 * @param config       - Optional override (defaults to env vars)
 */
export async function publishRoot(
  root:         string,
  addressCount: number,
  config?:      Partial<PublishConfig>,
): Promise<PublishResult> {
  const cfg = { ...loadConfig(), ...config };
  const confirmations = cfg.confirmations ?? 2;

  // ── 1. Connect ─────────────────────────────────────────────────────────────
  const provider = new JsonRpcProvider(cfg.rpcUrl);
  const wallet   = new Wallet(cfg.privateKey, provider);
  const contract = new Contract(
    cfg.contractAddress,
    SANCTIONS_LIST_ABI,
    wallet,
  );

  // ── 2. Read current state ──────────────────────────────────────────────────
  const previousRoot = await contract.getFunction("latestRoot")() as string;
  const normRoot     = normaliseRoot(root);

  // Skip if root hasn't changed — saves gas on quiet days
  if (previousRoot.toLowerCase() === normRoot.toLowerCase()) {
    throw new Error(
      `publishRoot: root unchanged (${normRoot}) — skipping publish`,
    );
  }

  // ── 3. Estimate gas & send ─────────────────────────────────────────────────
  const gasEstimate = await contract.getFunction("updateRoot").estimateGas(
    normRoot,
    BigInt(addressCount),
  );

  // Add 20 % buffer to avoid out-of-gas on Sepolia congestion
  const gasLimit = (gasEstimate * 120n) / 100n;

  const tx = await contract.getFunction("updateRoot")(
    normRoot,
    BigInt(addressCount),
    { gasLimit },
  );

  // ── 4. Wait for confirmation ───────────────────────────────────────────────
  const receipt = await tx.wait(confirmations);

  if (!receipt) {
    throw new Error(`publishRoot: transaction ${tx.hash} receipt is null`);
  }

  if (receipt.status !== 1) {
    throw new Error(
      `publishRoot: transaction ${tx.hash} reverted (status ${receipt.status})`,
    );
  }

  return {
    txHash:       tx.hash,
    blockNumber:  receipt.blockNumber,
    previousRoot,
    newRoot:      normRoot,
    addressCount,
    gasUsed:      receipt.gasUsed,
    publishedAt:  new Date(),
  };
}
