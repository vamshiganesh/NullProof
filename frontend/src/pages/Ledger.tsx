// frontend/src/pages/Ledger.tsx
//
// Route: /app/ledger — Compliance Ledger
//
// Two-column layout:
//   Left  — Transaction details: address / nullifier / root read-only fields,
//            root-staleness warning, "Record Compliance Attestation" confirm button,
//            inline confirmed receipt.
//   Right — Attached proof panel: large VALID/CONSUMED/NONE badge, proof hash,
//            nullifier, validity window countdown, nullifier on-chain status,
//            contract addresses.

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import type { Hex } from "viem";

import {
  useProofStore,
  selectProofResult,
  selectSubmission,
  selectProofStatus,
  selectIsConfirmed,
  selectReadyToSubmit,
  selectElapsedLabel,
} from "@/store/proofStore";
import { useWalletStore, selectAddress, selectIsConnected } from "@/store/walletStore";
import { useSanctionsStore, selectCurrentRoot }              from "@/store/sanctionsStore";
import {
  useIsNullifierUsed,
  useNullifierUsedAt,
  useValidityWindow,
  useSubmissionPaused,
} from "@/hooks/useContractRead";
import { formatHash } from "@/lib/format";
import {
  COMPLIANCE_GATE_ADDRESS,
  SANCTIONS_LIST_ADDRESS,
  SUPPORTED_CHAIN_NAME,
  BLOCK_EXPLORER_URL,
  DEFAULT_VALIDITY_WINDOW_SECONDS,
} from "@/lib/constants";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(unixMs: number): string {
  return new Date(unixMs).toLocaleString(undefined, {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatSeconds(s: bigint): string {
  const n = Number(s);
  if (n < 60)    return `${n}s`;
  if (n < 3600)  return `${Math.floor(n / 60)}m`;
  if (n < 86400) return `${Math.floor(n / 3600)}h`;
  return `${Math.floor(n / 86400)}d`;
}

function timeAgo(unixSecs: bigint): string {
  const diff = Math.floor(Date.now() / 1000) - Number(unixSecs);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function txUrl(hash: Hex): string | null {
  if (!BLOCK_EXPLORER_URL) return null;
  return `${BLOCK_EXPLORER_URL}/tx/${hash}`;
}

// ---------------------------------------------------------------------------
// Copy hook
// ---------------------------------------------------------------------------

function useCopy(ms = 1600) {
  const [copied, setCopied] = useState<string | null>(null);
  const t = useRef<ReturnType<typeof setTimeout>>();
  const copy = useCallback((text: string, key: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      clearTimeout(t.current);
      setCopied(key);
      t.current = setTimeout(() => setCopied(null), ms);
    });
  }, [ms]);
  useEffect(() => () => clearTimeout(t.current), []);
  return { copied, copy };
}

// ---------------------------------------------------------------------------
// DataRow — labelled read-only field with optional copy
// ---------------------------------------------------------------------------

function DataRow({
  label, value, accent = false, copyKey, fullValue, copied, onCopy,
}: {
  label: string; value: string; accent?: boolean;
  copyKey?: string; fullValue?: string;
  copied?: string | null; onCopy?: (t: string, k: string) => void;
}) {
  const isCopied = copyKey && copied === copyKey;
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-[#1e1e1e] bg-[#0d0d0d] px-3.5 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="mb-0.5 font-mono text-[9px] uppercase tracking-widest text-[#3e3e3e]">{label}</p>
        <p className={["truncate font-mono text-[11px]", accent ? "text-[#4ade80]" : "text-[#a0a0a0]"].join(" ")}>{value}</p>
      </div>
      {copyKey && fullValue && onCopy && (
        <button
          onClick={() => onCopy(fullValue, copyKey)}
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
// Card shell
// ---------------------------------------------------------------------------

function Card({ icon, title, badge, children }: {
  icon: React.ReactNode; title: string;
  badge?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[#1e1e1e] bg-[#141414]">
      <div className="flex items-center gap-2 border-b border-[#1e1e1e] px-4 py-3">
        <span className="text-[#646464]" aria-hidden="true">{icon}</span>
        <h2 className="font-mono text-[11px] uppercase tracking-widest text-[#646464]">{title}</h2>
        {badge && <div className="ml-auto">{badge}</div>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ValidityBadge — the big VALID / CONSUMED / NONE badge on the proof panel
// ---------------------------------------------------------------------------

type ProofBadgeState = "valid" | "consumed" | "expired" | "none";

function ValidityBadge({ state }: { state: ProofBadgeState }) {
  const cfg = {
    valid:    { label: "VALID",    dot: "bg-[#22c55e] animate-pulse",  border: "border-[#22c55e]/20", bg: "bg-[#22c55e]/8",   text: "text-[#4ade80]" },
    consumed: { label: "CONSUMED", dot: "bg-amber-400",                border: "border-amber-500/20", bg: "bg-amber-500/6",   text: "text-amber-300" },
    expired:  { label: "EXPIRED",  dot: "bg-rose-400",                 border: "border-rose-500/20",  bg: "bg-rose-500/6",    text: "text-rose-300"  },
    none:     { label: "NO PROOF", dot: "bg-[#3e3e3e]",               border: "border-[#1e1e1e]",    bg: "bg-[#141414]",     text: "text-[#646464]" },
  }[state];

  return (
    <div className={["flex items-center gap-2.5 rounded-xl border px-4 py-3", cfg.border, cfg.bg].join(" ")}>
      <span className={["h-2 w-2 shrink-0 rounded-full", cfg.dot].join(" ")} aria-hidden="true" />
      <span className={["text-[13px] font-bold tracking-widest", cfg.text].join(" ")}>{cfg.label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Validity window countdown
// ---------------------------------------------------------------------------

function ValidityCountdown({ generatedAt }: { generatedAt: number }) {
  const [secsLeft, setSecsLeft] = useState<number>(0);

  useEffect(() => {
    const tick = () => {
      const elapsed = Math.floor((Date.now() - generatedAt) / 1000);
      setSecsLeft(Math.max(0, Number(DEFAULT_VALIDITY_WINDOW_SECONDS) - elapsed));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [generatedAt]);

  const pct = Math.round((secsLeft / Number(DEFAULT_VALIDITY_WINDOW_SECONDS)) * 100);
  const isUrgent = secsLeft < 3600;

  function fmt(s: number): string {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${sec}s`;
    return `${sec}s`;
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <ClockIcon className={["h-3 w-3", isUrgent ? "text-amber-400" : "text-[#646464]"].join(" ")} />
          <span className={["text-[11px] font-medium", isUrgent ? "text-amber-300" : "text-[#a0a0a0]"].join(" ")}>
            {secsLeft > 0 ? `Expires in ${fmt(secsLeft)}` : "Expired"}
          </span>
        </div>
        <span className={["font-mono text-[10px] tabular-nums", isUrgent ? "text-amber-400" : "text-[#646464]"].join(" ")}>
          {pct}%
        </span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-[#1a1a1a]">
        <div
          className={["h-full rounded-full transition-[width] duration-1000", isUrgent ? "bg-amber-500" : "bg-[#22c55e]"].join(" ")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NullifierStatus — live on-chain probe
// ---------------------------------------------------------------------------

function NullifierStatus({ nullifier }: { nullifier: Hex }) {
  const used    = useIsNullifierUsed(nullifier);
  const usedAt  = useNullifierUsedAt(nullifier);
  const validity = useValidityWindow();
  const paused  = useSubmissionPaused();

  const expiresAt: Date | null =
    used.data && usedAt.data && validity.data
      ? new Date((Number(usedAt.data) + Number(validity.data)) * 1000)
      : null;
  const isExpired = expiresAt ? expiresAt < new Date() : false;

  return (
    <div className="space-y-2">
      {/* Status row */}
      <div className="flex items-center justify-between rounded-lg border border-[#1e1e1e] bg-[#0d0d0d] px-3.5 py-2.5">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-widest text-[#3e3e3e]">On-chain status</p>
          <div className="mt-0.5 flex items-center gap-1.5">
            {used.isLoading && (
              <><span className="h-2 w-2 animate-spin rounded-full border border-[#262626] border-t-[#646464]" /><span className="text-[11px] text-[#646464]">Checking…</span></>
            )}
            {used.isError && <span className="text-[11px] text-rose-400">Read error</span>}
            {used.isSuccess && (
              <>
                <span className={["h-1.5 w-1.5 rounded-full", used.data ? "bg-amber-400" : "bg-[#22c55e]"].join(" ")} aria-hidden="true" />
                <span className={["text-[11px] font-semibold", used.data ? "text-amber-300" : "text-[#4ade80]"].join(" ")}>
                  {used.data ? "Nullifier consumed" : "Nullifier unused"}
                </span>
              </>
            )}
          </div>
        </div>
        <button
          onClick={() => { used.refetch(); usedAt.refetch(); }}
          aria-label="Refresh nullifier status"
          className="rounded-lg border border-[#262626] bg-[#1a1a1a] p-1.5 text-[#646464] transition-colors hover:border-[#3e3e3e] hover:text-[#a0a0a0] focus-visible:outline-none"
        >
          <RefreshIcon className="h-3 w-3" />
        </button>
      </div>

      {/* Consumed at + valid until */}
      {used.data === true && usedAt.data != null && usedAt.data > 0n && (
        <div className="grid grid-cols-2 gap-1.5">
          <div className="rounded-lg border border-[#1e1e1e] bg-[#0d0d0d] px-3.5 py-2.5">
            <p className="font-mono text-[9px] uppercase tracking-widest text-[#3e3e3e]">Consumed</p>
            <p className="mt-0.5 font-mono text-[11px] text-[#a0a0a0]">{timeAgo(usedAt.data)}</p>
          </div>
          {expiresAt && (
            <div className="rounded-lg border border-[#1e1e1e] bg-[#0d0d0d] px-3.5 py-2.5">
              <p className="font-mono text-[9px] uppercase tracking-widest text-[#3e3e3e]">
                {isExpired ? "Expired" : "Valid until"}
              </p>
              <p className={["mt-0.5 font-mono text-[11px]", isExpired ? "text-rose-400" : "text-[#4ade80]"].join(" ")}>
                {isExpired ? "Expired" : formatDate(expiresAt.getTime())}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Validity window from chain */}
      {validity.isSuccess && validity.data !== null && (
        <div className="flex items-center justify-between rounded-lg border border-[#1e1e1e] bg-[#0d0d0d] px-3.5 py-2.5">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-widest text-[#3e3e3e]">Protocol validity window</p>
            <p className="mt-0.5 font-mono text-[11px] text-[#a0a0a0]">{formatSeconds(validity.data)}</p>
          </div>
          <ClockIcon className="h-4 w-4 text-[#3e3e3e]" />
        </div>
      )}

      {/* Paused warning */}
      {paused.isSuccess && paused.data && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3.5 py-2.5">
          <AlertIcon className="h-3.5 w-3.5 shrink-0 text-amber-400" />
          <p className="text-[11px] text-amber-400">Contract submissions are currently paused.</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// No proof empty state
// ---------------------------------------------------------------------------

function NoProofBanner() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#1e1e1e] bg-[#0d0d0d]">
        <ShieldOffIcon className="h-5 w-5 text-[#3e3e3e]" />
      </div>
      <div>
        <p className="text-[13px] font-semibold text-[#a0a0a0]">No active proof</p>
        <p className="mt-1 text-[11px] text-[#646464]">
          Generate a ZK proof before submitting a compliance attestation.
        </p>
      </div>
      <button
        onClick={() => navigate("/app/proof/generate")}
        className="flex items-center gap-2 rounded-lg bg-[#22c55e] px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#16a34a] focus-visible:outline-none"
      >
        <ArrowRightIcon className="h-3.5 w-3.5" />
        Generate Proof
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ledger page
// ---------------------------------------------------------------------------

export function Ledger() {
  const navigate    = useNavigate();
  const address     = useWalletStore(selectAddress);
  const isConnected = useWalletStore(selectIsConnected);
  const currentRoot = useSanctionsStore(selectCurrentRoot);

  const proofResult   = useProofStore(selectProofResult);
  const submission    = useProofStore(selectSubmission);
  const proofStatus   = useProofStore(selectProofStatus);
  const isConfirmed   = useProofStore(selectIsConfirmed);
  const readyToSubmit = useProofStore(selectReadyToSubmit);
  const elapsedLabel  = useProofStore(selectElapsedLabel);
  const { startSubmission, setConfirmed, setError } = useProofStore();

  const { copied, copy } = useCopy();

  const [localSubmitting, setLocalSubmitting] = useState(false);
  const [localError,      setLocalError]      = useState<string | null>(null);
  const [localConfirmed,  setLocalConfirmed]  = useState(false);

  useEffect(() => { if (isConfirmed) setLocalConfirmed(true); }, [isConfirmed]);

  const [vis, setVis] = useState(false);
  useEffect(() => { const id = setTimeout(() => setVis(true), 40); return () => clearTimeout(id); }, []);

  type LedgerSubmitState = "ready" | "submitting" | "confirmed" | "disabled";
  const submitState: LedgerSubmitState =
    localConfirmed || isConfirmed ? "confirmed"
    : localSubmitting || proofStatus === "submitting" ? "submitting"
    : !readyToSubmit || !isConnected ? "disabled"
    : "ready";

  const rootMismatch = !!(proofResult && currentRoot && proofResult.rootUsed !== currentRoot);

  // Proof badge state
  const proofBadge: "valid" | "consumed" | "expired" | "none" =
    !proofResult ? "none"
    : localConfirmed || isConfirmed ? "consumed"
    : "valid";

  const handleSubmit = useCallback(async () => {
    if (!proofResult || !address || submitState !== "ready") return;
    setLocalSubmitting(true);
    setLocalError(null);
    startSubmission();
    try {
      const { writeAssertCompliant, createDefaultPublicClient } = await import("@/lib/chain/contracts");
      const txHash = await writeAssertCompliant({
        proof: proofResult.proof, publicInputs: proofResult.publicInputs,
        nullifier: proofResult.nullifier, account: address,
      });
      const publicClient = createDefaultPublicClient();
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      setLocalSubmitting(false);
      setLocalConfirmed(true);
      setConfirmed({ txHash, confirmedAt: Date.now(), blockNumber: receipt.blockNumber });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Submission failed";
      setLocalSubmitting(false);
      setLocalError(msg);
      setError(msg);
    }
  }, [proofResult, address, submitState, startSubmission, setConfirmed, setError]);

  const explorerHref = submission ? txUrl(submission.txHash) : null;

  return (
    <div className={["flex flex-col gap-5 p-4 pb-12 sm:p-6 lg:p-8 transition-all duration-500", vis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"].join(" ")}>

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[20px] font-bold tracking-tight text-white">Compliance Ledger</h1>
          <p className="mt-0.5 text-[13px] text-[#646464]">
            Submit a ZK attestation to the on-chain compliance registry
          </p>
        </div>
        <div className="flex items-center gap-2">
          {address && (
            <div className="flex items-center gap-1.5 rounded-lg border border-[#1e1e1e] bg-[#141414] px-3 py-1.5">
              <span className={["h-1.5 w-1.5 rounded-full", isConnected ? "bg-[#22c55e]" : "bg-[#3e3e3e]"].join(" ")} aria-hidden="true" />
              <span className="font-mono text-[12px] text-[#646464]">{formatHash(address, 8, 6)}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 rounded-lg border border-[#1e1e1e] bg-[#141414] px-3 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[#3e3e3e]" aria-hidden="true" />
            <span className="text-[12px] text-[#646464]">{SUPPORTED_CHAIN_NAME}</span>
          </div>
        </div>
      </div>

      {/* ── Sanctions root strip ────────────────────────────────────── */}
      {currentRoot && (
        <div className="flex items-center gap-2.5 rounded-lg border border-[#1e1e1e] bg-[#141414] px-4 py-2.5">
          <span className="font-mono text-[9px] uppercase tracking-widest text-[#3e3e3e]">Sanctions root</span>
          <span className="mx-1 h-3 w-px bg-[#1e1e1e]" aria-hidden="true" />
          <span className="font-mono text-[11px] text-[#4ade80]">{formatHash(currentRoot, 14, 10)}</span>
          {rootMismatch && (
            <span className="ml-auto flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/6 px-2.5 py-1 text-[10px] font-semibold text-amber-400">
              <AlertIcon className="h-2.5 w-2.5" />Root mismatch
            </span>
          )}
        </div>
      )}

      {/* ── Main grid ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">

        {/* ── Left: transaction details ─────────────────────────── */}
        <div className="flex flex-col gap-4">

          <Card
            icon={<LedgerIcon />}
            title="Transaction Details"
            badge={
              proofResult ? (
                <span className={[
                  "rounded-full border px-2 py-0.5 font-mono text-[9px] font-semibold uppercase",
                  localConfirmed || isConfirmed
                    ? "border-[#22c55e]/20 bg-[#22c55e]/8 text-[#22c55e]"
                    : "border-[#1e1e1e] bg-[#0d0d0d] text-[#646464]",
                ].join(" ")}>
                  {localConfirmed || isConfirmed ? "Recorded" : "Pending"}
                </span>
              ) : undefined
            }
          >
            {!proofResult ? (
              <NoProofBanner />
            ) : (
              <div className="flex flex-col gap-2.5">
                {/* Transaction fields */}
                <div className="space-y-1.5">
                  <DataRow label="Your Address"    value={address ? formatHash(address, 14, 10) : "—"}       fullValue={address ?? ""}          copyKey="addr"  copied={copied} onCopy={copy} />
                  <DataRow label="Nullifier"        value={formatHash(proofResult.nullifier, 14, 10)}         fullValue={proofResult.nullifier}   copyKey="null"  copied={copied} onCopy={copy} accent />
                  <DataRow label="Merkle Root Used" value={formatHash(proofResult.rootUsed, 14, 10)}          fullValue={proofResult.rootUsed}    copyKey="root"  copied={copied} onCopy={copy} />
                  {proofResult.publicInputs.map((pi, i) => (
                    <DataRow key={i} label={`Public Input [${i}]`} value={formatHash(pi, 14, 10)} fullValue={pi} copyKey={`pi-${i}`} copied={copied} onCopy={copy} />
                  ))}
                </div>

                {/* Proof size + elapsed */}
                <div className="flex items-center justify-between rounded-lg border border-[#1e1e1e] bg-[#0d0d0d] px-3.5 py-2.5">
                  <div>
                    <p className="font-mono text-[9px] uppercase tracking-widest text-[#3e3e3e]">Proof size</p>
                    <p className="mt-0.5 font-mono text-[11px] text-[#a0a0a0]">
                      {Math.ceil((proofResult.proof.length - 2) / 2).toLocaleString()} bytes
                    </p>
                  </div>
                  {elapsedLabel && (
                    <span className="rounded border border-[#22c55e]/20 bg-[#22c55e]/8 px-2 py-0.5 font-mono text-[10px] text-[#22c55e]">
                      {elapsedLabel}
                    </span>
                  )}
                </div>

                {/* Root mismatch warning */}
                {rootMismatch && (
                  <div className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3.5 py-3">
                    <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold text-amber-300">Root mismatch — submission will revert</p>
                      <p className="mt-0.5 text-[11px] text-amber-600/80">
                        The on-chain root has changed since this proof was generated.
                      </p>
                      <button
                        onClick={() => navigate("/app/proof/generate")}
                        className="mt-1.5 text-[10px] font-semibold text-amber-400 underline underline-offset-2 hover:text-amber-300 focus-visible:outline-none"
                      >
                        Regenerate proof →
                      </button>
                    </div>
                  </div>
                )}

                {/* Confirm button */}
                <button
                  onClick={handleSubmit}
                  disabled={submitState === "disabled" || submitState === "confirmed" || submitState === "submitting"}
                  className={[
                    "relative flex w-full items-center justify-center gap-2.5 overflow-hidden rounded-xl py-3.5 text-[14px] font-semibold",
                    "transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22c55e]/40",
                    submitState === "confirmed"
                      ? "cursor-default border border-[#22c55e]/20 bg-[#22c55e]/8 text-[#22c55e]"
                      : submitState === "submitting"
                      ? "cursor-wait border border-[#22c55e]/20 bg-[#22c55e]/10 text-[#22c55e]"
                      : submitState === "disabled"
                      ? "cursor-not-allowed border border-[#1e1e1e] bg-[#141414] text-[#3e3e3e]"
                      : "bg-[#22c55e] text-white hover:bg-[#16a34a] active:scale-[0.99]",
                  ].join(" ")}
                >
                  {submitState === "submitting" && (
                    <span className="pointer-events-none absolute inset-0 -translate-x-full animate-[shimmer_1.4s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent" aria-hidden="true" />
                  )}
                  {submitState === "confirmed" ? (
                    <><CheckIcon className="h-4 w-4" />Attestation Recorded</>
                  ) : submitState === "submitting" ? (
                    <><span className="h-4 w-4 animate-spin rounded-full border border-[#22c55e]/40 border-t-[#22c55e]" aria-hidden="true" />Awaiting Confirmation…</>
                  ) : submitState === "disabled" ? (
                    <><LockIcon className="h-4 w-4" />{!proofResult ? "No Proof to Submit" : "Connect Wallet"}</>
                  ) : (
                    <><LedgerIcon className="h-4 w-4" />Record Compliance Attestation</>
                  )}
                </button>

                {/* Error */}
                {localError && (
                  <div className="flex items-start gap-2 rounded-lg border border-rose-500/20 bg-rose-500/5 px-3.5 py-3">
                    <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
                    <p className="break-all text-[11px] text-rose-400">{localError}</p>
                  </div>
                )}

                {/* Confirmed receipt */}
                {(localConfirmed || isConfirmed) && submission && (
                  <div className="rounded-lg border border-[#22c55e]/20 bg-[#22c55e]/5 p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <div className="flex h-5 w-5 items-center justify-center rounded border border-[#22c55e]/20 bg-[#22c55e]/10">
                        <CheckIcon className="h-3 w-3 text-[#22c55e]" />
                      </div>
                      <span className="text-[12px] font-semibold text-[#4ade80]">On-chain confirmed</span>
                      {explorerHref && (
                        <a href={explorerHref} target="_blank" rel="noopener noreferrer"
                          className="ml-auto flex items-center gap-1 text-[10px] text-[#646464] underline underline-offset-2 transition-colors hover:text-[#a0a0a0] focus-visible:outline-none"
                        >
                          <ExternalIcon className="h-2.5 w-2.5" />View on Explorer
                        </a>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <DataRow label="Transaction Hash" value={formatHash(submission.txHash, 12, 8)} fullValue={submission.txHash} copyKey="txhash" copied={copied} onCopy={copy} accent />
                      <div className="grid grid-cols-2 gap-1.5">
                        <div className="rounded-lg border border-[#1e1e1e] bg-[#0d0d0d] px-3.5 py-2.5">
                          <p className="font-mono text-[9px] uppercase tracking-widest text-[#3e3e3e]">Block</p>
                          <p className="mt-0.5 font-mono text-[11px] text-[#a0a0a0]">#{submission.blockNumber.toString()}</p>
                        </div>
                        <div className="rounded-lg border border-[#1e1e1e] bg-[#0d0d0d] px-3.5 py-2.5">
                          <p className="font-mono text-[9px] uppercase tracking-widest text-[#3e3e3e]">Confirmed</p>
                          <p className="mt-0.5 font-mono text-[11px] text-[#a0a0a0]">{formatDate(submission.confirmedAt)}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* What this does */}
          <Card icon={<InfoIcon />} title="What this does">
            <ol className="space-y-2.5">
              {[
                "Calls assertCompliant() on the ComplianceGate contract with your proof bytes, public inputs, and nullifier.",
                "The contract verifies the UltraHonk proof against the Verifier contract on-chain — no trust in this frontend.",
                "If valid, records the nullifier as consumed and emits a ProofVerified event with the validity expiry timestamp.",
                "The nullifier prevents replay — you'll need a new proof after the validity window expires.",
              ].map((text, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-[#1e1e1e] bg-[#0d0d0d] font-mono text-[9px] font-bold text-[#3e3e3e]">
                    {i + 1}
                  </span>
                  <span className="text-[11px] leading-relaxed text-[#646464]">{text}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        {/* ── Right: attached proof panel ───────────────────────── */}
        <div className="flex flex-col gap-3">

          {/* Proof panel */}
          <div className="rounded-xl border border-[#1e1e1e] bg-[#141414]">
            <div className="flex items-center gap-2 border-b border-[#1e1e1e] px-4 py-3">
              <ShieldIcon className="h-3.5 w-3.5 text-[#646464]" />
              <span className="font-mono text-[11px] uppercase tracking-widest text-[#646464]">Attached Proof</span>
            </div>

            <div className="p-4">
              {!proofResult ? (
                <div className="flex flex-col items-center gap-3 py-6 text-center">
                  <ValidityBadge state="none" />
                  <p className="text-[11px] text-[#646464]">No proof attached</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Big validity badge */}
                  <ValidityBadge state={proofBadge} />

                  {/* Validity countdown */}
                  {proofBadge === "valid" && (
                    <ValidityCountdown generatedAt={proofResult.generatedAt} />
                  )}

                  {/* Proof fields */}
                  <div className="space-y-1.5">
                    <DataRow
                      label="Proof Hash"
                      value={formatHash(proofResult.proof, 8, 6)}
                      fullValue={proofResult.proof}
                      copyKey="proof-hex"
                      copied={copied}
                      onCopy={copy}
                    />
                    <DataRow
                      label="Nullifier"
                      value={formatHash(proofResult.nullifier, 10, 8)}
                      fullValue={proofResult.nullifier}
                      copyKey="null-r"
                      copied={copied}
                      onCopy={copy}
                      accent
                    />
                    <DataRow
                      label="Root Used"
                      value={formatHash(proofResult.rootUsed, 10, 8)}
                      fullValue={proofResult.rootUsed}
                      copyKey="root-r"
                      copied={copied}
                      onCopy={copy}
                    />
                  </div>

                  {/* Proof metadata */}
                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="rounded-lg border border-[#1e1e1e] bg-[#0d0d0d] px-3 py-2.5">
                      <p className="font-mono text-[9px] uppercase tracking-widest text-[#3e3e3e]">Generated</p>
                      <p className="mt-0.5 font-mono text-[10px] text-[#a0a0a0]">{formatDate(proofResult.generatedAt)}</p>
                    </div>
                    <div className="rounded-lg border border-[#1e1e1e] bg-[#0d0d0d] px-3 py-2.5">
                      <p className="font-mono text-[9px] uppercase tracking-widest text-[#3e3e3e]">Proved in</p>
                      <p className="mt-0.5 font-mono text-[10px] text-[#a0a0a0]">{elapsedLabel ?? "—"}</p>
                    </div>
                    <div className="rounded-lg border border-[#1e1e1e] bg-[#0d0d0d] px-3 py-2.5">
                      <p className="font-mono text-[9px] uppercase tracking-widest text-[#3e3e3e]">Bytes</p>
                      <p className="mt-0.5 font-mono text-[10px] text-[#a0a0a0]">
                        {Math.ceil((proofResult.proof.length - 2) / 2).toLocaleString()}
                      </p>
                    </div>
                    <div className="rounded-lg border border-[#1e1e1e] bg-[#0d0d0d] px-3 py-2.5">
                      <p className="font-mono text-[9px] uppercase tracking-widest text-[#3e3e3e]">Inputs</p>
                      <p className="mt-0.5 font-mono text-[10px] text-[#a0a0a0]">
                        {proofResult.publicInputs.length} field{proofResult.publicInputs.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Nullifier state (on-chain) */}
          <Card
            icon={<PulseIcon />}
            title="Nullifier State"
            badge={
              proofResult ? (
                <span className="font-mono text-[10px] text-[#3e3e3e]">
                  {formatHash(proofResult.nullifier, 5, 4)}
                </span>
              ) : undefined
            }
          >
            {proofResult ? (
              <NullifierStatus nullifier={proofResult.nullifier} />
            ) : (
              <p className="text-center text-[11px] text-[#646464]">No nullifier — generate a proof first.</p>
            )}
          </Card>

          {/* Contract addresses */}
          <Card
            icon={<ContractIcon />}
            title="Contracts"
            badge={<span className="text-[10px] text-[#3e3e3e]">{SUPPORTED_CHAIN_NAME}</span>}
          >
            <div className="space-y-1.5">
              {[
                { label: "ComplianceGate", addr: COMPLIANCE_GATE_ADDRESS, key: "cg" },
                { label: "SanctionsList",  addr: SANCTIONS_LIST_ADDRESS,  key: "sl" },
              ].map(({ label, addr, key }) => (
                <DataRow
                  key={key}
                  label={label}
                  value={formatHash(addr, 10, 8)}
                  fullValue={addr}
                  copyKey={key}
                  copied={copied}
                  onCopy={copy}
                />
              ))}
            </div>
          </Card>

          {/* Navigation */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => navigate("/app/proof/ready")}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-[#1e1e1e] py-2.5 text-[11px] font-medium text-[#646464] transition-colors hover:border-[#262626] hover:text-[#a0a0a0] focus-visible:outline-none"
            >
              <ShieldSmIcon className="h-3 w-3" />Proof Ready
            </button>
            <button
              onClick={() => navigate("/app/dashboard")}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-[#1e1e1e] py-2.5 text-[11px] font-medium text-[#646464] transition-colors hover:border-[#262626] hover:text-[#a0a0a0] focus-visible:outline-none"
            >
              <HomeIcon className="h-3 w-3" />Dashboard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Ledger;

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function CheckIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 12 12" className={className ?? "h-3.5 w-3.5"} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 6l2.5 2.5L10 3.5" /></svg>;
}
function AlertIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 14 14" className={className ?? "h-3.5 w-3.5"} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 1.5L1.5 11.5h11L7 1.5z" /><path d="M7 6v3M7 10.5v.5" /></svg>;
}
function InfoIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 14 14" className={className ?? "h-3.5 w-3.5"} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="7" cy="7" r="5.5" /><path d="M7 9.5V7M7 4.5v.5" /></svg>;
}
function LedgerIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 14 14" className={className ?? "h-3.5 w-3.5"} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="2" width="10" height="10" rx="1.5" /><path d="M5 5h4M5 7h4M5 9h2" /></svg>;
}
function LockIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 14 14" className={className ?? "h-3.5 w-3.5"} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3.5" y="6.5" width="7" height="5.5" rx="1" /><path d="M5 6.5v-2a2 2 0 1 1 4 0v2" /></svg>;
}
function ClockIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 14 14" className={className ?? "h-3.5 w-3.5"} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="7" cy="7" r="5.5" /><path d="M7 4.5V7l2 1.5" /></svg>;
}
function RefreshIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 12 12" className={className ?? "h-3 w-3"} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 6A4 4 0 1 1 6 2" /><path d="M6 2l2-2M6 2l2 2" /></svg>;
}
function PulseIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 14 14" className={className ?? "h-3.5 w-3.5"} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 7h2l2-4 2 8 2-5 1.5 3H13" /></svg>;
}
function ContractIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 14 14" className={className ?? "h-3.5 w-3.5"} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 2h6l2 2v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" /><path d="M8 2v3h3M5 7h4M5 9h3" /></svg>;
}
function ShieldIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 14 14" className={className ?? "h-3.5 w-3.5"} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 1.5L2 4v3.5C2 10.5 4 12 7 13c3-1 5-2.5 5-5.5V4L7 1.5z" /></svg>;
}
function ShieldOffIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 14 14" className={className ?? "h-3.5 w-3.5"} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 1.5L2 4v4c0 3 2 5 5 5.5" /><path d="M12 6V4L9.5 2.8M2 2l10 10" /></svg>;
}
function ShieldSmIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 12 12" className={className ?? "h-3 w-3"} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 1L2 3v3.5C2 9.5 4 11 6 11.5 10 11 10 8.5 10 6.5V3L6 1z" /></svg>;
}
function ArrowRightIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 12 12" className={className ?? "h-3.5 w-3.5"} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 6h8M7 3l3 3-3 3" /></svg>;
}
function HomeIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 14 14" className={className ?? "h-3.5 w-3.5"} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 6.5L7 2l5 4.5M3.5 5.5V12h7V5.5M5.5 12V8.5h3V12" /></svg>;
}
function ExternalIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 12 12" className={className ?? "h-3 w-3"} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 2H2v8h8V7M7 2h3v3M6 6l4-4" /></svg>;
}
