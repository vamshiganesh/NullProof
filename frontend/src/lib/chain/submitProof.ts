// frontend/src/lib/chain/submitProof.ts
//
// Single submission choke point: relayer (default) or direct wallet fallback.

import type { Account, Address, Hash, Hex } from "viem";

import {
  ALLOW_DIRECT_SUBMIT,
  USE_RELAYER,
} from "@/lib/constants";
import {
  createDefaultPublicClient,
  writeAssertCompliant,
} from "@/lib/chain/contracts";
import {
  submitViaRelayer,
  waitForRelayedTx,
} from "@/lib/chain/relay";

export interface SubmitAssertCompliantParams {
  proof:        Hex;
  publicInputs: Hex[];
  nullifier:    Hex;
  account:      Account | Address;
}

export interface SubmitAssertCompliantResult {
  txHash:      Hash;
  blockNumber: bigint;
}

export async function submitAssertCompliant(
  params: SubmitAssertCompliantParams,
): Promise<SubmitAssertCompliantResult> {
  if (USE_RELAYER) {
    const { txHash } = await submitViaRelayer({
      proof:        params.proof,
      publicInputs: params.publicInputs,
      nullifier:    params.nullifier,
      account:      params.account as Address,
    });
    const blockNumber = await waitForRelayedTx(txHash);
    return { txHash, blockNumber };
  }

  if (!ALLOW_DIRECT_SUBMIT) {
    throw new Error(
      "Private relayer is not configured. Set VITE_SUBMISSION_ROUTER_ADDRESS and run the relayer API, " +
      "or enable VITE_ALLOW_DIRECT_SUBMIT=true for local development.",
    );
  }

  const txHash = await writeAssertCompliant(params);
  const publicClient = createDefaultPublicClient();
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  return { txHash, blockNumber: receipt.blockNumber };
}
