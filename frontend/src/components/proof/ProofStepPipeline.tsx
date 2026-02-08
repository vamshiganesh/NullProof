// frontend/src/components/proof/ProofStepPipeline.tsx

import React, { useEffect, useRef } from "react";

import {
  useProofStore,
  selectProofSteps,
  selectProofStatus,
  type ProofStep,
  type StepState,
} from "@/store/proofStore";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProofStepPipelineProps {
  className?: string;
}

// ---------------------------------------------------------------------------
// Step state → visual config
// ---------------------------------------------------------------------------

const STATE_CONFIG: Record<
  StepState,
  {
    ring:   string;
    icon:   "dot" | "spinner" | "check" | "cross";
    label:  string;
    connector: string;
  }
> = {
  idle: {
    ring:      "border-zinc-700 bg-zinc-900",
    icon:      "dot",
    label:     "text-zinc-600",
    connector: "bg-zinc-800",
  },
  active: {
    ring:      "border-violet-500 bg-violet-500/10",
    icon:      "spinner",
    label:     "text-zinc-200",
    connector: "bg-zinc-800",
  },
  done: {
    ring:      "border-emerald-500 bg-emerald-500/10",
    icon:      "check",
    label:     "text-zinc-400",
    connector: "bg-emerald-500",
  },
  error: {
    ring:      "border-rose-500 bg-rose-500/10",
    icon:      "cross",
    label:     "text-rose-400",
    connector: "bg-zinc-800",
  },
};

// ---------------------------------------------------------------------------
// Step icons
// ---------------------------------------------------------------------------

function DotIcon() {
  return (
    <div className="h-2 w-2 rounded-full bg-zinc-600" aria-hidden="true" />
  );
}

function SpinnerIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4 animate-spin text-violet-400"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 2a10 10 0 0 1 10 10" opacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" strokeDasharray="16 48" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4 text-emerald-400"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4 text-rose-400"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  );
}

function StepIcon({ state }: { state: StepState }) {
  switch (STATE_CONFIG[state].icon) {
    case "spinner": return <SpinnerIcon />;
    case "check":   return <CheckIcon />;
    case "cross":   return <CrossIcon />;
    default:        return <DotIcon />;
  }
}

// ---------------------------------------------------------------------------
// Animated connector line between two steps
// ---------------------------------------------------------------------------

function Connector({
  filled,
  animating,
}: {
  filled:    boolean;  // true = prev step is done → draw emerald fill
  animating: boolean;  // true = prev step is active → animate partial fill
}) {
  const barRef = useRef<HTMLDivElement>(null);

  return (
    // Outer track
    <div
      className="relative mx-auto w-px flex-1 bg-zinc-800"
      style={{ minHeight: "2rem" }}
      aria-hidden="true"
    >
      {/* Fill layer */}
      <div
        ref={barRef}
        className={[
          "absolute inset-x-0 top-0 rounded-full transition-all duration-700 ease-out",
          filled    ? "bg-emerald-500 h-full"  : "",
          animating ? "bg-violet-500/60 h-1/2" : "",
          !filled && !animating ? "h-0"        : "",
        ].join(" ")}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single step row
// ---------------------------------------------------------------------------

function PipelineStep({
  step,
  isLast,
  prevState,
}: {
  step:      ProofStep;
  isLast:    boolean;
  prevState: StepState | null;  // null = first step (no connector above)
}) {
  const cfg = STATE_CONFIG[step.state];

  // Connector (above this step) reflects the *previous* step's completion
  const connectorFilled    = prevState === "done";
  const connectorAnimating = prevState === "active";

  return (
    <li className="flex gap-4">
      {/* Left column: connector + node */}
      <div className="flex flex-col items-center">
        {/* Connector above (skip for first step) */}
        {prevState !== null && (
          <Connector filled={connectorFilled} animating={connectorAnimating} />
        )}

        {/* Node circle */}
        <div
          className={[
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2",
            "transition-all duration-300",
            cfg.ring,
          ].join(" ")}
          aria-hidden="true"
        >
          <StepIcon state={step.state} />
        </div>

        {/* Connector below (skip for last step) */}
        {!isLast && (
          <Connector
            filled={step.state === "done"}
            animating={step.state === "active"}
          />
        )}
      </div>

      {/* Right column: label + description */}
      <div
        className={[
          "flex flex-col justify-center pb-1 transition-colors duration-300",
          // Vertically align with the node: offset to center on the 32px circle
          prevState !== null ? "pt-0" : "",
        ].join(" ")}
        style={{ paddingTop: prevState !== null ? "2rem" : 0 }}
      >
        <span
          className={[
            "text-sm font-medium leading-tight transition-colors duration-300",
            cfg.label,
          ].join(" ")}
        >
          {step.label}
        </span>

        {/* Sub-label per state */}
        {step.state === "active" && (
          <span className="mt-0.5 text-xs text-violet-400 animate-pulse">
            Running…
          </span>
        )}
        {step.state === "done" && (
          <span className="mt-0.5 text-xs text-emerald-500">
            Complete
          </span>
        )}
        {step.state === "error" && (
          <span className="mt-0.5 text-xs text-rose-400">
            Failed
          </span>
        )}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// ProofStepPipeline
// ---------------------------------------------------------------------------

export function ProofStepPipeline({ className = "" }: ProofStepPipelineProps) {
  const steps  = useProofStore(selectProofSteps);
  const status = useProofStore(selectProofStatus);

  // Only render while generation is in-flight (or error / done)
  const visible =
    status === "generating" ||
    status === "generated"  ||
    status === "error";

  if (!visible) return null;

  return (
    <div
      role="list"
      aria-label="Proof generation steps"
      className={`flex flex-col ${className}`}
    >
      <ul className="flex flex-col">
        {steps.map((step, i) => (
          <PipelineStep
            key={step.id}
            step={step}
            isLast={i === steps.length - 1}
            prevState={i === 0 ? null : (steps[i - 1]?.state ?? null)}
          />
        ))}
      </ul>

      {/* Overall status footer */}
      {status === "generated" && (
        <p className="mt-4 text-center text-xs font-medium text-emerald-400">
          All steps complete — proof is ready.
        </p>
      )}
      {status === "error" && (
        <p className="mt-4 text-center text-xs font-medium text-rose-400">
          Generation stopped — see error above.
        </p>
      )}
    </div>
  );
}

export default ProofStepPipeline;