// frontend/src/pages/NotFound.tsx
//
// 404 page
//
// Design concept: a ZK proof that failed verification.
// The "404" is treated as a failed proof output — the page reads like
// a terminal rejection notice, framed inside a subtle circuit-grid
// background.  A single, slow animated element keeps it alive without
// being loud: concentric rings that expand and fade from the "0" in
// 404, suggesting a proof pulse that just dropped.
//
// Palette stays on the app's dark zinc/teal — no jarring colours.
// The teal accent is used only for the one link back home.

import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";

// ---------------------------------------------------------------------------
// Pulse ring canvas — a single quiet animation
// ---------------------------------------------------------------------------

function PulseCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const SIZE = 280;
    canvas.width  = SIZE * dpr;
    canvas.height = SIZE * dpr;
    canvas.style.width  = `${SIZE}px`;
    canvas.style.height = `${SIZE}px`;

    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);

    const cx = SIZE / 2;
    const cy = SIZE / 2;

    // Rings array: each has a phase offset so they stagger nicely
    const RING_COUNT = 4;
    const PERIOD_MS  = 3_200;
    const rings = Array.from({ length: RING_COUNT }, (_, i) => ({
      phase: (i / RING_COUNT) * PERIOD_MS,
    }));

    function tick(ts: number) {
      ctx.clearRect(0, 0, SIZE, SIZE);

      for (const ring of rings) {
        const t   = ((ts + ring.phase) % PERIOD_MS) / PERIOD_MS; // 0 → 1
        const r   = 12 + t * (SIZE / 2 - 12);
        const alpha = (1 - t) * 0.18;

        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, 2 * Math.PI);
        ctx.strokeStyle = `rgba(20, 210, 160, ${alpha.toFixed(4)})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Static inner dot
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, 2 * Math.PI);
      ctx.fillStyle = "rgba(20,210,160,0.18)";
      ctx.fill();

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
      aria-hidden="true"
    />
  );
}

// ---------------------------------------------------------------------------
// Glitch number — the "404" text with a one-time glitch on mount
// ---------------------------------------------------------------------------

function GlitchNumber() {
  const [glitching, setGlitching] = useState(false);
  const [settled,   setSettled]   = useState(false);

  useEffect(() => {
    // tiny delay so the page has painted first
    const t1 = setTimeout(() => setGlitching(true),  120);
    const t2 = setTimeout(() => setGlitching(false), 520);
    const t3 = setTimeout(() => setSettled(true),    560);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  return (
    <div
      className="relative select-none font-mono"
      aria-label="404"
      style={{ fontSize: "clamp(6rem, 18vw, 10rem)", lineHeight: 1, letterSpacing: "-0.04em" }}
    >
      {/* Main number */}
      <span
        className={[
          "relative z-10 font-black text-zinc-800 transition-all duration-200",
          glitching ? "text-zinc-700" : "",
          settled   ? "text-zinc-800" : "",
        ].join(" ")}
        style={{ WebkitTextStroke: "1px rgba(255,255,255,0.04)" }}
      >
        404
      </span>

      {/* Glitch layer 1 — teal, offset left */}
      {glitching && (
        <span
          className="pointer-events-none absolute inset-0 z-20 font-black text-teal-500/20"
          style={{ transform: "translate(-3px, 1px)" }}
          aria-hidden="true"
        >
          404
        </span>
      )}

      {/* Glitch layer 2 — rose, offset right */}
      {glitching && (
        <span
          className="pointer-events-none absolute inset-0 z-20 font-black text-rose-500/20"
          style={{ transform: "translate(3px, -1px)" }}
          aria-hidden="true"
        >
          404
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Proof rejection badge — monospaced terminal-style block
// ---------------------------------------------------------------------------

function RejectionBlock({ path }: { path: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 300);
    return () => clearTimeout(t);
  }, []);

  const lines = [
    `> nullproof verify --path "${path}"`,
    ``,
    `  ✗  PROOF REJECTED`,
    `  reason  : route not found`,
    `  code    : 404 NOT_FOUND`,
    `  hint    : the requested path does not exist`,
  ];

  return (
    <div
      className={[
        "w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 font-mono text-[11px] leading-relaxed",
        "transition-all duration-500",
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3",
      ].join(" ")}
    >
      {lines.map((line, i) => (
        <div key={i} className={[
          "whitespace-pre",
          line.startsWith(">")   ? "text-zinc-500"
          : line.includes("✗")  ? "text-rose-400"
          : line.includes("hint")? "text-zinc-600"
          : line === ""          ? ""
          : "text-zinc-600",
        ].join(" ")}>
          {line || "\u00A0"}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// NotFound page
// ---------------------------------------------------------------------------

export function NotFound() {
  const location = useLocation();

  // Entrance animation for text below the number
  const [bodyVisible, setBodyVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setBodyVisible(true), 200);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-8 overflow-hidden bg-zinc-950 px-6 py-16">

      {/* ── Subtle dot-grid background ─────────────────────────── */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.025) 1px, transparent 1px)",
          backgroundSize:  "28px 28px",
        }}
      />

      {/* ── Vignette ───────────────────────────────────────────── */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background: "radial-gradient(ellipse 80% 70% at 50% 50%, transparent 30%, rgb(9,9,11) 100%)",
        }}
      />

      {/* ── Number + pulse rings ───────────────────────────────── */}
      <div className="relative flex items-center justify-center">
        <PulseCanvas />
        <GlitchNumber />
      </div>

      {/* ── Copy block ─────────────────────────────────────────── */}
      <div
        className={[
          "relative z-10 flex flex-col items-center gap-1 text-center transition-all duration-500",
          bodyVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
        ].join(" ")}
      >
        <h1 className="text-base font-semibold text-zinc-300">
          Page not found
        </h1>
        <p className="max-w-xs text-sm text-zinc-600">
          This route doesn't exist in the protocol. It may have moved, or you followed a broken link.
        </p>
      </div>

      {/* ── Rejection block ─────────────────────────────────────── */}
      <div className="relative z-10">
        <RejectionBlock path={location.pathname} />
      </div>

      {/* ── Back home link ──────────────────────────────────────── */}
      <div
        className={[
          "relative z-10 transition-all duration-500 delay-300",
          bodyVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
        ].join(" ")}
      >
        <Link
          to="/app/dashboard"
          className="group flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/50 px-5 py-2.5 text-sm font-medium text-zinc-400 transition-all duration-200 hover:border-zinc-700 hover:bg-zinc-900 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-600"
        >
          <ArrowLeftIcon className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" />
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}

export default NotFound;

// ---------------------------------------------------------------------------
// Icon
// ---------------------------------------------------------------------------

function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 13L5 8l5-5" />
    </svg>
  );
}