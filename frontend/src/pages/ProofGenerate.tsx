// frontend/src/pages/ProofGenerate.tsx
//
// Route: /app/proofs/generate
//
// Layout:
//   Left panel  — step pipeline (witness → prove → validate → ready)
//   Right panel — IMT visualizer (live tree fed by oracle witness data)
//
// Proof generation runs inside a Web Worker (proofWorker.ts) so the main
// thread stays responsive during the 5–20s UltraHonk computation.

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
  import { useWalletStore, selectAddress } from "@/store/walletStore";
  import { useSanctionsStore, selectCurrentRoot } from "@/store/sanctionsStore";
  import { formatHash } from "@/lib/format";
  import { MERKLE_TREE_DEPTH } from "@/lib/constants";
  import type { ProveResult, WorkerOutMessage, WitnessData } from "@/lib/prover/proofWorker";
  
  // ---------------------------------------------------------------------------
  // Types
  // ---------------------------------------------------------------------------
  
  type PipelineStep = {
    id:      string;
    label:   string;
    detail:  string;
    state:   StepState;
  };
  
  // ---------------------------------------------------------------------------
  // Worker hook — spawns/terminates a dedicated Web Worker per prove() call
  // ---------------------------------------------------------------------------
  
  function useProofWorker() {
    const workerRef = useRef<Worker | null>(null);
  
    const {
      startGeneration,
      setStepActive,
      setStepDone,
      setStepError,
      setGenerated,
      setError,
      reset,
    } = useProofStore();
  
    const status = useProofStore(selectProofStatus);
    const isBusy = status === "generating";
  
    const [witnessData, setWitnessData] = useState<WitnessData | null>(null);
  
    const terminate = useCallback(() => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
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
            if (state === "active") setStepActive(stepId);
            else if (state === "done") setStepDone(stepId);
            else if (state === "error") setStepError(stepId);
          }
  
          if (msg.type === "DONE") {
            const r = msg.payload;
            // Forward witness for IMT visualizer
            setWitnessData(r.witness);
            setGenerated({
              proof:       r.proofHex as `0x${string}`,
              publicInputs: r.publicInputs as `0x${string}`[],
              nullifier:   r.nullifier as `0x${string}`,
              rootUsed:    r.rootUsed as `0x${string}`,
              generatedAt: r.generatedAt,
            });
            terminate();
          }
  
          if (msg.type === "ERROR") {
            setError(msg.payload.message);
            terminate();
          }
        };
  
        worker.onerror = (e) => {
          setError(e.message ?? "Worker crashed");
          terminate();
        };
  
        worker.postMessage({ type: "PROVE", payload: { address } });
      },
      [isBusy, startGeneration, setStepActive, setStepDone, setStepError,
       setGenerated, setError, terminate],
    );
  
    return { prove, reset, isBusy, witnessData, terminate };
  }
  
  // ---------------------------------------------------------------------------
  // IMT Visualizer — SVG canvas, real path data from oracle witness
  // ---------------------------------------------------------------------------
  
  interface IMTVisualizerProps {
    address:    string | null;
    witness:    WitnessData | null;
    proofState: StepState | "idle";  // drives animation phase
    rootHash:   string | null;
  }
  
  // How many levels to render (full 20-deep tree would be unreadable)
  const DISPLAY_DEPTH = 5;
  
  interface VisNode {
    id:        string;
    level:     number; // 0 = leaves, DISPLAY_DEPTH = root
    indexInLevel: number;
    totalInLevel: number;
    x:         number;
    y:         number;
    isOnPath:  boolean;
    isLeaf:    boolean;
    isProver:  boolean; // the user's own leaf
    value:     string | null;
  }
  
  interface VisEdge {
    id:    string;
    x1:    number;
    y1:    number;
    x2:    number;
    y2:    number;
    onPath: boolean;
  }
  
  /** Build display tree nodes + edges from witness data */
  function buildVisTree(
    witness:    WitnessData | null,
    address:    string | null,
    rootHash:   string | null,
    svgW:       number,
    svgH:       number,
  ): { nodes: VisNode[]; edges: VisEdge[] } {
    const nodes: VisNode[] = [];
    const edges: VisEdge[] = [];
  
    const PAD_X = 40;
    const PAD_Y = 36;
    const usableW = svgW - PAD_X * 2;
    const usableH = svgH - PAD_Y * 2;
    const levelH  = usableH / DISPLAY_DEPTH;
  
    // pathIndices tell us which side the proof path goes at each level
    // pathIndices[i] = 0 → proof sibling is on the right (leaf is left child)
    // pathIndices[i] = 1 → proof sibling is on the left  (leaf is right child)
    const pathIndices = witness?.pathIndices ?? [];
    const leafIndex   = witness?.leafIndex   ?? 0;
    const siblings    = witness?.merklePath  ?? [];
  
    // Derive the on-path node index at each level
    // Level 0: leafIndex
    // Level i: Math.floor(pathIndex_at_{i-1} computed from running index)
    const onPathIndexAtLevel: number[] = [];
    let runningIndex = leafIndex;
    for (let lvl = 0; lvl <= DISPLAY_DEPTH; lvl++) {
      onPathIndexAtLevel.push(runningIndex);
      runningIndex = Math.floor(runningIndex / 2);
    }
  
    for (let lvl = 0; lvl <= DISPLAY_DEPTH; lvl++) {
      const displayLevel = DISPLAY_DEPTH - lvl; // flip: leaves at bottom
      const nodesAtLevel = Math.pow(2, DISPLAY_DEPTH - lvl);
      // Clamp visible nodes to at most 32 (levels deep in display)
      const visCount     = Math.min(nodesAtLevel, Math.pow(2, Math.min(DISPLAY_DEPTH - lvl, DISPLAY_DEPTH)));
      const stepX        = usableW / (visCount - 1 || 1);
      const y            = PAD_Y + displayLevel * levelH;
      const onPathIdx    = onPathIndexAtLevel[lvl] ?? 0;
  
      // Sibling of the on-path node
      const siblingIdx =
        (pathIndices[lvl - 1] === 1) ? onPathIdx - 1 : onPathIdx + 1;
  
      for (let i = 0; i < visCount; i++) {
        const x = visCount === 1 ? svgW / 2 : PAD_X + i * stepX;
        const isOnPath  = i === onPathIdx;
        const isLeaf    = lvl === 0;
        const isProver  = isLeaf && isOnPath;
        const isSibling = !isOnPath && (i === siblingIdx);
  
        // Value assignment
        let value: string | null = null;
        if (lvl === DISPLAY_DEPTH) {
          // root
          value = rootHash ? formatHash(rootHash, 6, 4) : null;
        } else if (isOnPath && !isLeaf) {
          // intermediate on-path node — no direct value from witness
          value = null;
        } else if (isLeaf && isProver) {
          value = address ? formatHash(address, 6, 4) : null;
        } else if (isLeaf && isSibling && siblings[0]) {
          value = formatHash(siblings[0], 6, 4);
        }
  
        nodes.push({
          id:           `n-${lvl}-${i}`,
          level:        lvl,
          indexInLevel: i,
          totalInLevel: visCount,
          x,
          y,
          isOnPath,
          isLeaf,
          isProver,
          value,
        });
      }
    }
  
    // Build edges between consecutive levels
    for (let lvl = 0; lvl < DISPLAY_DEPTH; lvl++) {
      const childCount  = Math.min(Math.pow(2, DISPLAY_DEPTH - lvl),     32);
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
          id:     `e-${lvl}-${ci}`,
          x1:     child.x,
          y1:     child.y,
          x2:     parent.x,
          y2:     parent.y,
          onPath: ci === onPathChildIdx && pi === onPathParentIdx,
        });
      }
    }
  
    return { nodes, edges };
  }
  
  function IMTVisualizer({ address, witness, proofState, rootHash }: IMTVisualizerProps) {
    const svgRef = useRef<SVGSVGElement>(null);
    const [dims, setDims] = useState({ w: 480, h: 340 });
    const [hovered, setHovered] = useState<string | null>(null);
    const [revealed, setRevealed] = useState(false);
  
    // Measure container
    useEffect(() => {
      const el = svgRef.current?.parentElement;
      if (!el) return;
      const ro = new ResizeObserver(([entry]) => {
        if (entry) {
          setDims({
            w: entry.contentRect.width  || 480,
            h: entry.contentRect.height || 340,
          });
        }
      });
      ro.observe(el);
      return () => ro.disconnect();
    }, []);
  
    // Reveal animation when witness arrives
    useEffect(() => {
      if (witness) {
        const id = setTimeout(() => setRevealed(true), 120);
        return () => clearTimeout(id);
      }
      setRevealed(false);
    }, [witness]);
  
    const { nodes, edges } = buildVisTree(witness, address, rootHash, dims.w, dims.h);
  
    // Determine animation phase per node
    const isProving = proofState === "active";
  
    return (
      <div className="relative h-full w-full select-none">
        {/* Background grid */}
        <svg
          className="pointer-events-none absolute inset-0 opacity-[0.025]"
          width={dims.w} height={dims.h}
          aria-hidden="true"
        >
          <defs>
            <pattern id="imt-grid" width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M 24 0 L 0 0 0 24" fill="none" stroke="white" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#imt-grid)" />
        </svg>
  
        <svg
          ref={svgRef}
          viewBox={`0 0 ${dims.w} ${dims.h}`}
          width={dims.w}
          height={dims.h}
          className="relative"
          role="img"
          aria-label="Incremental Merkle Tree proof path visualizer"
        >
          <defs>
            {/* Glow filter for path nodes */}
            <filter id="glow-teal" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="glow-gold" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            {/* Animated dash for active path */}
            <marker id="arrow-teal" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
              <path d="M0,0 L0,6 L6,3 z" fill="rgb(45 212 191 / 0.6)" />
            </marker>
          </defs>
  
          {/* ── Edges ───────────────────────────────────────────────── */}
          {edges.map((edge) => (
            <line
              key={edge.id}
              x1={edge.x1} y1={edge.y1}
              x2={edge.x2} y2={edge.y2}
              stroke={
                edge.onPath
                  ? "rgb(45 212 191 / 0.45)"
                  : "rgb(63 63 70 / 0.5)"
              }
              strokeWidth={edge.onPath ? 1.5 : 0.75}
              strokeDasharray={edge.onPath && isProving ? "4 3" : undefined}
              className={
                edge.onPath && isProving
                  ? "animate-[dash_1.2s_linear_infinite]"
                  : ""
              }
              style={
                revealed
                  ? { opacity: 1, transition: "opacity 0.4s ease" }
                  : { opacity: 0 }
              }
            />
          ))}
  
          {/* ── Nodes ───────────────────────────────────────────────── */}
          {nodes.map((node) => {
            const isHov = hovered === node.id;
            const r = node.isProver
              ? 9
              : node.level === DISPLAY_DEPTH
              ? 10
              : node.isOnPath
              ? 6
              : 4;
  
            const fill = node.isProver
              ? "rgb(20 184 166 / 0.15)"
              : node.level === DISPLAY_DEPTH
              ? "rgb(251 191 36 / 0.12)"
              : node.isOnPath
              ? "rgb(45 212 191 / 0.1)"
              : "rgb(39 39 42 / 0.8)";
  
            const stroke = node.isProver
              ? isProving ? "#14b8a6" : "#5eead4"
              : node.level === DISPLAY_DEPTH
              ? "#fbbf24"
              : node.isOnPath
              ? "#2dd4bf"
              : "#3f3f46";
  
            const strokeW = node.isProver
              ? 1.5
              : node.level === DISPLAY_DEPTH
              ? 1.5
              : node.isOnPath
              ? 1.2
              : 0.75;
  
            const filterAttr = node.isProver
              ? "url(#glow-teal)"
              : node.level === DISPLAY_DEPTH
              ? "url(#glow-gold)"
              : undefined;
  
            const delay = revealed
              ? `${(node.level * 40 + node.indexInLevel * 8)}ms`
              : "0ms";
  
            return (
              <g
                key={node.id}
                transform={`translate(${node.x},${node.y})`}
                onMouseEnter={() => setHovered(node.id)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  opacity: revealed ? 1 : 0,
                  transform: revealed
                    ? `translate(${node.x}px,${node.y}px) scale(1)`
                    : `translate(${node.x}px,${node.y}px) scale(0.5)`,
                  transition: `opacity 0.35s ease ${delay}, transform 0.35s cubic-bezier(0.34,1.56,0.64,1) ${delay}`,
                }}
              >
                {/* Outer pulse ring — prover leaf + active state */}
                {node.isProver && isProving && (
                  <circle
                    r={r + 6}
                    fill="none"
                    stroke="rgb(20 184 166 / 0.2)"
                    strokeWidth="1"
                    className="animate-ping"
                  />
                )}
  
                {/* Main circle */}
                <circle
                  r={r}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={isHov ? strokeW + 0.5 : strokeW}
                  filter={filterAttr}
                  style={{ transition: "r 0.15s ease, stroke-width 0.15s ease" }}
                />
  
                {/* Prover checkmark (when proof done) */}
                {node.isProver && proofState === "done" && (
                  <path
                    d="M-3,0 l2,2 4,-4"
                    fill="none"
                    stroke="#14b8a6"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
  
                {/* Root crown icon */}
                {node.level === DISPLAY_DEPTH && (
                  <text
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize="7"
                    fill="#fbbf24"
                    fontFamily="monospace"
                    y={0}
                  >
                    ★
                  </text>
                )}
  
                {/* Label on hover or key nodes */}
                {(isHov || node.isProver || node.level === DISPLAY_DEPTH) && node.value && (
                  <g>
                    <rect
                      x={-38} y={r + 3}
                      width={76} height={13}
                      rx={3}
                      fill="rgb(9 9 11 / 0.88)"
                      stroke={node.isProver ? "#14b8a6" : node.level === DISPLAY_DEPTH ? "#fbbf24" : "#3f3f46"}
                      strokeWidth={0.5}
                    />
                    <text
                      textAnchor="middle"
                      y={r + 12}
                      fontSize="6.5"
                      fontFamily="monospace"
                      fill={
                        node.isProver
                          ? "#5eead4"
                          : node.level === DISPLAY_DEPTH
                          ? "#fde68a"
                          : "#a1a1aa"
                      }
                    >
                      {node.value}
                    </text>
                  </g>
                )}
  
                {/* "YOU" tag on prover leaf */}
                {node.isProver && (
                  <g transform={`translate(${r + 2}, ${-r - 2})`}>
                    <rect
                      x={0} y={-7}
                      width={20} height={8}
                      rx={2}
                      fill="rgb(20 184 166 / 0.15)"
                      stroke="#14b8a6"
                      strokeWidth={0.75}
                    />
                    <text
                      x={10} y={-1}
                      textAnchor="middle"
                      fontSize="5.5"
                      fontFamily="sans-serif"
                      fontWeight="600"
                      fill="#5eead4"
                      letterSpacing="0.5"
                    >
                      YOU
                    </text>
                  </g>
                )}
              </g>
            );
          })}
  
          {/* ── Level labels (left axis) ─────────────────────────────── */}
          {Array.from({ length: DISPLAY_DEPTH + 1 }, (_, i) => {
            const displayLevel = DISPLAY_DEPTH - i;
            const lvlName =
              i === 0
                ? `L0 · leaf`
                : i === DISPLAY_DEPTH
                ? `L${i} · root`
                : `L${i}`;
            const y =
              36 +
              displayLevel * ((dims.h - 72) / DISPLAY_DEPTH);
            return (
              <text
                key={i}
                x={8}
                y={y}
                dominantBaseline="middle"
                fontSize="6.5"
                fontFamily="monospace"
                fill="#52525b"
                style={{
                  opacity: revealed ? 1 : 0,
                  transition: `opacity 0.5s ease ${i * 30}ms`,
                }}
              >
                {lvlName}
              </text>
            );
          })}
  
          {/* ── "Waiting for witness" overlay ────────────────────────── */}
          {!witness && (
            <g>
              <rect width={dims.w} height={dims.h} fill="transparent" />
              <text
                x={dims.w / 2}
                y={dims.h / 2 - 10}
                textAnchor="middle"
                fontSize="11"
                fontFamily="sans-serif"
                fill="#3f3f46"
              >
                Fetching Merkle witness…
              </text>
              <text
                x={dims.w / 2}
                y={dims.h / 2 + 8}
                textAnchor="middle"
                fontSize="9"
                fontFamily="monospace"
                fill="#27272a"
              >
                {address ? formatHash(address, 8, 6) : "—"}
              </text>
            </g>
          )}
        </svg>
  
        {/* ── Legend ─────────────────────────────────────────────────── */}
        <div className="absolute bottom-3 right-3 flex flex-col gap-1">
          {[
            { color: "#5eead4", label: "Your address (leaf)" },
            { color: "#2dd4bf", label: "Proof path" },
            { color: "#fbbf24", label: "Merkle root" },
            { color: "#52525b", label: "Sibling nodes" },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: color }}
                aria-hidden="true"
              />
              <span className="text-[9px] text-zinc-600">{label}</span>
            </div>
          ))}
        </div>
  
        {/* ── Depth badge ─────────────────────────────────────────────── */}
        <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/80 px-2 py-1 backdrop-blur-sm">
          <span className="text-[9px] font-medium text-zinc-600">Depth</span>
          <span className="font-mono text-[9px] font-semibold text-zinc-400">
            {MERKLE_TREE_DEPTH}
          </span>
          <span className="text-[9px] text-zinc-700">·</span>
          <span className="text-[9px] font-medium text-zinc-600">Showing</span>
          <span className="font-mono text-[9px] font-semibold text-zinc-400">
            {DISPLAY_DEPTH}
          </span>
        </div>
      </div>
    );
  }
  
  // ---------------------------------------------------------------------------
  // Step pipeline item
  // ---------------------------------------------------------------------------
  
  const STEP_META: Record<string, { detail: string; icon: React.ReactNode }> = {
    witness:  {
      detail: "Fetch Merkle inclusion path from oracle",
      icon:   <OracleIcon className="h-3.5 w-3.5" />,
    },
    prove:    {
      detail: "Run UltraHonk prover in Web Worker",
      icon:   <CircuitIcon className="h-3.5 w-3.5" />,
    },
    validate: {
      detail: "Verify public inputs match current root",
      icon:   <CheckCircleIcon className="h-3.5 w-3.5" />,
    },
    ready:    {
      detail: "Proof serialised and ready to submit",
      icon:   <ShieldIcon className="h-3.5 w-3.5" />,
    },
  };
  
  function StepItem({
    step,
    isLast,
    elapsed,
  }: {
    step:    ProofStep;
    isLast:  boolean;
    elapsed: number | null;
  }) {
    const meta = STEP_META[step.id];
  
    const stateConfig = {
      idle:  { dot: "bg-zinc-700",   ring: "border-zinc-800",         text: "text-zinc-600",   label: "Waiting"  },
      active:{ dot: "bg-teal-400",   ring: "border-teal-500/30",      text: "text-teal-400",   label: "Running…" },
      done:  { dot: "bg-teal-500",   ring: "border-teal-500/20",      text: "text-teal-500",   label: "Done"     },
      error: { dot: "bg-rose-500",   ring: "border-rose-500/30",      text: "text-rose-400",   label: "Error"    },
    }[step.state];
  
    return (
      <div className="flex gap-3">
        {/* Connector */}
        <div className="flex flex-col items-center pt-0.5">
          <div className={[
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border",
            stateConfig.ring,
            step.state === "done"
              ? "bg-teal-500/10"
              : step.state === "active"
              ? "bg-teal-500/8"
              : "bg-zinc-900",
          ].join(" ")}>
            <span className={[
              "transition-colors",
              step.state === "done"  ? "text-teal-400"
              : step.state === "active" ? "text-teal-400"
              : step.state === "error"  ? "text-rose-400"
              : "text-zinc-600",
            ].join(" ")}>
              {step.state === "done" ? (
                <TickIcon className="h-3.5 w-3.5" />
              ) : step.state === "error" ? (
                <XIcon className="h-3.5 w-3.5" />
              ) : meta?.icon}
            </span>
          </div>
          {!isLast && (
            <div
              className={[
                "mt-1 w-px flex-1 transition-colors duration-500",
                step.state === "done" ? "bg-teal-500/30" : "bg-zinc-800",
              ].join(" ")}
              aria-hidden="true"
            />
          )}
        </div>
  
        {/* Content */}
        <div className="pb-5 min-w-0">
          <div className="flex items-center gap-2">
            <span className={[
              "text-sm font-medium transition-colors",
              step.state === "idle"  ? "text-zinc-600"
              : step.state === "done" ? "text-zinc-200"
              : step.state === "active" ? "text-teal-300"
              : "text-rose-300",
            ].join(" ")}>
              {step.label}
            </span>
  
            {/* Active spinner */}
            {step.state === "active" && (
              <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border border-zinc-700 border-t-teal-400" />
            )}
  
            {/* Done timing (last step only) */}
            {step.state === "done" && elapsed !== null && step.id === "ready" && (
              <span className="rounded-md border border-teal-500/20 bg-teal-500/8 px-1.5 py-0.5 font-mono text-[10px] text-teal-400">
                {(elapsed / 1000).toFixed(1)}s
              </span>
            )}
          </div>
  
          <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-600">
            {meta?.detail}
          </p>
  
          {/* Status badge */}
          <span className={[
            "mt-1 inline-flex items-center gap-1 text-[10px] font-medium",
            stateConfig.text,
          ].join(" ")}>
            <span className={["h-1 w-1 rounded-full", stateConfig.dot].join(" ")} aria-hidden="true" />
            {stateConfig.label}
          </span>
        </div>
      </div>
    );
  }
  
  // ---------------------------------------------------------------------------
  // Error panel
  // ---------------------------------------------------------------------------
  
  function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
    return (
      <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-rose-500/20 bg-rose-500/10">
            <XIcon className="h-3.5 w-3.5 text-rose-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-rose-300">Proof generation failed</p>
            <p className="mt-1 break-all text-[11px] leading-relaxed text-rose-500/80">
              {message}
            </p>
          </div>
        </div>
        <button
          onClick={onRetry}
          className={[
            "mt-4 flex w-full items-center justify-center gap-2 rounded-xl",
            "border border-zinc-700 py-2 text-xs font-medium text-zinc-400",
            "transition-colors hover:border-zinc-600 hover:text-zinc-200",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-600",
          ].join(" ")}
        >
          <RetryIcon className="h-3 w-3" />
          Retry
        </button>
      </div>
    );
  }
  
  // ---------------------------------------------------------------------------
  // Elapsed timer (live tick during generation)
  // ---------------------------------------------------------------------------
  
  function ElapsedTimer({ running }: { running: boolean }) {
    const [ms, setMs] = useState(0);
    const startRef = useRef<number>(0);
  
    useEffect(() => {
      if (running) {
        startRef.current = Date.now();
        setMs(0);
        const id = setInterval(() => {
          setMs(Date.now() - startRef.current);
        }, 100);
        return () => clearInterval(id);
      }
    }, [running]);
  
    if (!running && ms === 0) return null;
  
    return (
      <div className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1">
        <span className={["h-1.5 w-1.5 rounded-full", running ? "animate-pulse bg-teal-400" : "bg-zinc-600"].join(" ")} aria-hidden="true" />
        <span className="font-mono text-[11px] tabular-nums text-zinc-400">
          {(ms / 1000).toFixed(1)}s
        </span>
      </div>
    );
  }
  
  // ---------------------------------------------------------------------------
  // ProofGenerate page
  // ---------------------------------------------------------------------------
  
  export function ProofGenerate() {
    const navigate    = useNavigate();
    const address     = useWalletStore(selectAddress);
    const currentRoot = useSanctionsStore(selectCurrentRoot);
  
    const steps       = useProofStore(selectProofSteps);
    const status      = useProofStore(selectProofStatus);
    const proofError  = useProofStore(selectProofError);
    const proofResult = useProofStore(selectProofResult);
    const elapsedMs   = useProofStore((s) => s.elapsedMs);
  
    const { prove, reset, isBusy, witnessData } = useProofWorker();
  
    const isGenerating = status === "generating";
    const isDone       = status === "generated" || status === "confirmed";
    const isError      = status === "error";
  
    // Derive proof step state for IMT visualizer (which step is the prover on)
    const proveStep    = steps.find((s) => s.id === "prove");
    const imtPhase: StepState | "idle" = proveStep?.state ?? "idle";
  
    // Auto-navigate to /ready when done
    useEffect(() => {
      if (isDone) {
        const id = setTimeout(() => navigate("/app/proofs/ready"), 900);
        return () => clearTimeout(id);
      }
    }, [isDone, navigate]);
  
    // Auto-start on mount if address is available
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
  
    // Header visible
    const [headerVis, setHeaderVis] = useState(false);
    useEffect(() => {
      const id = setTimeout(() => setHeaderVis(true), 40);
      return () => clearTimeout(id);
    }, []);
  
    return (
      <div className="flex flex-col gap-5 p-4 pb-8 sm:p-6 lg:p-8">
  
        {/* ── Header ──────────────────────────────────────────────── */}
        <div
          className={[
            "flex flex-col gap-2 transition-all duration-500 sm:flex-row sm:items-center sm:justify-between",
            headerVis ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2",
          ].join(" ")}
        >
          <div>
            <h1 className="text-lg font-semibold text-zinc-100">
              Generating Proof
            </h1>
            <p className="mt-0.5 text-xs text-zinc-600">
              UltraHonk · In-browser · Web Worker
            </p>
          </div>
  
          <div className="flex items-center gap-2">
            {/* Address chip */}
            {address && (
              <div className="flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-teal-500" aria-hidden="true" />
                <span className="font-mono text-xs text-zinc-500">
                  {formatHash(address, 8, 6)}
                </span>
              </div>
            )}
  
            {/* Live timer */}
            <ElapsedTimer running={isGenerating} />
          </div>
        </div>
  
        {/* ── Root confirmation strip ──────────────────────────────── */}
        {currentRoot && (
          <div
            className={[
              "flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/30 px-4 py-2.5",
              "transition-all duration-500",
              headerVis ? "opacity-100" : "opacity-0",
            ].join(" ")}
            style={{ transitionDelay: "60ms" }}
          >
            <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
              Sanctions root
            </span>
            <span className="mx-1 h-3 w-px bg-zinc-800" aria-hidden="true" />
            <span className="font-mono text-[11px] text-teal-300/80">
              {formatHash(currentRoot, 12, 8)}
            </span>
            <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-zinc-700">
              <span className="h-1 w-1 rounded-full bg-teal-600" aria-hidden="true" />
              live
            </span>
          </div>
        )}
  
        {/* ── Main grid ───────────────────────────────────────────── */}
        <div
          className={[
            "grid grid-cols-1 gap-4 transition-all duration-500 lg:grid-cols-[320px_1fr]",
            headerVis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3",
          ].join(" ")}
          style={{ transitionDelay: "100ms" }}
        >
  
          {/* ── Left: step pipeline ─────────────────────────────── */}
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
              {/* Panel header */}
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <PipelineIcon className="h-3.5 w-3.5 text-zinc-500" />
                  <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                    Pipeline
                  </h2>
                </div>
                <span className={[
                  "rounded-full border px-2 py-0.5 text-[10px] font-medium",
                  isGenerating
                    ? "border-teal-500/25 bg-teal-500/8 text-teal-400"
                    : isDone
                    ? "border-teal-500/20 bg-teal-500/8 text-teal-400"
                    : isError
                    ? "border-rose-500/25 bg-rose-500/8 text-rose-400"
                    : "border-zinc-800 bg-zinc-900 text-zinc-600",
                ].join(" ")}>
                  {isGenerating ? "Running" : isDone ? "Complete" : isError ? "Failed" : "Ready"}
                </span>
              </div>
  
              {/* Steps */}
              <div>
                {steps.map((step, i) => (
                  <StepItem
                    key={step.id}
                    step={step}
                    isLast={i === steps.length - 1}
                    elapsed={elapsedMs}
                  />
                ))}
              </div>
  
              {/* Error panel */}
              {isError && proofError && (
                <div className="mt-2">
                  <ErrorPanel message={proofError} onRetry={handleRetry} />
                </div>
              )}
            </div>
  
            {/* Proof result summary card (shown when done) */}
            {isDone && proofResult && (
              <div className="rounded-2xl border border-teal-500/20 bg-teal-500/5 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-teal-400" aria-hidden="true" />
                  <span className="text-xs font-semibold text-teal-400">Proof ready</span>
                </div>
                <div className="space-y-2">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Nullifier</p>
                    <p className="mt-0.5 font-mono text-[11px] text-teal-300">
                      {formatHash(proofResult.nullifier, 10, 8)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Root used</p>
                    <p className="mt-0.5 font-mono text-[11px] text-zinc-400">
                      {formatHash(proofResult.rootUsed, 10, 8)}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-[10px] text-zinc-700">
                  Redirecting to proof ready screen…
                </p>
              </div>
            )}
          </div>
  
          {/* ── Right: IMT visualizer ────────────────────────────── */}
          <div className="flex flex-col rounded-2xl border border-zinc-800 bg-zinc-950 overflow-hidden">
            {/* Visualizer header */}
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
              <div className="flex items-center gap-2">
                <TreeIcon className="h-3.5 w-3.5 text-zinc-500" />
                <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                  IMT Proof Path
                </h2>
              </div>
              <div className="flex items-center gap-3">
                {/* Leaf index badge */}
                {witnessData && (
                  <span className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-0.5 font-mono text-[10px] text-zinc-500">
                    leaf #{witnessData.leafIndex}
                  </span>
                )}
                {/* Path depth badge */}
                {witnessData && (
                  <span className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-0.5 font-mono text-[10px] text-zinc-500">
                    {witnessData.pathIndices.length} siblings
                  </span>
                )}
              </div>
            </div>
  
            {/* SVG canvas */}
            <div className="relative flex-1 min-h-[340px]">
              <IMTVisualizer
                address={address}
                witness={witnessData}
                proofState={imtPhase}
                rootHash={currentRoot}
              />
            </div>
  
            {/* Visualizer footer */}
            <div className="border-t border-zinc-800/50 px-4 py-2.5">
              <p className="text-[10px] leading-relaxed text-zinc-700">
                Showing the top {DISPLAY_DEPTH} levels of the depth-{MERKLE_TREE_DEPTH} Incremental Merkle Tree.
                The highlighted path proves your address is not sanctioned without revealing which leaf is yours.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  export default ProofGenerate;
  
  // ---------------------------------------------------------------------------
  // Icons
  // ---------------------------------------------------------------------------
  
  function OracleIcon({ className }: { className?: string }) {
    return (
      <svg viewBox="0 0 14 14" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="7" cy="7" r="5.5" />
        <path d="M4 7h6M7 4v6" />
      </svg>
    );
  }
  
  function CircuitIcon({ className }: { className?: string }) {
    return (
      <svg viewBox="0 0 14 14" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="4" y="4" width="6" height="6" rx="1" />
        <path d="M2 5.5h2M2 8.5h2M10 5.5h2M10 8.5h2M5.5 2v2M8.5 2v2M5.5 10v2M8.5 10v2" />
      </svg>
    );
  }
  
  function CheckCircleIcon({ className }: { className?: string }) {
    return (
      <svg viewBox="0 0 14 14" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="7" cy="7" r="5.5" />
        <path d="M4.5 7l2 2 3-3.5" />
      </svg>
    );
  }
  
  function ShieldIcon({ className }: { className?: string }) {
    return (
      <svg viewBox="0 0 14 14" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M7 1.5L2 4v4c0 3 2 5 5 5.5C14 13 12 9 12 8V4L7 1.5z" />
      </svg>
    );
  }
  
  function TickIcon({ className }: { className?: string }) {
    return (
      <svg viewBox="0 0 12 12" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 6l2.5 2.5L10 3.5" />
      </svg>
    );
  }
  
  function XIcon({ className }: { className?: string }) {
    return (
      <svg viewBox="0 0 12 12" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 2l8 8M10 2l-8 8" />
      </svg>
    );
  }
  
  function PipelineIcon({ className }: { className?: string }) {
    return (
      <svg viewBox="0 0 14 14" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 4h10M2 7h7M2 10h4" />
      </svg>
    );
  }
  
  function RetryIcon({ className }: { className?: string }) {
    return (
      <svg viewBox="0 0 12 12" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M10 6A4 4 0 1 1 6 2" />
        <path d="M6 2l2-2M6 2l2 2" />
      </svg>
    );
  }
  
  function TreeIcon({ className }: { className?: string }) {
    return (
      <svg viewBox="0 0 14 14" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="7" cy="2" r="1.5" />
        <circle cx="3" cy="7.5" r="1.5" />
        <circle cx="11" cy="7.5" r="1.5" />
        <circle cx="1.5" cy="12.5" r="1.2" />
        <circle cx="4.5" cy="12.5" r="1.2" />
        <circle cx="9.5" cy="12.5" r="1.2" />
        <circle cx="12.5" cy="12.5" r="1.2" />
        <path d="M7 3.5 L3 6M7 3.5 L11 6M3 9 L1.5 11.3M3 9 L4.5 11.3M11 9 L9.5 11.3M11 9 L12.5 11.3" />
      </svg>
    );
  }