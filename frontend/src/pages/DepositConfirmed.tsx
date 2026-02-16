// frontend/src/pages/DepositConfirmed.tsx
//
// Route: /app/ledger/confirmed
//
// Final screen in the compliance-attestation flow.
// Shown after assertCompliant() is confirmed on-chain.
//
// Sections:
//   • Hero — animated checkmark + "Attestation recorded" headline
//   • Transaction receipt — txHash, block, timestamp
//   • Proof details — nullifier, root, public inputs (read from proofStore)
//   • Next-action strip — Start new proof | Back to Dashboard | View Ledger

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
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function txUrl(hash: Hex): string | null {
  if (!BLOCK_EXPLORER_URL) return null;
  return `${BLOCK_EXPLORER_URL}/tx/${hash}`;
}

// ---------------------------------------------------------------------------
// useCopy
// ---------------------------------------------------------------------------

function useCopy(ms = 1600) {
  const [copied, setCopied] = React.useState<string | null>(null);
  const t = React.useRef<ReturnType<typeof setTimeout>>();
  const copy = React.useCallback(
    (text: string, key: string) => {
      void navigator.clipboard.writeText(text).then(() => {
        clearTimeout(t.current);
        setCopied(key);
        t.current = setTimeout(() => setCopied(null), ms);
      });
    },
    [ms],
  );
  useEffect(() => () => clearTimeout(t.current), []);
  return { copied, copy };
}

// ---------------------------------------------------------------------------
// DataRow — labelled field with optional copy
// ---------------------------------------------------------------------------

