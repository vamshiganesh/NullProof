// frontend/src/components/protocol/BenchmarkChart.tsx
//
// Recharts bar chart showing the last 10 proof generation run timings.
//
// Data model:
//   There is no persistent benchmark store — proofStore only holds the
//   current run's elapsedMs. This component watches elapsedMs + status
//   and appends each completed run to a local `runs` list (capped at 10).
//   The list resets on page refresh, which is acceptable — it is a
//   live session benchmark, not a historical record.
//
// Visual features:
//   • Recharts <BarChart> with custom dark theme tokens
//   • Bars colour-coded: fast (<3s teal), medium (3–8s amber), slow (>8s rose)
//   • Dashed reference line at session average
//   • Custom tooltip with run number + exact ms
//   • Fastest / slowest / average KPI row above the chart
//   • Empty state with animated placeholder bars while no runs exist

import React, { useEffect, useRef, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface TooltipEntry {
    payload?: BenchmarkRun;
}

import {
  useProofStore,
  selectElapsedMs,
  selectProofStatus,
} from "@/store/proofStore";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BenchmarkRun {
  /** 1-based run index within this session */
  index:     number;
  /** Duration in milliseconds */
  ms:        number;
  /** Short x-axis label e.g. "#1", "#2" */
  label:     string;
}

export interface BenchmarkChartProps {
  /** Max runs retained in the chart. Default: 10 */
  maxRuns?:  number;
  className?: string;
}

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

const FAST_MS   = 3_000;
const MEDIUM_MS = 8_000;

function barColor(ms: number): string {
  if (ms < FAST_MS)   return "#4f98a3"; // teal-400
  if (ms < MEDIUM_MS) return "#fbbf24"; // amber-400
  return "#fb7185";                      // rose-400
}

function barLabel(ms: number): string {
  if (ms < FAST_MS)   return "fast";
  if (ms < MEDIUM_MS) return "moderate";
  return "slow";
}

// ---------------------------------------------------------------------------
// Custom Tooltip
// ---------------------------------------------------------------------------

function BenchmarkTooltip({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: TooltipEntry[];
  }) {
    if (!active || !payload?.length) return null;
    const run = payload[0]?.payload;
    if (!run) return null;
  
    const seconds = (run.ms / 1000).toFixed(2);
    const color   = barColor(run.ms);
  
    return (
      <div className="rounded-xl border border-zinc-700 bg-zinc-900/95 px-3 py-2.5 shadow-xl backdrop-blur-sm">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
          Run {run.index}
        </p>
        <p className="font-mono text-sm font-semibold tabular-nums" style={{ color }}>
          {seconds}s
        </p>
        <p className="mt-0.5 text-[10px]" style={{ color }}>
          {barLabel(run.ms)}
        </p>
      </div>
    );
  }

// ---------------------------------------------------------------------------
// KPI pill (fastest / slowest / avg)
// ---------------------------------------------------------------------------

interface KPIPillProps {
  label:   string;
  value:   string;
  color?:  string;
}

function KPIPill({ label, value, color = "#71717a" }: KPIPillProps) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[9px] font-semibold uppercase tracking-widest text-zinc-600">
        {label}
      </span>
      <span
        className="font-mono text-sm font-semibold tabular-nums"
        style={{ color }}
      >
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state — ghosted placeholder bars
// ---------------------------------------------------------------------------

function EmptyBars() {
  const heights = [40, 65, 50, 80, 55, 70, 45, 60, 75, 50];
  return (
    <div className="flex h-[180px] items-end justify-around gap-1 px-4">
      {heights.map((h, i) => (
        <div
          key={i}
          className="w-full animate-pulse rounded-sm bg-zinc-800/60"
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// BenchmarkChart
// ---------------------------------------------------------------------------

export function BenchmarkChart({
  maxRuns   = 10,
  className = "",
}: BenchmarkChartProps) {
  const elapsedMs   = useProofStore(selectElapsedMs);
  const proofStatus = useProofStore(selectProofStatus);

  const [runs, setRuns] = useState<BenchmarkRun[]>([]);

  // Track the last elapsedMs we already appended to avoid double-appending
  const lastAppendedMs = useRef<number | null>(null);

  // ── Append run on each new "generated" completion ────────────────────────
  useEffect(() => {
    if (
      proofStatus === "generated" &&
      elapsedMs !== null &&
      elapsedMs !== lastAppendedMs.current
    ) {
      lastAppendedMs.current = elapsedMs;

      setRuns((prev) => {
        const next = [
          ...prev,
          {
            index: prev.length + 1,
            ms:    elapsedMs,
            label: `#${prev.length + 1}`,
          },
        ].slice(-maxRuns); // keep last N
        return next;
      });
    }
  }, [proofStatus, elapsedMs, maxRuns]);

  // ── Derived stats ─────────────────────────────────────────────────────────
  const hasRuns = runs.length > 0;

  const fastest = hasRuns
    ? Math.min(...runs.map((r) => r.ms))
    : null;

  const slowest = hasRuns
    ? Math.max(...runs.map((r) => r.ms))
    : null;

  const average = hasRuns
    ? runs.reduce((sum, r) => sum + r.ms, 0) / runs.length
    : null;

  const avgSeconds = average !== null
    ? `${(average / 1000).toFixed(2)}s`
    : "—";

  const fastestSeconds = fastest !== null
    ? `${(fastest / 1000).toFixed(2)}s`
    : "—";

  const slowestSeconds = slowest !== null
    ? `${(slowest / 1000).toFixed(2)}s`
    : "—";

  // Y-axis domain: round up to nearest 5s, min 15s ceiling
  const yMax = hasRuns
    ? Math.max(15_000, Math.ceil((slowest! * 1.2) / 5000) * 5000)
    : 15_000;

  const yTickFormatter = (v: number) => `${v / 1000}s`;

  // ── Is a run in progress right now? ──────────────────────────────────────
  const isGenerating = proofStatus === "generating";

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      className={[
        "flex flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950",
        className,
      ].join(" ")}
    >
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-5 py-3">
        <div className="flex items-center gap-2">
          {/* Bar chart icon */}
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
            <rect x="1"  y="10" width="3.5" height="6" rx="0.5" />
            <rect x="7"  y="6"  width="3.5" height="10" rx="0.5" />
            <rect x="13" y="2"  width="3.5" height="14" rx="0.5" />
          </svg>
          <span className="text-xs font-semibold tracking-wide text-zinc-300">
            Proof Generation Benchmarks
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Generating indicator */}
          {isGenerating && (
            <span className="flex items-center gap-1.5 text-[10px] font-medium text-amber-400">
              <svg
                viewBox="0 0 12 12"
                className="h-2.5 w-2.5 animate-spin"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M6 1A5 5 0 0 1 11 6" />
              </svg>
              Generating…
            </span>
          )}

          {/* Run count badge */}
          <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[10px] font-medium text-zinc-600">
            {runs.length}/{maxRuns} runs
          </span>
        </div>
      </div>

      {/* ── KPI row ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 divide-x divide-zinc-800/80 border-b border-zinc-800/60">
        <div className="flex items-center justify-center py-3">
          <KPIPill
            label="Fastest"
            value={fastestSeconds}
            color={fastest !== null ? barColor(fastest) : "#52525b"}
          />
        </div>
        <div className="flex items-center justify-center py-3">
          <KPIPill
            label="Average"
            value={avgSeconds}
            color={average !== null ? barColor(average) : "#52525b"}
          />
        </div>
        <div className="flex items-center justify-center py-3">
          <KPIPill
            label="Slowest"
            value={slowestSeconds}
            color={slowest !== null ? barColor(slowest) : "#52525b"}
          />
        </div>
      </div>

      {/* ── Chart area ────────────────────────────────────────────────── */}
      <div className="px-4 py-5">
        {!hasRuns ? (
          /* Empty state */
          <div className="relative">
            <EmptyBars />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
              <p className="text-xs font-medium text-zinc-500">
                No benchmark runs yet
              </p>
              <p className="text-[11px] text-zinc-700">
                Generate a proof to start recording timings
              </p>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              data={runs}
              margin={{ top: 4, right: 4, left: -12, bottom: 0 }}
              barCategoryGap="28%"
            >
              {/* Grid */}
              <CartesianGrid
                vertical={false}
                stroke="#27272a"
                strokeDasharray="3 3"
              />

              {/* Axes */}
              <XAxis
                dataKey="label"
                tick={{ fill: "#52525b", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[0, yMax]}
                tickFormatter={yTickFormatter}
                tick={{ fill: "#52525b", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={38}
              />

              {/* Average reference line */}
              {average !== null && (
                <ReferenceLine
                  y={average}
                  stroke="#4f98a3"
                  strokeDasharray="5 4"
                  strokeWidth={1}
                  label={{
                    value: `avg ${avgSeconds}`,
                    position: "insideTopRight",
                    fill: "#4f98a3",
                    fontSize: 9,
                    fontWeight: 600,
                  }}
                />
              )}

              {/* Tooltip */}
              <Tooltip
                content={<BenchmarkTooltip />}
                cursor={{ fill: "rgba(255,255,255,0.03)" }}
              />

              {/* Bars */}
              <Bar dataKey="ms" radius={[3, 3, 0, 0]} maxBarSize={36}>
                {runs.map((run) => (
                  <Cell
                    key={`cell-${run.index}`}
                    fill={barColor(run.ms)}
                    fillOpacity={0.85}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Legend ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 border-t border-zinc-800/60 px-5 py-2.5">
        {[
          { color: "#4f98a3", label: `Fast  (<${FAST_MS / 1000}s)` },
          { color: "#fbbf24", label: `Moderate  (<${MEDIUM_MS / 1000}s)` },
          { color: "#fb7185", label: `Slow  (≥${MEDIUM_MS / 1000}s)` },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-sm"
              style={{ backgroundColor: color }}
              aria-hidden="true"
            />
            <span className="text-[10px] text-zinc-600">{label}</span>
          </div>
        ))}
        <span className="ml-auto text-[10px] text-zinc-700">
          Session only — resets on refresh
        </span>
      </div>
    </div>
  );
}

export default BenchmarkChart;