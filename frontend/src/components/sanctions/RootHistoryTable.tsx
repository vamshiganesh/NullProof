// frontend/src/components/sanctions/RootHistoryTable.tsx
//
// Timestamped table of sanctions list Merkle root changes.
// Rows are sorted newest-first. Each row shows:
//   • Index badge (most recent = #1)
//   • Truncated root hash + copy
//   • Absolute timestamp
//   • Relative time ago
//   • Δ time since previous root (gap between updates)
//   • "CURRENT" chip on the live root

import React, { useState } from "react";

import {
  useSanctionsStore,
  selectRootHistory,
  selectCurrentRoot,
  selectSanctionsStatus,
  selectIsInitialLoading,
} from "@/store/sanctionsStore";
import type { RootHistoryItem } from "@/store/sanctionsStore";
import { formatHash, formatTimestamp, timeAgo } from "@/lib/format";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RootHistoryTableProps {
  /** Max rows to display before showing a "Show more" toggle. Default: 5 */
  initialRows?: number;
  className?:   string;
}

// ---------------------------------------------------------------------------
// Delta formatting
// ---------------------------------------------------------------------------

/**
 * Returns a human-readable string for a seconds-duration delta.
 * e.g. 3723 → "+1h 2m", 45 → "+45s"
 */
function formatDelta(seconds: bigint): string {
  const s = Number(seconds);
  if (s < 0)    return "—";
  if (s < 60)   return `${s}s`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return r > 0 ? `${m}m ${r}s` : `${m}m`;
  }
  if (s < 86_400) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  return h > 0 ? `${d}d ${h}h` : `${d}d`;
}

