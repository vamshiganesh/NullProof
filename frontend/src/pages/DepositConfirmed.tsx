// frontend/src/pages/DepositConfirmed.tsx
//
// Route: /app/deposit/confirmed
//
// Centered celebration screen shown after assertCompliant() is confirmed on-chain.
//
// Layout:
//   • Animated check hero — "Attestation Recorded"
//   • Transaction receipt card — tx hash + explorer link, block, timestamp, contract
//   • Proof snapshot — nullifier, root, proof bytes
//   • Two primary CTAs: "Back to Dashboard" + "View on Etherscan"

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Hex } from "viem";

import {
  useProofStore,
  selectProofResult,
  selectSubmission,
  selectElapsedLabel,
  selectIsConfirmed,
} from "@/store/proofStore";
import { useWalletStore, selectAddress } from "@/store/walletStore";
import {
  COMPLIANCE_GATE_ADDRESS,
  SUPPORTED_CHAIN_NAME,
  BLOCK_EXPLORER_URL,
} from "@/lib/constants";
import { formatHash } from "@/lib/format";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(unixMs: number): string {
  return new Date(unixMs).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function txUrl(hash: Hex): string | null {
  if (!BLOCK_EXPLORER_URL) return null;
  return `${BLOCK_EXPLORER_URL}/tx/${hash}`;
}

function useCopy(ms = 1600) {
  const [copied, setCopied] = React.useState<string | null>(null);
  const t = React.useRef<ReturnType<typeof setTimeout>>();
  const copy = React.useCallback((text: string, key: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      clearTimeout(t.current);
      setCopied(key);
      t.current = setTimeout(() => setCopied(null), ms);
    });
  }, [ms]);
  React.useEffect(() => () => clearTimeout(t.current), []);
  return { copied, copy };
}

// ---------------------------------------------------------------------------
// AnimatedCheck
// ---------------------------------------------------------------------------

