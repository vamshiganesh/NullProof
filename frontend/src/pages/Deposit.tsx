// frontend/src/pages/Deposit.tsx
//
// Route: /app/deposit — CompliantVault demo deposit (proof + ETH).

import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { DepositForm } from "@/components/ledger/DepositForm";
import {
  useProofStore,
  selectProofResult,
} from "@/store/proofStore";
import { useWalletStore, selectAddress } from "@/store/walletStore";
import { COMPLIANT_VAULT_ADDRESS, DEFAULT_VALIDITY_WINDOW_SECONDS } from "@/lib/constants";
import type { ProofData } from "@/types/proof";

export function Deposit() {
  const navigate    = useNavigate();
  const proofResult = useProofStore(selectProofResult);
  const address     = useWalletStore(selectAddress);

  const proofData = useMemo<ProofData | null>(() => {
    if (!proofResult || !address) return null;
    const windowSecs = Number(DEFAULT_VALIDITY_WINDOW_SECONDS);
    const generatedAt = new Date(proofResult.generatedAt).toISOString();
    const validUntil  = new Date(proofResult.generatedAt + windowSecs * 1000).toISOString();
    return {
      walletAddress:  address,
      proof:          proofResult.proof,
      publicInputs:   proofResult.publicInputs,
      nullifier:      proofResult.nullifier,
      root:           proofResult.rootUsed,
      merkleRoot:     proofResult.rootUsed,
      proofHash:      proofResult.proof,
      lowLeafIndex:   0,
      circuitName:    "nullproof_non_membership",
      provingSystem:  "UltraHonk",
      validityWindow: windowSecs,
      validUntil,
      generatedAt,
      generatedInMs:  0,
      addressCount:   0,
      status:         "ready" as const,
    };
  }, [proofResult, address]);

  if (!COMPLIANT_VAULT_ADDRESS) {
    return (
      <div className="mx-auto max-w-lg px-5 py-16 text-center">
        <h1 className="text-lg font-semibold text-white">Vault not configured</h1>
        <p className="mt-2 text-sm text-[#646464]">
          Set VITE_COMPLIANT_VAULT_ADDRESS after deploying CompliantVault.
        </p>
      </div>
    );
  }

  if (!proofData) {
    return (
      <div className="mx-auto max-w-lg px-5 py-16 text-center">
        <h1 className="text-lg font-semibold text-white">No proof available</h1>
        <p className="mt-2 text-sm text-[#646464]">Generate a proof before depositing.</p>
        <button
          type="button"
          onClick={() => navigate("/app/proof/generate")}
          className="mt-4 rounded-lg bg-[#22c55e] px-4 py-2 text-sm font-semibold text-white"
        >
          Generate Proof
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-5 py-8">
      <h1 className="mb-2 text-xl font-bold text-white">Compliant Deposit</h1>
      <p className="mb-6 text-sm text-[#646464]">
        Atomic ZK compliance check and ETH deposit via the reference CompliantVault.
      </p>
      <DepositForm
        proof={proofData}
        onSuccess={() => navigate("/app/deposit/confirmed")}
      />
    </div>
  );
}

export default Deposit;
