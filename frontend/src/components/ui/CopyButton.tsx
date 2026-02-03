import React, { useState, useCallback, useRef } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CopyButtonSize = "xs" | "sm" | "md";

export interface CopyButtonProps {
  value:       string;
  size?:       CopyButtonSize;
  className?:  string;
  /** Label read by screen readers (default: "Copy to clipboard"). */
  ariaLabel?:  string;
  /** Duration in ms to show the ✓ confirmation (default: 2000). */
  resetMs?:    number;
  /** Called after a successful copy. */
  onCopied?:   () => void;
}

type CopyState = "idle" | "copied" | "error";

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function IconCopy({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Back page */}
      <rect x="5" y="5" width="8" height="8" rx="1.5" />
      {/* Front page */}
      <path d="M3 11V3.5A1.5 1.5 0 0 1 4.5 2H11" />
    </svg>
  );
}

function IconCheck({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="2.5,8.5 6,12 13.5,4" />
    </svg>
  );
}

function IconError({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <line x1="4" y1="4" x2="12" y2="12" />
      <line x1="12" y1="4" x2="4"  y2="12" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Size map
// ---------------------------------------------------------------------------

const SIZE_MAP: Record<CopyButtonSize, { icon: number; button: string }> = {
  xs: { icon: 12, button: "h-5 w-5 rounded" },
  sm: { icon: 13, button: "h-6 w-6 rounded-md" },
  md: { icon: 15, button: "h-7 w-7 rounded-md" },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CopyButton({
  value,
  size      = "sm",
  className = "",
  ariaLabel = "Copy to clipboard",
  resetMs   = 2000,
  onCopied,
}: CopyButtonProps) {
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = useCallback(async () => {
    if (copyState !== "idle") return;

    try {
      await navigator.clipboard.writeText(value);
      setCopyState("copied");
      onCopied?.();
    } catch {
      setCopyState("error");
    }

    // Clear any existing timer before setting a new one
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setCopyState("idle");
      timerRef.current = null;
    }, resetMs);
  }, [value, copyState, resetMs, onCopied]);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const { icon: iconSize, button: buttonClass } = SIZE_MAP[size];

  const stateStyles: Record<CopyState, string> = {
    idle:   "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700/60",
    copied: "text-emerald-400 bg-emerald-400/10",
    error:  "text-rose-400   bg-rose-400/10",
  };

  const stateLabel: Record<CopyState, string> = {
    idle:   ariaLabel,
    copied: "Copied!",
    error:  "Copy failed",
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={copyState !== "idle"}
      aria-label={stateLabel[copyState]}
      title={stateLabel[copyState]}
      className={[
        "inline-flex items-center justify-center shrink-0",
        "border border-transparent",
        "transition-all duration-150 ease-out",
        "focus-visible:outline-none focus-visible:ring-2",
        "focus-visible:ring-zinc-500 focus-visible:ring-offset-1",
        "focus-visible:ring-offset-zinc-900",
        "disabled:cursor-default",
        buttonClass,
        stateStyles[copyState],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {copyState === "idle"   && <IconCopy  size={iconSize} />}
      {copyState === "copied" && <IconCheck size={iconSize} />}
      {copyState === "error"  && <IconError size={iconSize} />}
    </button>
  );
}

export default CopyButton;
