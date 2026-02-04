import React from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MonoValueSize    = "xs" | "sm" | "md" | "lg";
export type MonoValueVariant = "default" | "muted" | "highlight" | "emerald" | "amber" | "rose";

export interface MonoValueProps {
  children:    React.ReactNode;
  size?:       MonoValueSize;
  variant?:    MonoValueVariant;
  /** Renders as a block-level element instead of inline. */
  block?:      boolean;
  /** Applies strikethrough — useful for invalidated/superseded values. */
  strikethrough?: boolean;
  /** Tooltip shown on hover (useful for showing full precision). */
  title?:      string;
  className?:  string;
  as?:         React.ElementType;
}

// ---------------------------------------------------------------------------
// Style maps
// ---------------------------------------------------------------------------

const SIZE_STYLES: Record<MonoValueSize, string> = {
  xs: "text-[10px] leading-4",
  sm: "text-xs     leading-5",
  md: "text-sm     leading-6",
  lg: "text-base   leading-7",
};

const VARIANT_STYLES: Record<MonoValueVariant, string> = {
  default:   "text-zinc-200",
  muted:     "text-zinc-500",
  highlight: "text-zinc-100 bg-zinc-800 px-1.5 py-0.5 rounded",
  emerald:   "text-emerald-400",
  amber:     "text-amber-400",
  rose:      "text-rose-400",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MonoValue({
  children,
  size          = "sm",
  variant       = "default",
  block         = false,
  strikethrough = false,
  title,
  className     = "",
  as,
}: MonoValueProps) {
  const Tag = as ?? (block ? "div" : "span");

  return (
    <Tag
      title={title}
      className={[
        // Core — JetBrains Mono with tabular-nums so digits never shift
        "font-mono tabular-nums",
        "tracking-tight",
        "select-all",
        // Size + variant
        SIZE_STYLES[size],
        VARIANT_STYLES[variant],
        // Modifiers
        strikethrough ? "line-through opacity-50" : "",
        block         ? "block"                   : "inline",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </Tag>
  );
}

// ---------------------------------------------------------------------------
// Convenience sub-components
// ---------------------------------------------------------------------------

/**
 * A labelled data row: "Label ········ Value"
 * Used in proof detail cards and protocol status panels.
 */
export interface MonoRowProps {
  label:      string;
  children:   React.ReactNode;
  size?:      MonoValueSize;
  className?: string;
}

export function MonoRow({ label, children, size = "sm", className = "" }: MonoRowProps) {
  return (
    <div
      className={[
        "flex items-baseline justify-between gap-4",
        "py-1.5",
        className,
      ].join(" ")}
    >
      <span
        className={[
          "font-sans text-zinc-500 shrink-0",
          size === "xs" ? "text-[10px]" : "text-xs",
        ].join(" ")}
      >
        {label}
      </span>
      <MonoValue size={size} className="text-right min-w-0 truncate">
        {children}
      </MonoValue>
    </div>
  );
}

/**
 * A stack of MonoRows separated by a subtle divider.
 * Wraps a group of related data points inside a card.
 */
export function MonoTable({
  children,
  className = "",
}: {
  children:   React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        "divide-y divide-zinc-800/60",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

export default MonoValue;
