import React from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BadgeVariant =
  | "valid"
  | "expired"
  | "no-proof"
  | "pending"
  | "error"
  | "paused";

export interface BadgeProps {
  variant:   BadgeVariant;
  label?:    string;             // override default label
  className?: string;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CONFIG: Record<
  BadgeVariant,
  { label: string; dot: string; container: string }
> = {
  "valid": {
    label:     "VALID",
    dot:       "bg-emerald-400",
    container: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
  },
  "expired": {
    label:     "EXPIRED",
    dot:       "bg-amber-400",
    container: "bg-amber-400/10 text-amber-400 border-amber-400/20",
  },
  "no-proof": {
    label:     "NO ACTIVE PROOF",
    dot:       "bg-zinc-500",
    container: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  },
  "pending": {
    label:     "PENDING",
    dot:       "bg-sky-400",
    container: "bg-sky-400/10 text-sky-400 border-sky-400/20",
  },
  "error": {
    label:     "ERROR",
    dot:       "bg-rose-400",
    container: "bg-rose-400/10 text-rose-400 border-rose-400/20",
  },
  "paused": {
    label:     "PAUSED",
    dot:       "bg-orange-400",
    container: "bg-orange-400/10 text-orange-400 border-orange-400/20",
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Badge({ variant, label, className = "" }: BadgeProps) {
  const { label: defaultLabel, dot, container } = CONFIG[variant];
  const displayLabel = label ?? defaultLabel;

  return (
    <span
      className={[
        "inline-flex items-center gap-1.5",
        "px-2.5 py-0.5",
        "rounded-full border",
        "font-mono text-[10px] font-semibold tracking-widest uppercase",
        "select-none whitespace-nowrap",
        container,
        className,
      ].join(" ")}
      role="status"
      aria-label={displayLabel}
    >
      {/* Dot */}
      <span
        className={["block h-1.5 w-1.5 rounded-full shrink-0", dot].join(" ")}
        aria-hidden="true"
      />
      {displayLabel}
    </span>
  );
}

export default Badge;
