// frontend/src/components/shared/PrivacyGuarantee.tsx
//
// A self-contained panel explaining the four privacy guarantees that
// NullProof provides via its Indexed Merkle Tree + UltraHonk circuit design.
//
// Guarantees:
//   1. Address never revealed    — private circuit input, not in calldata
//   2. Nullifier prevents replay — one-time commitment, spent on-chain
//   3. Proof is local            — WASM prover runs entirely in the browser
//   4. Root-binding              — proof is bound to a specific IMT snapshot
//
// Used on:
//   • Dashboard idle / info section
//   • Expired proof screen (compact variant)
//   • Settings / About page
//
// Props:
//   • variant: "card" (default) — full bordered panel with header
//              "inline"         — borderless, flush with parent surface
//              "compact"        — 2-column grid, no descriptions
//   • showHeader: toggle the "Privacy guarantees" header row

import React, { useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Guarantee definitions
// ---------------------------------------------------------------------------

interface Guarantee {
  id:          string;
  title:       string;
  description: string;
  /** One-liner shown in compact mode */
  shortDesc:   string;
  color:       "teal" | "purple" | "blue" | "amber";
}

const GUARANTEES: Guarantee[] = [
  {
    id:          "address-private",
    title:       "Address never revealed",
    description:
      "Your wallet address is a private witness input to the Noir circuit. " +
      "It is never written to calldata, logs, or any on-chain storage — " +
      "only the ZK proof and nullifier leave your device.",
    shortDesc:   "Private circuit input — not in calldata or logs",
    color:       "teal",
  },
  {
    id:          "nullifier-replay",
    title:       "Nullifier prevents replay",
    description:
      "Each proof produces a unique nullifier derived from your address and " +
      "a secret. ComplianceGate marks it spent on first use, making the " +
      "proof permanently non-reusable without linking it back to you.",
    shortDesc:   "One-time commitment — spent on first submission",
    color:       "purple",
  },
  {
    id:          "local-proving",
    title:       "Proof generated locally",
    description:
      "Barretenberg's bb.js WASM prover runs entirely inside your browser. " +
      "No private inputs are ever sent to a server — the oracle only " +
      "returns the public Merkle witness path.",
    shortDesc:   "bb.js WASM prover — runs in your browser only",
    color:       "blue",
  },
  {
    id:          "root-binding",
    title:       "Root-bound snapshot",
    description:
      "The proof is cryptographically bound to the IMT Merkle root at " +
      "generation time. If the root changes (new addresses added), the " +
      "proof remains valid as long as the root is in the on-chain history.",
    shortDesc:   "Bound to a specific IMT snapshot root",
    color:       "amber",
  },
];

// ---------------------------------------------------------------------------
// Colour maps
// ---------------------------------------------------------------------------

type GColor = Guarantee["color"];

const ICON_WRAP: Record<GColor, string> = {
  teal:   "bg-teal-500/10   border-teal-500/20",
  purple: "bg-purple-500/10 border-purple-500/20",
  blue:   "bg-blue-500/10   border-blue-500/20",
  amber:  "bg-amber-500/10  border-amber-500/20",
};

const ICON_COLOR: Record<GColor, string> = {
  teal:   "text-teal-400",
  purple: "text-purple-400",
  blue:   "text-blue-400",
  amber:  "text-amber-400",
};

const TITLE_COLOR: Record<GColor, string> = {
  teal:   "text-teal-300",
  purple: "text-purple-300",
  blue:   "text-blue-300",
  amber:  "text-amber-300",
};

const SHORT_COLOR: Record<GColor, string> = {
  teal:   "text-teal-600",
  purple: "text-purple-600",
  blue:   "text-blue-600",
  amber:  "text-amber-600",
};

const DIVIDER_COLOR: Record<GColor, string> = {
  teal:   "bg-teal-500/15",
  purple: "bg-purple-500/15",
  blue:   "bg-blue-500/15",
  amber:  "bg-amber-500/15",
};

// ---------------------------------------------------------------------------
// Per-guarantee icons (inline SVG)
// ---------------------------------------------------------------------------

function GuaranteeIcon({ id, color }: { id: string; color: GColor }) {
  const cls = `h-4 w-4 ${ICON_COLOR[color]}`;

  switch (id) {
    case "address-private":
      return (
        <svg viewBox="0 0 16 16" className={cls} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {/* Eye with slash */}
          <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" />
          <circle cx="8" cy="8" r="1.8" />
          <line x1="2" y1="2" x2="14" y2="14" strokeWidth="1.8" />
        </svg>
      );
    case "nullifier-replay":
      return (
        <svg viewBox="0 0 16 16" className={cls} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {/* Link / chain broken */}
          <path d="M6 10l-1.5 1.5a2.12 2.12 0 0 1-3-3L4 7" />
          <path d="M10 6l1.5-1.5a2.12 2.12 0 0 1 3 3L13 9" />
          <line x1="6" y1="10" x2="10" y2="6" />
          <line x1="8.5" y1="4.5" x2="11.5" y2="4.5" strokeDasharray="1.5 1.5" />
        </svg>
      );
    case "local-proving":
      return (
        <svg viewBox="0 0 16 16" className={cls} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {/* Laptop / local device */}
          <rect x="2" y="3" width="12" height="8" rx="1.5" />
          <path d="M1 13h14" />
          <path d="M6 11v2M10 11v2" />
          <path d="M6.5 7l1.5 1.5 2-2.5" strokeWidth="1.6" />
        </svg>
      );
    case "root-binding":
      return (
        <svg viewBox="0 0 16 16" className={cls} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {/* Anchor / binding */}
          <circle cx="8" cy="4" r="2" />
          <path d="M8 6v8" />
          <path d="M4 10c0 2 8 2 8 0" />
          <path d="M2 8h3M11 8h3" />
        </svg>
      );
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type PrivacyGuaranteeVariant = "card" | "inline" | "compact";

export interface PrivacyGuaranteeProps {
  variant?:    PrivacyGuaranteeVariant;
  showHeader?: boolean;
  className?:  string;
}

// ---------------------------------------------------------------------------
// Full guarantee item (card + inline variants)
// ---------------------------------------------------------------------------

function FullGuaranteeItem({
  g,
  visible,
  delay,
}: {
  g:       Guarantee;
  visible: boolean;
  delay:   number;
}) {
  return (
    <div
      className="flex gap-3.5"
      style={{
        opacity:   visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(8px)",
        transition: `opacity 0.35s ease ${delay}ms, transform 0.35s ease ${delay}ms`,
      }}
    >
      {/* Icon */}
      <div
        className={[
          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
          ICON_WRAP[g.color],
        ].join(" ")}
        aria-hidden="true"
      >
        <GuaranteeIcon id={g.id} color={g.color} />
      </div>

      {/* Text */}
      <div className="min-w-0 flex-1">
        <p className={`text-xs font-semibold ${TITLE_COLOR[g.color]}`}>
          {g.title}
        </p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-600">
          {g.description}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact guarantee item (2-column grid)
// ---------------------------------------------------------------------------

function CompactGuaranteeItem({
  g,
  visible,
  delay,
}: {
  g:       Guarantee;
  visible: boolean;
  delay:   number;
}) {
  return (
    <div
      className={[
        "flex items-start gap-2.5 rounded-xl border border-zinc-800/60 bg-zinc-900/40 px-3 py-2.5",
        "transition-colors duration-150 hover:border-zinc-700/60 hover:bg-zinc-900/60",
      ].join(" ")}
      style={{
        opacity:   visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(6px)",
        transition: `opacity 0.3s ease ${delay}ms, transform 0.3s ease ${delay}ms`,
      }}
    >
      {/* Icon */}
      <div
        className={[
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border",
          ICON_WRAP[g.color],
        ].join(" ")}
        aria-hidden="true"
      >
        <span className="scale-75">
          <GuaranteeIcon id={g.id} color={g.color} />
        </span>
      </div>

      {/* Text */}
      <div className="min-w-0">
        <p className={`text-[10px] font-semibold leading-snug ${TITLE_COLOR[g.color]}`}>
          {g.title}
        </p>
        <p className={`mt-0.5 text-[9px] leading-snug ${SHORT_COLOR[g.color]}`}>
          {g.shortDesc}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PrivacyGuarantee
// ---------------------------------------------------------------------------

export function PrivacyGuarantee({
  variant    = "card",
  showHeader = true,
  className  = "",
}: PrivacyGuaranteeProps) {
  // Staggered entrance
  const [visible, setVisible] = useState(false);
  const mountedRef             = useRef(false);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    const t = setTimeout(() => setVisible(true), 60);
    return () => clearTimeout(t);
  }, []);

  const isCompact = variant === "compact";
  const isCard    = variant === "card";

  // ---------------------------------------------------------------------------
  // Inner content (shared across variants)
  // ---------------------------------------------------------------------------

  const content = isCompact ? (
    /* 2-column grid */
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {GUARANTEES.map((g, i) => (
        <CompactGuaranteeItem
          key={g.id}
          g={g}
          visible={visible}
          delay={i * 70}
        />
      ))}
    </div>
  ) : (
    /* Vertical list with subtle dividers */
    <div className="flex flex-col gap-5">
      {GUARANTEES.map((g, i) => (
        <React.Fragment key={g.id}>
          <FullGuaranteeItem
            g={g}
            visible={visible}
            delay={i * 80}
          />
          {i < GUARANTEES.length - 1 && (
            <div
              className={["h-px w-full", DIVIDER_COLOR[GUARANTEES[i]!.color]].join(" ")}
              aria-hidden="true"
              style={{
                opacity:    visible ? 1 : 0,
                transition: `opacity 0.3s ease ${i * 80 + 120}ms`,
              }}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );

  // ---------------------------------------------------------------------------
  // Render — card vs inline wrapper
  // ---------------------------------------------------------------------------

  if (!isCard) {
    // inline / compact: no border wrapper, just padded content
    return (
      <div className={className}>
        {showHeader && (
          <div className="mb-4 flex items-center gap-2">
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-zinc-500" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M8 1L2 4v4c0 4 2.5 6 6 7 3.5-1 6-3 6-7V4L8 1z" />
            </svg>
            <span className="text-[11px] font-semibold uppercase tracking-widest text-zinc-600">
              Privacy guarantees
            </span>
          </div>
        )}
        {content}
      </div>
    );
  }

  return (
    <div
      className={[
        "overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950",
        className,
      ].join(" ")}
      aria-label="Privacy guarantees"
    >
      {/* ── Header ──────────────────────────────────────────────────── */}
      {showHeader && (
        <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-5 py-3">
          <div className="flex items-center gap-2">
            {/* Shield icon */}
            <svg viewBox="0 0 18 18" className="h-4 w-4 text-teal-500" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 1.5L2 4.5v4c0 4 3.1 7.3 7 8 3.9-.7 7-4 7-8v-4L9 1.5z" />
              <path d="M6 9l2 2 4-4" />
            </svg>
            <span className="text-xs font-semibold tracking-wide text-zinc-300">
              Privacy guarantees
            </span>
          </div>
          {/* "ZK" pill */}
          <span className="rounded-full border border-teal-500/25 bg-teal-500/8 px-2 py-0.5 font-mono text-[10px] font-semibold text-teal-400">
            ZK
          </span>
        </div>
      )}

      {/* ── Content ─────────────────────────────────────────────────── */}
      <div className={isCompact ? "px-5 py-4" : "px-5 py-5"}>
        {content}
      </div>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <div className="flex items-start gap-2.5 border-t border-zinc-800/40 px-5 py-3">
        <svg viewBox="0 0 12 12" className="mt-0.5 h-3 w-3 shrink-0 text-zinc-800" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="6" cy="6" r="5" />
          <line x1="6" y1="5" x2="6" y2="8.5" />
          <circle cx="6" cy="3.5" r="0.5" fill="currentColor" />
        </svg>
        <p className="text-[10px] leading-relaxed text-zinc-800">
          NullProof is{" "}
          <a
            href="https://github.com/vamshiganesh/NullProof"
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-600 underline underline-offset-2 transition-colors hover:text-zinc-400"
          >
            open-source
          </a>
          . The circuit, contracts, and oracle are fully auditable. Trust the
          math, not the service.
        </p>
      </div>
    </div>
  );
}

export default PrivacyGuarantee;