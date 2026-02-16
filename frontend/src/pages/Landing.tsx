// frontend/src/pages/Landing.tsx
//
// Route: /
// Layout: LandingLayout (provides the fixed topnav)
//
// Sections:
//   1. Hero          — headline, sub-copy, CTAs
//   2. Stats strip   — 3 protocol constants
//   3. How it works  — 5-step protocol flow  (#how-it-works)
//   4. Privacy note  — brief trust statement  (#privacy)

import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAccount } from "wagmi";

import {
  DEFAULT_VALIDITY_WINDOW_SECONDS,
  MERKLE_TREE_DEPTH,
  PROOF_PUBLIC_INPUT_COUNT,
  SUPPORTED_CHAIN_NAME,
} from "@/lib/constants";

// ---------------------------------------------------------------------------
// Scroll-reveal hook — triggers once when element enters viewport
// ---------------------------------------------------------------------------

function useInView(threshold = 0.15) {
  const ref  = useRef<HTMLDivElement>(null);
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
// Section: Hero
// ---------------------------------------------------------------------------

function HeroSection({ isConnected }: { isConnected: boolean }) {
  return (
    <section
      className="relative flex min-h-[calc(100dvh-64px)] flex-col items-center justify-center px-4 py-24 text-center sm:px-6"
      aria-label="Hero"
    >
      {/* Subtle radial glow behind the headline */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[60%] opacity-30"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 0%, oklch(0.55 0.12 192 / 0.18), transparent)",
        }}
        aria-hidden="true"
      />

      {/* Testnet badge */}
      <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/80 px-3 py-1 backdrop-blur-sm">
        <span className="h-1.5 w-1.5 rounded-full bg-teal-500" aria-hidden="true" />
        <span className="font-mono text-[11px] font-medium text-zinc-500">
          Live on {SUPPORTED_CHAIN_NAME} testnet
        </span>
      </div>

      {/* Headline */}
      <h1 className="mx-auto max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight text-zinc-100 sm:text-5xl md:text-6xl">
        Prove compliance.{" "}
        <span className="text-teal-400">Reveal nothing.</span>
      </h1>

      {/* Sub-copy */}
      <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-zinc-500 sm:text-lg">
        NullProof generates a zero-knowledge proof that your wallet is not on any
        sanctions list — without exposing your address to the verifier.
      </p>

      {/* CTAs */}
      <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
        <Link
          to="/app/dashboard"
          className={[
            "inline-flex items-center gap-2 rounded-xl px-5 py-2.5",
            "bg-teal-600 text-sm font-semibold text-white",
            "transition-colors duration-150 hover:bg-teal-500",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",
          ].join(" ")}
        >
          {isConnected ? "Go to dashboard" : "Launch app"}
          <ArrowRightIcon className="h-3.5 w-3.5" />
        </Link>

        <a
          href="#how-it-works"
          onClick={(e) => {
            e.preventDefault();
            document
              .getElementById("how-it-works")
              ?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
          className={[
            "inline-flex items-center gap-2 rounded-xl px-5 py-2.5",
            "border border-zinc-800 bg-zinc-900/60 text-sm font-medium text-zinc-400",
            "transition-colors duration-150 hover:border-zinc-700 hover:text-zinc-200",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-600",
          ].join(" ")}
        >
          How it works
          <ChevronDownIcon className="h-3.5 w-3.5" />
        </a>
      </div>

      {/* Shield diagram */}
      <div className="mt-20 flex items-center justify-center" aria-hidden="true">
        <ShieldDiagram />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Shield diagram — animated inline SVG
// ---------------------------------------------------------------------------

function ShieldDiagram() {
  return (
    <div className="relative flex items-center justify-center">
      {/* Outer ring pulse */}
      <div className="absolute h-48 w-48 rounded-full border border-teal-500/10 animate-[ringPulse_3s_ease-in-out_infinite]" />
      <div className="absolute h-36 w-36 rounded-full border border-teal-500/15 animate-[ringPulse_3s_ease-in-out_infinite_0.5s]" />

      {/* Shield */}
      <div className="relative flex h-24 w-24 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900/80 shadow-lg backdrop-blur-sm">
        <svg
          width="44"
          height="44"
          viewBox="0 0 32 32"
          fill="none"
          className="text-teal-400"
        >
          <path
            d="M16 2L4 7v8c0 8 5.4 13.5 12 15 6.6-1.5 12-7 12-15V7L16 2z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M10.5 16l3.5 3.5 7.5-7"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {/* Floating labels */}
      <FloatingLabel text="ZK Proof" top="-top-3" left="-left-20" delay="0s" />
      <FloatingLabel text="No address" top="top-10"  left="-left-24" delay="0.4s" />
      <FloatingLabel text="On-chain"   top="-top-3"  left="left-20"  delay="0.8s" />
      <FloatingLabel text="24 h valid" top="top-10"  left="left-20"  delay="1.2s" />

      <style>{`
        @keyframes ringPulse {
          0%, 100% { opacity: 0.4; transform: scale(1);    }
          50%       { opacity: 0.8; transform: scale(1.05); }
        }
        @keyframes floatUp {
          0%, 100% { transform: translateY(0px);   }
          50%       { transform: translateY(-4px);  }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes ringPulse { from {} to {} }
          @keyframes floatUp   { from {} to {} }
        }
      `}</style>
    </div>
  );
}

function FloatingLabel({
  text,
  top,
  left,
  delay,
}: {
  text:  string;
  top:   string;
  left:  string;
  delay: string;
}) {
  return (
    <span
      className={[
        "absolute whitespace-nowrap rounded-full border border-zinc-800",
        "bg-zinc-900/90 px-2 py-0.5 font-mono text-[9px] font-medium text-zinc-600",
        top,
        left,
      ].join(" ")}
      style={{
        animation: `floatUp 3s ease-in-out ${delay} infinite`,
      }}
    >
      {text}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Section: Stats strip
// ---------------------------------------------------------------------------

interface Stat {
  value:   string;
  label:   string;
  detail:  string;
}

const STATS: Stat[] = [
  {
    value:  String(MERKLE_TREE_DEPTH),
    label:  "Merkle tree depth",
    detail: `2^${MERKLE_TREE_DEPTH} leaf capacity — your deposit is one leaf`,
  },
  {
    value:  `${Number(DEFAULT_VALIDITY_WINDOW_SECONDS) / 3600}h`,
    label:  "Proof validity window",
    detail: "Proofs expire after 24 h to prevent replay attacks",
  },
  {
    value:  String(PROOF_PUBLIC_INPUT_COUNT),
    label:  "Public input exposed",
    detail: "Only the Merkle root — never your address or balance",
  },
];

function StatsSection() {
  const { ref, visible } = useInView();

  return (
    <section
      ref={ref}
      className="border-y border-zinc-800/60 bg-zinc-900/30 px-4 py-12 sm:px-6"
      aria-label="Protocol stats"
    >
      <div className="mx-auto grid max-w-4xl grid-cols-1 gap-8 sm:grid-cols-3">
        {STATS.map((stat, i) => (
          <div
            key={stat.label}
            className="flex flex-col items-center text-center transition-all duration-500"
            style={{
              opacity:   visible ? 1 : 0,
              transform: visible ? "translateY(0)" : "translateY(16px)",
              transitionDelay: `${i * 100}ms`,
            }}
          >
            <span className="font-mono text-4xl font-semibold tabular-nums text-teal-400">
              {stat.value}
            </span>
            <span className="mt-1 text-sm font-medium text-zinc-300">
              {stat.label}
            </span>
            <span className="mt-1.5 max-w-[22ch] text-xs leading-relaxed text-zinc-600">
              {stat.detail}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section: Protocol flow steps
// ---------------------------------------------------------------------------

interface FlowStep {
  number:  number;
  title:   string;
  body:    string;
  icon:    React.ReactNode;
  accent?: boolean; // highlight the ZK proof step
}

const FLOW_STEPS: FlowStep[] = [
  {
    number: 1,
    title:  "Connect wallet",
    body:   "Connect your Sepolia wallet. NullProof reads your address locally — it is never sent to any server.",
    icon:   <WalletIcon />,
  },
  {
    number: 2,
    title:  "Register a deposit",
    body:   "Commit a fixed-size deposit to the on-chain Incremental Merkle Tree. This inserts your address as a leaf.",
    icon:   <DepositIcon />,
  },
  {
    number: 3,
    title:  "Generate ZK proof",
    body:   "The in-browser UltraHonk prover builds a Noir circuit witness and produces a proof that your leaf exists in the tree without revealing which leaf.",
    icon:   <CircuitIcon />,
    accent: true,
  },
  {
    number: 4,
    title:  "Submit on-chain",
    body:   "The proof and a nullifier are submitted to the ComplianceGate contract. The on-chain UltraHonk verifier checks validity in a single transaction.",
    icon:   <ChainIcon />,
  },
  {
    number: 5,
    title:  "Compliance gate passes",
    body:   "For 24 hours, any third-party protocol can call complianceGate.isCompliant(yourAddress) and receive true — with zero knowledge of your balance or history.",
    icon:   <ShieldCheckIcon />,
  },
];

function FlowSection() {
  const { ref, visible } = useInView(0.1);

  return (
    <section
      id="how-it-works"
      ref={ref}
      className="px-4 py-24 sm:px-6"
      aria-labelledby="flow-heading"
    >
      <div className="mx-auto max-w-3xl">
        {/* Heading */}
        <div
          className="mb-14 transition-all duration-500"
          style={{
            opacity:   visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(12px)",
          }}
        >
          <h2
            id="flow-heading"
            className="text-2xl font-semibold tracking-tight text-zinc-100"
          >
            How it works
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-500">
            Five steps from wallet to on-chain compliance proof.
          </p>
        </div>

        {/* Steps */}
        <ol className="relative space-y-0" aria-label="Protocol flow steps">
          {FLOW_STEPS.map((step, i) => (
            <FlowStepItem
              key={step.number}
              step={step}
              isLast={i === FLOW_STEPS.length - 1}
              visible={visible}
              delay={i * 80}
            />
          ))}
        </ol>
      </div>
    </section>
  );
}

function FlowStepItem({
  step,
  isLast,
  visible,
  delay,
}: {
  step:    FlowStep;
  isLast:  boolean;
  visible: boolean;
  delay:   number;
}) {
  return (
    <li
      className="relative flex gap-5 transition-all duration-500"
      style={{
        opacity:         visible ? 1 : 0,
        transform:       visible ? "translateX(0)" : "translateX(-12px)",
        transitionDelay: `${delay}ms`,
      }}
    >
      {/* Connector line */}
      {!isLast && (
        <div
          className="absolute left-[18px] top-10 bottom-0 w-px bg-zinc-800"
          aria-hidden="true"
        />
      )}

      {/* Step icon column */}
      <div className="relative flex shrink-0 flex-col items-center">
        <div
          className={[
            "flex h-9 w-9 items-center justify-center rounded-xl border",
            "transition-colors duration-200",
            step.accent
              ? "border-teal-500/40 bg-teal-500/10 text-teal-400"
              : "border-zinc-800 bg-zinc-900 text-zinc-500",
          ].join(" ")}
        >
          {step.icon}
        </div>
      </div>

      {/* Content */}
      <div className="pb-10">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[10px] font-medium text-zinc-700">
            0{step.number}
          </span>
          <h3
            className={[
              "text-sm font-semibold",
              step.accent ? "text-teal-300" : "text-zinc-200",
            ].join(" ")}
          >
            {step.title}
          </h3>
        </div>
        <p className="mt-1.5 max-w-[52ch] text-sm leading-relaxed text-zinc-500">
          {step.body}
        </p>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Section: Privacy note
// ---------------------------------------------------------------------------

function PrivacySection() {
  const { ref, visible } = useInView();

  return (
    <section
      id="privacy"
      ref={ref}
      className="border-t border-zinc-800/60 px-4 py-20 sm:px-6"
      aria-labelledby="privacy-heading"
    >
      <div
        className="mx-auto max-w-2xl text-center transition-all duration-500"
        style={{
          opacity:   visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(12px)",
        }}
      >
        {/* Lock icon */}
        <div className="mb-5 inline-flex items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3">
          <LockIcon className="h-5 w-5 text-teal-400" />
        </div>

        <h2
          id="privacy-heading"
          className="text-xl font-semibold tracking-tight text-zinc-100"
        >
          Your address stays private
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-zinc-500">
          The ZK proof exposes exactly one bit of information: that your wallet
          is <em className="text-zinc-400 not-italic">not</em> on the sanctions
          list. No balance, no history, no address — only a cryptographic
          attestation valid for {Number(DEFAULT_VALIDITY_WINDOW_SECONDS) / 3600} hours.
        </p>

        {/* Trust markers */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-6">
          {[
            "Open source",
            "Noir circuit",
            "UltraHonk prover",
            "No backend wallet access",
          ].map((item) => (
            <div key={item} className="flex items-center gap-1.5 text-xs text-zinc-600">
              <CheckIcon className="h-3 w-3 text-teal-600" />
              {item}
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
    <footer className="border-t border-zinc-800/60 px-4 py-8 sm:px-6">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-3 text-center sm:flex-row sm:justify-between sm:text-left">
        <span className="text-xs text-zinc-700">
          NullProof — {SUPPORTED_CHAIN_NAME} testnet · Not audited · Use at your own risk
        </span>
        <a
          href="https://github.com/vamshiganesh/NullProof"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-zinc-700 transition-colors hover:text-zinc-400 focus-visible:outline-none"
        >
          View source on GitHub ↗
        </a>
      </div>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// Inline SVG icon components
// ---------------------------------------------------------------------------

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 6h8M6 2l4 4-4 4" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 4l4 4 4-4" />
    </svg>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="7.5" width="10" height="7" rx="1.5" />
      <path d="M5.5 7.5V5a2.5 2.5 0 0 1 5 0v2.5" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 10 10" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1.5 5l2.5 2.5 4.5-4" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="1.5" y="4.5" width="13" height="9" rx="1.5" />
      <path d="M1.5 7.5h13" />
      <circle cx="11.5" cy="10.5" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  );
}

function DepositIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 2v9M4.5 7.5L8 11l3.5-3.5" />
      <path d="M2.5 13.5h11" />
    </svg>
  );
}

function CircuitIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="3.5" cy="3.5" r="1.5" />
      <circle cx="12.5" cy="3.5" r="1.5" />
      <circle cx="3.5" cy="12.5" r="1.5" />
      <circle cx="12.5" cy="12.5" r="1.5" />
      <circle cx="8" cy="8" r="2" />
      <path d="M5 3.5h2M9 3.5h2M3.5 5v2M3.5 9v2M5 12.5h2M9 12.5h2M12.5 5v2M12.5 9v2" />
    </svg>
  );
}

function ChainIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6.5 9.5a3.535 3.535 0 0 0 5 0l2-2a3.536 3.536 0 0 0-5-5L7 4" />
      <path d="M9.5 6.5a3.535 3.535 0 0 0-5 0l-2 2a3.536 3.536 0 0 0 5 5L9 12" />
    </svg>
  );
}

function ShieldCheckIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 1.5L2 4v5c0 4 2.7 6.5 6 7.5 3.3-1 6-3.5 6-7.5V4L8 1.5z" />
      <path d="M5.5 8.5l2 2 3.5-3.5" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Landing page
// ---------------------------------------------------------------------------

export function Landing() {
  const { isConnected } = useAccount();

  return (
    <div className="text-zinc-200">
      <HeroSection    isConnected={isConnected} />
      <StatsSection />
      <FlowSection />
      <PrivacySection />
      <Footer />
    </div>
  );
}

export default Landing;