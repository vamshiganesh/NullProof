// frontend/src/components/sanctions/SanctionsListCard.tsx
//
// Panel displaying the live sanctions protocol status:
// Merkle root, sanctioned address count, last update time,
// validity window, submission pause state, and a manual refresh action.

import React, { useCallback, useEffect, useRef, useState } from "react";

import {
  useSanctionsStore,
  selectCurrentRoot,
  selectAddressCount,
  selectLastUpdatedAt,
  selectValidityWindow,
  selectSubmissionPaused,
  selectSanctionsStatus,
  selectSanctionsError,
  selectLastFetchedAt,
  selectIsOperational,
  selectIsInitialLoading,
} from "@/store/sanctionsStore";
import {
  formatHash,
  formatNum,
  formatDuration,
  formatTimestamp,
  timeAgo,
} from "@/lib/format";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SanctionsListCardProps {
  className?: string;
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
      aria-label={copied ? "Copied" : "Copy to clipboard"}
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
          <rect x="3.5" y="3.5" width="6.5" height="7" rx="1" />
          <path d="M7.5 3.5V2.5a1 1 0 0 0-1-1H2a1 1 0 0 0-1 1v5.5a1 1 0 0 0 1 1H3" />
        </svg>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Skeleton row
// ---------------------------------------------------------------------------

function SkeletonRow() {
  return (
    <div className="flex items-center justify-between py-2.5">
      <div className="h-2.5 w-20 animate-pulse rounded bg-zinc-800" />
      <div className="h-2.5 w-32 animate-pulse rounded bg-zinc-800" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat row
// ---------------------------------------------------------------------------

interface StatRowProps {
  label:      string;
  tooltip?:   string;
  children:   React.ReactNode;
  divider?:   boolean;
}

function StatRow({ label, tooltip, children, divider = true }: StatRowProps) {
  return (
    <div className={[
      "flex items-center justify-between gap-4 py-2.5",
      divider ? "border-b border-zinc-800/60" : "",
    ].join(" ")}>
      <div className="flex shrink-0 items-center gap-1">
        <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-600 whitespace-nowrap">
          {label}
        </span>
        {tooltip && (
          <span
            title={tooltip}
            className="cursor-help text-zinc-700 hover:text-zinc-500 transition-colors"
            aria-label={tooltip}
          >
            <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="currentColor" aria-hidden="true">
              <circle cx="6" cy="6" r="5" opacity="0.3" />
              <text x="6" y="9" textAnchor="middle" fontSize="7" fontWeight="bold" fill="currentColor">?</text>
            </svg>
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1 flex justify-end">
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Refresh button with spin animation
// ---------------------------------------------------------------------------

function RefreshButton({
  onClick,
  loading,
}: {
  onClick: () => void;
  loading: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      aria-label="Refresh sanctions data"
      className={[
        "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium",
        "transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500",
        loading
          ? "cursor-not-allowed border-zinc-800 text-zinc-600"
          : "border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200",
      ].join(" ")}
    >
      <svg
        viewBox="0 0 14 14"
        className={`h-3 w-3 ${loading ? "animate-spin" : ""}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 7A5 5 0 1 1 7 2" />
        <path d="M7 2l2-2M7 2l2 2" />
      </svg>
      Refresh
    </button>
  );
}

// ---------------------------------------------------------------------------
// Address count with animated number tick
// ---------------------------------------------------------------------------

function AnimatedCount({ value }: { value: bigint }) {
  const [displayed, setDisplayed] = useState(value);
  const prevRef = useRef(value);

  useEffect(() => {
    if (value === prevRef.current) return;

    const start  = prevRef.current;
    const end    = value;
    const diff   = Number(end - start);
    if (Math.abs(diff) === 0) return;

    const steps    = 30;
    const stepSize = diff / steps;
    let   current  = 0;

    const interval = setInterval(() => {
      current++;
      setDisplayed(start + BigInt(Math.round(stepSize * current)));
      if (current >= steps) {
        clearInterval(interval);
        setDisplayed(end);
        prevRef.current = end;
      }
    }, 16);

    return () => clearInterval(interval);
  }, [value]);

  return (
    <span className="font-mono text-sm font-semibold tabular-nums text-zinc-200">
      {formatNum(displayed)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// SanctionsListCard
// ---------------------------------------------------------------------------

export function SanctionsListCard({ className = "" }: SanctionsListCardProps) {
  // ── Store selectors ──────────────────────────────────────────────────────
  const currentRoot      = useSanctionsStore(selectCurrentRoot);
  const addressCount     = useSanctionsStore(selectAddressCount);
  const lastUpdatedAt    = useSanctionsStore(selectLastUpdatedAt);
  const validityWindow   = useSanctionsStore(selectValidityWindow);
  const submissionPaused = useSanctionsStore(selectSubmissionPaused);
  const status           = useSanctionsStore(selectSanctionsStatus);
  const error            = useSanctionsStore(selectSanctionsError);
  const lastFetchedAt    = useSanctionsStore(selectLastFetchedAt);
  const isOperational    = useSanctionsStore(selectIsOperational);
  const isInitialLoading = useSanctionsStore(selectIsInitialLoading);

  const fetchAll = useSanctionsStore((s) => s.fetchAll);

  // ── Local state ──────────────────────────────────────────────────────────
  const isLoading = status === "loading";

  // Staleness: data older than 5 min
  const isStale =
    lastFetchedAt === null ||
    Date.now() - lastFetchedAt > 5 * 60 * 1000;

  // Auto-fetch on mount
  useEffect(() => {
    if (status === "idle" || (isStale && status !== "loading")) {
      void fetchAll();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = useCallback(() => {
    void fetchAll();
  }, [fetchAll]);

  // ── Derived display values ───────────────────────────────────────────────
  const rootShort = currentRoot ? formatHash(currentRoot, 10, 8) : null;

  const lastUpdatedDisplay = lastUpdatedAt
    ? timeAgo(lastUpdatedAt)
    : null;

  const lastUpdatedFull = lastUpdatedAt
    ? formatTimestamp(lastUpdatedAt)
    : null;

  const validityDisplay = validityWindow
    ? formatDuration(validityWindow)
    : null;

  const lastFetchedDisplay = lastFetchedAt
    ? timeAgo(lastFetchedAt / 1000)
    : null;

  // ── Status chip props ────────────────────────────────────────────────────
  const chipConfig = submissionPaused
    ? {
        dot:   "bg-rose-400",
        ring:  "border-rose-500/30 bg-rose-500/10",
        text:  "text-rose-400",
        label: "Paused",
      }
    : isOperational
    ? {
        dot:   "bg-emerald-400",
        ring:  "border-emerald-500/30 bg-emerald-500/10",
        text:  "text-emerald-400",
        label: "Operational",
      }
    : {
        dot:   "bg-zinc-500",
        ring:  "border-zinc-700 bg-zinc-800",
        text:  "text-zinc-400",
        label: status === "loading" ? "Loading…" : "Unknown",
      };

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
          {/* Shield icon */}
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
            <path d="M9 1.5 L15.5 4 V9 C15.5 12.5 12.5 15.5 9 16.5 C5.5 15.5 2.5 12.5 2.5 9 V4 Z" />
            <path d="M6 9l2 2 4-4" strokeWidth="1.8" />
          </svg>
          <span className="text-xs font-semibold tracking-wide text-zinc-300">
            Sanctions List
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Status chip */}
          <span
            className={[
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5",
              "text-[10px] font-medium",
              chipConfig.ring,
              chipConfig.text,
            ].join(" ")}
          >
            <span
              className={[
                "h-1.5 w-1.5 rounded-full",
                chipConfig.dot,
                isLoading ? "animate-pulse" : "",
              ].join(" ")}
              aria-hidden="true"
            />
            {chipConfig.label}
          </span>

          {/* Refresh */}
          <RefreshButton onClick={handleRefresh} loading={isLoading} />
        </div>
      </div>

      {/* ── Paused banner ────────────────────────────────────────────── */}
      {submissionPaused && (
        <div className="flex items-center gap-2 border-b border-rose-500/20 bg-rose-500/8 px-5 py-2">
          <svg viewBox="0 0 14 14" className="h-3.5 w-3.5 shrink-0 text-rose-400" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="7" cy="7" r="5.5" />
            <line x1="7" y1="4.5" x2="7" y2="7.5" />
            <circle cx="7" cy="9.5" r="0.5" fill="currentColor" strokeWidth="0" />
          </svg>
          <p className="text-[11px] text-rose-400">
            Proof submissions are currently paused by the protocol admin.
          </p>
        </div>
      )}

      {/* ── Error banner ─────────────────────────────────────────────── */}
      {status === "error" && error && (
        <div className="flex items-start gap-2 border-b border-amber-500/20 bg-amber-500/8 px-5 py-2.5">
          <svg viewBox="0 0 14 14" className="mt-px h-3.5 w-3.5 shrink-0 text-amber-400" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M7 1.5L1 12.5h12L7 1.5z" />
            <line x1="7" y1="6" x2="7" y2="9" />
            <circle cx="7" cy="11" r="0.5" fill="currentColor" strokeWidth="0" />
          </svg>
          <p className="text-[11px] leading-relaxed text-amber-400">{error}</p>
        </div>
      )}

      {/* ── Stats ────────────────────────────────────────────────────── */}
      <div className="px-5">
        {isInitialLoading ? (
          // Skeleton state
          <>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </>
        ) : (
          <>
            {/* Merkle Root */}
            <StatRow
              label="Merkle Root"
              tooltip="Keccak-256 root of the incremental Merkle tree of sanctioned addresses"
            >
              {currentRoot && rootShort ? (
                <div className="flex items-center gap-1">
                  <span className="font-mono text-[11px] text-teal-300">
                    {rootShort}
                  </span>
                  <CopyButton value={currentRoot} />
                </div>
              ) : (
                <span className="text-xs text-zinc-600">—</span>
              )}
            </StatRow>

            {/* Address Count */}
            <StatRow
              label="Addresses"
              tooltip="Total number of sanctioned addresses in the current Merkle tree"
            >
              {addressCount !== null ? (
                <AnimatedCount value={addressCount} />
              ) : (
                <span className="text-xs text-zinc-600">—</span>
              )}
            </StatRow>

            {/* Last Updated */}
            <StatRow
              label="Last Updated"
              tooltip="When the sanctions list Merkle root was last updated on-chain"
            >
              {lastUpdatedDisplay ? (
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-xs font-medium text-zinc-300">
                    {lastUpdatedDisplay}
                  </span>
                  {lastUpdatedFull && (
                    <span className="text-[10px] text-zinc-600">
                      {lastUpdatedFull}
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-xs text-zinc-600">—</span>
              )}
            </StatRow>

            {/* Validity Window */}
            <StatRow
              label="Validity Window"
              tooltip="How long a generated proof remains valid before the contract rejects it"
            >
              {validityDisplay ? (
                <span className="font-mono text-xs font-medium text-zinc-300">
                  {validityDisplay}
                </span>
              ) : (
                <span className="text-xs text-zinc-600">—</span>
              )}
            </StatRow>

            {/* Submission State */}
            <StatRow
              label="Submissions"
              divider={false}
            >
              <span
                className={[
                  "text-xs font-medium",
                  submissionPaused ? "text-rose-400" : "text-emerald-400",
                ].join(" ")}
              >
                {submissionPaused ? "Paused" : "Open"}
              </span>
            </StatRow>
          </>
        )}
      </div>

      {/* ── Footer — last fetched ─────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 border-t border-zinc-800/60 px-5 py-2">
        <span className="text-[10px] text-zinc-700">
          {lastFetchedDisplay
            ? `Fetched ${lastFetchedDisplay}`
            : "Not yet fetched"}
        </span>

        {isStale && !isLoading && (
          <span className="text-[10px] text-amber-600/80">
            Data may be stale
          </span>
        )}
      </div>
    </div>
  );
}

export default SanctionsListCard;