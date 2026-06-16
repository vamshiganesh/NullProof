// frontend/src/lib/chain/contracts.ts
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  parseAbiItem,
  type Account,
  type Address,
  type Hash,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { sepolia } from "viem/chains";

import ComplianceGateABI from "./abis/ComplianceGate.json";
import SanctionsListABI  from "./abis/SanctionsList.json";
import VerifierABI       from "./abis/HonkVerifier.json";

import {
  COMPLIANCE_GATE_ADDRESS,
  SANCTIONS_LIST_ADDRESS,
  VERIFIER_ADDRESS,
  SUPPORTED_CHAIN_ID,
  COMPLIANT_VAULT_ADDRESS,
} from "@/lib/constants";

// ---------------------------------------------------------------------------
// ABI re-exports
// ---------------------------------------------------------------------------
export const complianceGateAbi = ComplianceGateABI as typeof ComplianceGateABI;
export const sanctionsListAbi  = SanctionsListABI  as typeof SanctionsListABI;
export const verifierAbi       = VerifierABI       as typeof VerifierABI;

// ---------------------------------------------------------------------------
// Public client
// ---------------------------------------------------------------------------
export function createDefaultPublicClient(): PublicClient {
  const rpcUrl = import.meta.env.VITE_SEPOLIA_RPC_URL as string | undefined;
  return createPublicClient({
    chain: sepolia,
    transport: rpcUrl ? http(rpcUrl) : http(),
  });
}

// ---------------------------------------------------------------------------
// Wallet client from injected provider
// ---------------------------------------------------------------------------
export function createInjectedWalletClient(account: Account | Address): WalletClient {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("contracts: no injected provider found");
  }
  return createWalletClient({
    account,
    chain: sepolia,
    transport: custom(window.ethereum),
  });
}

// ---------------------------------------------------------------------------
// Address validation
// ---------------------------------------------------------------------------
function assertAddress(value: string, name: string): Address {
  if (!value || !value.startsWith("0x") || value.length !== 42) {
    throw new Error(`contracts: invalid address for ${name}: "${value}"`);
  }
  return value as Address;
}

export const getComplianceGateAddress = (): Address =>
  assertAddress(COMPLIANCE_GATE_ADDRESS, "ComplianceGate");
export const getSanctionsListAddress  = (): Address =>
  assertAddress(SANCTIONS_LIST_ADDRESS, "SanctionsList");
export const getVerifierAddress       = (): Address =>
  assertAddress(VERIFIER_ADDRESS, "Verifier");

// ---------------------------------------------------------------------------
// SanctionsList reads
// ---------------------------------------------------------------------------
export async function readCurrentRoot(client?: PublicClient): Promise<Hex> {
  const c = client ?? createDefaultPublicClient();
  return c.readContract({
    address: getSanctionsListAddress(),
    abi: sanctionsListAbi,
    functionName: "currentRoot",
  }) as Promise<Hex>;
}

export async function readLastUpdatedAt(client?: PublicClient): Promise<bigint> {
  const c = client ?? createDefaultPublicClient();
  return c.readContract({
    address: getSanctionsListAddress(),
    abi: sanctionsListAbi,
    functionName: "lastUpdatedAt",
  }) as Promise<bigint>;
}

export async function readCurrentAddressCount(client?: PublicClient): Promise<bigint> {
  const c = client ?? createDefaultPublicClient();
  return c.readContract({
    address: getSanctionsListAddress(),
    abi: sanctionsListAbi,
    functionName: "currentAddressCount",
  }) as Promise<bigint>;
}

export async function readIsKnownRoot(root: Hex, client?: PublicClient): Promise<boolean> {
  const c = client ?? createDefaultPublicClient();
  return c.readContract({
    address: getSanctionsListAddress(),
    abi: sanctionsListAbi,
    functionName: "isKnownRoot",
    args: [root],
  }) as Promise<boolean>;
}

export interface RootHistoryEntry {
  addressCount: bigint;
  timestamp: bigint;
  exists: boolean;
}

export async function readRootHistory(root: Hex, client?: PublicClient): Promise<RootHistoryEntry> {
  const c = client ?? createDefaultPublicClient();
  const result = await c.readContract({
    address: getSanctionsListAddress(),
    abi: sanctionsListAbi,
    functionName: "getRootHistory",
    args: [root],
  }) as [bigint, bigint, boolean];
  return { addressCount: result[0], timestamp: result[1], exists: result[2] };
}

export interface RecentRootsResult { roots: Hex[]; timestamps: bigint[] }

export async function readRecentRoots(n: bigint, client?: PublicClient): Promise<RecentRootsResult> {
  const c = client ?? createDefaultPublicClient();
  const result = await c.readContract({
    address: getSanctionsListAddress(),
    abi: sanctionsListAbi,
    functionName: "getRecentRoots",
    args: [n],
  }) as [Hex[], bigint[]];
  return { roots: result[0], timestamps: result[1] };
}

