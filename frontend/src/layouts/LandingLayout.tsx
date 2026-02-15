// frontend/src/layouts/LandingLayout.tsx
//
// Minimal shell for the landing page (/).
//
// Structure:
//   ┌────────────────────────────────────────────────┐
//   │  Topnav (64px)                                 │
//   │  Logo | nav links (desktop) | CTA + connect    │
//   ├────────────────────────────────────────────────┤
//   │                                                │
//   │  <Outlet />  (full-width, scrolls naturally)   │
//   │                                                │
//   └────────────────────────────────────────────────┘
//
// Nav links:
//   How it works  →  /#how-it-works  (hash scroll)
//   Privacy       →  /#privacy
//   GitHub        →  external repo link
//
// Right slot:
//   • "Launch app" CTA  → /app/dashboard   (shown when not connected)
//   • ConnectWalletButton                  (always shown)
//
// Mobile (<768px):
//   Nav links collapse into a hamburger menu (full-width dropdown panel)
//
// Scroll behaviour:
//   • Navbar transitions from transparent (at page top) to
//     bg-zinc-950/90 + backdrop-blur after scrolling 40px
//   • Smooth scroll for hash links

import React, { useEffect, useRef, useState } from "react";
import { Link, Outlet } from "react-router-dom";
import { useAccount } from "wagmi";

import { ConnectWalletButton } from "@/components/wallet";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NAV_H        = 64;    // px — topnav height
const SCROLL_THRESHOLD = 40; // px — when to apply solid nav background

const GITHUB_URL =
  "https://github.com/vamshiganesh/NullProof";

// ---------------------------------------------------------------------------
// Nav links
// ---------------------------------------------------------------------------

interface NavLink {
  label:    string;
  href:     string;
  external?: boolean;
}

const NAV_LINKS: NavLink[] = [
  { label: "How it works", href: "/#how-it-works"  },
  { label: "Privacy",      href: "/#privacy"        },
  {
    label:    "GitHub",
    href:     GITHUB_URL,
    external: true,
  },
];

// ---------------------------------------------------------------------------
// Logo mark (same shape as AppLayout for brand consistency)
// ---------------------------------------------------------------------------

