import React, { useState, useCallback } from "react";
import { NavLink }                       from "react-router-dom";

import { StatusDot, Tooltip }            from "@/components/ui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WalletBadgeProps {
  address?:  string;
  /** ENS name, if resolved. */
  ens?:      string;
  connected: boolean;
  balance?:  string;
  onConnect:    () => void;
  onDisconnect: () => void;
}

export interface TopNavProps {
  wallet:         WalletBadgeProps;
  networkLabel?:  string;
  networkState?:  "live" | "pending" | "error" | "idle" | "warning";
  /** Show hamburger menu button on mobile (calls back to parent to open sidebar). */
  onMenuOpen?:    () => void;
  className?:     string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncateAddress(addr: string): string {
  if (addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// Nav links (shared with mobile menu)
// ---------------------------------------------------------------------------

const NAV_LINKS = [
  { label: "Dashboard",  to: "/",           end: true  },
  { label: "ZK-Proofs",  to: "/proofs"                 },
  { label: "Compliance", to: "/compliance"              },
  { label: "Audits",     to: "/audits"                  },
  { label: "Settings",   to: "/settings"                },
];

// ---------------------------------------------------------------------------
// Logo SVG
// ---------------------------------------------------------------------------

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      {/* Shield icon */}
      <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 shadow-[0_0_16px_rgba(16,185,129,0.12)]">
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 3l7 4v5c0 4.4-2.6 7.6-7 9-4.4-1.4-7-4.6-7-9V7l7-4z" />
          <path d="M8.5 12.5l2.2 2.2 4.8-5" />
        </svg>
      </div>

      <span className="text-sm font-semibold tracking-tight text-zinc-100">
        NullProof
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wallet badge
// ---------------------------------------------------------------------------

function WalletBadge({
  address,
  ens,
  connected,
  balance,
  onConnect,
  onDisconnect,
}: WalletBadgeProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const display = ens ?? (address ? truncateAddress(address) : null);

  if (!connected || !display) {
    return (
      <button
        onClick={onConnect}
        className={[
          "inline-flex items-center gap-2",
          "rounded-xl border border-emerald-500/30 bg-emerald-500/10",
          "px-3 py-1.5",
          "text-xs font-medium text-emerald-400",
          "hover:bg-emerald-500/20 hover:border-emerald-500/50",
          "active:bg-emerald-500/25",
          "transition-all duration-150 ease-out",
          "focus-visible:outline-none focus-visible:ring-2",
          "focus-visible:ring-emerald-400 focus-visible:ring-offset-2",
          "focus-visible:ring-offset-zinc-950",
        ].join(" ")}
      >
        {/* Wallet icon */}
        <svg
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <path d="M16 12h2" />
        </svg>
        Connect Wallet
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setMenuOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className={[
          "inline-flex items-center gap-2",
          "rounded-xl border border-zinc-700 bg-zinc-900",
          "px-3 py-1.5",
          "text-xs font-medium text-zinc-200",
          "hover:bg-zinc-800 hover:border-zinc-600",
          "active:bg-zinc-700",
          "transition-all duration-150 ease-out",
          "focus-visible:outline-none focus-visible:ring-2",
          "focus-visible:ring-zinc-500 focus-visible:ring-offset-2",
          "focus-visible:ring-offset-zinc-950",
        ].join(" ")}
      >
        {/* Connected dot */}
        <StatusDot state="live" size="xs" label="Wallet connected" />

        <span className="font-mono">{display}</span>

        {balance && (
          <>
            <span className="text-zinc-600">·</span>
            <span className="font-mono text-zinc-400">{balance}</span>
          </>
        )}

        {/* Chevron */}
        <svg
          viewBox="0 0 16 16"
          className={[
            "h-3 w-3 text-zinc-500 transition-transform duration-150",
            menuOpen ? "rotate-180" : "",
          ].join(" ")}
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

      {/* Dropdown */}
      {menuOpen && (
        <div
          role="menu"
          className={[
            "absolute right-0 top-full mt-2 z-50",
            "w-48 rounded-xl border border-zinc-800 bg-zinc-900",
            "shadow-xl shadow-black/40",
            "py-1",
            "animate-[tooltipIn_120ms_ease-out_forwards]",
          ].join(" ")}
        >
          {/* Address row */}
          {address && (
            <div className="border-b border-zinc-800 px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-600">
                Address
              </p>
              <p className="mt-0.5 font-mono text-xs text-zinc-300 select-all">
                {truncateAddress(address)}
              </p>
            </div>
          )}

          {/* Disconnect */}
          <button
            role="menuitem"
            onClick={() => { setMenuOpen(false); onDisconnect(); }}
            className={[
              "flex w-full items-center gap-2 px-3 py-2",
              "text-xs text-zinc-400",
              "hover:bg-zinc-800 hover:text-rose-400",
              "transition-colors duration-150",
              "focus-visible:outline-none focus-visible:bg-zinc-800",
            ].join(" ")}
          >
            {/* Disconnect icon */}
            <svg
              viewBox="0 0 16 16"
              className="h-3.5 w-3.5 shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M10 8H2M6 5l-3 3 3 3" />
              <path d="M7 3h5a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H7" />
            </svg>
            Disconnect
          </button>
        </div>
      )}

      {/* Click-outside dismiss */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-40"
          aria-hidden="true"
          onClick={() => setMenuOpen(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings icon button
// ---------------------------------------------------------------------------

function SettingsButton() {
  return (
    <Tooltip content="Settings" side="bottom" delayMs={300}>
      <NavLink
        to="/settings"
        className={({ isActive }) =>
          [
            "inline-flex items-center justify-center",
            "h-8 w-8 rounded-xl",
            "transition-all duration-150 ease-out",
            "focus-visible:outline-none focus-visible:ring-2",
            "focus-visible:ring-zinc-500 focus-visible:ring-offset-2",
            "focus-visible:ring-offset-zinc-950",
            isActive
              ? "bg-zinc-800 text-zinc-100"
              : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200",
          ].join(" ")
        }
        aria-label="Settings"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 0 1-4 0v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a2 2 0 0 1 0-4h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a2 2 0 0 1 4 0v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6H20a2 2 0 0 1 0 4h-.2a1 1 0 0 0-.9.6z" />
        </svg>
      </NavLink>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// Mobile menu
// ---------------------------------------------------------------------------

function MobileMenu({
  open,
  onClose,
}: {
  open:    boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-zinc-950/80 backdrop-blur-sm lg:hidden"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Drawer */}
      <nav
        aria-label="Mobile navigation"
        className={[
          "fixed inset-y-0 left-0 z-50 w-64",
          "flex flex-col border-r border-zinc-800 bg-zinc-950",
          "lg:hidden",
          "animate-[tooltipIn_150ms_ease-out_forwards]",
        ].join(" ")}
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-4">
          <Logo />
          <button
            onClick={onClose}
            aria-label="Close navigation menu"
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>

        <ul className="flex-1 space-y-1 overflow-y-auto px-3 py-4" role="list">
          {NAV_LINKS.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end ?? false}
                onClick={onClose}
                className={({ isActive }) =>
                  [
                    "flex items-center rounded-xl px-3 py-2.5 text-sm font-medium",
                    "transition-all duration-150 ease-out",
                    "focus-visible:outline-none focus-visible:ring-2",
                    "focus-visible:ring-emerald-400 focus-visible:ring-offset-1",
                    "focus-visible:ring-offset-zinc-950",
                    isActive
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100",
                  ].join(" ")
                }
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}

// ---------------------------------------------------------------------------
// TopNav
// ---------------------------------------------------------------------------

export function TopNav({
  wallet,
  networkLabel = "Sepolia",
  networkState = "live",
  onMenuOpen,
  className    = "",
}: TopNavProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleMenuOpen = useCallback(() => {
    setMobileOpen(true);
    onMenuOpen?.();
  }, [onMenuOpen]);

  return (
    <>
      <header
        className={[
          "sticky top-0 z-30",
          "flex h-14 items-center gap-4",
          "border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-xl",
          "px-4 lg:px-6",
          className,
        ].join(" ")}
      >
        {/* Mobile: hamburger */}
        <button
          onClick={handleMenuOpen}
          aria-label="Open navigation menu"
          className={[
            "lg:hidden",
            "inline-flex items-center justify-center h-8 w-8 rounded-xl",
            "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200",
            "transition-colors duration-150",
            "focus-visible:outline-none focus-visible:ring-2",
            "focus-visible:ring-zinc-500 focus-visible:ring-offset-2",
            "focus-visible:ring-offset-zinc-950",
          ].join(" ")}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* Logo — visible on mobile only (desktop shows it in Sidebar) */}
        <div className="lg:hidden">
          <Logo />
        </div>

        {/* Desktop: nav links (optional — hidden if sidebresent) */}
        <nav aria-label="Top navigation" className="hidden xl:flex items-center gap-1 ml-2">
          {NAV_LINKS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end ?? false}
              className={({ isActive }) =>
                [
                  "px-3 py-1.5 rounded-lg text-sm font-medium",
                  "transition-all duration-150 ease-out",
                  "focus-visible:outline-none focus-visible:ring-2",
                  "focus-visible:ring-zinc-500 focus-visible:ring-offset-1",
                  "focus-visible:ring-offset-zinc-950",
                  isActive
                    ? "text-zinc-100 bg-zinc-800"
                    : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60",
                ].join(" ")
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right side: network + wallet + settings */}
        <div className="flex items-center gap-3">
          {/* Network pill */}
          <div className="hidden sm:flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/80 px-2.5 py-1.5">
            <StatusDot
              state={networkState}
              size="xs"
              label={`Network: ${networkLabel}`}
            />
            <span className="font-mono text-[11px] text-zinc-400">
              {networkLabel}
            </span>
          </div>

          {/* Wallet badge */}
          <WalletBadge {...wallet} />

          {/* Settings icon */}
          <SettingsButton />
        </div>
      </header>

      {/* Mobile drawer */}
      <MobileMenu
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />
    </>
  );
}

export default TopNav;