function AnimatedCheck({ visible }: { visible: boolean }) {
  return (
    <div
      className={[
        "relative flex h-20 w-20 items-center justify-center transition-all duration-700",
        visible ? "scale-100 opacity-100" : "scale-50 opacity-0",
      ].join(" ")}
      aria-hidden="true"
    >
      <div className={["absolute inset-0 rounded-full border border-[#22c55e]/15 bg-[#22c55e]/5 transition-all duration-1000", visible ? "scale-100 opacity-100" : "scale-75 opacity-0"].join(" ")} />
      <div className={["absolute inset-2.5 rounded-full border border-[#22c55e]/25 bg-[#22c55e]/8 transition-all duration-700 delay-100", visible ? "scale-100 opacity-100" : "scale-75 opacity-0"].join(" ")} />
      <div className={["absolute inset-5 rounded-full border border-[#22c55e]/35 bg-[#22c55e]/12 transition-all duration-500 delay-200", visible ? "scale-100 opacity-100" : "scale-75 opacity-0"].join(" ")} />
      <svg
        viewBox="0 0 20 20"
        className={["relative h-7 w-7 text-[#4ade80] transition-all duration-500 delay-300", visible ? "scale-100 opacity-100" : "scale-0 opacity-0"].join(" ")}
        fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      >
        <path d="M4 10l4 4 8-8" />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DataRow
// ---------------------------------------------------------------------------

function DataRow({ label, value, fullValue, copyKey, accent = false, copied, onCopy, href }: {
  label: string; value: string; fullValue?: string; copyKey?: string;
  accent?: boolean; copied?: string | null; onCopy?: (text: string, key: string) => void;
  href?: string | null;
}) {
  const isCopied = copyKey && copied === copyKey;
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-[#1e1e1e] bg-[#0d0d0d] px-3.5 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="mb-0.5 font-mono text-[9px] uppercase tracking-widest text-[#3e3e3e]">{label}</p>
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer"
            className={["truncate font-mono text-[11px] underline underline-offset-2 transition-colors", accent ? "text-[#4ade80] hover:text-[#86efac]" : "text-[#a0a0a0] hover:text-white"].join(" ")}>
            {value}
          </a>
        ) : (
          <p className={["truncate font-mono text-[11px]", accent ? "text-[#4ade80]" : "text-[#a0a0a0]"].join(" ")}>{value}</p>
        )}
      </div>
      {copyKey && (fullValue || value) && onCopy && (
        <button
          onClick={() => onCopy(fullValue ?? value, copyKey)}
          aria-label={isCopied ? "Copied" : `Copy ${label}`}
          className={[
            "shrink-0 rounded border px-2 py-1 text-[9px] font-semibold uppercase tracking-wider transition-all duration-200 focus-visible:outline-none",
            isCopied
              ? "border-[#22c55e]/20 bg-[#22c55e]/8 text-[#22c55e]"
              : "border-[#262626] bg-[#1a1a1a] text-[#646464] hover:border-[#3e3e3e] hover:text-[#a0a0a0]",
          ].join(" ")}
        >
          {isCopied ? "✓" : "Copy"}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card wrapper
// ---------------------------------------------------------------------------

function Card({
  icon, title, children, visible, delay = 0,
}: {
  icon: React.ReactNode; title: string; children: React.ReactNode;
  visible: boolean; delay?: number;
}) {
  return (
    <div
      className={["rounded-xl border border-[#1e1e1e] bg-[#141414] transition-all duration-500", visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"].join(" ")}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <div className="flex items-center gap-2 border-b border-[#1e1e1e] px-4 py-3">
        <span className="text-[#646464]" aria-hidden="true">{icon}</span>
        <h2 className="font-mono text-[11px] uppercase tracking-widest text-[#646464]">{title}</h2>
      </div>
      <div className="space-y-1.5 p-4">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DepositConfirmed page
// ---------------------------------------------------------------------------

export function DepositConfirmed() {
  const navigate     = useNavigate();
  const address      = useWalletStore(selectAddress);
  const proofResult  = useProofStore(selectProofResult);
  const submission   = useProofStore(selectSubmission);
  const elapsedLabel = useProofStore(selectElapsedLabel);
  const isConfirmed  = useProofStore(selectIsConfirmed);
  const reset        = useProofStore((s) => s.reset);

  const { copied, copy } = useCopy();

  useEffect(() => {
    if (!isConfirmed || !submission) navigate("/app/ledger", { replace: true });
  }, [isConfirmed, submission, navigate]);

  const [vis, setVis] = useState(false);
  useEffect(() => { const id = setTimeout(() => setVis(true), 60); return () => clearTimeout(id); }, []);

  if (!submission || !proofResult) return null;

  const explorerHref = txUrl(submission.txHash);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 px-5 py-8 pb-16 sm:px-8">

      {/* ── Hero ──────────────────────────────────────────────────── */}
      <div className={[
        "flex flex-col items-center gap-4 rounded-xl border border-[#22c55e]/12 bg-[#22c55e]/4 px-6 py-10 text-center",
        "transition-all duration-700",
        vis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
      ].join(" ")}>
        <AnimatedCheck visible={vis} />

        <div className={["transition-all duration-700 delay-300", vis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"].join(" ")}>
          <h1 className="text-2xl font-bold text-[#4ade80]">Attestation Recorded</h1>
          <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-[#646464]">
            Your ZK compliance proof has been verified and committed to the on-chain ledger.
            The nullifier is now permanently consumed.
          </p>
        </div>

        {/* Summary chips */}
        <div className={["flex flex-wrap justify-center gap-2 transition-all duration-700 delay-500", vis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"].join(" ")}>
          <Chip label="Block"  value={`#${submission.blockNumber.toString()}`} />
          <Chip label="Chain"  value={SUPPORTED_CHAIN_NAME} />
          {elapsedLabel && <Chip label="Proof time" value={elapsedLabel} accent />}
          <Chip label="Status" value="Verified" accent />
        </div>
      </div>

      {/* ── Transaction receipt ───────────────────────────────────── */}
      <Card icon={<ReceiptIcon />} title="Transaction Receipt" visible={vis} delay={100}>
        <DataRow
          label="Transaction Hash"
          value={formatHash(submission.txHash, 14, 10)}
          fullValue={submission.txHash}
          copyKey="txhash"
          accent
          copied={copied}
          onCopy={copy}
          href={explorerHref}
        />
        <div className="grid grid-cols-2 gap-1.5">
          <DataRow
            label="Block Number"
            value={`#${submission.blockNumber.toString()}`}
            fullValue={submission.blockNumber.toString()}
            copyKey="block"
            copied={copied}
            onCopy={copy}
          />
          <DataRow
            label="Confirmed At"
            value={formatDate(submission.confirmedAt)}
          />
        </div>
        <DataRow
          label="Contract"
          value={formatHash(COMPLIANCE_GATE_ADDRESS, 12, 8)}
          fullValue={COMPLIANCE_GATE_ADDRESS}
          copyKey="contract"
          copied={copied}
          onCopy={copy}
        />
        {address && (
          <DataRow
            label="Submitted By"
            value={formatHash(address, 12, 8)}
            fullValue={address}
            copyKey="addr"
            copied={copied}
            onCopy={copy}
          />
        )}
      </Card>

      {/* ── Proof snapshot ────────────────────────────────────────── */}
      <Card icon={<ShieldIcon />} title="Proof Snapshot" visible={vis} delay={200}>
        <DataRow
          label="Nullifier"
          value={formatHash(proofResult.nullifier, 14, 10)}
          fullValue={proofResult.nullifier}
          copyKey="nullifier"
          accent
          copied={copied}
          onCopy={copy}
        />
        <DataRow
          label="Merkle Root"
          value={formatHash(proofResult.rootUsed, 14, 10)}
          fullValue={proofResult.rootUsed}
          copyKey="root"
          copied={copied}
          onCopy={copy}
        />
        <div className="grid grid-cols-2 gap-1.5">
          <div className="rounded-lg border border-[#1e1e1e] bg-[#0d0d0d] px-3.5 py-2.5">
            <p className="font-mono text-[9px] uppercase tracking-widest text-[#3e3e3e]">Generated</p>
            <p className="mt-0.5 font-mono text-[11px] text-[#a0a0a0]">
              {new Date(proofResult.generatedAt).toLocaleTimeString()}
            </p>
          </div>
          <div className="rounded-lg border border-[#1e1e1e] bg-[#0d0d0d] px-3.5 py-2.5">
            <p className="font-mono text-[9px] uppercase tracking-widest text-[#3e3e3e]">Proof Bytes</p>
            <p className="mt-0.5 font-mono text-[11px] text-[#a0a0a0]">
              {Math.ceil((proofResult.proof.length - 2) / 2).toLocaleString()}
            </p>
          </div>
        </div>
      </Card>

      {/* ── What was proved ───────────────────────────────────────── */}
      <div
        className={["rounded-xl border border-[#1e1e1e] bg-[#141414] p-4 transition-all duration-500 delay-300", vis ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"].join(" ")}
      >
        <div className="mb-3 flex items-center gap-2">
          <InfoIcon className="h-3.5 w-3.5 text-[#646464]" />
          <span className="font-mono text-[11px] uppercase tracking-widest text-[#646464]">What Was Proved</span>
        </div>
        <ol className="space-y-2.5">
          {[
            "Your address was NOT present in the sanctions list at the time of proof generation.",
            "The Merkle root belongs to a known, admin-approved snapshot of the sanctions list.",
            "The ZK proof was verified on-chain by the Verifier contract — no off-chain trust required.",
            "The nullifier is now permanently consumed, preventing replay of this proof.",
          ].map((text, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-[#1e1e1e] bg-[#0d0d0d] font-mono text-[9px] font-bold text-[#3e3e3e]">
                {i + 1}
              </span>
              <span className="text-[11px] leading-relaxed text-[#646464]">{text}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* ── Primary action buttons ────────────────────────────────── */}
      <div
        className={["flex flex-col gap-2.5 transition-all duration-500 delay-400", vis ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"].join(" ")}
      >
        <button
          onClick={() => navigate("/app/dashboard")}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#22c55e] py-3.5 text-[14px] font-semibold text-white transition-colors hover:bg-[#16a34a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22c55e]/50"
        >
          <HomeIcon className="h-4 w-4" />
          Back to Dashboard
        </button>

        {explorerHref && (
          <a
            href={explorerHref} target="_blank" rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#262626] bg-[#141414] py-3.5 text-[14px] font-semibold text-[#a0a0a0] transition-colors hover:border-[#3e3e3e] hover:text-white focus-visible:outline-none"
          >
            <ExternalIcon className="h-4 w-4" />
            View on {SUPPORTED_CHAIN_NAME} Explorer
          </a>
        )}

        {/* Tertiary row */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            onClick={() => navigate("/app/ledger")}
            className="flex items-center justify-center gap-2 rounded-xl border border-[#1e1e1e] py-2.5 text-[12px] font-medium text-[#646464] transition-colors hover:border-[#262626] hover:text-[#a0a0a0] focus-visible:outline-none"
          >
            <LedgerIcon className="h-3.5 w-3.5" />
            View Ledger
          </button>
          <button
            onClick={() => { reset(); navigate("/app/proof/generate"); }}
            className="flex items-center justify-center gap-2 rounded-xl border border-[#1e1e1e] py-2.5 text-[12px] font-medium text-[#646464] transition-colors hover:border-[#262626] hover:text-[#a0a0a0] focus-visible:outline-none"
          >
            <ShieldPlusIcon className="h-3.5 w-3.5" />
            New Proof
          </button>
        </div>
      </div>
    </div>
  );
}

export default DepositConfirmed;

// ---------------------------------------------------------------------------
// Chip
// ---------------------------------------------------------------------------

function Chip({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-[#1e1e1e] bg-[#141414] px-3 py-1">
      <span className="font-mono text-[9px] uppercase tracking-widest text-[#3e3e3e]">{label}</span>
      <span className={["font-mono text-[10px] font-semibold", accent ? "text-[#4ade80]" : "text-[#a0a0a0]"].join(" ")}>{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function ReceiptIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 14 14" className={className ?? "h-3.5 w-3.5"} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 1.5v11l1.5-1 1.5 1 1.5-1 1.5 1 1.5-1 1.5 1 1.5-1V1.5H2z" /><path d="M5 5h4M5 7h4M5 9h2" /></svg>;
}
function ShieldIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 14 14" className={className ?? "h-3.5 w-3.5"} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 1.5L2 4v3.5C2 10.5 4 12 7 13c3-1 5-2.5 5-5.5V4L7 1.5z" /></svg>;
}
function InfoIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 14 14" className={className ?? "h-3.5 w-3.5"} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="7" cy="7" r="5.5" /><path d="M7 9.5V7M7 4.5v.5" /></svg>;
}
function ExternalIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 12 12" className={className ?? "h-3.5 w-3.5"} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 2H2v8h8V7M7 2h3v3M6 6l4-4" /></svg>;
}
function HomeIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 14 14" className={className ?? "h-3.5 w-3.5"} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 6.5L7 2l5 4.5M3.5 5.5V12h7V5.5M5.5 12V8.5h3V12" /></svg>;
}
function LedgerIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 14 14" className={className ?? "h-3.5 w-3.5"} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="2" width="10" height="10" rx="1.5" /><path d="M5 5h4M5 7h4M5 9h2" /></svg>;
}
function ShieldPlusIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 14 14" className={className ?? "h-3.5 w-3.5"} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 1.5L2 4v3.5C2 10.5 4 12 7 13c3-1 5-2.5 5-5.5V4L7 1.5z" /><path d="M7 5v4M5 7h4" /></svg>;
}
