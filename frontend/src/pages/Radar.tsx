// frontend/src/pages/Radar.tsx
//
// Route: /app/radar — Sanctions Radar Map
//
// Two-pane layout:
//   Left  — grid-canvas: animated sweep arm + red threat dots + green USER_WALLET node
//   Right — Protocol Intelligence panel:
//             • VALID / FLAGGED / UNSCREENED / OFFLINE badge
//             • Network metrics (address count, root, snapshot date, scan counter)
//             • Radar filters (toggle threats, speed, dot size)
//             • Blip inspector (hovered dot detail)
//             • Node legend

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useAccount } from "wagmi";
import { formatHash } from "@/lib/format";
import { useProofStore, selectProofResult } from "@/store/proofStore";

// ---------------------------------------------------------------------------
// Snapshot type — matches the actual /data/sanctions-imt.json format
// ---------------------------------------------------------------------------
interface SanctionsSnapshot {
  source:       string;
  fetchedAt:    string;
  builtAt:      string;
  depth:        number;
  addressCount: number;
  root:         string;
  entries:      { address: string; value: string }[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SWEEP_SPEED_BASE      = 36;        // deg/s at "normal" speed
const GLOW_LIFETIME_MS      = 2_200;
const MAX_RADAR_DOTS        = 300;
const RING_COUNT            = 4;
const USER_BLIP_R           = 6;
const THREAT_BLIP_R         = 3;
const FADE_RATIO            = 0.55;

const C = {
  bg:          "#090909",
  gridLine:    "rgba(34,197,94,0.07)",
  arm:         "rgba(34,197,94,0.88)",
  armTrail:    (t: number) => `rgba(34,197,94,${(t * FADE_RATIO * 0.32).toFixed(3)})`,
  dot:         "rgba(230,50,50,0.75)",
  dotGlow:     "rgba(255,80,80,1)",
  dotDim:      "rgba(100,25,25,0.50)",
  userBlip:    "rgba(34,197,94,1)",
  userBlipRed: "rgba(255,70,70,1)",
  scanText:    "rgba(34,197,94,0.45)",
  crosshair:   "rgba(34,197,94,0.14)",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RadarDot {
  angle:     number;
  radius:    number;
  leafHash:  string;
  lastHit:   number;
  isFlagged?: boolean;
}

interface ScanStats {
  total:        number;
  scanned:      number;
  flagged:      number;
  snapshotDate: string;
  root:         string;
}

interface Filters {
  showThreats:    boolean;
  showBenign:     boolean;
  speedMult:      number; // 0.5 | 1 | 2
  dotScale:       number; // 0.7 | 1 | 1.4
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hashToPosition(hash: string): { angle: number; radius: number } {
  const a = parseInt(hash.slice(2, 10),  16);
  const r = parseInt(hash.slice(10, 18), 16);
  return {
    angle:  (a / 0xffffffff) * 2 * Math.PI,
    radius: 0.12 + (r / 0xffffffff) * 0.82,
  };
}

function polarToXY(cx: number, cy: number, radius: number, angle: number, scale: number): [number, number] {
  return [cx + Math.cos(angle) * radius * scale, cy + Math.sin(angle) * radius * scale];
}

function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d >  Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

// ---------------------------------------------------------------------------
// Canvas drawing
// ---------------------------------------------------------------------------

function drawGrid(ctx: CanvasRenderingContext2D, cx: number, cy: number, scale: number) {
  ctx.save();
  for (let i = 1; i <= RING_COUNT; i++) {
    const r = (i / RING_COUNT) * scale;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 2 * Math.PI);
    ctx.strokeStyle = C.gridLine;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = C.scanText;
    ctx.font = `${Math.max(8, scale * 0.026)}px ui-monospace,monospace`;
    ctx.textAlign = "left";
    ctx.fillText(`${i * 25}%`, cx + r + 3, cy + 3);
  }
  // Cross-hairs
  ctx.strokeStyle = C.crosshair;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(cx - scale, cy); ctx.lineTo(cx + scale, cy);
  ctx.moveTo(cx, cy - scale); ctx.lineTo(cx, cy + scale);
  ctx.stroke();
  // Cardinals
  ctx.fillStyle = C.scanText;
  ctx.font = `${Math.max(9, scale * 0.03)}px ui-monospace,monospace`;
  const lpad = scale + 13;
  ctx.textAlign = "center";
  ctx.fillText("N", cx, cy - lpad);
  ctx.fillText("S", cx, cy + lpad + 10);
  ctx.textAlign = "left";
  ctx.fillText("E", cx + lpad, cy + 4);
  ctx.textAlign = "right";
  ctx.fillText("W", cx - lpad, cy + 4);
  ctx.restore();
}

function drawSweep(ctx: CanvasRenderingContext2D, cx: number, cy: number, scale: number, armAngle: number) {
  ctx.save();
  const TRAIL_ARC = (3 * Math.PI) / 4;
  const STEPS = 28;
  for (let i = 0; i < STEPS; i++) {
    const t  = 1 - i / STEPS;
    const a0 = armAngle - (i / STEPS) * TRAIL_ARC;
    const a1 = armAngle - ((i + 1) / STEPS) * TRAIL_ARC;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, scale, a0, a1, true);
    ctx.closePath();
    ctx.fillStyle = C.armTrail(t);
    ctx.fill();
  }
  // Arm
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(armAngle) * scale, cy + Math.sin(armAngle) * scale);
  const grad = ctx.createLinearGradient(cx, cy, cx + Math.cos(armAngle) * scale, cy + Math.sin(armAngle) * scale);
  grad.addColorStop(0,   "rgba(34,197,94,0)");
  grad.addColorStop(0.6, "rgba(34,197,94,0.4)");
  grad.addColorStop(1,   C.arm);
  ctx.strokeStyle = grad;
  ctx.lineWidth = 2;
  ctx.shadowColor = "rgba(34,197,94,0.8)";
  ctx.shadowBlur = 8;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.restore();
}

function drawDot(
  ctx: CanvasRenderingContext2D, x: number, y: number,
  now: number, lastHit: number, dotScale: number, isHovered: boolean,
) {
  const age   = now - lastHit;
  const alive = age < GLOW_LIFETIME_MS;
  const t     = alive ? 1 - age / GLOW_LIFETIME_MS : 0;
  const baseR = THREAT_BLIP_R * dotScale;

  if (alive) {
    const pingR = baseR + (1 - t) * 18;
    ctx.beginPath();
    ctx.arc(x, y, pingR, 0, 2 * Math.PI);
    ctx.strokeStyle = `rgba(255,80,80,${(t * 0.55).toFixed(3)})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(x, y, isHovered ? baseR + 2 : baseR, 0, 2 * Math.PI);
  ctx.fillStyle = alive ? C.dotGlow : C.dotDim;
  if (alive || isHovered) {
    ctx.shadowColor = "rgba(255,80,80,0.9)";
    ctx.shadowBlur  = alive ? 10 * t : 8;
  }
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawUserBlip(ctx: CanvasRenderingContext2D, cx: number, cy: number, now: number, isFlagged: boolean) {
  const pulse = 0.5 + 0.5 * Math.sin((now / 700) * 2 * Math.PI);
  const col   = isFlagged ? C.userBlipRed : C.userBlip;
  const outerR = USER_BLIP_R + 4 + pulse * 6;
  ctx.beginPath();
  ctx.arc(cx, cy, outerR, 0, 2 * Math.PI);
  ctx.strokeStyle = isFlagged
    ? `rgba(255,70,70,${(0.15 + pulse * 0.25).toFixed(3)})`
    : `rgba(34,197,94,${(0.15 + pulse * 0.25).toFixed(3)})`;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, USER_BLIP_R, 0, 2 * Math.PI);
  ctx.fillStyle = col;
  ctx.shadowColor = col;
  ctx.shadowBlur  = 14 + pulse * 8;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = col;
  ctx.lineWidth = 1;
  const tick = 10;
  ([ [0,-1],[0,1],[-1,0],[1,0] ] as const).forEach(([dx, dy]) => {
    ctx.beginPath();
    ctx.moveTo(cx + dx * (USER_BLIP_R + 3), cy + dy * (USER_BLIP_R + 3));
    ctx.lineTo(cx + dx * (USER_BLIP_R + 3 + tick), cy + dy * (USER_BLIP_R + 3 + tick));
    ctx.stroke();
  });
  // "USER_WALLET" label
  ctx.fillStyle = col;
  ctx.font = `bold ${Math.max(7, USER_BLIP_R * 1.4)}px ui-monospace,monospace`;
  ctx.textAlign = "center";
  ctx.fillText("USER_WALLET", cx, cy - USER_BLIP_R - 8);
}

// ---------------------------------------------------------------------------
// useSweepLoop
// ---------------------------------------------------------------------------

function useSweepLoop(cb: (now: number, dt: number) => void) {
  const cbRef  = useRef(cb);
  const rafRef = useRef<number>(0);
  const prevTs = useRef<number | null>(null);
  useEffect(() => { cbRef.current = cb; }, [cb]);
  useEffect(() => {
    function tick(ts: number) {
      const dt = prevTs.current !== null ? (ts - prevTs.current) / 1_000 : 0;
      prevTs.current = ts;
      cbRef.current(ts, dt);
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);
}

// ---------------------------------------------------------------------------
// Radar page
// ---------------------------------------------------------------------------

export function Radar() {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const wrapRef     = useRef<HTMLDivElement>(null);
  const armAngleRef = useRef<number>(-Math.PI / 2);
  const dotsRef     = useRef<RadarDot[]>([]);

  const [dots,       setDots]       = useState<RadarDot[]>([]);
  const [stats,      setStats]      = useState<ScanStats | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [flagged,    setFlagged]    = useState(false);
  const [hoveredDot, setHoveredDot] = useState<RadarDot | null>(null);
  const [scanCount,  setScanCount]  = useState(0);
  const [filters,    setFilters]    = useState<Filters>({
    showThreats: true, showBenign: true, speedMult: 1, dotScale: 1,
  });

  const { address, isConnected } = useAccount();
  const proofResult = useProofStore(selectProofResult);
  const hasProof    = proofResult !== null;

  const isReady = !loading && !error && isConnected && !!address;

  type IntelStatus = "loading" | "offline" | "error" | "unscreened" | "valid" | "flagged";
  const intelStatus: IntelStatus = loading
    ? "loading"
    : !isConnected
    ? "offline"
    : error
    ? "error"
    : !hasProof
    ? "unscreened"
    : flagged
    ? "flagged"
    : "valid";

  // ── Load snapshot ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!isConnected || !address) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await fetch("/data/sanctions-imt.json", { cache: "no-store" });
        if (!res.ok) throw new Error(`Failed to load OFAC snapshot (HTTP ${res.status})`);
        const snapshot = (await res.json()) as SanctionsSnapshot;

        if (!Array.isArray(snapshot.entries)) {
          throw new Error("Snapshot has no entries array");
        }

        const lowerAddr = address.toLowerCase();
        const isSanctioned = snapshot.entries.some(
          (e) => e.address.toLowerCase() === lowerAddr,
        );

        // Sample down to MAX_RADAR_DOTS for performance
        const entries = snapshot.entries;
        const step    = entries.length > MAX_RADAR_DOTS
          ? Math.ceil(entries.length / MAX_RADAR_DOTS)
          : 1;
        const subset  = entries.filter((_, i) => i % step === 0);

        const mapped: RadarDot[] = subset.map((entry) => {
          const { angle, radius } = hashToPosition(entry.address);
          return {
            angle,
            radius,
            leafHash:  entry.address,
            lastHit:   0,
            isFlagged: entry.address.toLowerCase() === lowerAddr,
          };
        });

        dotsRef.current = mapped;
        setDots(mapped);
        setFlagged(isSanctioned);
        setStats({
          total:        snapshot.addressCount,
          scanned:      0,
          flagged:      isSanctioned ? 1 : 0,
          snapshotDate: snapshot.builtAt,
          root:         snapshot.root,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load OFAC snapshot");
      } finally {
        setLoading(false);
      }
    })();
  }, [address, isConnected]);

  // ── Canvas resize ──────────────────────────────────────────────────────
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((es) => {
      const { width, height } = es[0]!.contentRect;
      setCanvasSize({ w: width, h: height });
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  // ── rAF loop ───────────────────────────────────────────────────────────
  const scannedThisRotRef = useRef<Set<number>>(new Set());

  useSweepLoop(useCallback((now: number, dt: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { w, h } = canvasSize;
    if (w === 0 || h === 0) return;

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(w * dpr)) {
      canvas.width  = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.scale(dpr, dpr);
    }

    const cx    = w / 2;
    const cy    = h / 2;
    const scale = Math.min(cx, cy) - 24;

    const prevAngle = armAngleRef.current;
    const step = (SWEEP_SPEED_BASE * filters.speedMult * Math.PI / 180) * dt;
    armAngleRef.current = (armAngleRef.current + step) % (2 * Math.PI);
    const armAngle = armAngleRef.current;

    const crossed = (prevAngle < -Math.PI / 2 + Math.PI && armAngle >= -Math.PI / 2 + Math.PI) || prevAngle > armAngle;
    if (crossed) {
      setScanCount((c) => c + 1);
      scannedThisRotRef.current.clear();
    }

    const localDots = dotsRef.current;
    for (let i = 0; i < localDots.length; i++) {
      const dot  = localDots[i]!;
      const diff = angleDiff(armAngle, dot.angle);
      if (diff >= 0 && diff < 0.08) {
        dot.lastHit = now;
        scannedThisRotRef.current.add(i);
      }
    }

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, scale + 1, 0, 2 * Math.PI);
    ctx.clip();

    const radGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, scale);
    radGrad.addColorStop(0,   "rgba(0,32,22,0.92)");
    radGrad.addColorStop(0.6, "rgba(0,16,10,0.96)");
    radGrad.addColorStop(1,   "rgba(0,0,0,0.99)");
    ctx.fillStyle = radGrad;
    ctx.fillRect(0, 0, w, h);

    drawGrid(ctx, cx, cy, scale);
    drawSweep(ctx, cx, cy, scale, armAngle);

    const hovLeaf = hoveredDot?.leafHash;
    for (const dot of localDots) {
      if (dot.isFlagged && !filters.showThreats) continue;
      if (!dot.isFlagged && !filters.showBenign) continue;
      const [x, y] = polarToXY(cx, cy, dot.radius, dot.angle, scale);
      drawDot(ctx, x, y, now, dot.lastHit, filters.dotScale, dot.leafHash === hovLeaf);
    }

    drawUserBlip(ctx, cx, cy, now, flagged);
    ctx.restore();

    // Outer ring
    ctx.beginPath();
    ctx.arc(cx, cy, scale + 1, 0, 2 * Math.PI);
    ctx.strokeStyle = "rgba(34,197,94,0.20)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // HUD overlay
    ctx.fillStyle = "rgba(34,197,94,0.32)";
    ctx.font = `${Math.max(8, w * 0.013)}px ui-monospace,monospace`;
    ctx.textAlign = "left";
    ctx.fillText(`SCAN #${scanCount.toString().padStart(4, "0")}`, 8, h - 10);
    ctx.textAlign = "right";
    ctx.fillText(new Date().toISOString().slice(11, 19) + " UTC", w - 8, h - 10);

  }, [canvasSize, flagged, hoveredDot, scanCount, filters]));

  // ── Mouse hover ────────────────────────────────────────────────────────
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect  = canvas.getBoundingClientRect();
    const mx    = e.clientX - rect.left;
    const my    = e.clientY - rect.top;
    const cx    = rect.width  / 2;
    const cy    = rect.height / 2;
    const scale = Math.min(cx, cy) - 24;
    let best: RadarDot | null = null, bestD = 12;
    for (const dot of dotsRef.current) {
      const [x, y] = polarToXY(cx, cy, dot.radius, dot.angle, scale);
      const d = Math.hypot(mx - x, my - y);
      if (d < bestD) { bestD = d; best = dot; }
    }
    setHoveredDot(best);
  }, []);

  const handleMouseLeave = useCallback(() => setHoveredDot(null), []);

  // ── Filter helpers ─────────────────────────────────────────────────────
  function setSpeed(v: number) { setFilters((f) => ({ ...f, speedMult: v })); }
  function setDotSz(v: number) { setFilters((f) => ({ ...f, dotScale:  v })); }
  function toggleThreats() { setFilters((f) => ({ ...f, showThreats: !f.showThreats })); }
  function toggleBenign()  { setFilters((f) => ({ ...f, showBenign:  !f.showBenign  })); }

  return (
    <div className="flex min-h-[calc(100dvh-64px)] flex-col gap-4 p-4 sm:p-6 lg:flex-row lg:gap-5 lg:p-8">

      {/* ── Canvas pane ─────────────────────────────────────────────── */}
      <div
        ref={wrapRef}
        className="relative aspect-square w-full overflow-hidden rounded-xl border border-[#1e1e1e] bg-[#090909] lg:flex-1"
        style={{ maxHeight: "min(72vh, 680px)", maxWidth: "min(72vh, 680px)", margin: "0 auto" }}
      >
        {/* Loading */}
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#090909]/90">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#1e1e1e] border-t-[#22c55e]" />
            <p className="font-mono text-[11px] text-[#646464]">Loading OFAC snapshot…</p>
          </div>
        )}

        {/* Not connected */}
        {!isConnected && !loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#1e1e1e] bg-[#141414]">
              <WalletIcon className="h-6 w-6 text-[#3e3e3e]" />
            </div>
            <div>
              <p className="text-[14px] font-semibold text-[#646464]">Wallet not connected</p>
              <p className="mt-1 text-[11px] text-[#3e3e3e]">Connect your wallet to activate the radar scan</p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <AlertIcon className="h-7 w-7 text-rose-500" />
            <p className="font-mono text-[11px] text-rose-400">{error}</p>
          </div>
        )}

        {/* Canvas */}
        <canvas
          ref={canvasRef}
          className="h-full w-full"
          style={{ display: isReady ? "block" : "none" }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          aria-label="Sanctions radar map"
          role="img"
        />

        {/* Flagged ring pulse */}
        {flagged && isReady && (
          <div className="pointer-events-none absolute inset-0 animate-pulse rounded-xl ring-2 ring-rose-500/35" />
        )}

        {/* Corner HUD tag */}
        {isReady && (
          <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded border border-[#22c55e]/20 bg-[#22c55e]/6 px-2 py-1">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#22c55e]" />
            <span className="font-mono text-[9px] text-[#22c55e]">RADAR ACTIVE</span>
          </div>
        )}
      </div>

      {/* ── Protocol Intelligence panel ──────────────────────────── */}
      <div className="flex w-full flex-col gap-3 lg:w-72 lg:shrink-0">

        {/* ① VALID / FLAGGED / UNSCREENED / OFFLINE badge ───────── */}
        <div className={[
          "rounded-xl border p-4 transition-colors",
          intelStatus === "loading" || intelStatus === "offline"
            ? "border-[#1e1e1e] bg-[#141414]"
            : intelStatus === "error"
            ? "border-rose-500/20 bg-rose-500/5"
            : intelStatus === "flagged"
            ? "border-rose-500/25 bg-rose-500/6"
            : intelStatus === "valid"
            ? "border-[#22c55e]/20 bg-[#22c55e]/5"
            : "border-[#262626] bg-[#141414]",
        ].join(" ")}>
          <div className="flex items-center justify-between">
            <p className="font-mono text-[9px] uppercase tracking-widest text-[#3e3e3e]">
              Protocol Intelligence
            </p>
            {isReady && hasProof && (
              <span className={[
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] font-bold tracking-wider",
                intelStatus === "flagged"
                  ? "border-rose-500/25 bg-rose-500/8 text-rose-400"
                  : "border-[#22c55e]/25 bg-[#22c55e]/8 text-[#22c55e]",
              ].join(" ")}>
                <span className={["h-1.5 w-1.5 rounded-full", intelStatus === "flagged" ? "bg-rose-400 animate-pulse" : "bg-[#22c55e] animate-pulse"].join(" ")} />
                {intelStatus === "flagged" ? "FLAGGED" : "VALID"}
              </span>
            )}
            {isReady && !hasProof && (
              <span className="flex items-center gap-1.5 rounded-full border border-[#262626] bg-[#1e1e1e] px-2.5 py-1 font-mono text-[10px] font-bold tracking-wider text-[#646464]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#646464]" />
                UNSCREENED
              </span>
            )}
          </div>

          {/* Big status */}
          <div className="mt-3 flex flex-col items-center gap-2 py-3">
            <div className={[
              "flex h-16 w-16 items-center justify-center rounded-2xl border transition-colors",
              intelStatus === "loading" || intelStatus === "offline" || intelStatus === "unscreened"
                ? "border-[#1e1e1e] bg-[#0d0d0d]"
                : intelStatus === "error"
                ? "border-rose-500/20 bg-rose-500/5"
                : intelStatus === "flagged"
                ? "border-rose-500/25 bg-rose-500/8"
                : "border-[#22c55e]/20 bg-[#22c55e]/8",
            ].join(" ")}>
              {intelStatus === "loading" ? (
                <span className="h-6 w-6 animate-spin rounded-full border-2 border-[#1e1e1e] border-t-[#22c55e]" />
              ) : intelStatus === "offline" ? (
                <WalletIcon className="h-7 w-7 text-[#3e3e3e]" />
              ) : intelStatus === "error" ? (
                <AlertIcon className="h-7 w-7 text-rose-400" />
              ) : intelStatus === "unscreened" ? (
                <ShieldIcon className="h-7 w-7 text-[#646464]" />
              ) : intelStatus === "flagged" ? (
                <ShieldOffIcon className="h-7 w-7 text-rose-400" />
              ) : (
                <ShieldCheckIcon className="h-7 w-7 text-[#22c55e]" />
              )}
            </div>
            <div className="text-center">
              <p className={[
                "text-[15px] font-bold tracking-tight",
                intelStatus === "loading" || intelStatus === "offline" || intelStatus === "unscreened"
                  ? "text-[#646464]"
                  : intelStatus === "error"
                  ? "text-rose-300"
                  : intelStatus === "flagged"
                  ? "text-rose-300"
                  : "text-white",
              ].join(" ")}>
                {intelStatus === "loading" ? "Scanning…"
                 : intelStatus === "offline" ? "Offline"
                 : intelStatus === "error" ? "Error"
                 : intelStatus === "unscreened" ? "No ZK proof yet"
                 : intelStatus === "flagged" ? "Address Sanctioned"
                 : "Non-sanctioned"}
              </p>
              {address && (
                <p className="mt-0.5 font-mono text-[10px] text-[#646464]">
                  {formatHash(address, 8, 6)}
                </p>
              )}
              {intelStatus === "unscreened" && (
                <p className="mt-1 text-[10px] text-[#3e3e3e]">
                  Generate a proof to screen your wallet
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ② Network Metrics ──────────────────────────────────────── */}
        <div className="rounded-xl border border-[#1e1e1e] bg-[#141414]">
          <div className="flex items-center gap-2 border-b border-[#1e1e1e] px-4 py-2.5">
            <PulseIcon className="h-3 w-3 text-[#646464]" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-[#646464]">Network Metrics</span>
          </div>
          <div className="divide-y divide-[#0d0d0d] px-1">
            {[
              { label: "Total sanctions",  value: stats ? stats.total.toLocaleString() : "—" },
              { label: "Displayed blips",  value: dots.length > 0 ? dots.length.toLocaleString() : "—" },
              { label: "Scan rotations",   value: scanCount > 0 ? `#${scanCount.toString().padStart(4, "0")}` : "—", mono: true },
              { label: "Snapshot date",    value: stats ? new Date(stats.snapshotDate).toLocaleDateString() : "—" },
              {
                label: "Merkle root",
                value: stats ? formatHash(stats.root, 8, 6) : "—",
                mono: true,
                accent: true,
              },
            ].map(({ label, value, mono, accent }) => (
              <div key={label} className="flex items-center justify-between px-3.5 py-2">
                <span className="text-[10px] text-[#646464]">{label}</span>
                <span className={[
                  "text-[10px]",
                  mono ? "font-mono" : "",
                  accent ? "text-[#4ade80]" : "text-[#a0a0a0]",
                ].join(" ")}>
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ③ Radar Filters ──────────────────────────────────────── */}
        <div className="rounded-xl border border-[#1e1e1e] bg-[#141414]">
          <div className="flex items-center gap-2 border-b border-[#1e1e1e] px-4 py-2.5">
            <FilterIcon className="h-3 w-3 text-[#646464]" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-[#646464]">Radar Filters</span>
          </div>
          <div className="space-y-3 p-3.5">
            {/* Toggle row */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={toggleThreats}
                className={[
                  "flex items-center justify-center gap-1.5 rounded-lg border py-2 text-[11px] font-semibold transition-colors focus-visible:outline-none",
                  filters.showThreats
                    ? "border-rose-500/25 bg-rose-500/8 text-rose-400"
                    : "border-[#262626] bg-[#0d0d0d] text-[#3e3e3e]",
                ].join(" ")}
              >
                <span className="h-2 w-2 rounded-full bg-rose-500" />
                Threats
              </button>
              <button
                onClick={toggleBenign}
                className={[
                  "flex items-center justify-center gap-1.5 rounded-lg border py-2 text-[11px] font-semibold transition-colors focus-visible:outline-none",
                  filters.showBenign
                    ? "border-[#646464]/30 bg-[#646464]/8 text-[#a0a0a0]"
                    : "border-[#262626] bg-[#0d0d0d] text-[#3e3e3e]",
                ].join(" ")}
              >
                <span className="h-2 w-2 rounded-full bg-[#646464]" />
                Benign
              </button>
            </div>

            {/* Speed */}
            <div>
              <p className="mb-1.5 font-mono text-[9px] uppercase tracking-widest text-[#3e3e3e]">Sweep Speed</p>
              <div className="grid grid-cols-3 gap-1.5">
                {([0.5, 1, 2] as const).map((v) => (
                  <button key={v} onClick={() => setSpeed(v)}
                    className={[
                      "rounded-lg border py-1.5 text-[10px] font-semibold transition-colors focus-visible:outline-none",
                      filters.speedMult === v
                        ? "border-[#22c55e]/25 bg-[#22c55e]/8 text-[#22c55e]"
                        : "border-[#1e1e1e] bg-[#0d0d0d] text-[#646464] hover:border-[#262626]",
                    ].join(" ")}
                  >
                    {v === 0.5 ? "0.5×" : v === 1 ? "1×" : "2×"}
                  </button>
                ))}
              </div>
            </div>

            {/* Dot size */}
            <div>
              <p className="mb-1.5 font-mono text-[9px] uppercase tracking-widest text-[#3e3e3e]">Dot Size</p>
              <div className="grid grid-cols-3 gap-1.5">
                {([0.7, 1, 1.4] as const).map((v) => (
                  <button key={v} onClick={() => setDotSz(v)}
                    className={[
                      "rounded-lg border py-1.5 text-[10px] font-semibold transition-colors focus-visible:outline-none",
                      filters.dotScale === v
                        ? "border-[#22c55e]/25 bg-[#22c55e]/8 text-[#22c55e]"
                        : "border-[#1e1e1e] bg-[#0d0d0d] text-[#646464] hover:border-[#262626]",
                    ].join(" ")}
                  >
                    {v === 0.7 ? "S" : v === 1 ? "M" : "L"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ④ Blip Inspector ─────────────────────────────────────── */}
        <div className={[
          "rounded-xl border p-4 transition-all duration-200",
          hoveredDot ? "border-[#262626] bg-[#141414]" : "border-[#1a1a1a] bg-[#0d0d0d] opacity-60",
        ].join(" ")}>
          <div className="mb-2 flex items-center gap-2">
            <TargetIcon className="h-3 w-3 text-[#646464]" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-[#646464]">Blip Inspector</span>
          </div>
          {hoveredDot ? (
            <div className="space-y-2.5">
              <div>
                <p className="font-mono text-[9px] uppercase tracking-widest text-[#3e3e3e]">Leaf Hash</p>
                <p className="mt-0.5 break-all font-mono text-[9px] text-[#646464]">{hoveredDot.leafHash}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-[#1e1e1e] bg-[#0d0d0d] px-2.5 py-2">
                  <p className="font-mono text-[9px] uppercase tracking-widest text-[#3e3e3e]">Angle</p>
                  <p className="mt-0.5 font-mono text-[10px] text-[#a0a0a0]">
                    {((hoveredDot.angle * 180) / Math.PI).toFixed(1)}°
                  </p>
                </div>
                <div className="rounded-lg border border-[#1e1e1e] bg-[#0d0d0d] px-2.5 py-2">
                  <p className="font-mono text-[9px] uppercase tracking-widest text-[#3e3e3e]">Radius</p>
                  <p className="mt-0.5 font-mono text-[10px] text-[#a0a0a0]">
                    {(hoveredDot.radius * 100).toFixed(1)}%
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#646464]">Status</span>
                <span className={[
                  "rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold",
                  hoveredDot.isFlagged
                    ? "border-rose-500/25 bg-rose-500/8 text-rose-400"
                    : "border-[#262626] bg-[#0d0d0d] text-[#646464]",
                ].join(" ")}>
                  {hoveredDot.isFlagged ? "SANCTIONED" : "benign"}
                </span>
              </div>
              {hoveredDot.lastHit > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[#646464]">Last sweep</span>
                  <span className="font-mono text-[10px] text-[#646464]">
                    {((Date.now() - hoveredDot.lastHit) / 1_000).toFixed(1)}s ago
                  </span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-[#3e3e3e]">Hover a dot to inspect its leaf hash and position.</p>
          )}
        </div>

        {/* ⑤ Node Legend ────────────────────────────────────────── */}
        <div className="rounded-xl border border-[#1e1e1e] bg-[#141414] p-4">
          <div className="mb-3 flex items-center gap-2">
            <LegendIcon className="h-3 w-3 text-[#646464]" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-[#646464]">Node Legend</span>
          </div>
          <div className="space-y-2">
            {[
              { color: "#22c55e",      label: "USER_WALLET",         sub: "Your address · centre blip" },
              { color: "#ef4444",      label: "SANCTIONED",          sub: "OFAC flagged address"        },
              { color: "#3d1a1a",      label: "Benign leaf",         sub: "Non-sanctioned · dim"        },
              { color: "#22c55e",      label: "Sweep arm",           sub: "Rotating scan beam",  trail: true },
            ].map(({ color, label, sub, trail }) => (
              <div key={label} className="flex items-start gap-2.5">
                <div
                  className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: color, opacity: trail ? 0.35 : 0.85 }}
                />
                <div>
                  <p className="font-mono text-[10px] font-semibold text-[#a0a0a0]">{label}</p>
                  <p className="text-[10px] text-[#3e3e3e]">{sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

export default Radar;

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function WalletIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 24 24" className={className ?? "h-5 w-5"} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" /><circle cx="16" cy="14" r="1" fill="currentColor" /></svg>;
}
function AlertIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 14 14" className={className ?? "h-3.5 w-3.5"} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 1.5L1.5 11.5h11L7 1.5z" /><path d="M7 6v3M7 10.5v.5" /></svg>;
}
function PulseIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 14 14" className={className ?? "h-3 w-3"} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 7h2l2-4 2 8 2-5 1.5 3H13" /></svg>;
}
function FilterIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 14 14" className={className ?? "h-3 w-3"} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 3h10M4 7h6M6 11h2" /></svg>;
}
function TargetIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 14 14" className={className ?? "h-3 w-3"} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="7" cy="7" r="5.5" /><circle cx="7" cy="7" r="2.5" /><circle cx="7" cy="7" r="0.75" fill="currentColor" /></svg>;
}
function LegendIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 14 14" className={className ?? "h-3 w-3"} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="3" width="3" height="3" rx="0.5" /><path d="M7 4.5h5M7 7.5h5M7 10.5h5" /><rect x="2" y="7" width="3" height="3" rx="0.5" /></svg>;
}
function ShieldIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 14 14" className={className ?? "h-5 w-5"} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 1.5L2 4v3.5C2 10.5 4 12 7 13c3-1 5-2.5 5-5.5V4L7 1.5z" /></svg>;
}
function ShieldCheckIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 14 14" className={className ?? "h-5 w-5"} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 1.5L2 4v3.5C2 10.5 4 12 7 13c3-1 5-2.5 5-5.5V4L7 1.5z" /><path d="M4.5 7l2 2 3-3" /></svg>;
}
function ShieldOffIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 14 14" className={className ?? "h-5 w-5"} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 1.5L2 4v4c0 3 2 5 5 5.5" /><path d="M12 6V4L9.5 2.8M2 2l10 10" /></svg>;
}