function DataRow({
  label,
  value,
  fullValue,
  copyKey,
  accent = false,
  copied,
  onCopy,
  href,
}: {
  label:      string;
  value:      string;
  fullValue?: string;
  copyKey?:   string;
  accent?:    boolean;
  copied?:    string | null;
  onCopy?:    (text: string, key: string) => void;
  href?:      string | null;
}) {
  const isCopied = copyKey && copied === copyKey;
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800/70 bg-zinc-900/25 px-3.5 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-widest text-zinc-600">
          {label}
        </p>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={[
              "truncate font-mono text-[11px] underline underline-offset-2 transition-colors",
              accent
                ? "text-teal-300 hover:text-teal-200"
                : "text-zinc-400 hover:text-zinc-200",
            ].join(" ")}
          >
            {value}
          </a>
        ) : (
          <p
            className={[
              "truncate font-mono text-[11px]",
              accent ? "text-teal-300" : "text-zinc-400",
            ].join(" ")}
          >
            {value}
          </p>
        )}
      </div>
      {copyKey && (fullValue || value) && onCopy && (
        <button
          onClick={() => onCopy(fullValue ?? value, copyKey)}
          aria-label={isCopied ? "Copied" : `Copy ${label}`}
          className={[
            "shrink-0 rounded-lg border px-2 py-1 text-[9px] font-semibold uppercase tracking-wider",
            "transition-all duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal-500",
            isCopied
              ? "border-teal-500/25 bg-teal-500/8 text-teal-400"
              : "border-zinc-700 bg-zinc-800/60 text-zinc-600 hover:border-zinc-600 hover:text-zinc-400",
          ].join(" ")}
        >
          {isCopied ? "✓" : "Copy"}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AnimatedCheck
// ---------------------------------------------------------------------------

function AnimatedCheck({ visible }: { visible: boolean }) {
  return (
    <div
      className={[
        "relative flex h-16 w-16 items-center justify-center transition-all duration-700",
        visible ? "scale-100 opacity-100" : "scale-50 opacity-0",
      ].join(" ")}
      aria-hidden="true"
    >
      {/* Outer glow ring */}
      <div
        className={[
          "absolute inset-0 rounded-full border border-teal-500/20 bg-teal-500/5",
          "transition-all duration-1000",
          visible ? "scale-100 opacity-100" : "scale-75 opacity-0",
        ].join(" ")}
      />
      {/* Middle ring */}
      <div
        className={[
          "absolute inset-2 rounded-full border border-teal-500/30 bg-teal-500/8",
          "transition-all duration-700 delay-100",
          visible ? "scale-100 opacity-100" : "scale-75 opacity-0",
        ].join(" ")}
      />
      {/* Inner circle */}
      <div
        className={[
          "absolute inset-4 rounded-full border border-teal-400/40 bg-teal-500/12",
          "transition-all duration-500 delay-200",
          visible ? "scale-100 opacity-100" : "scale-75 opacity-0",
        ].join(" ")}
      />
      {/* Check icon */}
      <svg
        viewBox="0 0 20 20"
        className={[
          "relative h-6 w-6 text-teal-400 transition-all duration-500 delay-300",
          visible ? "scale-100 opacity-100" : "scale-0 opacity-0",
        ].join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 10l4 4 8-8" />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SectionCard
// ---------------------------------------------------------------------------

function SectionCard({
  icon,
  title,
  children,
  delay = 0,
  visible,
}: {
  icon:     React.ReactNode;
  title:    string;
  children: React.ReactNode;
  delay?:   number;
  visible:  boolean;
}) {
  return (
    <div
      className={[
        "rounded-2xl border border-zinc-800 bg-zinc-900/30 transition-all duration-500",
        visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
      ].join(" ")}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
        <span className="text-zinc-500">{icon}</span>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
          {title}
        </h2>
      </div>
      <div className="space-y-2 p-4">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DepositConfirmed
// ---------------------------------------------------------------------------

export function DepositConfirmed() {
  const navigate    = useNavigate();
  const address     = useWalletStore(selectAddress);
  const proofResult = useProofStore(selectProofResult);
  const submission  = useProofStore(selectSubmission);
  const elapsedLabel = useProofStore(selectElapsedLabel);
  const isConfirmed = useProofStore(selectIsConfirmed);
  const reset       = useProofStore((s) => s.reset);

  const { copied, copy } = useCopy();

  // Redirect away if there's nothing to show
  useEffect(() => {
    if (!isConfirmed || !submission) {
      navigate("/app/ledger", { replace: true });
    }
  }, [isConfirmed, submission, navigate]);

  // Staggered entrance
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setVisible(true), 60);
    return () => clearTimeout(id);
  }, []);

  // Guard render before redirect fires
  if (!submission || !proofResult) return null;

  const explorerHref = txUrl(submission.txHash);

  return (
    <div className="flex flex-col gap-5 p-4 pb-16 sm:p-6 lg:p-8">

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <div
        className={[
          "flex flex-col items-center gap-4 rounded-2xl border border-teal-500/15 bg-teal-500/5 px-6 py-10",
          "text-center transition-all duration-700",
          visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
        ].join(" ")}
      >
        <AnimatedCheck visible={visible} />

        <div>
          <h1
            className={[
              "text-xl font-semibold text-teal-300 transition-all duration-700 delay-400",
              visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
            ].join(" ")}
          >
            Attestation Recorded
          </h1>
          <p
            className={[
              "mt-1.5 max-w-sm text-xs text-zinc-500 transition-all duration-700 delay-500",
              visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
            ].join(" ")}
          >
            Your ZK compliance proof has been verified and committed to the
            on-chain ledger. The nullifier is now consumed.
          </p>
        </div>

        {/* Summary chips */}
        <div
          className={[
            "flex flex-wrap justify-center gap-2 transition-all duration-700 delay-600",
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
          ].join(" ")}
        >
          <Chip label="Block" value={`#${submission.blockNumber.toString()}`} />
          <Chip label="Chain"  value={SUPPORTED_CHAIN_NAME} />
          {elapsedLabel && (
            <Chip label="Proof time" value={elapsedLabel} accent />
          )}
        </div>
      </div>

      {/* ── Body grid ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">

        {/* Left column */}
        <div className="flex flex-col gap-4">

          {/* Transaction receipt */}
          <SectionCard
            icon={<ReceiptIcon className="h-3.5 w-3.5" />}
            title="Transaction Receipt"
            delay={100}
            visible={visible}
          >
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
            <div className="grid grid-cols-2 gap-2">
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

            {/* Explorer link */}
            {explorerHref && (
              <a
                href={explorerHref}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-700 py-2.5 text-xs font-medium text-zinc-500 transition-colors hover:border-teal-500/30 hover:text-teal-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal-500"
              >
                <ExternalLinkIcon className="h-3 w-3" />
                View on {SUPPORTED_CHAIN_NAME} Explorer
              </a>
            )}
          </SectionCard>

          {/* What was proved */}
          <SectionCard
            icon={<InfoIcon className="h-3.5 w-3.5" />}
            title="What Was Proved"
            delay={150}
            visible={visible}
          >
            <ol className="space-y-2">
              {[
                "Your address was NOT present in the sanctions list at the time of proof generation.",
                "The Merkle root used belongs to a known, admin-approved snapshot of the sanctions list.",
                "The ZK proof was verified on-chain by the Verifier contract — no off-chain trust required.",
                "The nullifier is now permanently consumed, preventing replay of this proof.",
              ].map((text, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 text-[9px] font-semibold text-zinc-600">
                    {i + 1}
                  </span>
                  <span className="text-[11px] leading-relaxed text-zinc-600">{text}</span>
                </li>
              ))}
            </ol>
          </SectionCard>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4">

          {/* Proof snapshot */}
          <SectionCard
            icon={<ShieldIcon className="h-3.5 w-3.5" />}
            title="Proof Snapshot"
            delay={200}
            visible={visible}
          >
            <DataRow
              label="Nullifier"
              value={formatHash(proofResult.nullifier, 12, 8)}
              fullValue={proofResult.nullifier}
              copyKey="nullifier"
              accent
              copied={copied}
              onCopy={copy}
            />
            <DataRow
              label="Merkle Root"
              value={formatHash(proofResult.rootUsed, 12, 8)}
              fullValue={proofResult.rootUsed}
              copyKey="root"
              copied={copied}
              onCopy={copy}
            />
            {proofResult.publicInputs.map((pi, i) => (
              <DataRow
                key={i}
                label={`Public Input [${i}]`}
                value={formatHash(pi, 12, 8)}
                fullValue={pi}
                copyKey={`pi-${i}`}
                copied={copied}
                onCopy={copy}
              />
            ))}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-3.5 py-2.5">
                <p className="text-[9px] font-semibold uppercase tracking-widest text-zinc-600">Generated</p>
                <p className="mt-0.5 font-mono text-[11px] text-zinc-400">
                  {new Date(proofResult.generatedAt).toLocaleTimeString()}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-3.5 py-2.5">
                <p className="text-[9px] font-semibold uppercase tracking-widest text-zinc-600">Proof bytes</p>
                <p className="mt-0.5 font-mono text-[11px] text-zinc-400">
                  {Math.ceil((proofResult.proof.length - 2) / 2).toLocaleString()}
                </p>
              </div>
            </div>
          </SectionCard>

          {/* Next actions */}
          <SectionCard
            icon={<ArrowRightIcon className="h-3.5 w-3.5" />}
            title="Next Steps"
            delay={250}
            visible={visible}
          >
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  reset();
                  navigate("/app/proofs/generate");
                }}
                className="flex items-center justify-center gap-2 rounded-xl border border-zinc-700 py-2.5 text-xs font-medium text-zinc-500 transition-colors hover:border-zinc-600 hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-600"
              >
                <ShieldPlusIcon className="h-3 w-3" />
                Generate a New Proof
              </button>
              <button
                onClick={() => navigate("/app/ledger")}
                className="flex items-center justify-center gap-2 rounded-xl border border-zinc-700 py-2.5 text-xs font-medium text-zinc-500 transition-colors hover:border-zinc-600 hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-600"
              >
                <LedgerIcon className="h-3 w-3" />
                Back to Ledger
              </button>
              <button
                onClick={() => navigate("/app")}
                className="flex items-center justify-center gap-2 rounded-xl border border-zinc-700 py-2.5 text-xs font-medium text-zinc-500 transition-colors hover:border-zinc-600 hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-600"
              >
                <HomeIcon className="h-3 w-3" />
                Dashboard
              </button>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

export default DepositConfirmed;

// ---------------------------------------------------------------------------
// Chip
// ---------------------------------------------------------------------------

function Chip({
  label,
  value,
  accent = false,
}: {
  label:   string;
  value:   string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1">
      <span className="text-[9px] font-semibold uppercase tracking-widest text-zinc-600">
        {label}
      </span>
      <span className={[
        "font-mono text-[10px] font-medium",
        accent ? "text-teal-400" : "text-zinc-400",
      ].join(" ")}>
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function ReceiptIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 14 14" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 1.5v11l1.5-1 1.5 1 1.5-1 1.5 1 1.5-1 1.5 1 1.5-1V1.5H2z" /><path d="M5 5h4M5 7h4M5 9h2" /></svg>;
}
function ShieldIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 14 14" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 1.5L2 4v3.5C2 10.5 4 12 7 13c3-1 5-2.5 5-5.5V4L7 1.5z" /></svg>;
}
function InfoIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 14 14" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="7" cy="7" r="5.5" /><path d="M7 9.5V7M7 4.5v.5" /></svg>;
}
function ArrowRightIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 12 12" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 6h8M7 3l3 3-3 3" /></svg>;
}
function ExternalLinkIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 12 12" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 2H2v8h8V7M7 2h3v3M6 6l4-4" /></svg>;
}
function LedgerIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 14 14" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="2" width="10" height="10" rx="1.5" /><path d="M5 5h4M5 7h4M5 9h2" /></svg>;
}
function HomeIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 14 14" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 6.5L7 2l5 4.5" /><path d="M3.5 5.5V12h7V5.5" /><path d="M5.5 12V8.5h3V12" /></svg>;
}
function ShieldPlusIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 14 14" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 1.5L2 4v3.5C2 10.5 4 12 7 13c3-1 5-2.5 5-5.5V4L7 1.5z" /><path d="M7 5v4M5 7h4" /></svg>;
}