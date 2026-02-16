// frontend/src/pages/Dashboard.tsx
//
// Route: /app/dashboard
// Layout: AppLayout (sidebar + topbar)
//
// Sections:
//   1. Header row    — greeting + address chip + quick-action CTA
//   2. Status hero   — large compliance status card (active/expired/none)
//   3. KPI strip     — 3 metric tiles (proof age, nullifier, network)
//   4. Sanctions panel — SanctionsListCard (live protocol data)
//   5. Quick-start guide — shown only when no proof exists

import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAccount } from "wagmi";

import { SanctionsListCard } from "@/components/sanctions/SanctionsListCard";
import {
  useProofStore,
  selectProofStatus,
  selectProofResult,
  selectSubmission,
  selectElapsedLabel,
} from "@/store/proofStore";
import {
  useWalletStore,
  selectAddress,
  selectIsWrongNetwork,
} from "@/store/walletStore";
import { formatHash } from "@/lib/format";
import {
  DEFAULT_VALIDITY_WINDOW_SECONDS,
  SUPPORTED_CHAIN_NAME,
  txUrl,
} from "@/lib/constants";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns time remaining in seconds, or null if expired / no submission */
function proofSecondsRemaining(confirmedAt: number | null): number | null {
  if (!confirmedAt) return null;
  const elapsed = Math.floor((Date.now() - confirmedAt) / 1000);
  const remaining = Number(DEFAULT_VALIDITY_WINDOW_SECONDS) - elapsed;
  return remaining > 0 ? remaining : 0;
}

