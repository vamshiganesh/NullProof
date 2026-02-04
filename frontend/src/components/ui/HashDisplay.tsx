import React from "react";

import { CopyButton } from "./CopyButton";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HashDisplaySize = "xs" | "sm" | "md";

export interface HashDisplayProps {
  hash:           string;
  /** Number of chars to show at the start after "0x" (default: 6). */
  prefixChars?:   number;
  /** Number of chars to show at the end (default: 4). */
  suffixChars?:   number;
  /** Show the full hash with no truncation. */
  full?:          boolean;
  size?:          HashDisplaySize;
  /** Show copy button inline (default: true). */
  copyable?:      boolean;
  /** Wrap in an etherscan link for the given network. */
  etherscanUrl?:  string;
  className?:     string;
  /** Override the aria-label on the copy button. */
  copyLabel?:     string;
}

// ---------------------------------------------------------------------------
// Size map
// ---------------------------------------------------------------------------

const SIZE_STYLES: Record<HashDisplaySize, string> = {
  xs: "text-[10px] tracking-wide",
  sm: "text-xs     tracking-wide",
  md: "text-sm     tracking-normal",
};

const COPY_SIZE_MAP: Record<HashDisplaySize, "xs" | "sm" | "sm"> = {
  xs: "xs",
  sm: "xs",
  md: "sm",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncateHash(
  hash:        string,
  prefixChars: number,
  suffixChars: number,
): string {
  // Preserve the "0x" prefix, then show prefixChars + … + suffixChars
  const bare   = hash.startsWith("0x") ? hash.slice(2) : hash;
  const prefix = hash.startsWith("0x") ? "0x" : "";

  if (bare.length <= prefixChars + suffixChars) return hash;

  return `${prefix}${bare.slice(0, prefixChars)}…${bare.slice(-suffixChars)}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HashDisplay({
  hash,
  prefixChars  = 6,
  suffixChars  = 4,
  full         = false,
  size         = "sm",
  copyable     = true,
  etherscanUrl,
  className    = "",
  copyLabel,
}: HashDisplayProps) {
  const display = full ? hash : truncateHash(hash, prefixChars, suffixChars);

  const textNode = (
    <span
      className={[
        "font-mono text-zinc-300 tabular-nums",
        "select-all",            // one click selects the entire hash
        SIZE_STYLES[size],
      ].join(" ")}
      title={hash}              // full hash on hover
      aria-label={hash}
    >
      {display}
    </span>
  );

  const linkedText = etherscanUrl ? (
    <a
      href={etherscanUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={[
        "font-mono tabular-nums",
        "text-zinc-300 hover:text-emerald-400",
        "underline underline-offset-2 decoration-zinc-600 hover:decoration-emerald-500",
        "transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2",
        "focus-visible:ring-emerald-400 focus-visible:ring-offset-1",
        "focus-visible:ring-offset-zinc-900 rounded-sm",
        SIZE_STYLES[size],
      ].join(" ")}
      title={`View ${hash} on Etherscan`}
      aria-label={`View ${hash} on Etherscan (opens in new tab)`}
    >
      {display}
    </a>
  ) : null;

  return (
    <span
      className={[
        "inline-flex items-center gap-1.5",
        className,
      ].join(" ")}
    >
      {etherscanUrl ? linkedText : textNode}

      {copyable && (
        <CopyButton
          value={hash}
          size={COPY_SIZE_MAP[size]}
          ariaLabel={copyLabel ?? `Copy ${hash}`}
        />
      )}
    </span>
  );
}

export default HashDisplay;
