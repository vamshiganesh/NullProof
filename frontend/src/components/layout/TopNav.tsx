// frontend/src/components/layout/TopNav.tsx
//
// App-shell top navigation bar.
// Full-width horizontal layout: logo | nav links | network badge | wallet

import React, { useState } from "react";
import { Link, NavLink }   from "react-router-dom";

import { StatusDot } from "@/components/ui";

// ---------------------------------------------------------------------------
// Public types (re-exported so App.tsx can import them)
// ---------------------------------------------------------------------------

export interface WalletBadgeProps {
  address?:     string;
  ens?:         string;
  connected:    boolean;
  balance?:     string;
  onConnect:    () => void;
  onDisconnect: () => void;
}

export interface TopNavProps {
  wallet:         WalletBadgeProps;
  networkLabel?:  string;
  networkState?:  "live" | "pending" | "error" | "idle" | "warning";
  onMenuOpen?:    () => void;
  className?:     string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NAV_H = 60;

const NAV_LINKS = [
  { label: "Dashboard",    to: "/app/dashboard"    },
  { label: "ZK Proofs",    to: "/app/proof"        },
  { label: "Ledger",       to: "/app/ledger"       },
  { label: "Radar",        to: "/app/radar"        },
  { label: "Screening",    to: "/app/screening"    },
  { label: "Protocol",     to: "/app/protocol"     },
  // { label: "Audits",       to: "/app/audits"       }, // v2 — hidden until Audit Log is built
  { label: "Integrations", to: "/app/integrations" },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncate(addr: string) {
  return addr.length < 12 ? addr : `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// WalletButton
// ---------------------------------------------------------------------------

function WalletButton({ wallet }: { wallet: WalletBadgeProps }) {
  const [open, setOpen] = useState(false);
  const display = wallet.ens ?? (wallet.address ? truncate(wallet.address) : null);

  if (!wallet.connected || !display) {
    return (
      <button
        onClick={wallet.onConnect}
        className={[
          "inline-flex items-center gap-2 rounded-lg",
          "bg-[#22c55e] px-3.5 py-1.5",
          "text-[12px] font-semibold text-white",
          "transition-colors hover:bg-[#16a34a]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22c55e]/50",
        ].join(" ")}
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="1.5" y="4.5" width="13" height="9" rx="1.5" />
          <path d="M1.5 8h13" />
          <circle cx="11" cy="10.5" r="0.8" fill="currentColor" stroke="none" />
        </svg>
        Connect Wallet
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={[
          "inline-flex items-center gap-2 rounded-lg",
          "border border-[#2e2e2e] bg-[#181818] px-3.5 py-1.5",
          "text-[12px] font-semibold text-[#e0e0e0]",
          "transition-colors hover:border-[#3e3e3e] hover:text-white",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#3e3e3e]",
        ].join(" ")}
      >
        <StatusDot state="live" size="xs" label="Wallet connected" />
        <span className="font-mono">{display}</span>
        <svg viewBox="0 0 12 12" className={["h-2.5 w-2.5 text-[#646464] transition-transform", open ? "rotate-180" : ""].join(" ")} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <path d="M2 4l4 4 4-4" />
        </svg>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            aria-hidden="true"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="absolute right-0 top-full z-50 mt-2 w-44 rounded-xl border border-[#262626] bg-[#161616] py-1 shadow-xl shadow-black/50"
          >
            {wallet.address && (
              <div className="border-b border-[#262626] px-3 py-2">
                <p className="text-[10px] uppercase tracking-widest text-[#646464]">Address</p>
                <p className="mt-0.5 select-all font-mono text-xs text-[#a0a0a0]">
                  {truncate(wallet.address)}
                </p>
              </div>
            )}
            <button
              role="menuitem"
              onClick={() => { setOpen(false); wallet.onDisconnect(); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-xs text-[#a0a0a0] transition-colors hover:bg-[#1f1f1f] hover:text-red-400 focus-visible:outline-none"
            >
              <svg viewBox="0 0 14 14" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 7H2M5.5 4.5L3 7l2.5 2.5" />
                <path d="M6 2.5h4.5a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H6" />
              </svg>
              Disconnect
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TopNav
// ---------------------------------------------------------------------------

export function TopNav({
  wallet,
  networkLabel = "Sepolia",
  networkState = "live",
  className    = "",
}: TopNavProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <header
        className={[
          "sticky top-0 z-40 shrink-0",
          "border-b border-[#1a1a1a] bg-[#0d0d0d]/95 backdrop-blur-md",
          className,
        ].join(" ")}
        style={{ height: NAV_H }}
      >
        <div className="mx-auto flex h-full max-w-[1400px] items-center gap-6 px-5 sm:px-8">

          {/* Logo */}
          <Link
            to="/"
            className="flex shrink-0 items-center gap-2 rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#22c55e]/60"
            aria-label="NullProof home"
          >
            <span className="text-[15px] font-bold tracking-tight text-white">NullProof</span>
            <span className="hidden rounded border border-[#262626] bg-[#1a1a1a] px-1.5 py-0.5 font-mono text-[9px] font-medium text-[#646464] sm:inline">
              testnet
            </span>
          </Link>

          {/* Desktop nav links */}
          <nav className="hidden flex-1 items-center gap-1 md:flex" aria-label="App navigation">
            {NAV_LINKS.map(({ label, to }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  [
                    "rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors",
                    isActive
                      ? "bg-[#1e1e1e] text-white"
                      : "text-[#a0a0a0] hover:text-white",
                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#3e3e3e]",
                  ].join(" ")
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>

          {/* Spacer on mobile */}
          <div className="flex-1 md:hidden" />

          {/* Right: network + wallet */}
          <div className="flex shrink-0 items-center gap-3">
            {/* Network badge */}
            <div className="hidden items-center gap-1.5 rounded-md border border-[#1e1e1e] bg-[#141414] px-2.5 py-1.5 sm:flex">
              <StatusDot state={networkState} size="xs" label={`Network: ${networkLabel}`} />
              <span className="font-mono text-[11px] text-[#646464]">{networkLabel}</span>
            </div>

            {/* Wallet */}
            <WalletButton wallet={wallet} />

            {/* Mobile hamburger */}
            <button
              type="button"
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen((v) => !v)}
              className="flex h-8 w-8 items-center justify-center rounded text-[#a0a0a0] transition-colors hover:bg-[#1a1a1a] hover:text-white md:hidden focus-visible:outline-none"
            >
              {mobileOpen ? (
                <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M3 3l10 10M13 3L3 13" />
                </svg>
              ) : (
                <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                  <path d="M2 4h12M2 8h12M2 12h12" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        <div
          className={[
            "overflow-hidden border-b border-[#1a1a1a] bg-[#0d0d0d]/98 backdrop-blur-md transition-all duration-200 md:hidden",
            mobileOpen ? "max-h-96" : "max-h-0",
          ].join(" ")}
        >
          <nav className="flex flex-col gap-0.5 px-4 py-3" aria-label="Mobile navigation">
            {NAV_LINKS.map(({ label, to }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  [
                    "rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive ? "bg-[#1e1e1e] text-white" : "text-[#a0a0a0] hover:text-white",
                  ].join(" ")
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
    </>
  );
}

export default TopNav;
