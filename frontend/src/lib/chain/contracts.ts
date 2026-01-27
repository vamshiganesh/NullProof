// frontend/src/lib/chain/contracts.ts
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
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
import VerifierABI       from "./abis/Verifier.json";

import {
  COMPLIANCE_GATE_ADDRESS,
  SANCTIONS_LIST_ADDRESS,
  VERIFIER_ADDRESS,
  SUPPORTED_CHAIN_ID,
} from "@/lib/constants";
// ---------------------------------------------------------------------------
// EIP-1193 window.ethereum type augmentation
// ---------------------------------------------------------------------------
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
      isMetaMask?: boolean;
    };
  }
}

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