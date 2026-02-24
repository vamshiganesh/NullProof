// frontend/src/pages/ProofReady.tsx
//
// Route: /app/proof/ready
//
// Centered single-column layout:
//   • Animated shield hero (ready / submitting / confirmed)
//   • Expiry banner — 24h countdown or root-staleness warning
//   • Proof data card — nullifier, merkle root, public inputs, proof bytes
//   • Action bar — "Submit Proof On-Chain" (primary) + "Copy Proof Hex" (outline)
//   • Confirmed receipt — tx hash, block, etherscan link

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";

import {
  useProofStore,
  selectProofStatus,
  selectProofResult,
  selectSubmission,
  selectElapsedLabel,
  selectReadyToSubmit,
  selectIsConfirmed,
} from "@/store/proofStore";
import { useWalletStore, selectAddress } from "@/store/walletStore";
import { useSanctionsStore, selectCurrentRoot } from "@/store/sanctionsStore";
import { formatHash }         from "@/lib/format";
import {
  DEFAULT_VALIDITY_WINDOW_SECONDS,
  SUPPORTED_CHAIN_NAME,
  BLOCK_EXPLORER_URL,
  COMPLIANCE_GATE_ADDRESS,
} from "@/lib/constants";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function useCopy(ms = 1800) {
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

function timeAgo(unixMs: number): string {
  const s = Math.floor((Date.now() - unixMs) / 1000);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function formatTimestamp(unixMs: number): string {
  return new Date(unixMs).toLocaleString(undefined, {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Expiry countdown hook
// ---------------------------------------------------------------------------

function useExpiryCountdown(generatedAt: number | null) {
  const [secsLeft, setSecsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!generatedAt) { setSecsLeft(null); return; }
    const tick = () => {
      const elapsed = Math.floor((Date.now() - generatedAt) / 1000);
      const left    = Number(DEFAULT_VALIDITY_WINDOW_SECONDS) - elapsed;
      setSecsLeft(Math.max(0, left));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [generatedAt]);

  return secsLeft;
}

function formatExpiry(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

// ---------------------------------------------------------------------------
// Shield hero
// ---------------------------------------------------------------------------

type ShieldPhase = "ready" | "submitting" | "confirmed";

function ShieldHero({ phase }: { phase: ShieldPhase }) {
  return (
    <div className="relative flex h-28 w-28 items-center justify-center">
      {/* Pulse rings */}
      {phase !== "confirmed" && (
        <>
          <span className="absolute inset-0 animate-ping rounded-full border border-[#22c55e]/15" style={{ animationDuration: "2.6s" }} aria-hidden="true" />
          <span className="absolute inset-4 animate-ping rounded-full border border-[#22c55e]/10" style={{ animationDuration: "2.6s", animationDelay: "0.7s" }} aria-hidden="true" />
        </>
      )}
      {phase === "confirmed" && (
        <>
          <span className="absolute inset-0 animate-ping rounded-full border border-[#22c55e]/25" style={{ animationDuration: "2s" }} aria-hidden="true" />
          <span className="absolute -inset-4 animate-ping rounded-full border border-[#22c55e]/10" style={{ animationDuration: "2.4s", animationDelay: "0.4s" }} aria-hidden="true" />
        </>
      )}

      {/* Glow disc */}
      <div className={[
        "absolute inset-3 rounded-full blur-2xl transition-all duration-700",
        phase === "confirmed" ? "bg-[#22c55e]/20" : phase === "submitting" ? "bg-[#22c55e]/12 animate-pulse" : "bg-[#22c55e]/10",
      ].join(" ")} aria-hidden="true" />

      {/* Shield SVG */}
      <svg viewBox="0 0 56 64" width="54" height="62" fill="none" aria-label={phase === "confirmed" ? "Proof confirmed" : "Proof ready"} role="img">
        <defs>
          <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity={phase === "confirmed" ? "0.20" : "0.14"} />
            <stop offset="100%" stopColor="#16a34a" stopOpacity="0.05" />
          </linearGradient>
          <filter id="sf">
            <feGaussianBlur stdDeviation="1.5" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <path d="M28 2L4 12v18c0 16 12 28 24 32C52 58 52 46 52 30V12L28 2z"
          fill="url(#sg)" stroke={phase === "confirmed" ? "#4ade80" : "#22c55e"}
          strokeWidth="1.3" filter="url(#sf)" />

        {phase === "confirmed" && (
          <path d="M17 32l8 8 14-16" stroke="#4ade80" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" filter="url(#sf)" />
        )}
        {phase === "submitting" && (
          <circle cx="28" cy="31" r="8" stroke="#22c55e" strokeWidth="1.5"
            strokeDasharray="20 32" strokeLinecap="round"
            className="animate-spin" style={{ transformOrigin: "28px 31px" }} />
        )}
        {phase === "ready" && (
          <g>
            <rect x="20" y="29" width="16" height="12" rx="2" stroke="#22c55e" strokeWidth="1.4" fill="none" />
            <path d="M22 29v-3a6 6 0 1 1 12 0v3" stroke="#22c55e" strokeWidth="1.4" strokeLinecap="round" />
            <circle cx="28" cy="35" r="1.5" fill="#22c55e" />
          </g>
        )}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Expiry / staleness banner
// ---------------------------------------------------------------------------

function ExpiryBanner({
  secsLeft,
  rootMismatch,
  onRegenerate,
}: {
  secsLeft:     number | null;
  rootMismatch: boolean;
  onRegenerate: () => void;
}) {
  if (rootMismatch) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/6 px-4 py-3">
        <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-amber-300">Sanctions root has changed</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-amber-600/80">
            The on-chain root no longer matches the root used for this proof. Regenerate before submitting.
          </p>
        </div>
        <button onClick={onRegenerate} className="shrink-0 rounded-lg border border-amber-500/20 bg-amber-500/8 px-3 py-1.5 text-[11px] font-semibold text-amber-400 transition-colors hover:bg-amber-500/14 focus-visible:outline-none">
          Regenerate
        </button>
      </div>
    );
  }

  if (secsLeft === null) return null;

  const pct = Math.round((secsLeft / Number(DEFAULT_VALIDITY_WINDOW_SECONDS)) * 100);
  const isUrgent = secsLeft < 3600;

  return (
    <div className={["rounded-xl border px-4 py-3", isUrgent ? "border-amber-500/20 bg-amber-500/6" : "border-[#1e1e1e] bg-[#141414]"].join(" ")}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ClockIcon className={["h-3.5 w-3.5", isUrgent ? "text-amber-400" : "text-[#646464]"].join(" ")} />
          <span className={["text-[12px] font-semibold", isUrgent ? "text-amber-300" : "text-[#a0a0a0]"].join(" ")}>
            Proof expires in
          </span>
          <span className={["font-mono text-[13px] font-bold tabular-nums", isUrgent ? "text-amber-300" : "text-white"].join(" ")}>
            {secsLeft > 0 ? formatExpiry(secsLeft) : "Expired"}
          </span>
        </div>
        <span className={["font-mono text-[11px]", isUrgent ? "text-amber-500" : "text-[#646464]"].join(" ")}>
          {pct}%
        </span>
      </div>
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[#1a1a1a]">
        <div
          className={["h-full rounded-full transition-[width] duration-1000", isUrgent ? "bg-amber-500" : "bg-[#22c55e]"].join(" ")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Proof data card
// ---------------------------------------------------------------------------

function CopyBtn({ value, label, copied, onCopy }: {
  value: string; label: string; copied: string | null; onCopy: (v: string, k: string) => void;
}) {
  const isCopied = copied === label;
  return (
    <button
      onClick={() => onCopy(value, label)}
      aria-label={isCopied ? "Copied" : `Copy ${label}`}
      className={[
        "shrink-0 rounded border px-2 py-1 text-[9px] font-semibold uppercase tracking-wider transition-all duration-200 focus-visible:outline-none",
        isCopied
          ? "border-[#22c55e]/20 bg-[#22c55e]/8 text-[#22c55e]"
          : "border-[#262626] bg-[#1a1a1a] text-[#646464] hover:border-[#3e3e3e] hover:text-[#a0a0a0]",
      ].join(" ")}
    >
      {isCopied ? "✓ Copied" : "Copy"}
    </button>
  );
}

function DataField({ label, value, fullValue, copyKey, accent = false, copied, onCopy }: {
  label: string; value: string; fullValue: string; copyKey: string;
  accent?: boolean; copied: string | null; onCopy: (v: string, k: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-[#1e1e1e] bg-[#0d0d0d] px-3.5 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="mb-0.5 font-mono text-[9px] uppercase tracking-widest text-[#3e3e3e]">{label}</p>
        <p className={["truncate font-mono text-[11px]", accent ? "text-[#4ade80]" : "text-[#a0a0a0]"].join(" ")}>
          {value}
        </p>
      </div>
      <CopyBtn value={fullValue} label={copyKey} copied={copied} onCopy={onCopy} />
    </div>
  );
}

function ProofDataCard({
  proof, publicInputs, nullifier, rootUsed, generatedAt, elapsedLabel,
}: {
  proof: string; publicInputs: string[]; nullifier: string;
  rootUsed: string; generatedAt: number; elapsedLabel: string | null;
}) {
  const { copied, copy } = useCopy();
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-[#1e1e1e] bg-[#141414]">
      <div className="flex items-center justify-between border-b border-[#1e1e1e] px-4 py-3">
        <div className="flex items-center gap-2">
          <DataIcon />
          <span className="font-mono text-[11px] uppercase tracking-widest text-[#646464]">Proof Data</span>
        </div>
        <div className="flex items-center gap-2.5">
          {elapsedLabel && (
            <span className="rounded border border-[#22c55e]/20 bg-[#22c55e]/8 px-2 py-0.5 font-mono text-[10px] text-[#22c55e]">
              {elapsedLabel}
            </span>
          )}
          <span className="text-[10px] text-[#3e3e3e]">{timeAgo(generatedAt)}</span>
        </div>
      </div>

      <div className="space-y-1.5 p-4">
        <DataField label="Nullifier"     value={formatHash(nullifier, 14, 10)} fullValue={nullifier} copyKey="nullifier" accent copied={copied} onCopy={copy} />
        <DataField label="Merkle Root"   value={formatHash(rootUsed, 14, 10)}  fullValue={rootUsed}  copyKey="root"     copied={copied} onCopy={copy} />
        {publicInputs.map((inp, i) => (
          <DataField key={i} label={`Public Input [${i}]`} value={formatHash(inp, 14, 10)} fullValue={inp} copyKey={`pi-${i}`} copied={copied} onCopy={copy} />
        ))}

        {/* Proof bytes row */}
        <div className="rounded-lg border border-[#1e1e1e] bg-[#0d0d0d] px-3.5 py-2.5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-widest text-[#3e3e3e]">Proof Bytes</p>
              <p className="mt-0.5 font-mono text-[11px] text-[#646464]">
                {Math.ceil((proof.length - 2) / 2).toLocaleString()} bytes
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <CopyBtn value={proof} label="proof" copied={copied} onCopy={copy} />
              <button
                onClick={() => setExpanded((v) => !v)}
                className="rounded border border-[#262626] bg-[#1a1a1a] px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-[#646464] transition-colors hover:border-[#3e3e3e] hover:text-[#a0a0a0] focus-visible:outline-none"
              >
                {expanded ? "Hide" : "Show"}
              </button>
            </div>
          </div>
          {expanded && (
            <div className="mt-2.5 max-h-24 overflow-y-auto rounded-lg border border-[#1a1a1a] bg-[#0a0a0a] p-2.5">
              <p className="break-all font-mono text-[9px] leading-relaxed text-[#3e3e3e]">{proof}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confirmed receipt (shown inside the same page after submission)
// ---------------------------------------------------------------------------

function ConfirmedReceipt({ txHash, blockNumber, confirmedAt }: {
  txHash: string; blockNumber: bigint; confirmedAt: number;
}) {
  const { copied, copy } = useCopy();
  const explorerUrl = BLOCK_EXPLORER_URL ? `${BLOCK_EXPLORER_URL}/tx/${txHash}` : null;

  return (
    <div className="rounded-xl border border-[#22c55e]/20 bg-[#22c55e]/5 p-5">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#22c55e]/20 bg-[#22c55e]/10">
          <CheckIcon className="h-3.5 w-3.5 text-[#22c55e]" />
        </div>
        <div>
          <p className="text-[14px] font-semibold text-[#4ade80]">On-chain Confirmed</p>
          <p className="text-[10px] text-[#646464]">{formatTimestamp(confirmedAt)} · {SUPPORTED_CHAIN_NAME}</p>
        </div>
        <span className="ml-auto flex items-center gap-1 rounded-full border border-[#22c55e]/20 bg-[#22c55e]/8 px-2.5 py-1 text-[10px] font-semibold text-[#22c55e]">
          <span className="h-1 w-1 animate-pulse rounded-full bg-[#22c55e]" aria-hidden="true" />
          Verified
        </span>
      </div>

      <div className="space-y-1.5">
        <DataField label="Transaction Hash" value={formatHash(txHash, 12, 8)} fullValue={txHash} copyKey="txHash" accent copied={copied} onCopy={copy} />
        <div className="grid grid-cols-2 gap-1.5">
          <div className="rounded-lg border border-[#1e1e1e] bg-[#0d0d0d] px-3.5 py-2.5">
            <p className="font-mono text-[9px] uppercase tracking-widest text-[#3e3e3e]">Block</p>
            <p className="mt-0.5 font-mono text-xs text-[#a0a0a0]">#{blockNumber.toString()}</p>
          </div>
          <div className="rounded-lg border border-[#1e1e1e] bg-[#0d0d0d] px-3.5 py-2.5">
            <p className="font-mono text-[9px] uppercase tracking-widest text-[#3e3e3e]">Confirmed</p>
            <p className="mt-0.5 font-mono text-xs text-[#a0a0a0]">{timeAgo(confirmedAt)}</p>
          </div>
        </div>

        {explorerUrl && (
          <a
            href={explorerUrl} target="_blank" rel="noopener noreferrer"
            className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg border border-[#262626] bg-[#1a1a1a] py-2.5 text-[12px] font-semibold text-[#a0a0a0] transition-colors hover:border-[#3e3e3e] hover:text-white focus-visible:outline-none"
          >
            <ExternalIcon className="h-3 w-3" />
            View on {SUPPORTED_CHAIN_NAME} Explorer
          </a>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProofReady page
// ---------------------------------------------------------------------------

export function ProofReady() {
  const navigate     = useNavigate();
  const address      = useWalletStore(selectAddress);
  const currentRoot  = useSanctionsStore(selectCurrentRoot);

  const status        = useProofStore(selectProofStatus);
  const result        = useProofStore(selectProofResult);
  const submission    = useProofStore(selectSubmission);
  const elapsedLabel  = useProofStore(selectElapsedLabel);
  const readyToSubmit = useProofStore(selectReadyToSubmit);
  const isConfirmed   = useProofStore(selectIsConfirmed);
  const { startSubmission, setConfirmed, setError, reset } = useProofStore();

  const phase: ShieldPhase = isConfirmed ? "confirmed" : status === "submitting" ? "submitting" : "ready";
  const rootMismatch = !!(result && currentRoot && result.rootUsed !== currentRoot);
  const secsLeft = useExpiryCountdown(result?.generatedAt ?? null);

  const { copied: globalCopied, copy: globalCopy } = useCopy();

  const [vis, setVis] = useState(false);
  useEffect(() => { const id = setTimeout(() => setVis(true), 40); return () => clearTimeout(id); }, []);

  const handleSubmit = useCallback(async () => {
    if (!result || !address) return;
    startSubmission();
    try {
      const { writeAssertCompliant, createDefaultPublicClient } = await import("@/lib/chain/contracts");
      const txHash = await writeAssertCompliant({
        proof: result.proof, publicInputs: result.publicInputs,
        nullifier: result.nullifier, account: address,
      });
      const publicClient = createDefaultPublicClient();
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      setConfirmed({ txHash, confirmedAt: Date.now(), blockNumber: receipt.blockNumber });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
    }
  }, [result, address, startSubmission, setConfirmed, setError]);

  // Guard: no proof
  if (!result && status !== "submitting" && status !== "confirmed") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-28 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#262626] bg-[#141414]">
          <AlertIcon className="h-5 w-5 text-[#646464]" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">No proof found</p>
          <p className="mt-1 text-xs text-[#646464]">Generate a proof first before viewing this screen.</p>
        </div>
        <button
          onClick={() => navigate("/app/proof/generate")}
          className="rounded-lg bg-[#22c55e] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#16a34a] focus-visible:outline-none"
        >
          Generate Proof
        </button>
      </div>
    );
  }

  return (
    <div className={["mx-auto flex max-w-2xl flex-col gap-5 px-5 py-8 pb-14 sm:px-8 transition-all duration-500", vis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"].join(" ")}>

      {/* ── Hero ──────────────────────────────────────────────────── */}
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <ShieldHero phase={phase} />

        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            {isConfirmed ? "Proof Confirmed On-Chain" : status === "submitting" ? "Submitting to Chain…" : "Privacy Proof Ready"}
          </h1>
          <p className="mt-1.5 text-[13px] text-[#646464]">
            {isConfirmed
              ? `Verified on ${SUPPORTED_CHAIN_NAME} · Non-membership proven`
              : status === "submitting"
              ? "Waiting for wallet confirmation and block inclusion"
              : "Your address is cryptographically proven non-sanctioned"}
          </p>
        </div>

        {/* Privacy badges */}
        <div className="flex flex-wrap justify-center gap-1.5">
          {[
            { label: "Zero-knowledge" },
            { label: "Non-sanctioned" },
            { label: "Address hidden" },
            { label: "Non-linkable" },
          ].map(({ label }) => (
            <span key={label} className="rounded-full border border-[#1e1e1e] bg-[#141414] px-2.5 py-1 text-[11px] text-[#646464]">
              {label}
            </span>
          ))}
          {elapsedLabel && (
            <span className="rounded-full border border-[#22c55e]/20 bg-[#22c55e]/8 px-2.5 py-1 font-mono text-[11px] text-[#22c55e]">
              Proved in {elapsedLabel}
            </span>
          )}
        </div>
      </div>

      {/* ── Expiry banner ─────────────────────────────────────────── */}
      {!isConfirmed && (
        <ExpiryBanner
          secsLeft={secsLeft}
          rootMismatch={rootMismatch}
          onRegenerate={() => { reset(); navigate("/app/proof/generate"); }}
        />
      )}

      {/* ── Proof data card ───────────────────────────────────────── */}
      {result && (
        <ProofDataCard
          proof={result.proof}
          publicInputs={result.publicInputs}
          nullifier={result.nullifier}
          rootUsed={result.rootUsed}
          generatedAt={result.generatedAt}
          elapsedLabel={elapsedLabel}
        />
      )}

      {/* ── Confirmed receipt ─────────────────────────────────────── */}
      {isConfirmed && submission && (
        <ConfirmedReceipt
          txHash={submission.txHash}
          blockNumber={submission.blockNumber}
          confirmedAt={submission.confirmedAt}
        />
      )}

      {/* ── Action buttons ────────────────────────────────────────── */}
      <div className="flex flex-col gap-2.5">
        {/* Contracts not deployed notice */}
        {!isConfirmed && !COMPLIANCE_GATE_ADDRESS && (
          <div className="flex items-start gap-3 rounded-xl border border-[#1e1e1e] bg-[#141414] px-4 py-3">
            <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-[#646464]" />
            <div>
              <p className="text-[12px] font-semibold text-[#a0a0a0]">On-chain submission not yet available</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-[#646464]">
                The ComplianceGate contract has not been deployed to Sepolia testnet. Your proof
                is cryptographically valid — submission will be enabled once contracts are live.
              </p>
            </div>
          </div>
        )}

        {!isConfirmed && (
          <button
            onClick={handleSubmit}
            disabled={!readyToSubmit || status === "submitting" || !COMPLIANCE_GATE_ADDRESS}
            className={[
              "relative flex w-full items-center justify-center gap-2.5 overflow-hidden rounded-xl py-3.5 text-[14px] font-semibold transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22c55e]/50",
              status === "submitting"
                ? "cursor-wait bg-[#22c55e]/10 text-[#22c55e] border border-[#22c55e]/20"
                : readyToSubmit && !rootMismatch && COMPLIANCE_GATE_ADDRESS
                ? "bg-[#22c55e] text-white hover:bg-[#16a34a]"
                : "cursor-not-allowed border border-[#1e1e1e] bg-[#141414] text-[#3e3e3e]",
            ].join(" ")}
          >
            {status === "submitting" && (
              <span className="pointer-events-none absolute inset-0 -translate-x-full animate-[shimmer_1.4s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent" aria-hidden="true" />
            )}
            {status === "submitting" ? (
              <><span className="h-4 w-4 animate-spin rounded-full border border-[#22c55e]/40 border-t-[#22c55e]" aria-hidden="true" />Awaiting Wallet Confirmation…</>
            ) : !COMPLIANCE_GATE_ADDRESS ? (
              <><ChainIcon className="h-4 w-4" />Submit Proof On-Chain (Contract not deployed)</>
            ) : (
              <><ChainIcon className="h-4 w-4" />Submit Proof On-Chain</>
            )}
          </button>
        )}

        {isConfirmed && (
          <div className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#22c55e]/20 bg-[#22c55e]/8 py-3.5 text-[14px] font-semibold text-[#22c55e]">
            <CheckIcon className="h-4 w-4" />
            Proof Confirmed On-Chain
          </div>
        )}

        {/* Secondary row */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => result && globalCopy(result.proof, "proofHex")}
            disabled={!result}
            className="flex items-center justify-center gap-2 rounded-xl border border-[#262626] bg-[#141414] py-2.5 text-[12px] font-semibold text-[#a0a0a0] transition-colors hover:border-[#3e3e3e] hover:text-white focus-visible:outline-none disabled:opacity-30"
          >
            {globalCopied === "proofHex" ? <><CheckIcon className="h-3.5 w-3.5 text-[#22c55e]" />Copied!</> : <><CopyIcon className="h-3.5 w-3.5" />Copy Proof Hex</>}
          </button>
          <button
            onClick={() => navigate("/app/dashboard")}
            className="flex items-center justify-center gap-2 rounded-xl border border-[#262626] bg-[#141414] py-2.5 text-[12px] font-semibold text-[#a0a0a0] transition-colors hover:border-[#3e3e3e] hover:text-white focus-visible:outline-none"
          >
            <HomeIcon className="h-3.5 w-3.5" />
            Dashboard
          </button>
        </div>

        {/* Tertiary */}
        <button
          onClick={() => { reset(); navigate("/app/proof/generate"); }}
          className="flex items-center justify-center gap-2 py-2 text-[12px] text-[#3e3e3e] transition-colors hover:text-[#646464] focus-visible:outline-none"
        >
          <RefreshIcon className="h-3 w-3" />
          Generate New Proof
        </button>
      </div>

      {/* Error */}
      {status === "error" && (
        <p className="text-center text-[12px] text-rose-400">
          {useProofStore.getState().error}
        </p>
      )}

      {/* "What this proves" footer */}
      <div className="rounded-xl border border-[#1e1e1e] bg-[#141414] p-4">
        <div className="mb-3 flex items-center gap-2">
          <InfoIcon className="h-3.5 w-3.5 text-[#646464]" />
          <span className="font-mono text-[11px] uppercase tracking-widest text-[#646464]">What This Proves</span>
        </div>
        <ul className="space-y-2">
          {[
            "Your address is a leaf in the Merkle tree of non-sanctioned addresses",
            "The Merkle root matches the on-chain snapshot at time of generation",
            "No third party learns which leaf or address corresponds to yours",
            "The nullifier prevents the same proof being submitted twice",
          ].map((text, i) => (
            <li key={i} className="flex items-start gap-2">
              <CheckIcon className="mt-0.5 h-3 w-3 shrink-0 text-[#22c55e]" />
              <span className="text-[11px] leading-relaxed text-[#646464]">{text}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default ProofReady;

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function CheckIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 12 12" className={className ?? "h-3.5 w-3.5"} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 6l2.5 2.5L10 3.5" /></svg>;
}
function DataIcon() {
  return <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><ellipse cx="7" cy="4" rx="5" ry="2" /><path d="M2 4v3c0 1.1 2.24 2 5 2s5-.9 5-2V4M2 7v3c0 1.1 2.24 2 5 2s5-.9 5-2V7" /></svg>;
}
function ChainIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 14 14" className={className ?? "h-3.5 w-3.5"} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5.5 8.5l3-3M8 6.5l1.5-1.5a2.12 2.12 0 0 1 3 3L11 9.5M6 7.5L4.5 9a2.12 2.12 0 0 1-3-3L3 4.5" /></svg>;
}
function ClockIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 14 14" className={className ?? "h-3.5 w-3.5"} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="7" cy="7" r="5.5" /><path d="M7 4.5V7l2 1.5" /></svg>;
}
function AlertIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 14 14" className={className ?? "h-3.5 w-3.5"} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 1.5L1.5 11.5h11L7 1.5z" /><path d="M7 6v3M7 10.5v.5" /></svg>;
}
function InfoIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 14 14" className={className ?? "h-3.5 w-3.5"} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="7" cy="7" r="5.5" /><path d="M7 9.5V7M7 4.5v.5" /></svg>;
}
function CopyIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 12 12" className={className ?? "h-3.5 w-3.5"} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1" /><path d="M1 8V2a1 1 0 0 1 1-1h6" /></svg>;
}
function ExternalIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 12 12" className={className ?? "h-3 w-3"} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 2H2v8h8V7M7 2h3v3M6 6l4-4" /></svg>;
}
function RefreshIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 12 12" className={className ?? "h-3 w-3"} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 6A4 4 0 1 1 6 2" /><path d="M6 2l2-2M6 2l2 2" /></svg>;
}
function HomeIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 14 14" className={className ?? "h-3.5 w-3.5"} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 6.5L7 2l5 4.5M3.5 5.5V12h7V5.5M5.5 12V8.5h3V12" /></svg>;
}