function formatCountdown(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m remaining`;
  if (m > 0) return `${m}m ${s}s remaining`;
  return `${s}s remaining`;
}

function formatAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

// ---------------------------------------------------------------------------
// Countdown timer hook — ticks every second while seconds > 0
// ---------------------------------------------------------------------------

function useCountdown(initialSeconds: number | null) {
  const [seconds, setSeconds] = useState(initialSeconds);

  useEffect(() => {
    setSeconds(initialSeconds);
    if (!initialSeconds || initialSeconds <= 0) return;

    const id = setInterval(() => {
      setSeconds((s) => {
        if (s === null || s <= 1) {
          clearInterval(id);
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    return () => clearInterval(id);
  }, [initialSeconds]);

  return seconds;
}

// ---------------------------------------------------------------------------
// Stagger-in hook
// ---------------------------------------------------------------------------

function useStaggerVisible(count: number, delayMs = 80): boolean[] {
  const [visible, setVisible] = useState<boolean[]>(
    Array(count).fill(false) as boolean[],
  );

  useEffect(() => {
    const ids = Array.from({ length: count }, (_, i) =>
      setTimeout(() => {
        setVisible((prev) => {
          const next = [...prev];
          next[i] = true;
          return next;
        });
      }, i * delayMs + 60),
    );
    return () => ids.forEach(clearTimeout);
  }, [count, delayMs]);

  return visible;
}

// ---------------------------------------------------------------------------
// Not connected empty state
// ---------------------------------------------------------------------------

function NotConnectedState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900/60">
        <svg viewBox="0 0 20 20" className="h-7 w-7 text-zinc-600" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="6" width="16" height="11" rx="2" />
          <path d="M6 6V5a4 4 0 0 1 8 0v1" />
          <circle cx="10" cy="12" r="1.5" fill="currentColor" stroke="none" />
        </svg>
      </div>
      <h2 className="text-base font-semibold text-zinc-300">
        Connect your wallet
      </h2>
      <p className="mt-2 max-w-xs text-sm text-zinc-600">
        Connect a {SUPPORTED_CHAIN_NAME} wallet to view your compliance status
        and generate zero-knowledge proofs.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wrong network banner
// ---------------------------------------------------------------------------

function WrongNetworkBanner() {
  return (
    <div className="mx-4 mt-4 flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/8 px-4 py-3 sm:mx-0">
      <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-amber-400" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M8 1.5L1.5 13h13L8 1.5z" />
        <line x1="8" y1="6" x2="8" y2="9.5" />
        <circle cx="8" cy="11.5" r="0.5" fill="currentColor" stroke="none" />
      </svg>
      <p className="text-xs font-medium text-amber-400">
        Wrong network — please switch to{" "}
        <span className="font-semibold">{SUPPORTED_CHAIN_NAME}</span> to continue.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compliance status hero card
// ---------------------------------------------------------------------------

type ComplianceState = "active" | "expired" | "none";

function StatusHeroCard({
  state,
  secondsRemaining,
  txHash,
  visible,
}: {
  state:            ComplianceState;
  secondsRemaining: number | null;
  txHash:           string | null;
  visible:          boolean;
}) {
  const countdown = useCountdown(secondsRemaining);

  const config = {
    active: {
      border:  "border-teal-500/30",
      bg:      "bg-teal-500/5",
      glow:    "shadow-[0_0_60px_-10px_oklch(0.65_0.14_192/0.15)]",
      dot:     "bg-teal-400",
      dotAnim: "animate-pulse",
      label:   "Compliance Active",
      labelCls: "text-teal-400",
      icon:    <ShieldCheckBigIcon className="h-8 w-8 text-teal-400" />,
      badge:   "border-teal-500/30 bg-teal-500/10 text-teal-400",
      badgeText: "Verified",
    },
    expired: {
      border:  "border-amber-500/25",
      bg:      "bg-amber-500/4",
      glow:    "shadow-[0_0_40px_-10px_oklch(0.75_0.15_80/0.1)]",
      dot:     "bg-amber-400",
      dotAnim: "",
      label:   "Proof Expired",
      labelCls: "text-amber-400",
      icon:    <ClockIcon className="h-8 w-8 text-amber-400" />,
      badge:   "border-amber-500/30 bg-amber-500/10 text-amber-400",
      badgeText: "Expired",
    },
    none: {
      border:  "border-zinc-800",
      bg:      "bg-zinc-900/30",
      glow:    "",
      dot:     "bg-zinc-600",
      dotAnim: "",
      label:   "No Proof",
      labelCls: "text-zinc-400",
      icon:    <ShieldOffIcon className="h-8 w-8 text-zinc-600" />,
      badge:   "border-zinc-700 bg-zinc-800/60 text-zinc-500",
      badgeText: "Unverified",
    },
  }[state];

  const progressPct =
    state === "active" && countdown !== null && secondsRemaining
      ? Math.round((countdown / Number(DEFAULT_VALIDITY_WINDOW_SECONDS)) * 100)
      : 0;

  return (
    <div
      className={[
        "relative overflow-hidden rounded-2xl border transition-all duration-700",
        config.border,
        config.bg,
        config.glow,
        "p-6",
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
      ].join(" ")}
      style={{ transitionDelay: "80ms" }}
    >
      {/* Subtle grid pattern */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage:
            "linear-gradient(to right,rgb(255 255 255) 1px,transparent 1px),linear-gradient(to bottom,rgb(255 255 255) 1px,transparent 1px)",
          backgroundSize: "32px 32px",
        }}
        aria-hidden="true"
      />

      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        {/* Left: status */}
        <div className="flex items-start gap-4">
          {/* Icon container */}
          <div className={[
            "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border",
            config.border,
            "bg-zinc-900/60 backdrop-blur-sm",
          ].join(" ")}>
            {config.icon}
          </div>

          <div>
            {/* Badge */}
            <span className={[
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5",
              "text-[10px] font-semibold tracking-wide uppercase",
              config.badge,
            ].join(" ")}>
              <span className={["h-1.5 w-1.5 rounded-full", config.dot, config.dotAnim].join(" ")} aria-hidden="true" />
              {config.badgeText}
            </span>

            <h2 className={["mt-2 text-xl font-semibold tracking-tight", config.labelCls].join(" ")}>
              {config.label}
            </h2>

            {/* Countdown or sub-label */}
            <p className="mt-1 text-sm text-zinc-500">
              {state === "active" && countdown !== null && countdown > 0
                ? formatCountdown(countdown)
                : state === "active"
                ? "Expiring now…"
                : state === "expired"
                ? "Generate a new proof to restore compliance"
                : "No proof on record — generate your first proof"}
            </p>

            {/* Tx link */}
            {txHash && (
              <a
                href={txUrl(txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-[11px] text-zinc-600 transition-colors hover:text-zinc-400 focus-visible:outline-none"
              >
                <span className="font-mono">{formatHash(txHash, 8, 6)}</span>
                <ExternalLinkIcon className="h-2.5 w-2.5" />
              </a>
            )}
          </div>
        </div>

        {/* Right: CTA */}
        <div className="shrink-0">
          {state === "active" ? (
            <Link
              to="/app/ledger"
              className={[
                "inline-flex items-center gap-2 rounded-xl border border-zinc-700",
                "bg-zinc-900 px-4 py-2 text-xs font-semibold text-zinc-400",
                "transition-colors hover:border-zinc-600 hover:text-zinc-200",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500",
              ].join(" ")}
            >
              View ledger
              <ArrowRightSmIcon className="h-3 w-3" />
            </Link>
          ) : (
            <Link
              to="/app/ledger"
              className={[
                "inline-flex items-center gap-2 rounded-xl",
                "bg-teal-600 px-4 py-2 text-xs font-semibold text-white",
                "transition-colors hover:bg-teal-500",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",
              ].join(" ")}
            >
              Generate proof
              <ArrowRightSmIcon className="h-3 w-3" />
            </Link>
          )}
        </div>
      </div>

      {/* Progress bar — active proofs only */}
      {state === "active" && (
        <div className="mt-5">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[10px] font-medium text-zinc-600">Validity window</span>
            <span className="font-mono text-[10px] text-zinc-600">{progressPct}%</span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-teal-500 transition-[width] duration-1000 ease-linear"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI tile
// ---------------------------------------------------------------------------

function KpiTile({
  label,
  value,
  sub,
  icon,
  visible,
  delay,
}: {
  label:   string;
  value:   string;
  sub?:    string;
  icon:    React.ReactNode;
  visible: boolean;
  delay:   number;
}) {
  return (
    <div
      className={[
        "flex flex-col gap-3 rounded-2xl border border-zinc-800",
        "bg-zinc-900/40 p-4 backdrop-blur-sm",
        "transition-all duration-500",
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3",
      ].join(" ")}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
          {label}
        </span>
        <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-500">
          {icon}
        </div>
      </div>
      <div>
        <span className="font-mono text-xl font-semibold tabular-nums text-zinc-200">
          {value}
        </span>
        {sub && (
          <p className="mt-0.5 text-[11px] text-zinc-600">{sub}</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quick-start guide (shown when no proof exists)
// ---------------------------------------------------------------------------

const STEPS = [
  {
    n: "01",
    title: "Fund your wallet",
    body:  "Get Sepolia ETH from a faucet — you'll need it to pay gas for the deposit transaction.",
    link:  null,
  },
  {
    n: "02",
    title: "Open the ledger",
    body:  "Head to the Ledger page and submit a deposit. This registers your address in the Merkle tree.",
    link:  "/app/ledger",
  },
  {
    n: "03",
    title: "Generate a ZK proof",
    body:  "The in-browser prover builds a Noir circuit witness in ~10s and produces an UltraHonk proof.",
    link:  "/app/ledger",
  },
  {
    n: "04",
    title: "Submit on-chain",
    body:  "Submit the proof to the ComplianceGate contract. Your compliance status will go active for 24h.",
    link:  null,
  },
] as const;

function QuickStartGuide({ visible }: { visible: boolean }) {
  return (
    <div
      className={[
        "rounded-2xl border border-zinc-800 bg-zinc-900/30 p-5",
        "transition-all duration-500",
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3",
      ].join(" ")}
      style={{ transitionDelay: "480ms" }}
    >
      <div className="mb-5 flex items-center gap-2">
        <RocketIcon className="h-4 w-4 text-zinc-500" />
        <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
          Get started
        </h3>
      </div>

      <ol className="space-y-0">
        {STEPS.map((step, i) => (
          <li key={step.n} className="flex gap-4">
            {/* Connector */}
            <div className="flex flex-col items-center">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900">
                <span className="font-mono text-[9px] font-semibold text-zinc-600">
                  {step.n}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className="mt-1 w-px flex-1 bg-zinc-800" aria-hidden="true" />
              )}
            </div>

            {/* Content */}
            <div className="pb-5">
              <p className="text-sm font-medium text-zinc-300">{step.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-zinc-600">{step.body}</p>
              {step.link && (
                <Link
                  to={step.link}
                  className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-teal-500 transition-colors hover:text-teal-400 focus-visible:outline-none"
                >
                  Go now
                  <ArrowRightSmIcon className="h-2.5 w-2.5" />
                </Link>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export function Dashboard() {
  const { isConnected } = useAccount();
  const address         = useWalletStore(selectAddress);
  const isWrongNetwork  = useWalletStore(selectIsWrongNetwork);

  const proofStatus  = useProofStore(selectProofStatus);
  const proofResult  = useProofStore(selectProofResult);
  const submission   = useProofStore(selectSubmission);
  const elapsedLabel = useProofStore(selectElapsedLabel);

  // ── Compliance state derivation ────────────────────────────────────────
  const confirmedAt      = submission?.confirmedAt ?? null;
  const secondsRemaining = proofSecondsRemaining(confirmedAt);

  const complianceState: ComplianceState =
    proofStatus === "confirmed" && secondsRemaining !== null && secondsRemaining > 0
      ? "active"
      : proofStatus === "confirmed"
      ? "expired"
      : "none";

  // ── KPI values ─────────────────────────────────────────────────────────
  const nullifierShort = proofResult?.nullifier
    ? formatHash(proofResult.nullifier, 6, 4)
    : "—";

  const proofAgeLabel =
    elapsedLabel ? `Generated in ${elapsedLabel}` : "—";

  // ── Stagger animation ──────────────────────────────────────────────────
  const stagger = useStaggerVisible(6, 70);

  // ── Render: not connected ──────────────────────────────────────────────
  if (!isConnected) {
    return <NotConnectedState />;
  }

  return (
    <div className="flex flex-col gap-6 p-4 pb-8 sm:p-6 lg:p-8">

      {/* Wrong network */}
      {isWrongNetwork && <WrongNetworkBanner />}

      {/* ── Header row ──────────────────────────────────────────────── */}
      <div
        className={[
          "flex flex-col gap-3 transition-all duration-500 sm:flex-row sm:items-center sm:justify-between",
          stagger[0] ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2",
        ].join(" ")}
      >
        <div>
          <p className="text-xs font-medium text-zinc-600">
            {getGreeting()}
          </p>
          <h1 className="mt-0.5 text-lg font-semibold text-zinc-100">
            Dashboard
          </h1>
        </div>

        {/* Address chip */}
        {address && (
          <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-teal-500" aria-hidden="true" />
            <span className="font-mono text-xs text-zinc-400">
              {formatAddress(address)}
            </span>
          </div>
        )}
      </div>

      {/* ── Compliance status hero ─────────────────────────────────── */}
      <StatusHeroCard
        state={complianceState}
        secondsRemaining={secondsRemaining}
        txHash={submission?.txHash ?? null}
        visible={stagger[1] ?? false}
      />

      {/* ── KPI strip ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiTile
          label="Proof generation"
          value={proofAgeLabel}
          sub="UltraHonk in-browser"
          icon={<BoltIcon className="h-3.5 w-3.5" />}
          visible={stagger[2] ?? false}
          delay={0}
        />
        <KpiTile
          label="Nullifier"
          value={nullifierShort}
          sub={proofResult ? "Unique per proof" : "No proof yet"}
          icon={<FingerprintIcon className="h-3.5 w-3.5" />}
          visible={stagger[3] ?? false}
          delay={60}
        />
        <KpiTile
          label="Network"
          value={SUPPORTED_CHAIN_NAME}
          sub="Sepolia testnet"
          icon={<GlobeIcon className="h-3.5 w-3.5" />}
          visible={stagger[4] ?? false}
          delay={120}
        />
      </div>

      {/* ── Bottom grid: sanctions panel + guide ──────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">

        {/* Sanctions list card */}
        <div
          className={[
            "transition-all duration-500",
            stagger[5] ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3",
          ].join(" ")}
          style={{ transitionDelay: "360ms" }}
        >
          <SanctionsListCard />
        </div>

        {/* Quick-start guide — only when no proof on record */}
        {complianceState === "none" && (
          <QuickStartGuide visible={stagger[5] ?? false} />
        )}

        {/* Proof details — shown when proof exists */}
        {complianceState !== "none" && proofResult && (
          <ProofDetailPanel
            result={proofResult}
            submission={submission}
            visible={stagger[5] ?? false}
          />
        )}
      </div>
    </div>
  );
}

export default Dashboard;

// ---------------------------------------------------------------------------
// Proof detail panel (right column when proof exists)
// ---------------------------------------------------------------------------

function ProofDetailPanel({
  result,
  submission,
  visible,
}: {
  result:     NonNullable<ReturnType<typeof selectProofResult>>;
  submission: ReturnType<typeof selectSubmission>;
  visible:    boolean;
}) {
  return (
    <div
      className={[
        "flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/30 p-5",
        "transition-all duration-500",
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3",
      ].join(" ")}
      style={{ transitionDelay: "420ms" }}
    >
      <div className="flex items-center gap-2">
        <DocumentIcon className="h-4 w-4 text-zinc-500" />
        <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
          Proof details
        </h3>
      </div>

      <div className="space-y-0 divide-y divide-zinc-800/60">
        <DetailRow label="Nullifier">
          <span className="font-mono text-[11px] text-teal-300">
            {formatHash(result.nullifier, 8, 6)}
          </span>
        </DetailRow>

        <DetailRow label="Merkle root">
          <span className="font-mono text-[11px] text-zinc-400">
            {formatHash(result.rootUsed, 8, 6)}
          </span>
        </DetailRow>

        <DetailRow label="Public inputs">
          <span className="font-mono text-[11px] text-zinc-400">
            {result.publicInputs.length}
          </span>
        </DetailRow>

        {submission?.txHash && (
          <DetailRow label="Tx hash">
            <a
              href={txUrl(submission.txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-mono text-[11px] text-zinc-400 transition-colors hover:text-zinc-200"
            >
              {formatHash(submission.txHash, 8, 6)}
              <ExternalLinkIcon className="h-2.5 w-2.5" />
            </a>
          </DetailRow>
        )}

        {submission?.blockNumber !== undefined && (
          <DetailRow label="Block">
            <span className="font-mono text-[11px] text-zinc-400">
              {submission.blockNumber.toString()}
            </span>
          </DetailRow>
        )}
      </div>

      <Link
        to="/app/proofs"
        className={[
          "mt-auto flex items-center justify-center gap-2 rounded-xl border border-zinc-800",
          "py-2 text-xs font-medium text-zinc-500",
          "transition-colors hover:border-zinc-700 hover:text-zinc-300",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-600",
        ].join(" ")}
      >
        View all proofs
        <ArrowRightSmIcon className="h-3 w-3" />
      </Link>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600 whitespace-nowrap">
        {label}
      </span>
      <div className="flex min-w-0 flex-1 justify-end">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icon components
// ---------------------------------------------------------------------------

function ShieldCheckBigIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2L3 6v6c0 6 4 10.5 9 12 5-1.5 9-6 9-12V6L12 2z" />
      <path d="M8 12l3 3 5-5.5" strokeWidth="1.8" />
    </svg>
  );
}

function ShieldOffIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2L3 6v6c0 6 4 10.5 9 12 5-1.5 9-6 9-12V6L12 2z" />
      <line x1="9" y1="9" x2="15" y2="15" strokeWidth="1.8" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15.5 14" />
    </svg>
  );
}

function BoltIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 1.5L3 9h5l-1 5.5L14 7H9L9 1.5z" />
    </svg>
  );
}

function FingerprintIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 3.5A4.5 4.5 0 0 1 12.5 8c0 2-.5 3.5-1 4.5" />
      <path d="M3.5 5.5A6 6 0 0 0 2 8c0 2.5 1 5 2 6" />
      <path d="M8 5.5a2.5 2.5 0 0 1 2.5 2.5c0 1.5-.5 3-1 4" />
      <path d="M8 5.5A2.5 2.5 0 0 0 5.5 8c0 2 .5 4 1.5 5.5" />
    </svg>
  );
}

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8" cy="8" r="6" />
      <path d="M2 8h12M8 2c-1.5 2-2.5 3.5-2.5 6S6.5 12 8 14M8 2c1.5 2 2.5 3.5 2.5 6S9.5 12 8 14" />
    </svg>
  );
}

function RocketIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 1.5c0 0 3 1 4 4.5L9.5 8.5 7.5 6.5 8 1.5z" />
      <path d="M7.5 6.5L4 10l2 .5L5.5 12l3-2.5" />
      <path d="M9.5 8.5L10.5 12 9 11.5 8.5 14 6.5 11" />
      <circle cx="9" cy="5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ArrowRightSmIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 10 10" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 5h6M5 2l3 3-3 3" />
    </svg>
  );
}

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 10 10" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 2H2.5a1 1 0 0 0-1 1v4.5a1 1 0 0 0 1 1H7a1 1 0 0 0 1-1V6" />
      <path d="M6 1H9v3M9 1 5.5 4.5" />
    </svg>
  );
}

function DocumentIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 2h5.5L12 4.5V14H4V2z" />
      <path d="M9 2v3h3" />
      <path d="M6 8h4M6 10.5h3" />
    </svg>
  );
}