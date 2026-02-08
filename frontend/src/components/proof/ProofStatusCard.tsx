// frontend/src/components/proof/ProofStatusCard.tsx

import React, { useEffect, useRef, useState } from "react";

import {
  useProofStore,
  selectProofStatus,
  selectProofResult,
  selectElapsedLabel,
  selectSubmission,
} from "@/store/proofStore";
import { formatHash, formatTimestamp, timeAgo } from "@/lib/format";
import { txUrl } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProofStatusCardProps {
  /** Called when the user clicks "Generate Proof" in the idle/empty state. */
  onGenerate: () => void;
  /** Called when the user clicks "Submit Proof" in the generated state. */
  onSubmit:   () => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Shared icon primitives
// ---------------------------------------------------------------------------

function ShieldIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V7l-9-5z" />
    </svg>
  );
}

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

function ClockIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

function ExternalLinkIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 3H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V9" />
      <path d="M10 2h4v4" />
      <line x1="14" y1="2" x2="7" y2="9" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Elapsed counter — live ticks while generating
// ---------------------------------------------------------------------------

function ElapsedCounter({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  return (
    <span className="font-mono tabular-nums text-zinc-500 text-xs">
      {elapsed}s
    </span>
  );
}

// ---------------------------------------------------------------------------
// ── STATE: IDLE (no active proof)
// ---------------------------------------------------------------------------

function IdleCard({ onGenerate }: { onGenerate: () => void }) {
  return (
    <div
      role="region"
      aria-label="No active proof"
      className="flex flex-col items-center justify-center gap-5 rounded-2xl border border-dashed border-zinc-700 bg-zinc-950 px-8 py-14 text-center"
    >
      {/* Ghost shield */}
      <div className="flex h-16 w-16 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900">
        <ShieldIcon className="h-8 w-8 text-zinc-600" />
      </div>

      <div className="space-y-1">
        <p className="text-sm font-semibold text-zinc-300">No Active Proof</p>
        <p className="max-w-xs text-xs leading-relaxed text-zinc-500">
          Generate a ZK proof to verify your address is not on the sanctions
          list without revealing your identity.
        </p>
      </div>

      <button
        onClick={onGenerate}
        className={[
          "inline-flex items-center gap-2 rounded-xl",
          "bg-violet-600 px-5 py-2 text-sm font-medium text-white",
          "hover:bg-violet-500 active:bg-violet-700",
          "transition-colors duration-150",
          "focus-visible:outline-none focus-visible:ring-2",
          "focus-visible:ring-violet-500 focus-visible:ring-offset-2",
          "focus-visible:ring-offset-zinc-950",
        ].join(" ")}
      >
        <ShieldIcon className="h-4 w-4" />
        Generate Proof
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ── STATE: GENERATING (in-progress)
// ---------------------------------------------------------------------------

function GeneratingCard({ startedAt }: { startedAt: number | null }) {
  // Pulsing bars
  const bars = [3, 5, 4, 6, 3, 5];

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Generating proof…"
      className="flex flex-col items-center justify-center gap-6 rounded-2xl border border-zinc-800 bg-zinc-950 px-8 py-14 text-center"
    >
      {/* Animated waveform */}
      <div className="flex h-12 items-end gap-1" aria-hidden="true">
        {bars.map((h, i) => (
          <div
            key={i}
            style={{ animationDelay: `${i * 80}ms`, height: `${h * 4}px` }}
            className="w-1.5 animate-[proofPulse_1.1s_ease-in-out_infinite_alternate] rounded-full bg-violet-500"
          />
        ))}
      </div>

      <div className="space-y-1">
        <p className="text-sm font-semibold text-zinc-200">
          Generating Proof
          {startedAt && (
            <span className="ml-2 font-normal">
              — <ElapsedCounter startedAt={startedAt} />
            </span>
          )}
        </p>
        <p className="text-xs text-zinc-500">
          UltraHonk prover running in-browser. This may take 10–30 s.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ── STATE: GENERATED / VALID (proof ready, not yet submitted)
// ---------------------------------------------------------------------------

function ValidCard({
  result,
  elapsedLabel,
  onSubmit,
  isSubmitting,
}: {
  result:        NonNullable<ReturnType<typeof selectProofResult>>;
  elapsedLabel:  string | null;
  onSubmit:      () => void;
  isSubmitting:  boolean;
}) {
  return (
    <div
      role="region"
      aria-label="Proof ready"
      className="rounded-2xl border border-emerald-500/25 bg-zinc-950 overflow-hidden"
    >
      {/* Header band */}
      <div className="flex items-center justify-between gap-3 border-b border-emerald-500/20 bg-emerald-500/5 px-5 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500">
            <CheckIcon className="h-3 w-3 text-zinc-950" />
          </div>
          <span className="text-sm font-semibold text-emerald-400">
            Proof Valid
          </span>
        </div>

        {/* Generation time */}
        {elapsedLabel && (
          <span className="inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-0.5 font-mono text-xs text-zinc-400">
            <ClockIcon className="h-3 w-3" />
            {elapsedLabel}
          </span>
        )}
      </div>

      {/* Proof digest rows */}
      <div className="divide-y divide-zinc-800/60 px-5">
        <ProofRow label="Proof Hash">
          <span className="font-mono text-xs text-zinc-300">
            {formatHash(result.proof, 10, 8)}
          </span>
        </ProofRow>

        <ProofRow label="Nullifier">
          <span className="font-mono text-xs text-zinc-300">
            {formatHash(result.nullifier, 10, 8)}
          </span>
        </ProofRow>

        <ProofRow label="Root Used">
          <span className="font-mono text-xs text-zinc-300">
            {formatHash(result.rootUsed, 10, 8)}
          </span>
        </ProofRow>

        <ProofRow label="Generated">
          <span className="text-xs text-zinc-400">
            {timeAgo(result.generatedAt / 1000)}
            <span className="ml-1 text-zinc-600">
              · {formatTimestamp(result.generatedAt / 1000)}
            </span>
          </span>
        </ProofRow>
      </div>

      {/* Submit CTA */}
      <div className="border-t border-zinc-800 px-5 py-4">
        <button
          onClick={onSubmit}
          disabled={isSubmitting}
          className={[
            "w-full rounded-xl py-2.5 text-sm font-semibold",
            "bg-emerald-600 text-white",
            "hover:bg-emerald-500 active:bg-emerald-700",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "transition-colors duration-150",
            "focus-visible:outline-none focus-visible:ring-2",
            "focus-visible:ring-emerald-500 focus-visible:ring-offset-2",
            "focus-visible:ring-offset-zinc-950",
          ].join(" ")}
        >
          {isSubmitting ? "Submitting…" : "Submit Proof On-Chain"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ── STATE: CONFIRMED (submitted on-chain)
// ---------------------------------------------------------------------------

function ConfirmedCard({
  result,
  txHash,
  confirmedAt,
  elapsedLabel,
}: {
  result:       NonNullable<ReturnType<typeof selectProofResult>>;
  txHash:       string;
  confirmedAt:  number;
  elapsedLabel: string | null;
}) {
  return (
    <div
      role="region"
      aria-label="Proof confirmed on-chain"
      className="rounded-2xl border border-emerald-500/30 bg-zinc-950 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-emerald-500/20 bg-emerald-500/8 px-5 py-3">
        <div className="flex items-center gap-2">
          <ShieldIcon className="h-5 w-5 text-emerald-400" />
          <span className="text-sm font-semibold text-emerald-400">
            Confirmed On-Chain
          </span>
        </div>
        {elapsedLabel && (
          <span className="inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-0.5 font-mono text-xs text-zinc-400">
            <ClockIcon className="h-3 w-3" />
            {elapsedLabel}
          </span>
        )}
      </div>

      {/* Rows */}
      <div className="divide-y divide-zinc-800/60 px-5">
        <ProofRow label="Tx Hash">
          <a
            href={txUrl(txHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-mono text-xs text-violet-400 hover:text-violet-300 transition-colors"
          >
            {formatHash(txHash, 8, 6)}
            <ExternalLinkIcon className="h-3 w-3" />
          </a>
        </ProofRow>

        <ProofRow label="Nullifier">
          <span className="font-mono text-xs text-zinc-300">
            {formatHash(result.nullifier, 10, 8)}
          </span>
        </ProofRow>

        <ProofRow label="Root Used">
          <span className="font-mono text-xs text-zinc-300">
            {formatHash(result.rootUsed, 10, 8)}
          </span>
        </ProofRow>

        <ProofRow label="Confirmed">
          <span className="text-xs text-zinc-400">
            {timeAgo(confirmedAt / 1000)}
            <span className="ml-1 text-zinc-600">
              · {formatTimestamp(confirmedAt / 1000)}
            </span>
          </span>
        </ProofRow>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ── STATE: EXPIRED
// ---------------------------------------------------------------------------

function ExpiredCard({
  result,
  onGenerate,
}: {
  result:     NonNullable<ReturnType<typeof selectProofResult>>;
  onGenerate: () => void;
}) {
  return (
    <div
      role="region"
      aria-label="Proof expired"
      className="rounded-2xl border border-amber-500/25 bg-zinc-950 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-amber-500/20 bg-amber-500/5 px-5 py-3">
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-amber-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V7l-9-5z" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <circle cx="12" cy="15" r="0.5" fill="currentColor" />
        </svg>
        <span className="text-sm font-semibold text-amber-400">
          Proof Expired
        </span>
      </div>

      {/* Expired rows */}
      <div className="divide-y divide-zinc-800/60 px-5">
        <ProofRow label="Nullifier">
          <span className="font-mono text-xs text-zinc-500 line-through">
            {formatHash(result.nullifier, 10, 8)}
          </span>
        </ProofRow>

        <ProofRow label="Root Used">
          <span className="font-mono text-xs text-zinc-500 line-through">
            {formatHash(result.rootUsed, 10, 8)}
          </span>
        </ProofRow>

        <ProofRow label="Generated">
          <span className="text-xs text-zinc-500">
            {formatTimestamp(result.generatedAt / 1000)}
          </span>
        </ProofRow>
      </div>

      {/* Regenerate CTA */}
      <div className="border-t border-zinc-800 px-5 py-4">
        <p className="mb-3 text-xs leading-relaxed text-zinc-500">
          The Merkle root has changed since this proof was generated. A fresh
          proof is required to submit on-chain.
        </p>
        <button
          onClick={onGenerate}
          className={[
            "w-full rounded-xl py-2.5 text-sm font-semibold",
            "bg-amber-600 text-white",
            "hover:bg-amber-500 active:bg-amber-700",
            "transition-colors duration-150",
            "focus-visible:outline-none focus-visible:ring-2",
            "focus-visible:ring-amber-500 focus-visible:ring-offset-2",
            "focus-visible:ring-offset-zinc-950",
          ].join(" ")}
        >
          Regenerate Proof
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ── STATE: ERROR
// ---------------------------------------------------------------------------

function ErrorCard({
  message,
  onRetry,
}: {
  message:  string;
  onRetry:  () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-rose-500/25 bg-zinc-950 overflow-hidden"
    >
      <div className="flex items-center gap-2 border-b border-rose-500/20 bg-rose-500/5 px-5 py-3">
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-rose-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
        <span className="text-sm font-semibold text-rose-400">
          Proof Generation Failed
        </span>
      </div>

      <div className="px-5 py-4 space-y-4">
        <p className="rounded-lg border border-rose-500/15 bg-rose-500/5 px-3 py-2 font-mono text-xs text-rose-300 break-all">
          {message}
        </p>
        <button
          onClick={onRetry}
          className={[
            "w-full rounded-xl py-2.5 text-sm font-semibold",
            "bg-zinc-800 text-zinc-200",
            "hover:bg-zinc-700 active:bg-zinc-600",
            "transition-colors duration-150",
            "focus-visible:outline-none focus-visible:ring-2",
            "focus-visible:ring-zinc-500 focus-visible:ring-offset-2",
            "focus-visible:ring-offset-zinc-950",
          ].join(" ")}
        >
          Try Again
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared row layout helper
// ---------------------------------------------------------------------------

function ProofRow({
  label,
  children,
}: {
  label:    string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <span className="shrink-0 text-xs font-medium text-zinc-600 uppercase tracking-wide">
        {label}
      </span>
      <div className="min-w-0 text-right">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProofStatusCard — root component
// ---------------------------------------------------------------------------

export function ProofStatusCard({
  onGenerate,
  onSubmit,
  className = "",
}: ProofStatusCardProps) {
  const status      = useProofStore(selectProofStatus);
  const result      = useProofStore(selectProofResult);
  const elapsedLabel = useProofStore(selectElapsedLabel);
  const submission  = useProofStore(selectSubmission);
  const startedAt   = useProofStore((s) => s.startedAt);
  const error       = useProofStore((s) => s.error);

  return (
    <div className={className}>
      {/* ── Idle ─────────────────────────────────────────────────────── */}
      {status === "idle" && (
        <IdleCard onGenerate={onGenerate} />
      )}

      {/* ── Generating ───────────────────────────────────────────────── */}
      {status === "generating" && (
        <GeneratingCard startedAt={startedAt} />
      )}

      {/* ── Generated (valid, ready to submit) ───────────────────────── */}
      {status === "generated" && result && (
        <ValidCard
          result={result}
          elapsedLabel={elapsedLabel}
          onSubmit={onSubmit}
          isSubmitting={false}
        />
      )}

      {/* ── Submitting ───────────────────────────────────────────────── */}
      {status === "submitting" && result && (
        <ValidCard
          result={result}
          elapsedLabel={elapsedLabel}
          onSubmit={onSubmit}
          isSubmitting={true}
        />
      )}

      {/* ── Confirmed ────────────────────────────────────────────────── */}
      {status === "confirmed" && result && submission && (
        <ConfirmedCard
          result={result}
          txHash={submission.txHash}
          confirmedAt={submission.confirmedAt}
          elapsedLabel={elapsedLabel}
        />
      )}

      {/* ── Error ────────────────────────────────────────────────────── */}
      {status === "error" && (
        <ErrorCard
          message={error ?? "An unexpected error occurred."}
          onRetry={onGenerate}
        />
      )}
    </div>
  );
}

export default ProofStatusCard;