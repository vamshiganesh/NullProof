// frontend/src/pages/ProofGenerate.tsx
//
// Route: /app/proof/generate
//
// Two-column full-height layout:
//   Left  — IMT proof-path canvas (SVG tree, animated nodes/edges)
//   Right — Step pipeline + live progress + circuit stats

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
  selectProofSteps,
  selectProofError,
  selectProofResult,
  type ProofStep,
  type StepState,
} from "@/store/proofStore";
import { useWalletStore, selectAddress }      from "@/store/walletStore";
import { useSanctionsStore, selectCurrentRoot } from "@/store/sanctionsStore";
import { formatHash }                          from "@/lib/format";
import { MERKLE_TREE_DEPTH }                   from "@/lib/constants";
import type { ProveResult, WorkerOutMessage, WitnessData } from "@/lib/prover/proofWorker";

// ---------------------------------------------------------------------------
// Web Worker hook
// ---------------------------------------------------------------------------

function useProofWorker() {
  const workerRef = useRef<Worker | null>(null);

  const {
    startGeneration, setStepActive, setStepDone,
    setStepError, setGenerated, setError, reset,
  } = useProofStore();

  const status  = useProofStore(selectProofStatus);
  const isBusy  = status === "generating";
  const [witnessData, setWitnessData] = useState<WitnessData | null>(null);

  const terminate = useCallback(() => {
    if (workerRef.current) { workerRef.current.terminate(); workerRef.current = null; }
  }, []);

  useEffect(() => () => terminate(), [terminate]);

  const prove = useCallback(
    (address: string) => {
      if (isBusy) return;
      terminate();
      setWitnessData(null);
      startGeneration();

      const worker = new Worker(
        new URL("../lib/prover/proofWorker.ts", import.meta.url),
        { type: "module" },
      );
      workerRef.current = worker;

      worker.onmessage = (e: MessageEvent<WorkerOutMessage>) => {
        const msg = e.data;
        if (msg.type === "STEP") {
          const { stepId, state } = msg.payload;
          if (state === "active")      setStepActive(stepId);
          else if (state === "done")   setStepDone(stepId);
          else if (state === "error")  setStepError(stepId);
        }
        if (msg.type === "DONE") {
          const r = msg.payload;
          setWitnessData(r.witness);
          setGenerated({
            proof:        r.proofHex as `0x${string}`,
            publicInputs: r.publicInputs as `0x${string}`[],
            nullifier:    r.nullifier as `0x${string}`,
            rootUsed:     r.rootUsed as `0x${string}`,
            generatedAt:  r.generatedAt,
          });
          terminate();
        }
        if (msg.type === "ERROR") { setError(msg.payload.message); terminate(); }
      };

      worker.onerror = (e) => { setError(e.message ?? "Worker crashed"); terminate(); };
      worker.postMessage({ type: "PROVE", payload: { address } });
    },
    [isBusy, startGeneration, setStepActive, setStepDone, setStepError,
     setGenerated, setError, terminate],
  );

  return { prove, reset, isBusy, witnessData, terminate };
}

// ---------------------------------------------------------------------------
// IMT Visualizer — left panel (full height SVG canvas)
// ---------------------------------------------------------------------------

interface IMTVisualizerProps {
  address:    string | null;
  witness:    WitnessData | null;
  proofState: StepState | "idle";
  rootHash:   string | null;
}

const DISPLAY_DEPTH = 5;

interface VisNode {
  id: string; level: number; indexInLevel: number; totalInLevel: number;
  x: number; y: number; isOnPath: boolean; isLeaf: boolean;
  isProver: boolean; value: string | null;
}
interface VisEdge {
  id: string; x1: number; y1: number; x2: number; y2: number; onPath: boolean;
}

