// frontend/src/components/protocol/KPICard.tsx
//
// Generic protocol stat card: label + big value + optional subtitle/badge.
//
// Designed for the Protocol dashboard section. Accepts any value shape
// (string, number, bigint, ReactNode) and supports four visual variants:
//   default  — neutral zinc surface
//   success  — teal tint (operational / healthy)
//   warning  — amber tint (degraded / paused)
//   error    — rose tint  (failure / offline)
//
// Additionally accepts:
//   • trend     — optional +/- percentage string rendered beside the value
//   • icon      — optional SVG ReactNode shown top-left
//   • loading   — skeleton shimmer replaces value + subtitle
//   • onClick   — makes the card interactive (hover lift + cursor pointer)

import React from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type KPIVariant = "default" | "success" | "warning" | "error";

export interface KPICardProps {
  /** Short uppercase label above the value, e.g. "Proofs Verified" */
  label: string;

  /**
   * The primary big value to display.
   * Pass a pre-formatted string ("14,532"), number, bigint, or any ReactNode
   * for custom rendering (e.g. a hash with a copy button).
   */
  value: React.ReactNode;

  /**
   * Secondary line below the value.
   * Typically context like "last 24h" or "as of block 12,345,678".
   */
  subtitle?: React.ReactNode;

  /** Optional badge text rendered top-right, e.g. "LIVE", "PAUSED" */
  badge?: string;

  /**
   * Trend indicator: a pre-formatted string shown beside the value.
   * Convention: positive = green "+12.4%", negative = red "−3.1%".
   * Pass the sign as part of the string — KPICard renders it as-is.
   */
  trend?: string;

  /** Icon SVG element rendered top-left (16×16 recommended). */
  icon?: React.ReactNode;

  /** Visual colour variant. Default: "default" */
  variant?: KPIVariant;

  /** Show skeleton shimmer in place of value + subtitle. */
  loading?: boolean;

  /** If provided, the card becomes a button with hover/active states. */
  onClick?: () => void;

  className?: string;
}

// ---------------------------------------------------------------------------
// Variant token maps
// ---------------------------------------------------------------------------

const VARIANT_BORDER: Record<KPIVariant, string> = {
  default: "border-zinc-800",
  success: "border-teal-500/25",
  warning: "border-amber-500/25",
  error:   "border-rose-500/25",
};

const VARIANT_BG: Record<KPIVariant, string> = {
  default: "bg-zinc-950",
  success: "bg-teal-500/[0.04]",
  warning: "bg-amber-500/[0.04]",
  error:   "bg-rose-500/[0.04]",
};

const VARIANT_LABEL: Record<KPIVariant, string> = {
  default: "text-zinc-600",
  success: "text-teal-600",
  warning: "text-amber-600",
  error:   "text-rose-600",
};

const VARIANT_ICON_BG: Record<KPIVariant, string> = {
  default: "bg-zinc-900    text-zinc-400",
  success: "bg-teal-500/10  text-teal-400",
  warning: "bg-amber-500/10 text-amber-400",
  error:   "bg-rose-500/10  text-rose-400",
};

const VARIANT_BADGE: Record<KPIVariant, string> = {
  default: "border-zinc-700    bg-zinc-900    text-zinc-500",
  success: "border-teal-500/30  bg-teal-500/10  text-teal-400",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  error:   "border-rose-500/30  bg-rose-500/10  text-rose-400",
};

// ---------------------------------------------------------------------------
// Trend colour helper
// ---------------------------------------------------------------------------

function trendColor(trend: string): string {
  if (trend.startsWith("+")) return "text-teal-400";
  if (trend.startsWith("−") || trend.startsWith("-")) return "text-rose-400";
  return "text-zinc-500";
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function Skeleton({ wide = false }: { wide?: boolean }) {
  return (
    <div
      className={[
        "animate-pulse rounded bg-zinc-800",
        wide ? "h-3 w-24" : "h-3 w-16",
      ].join(" ")}
    />
  );
}

// ---------------------------------------------------------------------------
// KPICard
// ---------------------------------------------------------------------------

export function KPICard({
  label,
  value,
  subtitle,
  badge,
  trend,
  icon,
  variant  = "default",
  loading  = false,
  onClick,
  className = "",
}: KPICardProps) {
  const isInteractive = !!onClick;

  const root = [
    // Base
    "relative flex flex-col gap-3 rounded-2xl border p-5",
    "transition-all duration-150",

    // Variant colours
    VARIANT_BORDER[variant],
    VARIANT_BG[variant],

    // Interactive states
    isInteractive
      ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20 active:translate-y-0 active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
      : "",

    className,
  ].join(" ");

  const Tag = isInteractive ? "button" : "div";

  return (
    <Tag
      className={root}
      onClick={onClick}
      {...(isInteractive ? { type: "button" } : {})}
    >
      {/* ── Top row: icon + badge ────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-2">

        {/* Icon slot */}
        {icon ? (
          <span
            className={[
              "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
              VARIANT_ICON_BG[variant],
            ].join(" ")}
            aria-hidden="true"
          >
            {icon}
          </span>
        ) : (
          /* Spacer so badge always floats right even without icon */
          <span className="h-8 w-0" aria-hidden="true" />
        )}

        {/* Badge */}
        {badge && (
          <span
            className={[
              "inline-flex items-center rounded-full border px-2 py-0.5",
              "text-[9px] font-semibold uppercase tracking-widest",
              VARIANT_BADGE[variant],
            ].join(" ")}
          >
            {badge}
          </span>
        )}
      </div>

      {/* ── Label ────────────────────────────────────────────────────── */}
      <p
        className={[
          "text-[10px] font-semibold uppercase tracking-widest",
          VARIANT_LABEL[variant],
        ].join(" ")}
      >
        {label}
      </p>

      {/* ── Value + trend ────────────────────────────────────────────── */}
      <div className="flex items-end gap-2">
        {loading ? (
          <Skeleton wide />
        ) : (
          <p className="text-2xl font-semibold tabular-nums leading-none text-zinc-100">
            {value}
          </p>
        )}

        {!loading && trend && (
          <span
            className={[
              "mb-0.5 text-[11px] font-medium tabular-nums",
              trendColor(trend),
            ].join(" ")}
            aria-label={`Trend: ${trend}`}
          >
            {trend}
          </span>
        )}
      </div>

      {/* ── Subtitle ─────────────────────────────────────────────────── */}
      {(subtitle || loading) && (
        <div className="text-[11px] leading-relaxed text-zinc-600">
          {loading ? <Skeleton /> : subtitle}
        </div>
      )}

      {/* ── Interactive arrow hint ────────────────────────────────────── */}
      {isInteractive && (
        <svg
          viewBox="0 0 12 12"
          className="absolute right-4 top-4 h-3 w-3 text-zinc-700 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M2 10L10 2M4 2h6v6" />
        </svg>
      )}
    </Tag>
  );
}

export default KPICard;