// frontend/src/lib/chain/relay.ts
//
// Off-chain EIP-712 authorization + relayer HTTP submission.

import type { Address, Hash, Hex } from "viem";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";

import {
  ORACLE_BASE_URL,
  REQUIRE_RELAYER_AUTH,
  SUPPORTED_CHAIN_ID,
  SUBMISSION_ROUTER_ADDRESS,
} from "@/lib/constants";
import { createInjectedWalletClient } from "@/lib/chain/contracts";

export const AUTHORIZE_NULLIFIER_TYPES = {
  AuthorizeNullifier: [
    { name: "nullifier", type: "bytes32" },
    { name: "root",      type: "bytes32" },
    { name: "chainId",   type: "uint256" },
    { name: "deadline",  type: "uint256" },
  ],
} as const;

const AUTH_TTL_SECONDS = 300; // 5 minutes

function authorizeDomain(verifyingContract: Address) {
  return {
    name:              "NullProof",
    version:           "1",
    chainId:           SUPPORTED_CHAIN_ID,
    verifyingContract,
  } as const;
}

export async function signAuthorizeNullifier(
  account: Address,
  nullifier: Hex,
  root: Hex,
): Promise<{ signature: Hex; deadline: bigint }> {
  if (!SUBMISSION_ROUTER_ADDRESS) {
    throw new Error("relay: VITE_SUBMISSION_ROUTER_ADDRESS is not set");
  }

  const walletClient = createInjectedWalletClient(account);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + AUTH_TTL_SECONDS);

  const signature = await walletClient.signTypedData({
    account,
    domain:  authorizeDomain(SUBMISSION_ROUTER_ADDRESS as Address),
    types:   AUTHORIZE_NULLIFIER_TYPES,
    primaryType: "AuthorizeNullifier",
    message: {
      nullifier,
      root,
      chainId:  BigInt(SUPPORTED_CHAIN_ID),
      deadline,
    },
  });

  return { signature, deadline };
}

export interface RelayerSubmitParams {
  proof:        Hex;
  publicInputs: Hex[];
  nullifier:    Hex;
  account:      Address;
}

export interface RelayerSubmitResult {
  txHash: Hash;
}

export async function submitViaRelayer(
  params: RelayerSubmitParams,
): Promise<RelayerSubmitResult> {
  const root = params.publicInputs[0];
  if (!root) throw new Error("relay: missing public input root");

  let signature: Hex | undefined;
  let deadline: bigint | undefined;

  if (REQUIRE_RELAYER_AUTH) {
    const auth = await signAuthorizeNullifier(
      params.account,
      params.nullifier,
      root,
    );
    signature = auth.signature;
    deadline  = auth.deadline;
  }

  let res: Response;
  try {
    res = await fetch(`${ORACLE_BASE_URL}/api/submit`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        proof:        params.proof,
        publicInputs: params.publicInputs,
        nullifier:    params.nullifier,
        ...(signature ? { signature, deadline: deadline!.toString() } : {}),
      }),
    });
  } catch (err) {
    const hint =
      typeof window !== "undefined"
        ? ` Check VITE_ORACLE_BASE_URL on Vercel (currently ${ORACLE_BASE_URL}) and CORS_ORIGIN on the relayer (must include ${window.location.origin}).`
        : "";
    throw new Error(
      `Cannot reach relayer at ${ORACLE_BASE_URL}.${hint}`,
      { cause: err },
    );
  }

  const body = (await res.json()) as { txHash?: string; error?: string };
  if (!res.ok || !body.txHash) {
    throw new Error(body.error ?? `Relayer error (${res.status})`);
  }

  return { txHash: body.txHash as Hash };
}

export async function waitForRelayedTx(txHash: Hash): Promise<bigint> {
  const rpcUrl = import.meta.env.VITE_SEPOLIA_RPC_URL as string | undefined;
  const client = createPublicClient({
    chain:     sepolia,
    transport: rpcUrl ? http(rpcUrl) : http(),
  });
  const receipt = await client.waitForTransactionReceipt({ hash: txHash });
  return receipt.blockNumber;
}
