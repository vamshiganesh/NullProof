import React from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StatusDotState =
  | "live"        // emerald pulse  — connected / active / valid
  | "pending"     // amber pulse    — loading / waiting / generating
  | "error"       // rose static    — failed / invalid / sanctioned
  | "idle"        // zinc static    — disconnected / unknown / not started
  | "warning";    // amber static   — stale / degraded

export type StatusDotSize = "xs" | "sm" | "md" | "lg";

export interface StatusDotProps {
  state?:      StatusDotState;
  size?:       StatusDotSize;
  /** Force pulse on/off regardless of state default. */
  pulse?:      boolean;
  /** Screen-reader label. Defaults to the state name. */
  label?:      string;
  className?:  string;
}

// ---------------------------------------------------------------------------
// Style maps
// ---------------------------------------------------------------------------

const SIZE_MAP: Record<StatusDotSize, { dot: string; ping: string }> = {
  xs: { dot: "h-1.5 w-1.5", ping: "h-1.5 w-1.5" },
  sm: { dot: "h-2   w-2",   ping: "h-2   w-2"   },
  md: { dot: "h-2.5 w-2.5", ping: "h-2.5 w-2.5" },
  lg: { dot: "h-3   w-3",   ping: "h-3   w-3"   },
};

interface StateConfig {
  dot:       string;   // solid dot colour
  ping:      string;   // ping ring colour
  pulse:     boolean;  // default pulse behaviour
  label:     string;   // default sr label
}

const STATE_CONFIG: Record<StatusDotState, StateConfig> = {
  live: {
    dot:   "bg-emerald-400",
    ping:  "bg-emerald-400",
    pulse: true,
    label: "Live",
  },
  pending: {
    dot:   "bg-amber-400",
    ping:  "bg-amber-400",
    pulse: true,
    label: "Pending",
  },
  error: {
    dot:   "bg-rose-400",
    ping:  "bg-rose-400",
    pulse: false,
    label: "Error",
  },
  idle: {
    dot:   "bg-zinc-500",
    ping:  "bg-zinc-500",
    pulse: false,
    label: "Idle",
  },
  warning: {
    dot:   "bg-amber-300",
    ping:  "bg-amber-300",
    pulse: false,
    label: "Warning",
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StatusDot({
  state     = "idle",
  size      = "sm",
  pulse,
  label,
  className = "",
}: StatusDotProps) {
  const config      = STATE_CONFIG[state];
  const shouldPulse = pulse !== undefined ? pulse : config.pulse;
  const srLabel     = label ?? config.label;
  const { dot: dotSize, ping: pingSize } = SIZE_MAP[size];

  return (
    <span
      role="img"
      aria-label={srLabel}
      className={[
        "relative inline-flex items-center justify-center shrink-0",
        className,
      ].join(" ")}
    >
      {/* Ping ring — only rendered when pulsing */}
      {shouldPulse && (
        <span
          className={[
            "absolute inline-flex rounded-full opacity-75",
            "animate-ping",
            pingSize,
            config.ping,
          ].join(" ")}
          aria-hidden="true"
        />
      )}

      {/* Solid dot */}
      <span
        className={[
          "relative inline-flex rounded-full",
          dotSize,
          config.dot,
        ].join(" ")}
        aria-hidden="true"
      />
    </span>
  );
}

export default StatusDot;
