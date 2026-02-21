// frontend/src/pages/Landing.tsx
//
// Route: /   (rendered standalone, no LandingLayout wrapper)
//
// Structure:
//   TopNav       — fixed header: logo | links | connect wallet
//   HeroSection  — kicker, headline, subtitle, CTAs
//   StatsSection — 3 metric cards
//   FlowSection  — "Protocol Flow" 3-step cards with watermark numbers
//   Footer       — copyright + links

import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAccount } from "wagmi";

import {
  DEFAULT_VALIDITY_WINDOW_SECONDS,
} from "@/lib/constants";
import { ConnectWalletButton } from "@/components/wallet";

const GITHUB_URL = "https://github.com/vamshiganesh/NullProof";

// ---------------------------------------------------------------------------
// Scroll-reveal hook
// ---------------------------------------------------------------------------

function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);

  return { ref, visible };
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={className} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 6h8M6 2l4 4-4 4" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// TopNav
// ---------------------------------------------------------------------------

const NAV_H = 60;
const SCROLL_THRESHOLD = 40;

function TopNav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > SCROLL_THRESHOLD);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    function onResize() {
      if (window.innerWidth >= 768) setMenuOpen(false);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <header
      className={[
        "fixed inset-x-0 top-0 z-50 transition-all duration-300",
        scrolled || menuOpen
          ? "border-b border-[#262626] bg-[#0d0d0d]/95 backdrop-blur-md"
          : "border-b border-transparent bg-transparent",
      ].join(" ")}
      style={{ height: NAV_H }}
    >
      <div className="mx-auto flex h-full max-w-6xl items-center justify-between gap-6 px-5 sm:px-8">

        {/* Logo */}
        <Link
          to="/"
          className="flex items-center gap-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#22c55e]/60 rounded"
          aria-label="NullProof home"
        >
          <span className="text-[15px] font-bold tracking-tight text-white">
            NullProof
          </span>
          <span className="hidden rounded border border-[#262626] bg-[#1a1a1a] px-1.5 py-0.5 font-mono text-[9px] font-medium text-[#646464] sm:inline">
            testnet
          </span>
        </Link>

        {/* Desktop links */}
        <nav className="hidden items-center gap-7 md:flex" aria-label="Site links">
          {[
            { label: "Documentation", href: "/#how-it-works" },
            { label: "GitHub", href: GITHUB_URL, external: true },
          ].map(({ label, href, external }) =>
            external ? (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-[13px] font-medium text-[#a0a0a0] transition-colors hover:text-white"
              >
                <GitHubIcon className="h-3.5 w-3.5" />
                {label}
              </a>
            ) : (
              <a
                key={label}
                href={href}
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className="text-[13px] font-medium text-[#a0a0a0] transition-colors hover:text-white"
              >
                {label}
              </a>
            ),
          )}
        </nav>

        {/* Right: connect wallet */}
        <div className="flex items-center gap-3">
          <ConnectWalletButton />

          {/* Mobile hamburger */}
          <button
            type="button"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
            className="flex h-8 w-8 items-center justify-center rounded text-[#a0a0a0] transition-colors hover:bg-[#1a1a1a] hover:text-white md:hidden"
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

      {/* Mobile dropdown */}
      <div
        className={[
          "overflow-hidden border-b border-[#262626] bg-[#0d0d0d]/98 backdrop-blur-md transition-all duration-200 md:hidden",
          menuOpen ? "max-h-52" : "max-h-0",
        ].join(" ")}
      >
        <div className="flex flex-col gap-1 px-5 py-3">
          <a
            href="/#how-it-works"
            onClick={(e) => {
              e.preventDefault();
              setMenuOpen(false);
              document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" });
            }}
            className="rounded px-2 py-2.5 text-sm font-medium text-[#a0a0a0] transition-colors hover:text-white"
          >
            Documentation
          </a>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setMenuOpen(false)}
            className="flex items-center gap-2 rounded px-2 py-2.5 text-sm font-medium text-[#a0a0a0] transition-colors hover:text-white"
          >
            <GitHubIcon className="h-4 w-4" />
            GitHub
          </a>
        </div>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// HeroSection
// ---------------------------------------------------------------------------

function HeroSection({ isConnected }: { isConnected: boolean }) {
  return (
    <section
      className="relative flex min-h-[calc(100dvh-60px)] flex-col items-center justify-center px-5 py-28 text-center sm:px-8"
      aria-label="Hero"
    >
      {/* Very subtle green glow at top */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[50%] opacity-20"
        style={{
          background: "radial-gradient(ellipse 70% 35% at 50% 0%, rgba(34,197,94,0.22), transparent)",
        }}
        aria-hidden="true"
      />

      {/* Kicker */}
      <p className="mb-6 font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-[#22c55e]">
        ZK Compliance Infrastructure
      </p>

      {/* Headline */}
      <h1 className="mx-auto max-w-2xl text-[2.6rem] font-bold leading-[1.08] tracking-tight text-white sm:text-[3.4rem] md:text-[4rem]">
        DeFi compliance that
        <br />
        <span>proves without revealing.</span>
      </h1>

      {/* Subtitle */}
      <p className="mx-auto mt-6 max-w-[50ch] text-base leading-[1.7] text-[#a0a0a0] sm:text-[17px]">
        Generate a zero-knowledge proof that your wallet is not on the OFAC
        sanctions list. Verified on-chain. Your address stays private.
      </p>

      {/* CTAs */}
      <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
        <Link
          to="/app/dashboard"
          className={[
            "inline-flex items-center gap-2 rounded-lg px-5 py-2.5",
            "bg-[#22c55e] text-[13px] font-semibold text-white",
            "transition-all duration-150 hover:bg-[#16a34a]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22c55e]/50",
          ].join(" ")}
        >
          {isConnected ? "Go to dashboard" : "Connect Wallet"}
          <ArrowRightIcon className="h-3 w-3" />
        </Link>

        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={[
            "inline-flex items-center gap-2 rounded-lg px-5 py-2.5",
            "border border-[#2e2e2e] bg-[#161616] text-[13px] font-semibold text-[#e0e0e0]",
            "transition-all duration-150 hover:border-[#3e3e3e] hover:text-white",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#3e3e3e]",
          ].join(" ")}
        >
          <GitHubIcon className="h-3.5 w-3.5" />
          View on GitHub
        </a>
      </div>

      {/* Trust caption */}
      <p className="mt-5 text-[12px] text-[#646464]">
        Proof generated locally. Nothing leaves your browser.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// StatsSection — 3 metric cards
// ---------------------------------------------------------------------------

interface StatItem {
  value:  string;
  label:  string;
  accent: boolean;
}

const STATS: StatItem[] = [
  {
    value:  "~3,400",
    label:  "Sanctioned ETH addresses",
    accent: true,
  },
  {
    value:  `${Number(DEFAULT_VALIDITY_WINDOW_SECONDS) / 3600}h`,
    label:  "Proof validity window",
    accent: false,
  },
  {
    value:  "<30s",
    label:  "Avg. proof generation time",
    accent: false,
  },
];

function StatsSection() {
  const { ref, visible } = useInView(0.1);

  return (
    <section
      ref={ref}
      className="border-y border-[#1e1e1e] px-5 py-12 sm:px-8"
      aria-label="Protocol metrics"
    >
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-px sm:grid-cols-3">
        {STATS.map((stat, i) => (
          <div
            key={stat.label}
            className={[
              "flex flex-col gap-1.5 px-8 py-8 transition-all duration-500",
              "border border-[#1e1e1e] bg-[#141414]",
              i === 0 ? "sm:rounded-l-xl" : "",
              i === STATS.length - 1 ? "sm:rounded-r-xl" : "",
            ].join(" ")}
            style={{
              opacity:         visible ? 1 : 0,
              transform:       visible ? "translateY(0)" : "translateY(16px)",
              transitionDelay: `${i * 80}ms`,
            }}
          >
            <span
              className={[
                "font-mono text-3xl font-bold tabular-nums sm:text-4xl",
                stat.accent ? "text-[#22c55e]" : "text-white",
              ].join(" ")}
            >
              {stat.value}
            </span>
            <span className="text-[13px] font-medium text-[#a0a0a0]">
              {stat.label}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// ProtocolFlowSection — 3-step cards with oversized watermark numbers
// ---------------------------------------------------------------------------

interface FlowCard {
  number: string;
  title:  string;
  body:   string;
}

const FLOW_CARDS: FlowCard[] = [
  {
    number: "01",
    title:  "Connect",
    body:   "Link your local wallet interface to initialize the ZK prover circuit.",
  },
  {
    number: "02",
    title:  "Prove",
    body:   "Client-side generation of cryptographic proof against the latest OFAC merkle root.",
  },
  {
    number: "03",
    title:  "Deposit",
    body:   "Submit proof on-chain to unlock compliant interactions with DeFi protocols.",
  },
];

function ProtocolFlowSection() {
  const { ref, visible } = useInView(0.1);

  return (
    <section
      id="how-it-works"
      ref={ref}
      className="px-5 py-20 sm:px-8"
      aria-labelledby="flow-heading"
    >
      <div className="mx-auto max-w-5xl">

        {/* Section heading row */}
        <div
          className="mb-10 flex items-center gap-5 transition-all duration-500"
          style={{
            opacity:   visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(10px)",
          }}
        >
          <h2
            id="flow-heading"
            className="shrink-0 font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-[#646464]"
          >
            Protocol Flow
          </h2>
          <div className="h-px flex-1 bg-[#1e1e1e]" />
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {FLOW_CARDS.map((card, i) => (
            <div
              key={card.number}
              className={[
                "relative overflow-hidden rounded-xl border border-[#1e1e1e] bg-[#141414] p-7",
                "transition-all duration-500",
              ].join(" ")}
              style={{
                opacity:         visible ? 1 : 0,
                transform:       visible ? "translateY(0)" : "translateY(20px)",
                transitionDelay: `${80 + i * 80}ms`,
              }}
            >
              {/* Content */}
              <div className="relative z-10 flex flex-col gap-3">
                <h3 className="text-[17px] font-bold tracking-tight text-white">
                  {card.title}
                </h3>
                <p className="max-w-[28ch] text-[13px] leading-relaxed text-[#a0a0a0]">
                  {card.body}
                </p>
              </div>

              {/* Watermark number */}
              <span
                className="pointer-events-none absolute bottom-3 right-4 select-none font-mono text-[100px] font-bold leading-none text-[#1e1e1e]"
                aria-hidden="true"
              >
                {card.number}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

function Footer() {
  return (
    <footer className="border-t border-[#1a1a1a] px-5 py-8 sm:px-8">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 text-center sm:flex-row sm:justify-between sm:text-left">

        {/* Brand */}
        <span className="text-[13px] font-bold text-white">NullProof</span>

        {/* Copyright */}
        <span className="text-[12px] text-[#646464]">
          © 2024 NullProof Protocol. All rights reserved.
        </span>

        {/* Links */}
        <nav className="flex items-center gap-5" aria-label="Footer links">
          {[
            { label: "Documentation", href: "/#how-it-works", external: false },
            { label: "GitHub",        href: GITHUB_URL,       external: true  },
          ].map(({ label, href, external }) =>
            external ? (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[12px] text-[#646464] transition-colors hover:text-white"
              >
                {label}
              </a>
            ) : (
              <a
                key={label}
                href={href}
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" });
                }}
                className="text-[12px] text-[#646464] transition-colors hover:text-white"
              >
                {label}
              </a>
            ),
          )}
        </nav>
      </div>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function Landing() {
  const { isConnected } = useAccount();

  return (
    <div className="min-h-dvh bg-[#0d0d0d] text-white">
      <TopNav />
      <main style={{ paddingTop: NAV_H }}>
        <HeroSection isConnected={isConnected} />
        <StatsSection />
        <ProtocolFlowSection />
      </main>
      <Footer />
    </div>
  );
}

export default Landing;
