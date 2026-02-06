import React from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SectionHeaderProps {
  /** Section heading — rendered as <h2> by default. */
  title:        string;
  /** Supporting description below the title. */
  description?: string;
  /** Right-aligned slot: button, badge, dropdown, or any node. */
  action?:      React.ReactNode;
  /** Left slot beside the title: icon, status dot, count badge. */
  icon?:        React.ReactNode;
  /** Heading level — defaults to h2. Use h3 for nested sections. */
  level?:       2 | 3 | 4;
  /** Adds a bottom divider line (default: false — card-level headers rarely need one). */
  divided?:     boolean;
  /** Reduces vertical padding — for tight card interiors. */
  compact?:     boolean;
  className?:   string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SectionHeader({
  title,
  description,
  action,
  icon,
  level    = 2,
  divided  = false,
  compact  = false,
  className = "",
}: SectionHeaderProps) {
  const Tag = `h${level}` as "h2" | "h3" | "h4";

  return (
    <div
      className={[
        "flex flex-wrap items-start justify-between gap-3",
        compact ? "py-0" : "py-0.5",
        divided ? "border-b border-zinc-800 pb-3 mb-4" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Left: icon + title + description */}
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        {icon && (
          <span
            className="mt-0.5 shrink-0 text-zinc-500"
            aria-hidden="true"
          >
            {icon}
          </span>
        )}

        <div className="min-w-0">
          <Tag
            className={[
              "font-semibold tracking-tight text-zinc-100 truncate",
              level === 2 ? "text-sm"      : "",
              level === 3 ? "text-xs"      : "",
              level === 4 ? "text-[11px]"  : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {title}
          </Tag>

          {description && (
            <p
              className={[
                "mt-0.5 text-zinc-500 leading-relaxed",
                level === 2 ? "text-xs"      : "",
                level === 3 ? "text-[11px]"  : "",
                level === 4 ? "text-[10px]"  : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {description}
            </p>
          )}
        </div>
      </div>

      {/* Right: action slot */}
      {action && (
        <div className="shrink-0 flex items-center gap-2">
          {action}
        </div>
      )}
    </div>
  );
}

export default SectionHeader;
