// frontend/src/components/sanctions/RadarCanvas.tsx
//
// Canvas scatter map of sanctioned address nodes.
//
// Since the on-chain contract intentionally does not expose individual
// sanctioned addresses (privacy + gas), this visualiser is generative:
// it seeds a deterministic scatter of `addressCount` nodes using the
// Merkle root hash as the PRNG seed. The pattern is therefore unique
// and stable for each root — it changes visibly when the root rotates,
// making it a meaningful "fingerprint" of the sanctions list state
// rather than arbitrary random art.
//
// Visual features:
//   • Polar radar grid with animated sweep line
//   • Deterministic node scatter seeded from root hash
//   • Nodes pulse with staggered phase offsets
//   • Particles drift outward from centre
//   • Hover shows nearest node's synthetic address fragment
//   • Root change triggers a wipe-and-redraw transition

import React, {
    useRef,
    useEffect,
    useCallback,
    useState,
    useMemo,
  } from "react";
  
  import {
    useSanctionsStore,
    selectCurrentRoot,
    selectAddressCount,
    selectSanctionsStatus,
  } from "@/store/sanctionsStore";
  import { formatHash } from "@/lib/format";
  
  // ---------------------------------------------------------------------------
  // Types
  // ---------------------------------------------------------------------------
  
  export interface RadarCanvasProps {
    className?: string;
  }
  
  interface ScatterNode {
    /** Polar coords, normalised 0..1 */
    r:     number;
    theta: number;
    /** Pulsation phase offset 0..2π */
    phase: number;
    /** Visual size multiplier 0.6..1.4 */
    size:  number;
    /** Synthetic label derived from seed */
    label: string;
  }
  
  interface DriftParticle {
    r:      number;
    theta:  number;
    speed:  number;
    alpha:  number;
    size:   number;
  }
  
  // ---------------------------------------------------------------------------
  // Deterministic PRNG — mulberry32
  // ---------------------------------------------------------------------------
  
  function mulberry32(seed: number) {
    return function (): number {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 0xffffffff;
    };
  }
  
  /** Convert the first 8 chars of a hex root into a numeric seed. */
  function rootToSeed(root: string): number {
    const hex = root.replace(/^0x/i, "").slice(0, 8);
    return parseInt(hex || "deadbeef", 16);
  }
  
  // ---------------------------------------------------------------------------
  // Generate scatter nodes
  // ---------------------------------------------------------------------------
  
  const MAX_RENDERED_NODES = 320;  // cap for performance
  const MIN_R              = 0.08; // keep nodes away from dead centre
  const MAX_R              = 0.92;
  
  function generateNodes(root: string, count: bigint): ScatterNode[] {
    const n    = Math.min(Number(count), MAX_RENDERED_NODES);
    const rand = mulberry32(rootToSeed(root));
    const nodes: ScatterNode[] = [];
  
    for (let i = 0; i < n; i++) {
      // Distribute radially with slight cluster near 0.5–0.75 range
      const raw = rand();
      const r   = MIN_R + (MAX_R - MIN_R) * Math.pow(raw, 0.7);
      const theta = rand() * Math.PI * 2;
      const phase = rand() * Math.PI * 2;
      const size  = 0.6 + rand() * 0.8;
  
      // Synthetic address fragment from two rand values
      const hex1 = Math.floor(rand() * 0xffff).toString(16).padStart(4, "0");
      const hex2 = Math.floor(rand() * 0xffff).toString(16).padStart(4, "0");
      const label = `0x${hex1}…${hex2}`;
  
      nodes.push({ r, theta, phase, size, label });
    }
  
    return nodes;
  }
  
  // ---------------------------------------------------------------------------
  // Generate drift particles
  // ---------------------------------------------------------------------------
  
  const PARTICLE_COUNT = 40;
  
  function generateParticles(seed: number): DriftParticle[] {
    const rand = mulberry32(seed ^ 0xabcdef);
    return Array.from({ length: PARTICLE_COUNT }, () => ({
      r:     MIN_R + rand() * (MAX_R - MIN_R),
      theta: rand() * Math.PI * 2,
      speed: 0.00015 + rand() * 0.0003,
      alpha: 0.1 + rand() * 0.3,
      size:  0.8 + rand() * 1.2,
    }));
  }
  
  // ---------------------------------------------------------------------------
  // Colours
  // ---------------------------------------------------------------------------
  
  const C = {
    bg:           "#08090a",
    gridRing:     "rgba(79,152,163,0.08)",
    gridSpoke:    "rgba(79,152,163,0.05)",
    sweep:        "rgba(79,152,163,0.18)",
    sweepEdge:    "rgba(79,152,163,0.6)",
  
    nodeDefault:  "rgba(79,152,163,0.7)",
    nodeHover:    "rgba(160,220,227,1)",
    nodeGlow:     "rgba(79,152,163,0.25)",
  
    particle:     "rgba(79,152,163,0.5)",
    centreGlow:   "rgba(79,152,163,0.12)",
  
    crosshair:    "rgba(79,152,163,0.15)",
  };
  
  // ---------------------------------------------------------------------------
  // RadarCanvas
  // ---------------------------------------------------------------------------
  
  export function RadarCanvas({ className = "" }: RadarCanvasProps) {
    const currentRoot  = useSanctionsStore(selectCurrentRoot);
    const addressCount = useSanctionsStore(selectAddressCount);
    const status       = useSanctionsStore(selectSanctionsStatus);
  
    const canvasRef    = useRef<HTMLCanvasElement>(null);
    const animRef      = useRef<number>(0);
    const sweepRef     = useRef<number>(0);        // current sweep angle (radians)
    const alphaRef     = useRef<number>(0);        // fade-in progress 0→1
    const particlesRef = useRef<DriftParticle[]>([]);
  
    // Hover
    const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);
    const mouseRef = useRef<{ x: number; y: number } | null>(null);
  
    // ── Generate deterministic nodes whenever root/count changes ──────────
    const nodes = useMemo<ScatterNode[]>(() => {
      if (!currentRoot || !addressCount || addressCount === 0n) return [];
      return generateNodes(currentRoot, addressCount);
    }, [currentRoot, addressCount]);
  
    // Reset fade-in and particles on root change
    useEffect(() => {
      alphaRef.current = 0;
      particlesRef.current = generateParticles(
        currentRoot ? rootToSeed(currentRoot) : 0,
      );
    }, [currentRoot]);
  
    // ── Draw ────────────────────────────────────────────────────────────────
    const draw = useCallback(
      (timestamp: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
  
        const dpr = window.devicePixelRatio || 1;
        const W   = canvas.width  / dpr;
        const H   = canvas.height / dpr;
        const cx  = W / 2;
        const cy  = H / 2;
        const R   = Math.min(W, H) * 0.44; // max radar radius in px
  
        ctx.save();
        ctx.scale(dpr, dpr);
  
        // ── Background ──────────────────────────────────────────────────
        ctx.fillStyle = C.bg;
        ctx.fillRect(0, 0, W, H);
  
        // ── Centre glow ─────────────────────────────────────────────────
        const cGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.6);
        cGrad.addColorStop(0, C.centreGlow);
        cGrad.addColorStop(1, "transparent");
        ctx.fillStyle = cGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, R * 0.6, 0, Math.PI * 2);
        ctx.fill();
  
        // ── Radar rings (4 concentric) ───────────────────────────────────
        const RING_COUNT = 4;
        for (let i = 1; i <= RING_COUNT; i++) {
          const rr = R * (i / RING_COUNT);
          ctx.beginPath();
          ctx.arc(cx, cy, rr, 0, Math.PI * 2);
          ctx.strokeStyle = C.gridRing;
          ctx.lineWidth   = 1;
          ctx.stroke();
        }
  
        // ── Spokes (8) ──────────────────────────────────────────────────
        for (let i = 0; i < 8; i++) {
          const angle = (i * Math.PI) / 4;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + Math.cos(angle) * R, cy + Math.sin(angle) * R);
          ctx.strokeStyle = C.gridSpoke;
          ctx.lineWidth   = 1;
          ctx.stroke();
        }
  
        // Outer ring border
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(79,152,163,0.2)";
        ctx.lineWidth   = 1.5;
        ctx.stroke();
  
        // ── Crosshair ───────────────────────────────────────────────────
        ctx.strokeStyle = C.crosshair;
        ctx.lineWidth   = 1;
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy);
        ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R);
        ctx.stroke();
        ctx.setLineDash([]);
  
        // ── Sweep line + fill ────────────────────────────────────────────
        const SWEEP_SPAN = Math.PI / 5; // trailing arc width
        sweepRef.current = (sweepRef.current + 0.008) % (Math.PI * 2);
        const sweepAngle = sweepRef.current;
  
        // Trailing fill wedge
        
  
        // Approximate conical sweep with arc fill
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, R, sweepAngle - SWEEP_SPAN, sweepAngle, false);
        ctx.closePath();
        const sweepFill = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
        sweepFill.addColorStop(0, "rgba(79,152,163,0.02)");
        sweepFill.addColorStop(1, C.sweep);
        ctx.fillStyle = sweepFill;
        ctx.fill();
  
        // Leading edge line
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(
          cx + Math.cos(sweepAngle) * R,
          cy + Math.sin(sweepAngle) * R,
        );
        ctx.strokeStyle = C.sweepEdge;
        ctx.lineWidth   = 1.5;
        ctx.stroke();
  
        // ── Fade-in progress ────────────────────────────────────────────
        if (alphaRef.current < 1) {
          alphaRef.current = Math.min(1, alphaRef.current + 0.012);
        }
        const globalAlpha = alphaRef.current;
  
        // ── Drift particles ─────────────────────────────────────────────
        particlesRef.current.forEach((p) => {
          const px = cx + Math.cos(p.theta) * p.r * R;
          const py = cy + Math.sin(p.theta) * p.r * R;
  
          ctx.beginPath();
          ctx.arc(px, py, p.size, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(79,152,163,${p.alpha * globalAlpha})`;
          ctx.fill();
  
          // Drift outward + rotate
          p.r     += p.speed;
          p.theta += p.speed * 0.3;
          if (p.r > MAX_R) {
            p.r = MIN_R;
            p.theta = Math.random() * Math.PI * 2;
          }
        });
  
        // ── Scatter nodes ────────────────────────────────────────────────
        const t = timestamp / 1000; // seconds
        let closestDist = Infinity;
        let closestLabel: string | null = null;
  
        nodes.forEach((node) => {
          const px = cx + Math.cos(node.theta) * node.r * R;
          const py = cy + Math.sin(node.theta) * node.r * R;
  
          // Pulsation: size oscillates ±20% at ~1–2 Hz
          const pulse = 1 + 0.2 * Math.sin(t * 1.8 + node.phase);
          const baseSize = 2.2 * node.size * pulse;
  
          // Check sweep proximity — nodes "light up" when sweep passes them
          const nodeAngle = node.theta < 0 ? node.theta + Math.PI * 2 : node.theta;
          const diff = ((sweepAngle - nodeAngle) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
          const nearSweep = diff < SWEEP_SPAN;
          const brightness = nearSweep ? 1 : 0.55;
  
          // Glow
          if (nearSweep) {
            const gGrad = ctx.createRadialGradient(px, py, 0, px, py, baseSize * 3.5);
            gGrad.addColorStop(0, `rgba(79,152,163,${0.4 * globalAlpha})`);
            gGrad.addColorStop(1, "transparent");
            ctx.fillStyle = gGrad;
            ctx.beginPath();
            ctx.arc(px, py, baseSize * 3.5, 0, Math.PI * 2);
            ctx.fill();
          }
  
          // Node dot
          ctx.beginPath();
          ctx.arc(px, py, baseSize, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(79,152,163,${brightness * globalAlpha})`;
          ctx.fill();
  
          // Hover detection
          if (mouseRef.current) {
            const dx = mouseRef.current.x - px;
            const dy = mouseRef.current.y - py;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < closestDist && dist < 18) {
              closestDist  = dist;
              closestLabel = node.label;
            }
          }
        });
  
        // Update hovered label (batched outside draw to avoid setState in rAF)
        if (closestLabel !== hoveredLabel) {
          setHoveredLabel(closestLabel);
        }
  
        // ── Centre dot ──────────────────────────────────────────────────
        ctx.beginPath();
        ctx.arc(cx, cy, 3, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(79,152,163,0.9)";
        ctx.fill();
  
        ctx.restore();
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [nodes],
    );
  
    // ── Animation loop ──────────────────────────────────────────────────────
    useEffect(() => {
      function loop(ts: number) {
        animRef.current = requestAnimationFrame(loop);
        draw(ts);
      }
      animRef.current = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(animRef.current);
    }, [draw]);
  
    // ── Resize observer ─────────────────────────────────────────────────────
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
      });
      ro.observe(canvas);
      return () => ro.disconnect();
    }, []);
  
    // ── Mouse tracking ──────────────────────────────────────────────────────
    const handleMouseMove = useCallback(
      (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const dpr  = window.devicePixelRatio || 1;
        const rect  = canvas.getBoundingClientRect();
        mouseRef.current = {
          x: (e.clientX - rect.left),
          y: (e.clientY - rect.top),
        };
        void dpr; // dpr handled in draw
      },
      [],
    );
  
    const handleMouseLeave = useCallback(() => {
      mouseRef.current = null;
      setHoveredLabel(null);
    }, []);
  
    // ── Derived display ──────────────────────────────────────────────────────
    const isLoading   = status === "loading" && !currentRoot;
    const rootShort   = currentRoot ? formatHash(currentRoot, 6, 4) : null;
    const countDisplay = addressCount !== null ? Number(addressCount).toLocaleString("en-US") : "—";
    const renderedCount = nodes.length;
  
    // ---------------------------------------------------------------------------
    // Render
    // ---------------------------------------------------------------------------
  
    return (
      <div
        className={[
          "relative flex flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950",
          className,
        ].join(" ")}
      >
        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-5 py-3">
          <div className="flex items-center gap-2">
            {/* Radar icon */}
            <svg
              viewBox="0 0 18 18"
              className="h-4 w-4 text-teal-400"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <circle cx="9" cy="9" r="7.5" />
              <circle cx="9" cy="9" r="4.5" />
              <circle cx="9" cy="9" r="1.5" fill="currentColor" strokeWidth="0" />
              <line x1="9" y1="9" x2="14.5" y2="5.5" strokeWidth="1.8" />
            </svg>
            <span className="text-xs font-semibold tracking-wide text-zinc-300">
              Address Radar
            </span>
          </div>
  
          <div className="flex items-center gap-2">
            {/* Root hash chip */}
            {rootShort && (
              <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2 py-0.5 font-mono text-[10px] text-zinc-500">
                {rootShort}
              </span>
            )}
  
            {/* Node count chip */}
            <span className="rounded-full border border-teal-500/20 bg-teal-500/8 px-2 py-0.5 text-[10px] font-medium text-teal-500">
              {countDisplay} addrs
            </span>
  
            {/* Live ping */}
            <span className="inline-flex items-center gap-1">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-40" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-500" />
              </span>
            </span>
          </div>
        </div>
  
        {/* ── Canvas ────────────────────────────────────────────────────── */}
        <div className="relative">
          <canvas
            ref={canvasRef}
            className="h-[360px] w-full cursor-crosshair"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            aria-label="Radar scatter map of sanctioned addresses"
            role="img"
          />
  
          {/* Loading overlay */}
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-2">
                <svg
                  viewBox="0 0 24 24"
                  className="h-6 w-6 animate-spin text-teal-500"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M12 2A10 10 0 0 1 22 12" />
                </svg>
                <span className="text-[11px] text-zinc-600">Loading sanctions data…</span>
              </div>
            </div>
          )}
  
          {/* Empty state overlay */}
          {!isLoading && nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center gap-2 text-center">
                <svg
                  viewBox="0 0 32 32"
                  className="h-8 w-8 text-zinc-800"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <circle cx="16" cy="16" r="13" />
                  <circle cx="16" cy="16" r="7" />
                  <circle cx="16" cy="16" r="1.5" fill="currentColor" strokeWidth="0" />
                </svg>
                <p className="text-xs text-zinc-600">No address data available</p>
              </div>
            </div>
          )}
  
          {/* Hover tooltip */}
          {hoveredLabel && (
            <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-lg border border-zinc-700 bg-zinc-900/95 px-3 py-1.5 shadow-lg backdrop-blur-sm">
              <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-600">
                Node
              </p>
              <p className="font-mono text-[11px] text-teal-300">{hoveredLabel}</p>
            </div>
          )}
        </div>
  
        {/* ── Footer ────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3 border-t border-zinc-800/60 px-5 py-2.5">
          <p className="text-[10px] leading-relaxed text-zinc-700">
            Nodes are deterministically seeded from the Merkle root —
            pattern changes on each root rotation.
          </p>
          {renderedCount > 0 && renderedCount < Number(addressCount ?? 0) && (
            <span className="shrink-0 text-[10px] text-zinc-700">
              Showing {renderedCount.toLocaleString()} of {countDisplay}
            </span>
          )}
        </div>
      </div>
    );
  }
  
  export default RadarCanvas;