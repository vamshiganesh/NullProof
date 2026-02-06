import React from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PageHeaderProps {
  /** Main page title — rendered as <h1>. */
  title:        string;
  /** Optional supporting description below the title. */
  subtitle?:    string;
  /** Slot for right-aligned actions (buttons, badges, dropdowns). */
  actions?:     React.ReactNode;
  /** Slot for a breadcrumb trail above the title. */
  breadcrumb?:  React.ReactNode;
  /** Slot for a status badge / pill beside the title. */
  badge?:       React.ReactNode;
  /** Adds a bottom border divider (default: true). */
  divided?:     boolean;
  className?:   string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PageHeader({
  title,
  subtitle,
  actions,
  breadcrumb,
  badge,
  divided   = true,
  className = "",
}: PageHeaderProps) {
  return (
    <div
      className={[
        "flex flex-col gap-1",
        divided ? "border-b border-zinc-800 pb-5 mb-6" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Breadcrumb row */}
      {breadcrumb && (
        <nav aria-label="Breadcrumb" className="mb-1">
          {breadcrumb}
        </nav>
      )}

      {/* Title row */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        {/* Left: title + badge + subtitle */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-semibold tracking-tight text-zinc-100 truncate">
              {title}
            </h1>
            {badge && (
              <span className="shrink-0">{badge}</span>
            )}
          </div>

          {subtitle && (
            <p className="mt-1 text-sm text-zinc-500 leading-relaxed max-w-prose">
              {subtitle}
            </p>
          )}
        </div>

        {/* Right: action slot */}
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

export default PageHeader;