// ---------------------------------------------------------------------------
// Copy button
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
      aria-label={copied ? "Copied" : "Copy root hash"}
      className={[
        "rounded p-0.5 transition-colors",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500",
        copied
          ? "text-emerald-400"
          : "text-zinc-700 hover:text-zinc-300 hover:bg-zinc-800",
      ].join(" ")}
    >
      {copied ? (
        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 6l2.5 2.5L10 3.5" />
        </svg>
      ) : (
        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3.5" y="3.5" width="6.5" height="7" rx="1" />
          <path d="M7.5 3.5V2.5a1 1 0 0 0-1-1H2a1 1 0 0 0-1 1v5.5a1 1 0 0 0 1 1H3" />
        </svg>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Skeleton rows
// ---------------------------------------------------------------------------

function SkeletonRows({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <tr key={i} className="border-b border-zinc-800/60 last:border-0">
          <td className="py-3 pl-5 pr-3">
            <div className="h-2.5 w-5 animate-pulse rounded bg-zinc-800" />
          </td>
          <td className="py-3 px-3">
            <div className="h-2.5 w-28 animate-pulse rounded bg-zinc-800" />
          </td>
          <td className="py-3 px-3">
            <div className="h-2.5 w-20 animate-pulse rounded bg-zinc-800" />
          </td>
          <td className="py-3 px-3">
            <div className="h-2.5 w-12 animate-pulse rounded bg-zinc-800" />
          </td>
          <td className="py-3 pl-3 pr-5">
            <div className="h-2.5 w-14 animate-pulse rounded bg-zinc-800" />
          </td>
        </tr>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Delta chip
// ---------------------------------------------------------------------------

function DeltaChip({ delta }: { delta: bigint | null }) {
  if (delta === null) {
    return <span className="text-[10px] text-zinc-700">—</span>;
  }

  // Classify: < 1h = frequent, 1-24h = normal, > 24h = rare
  const s = Number(delta);
  const colorClass =
    s < 3_600
      ? "text-amber-400 border-amber-500/20 bg-amber-500/8"
      : s < 86_400
      ? "text-teal-400 border-teal-500/20 bg-teal-500/8"
      : "text-zinc-500 border-zinc-700 bg-zinc-800/50";

  return (
    <span
      className={[
        "inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5",
        "font-mono text-[10px] font-medium tabular-nums",
        colorClass,
      ].join(" ")}
      title={`${s} seconds between updates`}
    >
      <span aria-hidden="true">+</span>
      {formatDelta(delta)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Enrich rows with computed delta
// ---------------------------------------------------------------------------

interface EnrichedRow {
  item:     RootHistoryItem;
  index:    number;      // 1-based, 1 = newest
  isCurrent: boolean;
  delta:    bigint | null; // seconds since previous (older) root
}

function enrichRows(
  history:     RootHistoryItem[],
  currentRoot: string | null,
): EnrichedRow[] {
  // history from store is oldest-first or newest-first — sort newest-first
  const sorted = [...history].sort((a, b) =>
    Number(b.timestamp - a.timestamp),
  );

  return sorted.map((item, i) => {
    const next = sorted[i + 1]; // next = one older
    const delta: bigint | null =
      next && item.timestamp > 0n && next.timestamp > 0n
        ? item.timestamp - next.timestamp
        : null;

    return {
      item,
      index:     i + 1,
      isCurrent: currentRoot
        ? item.root.toLowerCase() === currentRoot.toLowerCase()
        : false,
      delta,
    };
  });
}

// ---------------------------------------------------------------------------
// RootHistoryTable
// ---------------------------------------------------------------------------

export function RootHistoryTable({
  initialRows = 5,
  className   = "",
}: RootHistoryTableProps) {
  const rootHistory      = useSanctionsStore(selectRootHistory);
  const currentRoot      = useSanctionsStore(selectCurrentRoot);
  const status           = useSanctionsStore(selectSanctionsStatus);
  const isInitialLoading = useSanctionsStore(selectIsInitialLoading);

  const [expanded, setExpanded] = useState(false);

  // ── Enrich + slice ───────────────────────────────────────────────────────
  const rows     = enrichRows(rootHistory, currentRoot);
  const visible  = expanded ? rows : rows.slice(0, initialRows);
  const hasMore  = rows.length > initialRows;
  const isEmpty  = !isInitialLoading && rows.length === 0;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      className={[
        "rounded-2xl border border-zinc-800 bg-zinc-950 overflow-hidden",
        className,
      ].join(" ")}
    >
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-5 py-3">
        <div className="flex items-center gap-2">
          {/* Clock icon */}
          <svg
            viewBox="0 0 18 18"
            className="h-4 w-4 text-zinc-400"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="9" cy="9" r="7" />
            <polyline points="9,5 9,9 12,11" />
          </svg>
          <span className="text-xs font-semibold tracking-wide text-zinc-300">
            Root History
          </span>
        </div>

        {/* Row count badge */}
        {rows.length > 0 && (
          <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
            {rows.length} {rows.length === 1 ? "entry" : "entries"}
          </span>
        )}
      </div>

      {/* ── Table ─────────────────────────────────────────────────────── */}
      <div className="overflow-x-auto">
        <table className="w-full" aria-label="Root change history">

          {/* Column headers */}
          <thead>
            <tr className="border-b border-zinc-800/80">
              {[
                { label: "#",         title: "Recency index"                        },
                { label: "Root Hash", title: "Merkle root hash"                    },
                { label: "Timestamp", title: "When this root was written on-chain"  },
                { label: "Age",       title: "How long ago"                         },
                { label: "Δ Gap",     title: "Time elapsed since the previous root" },
              ].map(({ label, title }) => (
                <th
                  key={label}
                  title={title}
                  scope="col"
                  className="px-3 py-2 text-left first:pl-5 last:pr-5"
                >
                  <span className="text-[10px] font-medium uppercase tracking-widest text-zinc-600 cursor-help">
                    {label}
                  </span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {isInitialLoading ? (
              <SkeletonRows count={initialRows} />
            ) : isEmpty ? (
              /* ── Empty state ─────────────────────────────────────────── */
              <tr>
                <td colSpan={5} className="py-10 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <svg
                      viewBox="0 0 32 32"
                      className="h-7 w-7 text-zinc-800"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      aria-hidden="true"
                    >
                      <circle cx="16" cy="16" r="13" />
                      <polyline points="16,10 16,16 20,19" />
                    </svg>
                    <p className="text-xs text-zinc-600">No root history available</p>
                    <p className="text-[11px] text-zinc-700">
                      {status === "error"
                        ? "Failed to load — try refreshing."
                        : "Root history will appear once the sanctions list is updated."}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              /* ── Data rows ───────────────────────────────────────────── */
              visible.map((row) => (
                <tr
                  key={row.item.root}
                  className={[
                    "group border-b border-zinc-800/60 last:border-0",
                    "transition-colors duration-100",
                    row.isCurrent
                      ? "bg-teal-500/[0.04]"
                      : "hover:bg-zinc-900/60",
                  ].join(" ")}
                >
                  {/* Index */}
                  <td className="py-3 pl-5 pr-3 align-middle">
                    <span
                      className={[
                        "inline-flex h-5 w-5 items-center justify-center rounded-full",
                        "text-[10px] font-semibold tabular-nums",
                        row.isCurrent
                          ? "bg-teal-500/20 text-teal-400"
                          : "bg-zinc-800 text-zinc-600",
                      ].join(" ")}
                    >
                      {row.index}
                    </span>
                  </td>

                  {/* Root hash */}
                  <td className="py-3 px-3 align-middle">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={[
                          "font-mono text-[11px]",
                          row.isCurrent ? "text-teal-300" : "text-zinc-400",
                        ].join(" ")}
                      >
                        {formatHash(row.item.root, 8, 6)}
                      </span>
                      <CopyButton value={row.item.root} />
                      {row.isCurrent && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-teal-500/30 bg-teal-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-teal-400">
                          <span className="h-1 w-1 rounded-full bg-teal-400 animate-pulse" aria-hidden="true" />
                          Live
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Absolute timestamp */}
                  <td className="py-3 px-3 align-middle">
                    <span className="text-[11px] text-zinc-500 tabular-nums">
                      {row.item.timestamp > 0n
                        ? formatTimestamp(row.item.timestamp)
                        : "—"}
                    </span>
                  </td>

                  {/* Relative age */}
                  <td className="py-3 px-3 align-middle">
                    <span className="text-[11px] text-zinc-600 tabular-nums">
                      {row.item.timestamp > 0n
                        ? timeAgo(row.item.timestamp)
                        : "—"}
                    </span>
                  </td>

                  {/* Delta gap */}
                  <td className="py-3 pl-3 pr-5 align-middle">
                    <DeltaChip delta={row.delta} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Show more / collapse ──────────────────────────────────────── */}
      {hasMore && !isInitialLoading && (
        <div className="border-t border-zinc-800/60 px-5 py-2.5">
          <button
            onClick={() => setExpanded((e) => !e)}
            className={[
              "flex w-full items-center justify-center gap-1.5",
              "text-[11px] font-medium text-zinc-600",
              "hover:text-zinc-300 transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500",
              "rounded-lg py-1",
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
            {expanded
              ? "Show less"
              : `Show ${rows.length - initialRows} more ${rows.length - initialRows === 1 ? "entry" : "entries"}`}
          </button>
        </div>
      )}
    </div>
  );
}

export default RootHistoryTable;