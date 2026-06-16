// frontend/src/pages/Protocol.tsx
//
// Route: /app/protocol — Protocol Reference
//
// Two tabs:
//   ① Statistics  — 4 KPI cards + root history table + benchmark bar chart + contracts table
//   ② Circuit     — constraint node graph (Range Checks / Poseidon Hashing / Merkle Verification)
//                   + cluster details panel

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
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
// KPI Card
// ---------------------------------------------------------------------------

interface KpiProps {
  label:    string;
  value:    React.ReactNode;
  sub?:     string;
  icon:     React.ReactNode;
  accent?:  "green" | "amber" | "rose" | "neutral";
  loading?: boolean;
}

function KpiCard({ label, value, sub, icon, accent = "neutral", loading }: KpiProps) {
  const border: Record<string, string> = {
    green:   "border-[#22c55e]/20 bg-[#22c55e]/5",
    amber:   "border-amber-500/20 bg-amber-500/5",
    rose:    "border-rose-500/20 bg-rose-500/5",
    neutral: "border-[#1e1e1e] bg-[#141414]",
  };
  const valColor: Record<string, string> = {
    green:   "text-[#4ade80]",
    amber:   "text-amber-300",
    rose:    "text-rose-300",
    neutral: "text-white",
  };
  return (
    <div className={["rounded-xl border p-4 transition-colors", border[accent]].join(" ")}>
      <div className="mb-3 flex items-center justify-between">
        <p className="font-mono text-[9px] uppercase tracking-widest text-[#3e3e3e]">{label}</p>
        <span className="text-[#3e3e3e]" aria-hidden="true">{icon}</span>
      </div>
      {loading ? (
        <div className="space-y-2">
          <div className="h-6 w-24 animate-pulse rounded bg-[#1e1e1e]" />
          <div className="h-3 w-16 animate-pulse rounded bg-[#1a1a1a]" />
        </div>
      ) : (
        <>
          <p className={["text-[22px] font-bold tabular-nums tracking-tight", valColor[accent]].join(" ")}>{value}</p>
          {sub && <p className="mt-1 text-[10px] text-[#646464]">{sub}</p>}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root History Table
// ---------------------------------------------------------------------------

function RootHistoryTable({
  roots, currentRoot, copied, copy,
}: {
  roots: { root: Hex; timestamp: bigint }[];
  currentRoot: Hex | null;
  copied: string | null;
  copy: (text: string, key: string) => void;
}) {
  if (roots.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <HistoryIcon className="h-6 w-6 text-[#3e3e3e]" />
        <p className="text-xs text-[#646464]">No root history available</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px]">
        <thead>
          <tr className="border-b border-[#1e1e1e]">
            {["#", "Root", "Timestamp", "Age"].map((h) => (
              <th key={h} className="pb-2 pr-4 text-left font-mono text-[9px] uppercase tracking-widest text-[#3e3e3e]">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {roots.map(({ root, timestamp }, i) => {
            const isLatest = root === currentRoot;
            const ck = `root-${i}`;
            return (
              <tr key={root} className={["group border-b border-[#1a1a1a] transition-colors", isLatest ? "bg-[#22c55e]/3" : "hover:bg-[#141414]"].join(" ")}>
                <td className="py-2.5 pr-4">
                  <span className="font-mono text-[10px] text-[#3e3e3e]">{roots.length - i}</span>
                </td>
                <td className="py-2.5 pr-4">
                  <div className="flex items-center gap-2">
                    {isLatest && (
                      <span className="shrink-0 rounded-full border border-[#22c55e]/20 bg-[#22c55e]/8 px-1.5 py-0.5 font-mono text-[8px] font-bold text-[#22c55e]">
                        LIVE
                      </span>
                    )}
                    <span className={["font-mono text-[11px]", isLatest ? "text-[#4ade80]" : "text-[#646464]"].join(" ")}>
                      {formatHash(root, 14, 10)}
                    </span>
                    <button
                      onClick={() => copy(root, ck)}
                      aria-label={copied === ck ? "Copied" : "Copy root"}
                      className={[
                        "rounded border px-1.5 py-0.5 font-mono text-[8px] font-semibold uppercase tracking-wide transition-all duration-200 focus-visible:outline-none",
                        copied === ck
                          ? "border-[#22c55e]/20 bg-[#22c55e]/8 text-[#22c55e]"
                          : "border-[#1e1e1e] bg-[#0d0d0d] text-[#3e3e3e] opacity-0 group-hover:opacity-100 hover:border-[#262626] hover:text-[#646464]",
                      ].join(" ")}
                    >
                      {copied === ck ? "✓" : "Copy"}
                    </button>
                    {BLOCK_EXPLORER_URL && (
                      <a
                        href={`${BLOCK_EXPLORER_URL}/address/${SANCTIONS_LIST_ADDRESS}`}
                        target="_blank" rel="noopener noreferrer"
                        className="rounded p-0.5 text-[#3e3e3e] opacity-0 transition-opacity group-hover:opacity-100 hover:text-[#646464] focus-visible:outline-none"
                      >
                        <ExternalIcon className="h-2.5 w-2.5" />
                      </a>
                    )}
                  </div>
                </td>
                <td className="py-2.5 pr-4">
                  <span className="font-mono text-[11px] text-[#646464]">{timestamp > 0n ? formatTs(timestamp) : "—"}</span>
                </td>
                <td className="py-2.5">
                  <span className="font-mono text-[11px] text-[#3e3e3e]">{timestamp > 0n ? timeAgo(timestamp) : "—"}</span>
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
// Benchmark bar chart — pure SVG, no lib
// ---------------------------------------------------------------------------

const BAR_SERIES = [
  { key: "medianMs" as const, label: "Median", color: "#22c55e" },
  { key: "p95Ms"    as const, label: "p95",    color: "#f59e0b" },
  { key: "p99Ms"    as const, label: "p99",    color: "#ec4899" },
] as const;

function BenchmarkChart({ entries }: { entries: BenchmarkEntry[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(560);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((es) => {
      const w = es[0]?.contentRect.width;
      if (w) setWidth(Math.floor(w));
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const H = 200, padTop = 16, padBottom = 44, padLeft = 44, padRight = 12;
  const chartW = width - padLeft - padRight;
  const chartH = H - padTop - padBottom;

  const allValues = entries.flatMap((e) => [e.medianMs, e.p95Ms, e.p99Ms]);
  const maxVal = Math.max(...allValues, 1);

  const groupW = chartW / entries.length;
  const barW   = Math.min(Math.floor(groupW / 4.8), 16);
  const gap    = Math.floor(barW * 0.35);

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxVal * f));
  const [hov, setHov] = useState<{ ei: number; sk: string } | null>(null);

  const barY = (v: number) => padTop + chartH - (v / maxVal) * chartH;
  const barH = (v: number) => (v / maxVal) * chartH;

  return (
    <div ref={containerRef} className="relative w-full">
      <svg width={width} height={H} className="overflow-visible" role="img" aria-label="Prover benchmark">
        {yTicks.map((tick) => {
          const y = barY(tick);
          return (
            <g key={tick}>
              <line x1={padLeft} y1={y} x2={padLeft + chartW} y2={y} stroke="#1e1e1e" strokeWidth="1" />
              <text x={padLeft - 6} y={y + 4} textAnchor="end" fontSize="9" fill="#3e3e3e" fontFamily="ui-monospace,monospace">
                {msLabel(tick)}
              </text>
            </g>
          );
        })}

        {entries.map((entry, gi) => {
          const gx = padLeft + gi * groupW + groupW / 2;
          const totalW = BAR_SERIES.length * barW + (BAR_SERIES.length - 1) * gap;
          const startX = gx - totalW / 2;
          return (
            <g key={entry.label}>
              {BAR_SERIES.map(({ key, color }, si) => {
                const val = entry[key];
                const bx = startX + si * (barW + gap);
                const by = barY(val);
                const bh = barH(val);
                const isHov = hov?.ei === gi && hov?.sk === key;
                return (
                  <g key={key}>
                    <rect
                      x={bx} y={by} width={barW} height={Math.max(bh, 2)} rx="2" ry="2"
                      fill={color} opacity={hov === null ? 0.7 : isHov ? 1 : 0.2}
                      style={{ transition: "opacity 120ms" }}
                      onMouseEnter={() => setHov({ ei: gi, sk: key })}
                      onMouseLeave={() => setHov(null)}
                    />
                    {isHov && (
                      <text x={bx + barW / 2} y={by - 5} textAnchor="middle" fontSize="9" fill={color} fontFamily="ui-monospace,monospace" fontWeight="600">
                        {msLabel(val)}
                      </text>
                    )}
                  </g>
                );
              })}
              <text x={gx} y={H - padBottom + 14} textAnchor="middle" fontSize="9" fill="#3e3e3e" fontFamily="ui-monospace,monospace">
                {entry.label.length > 11 ? entry.label.slice(0, 10) + "…" : entry.label}
              </text>
              <text x={gx} y={H - padBottom + 26} textAnchor="middle" fontSize="8" fill="#262626" fontFamily="ui-monospace,monospace">
                n={entry.samples}
              </text>
            </g>
          );
        })}

        <line x1={padLeft} y1={padTop} x2={padLeft} y2={padTop + chartH} stroke="#1e1e1e" strokeWidth="1" />
        <line x1={padLeft} y1={padTop + chartH} x2={padLeft + chartW} y2={padTop + chartH} stroke="#1e1e1e" strokeWidth="1" />
      </svg>
      <div className="mt-1 flex items-center justify-end gap-4">
        {BAR_SERIES.map(({ key, label, color }) => (
          <div key={key} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm" style={{ background: color }} />
            <span className="text-[10px] text-[#646464]">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ═══════════════════════ CIRCUIT EXPLORER ═══════════════════════════════════
// ---------------------------------------------------------------------------

interface CircuitNode {
  id:    string;
  label: string;
  sub:   string;
  color: string;      // accent hex
  border: string;     // tw class
  bg:    string;
  gates: { label: string; symbol: string; count: number; color: string }[];
  total: number;
  subcircuits: string[];
  description: string;
  dataIn:  string[];
  dataOut: string[];
}

const CIRCUIT_NODES: CircuitNode[] = [
  {
    id:    "range",
    label: "Range Checks",
    sub:   "Sub-circuits A · B · C · F",
    color: "#f59e0b",
    border: "border-amber-500/30",
    bg:    "bg-amber-500/8",
    gates: [
      { label: "Range lookup",  symbol: "R", count: 112, color: "#f59e0b" },
      { label: "Boolean",       symbol: "B", count: 20,  color: "#fb923c" },
      { label: "Arithmetic",    symbol: "A", count: 3,   color: "#fcd34d" },
      { label: "Linear comb.",  symbol: "L", count: 3,   color: "#fef08a" },
    ],
    total: 138,
    subcircuits: [
      "A  u64 witness range proofs  (64 R)",
      "B  Path index booleans       (20 B)",
      "C  Leaf structure validation (1 A, 1 L, 16 R)",
      "F  Non-membership gap check  (2 A, 2 L, 32 R)",
    ],
    description:
      "Validates that all private u64 witnesses lie within [0, 2⁶⁴−1] using 4-bit lookup tables. Enforces path_indices as 1-bit booleans and proves the gap inequality: low < query < next.",
    dataIn:  ["query_value", "low_leaf_value", "low_leaf_next_v", "low_leaf_next_i", "path_indices[20]"],
    dataOut: ["validated_u64s", "verified_gap"],
  },
  {
    id:    "poseidon",
    label: "Poseidon Hashing",
    sub:   "Sub-circuits D · E (hash portion)",
    color: "#3b82f6",
    border: "border-blue-500/30",
    bg:    "bg-blue-500/8",
    gates: [
      { label: "Arithmetic",   symbol: "A", count: 22,  color: "#60a5fa" },
      { label: "Linear comb.", symbol: "L", count: 88,  color: "#93c5fd" },
    ],
    total: 110,
    subcircuits: [
      "D  Leaf commitment  hash_leaf → H           (2 A, 8 L)",
      "     Round 1: inner = hash_pair(value, nv)  (1 A, 4 L)",
      "     Round 2: H = hash_pair(inner, ni)      (1 A, 4 L)",
      "E  Path hashing  20 × hash_pair(l, r)       (20 A, 80 L)",
    ],
    description:
      "Algebraic degree-2 hash function hash_pair(a,b) = (a+b)² + 5a. Composition depth 22 total: depth 2 for leaf commitment + depth 20 for the Merkle path. Zero round constants — pure arithmetic.",
    dataIn:  ["low_leaf triple", "siblings[20]", "path_indices[20]"],
    dataOut: ["leaf_hash H", "level_hashes[20]"],
  },
  {
    id:    "merkle",
    label: "Merkle Verification",
    sub:   "Sub-circuits E (mux portion) · G",
    color: "#22c55e",
    border: "border-[#22c55e]/30",
    bg:    "bg-[#22c55e]/8",
    gates: [
      { label: "Arithmetic", symbol: "A", count: 80, color: "#4ade80" },
      { label: "Equality",   symbol: "E", count: 1,  color: "#86efac" },
    ],
    total: 81,
    subcircuits: [
      "E  Routing muxes  20 × (left/right swap)  (80 A)",
      "     left  = (1−bit)·curr + bit·sibling    (2 A/level)",
      "     right = bit·curr + (1−bit)·sibling    (2 A/level)",
      "G  Root equality check  root′ == root_pub  (1 E)",
    ],
    description:
      "Traverses a 20-level Indexed Merkle Tree. At each level a conditional-select mux routes the hash direction using the path index bit, then compresses via hash_pair. The final root is equality-constrained against the public input.",
    dataIn:  ["leaf_hash H", "level_hashes[20]", "path_indices[20]", "root (public)"],
    dataOut: ["verified_root  →  proof output"],
  },
];

// ---------------------------------------------------------------------------
// Circuit node graph (pure SVG)
// ---------------------------------------------------------------------------

function CircuitGraph({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  // viewBox is 760 × 320 — scaled by CSS to fill container
  const VW = 760, VH = 320;

  // Node boxes (cx, cy = centre, w, h)
  const boxes = [
    { id: "range",    cx: 130, cy: 160, w: 170, h: 110 },
    { id: "poseidon", cx: 380, cy: 160, w: 170, h: 110 },
    { id: "merkle",   cx: 630, cy: 160, w: 170, h: 110 },
  ];

  const [rangeBox, poseidonBox, merkleBox] = boxes;
  if (!rangeBox || !poseidonBox || !merkleBox) return null;

  // Edge definitions (from right edge → left edge of next node, curved)
  const edges = [
    {
      id:    "range-poseidon",
      x1: rangeBox.cx + rangeBox.w / 2, y1: rangeBox.cy,
      x2: poseidonBox.cx - poseidonBox.w / 2, y2: poseidonBox.cy,
      label: "u64s + gap",
      color: "#3b82f6",
    },
    {
      id:    "poseidon-merkle",
      x1: poseidonBox.cx + poseidonBox.w / 2, y1: poseidonBox.cy,
      x2: merkleBox.cx - merkleBox.w / 2, y2: merkleBox.cy,
      label: "hashes",
      color: "#22c55e",
    },
  ];

  // Floating input labels
  const inputs = [
    { text: "query_value",    x: 10,  y: 80,  targetId: "range" },
    { text: "low_leaf",       x: 10,  y: 108, targetId: "range" },
    { text: "path_indices",   x: 10,  y: 136, targetId: "range" },
    { text: "siblings[20]",   x: 260, y: 80,  targetId: "poseidon" },
    { text: "root (public)",  x: 500, y: 80,  targetId: "merkle" },
  ];

  // Output indicator
  const OUTPUT = { x: 718, y: 160, label: "verified_root" };

  return (
    <div className="w-full overflow-hidden rounded-xl border border-[#1e1e1e] bg-[#0d0d0d]">
      {/* Inline keyframes for edge animation */}
      <style>{`
        @keyframes edgeFlow {
          from { stroke-dashoffset: 24; }
          to   { stroke-dashoffset: 0; }
        }
        .edge-flow { animation: edgeFlow 1.2s linear infinite; }
      `}</style>

      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        className="w-full"
        style={{ maxHeight: 320 }}
        aria-label="Circuit constraint graph"
        role="img"
      >
        {/* Dot grid background */}
        <defs>
          <pattern id="dotgrid" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.8" fill="#1a1a1a" />
          </pattern>
        </defs>
        <rect x="0" y="0" width={VW} height={VH} fill="url(#dotgrid)" />

        {/* Input feed lines */}
        {inputs.map((inp) => {
          const box = boxes.find((b) => b.id === inp.targetId)!;
          const tx = box.cx - box.w / 2;
          const ty = box.cy;
          return (
            <g key={inp.text}>
              <line x1={inp.x + 70} y1={inp.y + 4} x2={tx} y2={ty}
                stroke="#1e1e1e" strokeWidth="1" strokeDasharray="3 3" />
              <text x={inp.x} y={inp.y + 5} fontSize="8" fill="#3e3e3e" fontFamily="ui-monospace,monospace">
                {inp.text}
              </text>
            </g>
          );
        })}

        {/* Output line */}
        <line x1={merkleBox.cx + merkleBox.w / 2} y1={merkleBox.cy}
          x2={OUTPUT.x - 10} y2={OUTPUT.y}
          stroke="#22c55e" strokeWidth="1" strokeDasharray="3 3" />
        <text x={OUTPUT.x + 2} y={OUTPUT.y + 5} fontSize="8" fill="#22c55e" fontFamily="ui-monospace,monospace">
          {OUTPUT.label}
        </text>

        {/* Edges */}
        {edges.map((e) => {
          const mx = (e.x1 + e.x2) / 2;
          const d = `M ${e.x1} ${e.y1} C ${mx} ${e.y1} ${mx} ${e.y2} ${e.x2} ${e.y2}`;
          return (
            <g key={e.id}>
              {/* Ghost track */}
              <path d={d} fill="none" stroke="#1e1e1e" strokeWidth="2" />
              {/* Animated flow */}
              <path
                d={d} fill="none" stroke={e.color} strokeWidth="1.5"
                strokeDasharray="6 6" className="edge-flow"
                opacity="0.6"
              />
              {/* Label */}
              <text
                x={(e.x1 + e.x2) / 2} y={e.y1 - 10}
                textAnchor="middle" fontSize="8"
                fill={e.color} fontFamily="ui-monospace,monospace" opacity="0.7"
              >
                {e.label}
              </text>
              {/* Arrowhead */}
              <polygon
                points={`${e.x2},${e.y2} ${e.x2 - 7},${e.y2 - 4} ${e.x2 - 7},${e.y2 + 4}`}
                fill={e.color} opacity="0.7"
              />
            </g>
          );
        })}

        {/* Node boxes */}
        {CIRCUIT_NODES.map((node) => {
          const box = boxes.find((b) => b.id === node.id)!;
          const x   = box.cx - box.w / 2;
          const y   = box.cy - box.h / 2;
          const isSelected = selectedId === node.id;
          const totalGates = node.gates.reduce((a, g) => a + g.count, 0);

          return (
            <g
              key={node.id}
              onClick={() => onSelect(node.id)}
              style={{ cursor: "pointer" }}
              role="button"
              aria-label={`Select ${node.label}`}
            >
              {/* Selection glow */}
              {isSelected && (
                <rect
                  x={x - 3} y={y - 3} width={box.w + 6} height={box.h + 6} rx="13"
                  fill="none" stroke={node.color} strokeWidth="1.5" opacity="0.4"
                />
              )}

              {/* Box background */}
              <rect
                x={x} y={y} width={box.w} height={box.h} rx="10"
                fill="#141414"
                stroke={isSelected ? node.color : "#262626"}
                strokeWidth={isSelected ? "1.5" : "1"}
              />

              {/* Header accent stripe */}
              <rect x={x} y={y} width={box.w} height={28} rx="10"
                fill={node.color} opacity="0.08" />
              <rect x={x} y={y + 18} width={box.w} height={10}
                fill={node.color} opacity="0.04" />

              {/* Color dot + label */}
              <circle cx={x + 14} cy={y + 14} r="3.5" fill={node.color} opacity="0.8" />
              <text x={x + 24} y={y + 19} fontSize="11" fontWeight="700"
                fill={isSelected ? node.color : "#ffffff"} fontFamily="ui-sans-serif,system-ui">
                {node.label}
              </text>

              {/* Sub label */}
              <text x={x + 10} y={y + 36} fontSize="7.5" fill="#3e3e3e" fontFamily="ui-monospace,monospace">
                {node.sub}
              </text>

              {/* Gate mini bar chart */}
              {(() => {
                const barAreaW = box.w - 20;
                const barAreaX = x + 10;
                const barAreaY = y + 48;
                const barAreaH = 24;
                let offsetX = 0;
                return (
                  <g>
                    {node.gates.map((g) => {
                      const segW = Math.round((g.count / totalGates) * barAreaW);
                      const rx = barAreaX + offsetX;
                      offsetX += segW;
                      return (
                        <rect
                          key={g.symbol}
                          x={rx} y={barAreaY} width={Math.max(segW - 1, 1)} height={8}
                          rx="2" fill={g.color} opacity="0.65"
                        />
                      );
                    })}
                    {/* Gate type chips */}
                    {node.gates.map((g, gi) => (
                      <g key={g.symbol}>
                        <text
                          x={barAreaX + gi * 32} y={barAreaY + 22}
                          fontSize="8.5" fontWeight="700"
                          fill={g.color} fontFamily="ui-monospace,monospace" opacity="0.9"
                        >
                          {g.symbol}
                        </text>
                        <text
                          x={barAreaX + gi * 32 + 8} y={barAreaY + 22}
                          fontSize="8" fill="#646464" fontFamily="ui-monospace,monospace"
                        >
                          ={g.count}
                        </text>
                      </g>
                    ))}
                  </g>
                );
              })()}

              {/* Total gate count */}
              <text
                x={x + box.w - 10} y={y + box.h - 8}
                textAnchor="end" fontSize="9" fontWeight="700"
                fill={node.color} fontFamily="ui-monospace,monospace" opacity="0.8"
              >
                {node.total} gates
              </text>
            </g>
          );
        })}

        {/* Grand total bar at bottom */}
        <text x={VW / 2} y={VH - 8} textAnchor="middle" fontSize="9"
          fill="#3e3e3e" fontFamily="ui-monospace,monospace">
          329 total gates · UltraHonk / Barretenberg · 20-level IMT
        </text>
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Circuit details panel
// ---------------------------------------------------------------------------

function CircuitDetailsPanel({ node }: { node: CircuitNode | null }) {
  if (!node) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-[#1e1e1e] bg-[#141414] p-6 text-center">
        <CircuitIcon className="h-8 w-8 text-[#262626]" />
        <div>
          <p className="text-[13px] font-semibold text-[#646464]">No node selected</p>
          <p className="mt-1 text-[11px] text-[#3e3e3e]">Click a node in the graph to inspect its constraint details.</p>
        </div>
      </div>
    );
  }

  const total = node.gates.reduce((a, g) => a + g.count, 0);

  return (
    <div className="rounded-xl border border-[#1e1e1e] bg-[#141414]">
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-[#1e1e1e] px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: node.color }} aria-hidden="true" />
        <h3 className="font-mono text-[11px] uppercase tracking-widest text-[#646464]">
          {node.label}
        </h3>
        <span className="ml-auto rounded border px-2 py-0.5 font-mono text-[10px]"
          style={{ borderColor: `${node.color}30`, color: node.color, backgroundColor: `${node.color}10` }}>
          {total} gates
        </span>
      </div>

      <div className="space-y-4 p-4">
        {/* Description */}
        <p className="text-[12px] leading-relaxed text-[#646464]">{node.description}</p>

        {/* Gate type distribution */}
        <div>
          <p className="mb-2 font-mono text-[9px] uppercase tracking-widest text-[#3e3e3e]">Gate Distribution</p>
          <div className="space-y-1.5">
            {node.gates.map((g) => {
              const pct = Math.round((g.count / total) * 100);
              return (
                <div key={g.symbol}>
                  <div className="flex items-center justify-between text-[10px]">
                    <span style={{ color: g.color }} className="font-mono font-semibold">{g.symbol}</span>
                    <span className="text-[#646464]">{g.label}</span>
                    <span className="font-mono" style={{ color: g.color }}>{g.count} <span className="text-[#3e3e3e]">({pct}%)</span></span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[#0d0d0d]">
                    <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, backgroundColor: g.color, opacity: 0.7 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sub-circuits */}
        <div>
          <p className="mb-2 font-mono text-[9px] uppercase tracking-widest text-[#3e3e3e]">Sub-circuits</p>
          <div className="rounded-lg border border-[#1a1a1a] bg-[#0d0d0d] p-3">
            {node.subcircuits.map((s, i) => (
              <p key={i} className="font-mono text-[10px] leading-[1.7] text-[#646464]">{s}</p>
            ))}
          </div>
        </div>

        {/* Data flow */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="mb-1.5 font-mono text-[9px] uppercase tracking-widest text-[#3e3e3e]">Inputs</p>
            <div className="space-y-1">
              {node.dataIn.map((d) => (
                <p key={d} className="flex items-center gap-1.5 font-mono text-[10px] text-[#646464]">
                  <span className="h-1 w-1 shrink-0 rounded-full" style={{ backgroundColor: node.color, opacity: 0.5 }} />
                  {d}
                </p>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 font-mono text-[9px] uppercase tracking-widest text-[#3e3e3e]">Outputs</p>
            <div className="space-y-1">
              {node.dataOut.map((d) => (
                <p key={d} className="flex items-center gap-1.5 font-mono text-[10px] text-[#a0a0a0]">
                  <span className="h-1 w-1 shrink-0 rounded-full" style={{ backgroundColor: node.color, opacity: 0.8 }} />
                  {d}
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gate totals summary bar
// ---------------------------------------------------------------------------

function GateSummaryBar() {
  const gates = [
    { symbol: "A", label: "Arithmetic",   count: 105, color: "#60a5fa", pct: 32 },
    { symbol: "R", label: "Range lookup", count: 112, color: "#f59e0b", pct: 34 },
    { symbol: "L", label: "Linear comb.", count: 91,  color: "#a78bfa", pct: 28 },
    { symbol: "B", label: "Boolean",      count: 20,  color: "#fb923c", pct: 6  },
    { symbol: "E", label: "Equality",     count: 1,   color: "#4ade80", pct: 0  },
  ];

  return (
    <div className="rounded-xl border border-[#1e1e1e] bg-[#141414] p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-mono text-[11px] uppercase tracking-widest text-[#646464]">Total Gate Budget — 329 gates</p>
        <span className="font-mono text-[10px] text-[#3e3e3e]">UltraHonk · Barretenberg</span>
      </div>

      {/* Stacked bar */}
      <div className="flex h-3 w-full overflow-hidden rounded-full">
        {gates.map((g) => (
          <div key={g.symbol} className="h-full" style={{ width: `${g.count / 329 * 100}%`, backgroundColor: g.color, opacity: 0.7 }} />
        ))}
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {gates.map((g) => (
          <div key={g.symbol} className="flex items-center gap-1.5">
            <span className="font-mono text-[11px] font-bold" style={{ color: g.color }}>{g.symbol}</span>
            <span className="text-[10px] text-[#646464]">{g.label}</span>
            <span className="font-mono text-[10px]" style={{ color: g.color }}>{g.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Protocol page
// ---------------------------------------------------------------------------

type Tab = "stats" | "circuit";

export function Protocol() {
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

  const { snapshot, isLoading: bmLoading, isError: bmError, refetch: bmRefetch } = useBenchmarks();
  const { copied, copy } = useCopy();

  useEffect(() => {
    if (isStale || sanctionsStatus === "idle") void fetchAll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [spinning, setSpinning] = useState(false);
  const handleRefresh = useCallback(async () => {
    setSpinning(true);
    await fetchAll();
    setSpinning(false);
  }, [fetchAll]);

  const [vis, setVis] = useState(false);
  useEffect(() => { const id = setTimeout(() => setVis(true), 40); return () => clearTimeout(id); }, []);

  const [tab, setTab] = useState<Tab>("stats");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const isLoading = sanctionsStatus === "idle" || sanctionsStatus === "loading";

  return (
    <div className={["flex flex-col gap-5 p-4 pb-12 sm:p-6 lg:p-8 transition-all duration-500", vis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"].join(" ")}>

      {/* ── Page header ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[20px] font-bold tracking-tight text-white">Protocol</h1>
          <p className="mt-0.5 text-[13px] text-[#646464]">Live on-chain stats · {SUPPORTED_CHAIN_NAME}</p>
        </div>
        <div className="flex items-center gap-2">
          {lastFetchedAt && (
            <span className="text-[10px] text-[#3e3e3e]">
              Updated {timeAgo(BigInt(Math.floor(lastFetchedAt / 1000)))}
            </span>
          )}
          <button
            onClick={handleRefresh}
            aria-label="Refresh protocol data"
            className="flex items-center gap-1.5 rounded-lg border border-[#262626] bg-[#141414] px-3 py-1.5 text-[11px] font-medium text-[#646464] transition-colors hover:border-[#3e3e3e] hover:text-[#a0a0a0] focus-visible:outline-none"
          >
            <span className={spinning ? "animate-spin" : ""}><RefreshIcon className="h-3 w-3" /></span>
            Refresh
          </button>
        </div>
      </div>

      {/* ── Tab bar ─────────────────────────────────────────────────── */}
      <div className="flex gap-1 rounded-xl border border-[#1e1e1e] bg-[#0d0d0d] p-1">
        {([ ["stats", "Statistics", StatsIcon], ["circuit", "Circuit Explorer", CircuitIcon] ] as const).map(
          ([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setTab(id as Tab)}
              className={[
                "flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-semibold transition-all duration-200 focus-visible:outline-none",
                tab === id
                  ? "bg-[#1e1e1e] text-white"
                  : "text-[#646464] hover:text-[#a0a0a0]",
              ].join(" ")}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          )
        )}
      </div>

      {/* ── Paused / error banners ───────────────────────────────────── */}
      {paused && (
        <div className="flex items-center gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
          <AlertIcon className="h-4 w-4 shrink-0 text-amber-400" />
          <p className="text-[12px] text-amber-400">
            Contract submissions are currently <strong>paused</strong> by the protocol admin.
          </p>
        </div>
      )}
      {sanctionsStatus === "error" && sanctionsError && (
        <div className="flex items-center gap-2.5 rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-3">
          <AlertIcon className="h-4 w-4 shrink-0 text-rose-400" />
          <p className="text-[12px] text-rose-400">{sanctionsError}</p>
          <button onClick={handleRefresh} className="ml-auto text-[11px] font-semibold text-rose-400 underline underline-offset-2 hover:text-rose-300 focus-visible:outline-none">
            Retry
          </button>
        </div>
      )}

      {/* ═══════════════════════ STATISTICS TAB ═══════════════════════ */}
      {tab === "stats" && (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiCard
              label="Sanctioned Addresses"
              value={addressCount !== null ? Number(addressCount).toLocaleString() : "—"}
              sub="in current snapshot"
              icon={<UsersIcon className="h-4 w-4" />}
              loading={isLoading}
            />
            <KpiCard
              label="Validity Window"
              value={validityWindow !== null ? formatSeconds(validityWindow) : "—"}
              sub="per attestation"
              icon={<ClockIcon className="h-4 w-4" />}
              accent="green"
              loading={isLoading}
            />
            <KpiCard
              label="Last Updated"
              value={lastUpdatedAt !== null && lastUpdatedAt > 0n ? timeAgo(lastUpdatedAt) : "—"}
              {...(lastUpdatedAt !== null && lastUpdatedAt > 0n
                ? { sub: formatTs(lastUpdatedAt) }
                : {})}
              icon={<CalendarIcon className="h-4 w-4" />}
              loading={isLoading}
            />
            <KpiCard
              label="Protocol Status"
              value={isLoading ? "—" : paused ? "Paused" : isOperational ? "Operational" : "Degraded"}
              sub={paused ? "submissions disabled" : isOperational ? "accepting proofs" : "check network"}
              icon={<PulseIcon className="h-4 w-4" />}
              accent={isLoading ? "neutral" : paused ? "amber" : isOperational ? "green" : "rose"}
              loading={isLoading}
            />
          </div>

          {/* Live root strip */}
          {currentRoot && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#1e1e1e] bg-[#141414] px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#22c55e]" aria-hidden="true" />
                <span className="font-mono text-[9px] uppercase tracking-widest text-[#3e3e3e]">Live Merkle Root</span>
              </div>
              <span className="font-mono text-[11px] text-[#4ade80]">{formatHash(currentRoot, 20, 16)}</span>
              <button
                onClick={() => copy(currentRoot, "liveroot")}
                className={[
                  "rounded border px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wide transition-all focus-visible:outline-none",
                  copied === "liveroot"
                    ? "border-[#22c55e]/20 bg-[#22c55e]/8 text-[#22c55e]"
                    : "border-[#262626] bg-[#1a1a1a] text-[#646464] hover:border-[#3e3e3e] hover:text-[#a0a0a0]",
                ].join(" ")}
              >
                {copied === "liveroot" ? "✓ Copied" : "Copy"}
              </button>
              <div className="ml-auto flex items-center gap-3 text-[10px] text-[#3e3e3e]">
                <span className="font-mono">{formatHash(SANCTIONS_LIST_ADDRESS, 8, 6)}</span>
                <span>{SUPPORTED_CHAIN_NAME}</span>
              </div>
            </div>
          )}

          {/* Root history + benchmark grid */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_400px]">
            {/* Root history */}
            <div className="rounded-xl border border-[#1e1e1e] bg-[#141414]">
              <div className="flex items-center gap-2 border-b border-[#1e1e1e] px-4 py-3">
                <HistoryIcon className="h-3.5 w-3.5 text-[#646464]" />
                <h2 className="font-mono text-[11px] uppercase tracking-widest text-[#646464]">Root History</h2>
                <span className="ml-auto text-[10px] text-[#3e3e3e]">Last {rootHistory.length} snapshots</span>
              </div>
              <div className="p-4">
                {isLoading ? (
                  <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="flex gap-3">
                        <div className="h-4 w-4 animate-pulse rounded bg-[#1e1e1e]" />
                        <div className="h-4 flex-1 animate-pulse rounded bg-[#1a1a1a]" style={{ opacity: 1 - i * 0.15 }} />
                        <div className="h-4 w-24 animate-pulse rounded bg-[#1a1a1a]" style={{ opacity: 1 - i * 0.15 }} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <RootHistoryTable roots={rootHistory} currentRoot={currentRoot} copied={copied} copy={copy} />
                )}
              </div>
            </div>

            {/* Benchmark chart */}
            <div className="rounded-xl border border-[#1e1e1e] bg-[#141414]">
              <div className="flex items-center gap-2 border-b border-[#1e1e1e] px-4 py-3">
                <ChartIcon className="h-3.5 w-3.5 text-[#646464]" />
                <h2 className="font-mono text-[11px] uppercase tracking-widest text-[#646464]">Prover Benchmarks</h2>
                {snapshot && (
                  <div className="ml-auto flex items-center gap-2">
                    <span className="rounded border border-[#262626] bg-[#0d0d0d] px-2 py-0.5 font-mono text-[9px] text-[#646464]">
                      v{snapshot.version}
                    </span>
                    <button onClick={bmRefetch} className="text-[#3e3e3e] hover:text-[#646464] focus-visible:outline-none">
                      <RefreshIcon className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>

              {bmLoading && (
                <div className="space-y-3 p-4">
                  <div className="flex items-end gap-3 h-28">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="flex flex-1 items-end gap-1">
                        {[...Array(3)].map((__, j) => (
                          <div key={j} className="flex-1 animate-pulse rounded-sm bg-[#1e1e1e]" style={{ height: `${28 + (i + j) * 10}px` }} />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {bmError && (
                <div className="flex flex-col items-center gap-2 p-6 text-center">
                  <AlertIcon className="h-5 w-5 text-[#3e3e3e]" />
                  <p className="text-[12px] text-[#646464]">Benchmark data unavailable</p>
                  <p className="text-[10px] text-[#3e3e3e]">
                    Place <code className="font-mono text-[#646464]">benchmarks.json</code> in <code className="font-mono">/public</code>
                  </p>
                  <button onClick={bmRefetch} className="mt-1 text-[11px] font-medium text-[#646464] underline underline-offset-2 hover:text-[#a0a0a0] focus-visible:outline-none">Retry</button>
                </div>
              )}

              {snapshot && !bmLoading && (
                <div className="p-4">
                  <div className="mb-4 flex flex-wrap gap-2">
                    <span className="rounded border border-[#1e1e1e] bg-[#0d0d0d] px-2.5 py-1 font-mono text-[9px] text-[#646464]">
                      {snapshot.environment}
                    </span>
                    <span className="rounded border border-[#1e1e1e] bg-[#0d0d0d] px-2.5 py-1 font-mono text-[9px] text-[#646464]">
                      {new Date(snapshot.capturedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <BenchmarkChart entries={snapshot.entries} />
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[280px]">
                      <thead>
                        <tr className="border-b border-[#1e1e1e]">
                          {["Step", "Median", "p95", "p99", "n"].map((h) => (
                            <th key={h} className="pb-1.5 pr-3 text-left font-mono text-[9px] uppercase tracking-widest text-[#3e3e3e]">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {snapshot.entries.map((e) => (
                          <tr key={e.label} className="border-b border-[#0d0d0d]">
                            <td className="py-2 pr-3 text-[10px] text-[#a0a0a0]">{e.label}</td>
                            <td className="py-2 pr-3 font-mono text-[10px] text-[#22c55e]">{msLabel(e.medianMs)}</td>
                            <td className="py-2 pr-3 font-mono text-[10px] text-amber-400">{msLabel(e.p95Ms)}</td>
                            <td className="py-2 pr-3 font-mono text-[10px] text-pink-400">{msLabel(e.p99Ms)}</td>
                            <td className="py-2 font-mono text-[10px] text-[#646464]">{e.samples.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Contracts footer */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {[
              { label: "ComplianceGate", address: COMPLIANCE_GATE_ADDRESS },
              { label: "SanctionsList",  address: SANCTIONS_LIST_ADDRESS  },
            ].map(({ label, address }) => {
              const ck = `footer-${label}`;
              const explorerHref = BLOCK_EXPLORER_URL ? `${BLOCK_EXPLORER_URL}/address/${address}` : null;
              return (
                <div key={label} className="flex items-center gap-3 rounded-xl border border-[#1e1e1e] bg-[#141414] px-4 py-3">
                  <ContractIcon className="h-3.5 w-3.5 shrink-0 text-[#3e3e3e]" />
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[9px] uppercase tracking-widest text-[#3e3e3e]">{label}</p>
                    <p className="mt-0.5 truncate font-mono text-[10px] text-[#646464]">{address || "Not configured"}</p>
                  </div>
                  {address && (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => copy(address, ck)}
                        className={[
                          "rounded border px-1.5 py-0.5 font-mono text-[8px] font-semibold uppercase tracking-wide transition-all focus-visible:outline-none",
                          copied === ck ? "border-[#22c55e]/20 text-[#22c55e]" : "border-[#262626] text-[#3e3e3e] hover:border-[#3e3e3e] hover:text-[#646464]",
                        ].join(" ")}
                      >
                        {copied === ck ? "✓" : "Copy"}
                      </button>
                      {explorerHref && (
                        <a href={explorerHref} target="_blank" rel="noopener noreferrer"
                          className="rounded p-0.5 text-[#3e3e3e] hover:text-[#646464] focus-visible:outline-none">
                          <ExternalIcon className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ═══════════════════════ CIRCUIT EXPLORER TAB ══════════════════ */}
      {tab === "circuit" && (
        <>
          {/* Gate budget summary */}
          <GateSummaryBar />

          {/* Graph + details grid */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
            <div className="flex flex-col gap-3">
              <CircuitGraph selectedId={selectedNodeId} onSelect={setSelectedNodeId} />
              <p className="text-center text-[11px] text-[#3e3e3e]">
                Click a node to inspect its constraint breakdown
              </p>
            </div>
            <CircuitDetailsPanel node={CIRCUIT_NODES.find((n) => n.id === selectedNodeId) ?? null} />
          </div>

          {/* Circuit metadata strip */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: "Proving system",  value: "UltraHonk" },
              { label: "Backend",         value: "Barretenberg" },
              { label: "Tree depth",      value: "20 levels" },
              { label: "Hash function",   value: "hash_pair (deg 2)" },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg border border-[#1e1e1e] bg-[#141414] px-3.5 py-3">
                <p className="font-mono text-[9px] uppercase tracking-widest text-[#3e3e3e]">{label}</p>
                <p className="mt-1 font-mono text-[12px] font-semibold text-[#a0a0a0]">{value}</p>
              </div>
            ))}
          </div>

          {/* Public inputs */}
          <div className="rounded-xl border border-[#1e1e1e] bg-[#141414]">
            <div className="flex items-center gap-2 border-b border-[#1e1e1e] px-4 py-3">
              <SignalIcon className="h-3.5 w-3.5 text-[#646464]" />
              <h3 className="font-mono text-[11px] uppercase tracking-widest text-[#646464]">Signal Interface</h3>
            </div>
            <div className="grid grid-cols-1 gap-0 p-4 sm:grid-cols-2">
              <div className="sm:border-r sm:border-[#1e1e1e] sm:pr-4">
                <p className="mb-2 font-mono text-[9px] uppercase tracking-widest text-[#3e3e3e]">Private witness (hidden)</p>
                <div className="space-y-1">
                  {[
                    ["query_value",          "u64",       "address hash being tested"],
                    ["low_leaf_value",        "u64",       "largest leaf strictly < query"],
                    ["low_leaf_next_value",   "u64",       "next-pointer value"],
                    ["low_leaf_next_index",   "u64",       "next-pointer index"],
                    ["siblings[20]",          "Field[20]", "Merkle auth path"],
                    ["path_indices[20]",      "bool[20]",  "left/right direction per level"],
                  ].map(([name, type, desc]) => (
                    <div key={name} className="flex items-baseline gap-2">
                      <span className="w-44 shrink-0 font-mono text-[10px] text-[#4ade80]">{name}</span>
                      <span className="w-20 shrink-0 font-mono text-[10px] text-blue-400">{type}</span>
                      <span className="text-[10px] text-[#3e3e3e]">{desc}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-4 sm:mt-0 sm:pl-4">
                <p className="mb-2 font-mono text-[9px] uppercase tracking-widest text-[#3e3e3e]">Public input (revealed)</p>
                <div className="space-y-1">
                  {[
                    ["root", "pub Field", "IMT Merkle root (on-chain)"],
                  ].map(([name, type, desc]) => (
                    <div key={name} className="flex items-baseline gap-2">
                      <span className="w-20 shrink-0 font-mono text-[10px] text-amber-400">{name}</span>
                      <span className="w-20 shrink-0 font-mono text-[10px] text-blue-400">{type}</span>
                      <span className="text-[10px] text-[#3e3e3e]">{desc}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4">
                  <p className="mb-2 font-mono text-[9px] uppercase tracking-widest text-[#3e3e3e]">Proving statement</p>
                  <p className="rounded-lg border border-[#1a1a1a] bg-[#0d0d0d] p-3 font-mono text-[10px] leading-relaxed text-[#646464]">
                    "I know a low-leaf record strictly below the queried address in a sorted IMT, and that record authenticates to a known root — therefore the address is absent."
                  </p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default Protocol;

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function AlertIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 14 14" className={className ?? "h-3.5 w-3.5"} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 1.5L1.5 11.5h11L7 1.5z" /><path d="M7 6v3M7 10.5v.5" /></svg>;
}
function UsersIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 14 14" className={className ?? "h-3.5 w-3.5"} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="5" cy="4.5" r="2" /><path d="M1.5 12c0-2 1.5-3 3.5-3s3.5 1 3.5 3" /><circle cx="10" cy="4.5" r="1.5" /><path d="M10 8c1.5 0 2.5.8 2.5 2" /></svg>;
}
function ClockIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 14 14" className={className ?? "h-3.5 w-3.5"} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="7" cy="7" r="5.5" /><path d="M7 4.5V7l2 1.5" /></svg>;
}
function CalendarIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 14 14" className={className ?? "h-3.5 w-3.5"} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="1.5" y="3" width="11" height="10" rx="1.5" /><path d="M1.5 6.5h11M5 2v2M9 2v2" /></svg>;
}
function PulseIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 14 14" className={className ?? "h-3.5 w-3.5"} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 7h2l2-4 2 8 2-5 1.5 3H13" /></svg>;
}
function HistoryIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 14 14" className={className ?? "h-3.5 w-3.5"} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2.5 7A4.5 4.5 0 1 0 4 3.5" /><path d="M2 2v3h3M7 5v3l2 1.5" /></svg>;
}
function ChartIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 14 14" className={className ?? "h-3.5 w-3.5"} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1.5 12.5v-5l3-3 3 3 4-5v10M1.5 12.5h11" /></svg>;
}
function RefreshIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 12 12" className={className ?? "h-3 w-3"} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 6A4 4 0 1 1 6 2" /><path d="M6 2l2-2M6 2l2 2" /></svg>;
}
function ExternalIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 12 12" className={className ?? "h-3 w-3"} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 2H2v8h8V7M7 2h3v3M6 6l4-4" /></svg>;
}
function ContractIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 14 14" className={className ?? "h-3.5 w-3.5"} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 2h6l2 2v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" /><path d="M8 2v3h3M5 7h4M5 9h3" /></svg>;
}
function StatsIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 14 14" className={className ?? "h-3.5 w-3.5"} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="8" width="2.5" height="4.5" rx="0.5" /><rect x="5.75" y="5" width="2.5" height="7.5" rx="0.5" /><rect x="9.5" y="2" width="2.5" height="10.5" rx="0.5" /></svg>;
}
function CircuitIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 14 14" className={className ?? "h-3.5 w-3.5"} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="1.5" y="4.5" width="3" height="5" rx="0.75" /><rect x="5.5" y="2.5" width="3" height="9" rx="0.75" /><rect x="9.5" y="4.5" width="3" height="5" rx="0.75" /><path d="M4.5 7h1M8.5 7h1" /></svg>;
}
function SignalIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 14 14" className={className ?? "h-3.5 w-3.5"} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 7h2l2-4 2 8 2-5 1.5 3H13" /></svg>;
}