// ---------------------------------------------------------------------------
// ComplianceGate reads
// ---------------------------------------------------------------------------
export async function readIsNullifierUsed(nullifier: Hex, client?: PublicClient): Promise<boolean> {
  const c = client ?? createDefaultPublicClient();
  return c.readContract({
    address: getComplianceGateAddress(),
    abi: complianceGateAbi,
    functionName: "isNullifierUsed",
    args: [nullifier],
  }) as Promise<boolean>;
}

export async function readNullifierUsedAt(nullifier: Hex, client?: PublicClient): Promise<bigint> {
  const c = client ?? createDefaultPublicClient();
  return c.readContract({
    address: getComplianceGateAddress(),
    abi: complianceGateAbi,
    functionName: "nullifierUsedAt",
    args: [nullifier],
  }) as Promise<bigint>;
}

export interface NullifierSubmission {
  txHash:      Hex;
  blockNumber: bigint;
  confirmedAt: number; // Unix ms
}

/**
 * Look up the transaction that consumed a nullifier by scanning ComplianceGate
 * events in a narrow window around the on-chain consumption timestamp.
 * Public RPCs reject wide eth_getLogs ranges; indexed topics + ~200-block
 * chunks keeps requests within limits.
 */
export async function fetchNullifierSubmission(
  nullifier: Hex,
  client?: PublicClient,
): Promise<NullifierSubmission | null> {
  const c    = client ?? createDefaultPublicClient();
  const gate = getComplianceGateAddress();

  const eventProof = parseAbiItem(
    "event ProofVerified(bytes32 indexed nullifier, bytes32 indexed root, uint256 validUntil)",
  );
  const eventConsumed = parseAbiItem(
    "event NullifierConsumed(bytes32 indexed nullifier, address indexed caller)",
  );

  const usedAtSecs = await readNullifierUsedAt(nullifier, c);
  if (usedAtSecs === 0n) return null;

  async function findInRange(fromBlock: bigint, toBlock: bigint) {
    const CHUNK = 200n;
    for (let start = fromBlock; start <= toBlock; start += CHUNK) {
      const end = start + CHUNK - 1n > toBlock ? toBlock : start + CHUNK - 1n;
      try {
        const proofLogs = await c.getLogs({
          address: gate, event: eventProof, args: { nullifier },
          fromBlock: start, toBlock: end,
        });
        if (proofLogs.length > 0) {
          const log = proofLogs[proofLogs.length - 1]!;
          return { txHash: log.transactionHash, blockNumber: log.blockNumber };
        }
        const consumedLogs = await c.getLogs({
          address: gate, event: eventConsumed, args: { nullifier },
          fromBlock: start, toBlock: end,
        });
        if (consumedLogs.length > 0) {
          const log = consumedLogs[consumedLogs.length - 1]!;
          return { txHash: log.transactionHash, blockNumber: log.blockNumber };
        }
      } catch {
        // Retry this window in smaller slices (some RPCs cap at 100 blocks).
        for (let s = start; s <= end; s += 50n) {
          const e = s + 49n > end ? end : s + 49n;
          try {
            const proofLogs = await c.getLogs({
              address: gate, event: eventProof, args: { nullifier },
              fromBlock: s, toBlock: e,
            });
            if (proofLogs.length > 0) {
              const log = proofLogs[proofLogs.length - 1]!;
              return { txHash: log.transactionHash, blockNumber: log.blockNumber };
            }
            const consumedLogs = await c.getLogs({
              address: gate, event: eventConsumed, args: { nullifier },
              fromBlock: s, toBlock: e,
            });
            if (consumedLogs.length > 0) {
              const log = consumedLogs[consumedLogs.length - 1]!;
              return { txHash: log.transactionHash, blockNumber: log.blockNumber };
            }
          } catch { /* skip slice */ }
        }
      }
    }
    return null;
  }

  // Centre the search on the block where the nullifier was consumed (~12s/block on Sepolia).
  const latest      = await c.getBlockNumber();
  const latestBlock = await c.getBlock({ blockNumber: latest });
  const timeDiff    = Math.max(0, Number(latestBlock.timestamp) - Number(usedAtSecs));
  const blockDiff   = BigInt(Math.floor(timeDiff / 12));
  const center      = latest > blockDiff ? latest - blockDiff : 0n;
  const WINDOW      = 4_000n;

  let from = center > WINDOW ? center - WINDOW : 0n;
  let to   = center + WINDOW > latest ? latest : center + WINDOW;

  // Fast path: tight window around the estimated block (usually sufficient).
  const TIGHT = 600n;
  let found = await findInRange(
    center > TIGHT ? center - TIGHT : 0n,
    center + TIGHT > latest ? latest : center + TIGHT,
  );
  if (!found) found = await findInRange(from, to);

  // Expand outward if the estimate was off (e.g. clock skew).
  if (!found && from > 0n) {
    const expandFrom = from > 20_000n ? from - 20_000n : 0n;
    found = await findInRange(expandFrom, from - 1n);
  }
  if (!found && to < latest) {
    const expandTo = to + 20_000n > latest ? latest : to + 20_000n;
    found = await findInRange(to + 1n, expandTo);
  }

  if (!found) return null;

  return {
    txHash:      found.txHash as Hex,
    blockNumber: found.blockNumber,
    confirmedAt: Number(usedAtSecs) * 1000,
  };
}

