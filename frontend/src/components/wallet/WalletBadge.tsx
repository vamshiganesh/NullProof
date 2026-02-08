// frontend/src/components/wallet/WalletBadge.tsx

import React, { useState, useCallback } from "react";
import { useAccount, useDisconnect, useBalance } from "wagmi";

import { formatAddress, formatETH } from "@/lib/format";
import { BLOCK_EXPLORER_URL }        from "@/lib/constants";
import { StatusDot }                  from "@/components/ui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WalletBadgeProps {
  /** Show ETH balance inside the dropdown (default: true). */
  showBalance?: boolean;
  className?:   string;
}

// ---------------------------------------------------------------------------
// Copy-to-clipboard helper
// ---------------------------------------------------------------------------

function useCopy(text: string, ms = 1500) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), ms);
    } catch {
      // Clipboard blocked — silent fail
    }
  }, [text, ms]);

  return { copied, copy };
}

// ---------------------------------------------------------------------------
// Dropdown menu
// ---------------------------------------------------------------------------

function WalletDropdown({
  address,
  balance,
  onClose,
  onDisconnect,
}: {
  address:      string;
  balance?:     string;
  onClose:      () => void;
  onDisconnect: () => void;
}) {
  const { copied, copy } = useCopy(address);

  return (
    <>
      {/* Invisible backdrop — click outside to dismiss */}
      <div
        className="fixed inset-0 z-40"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        role="menu"
        aria-label="Wallet options"
        className={[
          "absolute right-0 top-full z-50 mt-1.5",
          "w-52 rounded-xl border border-zinc-800 bg-zinc-950",
          "shadow-xl shadow-black/50 py-1",
          "animate-[tooltipIn_120ms_ease-out_forwards]",
        ].join(" ")}
      >
        {/* Address + copy */}
        <div className="px-3 py-2 border-b border-zinc-800">
          <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-600 mb-1">
            Connected
          </p>
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs text-zinc-300 truncate">
              {formatAddress(address)}
            </span>
            <button
              role="menuitem"
              onClick={copy}
              aria-label={copied ? "Copied!" : "Copy address"}
              className={[
                "shrink-0 rounded-md p-1 text-zinc-500 transition-colors",
                "hover:bg-zinc-800 hover:text-zinc-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500",
                copied ? "text-emerald-400" : "",
              ].join(" ")}
            >
              {copied ? (
                // Checkmark
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 8l3.5 3.5L13 5" />
                </svg>
              ) : (
                // Copy
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="5" y="5" width="8" height="9" rx="1.5" />
                  <path d="M11 5V4a1.5 1.5 0 0 0-1.5-1.5h-6A1.5 1.5 0 0 0 2 4v7A1.5 1.5 0 0 0 3.5 12.5H5" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Balance row */}
        {balance && (
          <div className="px-3 py-2 border-b border-zinc-800">
            <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-600 mb-0.5">
              Balance
            </p>
            <p className="font-mono text-xs text-zinc-300">{balance}</p>
          </div>
        )}

        {/* View on Etherscan */}
        <a
          role="menuitem"
          href={`${BLOCK_EXPLORER_URL}/address/${address}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onClose}
          className={[
            "flex items-center gap-2 px-3 py-2 w-full",
            "text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100",
            "transition-colors focus-visible:outline-none focus-visible:ring-2",
            "focus-visible:ring-inset focus-visible:ring-zinc-500",
          ].join(" ")}
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M7 3H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V9" />
            <path d="M10 2h4v4" />
            <line x1="14" y1="2" x2="7" y2="9" />
          </svg>
          View on Etherscan
        </a>

        {/* Disconnect */}
        <button
          role="menuitem"
          onClick={() => { onDisconnect(); onClose(); }}
          className={[
            "flex items-center gap-2 px-3 py-2 w-full",
            "text-xs text-rose-400 hover:bg-zinc-800 hover:text-rose-300",
            "transition-colors focus-visible:outline-none focus-visible:ring-2",
            "focus-visible:ring-inset focus-visible:ring-zinc-500",
          ].join(" ")}
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
            <path d="M10 11l3-3-3-3" />
            <line x1="13" y1="8" x2="6" y2="8" />
          </svg>
          Disconnect
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// WalletBadge
// ---------------------------------------------------------------------------

export function WalletBadge({
  showBalance = true,
  className   = "",
}: WalletBadgeProps) {
  const { address, isConnected } = useAccount();
  const { disconnect }           = useDisconnect();
  const [open, setOpen]          = useState(false);

  const { data: balanceData } = useBalance({
    address,
    query: { enabled: isConnected && showBalance },
  });

  const balanceStr = balanceData
    ? formatETH(balanceData.value, 4)
    : undefined;

  // Not connected — render nothing (ConnectWalletButton takes the slot)
  if (!isConnected || !address) return null;

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Wallet ${formatAddress(address)} — click to open options`}
        className={[
          "inline-flex items-center gap-2 rounded-xl",
          "border border-zinc-700/60 bg-zinc-900",
          "px-3 py-1.5 text-xs font-medium text-zinc-200",
          "hover:bg-zinc-800 hover:border-zinc-600",
          "active:bg-zinc-700",
          "transition-all duration-150",
          "focus-visible:outline-none focus-visible:ring-2",
          "focus-visible:ring-zinc-500 focus-visible:ring-offset-2",
          "focus-visible:ring-offset-zinc-950",
        ].join(" ")}
      >
        {/* Green live dot */}
        <StatusDot state="live" size="xs" label="Wallet connected" />

        {/* Truncated address */}
        <span className="font-mono">{formatAddress(address)}</span>

        {/* Chevron */}
        <svg
          viewBox="0 0 16 16"
          className={`h-3 w-3 text-zinc-500 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>

      {open && (
        <WalletDropdown
          address={address}
          {...(showBalance && balanceStr
            ? { balance: balanceStr }
            : {})}
          onClose={() => setOpen(false)}
          onDisconnect={disconnect}
        />
      )}
    </div>
  );
}

export default WalletBadge;