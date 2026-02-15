// frontend/src/layouts/FullscreenLayout.tsx
//
// Chrome-free fullscreen shell for the immersive proof generation flow.
//
// Used by:
//   /app/proof/generate   — ProofGenerationPage
//
// Structure:
//   ┌────────────────────────────────────────────────┐
//   │  ProgressBar (3px, top edge)                   │
//   ├────────────────────────────────────────────────┤
//   │  Top strip: LogoMark | PhaseLabel | Cancel btn │
//   ├────────────────────────────────────────────────┤
//   │                                                │
//   │  <Outlet />  (flex-1, no scroll)               │
//   │                                                │
//   └────────────────────────────────────────────────┘
//
// Proof store shape (from proofStore.ts):
//   status:  "idle" | "generating" | "generated" | "submitting" | "confirmed" | "error"
//   steps:   ProofStep[]  — each step has .state: "idle"|"active"|"done"|"error"
//   reset:   () => void
//
// Derived values:
//   progress   = (done steps / total steps) * 100
//   isActive   = status === "generating" || "submitting"
//   cancelable = status !== "submitting" && status !== "confirmed"
//
// Cancel flow:
//   × button / Escape → CancelConfirm popover
//   "Yes, cancel"     → reset() + navigate("/app/deposit")
//   "Keep going"      → dismiss popover
//
// Guard:
//   beforeunload warning shown while isActive