export async function readValidityWindow(client?: PublicClient): Promise<bigint> {
  const c = client ?? createDefaultPublicClient();
  return c.readContract({
    address: getComplianceGateAddress(),
    abi: complianceGateAbi,
    functionName: "validityWindow",
  }) as Promise<bigint>;
}

export async function readSubmissionPaused(client?: PublicClient): Promise<boolean> {
  const c = client ?? createDefaultPublicClient();
  return c.readContract({
    address: getComplianceGateAddress(),
    abi: complianceGateAbi,
    functionName: "submissionPaused",
  }) as Promise<boolean>;
}

export interface CheckCompliantParams { proof: Hex; publicInputs: Hex[]; nullifier: Hex }

export async function readCheckCompliant(
  params: CheckCompliantParams,
  client?: PublicClient,
): Promise<boolean> {
  const c = client ?? createDefaultPublicClient();
  return c.readContract({
    address: getComplianceGateAddress(),
    abi: complianceGateAbi,
    functionName: "checkCompliant",
    args: [params.proof, params.publicInputs, params.nullifier],
  }) as Promise<boolean>;
}

// ---------------------------------------------------------------------------
// ComplianceGate write
// ---------------------------------------------------------------------------
export interface AssertCompliantParams {
  proof: Hex;
  publicInputs: Hex[];
  nullifier: Hex;
  account: Account | Address;
  walletClient?: WalletClient;
}

export async function writeAssertCompliant(params: AssertCompliantParams): Promise<Hash> {
  const walletClient =
    params.walletClient ?? createInjectedWalletClient(params.account);
  const publicClient = createDefaultPublicClient();
  const { request } = await publicClient.simulateContract({
    address: getComplianceGateAddress(),
    abi: complianceGateAbi,
    functionName: "assertCompliant",
    args: [params.proof, params.publicInputs, params.nullifier],
    account: params.account,
  });
  return walletClient.writeContract(request);
}

// ---------------------------------------------------------------------------
// CompliantVault write
// ---------------------------------------------------------------------------

const compliantVaultAbi = [
  {
    type: "function",
    name: "deposit",
    inputs: [
      { name: "proof", type: "bytes", internalType: "bytes" },
      { name: "publicInputs", type: "bytes32[]", internalType: "bytes32[]" },
      { name: "nullifier", type: "bytes32", internalType: "bytes32" },
    ],
    outputs: [],
    stateMutability: "payable",
  },
] as const;

function getCompliantVaultAddress(): Address {
  const value = COMPLIANT_VAULT_ADDRESS;
  return assertAddress(value, "VITE_COMPLIANT_VAULT_ADDRESS");
}

export interface VaultDepositParams {
  proof:        Hex;
  publicInputs: Hex[];
  nullifier:    Hex;
  value:        bigint;
  account:      Account | Address;
  walletClient?: WalletClient;
}

export async function writeVaultDeposit(params: VaultDepositParams): Promise<Hash> {
  const walletClient =
    params.walletClient ?? createInjectedWalletClient(params.account);
  const publicClient = createDefaultPublicClient();
  const vault = getCompliantVaultAddress();
  const { request } = await publicClient.simulateContract({
    address: vault,
    abi:     compliantVaultAbi,
    functionName: "deposit",
    args: [params.proof, params.publicInputs, params.nullifier],
    value:   params.value,
    account: params.account,
  });
  return walletClient.writeContract(request);
}

// ---------------------------------------------------------------------------
// Protocol status snapshot
// ---------------------------------------------------------------------------
export interface ProtocolStatus {
  currentRoot: Hex;
  lastUpdatedAt: bigint;
  currentAddressCount: bigint;
  validityWindow: bigint;
  submissionPaused: boolean;
  chainId: number;
}

export async function readProtocolStatus(client?: PublicClient): Promise<ProtocolStatus> {
  const c = client ?? createDefaultPublicClient();
  const [currentRoot, lastUpdatedAt, currentAddressCount, validityWindow, submissionPaused] =
    await Promise.all([
      readCurrentRoot(c),
      readLastUpdatedAt(c),
      readCurrentAddressCount(c),
      readValidityWindow(c),
      readSubmissionPaused(c),
    ]);
  return { currentRoot, lastUpdatedAt, currentAddressCount, validityWindow, submissionPaused, chainId: SUPPORTED_CHAIN_ID };
}