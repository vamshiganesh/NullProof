import React from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ButtonVariant = "primary" | "ghost" | "outline" | "danger";
export type ButtonSize    = "sm" | "md" | "lg";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:   ButtonVariant;
  size?:      ButtonSize;
  isLoading?: boolean;
  leftIcon?:  React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

// ---------------------------------------------------------------------------
// Style maps
// ---------------------------------------------------------------------------

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary: [
    "bg-emerald-500 text-zinc-950",
    "border border-emerald-500",
    "hover:bg-emerald-400 hover:border-emerald-400",
    "active:bg-emerald-600 active:border-emerald-600",
    "disabled:bg-emerald-500/30 disabled:border-emerald-500/30 disabled:text-emerald-500/40",
    "focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",
  ].join(" "),

  ghost: [
    "bg-transparent text-zinc-300",
    "border border-transparent",
    "hover:bg-zinc-800 hover:text-zinc-100",
    "active:bg-zinc-700",
    "disabled:text-zinc-600 disabled:hover:bg-transparent",
    "focus-visible:ring-2 focus-visible:ring-zinc-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",
  ].join(" "),

  outline: [
    "bg-transparent text-zinc-200",
    "border border-zinc-700",
    "hover:bg-zinc-800 hover:border-zinc-500 hover:text-zinc-100",
    "active:bg-zinc-700",
    "disabled:text-zinc-600 disabled:border-zinc-800 disabled:hover:bg-transparent",
    "focus-visible:ring-2 focus-visible:ring-zinc-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",
  ].join(" "),

  danger: [
    "bg-rose-500/10 text-rose-400",
    "border border-rose-500/30",
    "hover:bg-rose-500/20 hover:border-rose-500/50 hover:text-rose-300",
    "active:bg-rose-500/30",
    "disabled:text-rose-500/30 disabled:border-rose-500/10 disabled:hover:bg-transparent",
    "focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",
  ].join(" "),
};

const SIZE_STYLES: Record<ButtonSize, string> = {
  sm: "h-8  px-3   text-xs  gap-1.5 rounded-md",
  md: "h-10 px-4   text-sm  gap-2   rounded-lg",
  lg: "h-12 px-5   text-base gap-2.5 rounded-xl",
};

// ---------------------------------------------------------------------------
// Spinner (inline — avoids circular import with Spinner.tsx)
// ---------------------------------------------------------------------------

function ButtonSpinner() {
  return (
    <svg
      className="animate-spin h-4 w-4 shrink-0"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12" cy="12" r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Button({
  variant   = "primary",
  size      = "md",
  isLoading = false,
  leftIcon,
  rightIcon,
  fullWidth = false,
  disabled,
  children,
  className = "",
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || isLoading;

  return (
    <button
      disabled={isDisabled}
      aria-disabled={isDisabled}
      aria-busy={isLoading}
      className={[
        // Base
        "inline-flex items-center justify-center",
        "font-medium leading-none",
        "whitespace-nowrap select-none",
        "transition-all duration-150 ease-out",
        "outline-none",
        "cursor-pointer disabled:cursor-not-allowed",
        // Variant + size
        VARIANT_STYLES[variant],
        SIZE_STYLES[size],
        // Width
        fullWidth ? "w-full" : "",
        // Loading state dims content slightly
        isLoading ? "opacity-80" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {/* Left icon or spinner */}
      {isLoading ? (
        <ButtonSpinner />
      ) : leftIcon ? (
        <span className="shrink-0" aria-hidden="true">{leftIcon}</span>
      ) : null}

      {/* Label */}
      {children && (
        <span className={isLoading ? "opacity-60" : ""}>{children}</span>
      )}

      {/* Right icon (hidden while loading) */}
      {!isLoading && rightIcon && (
        <span className="shrink-0" aria-hidden="true">{rightIcon}</span>
      )}
    </button>
  );
}

export default Button;
