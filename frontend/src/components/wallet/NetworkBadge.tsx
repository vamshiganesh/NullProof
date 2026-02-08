// frontend/src/components/wallet/NetworkBadge.tsx

import React from "react";
import { useChainId, useSwitchChain } from "wagmi";
import { sepolia } from "wagmi/chains";

import {
  SUPPORTED_CHAIN_ID,
  SUPPORTED_CHAIN_NAME,
} from "@/lib/constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NetworkBadgeProps {
  className?: string;
}

// ---------------------------------------------------------------------------
// Sepolia icon — simple SVG mark
// ---------------------------------------------------------------------------

function SepoliaIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      fill="none"
      aria-hidden="true"
    >
      {/* Ethereum diamond */}
      <polygon
        points="8,2 13,8 8,10.5 3,8"
        fill="currentColor"
        opacity="0.9"
      />
      <polygon
        points="8,10.5 13,8 8,14 3,8"
        fill="currentColor"
        opacity="0.5"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// NetworkBadge
// ---------------------------------------------------------------------------

export function NetworkBadge({ className = "" }: NetworkBadgeProps) {
  const chainId             = useChainId();
  const { switchChain, isPending } = useSwitchChain();

  const isCorrectNetwork = chainId === SUPPORTED_CHAIN_ID;

  // ── Wrong network ────────────────────────────────────────────────────────
  if (!isCorrectNetwork) {
    return (
      <button
        onClick={() => switchChain({ chainId: sepolia.id })}
        disabled={isPending}
        aria-label={`Wrong network — click to switch to ${SUPPORTED_CHAIN_NAME}`}
        className={[
          "inline-flex items-center gap-1.5 rounded-xl",
          "border border-rose-500/40 bg-rose-500/10",
          "px-2.5 py-1.5 text-xs font-medium text-rose-400",
          "hover:bg-rose-500/20 hover:border-rose-500/60",
          "active:bg-rose-500/25",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "transition-all duration-150",
          "focus-visible:outline-none focus-visible:ring-2",
          "focus-visible:ring-rose-500 focus-visible:ring-offset-2",
          "focus-visible:ring-offset-zinc-950",
          className,
        ].join(" ")}
      >
        {/* Warning icon */}
        <svg
          viewBox="0 0 16 16"
          className="h-3 w-3 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M8 2L14 13H2L8 2Z" />
          <line x1="8" y1="7" x2="8" y2="9.5" />
          <circle cx="8" cy="11.5" r="0.5" fill="currentColor" />
        </svg>

        {isPending ? "Switching…" : "Wrong Network"}
      </button>
    );
  }

  // ── Correct network (Sepolia) ─────────────────────────────────────────────
  return (
    <div
      role="status"
      aria-label={`Connected to ${SUPPORTED_CHAIN_NAME}`}
      className={[
        "inline-flex items-center gap-1.5 rounded-xl",
        "border border-zinc-700/60 bg-zinc-900",
        "px-2.5 py-1.5 text-xs font-medium text-zinc-400",
        className,
      ].join(" ")}
    >
      <SepoliaIcon className="h-3 w-3 shrink-0 text-violet-400" />
      {SUPPORTED_CHAIN_NAME}
    </div>
  );
}

export default NetworkBadge;