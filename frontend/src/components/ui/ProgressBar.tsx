import React, { useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProgressBarVariant = "emerald" | "amber" | "rose" | "sky" | "zinc";
export type ProgressBarSize    = "xs" | "sm" | "md";

export interface ProgressBarProps {
  /** 0–100. Omit or pass undefined for indeterminate mode. */
  value?:       number;
  variant?:     ProgressBarVariant;
  size?:        ProgressBarSize;
  /** Label shown to the right of the bar (e.g. "42%"). */
  label?:       string;
  /** Show auto-generated percentage label. Ignored in indeterminate mode. */
  showPercent?: boolean;
  /** Accessible description of what is progressing. */
  ariaLabel?:   string;
  animated?:    boolean;
  className?:   string;
}

// ---------------------------------------------------------------------------
// Style maps
// ---------------------------------------------------------------------------

const SIZE_STYLES: Record<ProgressBarSize, { track: string; fill: string }> = {
  xs: { track: "h-0.5 rounded-full", fill: "h-0.5 rounded-full" },
  sm: { track: "h-1   rounded-full", fill: "h-1   rounded-full" },
  md: { track: "h-2   rounded-full", fill: "h-2   rounded-full" },
};

const VARIANT_STYLES: Record<
  ProgressBarVariant,
  { track: string; fill: string; glow: string }
> = {
  emerald: {
    track: "bg-zinc-800",
    fill:  "bg-emerald-400",
    glow:  "shadow-[0_0_8px_2px_rgba(52,211,153,0.45)]",
  },
  amber: {
    track: "bg-zinc-800",
    fill:  "bg-amber-400",
    glow:  "shadow-[0_0_8px_2px_rgba(251,191,36,0.40)]",
  },
  rose: {
    track: "bg-zinc-800",
    fill:  "bg-rose-400",
    glow:  "shadow-[0_0_8px_2px_rgba(251,113,133,0.40)]",
  },
  sky: {
    track: "bg-zinc-800",
    fill:  "bg-sky-400",
    glow:  "shadow-[0_0_8px_2px_rgba(56,189,248,0.40)]",
  },
  zinc: {
    track: "bg-zinc-800",
    fill:  "bg-zinc-400",
    glow:  "",
  },
};

// ---------------------------------------------------------------------------
// Indeterminate shimmer bar
// ---------------------------------------------------------------------------

function IndeterminateBar({
  fillClass,
  glowClass,
  sizeClass,
}: {
  fillClass: string;
  glowClass: string;
  sizeClass: string;
}) {
  return (
    <span
      className={[
        "absolute inset-y-0 left-0 w-1/3 rounded-full",
        fillClass,
        glowClass,
        "animate-[indeterminate_1.4s_ease-in-out_infinite]",
      ].join(" ")}
      aria-hidden="true"
    />
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProgressBar({
  value,
  variant     = "emerald",
  size        = "sm",
  label,
  showPercent = false,
  ariaLabel   = "Progress",
  animated    = true,
  className   = "",
}: ProgressBarProps) {
  const isIndeterminate = value === undefined || value === null;
  const clamped         = isIndeterminate ? 0 : Math.min(100, Math.max(0, value));

  // Animate width from 0 → clamped on first render / value changes
  const [displayWidth, setDisplayWidth] = useState(0);
  const rafRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isIndeterminate) return;
    // Defer one frame so the CSS transition fires after initial paint
    rafRef.current = setTimeout(() => setDisplayWidth(clamped), 32);
    return () => {
      if (rafRef.current) clearTimeout(rafRef.current);
    };
  }, [clamped, isIndeterminate]);

  const { track, fill, glow } = VARIANT_STYLES[variant];
  const { track: trackSize }  = SIZE_STYLES[size];

  const percentLabel =
    !isIndeterminate && showPercent
      ? `${Math.round(clamped)}%`
      : null;

  const displayLabel = label ?? percentLabel;

  return (
    <div className={["w-full", className].join(" ")}>
      {/* Track */}
      <div
        role="progressbar"
        aria-label={ariaLabel}
        aria-valuenow={isIndeterminate ? undefined : clamped}
        aria-valuemin={isIndeterminate ? undefined : 0}
        aria-valuemax={isIndeterminate ? undefined : 100}
        aria-valuetext={
          isIndeterminate ? "Loading…" : `${Math.round(clamped)}%`
        }
        className={[
          "relative w-full overflow-hidden",
          track,
          trackSize,
        ].join(" ")}
      >
        {isIndeterminate ? (
          <IndeterminateBar
            fillClass={fill}
            glowClass={glow}
            sizeClass={trackSize}
          />
        ) : (
          <span
            className={[
              "absolute inset-y-0 left-0 rounded-full",
              fill,
              animated ? glow : "",
              "transition-[width] duration-500 ease-out",
            ]
              .filter(Boolean)
              .join(" ")}
            style={{ width: `${displayWidth}%` }}
            aria-hidden="true"
          />
        )}
      </div>

      {/* Optional label */}
      {displayLabel && (
        <div className="mt-1 flex justify-end">
          <span className="font-mono tabular-nums text-[10px] text-zinc-500">
            {displayLabel}
          </span>
        </div>
      )}
    </div>
  );
}

export default ProgressBar;
