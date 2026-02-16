// frontend/src/pages/Radar.tsx
//
// Route: /app/radar — Sanctions Radar Map
//
// A live, animated radar that visually scans the OFAC snapshot.
// The user's address is the "friendly" blip at the centre;
// blacklisted addresses are rendered as red threat dots scattered
// in the field.  A sweeping green radar arm rotates continuously.
// When the arm passes over a blip it "illuminates" it with a
// bright ping.  The user's blip pulses teal; if the address is
// flagged it switches to red with an alarm animation.
//
// Architecture
// ─────────────
//  • Pure Canvas 2D — no WebGL, no heavy deps
//  • All snapshot leaves are deterministically mapped to (r, θ)
//    using their leaf hash so the layout is stable across renders
//  • useAccount (wagmi) provides the connected wallet address
//  • findLowLeafForAddress (snapshot) tells us if the address is flagged
//  • useScanLoop drives requestAnimationFrame
//  • Sidebar panel shows live scan stats and per-blip detail on hover

import React, {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
  } from "react";
  import { useAccount } from "wagmi";
  import { formatHash } from "@/lib/format";
  import { findLowLeafForAddress, loadSnapshot } from "@/lib/prover/ofac/snapshot";
  import type { HexString } from "@/lib/prover/imt/types";
  
  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------
  
  const SWEEP_SPEED_DEG_PER_S = 36;        // full rotation in 10 s
  const GLOW_LIFETIME_MS       = 2_200;    // how long a blip glows after the arm passes it
  const MAX_RADAR_DOTS         = 300;      // cap for performance
  const RING_COUNT             = 4;
  const USER_BLIP_R            = 6;        // px
  const THREAT_BLIP_R          = 3;        // px
  const FADE_RATIO             = 0.55;     // trailing sector opacity curve
  
  // Colour palette (matches app dark theme)
  const C = {
    bg:          "#0a0a0a",
    gridLine:    "rgba(20,210,160,0.08)",
    gridGlow:    "rgba(20,210,160,0.18)",
    arm:         "rgba(20,210,160,0.85)",
    armTrail:    (t: number) => `rgba(20,210,160,${(t * FADE_RATIO * 0.35).toFixed(3)})`,
    dot:         "rgba(230,50,50,0.75)",
    dotGlow:     "rgba(255,80,80,1)",
    dotDim:      "rgba(120,30,30,0.45)",
    userBlip:    "rgba(20,210,160,1)",
    userBlipRed: "rgba(255,70,70,1)",
    scanText:    "rgba(20,210,160,0.55)",
    crosshair:   "rgba(20,210,160,0.22)",
  };
  
  // ---------------------------------------------------------------------------
  // Types
  // ---------------------------------------------------------------------------
  
  interface RadarDot {
    /** normalised angle 0–2π */
    angle:      number;
    /** normalised radius 0–1 */
    radius:     number;
    leafHash:   string;
    /** last time (ms) the sweep arm touched this dot */
    lastHit:    number;
    isFlagged?: boolean;
  }
  
  interface ScanStats {
    total:        number;
    scanned:      number;
    flagged:      number;
    snapshotDate: string;
    root:         string;
  }
  
  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  
  /** Map a hex leaf hash to a stable (angle, radius) pair */
  function hashToPosition(hash: string): { angle: number; radius: number } {
    // Use first 8 nibbles for angle, next 8 for radius
    const a = parseInt(hash.slice(2, 10), 16);
    const r = parseInt(hash.slice(10, 18), 16);
    return {
      angle:  (a / 0xffffffff) * 2 * Math.PI,
      radius: 0.12 + (r / 0xffffffff) * 0.82,  // keep blips off dead-centre
    };
  }
  
  /** Convert polar (canvas-centre-relative) to canvas XY */
  function polarToXY(
    cx: number, cy: number,
    radius: number, angle: number,
    scale: number,
  ): [number, number] {
    return [
      cx + Math.cos(angle) * radius * scale,
      cy + Math.sin(angle) * radius * scale,
    ];
  }
  
  /** Angle diff, signed, –π … π */
  function angleDiff(a: number, b: number): number {
    let d = a - b;
    while (d >  Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return d;
  }
  
  // ---------------------------------------------------------------------------
  // Canvas drawing helpers
  // ---------------------------------------------------------------------------
  
  function drawGrid(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number, scale: number,
  ) {
    ctx.save();
    // Rings
    for (let i = 1; i <= RING_COUNT; i++) {
      const r = (i / RING_COUNT) * scale;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, 2 * Math.PI);
      ctx.strokeStyle = C.gridLine;
      ctx.lineWidth = 1;
      ctx.stroke();
  
      // Ring label
      ctx.fillStyle = C.scanText;
      ctx.font = `${Math.max(9, scale * 0.028)}px ui-monospace,monospace`;
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
  
    // Cardinal labels
    ctx.fillStyle = C.scanText;
    ctx.font = `${Math.max(9, scale * 0.03)}px ui-monospace,monospace`;
    ctx.textAlign = "center";
    const lpad = scale + 14;
    ctx.fillText("N", cx, cy - lpad);
    ctx.fillText("S", cx, cy + lpad + 10);
    ctx.textAlign = "left";
    ctx.fillText("E", cx + lpad, cy + 4);
    ctx.textAlign = "right";
    ctx.fillText("W", cx - lpad, cy + 4);
  
    ctx.restore();
  }
  
  function drawSweep(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number, scale: number,
    armAngle: number,
  ) {
    ctx.save();
  
    // Trailing sector gradient
    const TRAIL_ARC = (3 * Math.PI) / 4;
    const STEPS = 28;
    for (let i = 0; i < STEPS; i++) {
      const t = 1 - i / STEPS;
      const a0 = armAngle - (i / STEPS) * TRAIL_ARC;
      const a1 = armAngle - ((i + 1) / STEPS) * TRAIL_ARC;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, scale, a0, a1, true);
      ctx.closePath();
      ctx.fillStyle = C.armTrail(t);
      ctx.fill();
    }
  
    // Arm line
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(
      cx + Math.cos(armAngle) * scale,
      cy + Math.sin(armAngle) * scale,
    );
    const grad = ctx.createLinearGradient(
      cx, cy,
      cx + Math.cos(armAngle) * scale,
      cy + Math.sin(armAngle) * scale,
    );
    grad.addColorStop(0,   "rgba(20,210,160,0)");
    grad.addColorStop(0.6, "rgba(20,210,160,0.4)");
    grad.addColorStop(1,   C.arm);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2;
    ctx.shadowColor = "rgba(20,210,160,0.8)";
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;
  
    ctx.restore();
  }
  
  function drawDot(
    ctx: CanvasRenderingContext2D,
    x: number, y: number,
    now: number, lastHit: number,
    isFlagged: boolean,
    isHovered: boolean,
  ) {
    const age   = now - lastHit;
    const alive = age < GLOW_LIFETIME_MS;
    const t     = alive ? 1 - age / GLOW_LIFETIME_MS : 0;
  
    const baseR = THREAT_BLIP_R;
  
    if (alive) {
      // Expanding ring ping
      const pingR = baseR + (1 - t) * 18;
      ctx.beginPath();
      ctx.arc(x, y, pingR, 0, 2 * Math.PI);
      ctx.strokeStyle = `rgba(255,80,80,${(t * 0.6).toFixed(3)})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  
    ctx.beginPath();
    ctx.arc(x, y, isHovered ? baseR + 2 : baseR, 0, 2 * Math.PI);
    ctx.fillStyle = alive ? C.dotGlow : isFlagged ? C.dotGlow : C.dotDim;
    if (alive || isHovered) {
      ctx.shadowColor = "rgba(255,80,80,0.9)";
      ctx.shadowBlur  = alive ? 10 * t : isHovered ? 8 : 0;
    }
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  
  function drawUserBlip(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number,
    now: number,
    isFlagged: boolean,
  ) {
    const pulse = 0.5 + 0.5 * Math.sin((now / 700) * 2 * Math.PI);
    const col   = isFlagged ? C.userBlipRed : C.userBlip;
  
    // Outer glow ring (pulses)
    const outerR = USER_BLIP_R + 4 + pulse * 6;
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, 2 * Math.PI);
    ctx.strokeStyle = isFlagged
      ? `rgba(255,70,70,${(0.15 + pulse * 0.25).toFixed(3)})`
      : `rgba(20,210,160,${(0.15 + pulse * 0.25).toFixed(3)})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  
    // Core blip
    ctx.beginPath();
    ctx.arc(cx, cy, USER_BLIP_R, 0, 2 * Math.PI);
    ctx.fillStyle = col;
    ctx.shadowColor = col;
    ctx.shadowBlur  = 14 + pulse * 8;
    ctx.fill();
    ctx.shadowBlur = 0;
  
    // Cross-hair tick marks
    ctx.strokeStyle = col;
    ctx.lineWidth = 1;
    const tick = 10;
    ([[0, -1], [0, 1], [-1, 0], [1, 0]] as const).forEach(([dx, dy]) => {
      ctx.beginPath();
      ctx.moveTo(cx + dx * (USER_BLIP_R + 3), cy + dy * (USER_BLIP_R + 3));
      ctx.lineTo(cx + dx * (USER_BLIP_R + 3 + tick), cy + dy * (USER_BLIP_R + 3 + tick));
      ctx.stroke();
    });
  }
  
  // ---------------------------------------------------------------------------
  // useSweepLoop  — drives the rAF loop
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
  // Radar component
  // ---------------------------------------------------------------------------
  
  export function Radar() {
    const canvasRef   = useRef<HTMLCanvasElement>(null);
    const wrapRef     = useRef<HTMLDivElement>(null);
    const armAngleRef = useRef<number>(-Math.PI / 2); // start pointing north
    const dotsRef     = useRef<RadarDot[]>([]);
  
    const [dots,       setDots]       = useState<RadarDot[]>([]);
    const [stats,      setStats]      = useState<ScanStats | null>(null);
    const [loading,    setLoading]    = useState(true);
    const [error,      setError]      = useState<string | null>(null);
    const [flagged,    setFlagged]    = useState(false);
    const [scanning,   setScanning]   = useState(false);
    const [hoveredDot, setHoveredDot] = useState<RadarDot | null>(null);
    const [scanCount,  setScanCount]  = useState(0);    // increments each full rotation
    const [lastScanTs, setLastScanTs] = useState<number>(Date.now());
  
    const { address, isConnected } = useAccount();
  
    // ── Load snapshot and scatter dots ──────────────────────────────────
    useEffect(() => {
      if (!isConnected || !address) return;
  
      setLoading(true);
      setError(null);
      setScanning(true);
  
      void (async () => {
        try {
          const [snapshot, qr] = await Promise.all([
            loadSnapshot(),
            findLowLeafForAddress(address),
          ]);
  
          const leaves = snapshot.leaves as HexString[];
          const subset = leaves.length > MAX_RADAR_DOTS
            ? leaves.filter((_, i) => i % Math.ceil(leaves.length / MAX_RADAR_DOTS) === 0)
            : leaves;
  
          const mapped: RadarDot[] = subset.map((leaf) => {
            const { angle, radius } = hashToPosition(leaf);
            return { angle, radius, leafHash: leaf, lastHit: 0, isFlagged: qr.exists && leaf === qr.queriedLeaf };
          });
  
          dotsRef.current = mapped;
          setDots(mapped);
          setFlagged(qr.exists);
          setStats({
            total:        snapshot.addressCount,
            scanned:      0,
            flagged:      qr.exists ? 1 : 0,
            snapshotDate: snapshot.builtAt,
            root:         snapshot.root as string,
          });
        } catch (e) {
          setError(e instanceof Error ? e.message : "Failed to load OFAC snapshot");
        } finally {
          setLoading(false);
          setScanning(false);
        }
      })();
    }, [address, isConnected]);
  
    // ── Canvas resize ───────────────────────────────────────────────────
    const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  
    useLayoutEffect(() => {
      if (!wrapRef.current) return;
      const ro = new ResizeObserver((entries) => {
        const { width, height } = entries[0]!.contentRect;
        setCanvasSize({ w: width, h: height });
      });
      ro.observe(wrapRef.current);
      return () => ro.disconnect();
    }, []);
  
    // ── rAF loop ────────────────────────────────────────────────────────
    const scannedThisRotRef  = useRef<Set<number>>(new Set());
    const prevArmRef         = useRef<number>(-Math.PI / 2);
  
    useSweepLoop(useCallback((now: number, dt: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
  
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
  
      const { w, h } = canvasSize;
      if (w === 0 || h === 0) return;
  
      const dpr    = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(w * dpr)) {
        canvas.width  = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        ctx.scale(dpr, dpr);
      }
  
      const cx     = w / 2;
      const cy     = h / 2;
      const scale  = Math.min(cx, cy) - 24;
  
      // Advance arm
      const prevAngle = armAngleRef.current;
      const step = (SWEEP_SPEED_DEG_PER_S * Math.PI / 180) * dt;
      armAngleRef.current = (armAngleRef.current + step) % (2 * Math.PI);
      const armAngle = armAngleRef.current;
  
      // Detect full rotation crossing –π/2 (north)
      const crossed =
        (prevAngle < -Math.PI / 2 + Math.PI && armAngle >= -Math.PI / 2 + Math.PI) ||
        (prevAngle > armAngle); // wrapped
  
      if (crossed) {
        setScanCount((c) => c + 1);
        setLastScanTs(now);
        scannedThisRotRef.current.clear();
      }
  
      // Hit-test dots against arm
      const localDots = dotsRef.current;
      let hitAny = false;
      for (let i = 0; i < localDots.length; i++) {
        const dot = localDots[i]!;
        const diff = angleDiff(armAngle, dot.angle);
        if (diff >= 0 && diff < 0.08) {
          // arm just swept over this dot
          dot.lastHit = now;
          hitAny = true;
          if (!scannedThisRotRef.current.has(i)) {
            scannedThisRotRef.current.add(i);
            setStats((s) =>
              s ? { ...s, scanned: Math.min(s.total, scannedThisRotRef.current.size * 4) } : s,
            );
          }
        }
      }
  
      // ── Draw ──
      ctx.clearRect(0, 0, w, h);
  
      // Background
      ctx.fillStyle = C.bg;
      ctx.fillRect(0, 0, w, h);
  
      // Clip to radar circle
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, scale + 1, 0, 2 * Math.PI);
      ctx.clip();
  
      // Radial fill
      const radGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, scale);
      radGrad.addColorStop(0,   "rgba(0,40,30,0.9)");
      radGrad.addColorStop(0.6, "rgba(0,20,14,0.95)");
      radGrad.addColorStop(1,   "rgba(0,0,0,0.98)");
      ctx.fillStyle = radGrad;
      ctx.fillRect(0, 0, w, h);
  
      drawGrid(ctx, cx, cy, scale);
      drawSweep(ctx, cx, cy, scale, armAngle);
  
      // Threat dots
      const hovLeaf = hoveredDot?.leafHash;
      for (const dot of localDots) {
        const [x, y] = polarToXY(cx, cy, dot.radius, dot.angle, scale);
        drawDot(ctx, x, y, now, dot.lastHit, dot.isFlagged ?? false, dot.leafHash === hovLeaf);
      }
  
      // User blip (always at centre, slight N-offset for aesthetics)
      drawUserBlip(ctx, cx, cy - scale * 0.0, now, flagged);
  
      ctx.restore(); // end clip
  
      // Outer ring border
      ctx.beginPath();
      ctx.arc(cx, cy, scale + 1, 0, 2 * Math.PI);
      ctx.strokeStyle = "rgba(20,210,160,0.22)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
  
      // Corner scan-line decoration
      ctx.fillStyle = "rgba(20,210,160,0.35)";
      ctx.font = `${Math.max(8, w * 0.013)}px ui-monospace,monospace`;
      ctx.textAlign = "left";
      ctx.fillText(`SCAN #${scanCount.toString().padStart(4, "0")}`, 8, h - 10);
      ctx.textAlign = "right";
      ctx.fillText(new Date().toISOString().slice(11, 19) + " UTC", w - 8, h - 10);
  
    }, [canvasSize, flagged, hoveredDot, scanCount]));
  
    // ── Mouse hover over canvas ──────────────────────────────────────────
    const handleMouseMove = useCallback(
      (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect  = canvas.getBoundingClientRect();
        const mx    = e.clientX - rect.left;
        const my    = e.clientY - rect.top;
        const cx    = rect.width  / 2;
        const cy    = rect.height / 2;
        const scale = Math.min(cx, cy) - 24;
  
        let best: RadarDot | null = null;
        let bestD = 12;
        for (const dot of dotsRef.current) {
          const [x, y] = polarToXY(cx, cy, dot.radius, dot.angle, scale);
          const d = Math.hypot(mx - x, my - y);
          if (d < bestD) { bestD = d; best = dot; }
        }
        setHoveredDot(best);
      },
      [],
    );
  
    const handleMouseLeave = useCallback(() => setHoveredDot(null), []);
  
    // ── Render ───────────────────────────────────────────────────────────
    const isReady = !loading && !error && isConnected && address;
  
    return (
      <div className="flex h-full min-h-[calc(100vh-64px)] flex-col gap-4 p-4 sm:p-6 lg:flex-row lg:gap-6 lg:p-8">
  
        {/* ── Canvas pane ─────────────────────────────────────────── */}
        <div
          ref={wrapRef}
          className="relative aspect-square w-full overflow-hidden rounded-2xl border border-zinc-800 bg-black lg:flex-1"
          style={{ maxHeight: "min(70vh, 600px)", maxWidth: "min(70vh, 600px)", margin: "0 auto" }}
        >
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-teal-500" />
              <p className="font-mono text-xs text-zinc-600">Loading OFAC snapshot…</p>
            </div>
          )}
  
          {!isConnected && !loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <WalletIcon className="h-8 w-8 text-zinc-700" />
              <p className="font-mono text-xs text-zinc-600">Connect wallet to activate radar</p>
            </div>
          )}
  
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
              <AlertIcon className="h-7 w-7 text-rose-500" />
              <p className="font-mono text-[10px] text-rose-400">{error}</p>
            </div>
          )}
  
          <canvas
            ref={canvasRef}
            className="h-full w-full"
            style={{ display: isReady ? "block" : "none" }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            aria-label="Sanctions radar map"
            role="img"
          />
  
          {/* Flagged alarm overlay */}
          {flagged && isReady && (
            <div className="pointer-events-none absolute inset-0 animate-pulse rounded-2xl ring-2 ring-rose-500/40" />
          )}
        </div>
  
        {/* ── Side panel ──────────────────────────────────────────── */}
        <div className="flex w-full flex-col gap-3 lg:w-72 lg:shrink-0">
  
          {/* Status card */}
          <div className={[
            "rounded-2xl border p-4 transition-colors",
            flagged
              ? "border-rose-500/25 bg-rose-500/5"
              : isReady
                ? "border-teal-500/20 bg-teal-500/4"
                : "border-zinc-800 bg-zinc-900/20",
          ].join(" ")}>
            <div className="flex items-center gap-2">
              <span className={[
                "h-2 w-2 rounded-full",
                loading ? "animate-pulse bg-zinc-600"
                : flagged ? "bg-rose-500 animate-pulse"
                : isReady ? "bg-teal-500"
                : "bg-zinc-700",
              ].join(" ")} />
              <p className={[
                "font-mono text-[10px] font-semibold uppercase tracking-widest",
                loading ? "text-zinc-600"
                : flagged ? "text-rose-400"
                : isReady ? "text-teal-400"
                : "text-zinc-600",
              ].join(" ")}>
                {loading ? "Scanning…"
                 : !isConnected ? "Offline"
                 : error ? "Error"
                 : flagged ? "⚠ SANCTIONED"
                 : "CLEAR"}
              </p>
            </div>
  
            {address && (
              <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-2">
                <p className="text-[9px] font-semibold uppercase tracking-widest text-zinc-600">Your Address</p>
                <p className="mt-1 font-mono text-[10px] text-zinc-300 break-all">{address}</p>
              </div>
            )}
  
            {!isConnected && (
              <p className="mt-3 text-[10px] text-zinc-600">
                Connect your wallet to scan your address against the OFAC sanctions list.
              </p>
            )}
          </div>
  
          {/* Scan stats */}
          {stats && (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/20 p-4">
              <p className="mb-3 text-[9px] font-semibold uppercase tracking-widest text-zinc-600">
                Scan Statistics
              </p>
              <div className="space-y-0 divide-y divide-zinc-800/60">
                {[
                  { label: "Total addresses", value: stats.total.toLocaleString() },
                  { label: "Displayed blips", value: dots.length.toLocaleString() },
                  { label: "Rotations",        value: scanCount.toString() },
                  { label: "Flagged",          value: stats.flagged === 0 ? "None" : stats.flagged.toString() },
                  { label: "Root",             value: formatHash(stats.root, 8, 6) },
                  { label: "Snapshot date",    value: new Date(stats.snapshotDate).toLocaleDateString() },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between py-2">
                    <span className="text-[10px] text-zinc-600">{label}</span>
                    <span className={[
                      "font-mono text-[10px]",
                      label === "Flagged" && stats.flagged > 0 ? "text-rose-400" : "text-zinc-400",
                    ].join(" ")}>
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
  
          {/* Hovered blip detail */}
          <div className={[
            "rounded-2xl border p-4 transition-all duration-200",
            hoveredDot
              ? "border-zinc-700 bg-zinc-900/40"
              : "border-zinc-800/40 bg-zinc-900/10 opacity-50",
          ].join(" ")}>
            <p className="mb-2 text-[9px] font-semibold uppercase tracking-widest text-zinc-600">
              Blip Inspector
            </p>
            {hoveredDot ? (
              <div className="space-y-2">
                <div>
                  <p className="text-[9px] text-zinc-600">Leaf Hash</p>
                  <p className="mt-0.5 break-all font-mono text-[9px] text-zinc-400">
                    {hoveredDot.leafHash}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-[9px] text-zinc-600">Angle</p>
                    <p className="font-mono text-[10px] text-zinc-400">
                      {((hoveredDot.angle * 180) / Math.PI).toFixed(1)}°
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] text-zinc-600">Radius</p>
                    <p className="font-mono text-[10px] text-zinc-400">
                      {(hoveredDot.radius * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>
                <div>
                  <p className="text-[9px] text-zinc-600">Status</p>
                  <span className={[
                    "mt-0.5 inline-block rounded-full border px-2 py-0.5 font-mono text-[9px] font-semibold",
                    hoveredDot.isFlagged
                      ? "border-rose-500/25 bg-rose-500/8 text-rose-400"
                      : "border-zinc-700 bg-zinc-800/60 text-zinc-500",
                  ].join(" ")}>
                    {hoveredDot.isFlagged ? "SANCTIONED" : "benign"}
                  </span>
                </div>
                {hoveredDot.lastHit > 0 && (
                  <div>
                    <p className="text-[9px] text-zinc-600">Last sweep hit</p>
                    <p className="font-mono text-[10px] text-zinc-500">
                      {((Date.now() - hoveredDot.lastHit) / 1_000).toFixed(1)}s ago
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[10px] text-zinc-700">Hover a red dot to inspect its leaf hash.</p>
            )}
          </div>
  
          {/* Legend */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/10 p-4">
            <p className="mb-3 text-[9px] font-semibold uppercase tracking-widest text-zinc-600">Legend</p>
            <div className="space-y-2">
              {[
                { color: "bg-teal-400",  label: "Your address (centre blip)" },
                { color: "bg-rose-500",  label: "Sanctioned leaf (OFAC)" },
                { color: "bg-zinc-600",  label: "Unseen leaf (dim)"    },
                { color: "bg-teal-500/40 border border-teal-500/30", label: "Sweep arm trail" },
              ].map(({ color, label }) => (
                <div key={label} className="flex items-center gap-2.5">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${color}`} />
                  <span className="text-[10px] text-zinc-600">{label}</span>
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
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="2" y="7" width="20" height="14" rx="2" />
        <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
        <circle cx="16" cy="14" r="1" fill="currentColor" />
      </svg>
    );
  }
  
  function AlertIcon({ className }: { className?: string }) {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 2L2 20h20L12 2z" />
        <path d="M12 9v5" />
        <circle cx="12" cy="18" r=".5" fill="currentColor" />
      </svg>
    );
  }