function buildVisTree(
  witness: WitnessData | null, address: string | null,
  rootHash: string | null, svgW: number, svgH: number,
): { nodes: VisNode[]; edges: VisEdge[] } {
  const nodes: VisNode[] = [];
  const edges: VisEdge[] = [];
  const PAD_X = 48, PAD_Y = 44;
  const usableW = svgW - PAD_X * 2;
  const usableH = svgH - PAD_Y * 2;
  const levelH  = usableH / DISPLAY_DEPTH;

  const pathIndices = witness?.pathIndices ?? [];
  const leafIndex   = witness?.leafIndex   ?? 0;
  const siblings    = witness?.merklePath  ?? [];

  const onPathIndexAtLevel: number[] = [];
  let running = leafIndex;
  for (let l = 0; l <= DISPLAY_DEPTH; l++) {
    onPathIndexAtLevel.push(running);
    running = Math.floor(running / 2);
  }

  for (let lvl = 0; lvl <= DISPLAY_DEPTH; lvl++) {
    const displayLevel = DISPLAY_DEPTH - lvl;
    const nodesAtLevel = Math.pow(2, DISPLAY_DEPTH - lvl);
    const visCount     = Math.min(nodesAtLevel, Math.pow(2, Math.min(DISPLAY_DEPTH - lvl, DISPLAY_DEPTH)));
    const stepX        = usableW / (visCount - 1 || 1);
    const y            = PAD_Y + displayLevel * levelH;
    const onPathIdx    = onPathIndexAtLevel[lvl] ?? 0;
    const siblingIdx   = (pathIndices[lvl - 1] === 1) ? onPathIdx - 1 : onPathIdx + 1;

    for (let i = 0; i < visCount; i++) {
      const x         = visCount === 1 ? svgW / 2 : PAD_X + i * stepX;
      const isOnPath  = i === onPathIdx;
      const isLeaf    = lvl === 0;
      const isProver  = isLeaf && isOnPath;
      const isSibling = !isOnPath && (i === siblingIdx);

      let value: string | null = null;
      if (lvl === DISPLAY_DEPTH && rootHash) value = formatHash(rootHash, 6, 4);
      else if (isLeaf && isProver && address)  value = formatHash(address, 6, 4);
      else if (isLeaf && isSibling && siblings[0]) value = formatHash(siblings[0], 6, 4);

      nodes.push({ id: `n-${lvl}-${i}`, level: lvl, indexInLevel: i,
        totalInLevel: visCount, x, y, isOnPath, isLeaf, isProver, value });
    }
  }

  for (let lvl = 0; lvl < DISPLAY_DEPTH; lvl++) {
    const childCount  = Math.min(Math.pow(2, DISPLAY_DEPTH - lvl), 32);
    const parentCount = Math.min(Math.pow(2, DISPLAY_DEPTH - lvl - 1), 32);
    const onPathChildIdx  = onPathIndexAtLevel[lvl]     ?? 0;
    const onPathParentIdx = onPathIndexAtLevel[lvl + 1] ?? 0;
    for (let ci = 0; ci < childCount; ci++) {
      const pi = Math.floor(ci / 2);
      if (pi >= parentCount) continue;
      const child  = nodes.find((n) => n.level === lvl     && n.indexInLevel === ci);
      const parent = nodes.find((n) => n.level === lvl + 1 && n.indexInLevel === pi);
      if (!child || !parent) continue;
      edges.push({
        id: `e-${lvl}-${ci}`, x1: child.x, y1: child.y, x2: parent.x, y2: parent.y,
        onPath: ci === onPathChildIdx && pi === onPathParentIdx,
      });
    }
  }

  return { nodes, edges };
}

