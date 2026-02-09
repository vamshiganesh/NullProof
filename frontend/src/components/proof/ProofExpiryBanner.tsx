// frontend/src/components/proof/ProofExpiryBanner.tsx

import React, { useState } from "react";

import { useProofStore, selectProofResult } from "@/store/proofStore";
import { useSanctionsRoot }                 from "@/hooks/useSanctionsRoot";
import { formatHash }                       from "@/lib/format";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProofExpiryBannerProps {
  /** Called when the user clicks "Regenerate Proof". */
  onRegenerate: () => void;
  className?:   string;
}

// ---------------------------------------------------------------------------
// Copy button (inline — no shared dep needed for this file)
// ---------------------------------------------------------------------------

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function handle() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* silent */ }
  }

  return (
    <button
      onClick={handle}
      aria-label={copied ? "Copied" : "Copy full hash"}
      className={[
        "rounded p-0.5 transition-colors",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500",
        copied
          ? "text-emerald-400"
          : "text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800",
      ].join(" ")}
    >
      {copied ? (
        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 6l2.5 2.5L10 3.5" />
        </svg>
      ) : (
        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="4" y="4" width="6.5" height="7" rx="1" />
          <path d="M8 4V3a1 1 0 0 0-1-1H2a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h1" />
        </svg>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Root hash pill — truncated + copy
// ---------------------------------------------------------------------------

function RootPill({
  label,
  value,
  dimmed = false,
}: {
  label:   string;
  value:   string;
  dimmed?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-medium uppercase tracking-widest text-zinc-600">
        {label}
      </span>
      <div
        className={[
          "inline-flex items-center gap-1 rounded-lg border px-2 py-1",
          dimmed
            ? "border-zinc-800 bg-zinc-900"
            : "border-amber-500/25 bg-amber-500/8",
        ].join(" ")}
      >
        <span
          className={[
            "font-mono text-[11px]",
            dimmed ? "text-zinc-600 line-through" : "text-amber-300",
          ].join(" ")}
        >
          {formatHash(value, 10, 8)}
        </span>
        <CopyButton value={value} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Arrow between roots
// ---------------------------------------------------------------------------

function Arrow() {
  return (
    <div className="flex items-end pb-1" aria-hidden="true">
      <svg
        viewBox="0 0 20 12"
        className="h-3 w-5 text-zinc-600"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M1 6h15" />
        <path d="M12 2l4 4-4 4" />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProofExpiryBanner
// ---------------------------------------------------------------------------

export function ProofExpiryBanner({
  onRegenerate,
  className = "",
}: ProofExpiryBannerProps) {
  const result                    = useProofStore(selectProofResult);
  const { currentRoot, isLoading } = useSanctionsRoot();

  const [dismissed, setDismissed] = useState(false);

  // ── Conditions to show ───────────────────────────────────────────────────

  // Need a proof result with a root to compare against
  if (!result) return null;

  // Root data not yet available
  if (isLoading || !currentRoot) return null;

  // Roots match — proof is still valid against current root
  const rootChanged =
    result.rootUsed.toLowerCase() !== currentRoot.toLowerCase();

  if (!rootChanged) return null;

  // User dismissed this warning
  if (dismissed) return null;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={[
        "relative rounded-2xl border border-amber-500/30 bg-zinc-950 overflow-hidden",
        className,
      ].join(" ")}
    >
      {/* Top accent stripe */}
      <div className="h-0.5 w-full bg-gradient-to-r from-amber-500/60 via-amber-400/80 to-amber-500/60" aria-hidden="true" />

      {/* Main content */}
      <div className="px-5 py-4">

        {/* Header row */}
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            {/* Warning icon */}
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10">
              <svg
                viewBox="0 0 20 20"
                className="h-4 w-4 text-amber-400"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M10 2L2 17h16L10 2z" />
                <line x1="10" y1="8.5" x2="10" y2="12" />
                <circle cx="10" cy="14.5" r="0.6" fill="currentColor" strokeWidth="0" />
              </svg>
            </div>

            <div>
              <p className="text-sm font-semibold text-amber-400 leading-tight">
                Sanctions Root Changed
              </p>
              <p className="text-xs text-zinc-500 leading-tight mt-0.5">
                Your proof is no longer valid for on-chain submission.
              </p>
            </div>
          </div>

          {/* Dismiss */}
          <button
            onClick={() => setDismissed(true)}
            aria-label="Dismiss warning"
            className={[
              "shrink-0 rounded-lg p-1 text-zinc-600",
              "hover:bg-zinc-800 hover:text-zinc-400",
              "transition-colors focus-visible:outline-none",
              "focus-visible:ring-1 focus-visible:ring-zinc-500",
            ].join(" ")}
          >
            <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <line x1="3" y1="3" x2="11" y2="11" />
              <line x1="11" y1="3" x2="3" y2="11" />
            </svg>
          </button>
        </div>

        {/* Root diff — previous → current */}
        <div className="mb-4 flex flex-wrap items-end gap-2">
          <RootPill
            label="Proof Root"
            value={result.rootUsed}
            dimmed
          />
          <Arrow />
          <RootPill
            label="Current Root"
            value={currentRoot}
          />
        </div>

        {/* Explanation */}
        <p className="mb-4 text-xs leading-relaxed text-zinc-500">
          The sanctions list Merkle root on-chain has been updated since your
          proof was generated. The contract will reject proofs built against
          the old root. You must regenerate a fresh proof using the current
          root before submitting.
        </p>

        {/* CTA */}
        <button
          onClick={onRegenerate}
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

export default ProofExpiryBanner;