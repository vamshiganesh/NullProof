// frontend/src/components/shared/HowProofWorks.tsx
//
// A 4-step explainer panel used on both the Dashboard (idle state) and the
// Expired proof screen to explain how NullProof works without revealing an
// address.
//
// Steps:
//   1. Fetch Merkle path   — oracle returns the IMT witness for the address
//   2. Execute witness      — Noir circuit executes in-browser (WASM)
//   3. Generate proof       — UltraHonk prover produces the ZK proof
//   4. Submit on-chain      — ComplianceGate verifies + marks nullifier spent
//
// Visual design:
//   • Vertical step list with connector line between steps
//   • Each step has an icon, title, description, and a tech badge
//   • Steps animate in sequentially on first mount (staggered fade+slide)
//   • Optional `activeStep` prop highlights a specific step (used on the
//     ProofProgress screen to show which step is currently running)
//   • Optional `compact` prop collapses descriptions for the Expired screen

import React, { useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Step definitions
// ---------------------------------------------------------------------------

export type StepId =
  | "fetch-path"
  | "execute-witness"
  | "generate-proof"
  | "submit-chain";

interface Step {
  id:          StepId;
  number:      number;
  title:       string;
  description: string;
  /** Short tech label shown as a badge */
  badge:       string;
  /** Accent colour class for icon bg + ring */
  color:       "teal" | "purple" | "amber" | "blue";
}

const STEPS: Step[] = [
  {
    id:          "fetch-path",
    number:      1,
    title:       "Fetch Merkle witness",
    description:
      "The oracle returns your address's non-membership witness from the " +
      "Indexed Merkle Tree — the low-leaf index and sibling path needed to " +
      "prove absence without revealing your address.",
    badge:       "IMT · Oracle",
    color:       "blue",
  },
  {
    id:          "execute-witness",
    number:      2,
    title:       "Execute circuit witness",
    description:
      "The Noir circuit runs entirely in your browser via WebAssembly. It " +
      "takes your address, the Merkle path, and a secret to compute the " +
      "witness — the full assignment of all private signals.",
    badge:       "Noir · WASM",
    color:       "purple",
  },
  {
    id:          "generate-proof",
    number:      3,
    title:       "Generate UltraHonk proof",
    description:
      "Barretenberg's UltraHonk prover runs in-browser to produce a " +
      "succinct ZK proof. Your address never leaves your device — only the " +
      "proof and a one-time nullifier are made public.",
    badge:       "UltraHonk · bb.js",
    color:       "amber",
  },
  {
    id:          "submit-chain",
    number:      4,
    title:       "Submit proof on-chain",
    description:
      "ComplianceGate verifies the proof against the current sanctions " +
      "Merkle root, checks the nullifier is unused, then marks it spent — " +
      "preventing replay while your address stays private forever.",
    badge:       "Solidity · Sepolia",
    color:       "teal",
  },
];

// ---------------------------------------------------------------------------
// Colour token maps
// ---------------------------------------------------------------------------

type StepColor = Step["color"];

const ICON_BG: Record<StepColor, string> = {
  blue:   "bg-blue-500/10   border-blue-500/20",
  purple: "bg-purple-500/10 border-purple-500/20",
  amber:  "bg-amber-500/10  border-amber-500/20",
  teal:   "bg-teal-500/10   border-teal-500/20",
};

const ICON_COLOR: Record<StepColor, string> = {
  blue:   "text-blue-400",
  purple: "text-purple-400",
  amber:  "text-amber-400",
  teal:   "text-teal-400",
};

const NUMBER_COLOR: Record<StepColor, string> = {
  blue:   "text-blue-500",
  purple: "text-purple-500",
  amber:  "text-amber-500",
  teal:   "text-teal-500",
};

const BADGE_STYLE: Record<StepColor, string> = {
  blue:   "border-blue-500/20   bg-blue-500/8   text-blue-500",
  purple: "border-purple-500/20 bg-purple-500/8 text-purple-400",
  amber:  "border-amber-500/20  bg-amber-500/8  text-amber-500",
  teal:   "border-teal-500/20   bg-teal-500/8   text-teal-400",
};

const CONNECTOR_COLOR: Record<StepColor, string> = {
  blue:   "bg-blue-500/20",
  purple: "bg-purple-500/20",
  amber:  "bg-amber-500/20",
  teal:   "bg-teal-500/20",
};

const ACTIVE_RING: Record<StepColor, string> = {
  blue:   "ring-2 ring-blue-500/40   ring-offset-2 ring-offset-zinc-950",
  purple: "ring-2 ring-purple-500/40 ring-offset-2 ring-offset-zinc-950",
  amber:  "ring-2 ring-amber-500/40  ring-offset-2 ring-offset-zinc-950",
  teal:   "ring-2 ring-teal-500/40   ring-offset-2 ring-offset-zinc-950",
};

// ---------------------------------------------------------------------------
// Step icons (inline SVG, unique per step)
// ---------------------------------------------------------------------------

function StepIcon({ id, color }: { id: StepId; color: StepColor }) {
  const cls = `h-4 w-4 ${ICON_COLOR[color]}`;

  switch (id) {
    case "fetch-path":
      return (
        <svg viewBox="0 0 16 16" className={cls} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M8 1v14" strokeDasharray="2 2" />
          <path d="M2 4l6-3 6 3M2 8l6-3 6 3M2 12l6-3 6 3" />
        </svg>
      );
    case "execute-witness":
      return (
        <svg viewBox="0 0 16 16" className={cls} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="2" width="12" height="12" rx="2" />
          <path d="M5 6l2 2-2 2M8.5 10h2.5" />
        </svg>
      );
    case "generate-proof":
      return (
        <svg viewBox="0 0 16 16" className={cls} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M8 1L2 4v4c0 4 2.7 6.3 6 7 3.3-.7 6-3 6-7V4L8 1z" />
          <path d="M5.5 8l2 2 3-3" />
        </svg>
      );
    case "submit-chain":
      return (
        <svg viewBox="0 0 16 16" className={cls} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 5h10M3 8h6M3 11h4" />
          <circle cx="12.5" cy="11" r="2.5" />
          <path d="M11.5 11l.8.8 1.2-1.2" strokeWidth="1.3" />
        </svg>
      );
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface HowProofWorksProps {
  /**
   * Highlights a specific step as "active" — used on the ProofProgress
   * screen to mirror which circuit step is currently running.
   */
  activeStep?:  StepId;
  /**
   * Compact mode: hides per-step descriptions, shows only title + badge.
   * Used on the Expired proof screen where vertical space is at a premium.
   */
  compact?:     boolean;
  /**
   * Show the section header ("How it works"). Default true.
   */
  showHeader?:  boolean;
  className?:   string;
}

// ---------------------------------------------------------------------------
// StepRow
// ---------------------------------------------------------------------------

interface StepRowProps {
  step:       Step;
  isLast:     boolean;
  isActive:   boolean;
  isDimmed:   boolean;
  compact:    boolean;
  visible:    boolean;
  /** ms delay for staggered entrance */
  delay:      number;
}

function StepRow({
  step,
  isLast,
  isActive,
  isDimmed,
  compact,
  visible,
  delay,
}: StepRowProps) {
  return (
    <div
      className="relative flex gap-4"
      style={{
        opacity:   visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(10px)",
        transition: `opacity 0.4s ease ${delay}ms, transform 0.4s ease ${delay}ms`,
      }}
    >
      {/* ── Left column: number circle + connector ─────────────────── */}
      <div className="flex flex-col items-center">
        {/* Number / icon circle */}
        <div
          className={[
            "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border",
            "transition-all duration-300",
            ICON_BG[step.color],
            isActive ? ACTIVE_RING[step.color] : "",
            isDimmed ? "opacity-40" : "opacity-100",
          ].join(" ")}
          aria-hidden="true"
        >
          <StepIcon id={step.id} color={step.color} />

          {/* Active pulse */}
          {isActive && (
            <span
              className={[
                "absolute inset-0 animate-ping rounded-full",
                step.color === "blue"   ? "bg-blue-500/15"   :
                step.color === "purple" ? "bg-purple-500/15" :
                step.color === "amber"  ? "bg-amber-500/15"  :
                                          "bg-teal-500/15",
              ].join(" ")}
              style={{ animationDuration: "1.6s" }}
            />
          )}
        </div>

        {/* Vertical connector to next step */}
        {!isLast && (
          <div
            className={[
              "mt-1 w-px flex-1",
              CONNECTOR_COLOR[step.color],
              isDimmed ? "opacity-30" : "opacity-100",
            ].join(" ")}
            style={{ minHeight: compact ? "20px" : "28px" }}
            aria-hidden="true"
          />
        )}
      </div>

      {/* ── Right column: content ───────────────────────────────────── */}
      <div
        className={[
          "min-w-0 flex-1 pb-5 last:pb-0",
          isDimmed ? "opacity-40" : "opacity-100",
          "transition-opacity duration-300",
        ].join(" ")}
      >
        {/* Step number + title row */}
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={[
              "font-mono text-[10px] font-bold tabular-nums",
              NUMBER_COLOR[step.color],
            ].join(" ")}
            aria-hidden="true"
          >
            {String(step.number).padStart(2, "0")}
          </span>
          <span
            className={[
              "text-xs font-semibold",
              isActive ? "text-zinc-100" : "text-zinc-300",
            ].join(" ")}
          >
            {step.title}
          </span>
          {/* Active badge */}
          {isActive && (
            <span className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-[9px] font-medium text-zinc-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-400" />
              Running
            </span>
          )}
        </div>

        {/* Description — hidden in compact mode */}
        {!compact && (
          <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-600">
            {step.description}
          </p>
        )}

        {/* Tech badge */}
        <div className="mt-2">
          <span
            className={[
              "inline-flex items-center rounded-full border px-2 py-0.5",
              "font-mono text-[9px] font-semibold uppercase tracking-wider",
              BADGE_STYLE[step.color],
            ].join(" ")}
          >
            {step.badge}
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HowProofWorks
// ---------------------------------------------------------------------------

export function HowProofWorks({
  activeStep,
  compact    = false,
  showHeader = true,
  className  = "",
}: HowProofWorksProps) {
  // Staggered entrance animation
  const [visible, setVisible] = useState(false);
  const mountedRef             = useRef(false);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    // Small delay so the parent panel finishes its own entrance first
    const t = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

  const activeIndex = activeStep
    ? STEPS.findIndex((s) => s.id === activeStep)
    : -1;

  return (
    <div
      className={[
        "overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950",
        className,
      ].join(" ")}
      aria-label="How NullProof works"
    >
      {/* ── Header ──────────────────────────────────────────────────── */}
      {showHeader && (
        <div className="flex items-center gap-2 border-b border-zinc-800 px-5 py-3">
          {/* Lightbulb icon */}
          <svg viewBox="0 0 18 18" className="h-4 w-4 text-zinc-400" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 2a5 5 0 0 1 3 9v1H6v-1A5 5 0 0 1 9 2z" />
            <path d="M6.5 14.5h5M7.5 16.5h3" />
          </svg>
          <span className="text-xs font-semibold tracking-wide text-zinc-300">
            How it works
          </span>
          <span className="ml-auto rounded-full border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[10px] text-zinc-600">
            Zero-knowledge · In-browser
          </span>
        </div>
      )}

      {/* ── Step list ───────────────────────────────────────────────── */}
      <div className={compact ? "px-5 py-4" : "px-5 py-5"}>
        {STEPS.map((step, i) => {
          const isActive = step.id === activeStep;
          // When an activeStep is set, dim all steps that haven't been
          // reached yet (index > activeIndex).
          const isDimmed = activeIndex >= 0 && i > activeIndex && !isActive;

          return (
            <StepRow
              key={step.id}
              step={step}
              isLast={i === STEPS.length - 1}
              isActive={isActive}
              isDimmed={isDimmed}
              compact={compact}
              visible={visible}
              delay={i * 90}
            />
          );
        })}
      </div>

      {/* ── Footer privacy note ─────────────────────────────────────── */}
      {!compact && (
        <div className="flex items-start gap-2.5 border-t border-zinc-800/50 px-5 py-3">
          {/* Lock icon */}
          <svg viewBox="0 0 14 14" className="mt-0.5 h-3 w-3 shrink-0 text-zinc-700" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="2.5" y="6" width="9" height="7" rx="1.5" />
            <path d="M4.5 6V4a2.5 2.5 0 0 1 5 0v2" />
          </svg>
          <p className="text-[10px] leading-relaxed text-zinc-700">
            Your wallet address is a private input to the circuit and is{" "}
            <span className="text-zinc-500">never revealed</span> in the proof,
            the transaction calldata, or any on-chain event.
          </p>
        </div>
      )}
    </div>
  );
}

export default HowProofWorks;