function LogoMark({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M16 2L4 7v8c0 8 5.4 13.5 12 15 6.6-1.5 12-7 12-15V7L16 2z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-teal-500"
      />
      <path
        d="M10.5 16l3.5 3.5 7.5-7"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-teal-400"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// GitHub icon
// ---------------------------------------------------------------------------

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// External link icon
// ---------------------------------------------------------------------------

function ExternalIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 10 10"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 2H2.5a1 1 0 0 0-1 1v4.5a1 1 0 0 0 1 1H7a1 1 0 0 0 1-1V6" />
      <path d="M6 1H9v3M9 1 5.5 4.5" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Smooth-scroll handler for hash links
// ---------------------------------------------------------------------------

function handleHashClick(
  e: React.MouseEvent<HTMLAnchorElement>,
  href: string,
) {
  if (!href.startsWith("/#")) return;
  const id = href.slice(2);
  const el = document.getElementById(id);
  if (!el) return;
  e.preventDefault();
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---------------------------------------------------------------------------
// Desktop nav link
// ---------------------------------------------------------------------------

function DesktopNavLink({ link }: { link: NavLink }) {
  if (link.external) {
    return (
      <a
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        className={[
          "flex items-center gap-1 text-[13px] font-medium",
          "text-zinc-500 transition-colors duration-150 hover:text-zinc-200",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-600 rounded",
        ].join(" ")}
      >
        {link.label === "GitHub" && (
          <GitHubIcon className="h-3.5 w-3.5" />
        )}
        {link.label}
        {link.label !== "GitHub" && (
          <ExternalIcon className="h-2 w-2 opacity-60" />
        )}
      </a>
    );
  }

  return (
    <a
      href={link.href}
      onClick={(e) => handleHashClick(e, link.href)}
      className={[
        "text-[13px] font-medium",
        "text-zinc-500 transition-colors duration-150 hover:text-zinc-200",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-600 rounded",
      ].join(" ")}
    >
      {link.label}
    </a>
  );
}

// ---------------------------------------------------------------------------
// Mobile nav panel
// ---------------------------------------------------------------------------

function MobileNavPanel({
  open,
  onClose,
  isConnected,
}: {
  open:        boolean;
  onClose:     () => void;
  isConnected: boolean;
}) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Navigation menu"
      className={[
        "absolute inset-x-0 top-full z-50 border-b border-zinc-800",
        "bg-zinc-950/95 backdrop-blur-md",
        "transition-all duration-200 ease-out overflow-hidden",
        open ? "max-h-80 opacity-100" : "max-h-0 opacity-0 pointer-events-none",
      ].join(" ")}
    >
      <nav className="flex flex-col gap-1 px-4 py-3">
        {NAV_LINKS.map((link) => {
          if (link.external) {
            return (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onClose}
                className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-800/60 hover:text-zinc-200"
              >
                {link.label === "GitHub" && (
                  <GitHubIcon className="h-4 w-4" />
                )}
                {link.label}
                <ExternalIcon className="ml-auto h-2.5 w-2.5 opacity-50" />
              </a>
            );
          }

          return (
            <a
              key={link.href}
              href={link.href}
              onClick={(e) => {
                handleHashClick(e, link.href);
                onClose();
              }}
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-800/60 hover:text-zinc-200"
            >
              {link.label}
            </a>
          );
        })}

        {/* Launch app — only when not connected */}
        {!isConnected && (
          <div className="mt-2 border-t border-zinc-800 pt-3">
            <Link
              to="/app/dashboard"
              onClick={onClose}
              className={[
                "flex w-full items-center justify-center gap-2 rounded-xl",
                "bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white",
                "transition-colors hover:bg-teal-500 active:scale-[0.99]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",
              ].join(" ")}
            >
              Launch app
              <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M2 6h8M6 2l4 4-4 4" />
              </svg>
            </Link>
          </div>
        )}
      </nav>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LandingLayout
// ---------------------------------------------------------------------------

export function LandingLayout() {
  const { isConnected } = useAccount();

  // ── Scroll-based nav opacity ───────────────────────────────────────────
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > SCROLL_THRESHOLD);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // ── Mobile menu ────────────────────────────────────────────────────────
  const [menuOpen, setMenuOpen] = useState(false);

  // Close menu on resize to desktop
  useEffect(() => {
    function onResize() {
      if (window.innerWidth >= 768) setMenuOpen(false);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const navRef = useRef<HTMLElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-200">

      {/* ── Topnav ──────────────────────────────────────────────────── */}
      <nav
        ref={navRef}
        className={[
          "fixed inset-x-0 top-0 z-40",
          "transition-all duration-300",
          scrolled || menuOpen
            ? "border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-md"
            : "border-b border-transparent bg-transparent",
        ].join(" ")}
        style={{ height: NAV_H }}
        aria-label="Site navigation"
      >
        <div className="mx-auto flex h-full max-w-6xl items-center justify-between gap-6 px-4 sm:px-6">

          {/* ── Logo ──────────────────────────────────────────────── */}
          <Link
            to="/"
            className="flex items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal-500/60"
            aria-label="NullProof home"
          >
            <LogoMark size={26} />
            <span className="text-sm font-semibold tracking-tight text-zinc-100">
              NullProof
            </span>
            {/* Testnet pill */}
            <span className="hidden rounded-full border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[9px] font-medium text-zinc-600 sm:inline">
              testnet
            </span>
          </Link>

          {/* ── Desktop nav links ─────────────────────────────────── */}
          <div className="hidden items-center gap-6 md:flex" aria-label="Primary links">
            {NAV_LINKS.map((link) => (
              <DesktopNavLink key={link.href} link={link} />
            ))}
          </div>

          {/* ── Right: CTA + wallet ───────────────────────────────── */}
          <div className="flex items-center gap-3">
            {/* Launch app — desktop only, hidden when connected */}
            {!isConnected && (
              <Link
                to="/app/dashboard"
                className={[
                  "hidden items-center gap-1.5 rounded-xl md:flex",
                  "border border-zinc-700 bg-zinc-900 px-3.5 py-1.5",
                  "text-[13px] font-semibold text-zinc-300",
                  "transition-colors duration-150 hover:border-zinc-600 hover:text-white",
                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",
                ].join(" ")}
              >
                Launch app
                <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2 5h6M5 2l3 3-3 3" />
                </svg>
              </Link>
            )}

            {/* Wallet connect button */}
            <ConnectWalletButton />

            {/* Mobile hamburger */}
            <button
              type="button"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              aria-controls="mobile-nav-panel"
              onClick={() => setMenuOpen((o) => !o)}
              className={[
                "flex h-9 w-9 items-center justify-center rounded-lg md:hidden",
                "text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-600",
              ].join(" ")}
            >
              {menuOpen ? (
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

        {/* ── Mobile dropdown panel ──────────────────────────────── */}
        <div id="mobile-nav-panel">
          <MobileNavPanel
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
            isConnected={isConnected}
          />
        </div>
      </nav>

      {/* ── Page content ────────────────────────────────────────────── */}
      {/* Offset for fixed nav */}
      <div style={{ paddingTop: NAV_H }}>
        <Outlet />
      </div>
    </div>
  );
}

export default LandingLayout;