// frontend/src/components/proof/ProofDetailsTable.tsx

import React, { useState } from "react";

import {
  useProofStore,
  selectProofResult,
  selectElapsedLabel,
  selectSubmission,
} from "@/store/proofStore";
import {
  formatHash,
  formatNullifier,
  formatTimestamp,
  timeAgo,
} from "@/lib/format";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProofDetailsTableProps {
  className?: string;
}

// ---------------------------------------------------------------------------
// Copy button
// ---------------------------------------------------------------------------

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked — silent fail
    }
  }

  return (
    <button
      onClick={handleCopy}
      aria-label={copied ? "Copied!" : "Copy to clipboard"}
      className={[
        "ml-1.5 rounded p-0.5 transition-colors duration-150",
        "text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500",
        copied ? "text-emerald-400 hover:text-emerald-400" : "",
      ].join(" ")}
    >
      {copied ? (
        // Checkmark
        <svg viewBox="0 0 14 14" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2.5 7l3 3L11.5 4" />
        </svg>
      ) : (
        // Copy icon
        <svg viewBox="0 0 14 14" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="4.5" y="4.5" width="7" height="8" rx="1.2" />
          <path d="M9.5 4.5V3.5a1.2 1.2 0 0 0-1.2-1.2h-5A1.2 1.2 0 0 0 2 3.5v7c0 .66.54 1.2 1.2 1.2H4.5" />
        </svg>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Expandable full-value row
// ---------------------------------------------------------------------------

function ExpandableHash({
  short,
  full,
}: {
  short: string;
  full:  string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex min-w-0 items-start justify-end gap-1">
      <span
        className={[
          "font-mono text-xs text-zinc-300 break-all text-right transition-all duration-200",
          expanded ? "whitespace-normal" : "truncate max-w-[160px]",
        ].join(" ")}
      >
        {expanded ? full : short}
      </span>

      {/* Expand / collapse toggle */}
      <button
        onClick={() => setExpanded((e) => !e)}
        aria-label={expanded ? "Show less" : "Show full value"}
        className={[
          "shrink-0 rounded p-0.5 transition-colors duration-150",
          "text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500",
        ].join(" ")}
      >
        <svg
          viewBox="0 0 14 14"
          className={`h-3 w-3 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 5l4 4 4-4" />
        </svg>
      </button>

      <CopyButton value={full} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Validity countdown (live ticking)
// ---------------------------------------------------------------------------

function ValidUntilCell({ generatedAtMs }: { generatedAtMs: number }) {
  // ProofStore doesn't persist validUntil directly — we derive it from
  // generatedAt + the default 24 h window for display purposes.
  // The actual on-chain window is enforced by the contract.
  const VALIDITY_WINDOW_MS = 86_400 * 1000; // 24 h
  const validUntilMs       = generatedAtMs + VALIDITY_WINDOW_MS;
  const validUntilSec      = validUntilMs / 1000;
  const isExpired          = Date.now() > validUntilMs;

  return (
    <div className="flex flex-col items-end gap-0.5">
      <span
        className={[
          "text-xs font-medium",
          isExpired ? "text-rose-400" : "text-emerald-400",
        ].join(" ")}
      >
        {isExpired ? "Expired" : `~${timeAgo(validUntilSec - (Date.now() / 1000))} left`}
      </span>
      <span className="text-[11px] text-zinc-500">
        {formatTimestamp(validUntilSec)}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table row primitives
// ---------------------------------------------------------------------------

interface RowProps {
  label:    string;
  tooltip?: string;
  children: React.ReactNode;
}

function Row({ label, tooltip, children }: RowProps) {
  return (
    <tr className="group border-b border-zinc-800/60 last:border-0">
      {/* Label */}
      <td className="py-2.5 pr-4 align-top">
        <div className="flex items-center gap-1">
          <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-600 whitespace-nowrap">
            {label}
          </span>
          {tooltip && (
            <div className="relative">
              <svg
                viewBox="0 0 14 14"
                className="h-3 w-3 text-zinc-700 hover:text-zinc-400 cursor-help transition-colors"
                fill="currentColor"
                aria-label={tooltip}
                role="img"
              >
                <circle cx="7" cy="7" r="6" opacity="0.3" />
                <text x="7" y="10.5" textAnchor="middle" fontSize="8" fontWeight="bold" fill="currentColor">?</text>
              </svg>
            </div>
          )}
        </div>
      </td>

      {/* Value */}
      <td className="py-2.5 align-top text-right">
        {children}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// ProofDetailsTable
// ---------------------------------------------------------------------------

export function ProofDetailsTable({ className = "" }: ProofDetailsTableProps) {
  const result       = useProofStore(selectProofResult);
  const elapsedLabel = useProofStore(selectElapsedLabel);
  const submission   = useProofStore(selectSubmission);

  // Only render when a proof result exists
  if (!result) return null;

  return (
    <div
      className={[
        "rounded-2xl border border-zinc-800 bg-zinc-950 overflow-hidden",
        className,
      ].join(" ")}
    >
      {/* Card header */}
      <div className="flex items-center justify-between gap-2 border-b border-zinc-800 px-5 py-3">
        <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
          Proof Details
        </span>

        {/* Status chip */}
        {submission ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
            On-Chain
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[11px] font-medium text-violet-400">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-400" aria-hidden="true" />
            Ready
          </span>
        )}
      </div>

      {/* Table */}
      <div className="px-5">
        <table className="w-full" aria-label="Proof details">
          <tbody>

            {/* Proof Hash */}
            <Row
              label="Proof Hash"
              tooltip="Keccak-256 hash of the serialised UltraHonk proof bytes"
            >
              <ExpandableHash
                short={formatHash(result.proof, 10, 8)}
                full={result.proof}
              />
            </Row>

            {/* Nullifier */}
            <Row
              label="Nullifier"
              tooltip="Unique one-time token derived from your address + Merkle path — prevents double-submission"
            >
              <ExpandableHash
                short={formatNullifier(result.nullifier)}
                full={result.nullifier}
              />
            </Row>

            {/* Root Used */}
            <Row
              label="Root Used"
              tooltip="Sanctions list Merkle root at the time this proof was generated"
            >
              <ExpandableHash
                short={formatHash(result.rootUsed, 10, 8)}
                full={result.rootUsed}
              />
            </Row>

            {/* Valid Until */}
            <Row
              label="Valid Until"
              tooltip="Proofs expire 24 h after generation — the on-chain contract enforces this window"
            >
              <ValidUntilCell generatedAtMs={result.generatedAt} />
            </Row>

            {/* Generation Time */}
            <Row
              label="Gen Time"
              tooltip="Wall-clock time taken by the in-browser UltraHonk prover"
            >
              <div className="flex flex-col items-end gap-0.5">
                <span className="font-mono text-xs font-medium text-zinc-300">
                  {elapsedLabel ?? "—"}
                </span>
                <span className="text-[11px] text-zinc-500">
                  {formatTimestamp(result.generatedAt / 1000)}
                  <span className="ml-1 text-zinc-600">
                    · {timeAgo(result.generatedAt / 1000)}
                  </span>
                </span>
              </div>
            </Row>

            {/* Tx Hash (only when submitted) */}
            {submission && (
              <Row label="Tx Hash" tooltip="On-chain transaction that recorded this proof">
                <ExpandableHash
                  short={formatHash(submission.txHash, 8, 6)}
                  full={submission.txHash}
                />
              </Row>
            )}

          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ProofDetailsTable;