function IMTVisualizer({ address, witness, proofState, rootHash }: IMTVisualizerProps) {
  const svgRef  = useRef<SVGSVGElement>(null);
  const [dims, setDims]       = useState({ w: 520, h: 420 });
  const [hovered, setHovered] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = svgRef.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setDims({ w: entry.contentRect.width || 520, h: entry.contentRect.height || 420 });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (witness) { const id = setTimeout(() => setRevealed(true), 100); return () => clearTimeout(id); }
    setRevealed(false);
  }, [witness]);

  const { nodes, edges } = buildVisTree(witness, address, rootHash, dims.w, dims.h);
  const isProving = proofState === "active";

  return (
    <div className="relative h-full w-full select-none overflow-hidden">
      {/* Dot-grid background */}
      <svg
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        width={dims.w} height={dims.h} aria-hidden="true"
      >
        <defs>
          <pattern id="imt-dots" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.8" fill="white" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#imt-dots)" />
      </svg>

      {/* Main SVG */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${dims.w} ${dims.h}`}
        width={dims.w} height={dims.h}
        className="relative"
        role="img"
        aria-label="Incremental Merkle Tree proof path"
      >
        <defs>
          <filter id="glow-green" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="glow-gold" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Edges */}
        {edges.map((e) => (
          <line
            key={e.id}
            x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
            stroke={e.onPath ? "rgba(34,197,94,0.4)" : "rgba(60,60,60,0.7)"}
            strokeWidth={e.onPath ? 1.6 : 0.8}
            strokeDasharray={e.onPath && isProving ? "5 3" : undefined}
            className={e.onPath && isProving ? "animate-[dash_1s_linear_infinite]" : ""}
            style={revealed
              ? { opacity: 1, transition: "opacity 0.4s ease" }
              : { opacity: 0 }}
          />
        ))}

        {/* Nodes */}
        {nodes.map((node) => {
          const isHov = hovered === node.id;
          const r = node.isProver ? 10 : node.level === DISPLAY_DEPTH ? 11 : node.isOnPath ? 7 : 4.5;

          const fill = node.isProver
            ? "rgba(34,197,94,0.15)"
            : node.level === DISPLAY_DEPTH
            ? "rgba(251,191,36,0.12)"
            : node.isOnPath
            ? "rgba(34,197,94,0.08)"
            : "rgba(30,30,30,0.9)";

          const stroke = node.isProver
            ? (isProving ? "#22c55e" : "#4ade80")
            : node.level === DISPLAY_DEPTH
            ? "#fbbf24"
            : node.isOnPath
            ? "#22c55e"
            : "#2e2e2e";

          const strokeW = node.isProver ? 1.8 : node.level === DISPLAY_DEPTH ? 1.8 : node.isOnPath ? 1.4 : 0.8;
          const glowFilter = node.isProver ? "url(#glow-green)" : node.level === DISPLAY_DEPTH ? "url(#glow-gold)" : undefined;
          const delay = `${node.level * 45 + node.indexInLevel * 10}ms`;

          return (
            <g
              key={node.id}
              transform={`translate(${node.x},${node.y})`}
              onMouseEnter={() => setHovered(node.id)}
              onMouseLeave={() => setHovered(null)}
              style={{
                opacity: revealed ? 1 : 0,
                transition: `opacity 0.3s ease ${delay}, transform 0.3s cubic-bezier(0.34,1.56,0.64,1) ${delay}`,
              }}
            >
              {/* Ping ring on prover leaf while proving */}
              {node.isProver && isProving && (
                <circle r={r + 7} fill="none" stroke="rgba(34,197,94,0.15)" strokeWidth="1.5" className="animate-ping" />
              )}

              {/* Outer glow ring for path nodes */}
              {(node.isOnPath || node.level === DISPLAY_DEPTH) && !node.isProver && (
                <circle r={r + 3} fill="none"
                  stroke={node.level === DISPLAY_DEPTH ? "rgba(251,191,36,0.12)" : "rgba(34,197,94,0.1)"}
                  strokeWidth="1"
                />
              )}

              {/* Main circle */}
              <circle
                r={r}
                fill={fill}
                stroke={stroke}
                strokeWidth={isHov ? strokeW + 0.6 : strokeW}
                filter={glowFilter}
                style={{ transition: "stroke-width 0.15s ease" }}
              />

              {/* Done checkmark */}
              {node.isProver && proofState === "done" && (
                <path d="M-3.5,0 l2.5,2.5 5,-5" fill="none" stroke="#22c55e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              )}

              {/* Root star */}
              {node.level === DISPLAY_DEPTH && (
                <text textAnchor="middle" dominantBaseline="central" fontSize="7" fill="#fbbf24" fontFamily="monospace">★</text>
              )}

              {/* Tooltip label */}
              {(isHov || node.isProver || node.level === DISPLAY_DEPTH) && node.value && (
                <g>
                  <rect x={-40} y={r + 4} width={80} height={14} rx={3}
                    fill="rgba(10,10,10,0.92)"
                    stroke={node.isProver ? "#22c55e" : node.level === DISPLAY_DEPTH ? "#fbbf24" : "#262626"}
                    strokeWidth={0.6}
                  />
                  <text textAnchor="middle" y={r + 13.5} fontSize="6.5" fontFamily="monospace"
                    fill={node.isProver ? "#4ade80" : node.level === DISPLAY_DEPTH ? "#fde68a" : "#a0a0a0"}
                  >{node.value}</text>
                </g>
              )}

              {/* YOU badge */}
              {node.isProver && (
                <g transform={`translate(${r + 3},${-r - 3})`}>
                  <rect x={0} y={-8} width={22} height={9} rx={2}
                    fill="rgba(34,197,94,0.12)" stroke="#22c55e" strokeWidth={0.8}
                  />
                  <text x={11} y={-1} textAnchor="middle" fontSize="5.5" fontFamily="sans-serif"
                    fontWeight="700" fill="#4ade80" letterSpacing="0.5">YOU</text>
                </g>
              )}
            </g>
          );
        })}

        {/* Level labels */}
        {Array.from({ length: DISPLAY_DEPTH + 1 }, (_, i) => {
          const displayLevel = DISPLAY_DEPTH - i;
          const label = i === 0 ? "leaf" : i === DISPLAY_DEPTH ? "root" : `L${i}`;
          const y = 44 + displayLevel * ((dims.h - 88) / DISPLAY_DEPTH);
          return (
            <text key={i} x={8} y={y} dominantBaseline="middle"
              fontSize="7" fontFamily="monospace" fill="#3e3e3e"
              style={{ opacity: revealed ? 1 : 0, transition: `opacity 0.5s ease ${i * 30}ms` }}
            >{label}</text>
          );
        })}

        {/* Waiting overlay */}
        {!witness && (
          <g>
            <text x={dims.w / 2} y={dims.h / 2 - 12} textAnchor="middle"
              fontSize="12" fontFamily="sans-serif" fill="#3e3e3e">
              Fetching Merkle witness…
            </text>
            <text x={dims.w / 2} y={dims.h / 2 + 10} textAnchor="middle"
              fontSize="9" fontFamily="monospace" fill="#262626">
              {address ? formatHash(address, 8, 6) : "—"}
            </text>
          </g>
        )}
      </svg>

      {/* Legend */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1.5 rounded-lg border border-[#1e1e1e] bg-[#0d0d0d]/80 px-3 py-2.5 backdrop-blur-sm">
        {[
          { color: "#4ade80", label: "Your address" },
          { color: "#22c55e", label: "Proof path" },
          { color: "#fbbf24", label: "Merkle root" },
          { color: "#2e2e2e", label: "Sibling nodes" },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
            <span className="text-[9px] text-[#646464]">{label}</span>
          </div>
        ))}
      </div>

      {/* Depth badge */}
      <div className="absolute left-4 top-4 flex items-center gap-1.5 rounded-lg border border-[#1e1e1e] bg-[#0d0d0d]/80 px-2.5 py-1.5 backdrop-blur-sm">
        <span className="font-mono text-[10px] text-[#646464]">depth</span>
        <span className="font-mono text-[10px] font-semibold text-[#a0a0a0]">{MERKLE_TREE_DEPTH}</span>
        <span className="text-[#2e2e2e]">·</span>
        <span className="font-mono text-[10px] text-[#646464]">showing</span>
        <span className="font-mono text-[10px] font-semibold text-[#a0a0a0]">{DISPLAY_DEPTH}</span>
      </div>

      {/* Leaf badge when witness ready */}
      {witness && (
        <div className="absolute left-4 top-14 flex items-center gap-1.5 rounded-lg border border-[#22c55e]/20 bg-[#22c55e]/8 px-2.5 py-1.5">
          <span className="font-mono text-[10px] text-[#646464]">leaf</span>
          <span className="font-mono text-[10px] font-semibold text-[#22c55e]">#{witness.leafIndex}</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Elapsed timer
// ---------------------------------------------------------------------------

function ElapsedTimer({ running }: { running: boolean }) {
  const [ms, setMs] = useState(0);
  const startRef = useRef<number>(0);

  useEffect(() => {
    if (running) {
      startRef.current = Date.now();
      setMs(0);
      const id = setInterval(() => setMs(Date.now() - startRef.current), 100);
      return () => clearInterval(id);
    }
  }, [running]);

  if (!running && ms === 0) return null;

  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-[#1e1e1e] bg-[#141414] px-2.5 py-1.5">
      <span className={["h-1.5 w-1.5 rounded-full", running ? "animate-pulse bg-[#22c55e]" : "bg-[#3e3e3e]"].join(" ")} aria-hidden="true" />
      <span className="font-mono text-[11px] tabular-nums text-[#a0a0a0]">
        {(ms / 1000).toFixed(1)}s
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step pipeline item
// ---------------------------------------------------------------------------

const STEP_META: Record<string, { detail: string; icon: React.ReactNode }> = {
  witness:  { detail: "Fetch Merkle inclusion path from oracle",   icon: <OracleIcon /> },
  prove:    { detail: "Run UltraHonk prover in Web Worker",        icon: <CircuitIcon /> },
  validate: { detail: "Verify public inputs match sanctions root", icon: <CheckCircleIcon /> },
  ready:    { detail: "Proof serialised and ready to submit",      icon: <ShieldIcon /> },
};

function StepRow({ step, isLast, elapsed }: { step: ProofStep; isLast: boolean; elapsed: number | null }) {
  const meta = STEP_META[step.id];

  const cfgMap = {
    idle:   { ring: "border-[#1e1e1e] bg-[#141414]",            iconCls: "text-[#3e3e3e]",  title: "text-[#646464]",  badge: "text-[#3e3e3e]",   dot: "bg-[#2e2e2e]",   status: "Waiting"  },
    active: { ring: "border-[#22c55e]/30 bg-[#22c55e]/8",       iconCls: "text-[#22c55e]",  title: "text-[#22c55e]",  badge: "text-[#22c55e]",   dot: "bg-[#22c55e] animate-pulse", status: "Running…" },
    done:   { ring: "border-[#22c55e]/20 bg-[#22c55e]/6",       iconCls: "text-[#22c55e]",  title: "text-white",      badge: "text-[#22c55e]",   dot: "bg-[#22c55e]",   status: "Done"     },
    error:  { ring: "border-rose-500/25 bg-rose-500/8",          iconCls: "text-rose-400",   title: "text-rose-300",   badge: "text-rose-400",    dot: "bg-rose-500",    status: "Error"    },
  }[step.state];

  return (
    <div className="flex gap-3.5">
      {/* Icon + connector */}
      <div className="flex flex-col items-center">
        <div className={["flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors duration-300", cfgMap.ring].join(" ")}>
          <span className={["transition-colors", cfgMap.iconCls].join(" ")}>
            {step.state === "done"
              ? <TickIcon />
              : step.state === "error"
              ? <XIcon />
              : step.state === "active"
              ? <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border border-[#1e1e1e] border-t-[#22c55e]" />
              : meta?.icon}
          </span>
        </div>
        {!isLast && (
          <div className={["mt-0.5 w-px flex-1 min-h-[20px] transition-colors duration-500", step.state === "done" ? "bg-[#22c55e]/25" : "bg-[#1e1e1e]"].join(" ")} aria-hidden="true" />
        )}
      </div>

      {/* Content */}
      <div className={["pb-5 min-w-0 flex-1", isLast ? "pb-0" : ""].join(" ")}>
        <div className="flex items-center gap-2">
          <span className={["text-sm font-semibold transition-colors duration-300", cfgMap.title].join(" ")}>
            {step.label}
          </span>
          {step.state === "done" && elapsed !== null && step.id === "ready" && (
            <span className="rounded border border-[#22c55e]/20 bg-[#22c55e]/8 px-1.5 py-0.5 font-mono text-[10px] text-[#22c55e]">
              {(elapsed / 1000).toFixed(1)}s
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[11px] text-[#646464]">{meta?.detail}</p>
        <span className={["mt-1 inline-flex items-center gap-1 text-[10px] font-medium", cfgMap.badge].join(" ")}>
          <span className={["h-1 w-1 rounded-full", cfgMap.dot].join(" ")} aria-hidden="true" />
          {cfgMap.status}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Circuit stats panel
// ---------------------------------------------------------------------------

const CIRCUIT_STATS = [
  { key: "Proving system",  val: "UltraHonk"       },
  { key: "Backend",         val: "Barretenberg"     },
  { key: "Language",        val: "Noir"             },
  { key: "Gate count",      val: "~190,000"         },
  { key: "Merkle depth",    val: String(MERKLE_TREE_DEPTH) },
  { key: "Public inputs",   val: "1 (Merkle root)"  },
] as const;

function CircuitStatsPanel() {
  return (
    <div className="rounded-xl border border-[#1e1e1e] bg-[#141414]">
      <div className="flex items-center gap-2.5 border-b border-[#1e1e1e] px-4 py-3">
        <CircuitBigIcon />
        <span className="font-mono text-[11px] uppercase tracking-widest text-[#646464]">Circuit Stats</span>
      </div>
      <div className="divide-y divide-[#1a1a1a]">
        {CIRCUIT_STATS.map(({ key, val }) => (
          <div key={key} className="flex items-center justify-between px-4 py-2.5">
            <span className="text-[11px] text-[#646464]">{key}</span>
            <span className="font-mono text-[11px] font-semibold text-[#a0a0a0]">{val}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error panel
// ---------------------------------------------------------------------------

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-rose-500/20 bg-rose-500/10">
          <XIcon className="text-rose-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-rose-300">Proof generation failed</p>
          <p className="mt-1 break-all text-[11px] leading-relaxed text-rose-500/80">{message}</p>
        </div>
      </div>
      <button
        onClick={onRetry}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-[#262626] py-2 text-xs font-semibold text-[#a0a0a0] transition-colors hover:border-[#3e3e3e] hover:text-white focus-visible:outline-none"
      >
        <RetryIcon /> Retry
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProofGenerate page
// ---------------------------------------------------------------------------

export function ProofGenerate() {
  const navigate     = useNavigate();
  const address      = useWalletStore(selectAddress);
  const currentRoot  = useSanctionsStore(selectCurrentRoot);

  const steps       = useProofStore(selectProofSteps);
  const status      = useProofStore(selectProofStatus);
  const proofError  = useProofStore(selectProofError);
  const proofResult = useProofStore(selectProofResult);
  const elapsedMs   = useProofStore((s) => s.elapsedMs);

  const { prove, reset, isBusy, witnessData } = useProofWorker();

  const isGenerating = status === "generating";
  const isDone       = status === "generated" || status === "confirmed";
  const isError      = status === "error";

  const proveStep = steps.find((s) => s.id === "prove");
  const imtPhase: StepState | "idle" = proveStep?.state ?? "idle";

  // Auto-navigate when done
  useEffect(() => {
    if (isDone) {
      const id = setTimeout(() => navigate("/app/proof/ready"), 900);
      return () => clearTimeout(id);
    }
  }, [isDone, navigate]);

  // Auto-start
  const hasStarted = useRef(false);
  useEffect(() => {
    if (address && !hasStarted.current && status === "idle") {
      hasStarted.current = true;
      prove(address);
    }
  }, [address, status, prove]);

  const handleRetry = useCallback(() => {
    reset();
    hasStarted.current = false;
  }, [reset]);

  // Entrance animation
  const [vis, setVis] = useState(false);
  useEffect(() => { const id = setTimeout(() => setVis(true), 40); return () => clearTimeout(id); }, []);

  // Pipeline status badge
  const pipelineBadge = isGenerating
    ? { text: "Running",  cls: "border-[#22c55e]/25 bg-[#22c55e]/8 text-[#22c55e]" }
    : isDone
    ? { text: "Complete", cls: "border-[#22c55e]/20 bg-[#22c55e]/8 text-[#22c55e]" }
    : isError
    ? { text: "Failed",   cls: "border-rose-500/25 bg-rose-500/8 text-rose-400" }
    : { text: "Queued",   cls: "border-[#1e1e1e] bg-[#141414] text-[#646464]" };

  return (
    <div
      className={[
        "flex h-full min-h-0 flex-col gap-0 transition-all duration-500",
        vis ? "opacity-100" : "opacity-0",
      ].join(" ")}
    >
      {/* ── Top info bar ─────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-3 border-b border-[#1a1a1a] bg-[#0d0d0d]/80 px-6 py-3 backdrop-blur-sm">
        {/* Title */}
        <div className="mr-2">
          <h1 className="text-[15px] font-bold text-white">Generating ZK Proof</h1>
          <p className="text-[11px] text-[#646464]">UltraHonk · In-browser · Web Worker</p>
        </div>

        {/* Address chip */}
        {address && (
          <div className="flex items-center gap-1.5 rounded-lg border border-[#1e1e1e] bg-[#141414] px-2.5 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e]" aria-hidden="true" />
            <span className="font-mono text-[11px] text-[#a0a0a0]">{formatHash(address, 8, 6)}</span>
          </div>
        )}

        {/* Elapsed */}
        <ElapsedTimer running={isGenerating} />

        {/* Sanctions root pill */}
        {currentRoot && (
          <div className="ml-auto hidden items-center gap-2 rounded-lg border border-[#1e1e1e] bg-[#141414] px-3 py-1.5 sm:flex">
            <span className="font-mono text-[10px] uppercase tracking-widest text-[#3e3e3e]">sanctions root</span>
            <span className="font-mono text-[11px] text-[#22c55e]/70">{formatHash(currentRoot, 10, 6)}</span>
            <span className="flex items-center gap-1 text-[10px] text-[#3e3e3e]">
              <span className="h-1 w-1 rounded-full bg-[#22c55e]/50" aria-hidden="true" />live
            </span>
          </div>
        )}
      </div>

      {/* ── Two-column body ──────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">

        {/* ── LEFT: IMT Canvas ──────────────────────────────────────── */}
        <div className="relative flex min-h-0 flex-1 flex-col border-r border-[#1a1a1a] bg-[#0a0a0a]">
          {/* Panel header */}
          <div className="flex shrink-0 items-center gap-2.5 border-b border-[#1a1a1a] px-5 py-3">
            <TreeIcon />
            <span className="font-mono text-[11px] uppercase tracking-widest text-[#646464]">
              IMT Proof Path
            </span>
            <div className="ml-auto flex items-center gap-2">
              {witnessData && (
                <>
                  <span className="rounded border border-[#1e1e1e] bg-[#141414] px-2 py-0.5 font-mono text-[10px] text-[#646464]">
                    leaf #{witnessData.leafIndex}
                  </span>
                  <span className="rounded border border-[#1e1e1e] bg-[#141414] px-2 py-0.5 font-mono text-[10px] text-[#646464]">
                    {witnessData.pathIndices.length} siblings
                  </span>
                </>
              )}
            </div>
          </div>

          {/* SVG canvas fills remaining space */}
          <div className="relative min-h-0 flex-1">
            <IMTVisualizer
              address={address}
              witness={witnessData}
              proofState={imtPhase}
              rootHash={currentRoot}
            />
          </div>

          {/* Footer note */}
          <div className="shrink-0 border-t border-[#1a1a1a] px-5 py-2.5">
            <p className="text-[9px] leading-relaxed text-[#2e2e2e]">
              Top {DISPLAY_DEPTH} levels of depth-{MERKLE_TREE_DEPTH} IMT. Highlighted path proves
              non-membership without revealing your leaf position.
            </p>
          </div>
        </div>

        {/* ── RIGHT: Pipeline + Stats ────────────────────────────────── */}
        <div className="flex w-[360px] shrink-0 flex-col overflow-y-auto bg-[#0d0d0d]">

          {/* Pipeline section */}
          <div className="border-b border-[#1a1a1a] p-5">
            {/* Header */}
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PipelineIcon />
                <span className="font-mono text-[11px] uppercase tracking-widest text-[#646464]">Pipeline</span>
              </div>
              <span className={["rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-semibold", pipelineBadge.cls].join(" ")}>
                {pipelineBadge.text}
              </span>
            </div>

            {/* Steps */}
            <div>
              {steps.map((step, i) => (
                <StepRow
                  key={step.id}
                  step={step}
                  isLast={i === steps.length - 1}
                  elapsed={elapsedMs}
                />
              ))}
            </div>
          </div>

          {/* Error */}
          {isError && proofError && (
            <div className="border-b border-[#1a1a1a] p-5">
              <ErrorPanel message={proofError} onRetry={handleRetry} />
            </div>
          )}

          {/* Proof ready summary */}
          {isDone && proofResult && (
            <div className="border-b border-[#1a1a1a] p-5">
              <div className="rounded-xl border border-[#22c55e]/20 bg-[#22c55e]/5 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e]" aria-hidden="true" />
                  <span className="text-xs font-semibold text-[#22c55e]">Proof ready</span>
                </div>
                <div className="space-y-3">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-widest text-[#3e3e3e]">Nullifier</p>
                    <p className="mt-0.5 font-mono text-[11px] text-[#4ade80]">
                      {formatHash(proofResult.nullifier, 10, 8)}
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-widest text-[#3e3e3e]">Root used</p>
                    <p className="mt-0.5 font-mono text-[11px] text-[#a0a0a0]">
                      {formatHash(proofResult.rootUsed, 10, 8)}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-[10px] text-[#3e3e3e]">Redirecting…</p>
              </div>
            </div>
          )}

          {/* Circuit stats */}
          <div className="p-5">
            <CircuitStatsPanel />
          </div>
        </div>
      </div>

      {/* dash animation for proving edges */}
      <style>{`
        @keyframes dash {
          from { stroke-dashoffset: 0; }
          to   { stroke-dashoffset: -16; }
        }
      `}</style>
    </div>
  );
}

export default ProofGenerate;

// ---------------------------------------------------------------------------
// Inline icons (all sized by parent / CSS, no className arg needed for atoms)
// ---------------------------------------------------------------------------

function OracleIcon() {
  return (
    <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="7" cy="7" r="5.5" /><path d="M4 7h6M7 4v6" />
    </svg>
  );
}
function CircuitIcon() {
  return (
    <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <path d="M2 5.5h2M2 8.5h2M10 5.5h2M10 8.5h2M5.5 2v2M8.5 2v2M5.5 10v2M8.5 10v2" />
    </svg>
  );
}
function CheckCircleIcon() {
  return (
    <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="7" cy="7" r="5.5" /><path d="M4.5 7l2 2 3-3.5" />
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 1.5L2 4v4c0 3 2 5 5 5.5C14 13 12 9 12 8V4L7 1.5z" />
    </svg>
  );
}
function TickIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={className ?? "h-3.5 w-3.5"} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 6l2.5 2.5L10 3.5" />
    </svg>
  );
}
function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={className ?? "h-3.5 w-3.5"} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 2l8 8M10 2l-8 8" />
    </svg>
  );
}
function PipelineIcon() {
  return (
    <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 4h10M2 7h7M2 10h4" />
    </svg>
  );
}
function RetryIcon() {
  return (
    <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 6A4 4 0 1 1 6 2" /><path d="M6 2l2-2M6 2l2 2" />
    </svg>
  );
}
function TreeIcon() {
  return (
    <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="7" cy="2" r="1.5" /><circle cx="3" cy="7.5" r="1.5" /><circle cx="11" cy="7.5" r="1.5" />
      <circle cx="1.5" cy="12.5" r="1.2" /><circle cx="4.5" cy="12.5" r="1.2" />
      <circle cx="9.5" cy="12.5" r="1.2" /><circle cx="12.5" cy="12.5" r="1.2" />
      <path d="M7 3.5L3 6M7 3.5L11 6M3 9L1.5 11.3M3 9L4.5 11.3M11 9L9.5 11.3M11 9L12.5 11.3" />
    </svg>
  );
}
function CircuitBigIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4.5" y="4.5" width="7" height="7" rx="1.5" />
      <path d="M2 6h2.5M2 10h2.5M11.5 6H14M11.5 10H14M6 2v2.5M10 2v2.5M6 11.5V14M10 11.5V14" />
    </svg>
  );
}
