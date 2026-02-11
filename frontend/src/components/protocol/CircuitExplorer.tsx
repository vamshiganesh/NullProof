// frontend/src/components/protocol/CircuitExplorer.tsx
//
// Canvas visualisation of the NullProof Noir circuit constraint clusters.
//
// The Noir circuit proves Merkle non-membership in the sanctions list using:
//   • 20-level Poseidon hash path    (dominant constraint group)
//   • Nullifier derivation           (Poseidon hash of address + secret)
//   • Range / membership checks      (leaf index bounds)
//   • Root equality assertion        (single public input check)
//
// Since the actual constraint count comes from the compiled circuit artifact
// (not available at runtime in the browser), we use accurate estimates based
// on UltraHonk / Noir Poseidon gate counts documented in the Aztec codebase.
//
// Visualisation: force-directed cluster graph on Canvas.
//   • Each cluster = one constraint group (circle sized by gate count)
//   • Nodes within each cluster = individual constraint "cells"
//   • Edges connect clusters that share signals (witness wires)
//   • Animated: clusters drift with soft spring forces; pulse on hover

import React, {
    useRef,
    useEffect,
    useCallback,
    useState,
    useMemo,
  } from "react";
  
  import { MERKLE_TREE_DEPTH } from "@/lib/constants";
  
  // ---------------------------------------------------------------------------
  // Circuit model
  // ---------------------------------------------------------------------------
  
  // Poseidon2 in UltraHonk costs ~30 custom gates per 2-input hash.
  // Each Merkle level = 1 Poseidon2 hash → ~30 gates.
  // Nullifier = 1 Poseidon2 hash → ~30 gates.
  const POSEIDON_GATES_PER_HASH = 30;
  
  export interface ConstraintCluster {
    id:          string;
    label:       string;
    sublabel:    string;
    gateCount:   number;
    /** Ids of clusters this one shares wires with */
    connections: string[];
    color:       string;
    glowColor:   string;
  }
  
  function buildCircuitModel(treeDepth: number): ConstraintCluster[] {
    const merkleGates   = treeDepth * POSEIDON_GATES_PER_HASH;
    const nullifierGates = POSEIDON_GATES_PER_HASH;
    const rangeGates    = treeDepth * 2;   // index bit decomposition
    const rootGates     = 4;               // equality + public input wire
  
    return [
      {
        id:          "merkle",
        label:       "Merkle Path",
        sublabel:    `${treeDepth} Poseidon2 hashes · ${merkleGates} gates`,
        gateCount:   merkleGates,
        connections: ["nullifier", "root"],
        color:       "#4f98a3",
        glowColor:   "rgba(79,152,163,0.3)",
      },
      {
        id:          "nullifier",
        label:       "Nullifier",
        sublabel:    `Poseidon2(addr, secret) · ${nullifierGates} gates`,
        gateCount:   nullifierGates,
        connections: ["merkle", "range"],
        color:       "#a78bfa",
        glowColor:   "rgba(167,139,250,0.3)",
      },
      {
        id:          "range",
        label:       "Range Checks",
        sublabel:    `Index bounds · ${rangeGates} gates`,
        gateCount:   rangeGates,
        connections: ["nullifier", "root"],
        color:       "#fbbf24",
        glowColor:   "rgba(251,191,36,0.3)",
      },
      {
        id:          "root",
        label:       "Root Equality",
        sublabel:    `Public input wire · ${rootGates} gates`,
        gateCount:   rootGates,
        connections: ["merkle", "range"],
        color:       "#34d399",
        glowColor:   "rgba(52,211,153,0.3)",
      },
    ];
  }
  
  // ---------------------------------------------------------------------------
  // Physics node (one per cluster)
  // ---------------------------------------------------------------------------
  
  interface PhysNode {
    cluster:  ConstraintCluster;
    x:        number;
    y:        number;
    vx:       number;
    vy:       number;
    /** Display radius in px — proportional to sqrt(gateCount) */
    radius:   number;
    /** Inner node count (dots drawn inside circle) */
    dotCount: number;
  }
  
  const BASE_RADIUS   = 28;
  const RADIUS_SCALE  = 0.18;
  const MAX_DOT_COUNT = 24;
  
  function initNodes(
    clusters: ConstraintCluster[],
    W: number,
    H: number,
  ): PhysNode[] {
    // Arrange initially in a circle
    return clusters.map((c, i) => {
      const angle  = (i / clusters.length) * Math.PI * 2 - Math.PI / 2;
      const spread = Math.min(W, H) * 0.28;
      const radius = BASE_RADIUS + RADIUS_SCALE * Math.sqrt(c.gateCount);
      return {
        cluster:  c,
        x:        W / 2 + Math.cos(angle) * spread,
        y:        H / 2 + Math.sin(angle) * spread,
        vx:       0,
        vy:       0,
        radius,
        dotCount: Math.min(
          MAX_DOT_COUNT,
          Math.round(4 + (c.gateCount / 650) * MAX_DOT_COUNT),
        ),
      };
    });
  }
  
  // ---------------------------------------------------------------------------
  // Mulberry32 PRNG (for deterministic dot positions per cluster)
  // ---------------------------------------------------------------------------
  
  function mulberry32(seed: number) {
    return () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 0xffffffff;
    };
  }
  
  // Pre-compute dot offsets for each cluster so they don't jump each frame
  function precomputeDots(
    nodes: PhysNode[],
  ): Map<string, Array<{ ox: number; oy: number }>> {
    const map = new Map<string, Array<{ ox: number; oy: number }>>();
    nodes.forEach((n, i) => {
      const rand = mulberry32(i * 0xdeadbeef);
      const dots: Array<{ ox: number; oy: number }> = [];
      for (let d = 0; d < n.dotCount; d++) {
        const r     = (0.2 + rand() * 0.65) * n.radius;
        const theta = rand() * Math.PI * 2;
        dots.push({ ox: Math.cos(theta) * r, oy: Math.sin(theta) * r });
      }
      map.set(n.cluster.id, dots);
    });
    return map;
  }
  
  // ---------------------------------------------------------------------------
  // CircuitExplorer
  // ---------------------------------------------------------------------------
  
  export interface CircuitExplorerProps {
    className?: string;
  }
  
  export function CircuitExplorer({ className = "" }: CircuitExplorerProps) {
    const canvasRef   = useRef<HTMLCanvasElement>(null);
    const animRef     = useRef<number>(0);
    const nodesRef    = useRef<PhysNode[]>([]);
    const dotsRef     = useRef<Map<string, Array<{ ox: number; oy: number }>>>(new Map());
    const initDoneRef = useRef(false);
  
    const [hoveredId, setHoveredId]     = useState<string | null>(null);
    const mouseRef = useRef<{ x: number; y: number } | null>(null);
  
    const clusters = useMemo(() => buildCircuitModel(MERKLE_TREE_DEPTH), []);
  
    const totalGates = useMemo(
      () => clusters.reduce((s, c) => s + c.gateCount, 0),
      [clusters],
    );
  
    // ── Initialise nodes once canvas is sized ────────────────────────────────
    const initNodes_ = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const W   = canvas.width  / dpr;
      const H   = canvas.height / dpr;
      nodesRef.current = initNodes(clusters, W, H);
      dotsRef.current  = precomputeDots(nodesRef.current);
      initDoneRef.current = true;
    }, [clusters]);
  
    // ── Physics tick ─────────────────────────────────────────────────────────
    const tick = useCallback((W: number, H: number) => {
      const nodes = nodesRef.current;
      const cx    = W / 2;
      const cy    = H / 2;
      const DAMPING   = 0.88;
      const REPULSION = 3200;
      const SPRING_K  = 0.012;
      const CENTRE_K  = 0.004;
  
      // Repulsion between all pairs
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i]!;
          const b = nodes[j]!;
          const dx  = a.x - b.x;
          const dy  = a.y - b.y;
          const d2  = dx * dx + dy * dy + 1;
          const f   = REPULSION / d2;
          const nx  = dx / Math.sqrt(d2);
          const ny  = dy / Math.sqrt(d2);
          a.vx += f * nx;
          a.vy += f * ny;
          b.vx -= f * nx;
          b.vy -= f * ny;
        }
      }
  
      // Spring attraction along edges
      const idToNode = new Map(nodes.map((n) => [n.cluster.id, n]));
      nodes.forEach((n) => {
        n.cluster.connections.forEach((tid) => {
          const t = idToNode.get(tid);
          if (!t) return;
          const dx = t.x - n.x;
          const dy = t.y - n.y;
          n.vx += dx * SPRING_K;
          n.vy += dy * SPRING_K;
        });
      });
  
      // Attract toward canvas centre
      nodes.forEach((n) => {
        n.vx += (cx - n.x) * CENTRE_K;
        n.vy += (cy - n.y) * CENTRE_K;
      });
  
      // Integrate + damp + clamp to canvas bounds
      nodes.forEach((n) => {
        n.vx *= DAMPING;
        n.vy *= DAMPING;
        n.x  += n.vx;
        n.y  += n.vy;
        const pad = n.radius + 8;
        n.x = Math.max(pad, Math.min(W - pad, n.x));
        n.y = Math.max(pad, Math.min(H - pad, n.y));
      });
    }, []);
  
    // ── Draw ─────────────────────────────────────────────────────────────────
    const draw = useCallback(
      (timestamp: number) => {
        const canvas = canvasRef.current;
        if (!canvas || !initDoneRef.current) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
  
        const dpr = window.devicePixelRatio || 1;
        const W   = canvas.width  / dpr;
        const H   = canvas.height / dpr;
  
        ctx.save();
        ctx.scale(dpr, dpr);
  
        // Background
        ctx.fillStyle = "#08090a";
        ctx.fillRect(0, 0, W, H);
  
        // Physics
        tick(W, H);
  
        const nodes    = nodesRef.current;
        const dotsMap  = dotsRef.current;
        const idToNode = new Map(nodes.map((n) => [n.cluster.id, n]));
        const t        = timestamp / 1000;
  
        // ── Edges ─────────────────────────────────────────────────────────
        // Draw each edge once (deduplicate)
        const drawn = new Set<string>();
        nodes.forEach((n) => {
          n.cluster.connections.forEach((tid) => {
            const key = [n.cluster.id, tid].sort().join("--");
            if (drawn.has(key)) return;
            drawn.add(key);
            const target = idToNode.get(tid);
            if (!target) return;
  
            const isActive =
              hoveredId === n.cluster.id || hoveredId === tid;
  
            ctx.beginPath();
            ctx.moveTo(n.x, n.y);
            ctx.lineTo(target.x, target.y);
            ctx.strokeStyle = isActive
              ? "rgba(255,255,255,0.15)"
              : "rgba(255,255,255,0.04)";
            ctx.lineWidth   = isActive ? 1.5 : 1;
            ctx.setLineDash(isActive ? [] : [4, 6]);
            ctx.stroke();
            ctx.setLineDash([]);
          });
        });
  
        // ── Clusters ──────────────────────────────────────────────────────
        nodes.forEach((n) => {
          const isHovered = hoveredId === n.cluster.id;
          const pulse     = 1 + (isHovered ? 0.08 : 0.04) * Math.sin(t * 1.6 + n.radius);
          const r         = n.radius * pulse;
  
          // Outer glow
          const gGrad = ctx.createRadialGradient(n.x, n.y, r * 0.4, n.x, n.y, r * 2.2);
          gGrad.addColorStop(0, n.cluster.glowColor);
          gGrad.addColorStop(1, "transparent");
          ctx.fillStyle = gGrad;
          ctx.beginPath();
          ctx.arc(n.x, n.y, r * 2.2, 0, Math.PI * 2);
          ctx.fill();
  
          // Cluster circle fill
          const cGrad = ctx.createRadialGradient(n.x - r * 0.3, n.y - r * 0.3, 0, n.x, n.y, r);
          cGrad.addColorStop(0, hexAlpha(n.cluster.color, isHovered ? 0.22 : 0.14));
          cGrad.addColorStop(1, hexAlpha(n.cluster.color, 0.04));
          ctx.fillStyle = cGrad;
          ctx.beginPath();
          ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
          ctx.fill();
  
          // Circle border
          ctx.beginPath();
          ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
          ctx.strokeStyle = hexAlpha(n.cluster.color, isHovered ? 0.9 : 0.5);
          ctx.lineWidth   = isHovered ? 1.5 : 1;
          ctx.stroke();
  
          // Inner constraint dots
          const dots = dotsMap.get(n.cluster.id) ?? [];
          dots.forEach((dot) => {
            const px = n.x + dot.ox;
            const py = n.y + dot.oy;
            ctx.beginPath();
            ctx.arc(px, py, 1.5, 0, Math.PI * 2);
            ctx.fillStyle = hexAlpha(n.cluster.color, isHovered ? 0.7 : 0.4);
            ctx.fill();
          });
  
          // Label (only when hovered or always for large clusters)
          if (isHovered || n.radius > 40) {
            ctx.fillStyle = isHovered ? "#f4f4f5" : "#a1a1aa";
            ctx.font      = `600 ${isHovered ? 11 : 10}px ui-monospace, monospace`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(n.cluster.label, n.x, n.y);
          }
        });
  
        // Hover tooltip: gate count ring
        if (hoveredId) {
          const n = idToNode.get(hoveredId);
          if (n) {
            const r = n.radius * 1.08;
            ctx.beginPath();
            ctx.arc(n.x, n.y, r + 6, 0, Math.PI * 2);
            ctx.strokeStyle = hexAlpha(n.cluster.color, 0.35);
            ctx.lineWidth   = 1;
            ctx.setLineDash([2, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }
  
        // Hover hit-test
        if (mouseRef.current) {
          let found: string | null = null;
          let bestDist = Infinity;
          nodes.forEach((n) => {
            const dx   = mouseRef.current!.x - n.x;
            const dy   = mouseRef.current!.y - n.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < n.radius + 12 && dist < bestDist) {
              bestDist = dist;
              found    = n.cluster.id;
            }
          });
          if (found !== hoveredId) setHoveredId(found);
        }
  
        ctx.restore();
      },
      [hoveredId, tick],
    );
  
    // ── Animation loop ────────────────────────────────────────────────────────
    useEffect(() => {
      function loop(ts: number) {
        animRef.current = requestAnimationFrame(loop);
        draw(ts);
      }
      animRef.current = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(animRef.current);
    }, [draw]);
  
    // ── Resize observer ────────────────────────────────────────────────────────
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const ro  = new ResizeObserver((entries) => {
        const e = entries[0];
        if (!e) return;
        const { width, height } = e.contentRect;
        canvas.width  = width  * dpr;
        canvas.height = height * dpr;
        initNodes_();
      });
      ro.observe(canvas);
      return () => ro.disconnect();
    }, [initNodes_]);
  
    // ── Mouse tracking ─────────────────────────────────────────────────────────
    const handleMouseMove = useCallback(
      (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        mouseRef.current = {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        };
      },
      [],
    );
  
    const handleMouseLeave = useCallback(() => {
      mouseRef.current = null;
      setHoveredId(null);
    }, []);
  
    // ── Active cluster info ────────────────────────────────────────────────────
    const activeCluster = hoveredId
      ? clusters.find((c) => c.id === hoveredId) ?? null
      : null;
  
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
            {/* Circuit icon */}
            <svg
              viewBox="0 0 18 18"
              className="h-4 w-4 text-zinc-400"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <circle cx="4"  cy="9" r="2" />
              <circle cx="14" cy="4" r="2" />
              <circle cx="14" cy="14" r="2" />
              <line x1="6"  y1="9"  x2="10" y2="5.2" />
              <line x1="6"  y1="9"  x2="10" y2="12.8" />
              <line x1="12" y1="4"  x2="12" y2="14" strokeDasharray="2 2" />
            </svg>
            <span className="text-xs font-semibold tracking-wide text-zinc-300">
              Circuit Explorer
            </span>
          </div>
  
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2 py-0.5 font-mono text-[10px] text-zinc-500">
              UltraHonk · Noir
            </span>
            <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
              ~{totalGates.toLocaleString("en-US")} gates
            </span>
          </div>
        </div>
  
        {/* ── Canvas ────────────────────────────────────────────────────── */}
        <div className="relative">
          <canvas
            ref={canvasRef}
            className="h-[300px] w-full cursor-crosshair"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            aria-label="Circuit constraint cluster visualisation"
            role="img"
          />
  
          {/* Hover info overlay */}
          {activeCluster && (
            <div
              className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-xl border px-4 py-2.5 shadow-xl backdrop-blur-sm"
              style={{
                borderColor: hexAlpha(activeCluster.color, 0.35),
                backgroundColor: "rgba(9,10,11,0.92)",
              }}
            >
              <p
                className="text-[10px] font-semibold uppercase tracking-widest"
                style={{ color: activeCluster.color }}
              >
                {activeCluster.label}
              </p>
              <p className="mt-0.5 text-[11px] text-zinc-400">
                {activeCluster.sublabel}
              </p>
            </div>
          )}
        </div>
  
        {/* ── Cluster legend ────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-px border-t border-zinc-800/60 sm:grid-cols-4">
          {clusters.map((c) => {
            const pct = ((c.gateCount / totalGates) * 100).toFixed(1);
            const isActive = hoveredId === c.id;
            return (
              <div
                key={c.id}
                className={[
                  "flex flex-col gap-1 px-4 py-3 transition-colors duration-100",
                  isActive ? "bg-zinc-900/60" : "hover:bg-zinc-900/30",
                ].join(" ")}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: c.color }}
                    aria-hidden="true"
                  />
                  <span className="text-[10px] font-semibold text-zinc-400">
                    {c.label}
                  </span>
                </div>
                <p className="font-mono text-xs font-semibold tabular-nums text-zinc-200">
                  {c.gateCount.toLocaleString("en-US")}
                  <span className="ml-1 text-[10px] font-normal text-zinc-600">
                    gates
                  </span>
                </p>
                <p className="text-[10px] text-zinc-700">{pct}% of circuit</p>
              </div>
            );
          })}
        </div>
  
        {/* ── Footer note ───────────────────────────────────────────────── */}
        <div className="border-t border-zinc-800/40 px-5 py-2">
          <p className="text-[10px] text-zinc-700">
            Gate counts estimated from UltraHonk Poseidon2 gate cost ·
            Merkle depth {MERKLE_TREE_DEPTH} · 1 public input (root)
          </p>
        </div>
      </div>
    );
  }
  
  export default CircuitExplorer;
  
  // ---------------------------------------------------------------------------
  // Utility: hex colour + alpha
  // ---------------------------------------------------------------------------
  
  function hexAlpha(hex: string, alpha: number): string {
    // Accepts #rrggbb — convert to rgba
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }