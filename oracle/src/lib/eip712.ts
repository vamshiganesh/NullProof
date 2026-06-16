/**
 * EIP-712 typed data for off-chain proof submission authorization.
 */

import { verifyTypedData, type TypedDataDomain } from "ethers";

export const AUTHORIZE_NULLIFIER_TYPES = {
  AuthorizeNullifier: [
    { name: "nullifier", type: "bytes32" },
    { name: "root",      type: "bytes32" },
    { name: "chainId",   type: "uint256" },
    { name: "deadline",  type: "uint256" },
  ],
} as const satisfies Record<string, { name: string; type: string }[]>;

const authorizeNullifierTypes = {
  AuthorizeNullifier: [...AUTHORIZE_NULLIFIER_TYPES.AuthorizeNullifier],
};

export interface AuthorizeNullifierMessage {
  nullifier: string;
  root:      string;
  chainId:   bigint;
  deadline:  bigint;
}

export function buildAuthorizeDomain(
  chainId: number,
  verifyingContract: string,
): TypedDataDomain {
  return {
    name:              "NullProof",
    version:           "1",
    chainId,
    verifyingContract,
  };
}

export function recoverAuthorizeSigner(
  message: AuthorizeNullifierMessage,
  signature: string,
  verifyingContract: string,
): string {
  const chainId = Number(message.chainId);
  return verifyTypedData(
    buildAuthorizeDomain(chainId, verifyingContract),
    authorizeNullifierTypes,
    message,
    signature,
  );
}
