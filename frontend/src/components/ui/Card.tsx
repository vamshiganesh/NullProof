import React from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CardProps {
  children:    React.ReactNode;
  className?:  string;
  /** Renders a top header band separated by a divider. */
  header?:     React.ReactNode;
  /** Supplementary content pinned to the card footer. */
  footer?:     React.ReactNode;
  /** Removes all padding — use when child needs edge-to-edge content. */
  noPadding?:  boolean;
  /** Adds a coloured left accent border. */
  accent?:     "emerald" | "amber" | "rose" | "sky" | "zinc";
  /** Elevates the card with a stronger shadow on hover. */
  hoverable?:  boolean;
  as?:         React.ElementType;
}

export interface CardHeaderProps {
  children:   React.ReactNode;
  className?: string;
  /** Slot for a right-aligned action (e.g. a refresh button or badge). */
  action?:    React.ReactNode;
}

export interface CardSectionProps {
  children:   React.ReactNode;
  className?: string;
  /** Draws a top divider line above this section. */
  divided?:   boolean;
}

// ---------------------------------------------------------------------------
// Style maps
// ---------------------------------------------------------------------------

const ACCENT_STYLES: Record<NonNullable<CardProps["accent"]>, string> = {
  emerald: "border-l-2 border-l-emerald-500/60",
  amber:   "border-l-2 border-l-amber-400/60",
  rose:    "border-l-2 border-l-rose-500/60",
  sky:     "border-l-2 border-l-sky-400/60",
  zinc:    "border-l-2 border-l-zinc-500/60",
};

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

export function Card({
  children,
  className  = "",
  header,
  footer,
  noPadding  = false,
  accent,
  hoverable  = false,
  as: Tag    = "div",
}: CardProps) {
  return (
    <Tag
      className={[
        // Surface
        "bg-zinc-900",
        "border border-zinc-800",
        "rounded-xl",
        // Shadow
        "shadow-md shadow-black/30",
        // Transition
        "transition-shadow duration-200 ease-out",
        // Hoverable
        hoverable
          ? "hover:shadow-lg hover:shadow-black/50 hover:border-zinc-700 cursor-pointer"
          : "",
        // Accent
        accent ? ACCENT_STYLES[accent] : "",
        // Overflow clip so children respect rounded corners
        "overflow-hidden",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Header band */}
      {header && (
        <div className="px-5 py-3.5 border-b border-zinc-800 bg-zinc-800/40">
          {header}
        </div>
      )}

      {/* Body */}
      <div className={noPadding ? "" : "p-5"}>
        {children}
      </div>

      {/* Footer band */}
      {footer && (
        <div className="px-5 py-3 border-t border-zinc-800 bg-zinc-800/30">
          {footer}
        </div>
      )}
    </Tag>
  );
}

// ---------------------------------------------------------------------------
// CardHeader — structured header with optional right-side action slot
// ---------------------------------------------------------------------------

export function CardHeader({ children, className = "", action }: CardHeaderProps) {
  return (
    <div
      className={[
        "flex items-center justify-between gap-3",
        className,
      ].join(" ")}
    >
      <div className="flex items-center gap-2 min-w-0">
        {children}
      </div>
      {action && (
        <div className="shrink-0 flex items-center gap-2">
          {action}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CardTitle — consistent heading style inside a card header
// ---------------------------------------------------------------------------

export function CardTitle({
  children,
  className = "",
}: {
  children:   React.ReactNode;
  className?: string;
}) {
  return (
    <h3
      className={[
        "text-sm font-semibold text-zinc-100 tracking-tight truncate",
        className,
      ].join(" ")}
    >
      {children}
    </h3>
  );
}

// ---------------------------------------------------------------------------
// CardSection — internally divided section within a card body
// ---------------------------------------------------------------------------

export function CardSection({ children, className = "", divided = false }: CardSectionProps) {
  return (
    <div
      className={[
        divided ? "border-t border-zinc-800 pt-4 mt-4" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}

export default Card;
