import React from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SpinnerSize    = "xs" | "sm" | "md" | "lg";
export type SpinnerVariant = "emerald" | "zinc" | "white" | "amber" | "rose";

export interface SpinnerProps {
  size?:      SpinnerSize;
  variant?:   SpinnerVariant;
  /** Screen-reader label (default: "Loading…"). */
  label?:     string;
  /** Hides the sr-only label entirely — use when parent already announces state. */
  silent?:    boolean;
  className?: string;
}

// ---------------------------------------------------------------------------
// Style maps
// ---------------------------------------------------------------------------

const SIZE_MAP: Record<SpinnerSize, { svg: number; stroke: number }> = {
  xs: { svg: 12, stroke: 2   },
  sm: { svg: 16, stroke: 2   },
  md: { svg: 24, stroke: 2.5 },
  lg: { svg: 36, stroke: 3   },
};

const VARIANT_MAP: Record<SpinnerVariant, { track: string; arc: string }> = {
  emerald: {
    track: "stroke-emerald-400/20",
    arc:   "stroke-emerald-400",
  },
  zinc: {
    track: "stroke-zinc-700",
    arc:   "stroke-zinc-400",
  },
  white: {
    track: "stroke-white/20",
    arc:   "stroke-white",
  },
  amber: {
    track: "stroke-amber-400/20",
    arc:   "stroke-amber-400",
  },
  rose: {
    track: "stroke-rose-400/20",
    arc:   "stroke-rose-400",
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Spinner({
  size      = "sm",
  variant   = "emerald",
  label     = "Loading…",
  silent    = false,
  className = "",
}: SpinnerProps) {
  const { svg: svgSize, stroke } = SIZE_MAP[size];
  const { track, arc }           = VARIANT_MAP[variant];

  // Circle geometry
  const r          = (svgSize - stroke * 2) / 2;
  const cx         = svgSize / 2;
  const cy         = svgSize / 2;
  const circumference = 2 * Math.PI * r;
  // Show ~25% of the circumference as the spinning arc
  const arcLength  = circumference * 0.25;
  const dashArray  = `${arcLength} ${circumference - arcLength}`;

  return (
    <span
      role="status"
      aria-label={silent ? undefined : label}
      aria-live={silent ? undefined : "polite"}
      className={[
        "inline-flex items-center justify-center shrink-0",
        className,
      ].join(" ")}
    >
      <svg
        width={svgSize}
        height={svgSize}
        viewBox={`0 0 ${svgSize} ${svgSize}`}
        fill="none"
        aria-hidden="true"
        className="animate-spin"
        style={{ animationDuration: "700ms", animationTimingFunction: "linear" }}
      >
        {/* Track ring */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          strokeWidth={stroke}
          className={track}
        />
        {/* Spinning arc — starts at top (rotated -90°) */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={dashArray}
          strokeDashoffset={0}
          className={arc}
          style={{ transformOrigin: "center", transform: "rotate(-90deg)" }}
        />
      </svg>

      {/* Screen-reader text */}
      {!silent && (
        <span className="sr-only">{label}</span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// SpinnerOverlay — full-area centred spinner for loading states in cards/panels
// ---------------------------------------------------------------------------

export interface SpinnerOverlayProps {
  /** Message shown below the spinner. */
  message?:   string;
  size?:      SpinnerSize;
  variant?:   SpinnerVariant;
  /** Adds a dark backdrop — useful over content rather than empty areas. */
  backdrop?:  boolean;
}

export function SpinnerOverlay({
  message,
  size    = "md",
  variant = "emerald",
  backdrop = false,
}: SpinnerOverlayProps) {
  return (
    <div
      className={[
        "absolute inset-0 z-10",
        "flex flex-col items-center justify-center gap-3",
        backdrop ? "bg-zinc-950/70 backdrop-blur-sm" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-live="polite"
      aria-busy="true"
    >
      <Spinner size={size} variant={variant} silent />
      {message && (
        <p className="text-xs text-zinc-500 font-mono tracking-wide">
          {message}
        </p>
      )}
    </div>
  );
}

export default Spinner;
