// frontend/src/pages/Integrations.tsx
//
// Route: /app/integrations — integrator reference for CompliantVault + ComplianceGate.

import React from "react";
import { Link } from "react-router-dom";

import {
  COMPLIANCE_GATE_ADDRESS,
  COMPLIANT_VAULT_ADDRESS,
  SUPPORTED_CHAIN_NAME,
} from "@/lib/constants";

const VAULT_SNIPPET = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IComplianceGate} from "./interfaces/IComplianceGate.sol";

contract MyProtocol {
    IComplianceGate public immutable gate;

    constructor(address gate_) {
        gate = IComplianceGate(gate_);
    }

    function depositWithCompliance(
        bytes calldata proof,
        bytes32[] calldata publicInputs,
        bytes32 nullifier
    ) external payable {
        // Atomic compliance gate — reverts if proof invalid or nullifier consumed
        gate.assertCompliant(proof, publicInputs, nullifier);

        // ... your protocol logic after compliance passes
    }
}`;

export function Integrations() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      <header className="mb-8">
        <h1 className="text-xl font-bold text-white">Integrations</h1>
        <p className="mt-2 text-sm text-[#646464]">
          Wire NullProof compliance into your protocol. The reference{" "}
          <span className="text-[#a0a0a0]">CompliantVault</span> shows the recommended pattern.
        </p>
      </header>

      <section className="mb-8 rounded-xl border border-[#1e1e1e] bg-[#141414] p-5">
        <h2 className="text-sm font-semibold text-white">Reference: CompliantVault</h2>
        <p className="mt-2 text-[12px] leading-relaxed text-[#646464]">
          <code className="text-[#a0a0a0]">CompliantVault.deposit</code> accepts a ZK proof, public inputs,
          and nullifier plus ETH. It calls <code className="text-[#a0a0a0]">ComplianceGate.assertCompliant</code>{" "}
          before crediting the depositor&apos;s internal balance. Gate sees{" "}
          <code className="text-[#a0a0a0]">msg.sender = vault</code>, not the end user.
        </p>

        <dl className="mt-4 space-y-2 text-[11px]">
          <div className="flex justify-between gap-4 border-b border-[#1e1e1e] py-2">
            <dt className="text-[#646464]">Network</dt>
            <dd className="font-mono text-[#a0a0a0]">{SUPPORTED_CHAIN_NAME}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-[#1e1e1e] py-2">
            <dt className="text-[#646464]">ComplianceGate</dt>
            <dd className="truncate font-mono text-[10px] text-[#a0a0a0]">
              {COMPLIANCE_GATE_ADDRESS || "Not configured"}
            </dd>
          </div>
          <div className="flex justify-between gap-4 py-2">
            <dt className="text-[#646464]">CompliantVault</dt>
            <dd className="truncate font-mono text-[10px] text-[#a0a0a0]">
              {COMPLIANT_VAULT_ADDRESS || "Deploy vault and set VITE_COMPLIANT_VAULT_ADDRESS"}
            </dd>
          </div>
        </dl>

        {COMPLIANT_VAULT_ADDRESS && (
          <Link
            to="/app/deposit"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#22c55e] px-4 py-2 text-[12px] font-semibold text-white hover:bg-[#16a34a]"
          >
            Try vault deposit demo
          </Link>
        )}
      </section>

      <section className="mb-8 rounded-xl border border-[#1e1e1e] bg-[#141414] p-5">
        <h2 className="text-sm font-semibold text-white">Integrator pattern</h2>
        <p className="mt-2 text-[12px] text-[#646464]">
          Call <code className="text-[#a0a0a0]">assertCompliant</code> inside your entrypoint before moving funds or updating state.
          Public inputs are <code className="text-[#a0a0a0]">[0]=root</code>,{" "}
          <code className="text-[#a0a0a0]">[1]=nullifier</code> (circuit-bound). Calldata nullifier must match public input 1.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-lg border border-[#1e1e1e] bg-[#0d0d0d] p-4 font-mono text-[10px] leading-relaxed text-[#a0a0a0]">
          {VAULT_SNIPPET}
        </pre>
      </section>

      <section className="rounded-xl border border-[#1e1e1e] bg-[#141414] p-5">
        <h2 className="text-sm font-semibold text-white">Private submission (optional)</h2>
        <p className="mt-2 text-[12px] leading-relaxed text-[#646464]">
          For standalone attestations without a vault, use the relayer + SubmissionRouter so Etherscan{" "}
          <code className="text-[#a0a0a0]">From</code> is the relayer. See{" "}
          <code className="text-[#a0a0a0]">docs/privacy-architecture.md</code> in the repo for the threat model.
        </p>
      </section>
    </div>
  );
}

export default Integrations;
