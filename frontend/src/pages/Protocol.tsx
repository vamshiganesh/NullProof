// frontend/src/pages/Protocol.tsx
//
// Route: /app/protocol — Protocol Health Dashboard
//
// Three sections:
//   1. KPI strip      — address count, validity window, last updated, status
//   2. Root history   — timestamped table of the last N Merkle roots
//   3. Benchmark chart — grouped bar chart (median / p95 / p99) per prover step
//
// Data sources:
//   • useSanctionsStore  — protocol KPIs + root history (on-chain reads)
//   • useBenchmarks      — /public/benchmarks.json (prover timing)

import React, {
    useCallback,
    useEffect,
    useRef,
    useState,
  } from "react";
  import { useNavigate } from "react-router-dom";
  import type { Hex } from "viem";
  
  import {
    useSanctionsStore,
    selectCurrentRoot,
    selectLastUpdatedAt,
    selectAddressCount,
    selectValidityWindow,
    selectSubmissionPaused,
    selectRootHistory,
    selectSanctionsStatus,
    selectSanctionsError,
    selectLastFetchedAt,
    selectIsOperational,
    selectIsStale,
  } from "@/store/sanctionsStore";
  import { useBenchmarks } from "@/hooks/useBenchmarks";
  import type { BenchmarkEntry } from "@/hooks/useBenchmarks";
  import {
    BLOCK_EXPLORER_URL,
    SUPPORTED_CHAIN_NAME,
    SANCTIONS_LIST_ADDRESS,
    COMPLIANCE_GATE_ADDRESS,
  } from "@/lib/constants";
  import { formatHash } from "@/lib/format";
  
  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  
  function formatSeconds(s: bigint): string {
    const n = Number(s);
    if (n < 60)    return `${n}s`;
    if (n < 3600)  return `${Math.floor(n / 60)}m`;
    if (n < 86400) return `${Math.floor(n / 3600)}h`;
    return `${Math.floor(n / 86400)}d`;
  }
  
  function formatTs(unixSecs: bigint): string {
    return new Date(Number(unixSecs) * 1000).toLocaleString(undefined, {
      month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }
  
  function timeAgo(unixSecs: bigint): string {
    const diff = Math.floor(Date.now() / 1000) - Number(unixSecs);
    if (diff < 60)    return `${diff}s ago`;
    if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }
  
  function msLabel(ms: number): string {
    if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.round(ms)}ms`;
  }
  
  // ---------------------------------------------------------------------------
  // useCopy
  // ---------------------------------------------------------------------------
  
  function useCopy(duration = 1600) {
    const [copied, setCopied] = useState<string | null>(null);
    const t = useRef<ReturnType<typeof setTimeout>>();
    const copy = useCallback((text: string, key: string) => {
      void navigator.clipboard.writeText(text).then(() => {
        clearTimeout(t.current);
        setCopied(key);
        t.current = setTimeout(() => setCopied(null), duration);
      });
    }, [duration]);
    useEffect(() => () => clearTimeout(t.current), []);
    return { copied, copy };
  }
  
  // ---------------------------------------------------------------------------
  // KPI card
  // ---------------------------------------------------------------------------
  
  interface KpiProps {
    label:    string;
    value:    React.ReactNode;
    sub?:     string;
    icon:     React.ReactNode;
    accent?:  "teal" | "amber" | "rose" | "zinc";
    loading?: boolean;
  }
  
  function KpiCard({ label, value, sub, icon, accent = "zinc", loading }: KpiProps) {
    const ring: Record<string, string> = {
      teal:  "border-teal-500/20 bg-teal-500/5",
      amber: "border-amber-500/20 bg-amber-500/5",
      rose:  "border-rose-500/20 bg-rose-500/5",
      zinc:  "border-zinc-800 bg-zinc-900/30",
    };
    const text: Record<string, string> = {
      teal:  "text-teal-300",
      amber: "text-amber-300",
      rose:  "text-rose-300",
      zinc:  "text-zinc-200",
    };
    return (
      <div className={["rounded-2xl border p-4 transition-colors", ring[accent]].join(" ")}>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[9px] font-semibold uppercase tracking-widest text-zinc-600">{label}</p>
          <span className="text-zinc-600">{icon}</span>
        </div>
        {loading ? (
          <div className="space-y-2">
            <div className="h-5 w-24 animate-pulse rounded-md bg-zinc-800" />
            <div className="h-3 w-16 animate-pulse rounded-md bg-zinc-800/60" />
          </div>
        ) : (
          <>
            <p className={["text-xl font-semibold tabular-nums", text[accent]].join(" ")}>{value}</p>
            {sub && <p className="mt-1 text-[10px] text-zinc-600">{sub}</p>}
          </>
        )}
      </div>
    );
  }
  
  // ---------------------------------------------------------------------------
  // Root history table
  // ---------------------------------------------------------------------------
  
  function RootHistoryTable({
    roots,
    currentRoot,
    copied,
    copy,
  }: {
    roots:       { root: Hex; timestamp: bigint }[];
    currentRoot: Hex | null;
    copied:      string | null;
    copy:        (text: string, key: string) => void;
  }) {
    if (roots.length === 0) {
      return (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <HistoryIcon className="h-6 w-6 text-zinc-700" />
          <p className="text-xs text-zinc-600">No root history available yet</p>
        </div>
      );
    }
  
    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px]">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="pb-2 pr-4 text-left text-[9px] font-semibold uppercase tracking-widest text-zinc-600">#</th>
              <th className="pb-2 pr-4 text-left text-[9px] font-semibold uppercase tracking-widest text-zinc-600">Root</th>
              <th className="pb-2 pr-4 text-left text-[9px] font-semibold uppercase tracking-widest text-zinc-600">Timestamp</th>
              <th className="pb-2 text-left text-[9px] font-semibold uppercase tracking-widest text-zinc-600">Age</th>
            </tr>
          </thead>
          <tbody>
            {roots.map(({ root, timestamp }, i) => {
              const isLatest = root === currentRoot;
              const copyKey  = `root-${i}`;
              const isCopied = copied === copyKey;
              const explorerHref = BLOCK_EXPLORER_URL
                ? `${BLOCK_EXPLORER_URL}/address/${SANCTIONS_LIST_ADDRESS}`
                : null;
              return (
                <tr
                  key={root}
                  className={[
                    "group border-b border-zinc-800/50 transition-colors",
                    isLatest ? "bg-teal-500/3" : "hover:bg-zinc-900/40",
                  ].join(" ")}
                >
                  <td className="py-2.5 pr-4">
                    <span className="font-mono text-[10px] text-zinc-700">{roots.length - i}</span>
                  </td>
                  <td className="py-2.5 pr-4">
                    <div className="flex items-center gap-2">
                      {isLatest && (
                        <span className="rounded-full border border-teal-500/20 bg-teal-500/8 px-1.5 py-0.5 text-[8px] font-semibold text-teal-400">
                          LIVE
                        </span>
                      )}
                      <span className={[
                        "font-mono text-[11px]",
                        isLatest ? "text-teal-300" : "text-zinc-500",
                      ].join(" ")}>
                        {formatHash(root, 14, 10)}
                      </span>
                      <button
                        onClick={() => copy(root, copyKey)}
                        aria-label={isCopied ? "Copied" : "Copy root"}
                        className={[
                          "rounded px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide",
                          "border transition-all duration-200 focus-visible:outline-none",
                          isCopied
                            ? "border-teal-500/25 bg-teal-500/8 text-teal-400"
                            : "border-zinc-800 bg-zinc-900 text-zinc-700 opacity-0 group-hover:opacity-100 hover:border-zinc-700 hover:text-zinc-500",
                        ].join(" ")}
                      >
                        {isCopied ? "✓" : "Copy"}
                      </button>
                      {explorerHref && (
                        <a
                          href={explorerHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="View on explorer"
                          className="rounded p-0.5 text-zinc-700 opacity-0 transition-opacity group-hover:opacity-100 hover:text-zinc-400 focus-visible:outline-none"
                        >
                          <ExternalLinkIcon className="h-2.5 w-2.5" />
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 pr-4">
                    <span className="font-mono text-[11px] text-zinc-500">
                      {timestamp > 0n ? formatTs(timestamp) : "—"}
                    </span>
                  </td>
                  <td className="py-2.5">
                    <span className="font-mono text-[11px] text-zinc-600">
                      {timestamp > 0n ? timeAgo(timestamp) : "—"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }
  
  // ---------------------------------------------------------------------------
  // Benchmark bar chart — pure SVG, no external lib
  // ---------------------------------------------------------------------------
  
  const BAR_SERIES = [
    { key: "medianMs" as const, label: "Median", color: "#4f98a3" },
    { key: "p95Ms"    as const, label: "p95",    color: "#bb653b" },
    { key: "p99Ms"    as const, label: "p99",    color: "#a12c7b" },
  ] as const;
  
  function BenchmarkChart({ entries }: { entries: BenchmarkEntry[] }) {
    const svgRef      = useRef<SVGSVGElement>(null);
    const [width, setWidth] = useState(600);
  
    // Responsive width
    useEffect(() => {
      if (!svgRef.current) return;
      const ro = new ResizeObserver((entries) => {
        const w = entries[0]?.contentRect.width;
        if (w) setWidth(Math.floor(w));
      });
      ro.observe(svgRef.current.parentElement!);
      return () => ro.disconnect();
    }, []);
  
    const H         = 220;
    const padTop    = 16;
    const padBottom = 48;
    const padLeft   = 48;
    const padRight  = 16;
    const chartW    = width - padLeft - padRight;
    const chartH    = H - padTop - padBottom;
  
    // Max value across all series
    const allValues = entries.flatMap((e) => [e.medianMs, e.p95Ms, e.p99Ms]);
    const maxVal    = Math.max(...allValues, 1);
  
    // Bar geometry
    const groupW    = chartW / entries.length;
    const barW      = Math.min(Math.floor(groupW / 4.5), 18);
    const gap       = Math.floor(barW * 0.3);
  
    // Y axis ticks — 4 nice steps
    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxVal * f));
  
    // Hover state
    const [hovered, setHovered] = useState<{ entryIdx: number; seriesKey: string } | null>(null);
  
    function barY(val: number) {
      return padTop + chartH - (val / maxVal) * chartH;
    }
    function barHeight(val: number) {
      return (val / maxVal) * chartH;
    }
  
    return (
      <div className="relative w-full">
        <svg
          ref={svgRef}
          width={width}
          height={H}
          className="overflow-visible"
          role="img"
          aria-label="Prover benchmark chart"
        >
          {/* Y grid lines */}
          {yTicks.map((tick) => {
            const y = barY(tick);
            return (
              <g key={tick}>
                <line
                  x1={padLeft} y1={y} x2={padLeft + chartW} y2={y}
                  stroke="#27272a" strokeWidth="1"
                />
                <text
                  x={padLeft - 6} y={y + 4}
                  textAnchor="end"
                  fontSize="9"
                  fill="#52525b"
                  fontFamily="ui-monospace,monospace"
                >
                  {msLabel(tick)}
                </text>
              </g>
            );
          })}
  
          {/* Bars + X labels */}
          {entries.map((entry, gi) => {
            const gx = padLeft + gi * groupW + groupW / 2;
            const seriesCount = BAR_SERIES.length;
            const totalW = seriesCount * barW + (seriesCount - 1) * gap;
            const startX = gx - totalW / 2;
  
            return (
              <g key={entry.label}>
                {BAR_SERIES.map(({ key, color }, si) => {
                  const val   = entry[key];
                  const bx    = startX + si * (barW + gap);
                  const by    = barY(val);
                  const bh    = barHeight(val);
                  const isHov = hovered?.entryIdx === gi && hovered?.seriesKey === key;
  
                  return (
                    <g key={key}>
                      {/* Bar */}
                      <rect
                        x={bx} y={by}
                        width={barW} height={Math.max(bh, 2)}
                        rx="3" ry="3"
                        fill={color}
                        opacity={
                          hovered === null ? 0.75
                          : isHov ? 1
                          : 0.3
                        }
                        style={{ transition: "opacity 150ms, y 150ms, height 150ms" }}
                        onMouseEnter={() => setHovered({ entryIdx: gi, seriesKey: key })}
                        onMouseLeave={() => setHovered(null)}
                      />
                      {/* Hover label above bar */}
                      {isHov && (
                        <text
                          x={bx + barW / 2} y={by - 5}
                          textAnchor="middle"
                          fontSize="9"
                          fill={color}
                          fontFamily="ui-monospace,monospace"
                          fontWeight="600"
                        >
                          {msLabel(val)}
                        </text>
                      )}
                    </g>
                  );
                })}
  
                {/* X label */}
                <text
                  x={gx}
                  y={H - padBottom + 16}
                  textAnchor="middle"
                  fontSize="9"
                  fill="#52525b"
                  fontFamily="ui-monospace,monospace"
                >
                  {entry.label.length > 12
                    ? entry.label.slice(0, 11) + "…"
                    : entry.label}
                </text>
  
                {/* Samples count */}
                <text
                  x={gx}
                  y={H - padBottom + 28}
                  textAnchor="middle"
                  fontSize="8"
                  fill="#3f3f46"
                  fontFamily="ui-monospace,monospace"
                >
                  n={entry.samples}
                </text>
              </g>
            );
          })}
  
          {/* Y axis line */}
          <line
            x1={padLeft} y1={padTop}
            x2={padLeft} y2={padTop + chartH}
            stroke="#27272a" strokeWidth="1"
          />
  
          {/* X axis line */}
          <line
            x1={padLeft} y1={padTop + chartH}
            x2={padLeft + chartW} y2={padTop + chartH}
            stroke="#27272a" strokeWidth="1"
          />
        </svg>
  
        {/* Legend */}
        <div className="mt-2 flex items-center justify-end gap-4">
          {BAR_SERIES.map(({ key, label, color }) => (
            <div key={key} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm" style={{ background: color }} aria-hidden="true" />
              <span className="text-[10px] text-zinc-500">{label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  
  // ---------------------------------------------------------------------------
  // BenchmarkSkeletonRows
  // ---------------------------------------------------------------------------
  
  function BenchmarkSkeleton() {
    return (
      <div className="space-y-3 p-4">
        <div className="flex items-end gap-3 h-32">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex flex-1 items-end gap-1">
              {[...Array(3)].map((__, j) => (
                <div
                  key={j}
                  className="flex-1 animate-pulse rounded-sm bg-zinc-800"
                  style={{ height: `${40 + (i + j) * 12}px` }}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="h-3 w-32 animate-pulse rounded-md bg-zinc-800/60 ml-auto" />
      </div>
    );
  }
  
  // ---------------------------------------------------------------------------
  // SectionHeader
  // ---------------------------------------------------------------------------
  
  function SectionHeader({
    icon,
    title,
    right,
  }: {
    icon:   React.ReactNode;
    title:  string;
    right?: React.ReactNode;
  }) {
    return (
      <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
        <span className="text-zinc-500">{icon}</span>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
          {title}
        </h2>
        {right && <div className="ml-auto">{right}</div>}
      </div>
    );
  }
  
  // ---------------------------------------------------------------------------
  // RefreshButton
  // ---------------------------------------------------------------------------
  
  function RefreshButton({
    onClick,
    spinning,
  }: {
    onClick:  () => void;
    spinning: boolean;
  }) {
    return (
      <button
        onClick={onClick}
        aria-label="Refresh protocol data"
        className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 px-2.5 py-1.5 text-[10px] font-medium text-zinc-500 transition-colors hover:border-zinc-600 hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-600"
      >
        <span className={spinning ? "animate-spin" : ""}>
          <RefreshIcon className="h-3 w-3" />
        </span>
        Refresh
      </button>
    );
  }
  
  // ---------------------------------------------------------------------------
  // Protocol page
  // ---------------------------------------------------------------------------
  
  export function Protocol() {
    const navigate = useNavigate();
  
    // Sanctions store
    const fetchAll        = useSanctionsStore((s) => s.fetchAll);
    const currentRoot     = useSanctionsStore(selectCurrentRoot);
    const lastUpdatedAt   = useSanctionsStore(selectLastUpdatedAt);
    const addressCount    = useSanctionsStore(selectAddressCount);
    const validityWindow  = useSanctionsStore(selectValidityWindow);
    const paused          = useSanctionsStore(selectSubmissionPaused);
    const rootHistory     = useSanctionsStore(selectRootHistory);
    const sanctionsStatus = useSanctionsStore(selectSanctionsStatus);
    const sanctionsError  = useSanctionsStore(selectSanctionsError);
    const lastFetchedAt   = useSanctionsStore(selectLastFetchedAt);
    const isOperational   = useSanctionsStore(selectIsOperational);
    const isStale         = useSanctionsStore(selectIsStale());
  
    // Benchmarks
    const { snapshot, isLoading: bmLoading, isError: bmError, refetch: bmRefetch } = useBenchmarks();
  
    // Copy helper
    const { copied, copy } = useCopy();
  
    // Fetch on mount if stale
    useEffect(() => {
      if (isStale || sanctionsStatus === "idle") {
        void fetchAll();
      }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
  
    // Manual refresh
    const [spinning, setSpinning] = useState(false);
    const handleRefresh = useCallback(async () => {
      setSpinning(true);
      await fetchAll();
      setSpinning(false);
    }, [fetchAll]);
  
    // Mount animation
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
      const id = setTimeout(() => setMounted(true), 40);
      return () => clearTimeout(id);
    }, []);
  
    const isLoading = sanctionsStatus === "idle" || sanctionsStatus === "loading";
  
    return (
      <div
        className={[
          "flex flex-col gap-5 p-4 pb-12 sm:p-6 lg:p-8 transition-all duration-500",
          mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3",
        ].join(" ")}
      >
        {/* ── Page header ──────────────────────────────────────────── */}
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold text-zinc-100">Protocol</h1>
            <p className="mt-0.5 text-xs text-zinc-600">
              Live on-chain stats · {SUPPORTED_CHAIN_NAME}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {lastFetchedAt && (
              <span className="text-[10px] text-zinc-700">
                Updated {timeAgo(BigInt(Math.floor(lastFetchedAt / 1000)))}
              </span>
            )}
            <RefreshButton onClick={handleRefresh} spinning={spinning} />
          </div>
        </div>
  
        {/* ── Paused banner ────────────────────────────────────────── */}
        {paused && (
          <div className="flex items-center gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
            <AlertIcon className="h-4 w-4 shrink-0 text-amber-400" />
            <p className="text-xs text-amber-400">
              Contract submissions are currently <strong>paused</strong> by the protocol admin.
            </p>
          </div>
        )}
  
        {/* ── Error banner ─────────────────────────────────────────── */}
        {sanctionsStatus === "error" && sanctionsError && (
          <div className="flex items-center gap-2.5 rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-3">
            <AlertIcon className="h-4 w-4 shrink-0 text-rose-400" />
            <p className="text-xs text-rose-400">{sanctionsError}</p>
            <button
              onClick={handleRefresh}
              className="ml-auto text-[10px] font-medium text-rose-400 underline underline-offset-2 hover:text-rose-300 focus-visible:outline-none"
            >
              Retry
            </button>
          </div>
        )}
  
        {/* ── KPI strip ────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard
            label="Sanctioned Addresses"
            value={addressCount !== null ? Number(addressCount).toLocaleString() : "—"}
            sub="in current snapshot"
            icon={<UsersIcon className="h-4 w-4" />}
            accent="zinc"
            loading={isLoading}
          />
          <KpiCard
            label="Validity Window"
            value={validityWindow !== null ? formatSeconds(validityWindow) : "—"}
            sub="per attestation"
            icon={<ClockIcon className="h-4 w-4" />}
            accent="teal"
            loading={isLoading}
          />
          <KpiCard
                label="Last Updated"
                value={lastUpdatedAt !== null && lastUpdatedAt > 0n ? timeAgo(lastUpdatedAt) : "—"}
                {...(
                    lastUpdatedAt !== null && lastUpdatedAt > 0n
                    ? { sub: formatTs(lastUpdatedAt) }
                    : {}
                )}
                icon={<CalendarIcon className="h-4 w-4" />}
                accent="zinc"
                loading={isLoading}
            />
          <KpiCard
            label="Protocol Status"
            value={
              isLoading ? "—"
              : paused ? "Paused"
              : isOperational ? "Operational"
              : "Degraded"
            }
            sub={paused ? "submissions disabled" : isOperational ? "accepting proofs" : "check network"}
            icon={<PulseIcon className="h-4 w-4" />}
            accent={
              isLoading ? "zinc"
              : paused ? "amber"
              : isOperational ? "teal"
              : "rose"
            }
            loading={isLoading}
          />
        </div>
  
        {/* ── Current root strip ───────────────────────────────────── */}
        {currentRoot && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/30 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-500" aria-hidden="true" />
              <span className="text-[9px] font-semibold uppercase tracking-widest text-zinc-600">
                Live Merkle Root
              </span>
            </div>
            <span className="font-mono text-[11px] text-teal-300">
              {formatHash(currentRoot, 20, 16)}
            </span>
            <button
              onClick={() => copy(currentRoot, "liveroot")}
              aria-label={copied === "liveroot" ? "Copied" : "Copy root"}
              className={[
                "rounded-lg border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide transition-all duration-200 focus-visible:outline-none",
                copied === "liveroot"
                  ? "border-teal-500/25 bg-teal-500/8 text-teal-400"
                  : "border-zinc-700 bg-zinc-800/60 text-zinc-600 hover:border-zinc-600 hover:text-zinc-400",
              ].join(" ")}
            >
              {copied === "liveroot" ? "✓ Copied" : "Copy"}
            </button>
            <div className="ml-auto flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-[10px] text-zinc-600">
                <ContractIcon className="h-3 w-3" />
                <span className="font-mono">{formatHash(SANCTIONS_LIST_ADDRESS, 8, 6)}</span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-zinc-600">
                <span className="font-mono">{SUPPORTED_CHAIN_NAME}</span>
              </div>
            </div>
          </div>
        )}
  
        {/* ── Bottom grid ──────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_420px]">
  
          {/* Root history */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30">
            <SectionHeader
              icon={<HistoryIcon className="h-3.5 w-3.5" />}
              title="Root History"
              right={
                <span className="text-[10px] text-zinc-700">
                  Last {rootHistory.length} snapshots
                </span>
              }
            />
            <div className="p-4">
              {isLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex gap-3">
                      <div className="h-4 w-4 animate-pulse rounded bg-zinc-800" />
                      <div className="h-4 flex-1 animate-pulse rounded bg-zinc-800" style={{ opacity: 1 - i * 0.15 }} />
                      <div className="h-4 w-24 animate-pulse rounded bg-zinc-800" style={{ opacity: 1 - i * 0.15 }} />
                    </div>
                  ))}
                </div>
              ) : (
                <RootHistoryTable
                  roots={rootHistory}
                  currentRoot={currentRoot}
                  copied={copied}
                  copy={copy}
                />
              )}
            </div>
          </div>
  
          {/* Benchmark chart */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30">
            <SectionHeader
              icon={<ChartIcon className="h-3.5 w-3.5" />}
              title="Prover Benchmarks"
              right={
                snapshot ? (
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2 py-0.5 font-mono text-[9px] text-zinc-600">
                      v{snapshot.version}
                    </span>
                    <button
                      onClick={bmRefetch}
                      aria-label="Reload benchmarks"
                      className="text-zinc-700 hover:text-zinc-400 focus-visible:outline-none"
                    >
                      <RefreshIcon className="h-3 w-3" />
                    </button>
                  </div>
                ) : undefined
              }
            />
  
            {bmLoading && <BenchmarkSkeleton />}
  
            {bmError && (
              <div className="flex flex-col items-center gap-2 p-6 text-center">
                <AlertIcon className="h-5 w-5 text-zinc-700" />
                <p className="text-xs text-zinc-600">Benchmark data unavailable</p>
                <p className="text-[10px] text-zinc-700">
                  Place{" "}
                  <code className="font-mono text-zinc-600">benchmarks.json</code>{" "}
                  in <code className="font-mono text-zinc-600">/public</code>
                </p>
                <button
                  onClick={bmRefetch}
                  className="mt-1 text-[10px] font-medium text-zinc-500 underline underline-offset-2 hover:text-zinc-300 focus-visible:outline-none"
                >
                  Retry
                </button>
              </div>
            )}
  
            {snapshot && !bmLoading && (
              <div className="p-4">
                {/* Environment strip */}
                <div className="mb-4 flex flex-wrap gap-2">
                  <span className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-2.5 py-1 text-[9px] text-zinc-600">
                    <span className="font-semibold uppercase tracking-widest">Env</span>{" "}
                    {snapshot.environment}
                  </span>
                  <span className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-2.5 py-1 text-[9px] text-zinc-600">
                    <span className="font-semibold uppercase tracking-widest">Captured</span>{" "}
                    {new Date(snapshot.capturedAt).toLocaleDateString()}
                  </span>
                </div>
  
                <BenchmarkChart entries={snapshot.entries} />
  
                {/* Per-entry table summary below chart */}
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[300px]">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        {["Step", "Median", "p95", "p99", "Samples"].map((h) => (
                          <th
                            key={h}
                            className="pb-1.5 pr-3 text-left text-[9px] font-semibold uppercase tracking-widest text-zinc-600"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {snapshot.entries.map((e) => (
                        <tr key={e.label} className="border-b border-zinc-800/50">
                          <td className="py-2 pr-3 text-[10px] text-zinc-400">{e.label}</td>
                          <td className="py-2 pr-3 font-mono text-[10px] text-teal-400">{msLabel(e.medianMs)}</td>
                          <td className="py-2 pr-3 font-mono text-[10px] text-amber-400">{msLabel(e.p95Ms)}</td>
                          <td className="py-2 pr-3 font-mono text-[10px] text-purple-400">{msLabel(e.p99Ms)}</td>
                          <td className="py-2 font-mono text-[10px] text-zinc-600">{e.samples.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
  
        {/* ── Contract addresses footer ─────────────────────────────── */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {[
            { label: "ComplianceGate", address: COMPLIANCE_GATE_ADDRESS },
            { label: "SanctionsList",  address: SANCTIONS_LIST_ADDRESS  },
          ].map(({ label, address }) => {
            const ck = `footer-${label}`;
            const explorerHref = BLOCK_EXPLORER_URL
              ? `${BLOCK_EXPLORER_URL}/address/${address}`
              : null;
            return (
              <div
                key={label}
                className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/20 px-4 py-2.5"
              >
                <ContractIcon className="h-3.5 w-3.5 shrink-0 text-zinc-700" />
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] font-semibold uppercase tracking-widest text-zinc-700">{label}</p>
                  <p className="mt-0.5 truncate font-mono text-[10px] text-zinc-500">
                    {address || "Not configured"}
                  </p>
                </div>
                {address && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => copy(address, ck)}
                      aria-label={copied === ck ? "Copied" : `Copy ${label} address`}
                      className={[
                        "rounded border px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide transition-all duration-200 focus-visible:outline-none",
                        copied === ck
                          ? "border-teal-500/25 text-teal-400"
                          : "border-zinc-800 text-zinc-700 hover:border-zinc-700 hover:text-zinc-500",
                      ].join(" ")}
                    >
                      {copied === ck ? "✓" : "Copy"}
                    </button>
                    {explorerHref && (
                      <a
                        href={explorerHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`View ${label} on explorer`}
                        className="rounded p-0.5 text-zinc-700 hover:text-zinc-400 focus-visible:outline-none"
                      >
                        <ExternalLinkIcon className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  
  export default Protocol;
  
  // ---------------------------------------------------------------------------
  // Icons
  // ---------------------------------------------------------------------------
  
  function AlertIcon({ className }: { className?: string }) {
    return <svg viewBox="0 0 14 14" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 1.5L1.5 11.5h11L7 1.5z" /><path d="M7 6v3M7 10.5v.5" /></svg>;
  }
  function UsersIcon({ className }: { className?: string }) {
    return <svg viewBox="0 0 14 14" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="5" cy="4.5" r="2" /><path d="M1.5 12c0-2 1.5-3 3.5-3s3.5 1 3.5 3" /><circle cx="10" cy="4.5" r="1.5" /><path d="M10 8c1.5 0 2.5.8 2.5 2" /></svg>;
  }
  function ClockIcon({ className }: { className?: string }) {
    return <svg viewBox="0 0 14 14" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="7" cy="7" r="5.5" /><path d="M7 4.5V7l2 1.5" /></svg>;
  }
  function CalendarIcon({ className }: { className?: string }) {
    return <svg viewBox="0 0 14 14" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="1.5" y="3" width="11" height="10" rx="1.5" /><path d="M1.5 6.5h11M5 2v2M9 2v2" /></svg>;
  }
  function PulseIcon({ className }: { className?: string }) {
    return <svg viewBox="0 0 14 14" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 7h2l2-4 2 8 2-5 1.5 3H13" /></svg>;
  }
  function HistoryIcon({ className }: { className?: string }) {
    return <svg viewBox="0 0 14 14" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2.5 7A4.5 4.5 0 1 0 4 3.5" /><path d="M2 2v3h3" /><path d="M7 5v3l2 1.5" /></svg>;
  }
  function ChartIcon({ className }: { className?: string }) {
    return <svg viewBox="0 0 14 14" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1.5 12.5v-5l3-3 3 3 4-5v10" /><path d="M1.5 12.5h11" /></svg>;
  }
  function RefreshIcon({ className }: { className?: string }) {
    return <svg viewBox="0 0 12 12" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 6A4 4 0 1 1 6 2" /><path d="M6 2l2-2M6 2l2 2" /></svg>;
  }
  function ExternalLinkIcon({ className }: { className?: string }) {
    return <svg viewBox="0 0 12 12" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 2H2v8h8V7M7 2h3v3M6 6l4-4" /></svg>;
  }
  function ContractIcon({ className }: { className?: string }) {
    return <svg viewBox="0 0 14 14" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 2h6l2 2v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" /><path d="M8 2v3h3M5 7h4M5 9h3" /></svg>;
  }