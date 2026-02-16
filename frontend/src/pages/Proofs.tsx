// frontend/src/pages/Proofs.tsx
//
// Route: /app/proofs
// Shows a persistent proof history list sourced from:
//   1. The live proofStore (current session's confirmed proof)
//   2. localStorage key "nullproof:history" (all prior sessions)
//
// History entries are written to localStorage whenever proofStore transitions
// to "confirmed". The page merges both sources, deduplicates by txHash,
// and displays them newest-first.

import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
  } from "react";
  import { Link, useNavigate } from "react-router-dom";
  
  import {
    useProofStore,
    selectProofStatus,
    selectProofResult,
    selectSubmission,
    selectElapsedMs,
    type ProofResult,
    type SubmissionResult,
  } from "@/store/proofStore";
  import {
    formatHash,
    formatNullifier,
    formatTimestamp,
    timeAgo,
  } from "@/lib/format";
  import {
    DEFAULT_VALIDITY_WINDOW_SECONDS,
    txUrl,
  } from "@/lib/constants";
  
  // ---------------------------------------------------------------------------
  // Types
  // ---------------------------------------------------------------------------
  
  export interface ProofHistoryEntry {
    id:          string;          // txHash (dedup key)
    nullifier:   string;
    rootUsed:    string;
    publicInputs: string[];
    elapsedMs:   number | null;
    generatedAt: number;          // Unix ms
    txHash:      string;
    confirmedAt: number;          // Unix ms
    blockNumber: string;          // bigint → string for JSON serialisation
  }
  
  // ---------------------------------------------------------------------------
  // localStorage persistence
  // ---------------------------------------------------------------------------
  
  const STORAGE_KEY = "nullproof:history";
  
  function readHistory(): ProofHistoryEntry[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed as ProofHistoryEntry[];
    } catch {
      return [];
    }
  }
  
  function writeHistory(entries: ProofHistoryEntry[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch { /* quota exceeded — silent */ }
  }
  
  function appendEntry(entry: ProofHistoryEntry): void {
    const existing = readHistory();
    // Skip if already stored (same txHash)
    if (existing.some((e) => e.id === entry.id)) return;
    writeHistory([entry, ...existing]);
  }
  
  // ---------------------------------------------------------------------------
  // Build a history entry from store slices
  // ---------------------------------------------------------------------------
  
  function buildEntry(
    result:     ProofResult,
    submission: SubmissionResult,
    elapsedMs:  number | null,
  ): ProofHistoryEntry {
    return {
      id:           submission.txHash,
      nullifier:    result.nullifier,
      rootUsed:     result.rootUsed,
      publicInputs: result.publicInputs,
      elapsedMs,
      generatedAt:  result.generatedAt,
      txHash:       submission.txHash,
      confirmedAt:  submission.confirmedAt,
      blockNumber:  submission.blockNumber.toString(),
    };
  }
  
  // ---------------------------------------------------------------------------
  // Validity helpers
  // ---------------------------------------------------------------------------
  
  function isEntryActive(entry: ProofHistoryEntry): boolean {
    const elapsed = Date.now() - entry.confirmedAt;
    return elapsed < Number(DEFAULT_VALIDITY_WINDOW_SECONDS) * 1000;
  }
  
  function proofRemainingPct(entry: ProofHistoryEntry): number {
    const windowMs = Number(DEFAULT_VALIDITY_WINDOW_SECONDS) * 1000;
    const elapsed  = Date.now() - entry.confirmedAt;
    return Math.max(0, Math.round((1 - elapsed / windowMs) * 100));
  }
  
  // ---------------------------------------------------------------------------
  // Custom hook — merges live store + localStorage, sorted newest-first
  // ---------------------------------------------------------------------------
  
  function useProofHistory(): {
    entries:     ProofHistoryEntry[];
    clearHistory: () => void;
  } {
    const proofStatus  = useProofStore(selectProofStatus);
    const proofResult  = useProofStore(selectProofResult);
    const submission   = useProofStore(selectSubmission);
    const elapsedMs    = useProofStore(selectElapsedMs);
  
    const [stored, setStored] = useState<ProofHistoryEntry[]>(() => readHistory());
  
    // Persist & re-read whenever store confirms a new proof
    useEffect(() => {
      if (
        proofStatus === "confirmed" &&
        proofResult !== null &&
        submission  !== null
      ) {
        const entry = buildEntry(proofResult, submission, elapsedMs);
        appendEntry(entry);
        setStored(readHistory());
      }
    }, [proofStatus, proofResult, submission, elapsedMs]);
  
    // Merge: live store entry + stored (dedup by txHash)
    const entries = useMemo<ProofHistoryEntry[]>(() => {
      const liveEntry =
        proofStatus === "confirmed" && proofResult && submission
          ? buildEntry(proofResult, submission, elapsedMs)
          : null;
  
      const all = liveEntry
        ? [liveEntry, ...stored.filter((e) => e.id !== liveEntry.id)]
        : stored;
  
      // Sort newest confirmedAt first
      return [...all].sort((a, b) => b.confirmedAt - a.confirmedAt);
    }, [proofStatus, proofResult, submission, elapsedMs, stored]);
  
    const clearHistory = useCallback(() => {
      writeHistory([]);
      setStored([]);
    }, []);
  
    return { entries, clearHistory };
  }
  
  // ---------------------------------------------------------------------------
  // Status badge
  // ---------------------------------------------------------------------------
  
  function StatusBadge({ active }: { active: boolean }) {
    return active ? (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/25 bg-teal-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-400">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal-400" aria-hidden="true" />
        Active
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-800/60 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" aria-hidden="true" />
        Expired
      </span>
    );
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
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-600",
          copied ? "text-teal-400" : "text-zinc-600 hover:text-zinc-400",
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
  // Expanded detail drawer
  // ---------------------------------------------------------------------------
  
  function EntryDetail({ entry }: { entry: ProofHistoryEntry }) {
    const active = isEntryActive(entry);
    const pct    = proofRemainingPct(entry);
  
    return (
      <div className="border-t border-zinc-800/60 bg-zinc-950/60 px-5 py-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
  
          {/* Nullifier */}
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
              Nullifier
            </p>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[11px] text-teal-300">
                {formatNullifier(entry.nullifier)}
              </span>
              <CopyButton value={entry.nullifier} />
            </div>
          </div>
  
          {/* Merkle root */}
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
              Merkle root
            </p>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[11px] text-zinc-400">
                {formatHash(entry.rootUsed, 8, 6)}
              </span>
              <CopyButton value={entry.rootUsed} />
            </div>
          </div>
  
          {/* Block */}
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
              Block
            </p>
            <span className="font-mono text-[11px] text-zinc-400">
              #{entry.blockNumber}
            </span>
          </div>
  
          {/* Generation time */}
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
              Proving time
            </p>
            <span className="font-mono text-[11px] text-zinc-400">
              {entry.elapsedMs !== null
                ? `${(entry.elapsedMs / 1000).toFixed(1)}s`
                : "—"}
            </span>
          </div>
  
          {/* Public inputs */}
          <div className="col-span-full space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
              Public inputs ({entry.publicInputs.length})
            </p>
            <div className="space-y-0.5">
              {entry.publicInputs.map((inp, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="font-mono text-[11px] text-zinc-500">
                    [{i}]
                  </span>
                  <span className="font-mono text-[11px] text-zinc-400">
                    {formatHash(inp, 10, 8)}
                  </span>
                  <CopyButton value={inp} />
                </div>
              ))}
            </div>
          </div>
  
          {/* Validity progress bar */}
          {active && (
            <div className="col-span-full space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
                  Validity window
                </p>
                <span className="font-mono text-[10px] text-zinc-600">
                  {pct}% remaining
                </span>
              </div>
              <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full rounded-full bg-teal-500 transition-[width] duration-700"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
  
  // ---------------------------------------------------------------------------
  // Single proof row
  // ---------------------------------------------------------------------------
  
  function ProofRow({
    entry,
    index,
    visible,
  }: {
    entry:   ProofHistoryEntry;
    index:   number;
    visible: boolean;
  }) {
    const [expanded, setExpanded] = useState(false);
    const active = isEntryActive(entry);
  
    return (
      <div
        className={[
          "overflow-hidden rounded-2xl border transition-all duration-500",
          active ? "border-teal-500/20" : "border-zinc-800",
          active ? "bg-teal-500/[0.03]" : "bg-zinc-900/30",
          visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3",
        ].join(" ")}
        style={{ transitionDelay: `${index * 55}ms` }}
      >
        {/* Row header */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className={[
            "flex w-full items-center gap-4 px-5 py-4 text-left",
            "transition-colors hover:bg-white/[0.02]",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-zinc-700",
          ].join(" ")}
          aria-expanded={expanded}
        >
          {/* Index dot */}
          <div className={[
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border",
            active
              ? "border-teal-500/20 bg-teal-500/10 text-teal-500"
              : "border-zinc-800 bg-zinc-900 text-zinc-600",
          ].join(" ")}>
            <ShieldIcon
              className="h-3.5 w-3.5"
              checked={active}
            />
          </div>
  
          {/* Core info */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-mono text-xs font-medium text-zinc-300">
                {formatNullifier(entry.nullifier)}
              </span>
              <StatusBadge active={active} />
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
              <span className="text-[11px] text-zinc-600">
                {formatTimestamp(entry.confirmedAt / 1000)}
              </span>
              <span className="text-[11px] text-zinc-700">·</span>
              <span className="text-[11px] text-zinc-600">
                {timeAgo(entry.confirmedAt / 1000)}
              </span>
            </div>
          </div>
  
          {/* Right side */}
          <div className="flex shrink-0 items-center gap-3">
            {/* Tx link */}
            <a
              href={txUrl(entry.txHash)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="hidden items-center gap-1 font-mono text-[11px] text-zinc-600 transition-colors hover:text-zinc-400 sm:flex"
              aria-label="View transaction on explorer"
            >
              {formatHash(entry.txHash, 6, 4)}
              <ExternalLinkIcon className="h-2.5 w-2.5" />
            </a>
  
            {/* Chevron */}
            <ChevronIcon
              className={[
                "h-3.5 w-3.5 text-zinc-600 transition-transform duration-200",
                expanded ? "rotate-180" : "",
              ].join(" ")}
            />
          </div>
        </button>
  
        {/* Expanded detail */}
        <div
          className={[
            "grid transition-all duration-300 ease-in-out",
            expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          ].join(" ")}
        >
          <div className="overflow-hidden">
            <EntryDetail entry={entry} />
          </div>
        </div>
      </div>
    );
  }
  
  // ---------------------------------------------------------------------------
  // Empty state
  // ---------------------------------------------------------------------------
  
  function EmptyState() {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900/60">
          <svg viewBox="0 0 20 20" className="h-7 w-7 text-zinc-700" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10 2L3 5.5v5.5c0 4.5 3 7.5 7 8.5 4-1 7-4 7-8.5V5.5L10 2z" />
            <path d="M7 10l2.5 2.5L14 7.5" strokeWidth="1.6" />
          </svg>
        </div>
        <h2 className="text-sm font-semibold text-zinc-400">No proofs yet</h2>
        <p className="mt-2 max-w-xs text-xs leading-relaxed text-zinc-600">
          Generate your first zero-knowledge compliance proof from the Ledger page.
          Confirmed proofs will appear here.
        </p>
        <Link
          to="/app/ledger"
          className={[
            "mt-6 inline-flex items-center gap-2 rounded-xl",
            "bg-teal-600 px-4 py-2 text-xs font-semibold text-white",
            "transition-colors hover:bg-teal-500",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",
          ].join(" ")}
        >
          Open ledger
          <ArrowRightIcon className="h-3 w-3" />
        </Link>
      </div>
    );
  }
  
  // ---------------------------------------------------------------------------
  // Clear confirm dialog
  // ---------------------------------------------------------------------------
  
  function ClearConfirmDialog({
    onConfirm,
    onCancel,
  }: {
    onConfirm: () => void;
    onCancel:  () => void;
  }) {
    // Close on Escape
    useEffect(() => {
      function onKey(e: KeyboardEvent) {
        if (e.key === "Escape") onCancel();
      }
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [onCancel]);
  
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="clear-dialog-title"
      >
        <div className="mx-4 w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl">
          <h2
            id="clear-dialog-title"
            className="text-sm font-semibold text-zinc-200"
          >
            Clear history?
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-zinc-500">
            This removes all locally stored proof records. On-chain data is
            unaffected — proofs confirmed on Sepolia remain valid until their
            validity window expires.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              onClick={onCancel}
              className={[
                "rounded-xl border border-zinc-700 px-3.5 py-1.5",
                "text-xs font-medium text-zinc-400",
                "transition-colors hover:border-zinc-600 hover:text-zinc-200",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-600",
              ].join(" ")}
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className={[
                "rounded-xl bg-rose-600 px-3.5 py-1.5",
                "text-xs font-semibold text-white",
                "transition-colors hover:bg-rose-500",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900",
              ].join(" ")}
            >
              Clear history
            </button>
          </div>
        </div>
      </div>
    );
  }
  
  // ---------------------------------------------------------------------------
  // Proofs page
  // ---------------------------------------------------------------------------
  
  export function Proofs() {
    const { entries, clearHistory } = useProofHistory();
    const navigate = useNavigate();
  
    const [showClear, setShowClear]   = useState(false);
    const [headerVis, setHeaderVis]   = useState(false);
  
    // Header fade-in
    useEffect(() => {
      const id = setTimeout(() => setHeaderVis(true), 40);
      return () => clearTimeout(id);
    }, []);
  
    // Stats
    const activeCount  = entries.filter(isEntryActive).length;
    const expiredCount = entries.length - activeCount;
  
    const handleClearConfirm = useCallback(() => {
      clearHistory();
      setShowClear(false);
    }, [clearHistory]);
  
    return (
      <>
        <div className="flex flex-col gap-6 p-4 pb-8 sm:p-6 lg:p-8">
  
          {/* ── Header ──────────────────────────────────────────────── */}
          <div
            className={[
              "flex flex-col gap-3 transition-all duration-500 sm:flex-row sm:items-start sm:justify-between",
              headerVis ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2",
            ].join(" ")}
          >
            <div>
              <h1 className="text-lg font-semibold text-zinc-100">
                Proof History
              </h1>
              <p className="mt-0.5 text-xs text-zinc-600">
                Zero-knowledge compliance proofs generated in this browser.
              </p>
            </div>
  
            {/* Stats + actions */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Count chips */}
              {entries.length > 0 && (
                <>
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-2.5 py-1 text-[11px] font-medium text-zinc-500">
                    <span className="font-mono text-zinc-300">{entries.length}</span>
                    total
                  </span>
                  {activeCount > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-teal-500/20 bg-teal-500/8 px-2.5 py-1 text-[11px] font-medium text-teal-500">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal-400" aria-hidden="true" />
                      {activeCount} active
                    </span>
                  )}
                </>
              )}
  
              {/* Generate CTA */}
              <Link
                to="/app/ledger"
                className={[
                  "inline-flex items-center gap-1.5 rounded-xl",
                  "bg-teal-600 px-3.5 py-1.5 text-[11px] font-semibold text-white",
                  "transition-colors hover:bg-teal-500",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",
                ].join(" ")}
              >
                <PlusIcon className="h-3 w-3" />
                Generate new
              </Link>
  
              {/* Clear history */}
              {entries.length > 0 && (
                <button
                  onClick={() => setShowClear(true)}
                  className={[
                    "inline-flex items-center gap-1.5 rounded-xl border border-zinc-800",
                    "px-3.5 py-1.5 text-[11px] font-medium text-zinc-600",
                    "transition-colors hover:border-zinc-700 hover:text-zinc-400",
                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-600",
                  ].join(" ")}
                >
                  <TrashIcon className="h-3 w-3" />
                  Clear
                </button>
              )}
            </div>
          </div>
  
          {/* ── Summary strip (only with entries) ─────────────────── */}
          {entries.length > 0 && (
            <div
              className={[
                "grid grid-cols-2 gap-3 transition-all duration-500 sm:grid-cols-4",
                headerVis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
              ].join(" ")}
              style={{ transitionDelay: "60ms" }}
            >
              <SummaryTile
                label="Total proofs"
                value={String(entries.length)}
                icon={<LayersIcon className="h-3.5 w-3.5" />}
              />
              <SummaryTile
                label="Active now"
                value={String(activeCount)}
                icon={<ShieldIcon className="h-3.5 w-3.5" checked />}
                accent="teal"
              />
              <SummaryTile
                label="Expired"
                value={String(expiredCount)}
                icon={<ClockIcon className="h-3.5 w-3.5" />}
              />
              <SummaryTile
                label="Last proof"
                value={timeAgo(entries[0]!.confirmedAt / 1000)}
                icon={<CalendarIcon className="h-3.5 w-3.5" />}
              />
            </div>
          )}
  
          {/* ── List ──────────────────────────────────────────────── */}
          {entries.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="flex flex-col gap-3">
              {entries.map((entry, i) => (
                <ProofRow
                  key={entry.id}
                  entry={entry}
                  index={i}
                  visible={headerVis}
                />
              ))}
            </div>
          )}
  
          {/* ── Note about persistence ─────────────────────────────── */}
          {entries.length > 0 && (
            <p
              className={[
                "text-center text-[10px] leading-relaxed text-zinc-700",
                "transition-opacity duration-700",
                headerVis ? "opacity-100" : "opacity-0",
              ].join(" ")}
              style={{ transitionDelay: `${entries.length * 55 + 200}ms` }}
            >
              History is stored locally in this browser.
              On-chain proofs remain valid independently of this list.
            </p>
          )}
        </div>
  
        {/* Clear confirm dialog */}
        {showClear && (
          <ClearConfirmDialog
            onConfirm={handleClearConfirm}
            onCancel={() => setShowClear(false)}
          />
        )}
      </>
    );
  }
  
  export default Proofs;
  
  // ---------------------------------------------------------------------------
  // Summary tile
  // ---------------------------------------------------------------------------
  
  function SummaryTile({
    label,
    value,
    icon,
    accent,
  }: {
    label:  string;
    value:  string;
    icon:   React.ReactNode;
    accent?: "teal";
  }) {
    return (
      <div className="flex flex-col gap-2.5 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
            {label}
          </span>
          <div className={[
            "flex h-6 w-6 items-center justify-center rounded-lg border",
            accent === "teal"
              ? "border-teal-500/20 bg-teal-500/10 text-teal-500"
              : "border-zinc-800 bg-zinc-900 text-zinc-600",
          ].join(" ")}>
            {icon}
          </div>
        </div>
        <span className={[
          "font-mono text-lg font-semibold tabular-nums",
          accent === "teal" ? "text-teal-400" : "text-zinc-200",
        ].join(" ")}>
          {value}
        </span>
      </div>
    );
  }
  
  // ---------------------------------------------------------------------------
  // Icons
  // ---------------------------------------------------------------------------
  
  function ShieldIcon({
    className,
    checked,
  }: {
    className?: string;
    checked?: boolean;
  }) {
    return (
      <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M8 1.5L2 4v4.5c0 3.5 2.5 5.5 6 6.5 3.5-1 6-3 6-6.5V4L8 1.5z" />
        {checked && <path d="M5.5 8.5l2 2L11 6" strokeWidth="1.6" />}
      </svg>
    );
  }
  
  function LayersIcon({ className }: { className?: string }) {
    return (
      <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M1.5 5.5L8 2.5l6.5 3L8 8.5 1.5 5.5z" />
        <path d="M1.5 9l6.5 3 6.5-3" />
        <path d="M1.5 12l6.5 3 6.5-3" />
      </svg>
    );
  }
  
  function ClockIcon({ className }: { className?: string }) {
    return (
      <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="8" cy="8" r="6" />
        <polyline points="8 5 8 8 10.5 9.5" />
      </svg>
    );
  }
  
  function CalendarIcon({ className }: { className?: string }) {
    return (
      <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="2" y="3" width="12" height="11" rx="1.5" />
        <path d="M5 1.5v3M11 1.5v3M2 7h12" />
      </svg>
    );
  }
  
  function PlusIcon({ className }: { className?: string }) {
    return (
      <svg viewBox="0 0 10 10" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
        <path d="M5 2v6M2 5h6" />
      </svg>
    );
  }
  
  function TrashIcon({ className }: { className?: string }) {
    return (
      <svg viewBox="0 0 12 12" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 3h8M5 3V2h2v1M4.5 3v6M7.5 3v6M3 3l.5 7h5L9 3" />
      </svg>
    );
  }
  
  function ArrowRightIcon({ className }: { className?: string }) {
    return (
      <svg viewBox="0 0 10 10" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 5h6M5 2l3 3-3 3" />
      </svg>
    );
  }
  
  function ChevronIcon({ className }: { className?: string }) {
    return (
      <svg viewBox="0 0 12 12" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2.5 4.5L6 8l3.5-3.5" />
      </svg>
    );
  }
  
  function ExternalLinkIcon({ className }: { className?: string }) {
    return (
      <svg viewBox="0 0 10 10" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 2H2.5a1 1 0 0 0-1 1v4.5a1 1 0 0 0 1 1H7a1 1 0 0 0 1-1V6" />
        <path d="M6 1H9v3M9 1 5.5 4.5" />
      </svg>
    );
  }