import React, {
    useCallback,
    useEffect,
    useRef,
    useState,
  } from "react";
  import { Outlet, useNavigate } from "react-router-dom";
  
  import {
    useProofStore,
    type ProofStatus,
  } from "@/store/proofStore";
  
  // ---------------------------------------------------------------------------
  // Progress bar
  // ---------------------------------------------------------------------------
  
  function ProgressBar({ progress }: { progress: number }) {
    const clamped = Math.min(100, Math.max(0, progress));
  
    return (
      <div
        className="absolute inset-x-0 top-0 z-50 h-[3px] bg-zinc-900"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Proof generation progress"
      >
        <div
          className="h-full bg-gradient-to-r from-teal-600 via-teal-400 to-teal-500 transition-[width] duration-500 ease-out"
          style={{ width: `${clamped}%` }}
        />
        {/* Leading glow */}
        {clamped > 0 && clamped < 100 && (
          <div
            className="absolute top-0 h-full w-8 -translate-x-full bg-gradient-to-r from-transparent to-teal-300/60 blur-sm"
            style={{ left: `${clamped}%` }}
            aria-hidden="true"
          />
        )}
      </div>
    );
  }
  
  // ---------------------------------------------------------------------------
  // Ambient background
  // ---------------------------------------------------------------------------
  
  function AmbientBackground({ active }: { active: boolean }) {
    return (
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden="true"
      >
        <div className="absolute inset-0 bg-zinc-950" />
  
        {/* Teal blob — top-left */}
        <div
          className={[
            "absolute -left-32 -top-32 h-[520px] w-[520px] rounded-full",
            "bg-teal-500/5 blur-[120px]",
            "transition-opacity duration-1000",
            active ? "opacity-100" : "opacity-40",
          ].join(" ")}
          style={{
            animation: active
              ? "ambientDrift1 12s ease-in-out infinite alternate"
              : "none",
          }}
        />
  
        {/* Purple blob — bottom-right */}
        <div
          className={[
            "absolute -bottom-48 -right-24 h-[480px] w-[480px] rounded-full",
            "bg-purple-500/4 blur-[140px]",
            "transition-opacity duration-1000",
            active ? "opacity-100" : "opacity-30",
          ].join(" ")}
          style={{
            animation: active
              ? "ambientDrift2 15s ease-in-out infinite alternate"
              : "none",
          }}
        />
  
        {/* Subtle grid */}
        <div
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage: `
              linear-gradient(to right, rgb(255 255 255) 1px, transparent 1px),
              linear-gradient(to bottom, rgb(255 255 255) 1px, transparent 1px)
            `,
            backgroundSize: "48px 48px",
          }}
        />
  
        <style>{`
          @keyframes ambientDrift1 {
            from { transform: translate(0px,  0px)  scale(1);   }
            to   { transform: translate(40px, 30px) scale(1.1); }
          }
          @keyframes ambientDrift2 {
            from { transform: translate(0px,   0px)   scale(1);    }
            to   { transform: translate(-30px, -20px) scale(1.08); }
          }
          @media (prefers-reduced-motion: reduce) {
            @keyframes ambientDrift1 { from {} to {} }
            @keyframes ambientDrift2 { from {} to {} }
          }
        `}</style>
      </div>
    );
  }
  
  // ---------------------------------------------------------------------------
  // Logo mark
  // ---------------------------------------------------------------------------
  
  function LogoMark() {
    return (
      <div className="flex items-center gap-2" aria-label="NullProof">
        <svg
          width="20"
          height="20"
          viewBox="0 0 32 32"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M16 2L4 7v8c0 8 5.4 13.5 12 15 6.6-1.5 12-7 12-15V7L16 2z"
            stroke="#14b8a6"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M10.5 16l3.5 3.5 7.5-7"
            stroke="#2dd4bf"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="text-xs font-semibold tracking-tight text-zinc-500">
          NullProof
        </span>
      </div>
    );
  }
  
  // ---------------------------------------------------------------------------
  // Phase label pill
  // ---------------------------------------------------------------------------
  
  const PHASE_CONFIG: Partial<
    Record<ProofStatus, { label: string; dot: string }>
  > = {
    generating:  { label: "Generating proof",    dot: "bg-purple-500" },
    generated:   { label: "Proof ready",         dot: "bg-teal-500"   },
    submitting:  { label: "Submitting on-chain", dot: "bg-amber-500"  },
    confirmed:   { label: "Confirmed",           dot: "bg-teal-500"   },
    error:       { label: "Error",               dot: "bg-rose-500"   },
  };
  
  function PhaseLabel({ status }: { status: ProofStatus }) {
    const config = PHASE_CONFIG[status];
  
    // Nothing to show when idle
    if (!config) {
      return <div className="w-28" aria-hidden="true" />;
    }
  
    const { label, dot } = config;
    const pulse = status !== "error" && status !== "confirmed";
  
    return (
      <div
        className="flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/80 px-3 py-1 backdrop-blur-sm"
        aria-live="polite"
        aria-label={`Current step: ${label}`}
      >
        <span
          className={["h-1.5 w-1.5 rounded-full", dot, pulse ? "animate-pulse" : ""].join(" ")}
          aria-hidden="true"
        />
        <span className="text-[11px] font-medium text-zinc-400">
          {label}
        </span>
      </div>
    );
  }
  
  // ---------------------------------------------------------------------------
  // Cancel confirmation popover
  // ---------------------------------------------------------------------------
  
  function CancelConfirm({
    onConfirm,
    onDismiss,
  }: {
    onConfirm: () => void;
    onDismiss: () => void;
  }) {
    const dismissRef = useRef<HTMLButtonElement>(null);
  
    useEffect(() => {
      dismissRef.current?.focus();
    }, []);
  
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Cancel proof generation"
        className={[
          "absolute right-0 top-10 z-50 w-64",
          "overflow-hidden rounded-xl border border-zinc-700/60",
          "bg-zinc-900/95 shadow-lg backdrop-blur-md",
          "animate-[fadeSlideDown_0.15s_ease-out]",
        ].join(" ")}
      >
        <style>{`
          @keyframes fadeSlideDown {
            from { opacity: 0; transform: translateY(-6px); }
            to   { opacity: 1; transform: translateY(0);    }
          }
        `}</style>
  
        <div className="px-4 py-3.5">
          <p className="text-[12px] font-semibold text-zinc-200">
            Cancel proof generation?
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-600">
            Progress will be lost and you'll need to start over. Circuit
            execution cannot be resumed.
          </p>
        </div>
  
        <div className="flex items-center gap-2 border-t border-zinc-800 px-3 py-2.5">
          <button
            ref={dismissRef}
            type="button"
            onClick={onDismiss}
            className={[
              "flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5",
              "text-[11px] font-semibold text-zinc-400",
              "transition-colors hover:border-zinc-600 hover:text-zinc-200",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500",
            ].join(" ")}
          >
            Keep going
          </button>
  
          <button
            type="button"
            onClick={onConfirm}
            className={[
              "flex-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5",
              "text-[11px] font-semibold text-rose-400",
              "transition-colors hover:bg-rose-500/15 hover:text-rose-300",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-rose-500/50",
            ].join(" ")}
          >
            Yes, cancel
          </button>
        </div>
      </div>
    );
  }
  
  // ---------------------------------------------------------------------------
  // FullscreenLayout
  // ---------------------------------------------------------------------------
  
  export function FullscreenLayout() {
    const navigate = useNavigate();
  
    // ── Proof store ────────────────────────────────────────────────────────
    const status = useProofStore((s) => s.status);
    const steps  = useProofStore((s) => s.steps);
    const reset  = useProofStore((s) => s.reset);
  
    // ── Derived values ─────────────────────────────────────────────────────
    const progress = steps.length === 0
      ? 0
      : Math.round(
          (steps.filter((s) => s.state === "done").length / steps.length) * 100,
        );
  
    const isActive   = status === "generating" || status === "submitting";
    const cancelable = status !== "submitting" && status !== "confirmed";
  
    // ── Cancel confirmation ────────────────────────────────────────────────
    const [confirmOpen, setConfirmOpen] = useState(false);
  
    const requestCancel = useCallback(() => {
      if (!cancelable) return;
      setConfirmOpen(true);
    }, [cancelable]);
  
    const confirmCancel = useCallback(() => {
      setConfirmOpen(false);
      reset();
      navigate("/app/deposit", { replace: true });
    }, [reset, navigate]);
  
    const dismissCancel = useCallback(() => {
      setConfirmOpen(false);
    }, []);
  
    // ── Keyboard: Escape ───────────────────────────────────────────────────
    useEffect(() => {
      function onKey(e: KeyboardEvent) {
        if (e.key !== "Escape") return;
        if (confirmOpen) {
          dismissCancel();
        } else if (cancelable) {
          requestCancel();
        }
      }
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [cancelable, confirmOpen, dismissCancel, requestCancel]);
  
    // ── beforeunload guard while proof is running ──────────────────────────
    useEffect(() => {
      if (!isActive) return;
      function onBeforeUnload(e: BeforeUnloadEvent) {
        e.preventDefault();
        e.returnValue = "";
      }
      window.addEventListener("beforeunload", onBeforeUnload);
      return () => window.removeEventListener("beforeunload", onBeforeUnload);
    }, [isActive]);
  
    // ── Close confirm on outside click ────────────────────────────────────
    const confirmRef = useRef<HTMLDivElement>(null);
  
    useEffect(() => {
      if (!confirmOpen) return;
      function onPointer(e: PointerEvent) {
        if (
          confirmRef.current &&
          !confirmRef.current.contains(e.target as Node)
        ) {
          dismissCancel();
        }
      }
      document.addEventListener("pointerdown", onPointer);
      return () => document.removeEventListener("pointerdown", onPointer);
    }, [confirmOpen, dismissCancel]);
  
    // ── Render ─────────────────────────────────────────────────────────────
    return (
      <div
        className="relative flex h-dvh flex-col overflow-hidden bg-zinc-950"
        aria-label="Proof generation"
      >
        {/* Progress bar — top edge */}
        <ProgressBar progress={progress} />
  
        {/* Ambient background */}
        <AmbientBackground active={isActive} />
  
        {/* Top chrome strip */}
        <div className="relative z-10 flex shrink-0 items-center justify-between px-5 pt-5">
  
          {/* Brand mark */}
          <LogoMark />
  
          {/* Phase status pill */}
          <PhaseLabel status={status} />
  
          {/* Cancel button */}
          <div className="relative" ref={confirmRef}>
            {cancelable ? (
              <button
                type="button"
                onClick={requestCancel}
                aria-label="Cancel proof generation"
                aria-expanded={confirmOpen}
                className={[
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5",
                  "text-[11px] font-medium text-zinc-700",
                  "border border-transparent transition-colors duration-150",
                  "hover:border-zinc-800 hover:bg-zinc-900 hover:text-zinc-400",
                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-600",
                  confirmOpen ? "border-zinc-800 bg-zinc-900 text-zinc-400" : "",
                ].join(" ")}
              >
                <svg
                  viewBox="0 0 10 10"
                  className="h-2.5 w-2.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M1 1l8 8M9 1L1 9" />
                </svg>
                Cancel
              </button>
            ) : (
              /* Placeholder keeps layout stable when button is hidden */
              <div className="w-16" aria-hidden="true" />
            )}
  
            {/* Cancel confirmation popover */}
            {confirmOpen && (
              <CancelConfirm
                onConfirm={confirmCancel}
                onDismiss={dismissCancel}
              />
            )}
          </div>
        </div>
  
        {/* Main content — sole scroll region is inside the page, not here */}
        <main
          id="main-content"
          className="relative z-10 flex min-h-0 flex-1 flex-col"
          tabIndex={-1}
          aria-live="polite"
        >
          <Outlet />
        </main>
      </div>
    );
  }
  
  export default FullscreenLayout;