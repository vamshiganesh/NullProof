// frontend/src/pages/Dashboard.tsx
//
// Route: /app/dashboard
//
// Sections:
//   1. Page header       — title + address badge + "Generate Proof" CTA
//   2. Status hero card  — compliance state (active / expired / none)
//   3. KPI strip         — 3 metric tiles (proof time, nullifier, network)
//   4. Bottom grid       — SanctionsListCard  +  Contract Addresses panel

import React, { useEffect, useState } from "react";
import { Link }                        from "react-router-dom";
import { useAccount }                  from "wagmi";

import { SanctionsListCard }           from "@/components/sanctions/SanctionsListCard";
import {
  useProofStore,
  selectProofStatus,
  selectProofResult,
  selectSubmission,
  selectElapsedLabel,
}                                      from "@/store/proofStore";
import {
  useWalletStore,
  selectAddress,
  selectIsWrongNetwork,
}                                      from "@/store/walletStore";
import { formatHash }                  from "@/lib/format";
import {
  DEFAULT_VALIDITY_WINDOW_SECONDS,
  SUPPORTED_CHAIN_NAME,
  COMPLIANCE_GATE_ADDRESS,
  SANCTIONS_LIST_ADDRESS,
  VERIFIER_ADDRESS,
  txUrl,
  addrUrl,
}                                      from "@/lib/constants";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function secondsRemaining(confirmedAt: number | null): number | null {
  if (!confirmedAt) return null;
  const elapsed    = Math.floor((Date.now() - confirmedAt) / 1000);
  const remaining  = Number(DEFAULT_VALIDITY_WINDOW_SECONDS) - elapsed;
  return remaining > 0 ? remaining : 0;
}

function formatCountdown(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m remaining`;
  if (m > 0) return `${m}m ${sec}s remaining`;
  return `${sec}s remaining`;
}

function truncateAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// Countdown hook
// ---------------------------------------------------------------------------

function useCountdown(initial: number | null) {
  const [secs, setSecs] = useState(initial);
  useEffect(() => {
    setSecs(initial);
    if (!initial || initial <= 0) return;
    const id = setInterval(() => {
      setSecs((s) => {
        if (s === null || s <= 1) { clearInterval(id); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [initial]);
  return secs;
}

// ---------------------------------------------------------------------------
// Stagger-in
// ---------------------------------------------------------------------------

function useStagger(n: number, ms = 70) {
  const [vis, setVis] = useState<boolean[]>(Array(n).fill(false));
  useEffect(() => {
    const ids = Array.from({ length: n }, (_, i) =>
      setTimeout(() => setVis((p) => { const v = [...p]; v[i] = true; return v; }), i * ms + 40)
    );
    return () => ids.forEach(clearTimeout);
  }, [n, ms]);
  return vis;
}

// ---------------------------------------------------------------------------
// "Not connected" empty state
// ---------------------------------------------------------------------------

function NotConnected() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-32 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#262626] bg-[#141414]">
        <svg viewBox="0 0 20 20" className="h-7 w-7 text-[#646464]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="6" width="16" height="11" rx="2" />
          <path d="M6 6V5a4 4 0 0 1 8 0v1" />
          <circle cx="10" cy="12" r="1.5" fill="currentColor" stroke="none" />
        </svg>
      </div>
      <h2 className="text-[15px] font-semibold text-white">Connect your wallet</h2>
      <p className="mt-2 max-w-xs text-sm text-[#646464]">
        Connect a {SUPPORTED_CHAIN_NAME} wallet to view your compliance status and generate zero-knowledge proofs.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wrong network banner
// ---------------------------------------------------------------------------

function WrongNetworkBanner() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/8 px-4 py-3">
      <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-amber-400" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M8 1.5L1.5 13h13L8 1.5z" /><line x1="8" y1="6" x2="8" y2="9.5" /><circle cx="8" cy="11.5" r="0.5" fill="currentColor" stroke="none" />
      </svg>
      <p className="text-xs font-medium text-amber-400">
        Wrong network — switch to <span className="font-semibold">{SUPPORTED_CHAIN_NAME}</span> to continue.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compliance status hero card
// ---------------------------------------------------------------------------

type ComplianceState = "active" | "expired" | "none";

function StatusCard({
  state,
  secsLeft,
  txHash,
  vis,
}: {
  state:   ComplianceState;
  secsLeft: number | null;
  txHash:  string | null;
  vis:     boolean;
}) {
  const countdown = useCountdown(secsLeft);
  const progressPct =
    state === "active" && countdown !== null && secsLeft
      ? Math.round((countdown / Number(DEFAULT_VALIDITY_WINDOW_SECONDS)) * 100)
      : 0;

  const cfg = {
    active: {
      borderCls:   "border-[#22c55e]/20",
      bg:          "bg-[#0d1a12]",
      dotCls:      "bg-[#22c55e] animate-pulse",
      labelCls:    "text-[#22c55e]",
      label:       "Compliance Active",
      badge:       "border-[#22c55e]/20 bg-[#22c55e]/10 text-[#22c55e]",
      badgeText:   "ACTIVE",
      sub:         countdown !== null && countdown > 0 ? formatCountdown(countdown) : "Expiring now…",
      barCls:      "bg-[#22c55e]",
    },
    expired: {
      borderCls:   "border-amber-500/20",
      bg:          "bg-[#1a1200]",
      dotCls:      "bg-amber-400",
      labelCls:    "text-amber-400",
      label:       "Proof Expired",
      badge:       "border-amber-500/20 bg-amber-500/10 text-amber-400",
      badgeText:   "EXPIRED",
      sub:         "Generate a new proof to restore compliance",
      barCls:      "bg-amber-400",
    },
    none: {
      borderCls:   "border-[#262626]",
      bg:          "bg-[#141414]",
      dotCls:      "bg-[#3e3e3e]",
      labelCls:    "text-white",
      label:       "No Proof on Record",
      badge:       "border-[#262626] bg-[#1e1e1e] text-[#646464]",
      badgeText:   "UNVERIFIED",
      sub:         "Generate your first proof to activate compliance",
      barCls:      "bg-[#3e3e3e]",
    },
  }[state];

  return (
    <div
      className={[
        "relative overflow-hidden rounded-xl border p-6 transition-all duration-500",
        cfg.borderCls, cfg.bg,
        vis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
      ].join(" ")}
      style={{ transitionDelay: "80ms" }}
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">

        {/* Left */}
        <div className="flex items-start gap-4">
          {/* Status icon */}
          <div className={["flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border", cfg.borderCls, "bg-[#0d0d0d]"].join(" ")}>
            <svg viewBox="0 0 24 24" className={["h-6 w-6", cfg.labelCls].join(" ")} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {state === "active" ? (
                <><path d="M12 2L3 6v6c0 6 4 10.5 9 12 5-1.5 9-6 9-12V6L12 2z" /><path d="M8 12l3 3 5-5.5" strokeWidth="1.8" /></>
              ) : state === "expired" ? (
                <><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15.5 14" /></>
              ) : (
                <><path d="M12 2L3 6v6c0 6 4 10.5 9 12 5-1.5 9-6 9-12V6L12 2z" /><line x1="9" y1="9" x2="15" y2="15" strokeWidth="1.8" /></>
              )}
            </svg>
          </div>

          <div>
            {/* Badge */}
            <span className={["inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-semibold tracking-widest", cfg.badge].join(" ")}>
              <span className={["h-1.5 w-1.5 rounded-full shrink-0", cfg.dotCls].join(" ")} aria-hidden="true" />
              {cfg.badgeText}
            </span>

            <h2 className={["mt-2 text-xl font-bold tracking-tight", cfg.labelCls].join(" ")}>
              {cfg.label}
            </h2>

            <p className="mt-1 text-sm text-[#a0a0a0]">{cfg.sub}</p>

            {txHash && (
              <a
                href={txUrl(txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 font-mono text-[11px] text-[#646464] transition-colors hover:text-[#a0a0a0]"
              >
                {formatHash(txHash, 8, 6)}
                <ExternalIcon className="h-2.5 w-2.5" />
              </a>
            )}
          </div>
        </div>

        {/* Right: CTA */}
        <div className="shrink-0">
          {state === "active" ? (
            <Link
              to="/app/ledger"
              className="inline-flex items-center gap-2 rounded-lg border border-[#262626] bg-[#1a1a1a] px-4 py-2 text-xs font-semibold text-[#a0a0a0] transition-colors hover:border-[#3e3e3e] hover:text-white focus-visible:outline-none"
            >
              View Ledger
              <ArrowSmIcon className="h-3 w-3" />
            </Link>
          ) : (
            <Link
              to="/app/ledger"
              className="inline-flex items-center gap-2 rounded-lg bg-[#22c55e] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#16a34a] focus-visible:outline-none"
            >
              Generate Proof
              <ArrowSmIcon className="h-3 w-3" />
            </Link>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {state === "active" && (
        <div className="mt-5">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="font-mono text-[10px] text-[#646464]">Validity window</span>
            <span className="font-mono text-[10px] text-[#646464]">{progressPct}%</span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-[#1e1e1e]">
            <div
              className={["h-full rounded-full transition-[width] duration-1000 ease-linear", cfg.barCls].join(" ")}
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
  label, value, sub, icon, vis, delay,
}: {
  label: string; value: string; sub?: string;
  icon: React.ReactNode; vis: boolean; delay: number;
}) {
  return (
    <div
      className={[
        "flex flex-col gap-3 rounded-xl border border-[#1e1e1e] bg-[#141414] p-5",
        "transition-all duration-500",
        vis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3",
      ].join(" ")}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-[#646464]">{label}</span>
        <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#262626] bg-[#1a1a1a] text-[#646464]">
          {icon}
        </div>
      </div>
      <div>
        <span className="font-mono text-xl font-bold tabular-nums text-white">{value}</span>
        {sub && <p className="mt-0.5 text-[11px] text-[#646464]">{sub}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Contract Addresses panel
// ---------------------------------------------------------------------------

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* silent */ }
      }}
      aria-label={copied ? "Copied" : "Copy"}
      className="ml-1 rounded p-0.5 text-[#646464] transition-colors hover:text-[#a0a0a0] focus-visible:outline-none"
    >
      {copied ? (
        <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 6l2.5 2.5 5.5-5" />
        </svg>
      ) : (
        <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="4" y="4" width="7" height="7" rx="1" /><path d="M1 8V2a1 1 0 0 1 1-1h6" />
        </svg>
      )}
    </button>
  );
}

function ContractRow({ label, address }: { label: string; address: string }) {
  const short = address ? truncateAddr(address) : "Not deployed";
  const href  = address ? addrUrl(address) : undefined;

  return (
    <div className="flex items-center justify-between gap-4 border-b border-[#1e1e1e] py-3 last:border-0">
      <span className="text-[11px] text-[#646464]">{label}</span>
      <div className="flex items-center gap-1">
        {address ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[11px] text-[#a0a0a0] transition-colors hover:text-white"
          >
            {short}
          </a>
        ) : (
          <span className="font-mono text-[11px] text-[#3e3e3e]">{short}</span>
        )}
        {address && <CopyButton value={address} />}
      </div>
    </div>
  );
}

function ContractsPanel({ vis }: { vis: boolean }) {
  return (
    <div
      className={[
        "flex flex-col rounded-xl border border-[#1e1e1e] bg-[#141414]",
        "transition-all duration-500",
        vis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3",
      ].join(" ")}
      style={{ transitionDelay: "360ms" }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-[#1e1e1e] px-5 py-4">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-[#646464]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 12V5l6-3 6 3v7l-6 3-6-3z" /><path d="M8 2v13M2 5l6 3 6-3" />
        </svg>
        <span className="font-mono text-[11px] uppercase tracking-widest text-[#646464]">Contract Addresses</span>
      </div>

      <div className="px-5">
        <ContractRow label="ComplianceGate"  address={COMPLIANCE_GATE_ADDRESS} />
        <ContractRow label="HonkVerifier"    address={VERIFIER_ADDRESS} />
        <ContractRow label="SanctionsList"   address={SANCTIONS_LIST_ADDRESS} />
      </div>

      {/* Protocol info */}
      <div className="border-t border-[#1e1e1e] px-5 py-4">
        <p className="font-mono text-[10px] uppercase tracking-widest text-[#3e3e3e]">Protocol Info</p>
        <div className="mt-3 grid grid-cols-2 gap-y-2">
          {[
            { k: "Circuit",   v: "Noir UltraHonk" },
            { k: "Depth",     v: "20 levels"       },
            { k: "Validity",  v: "24 h"            },
            { k: "Network",   v: SUPPORTED_CHAIN_NAME },
          ].map(({ k, v }) => (
            <div key={k}>
              <p className="text-[10px] text-[#3e3e3e]">{k}</p>
              <p className="mt-0.5 font-mono text-[11px] text-[#646464]">{v}</p>
            </div>
          ))}
        </div>
      </div>
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

  const proofStatus   = useProofStore(selectProofStatus);
  const proofResult   = useProofStore(selectProofResult);
  const submission    = useProofStore(selectSubmission);
  const elapsedLabel  = useProofStore(selectElapsedLabel);

  const confirmedAt   = submission?.confirmedAt ?? null;
  const secsLeft      = secondsRemaining(confirmedAt);

  const complianceState: ComplianceState =
    proofStatus === "confirmed" && secsLeft !== null && secsLeft > 0
      ? "active"
      : proofStatus === "confirmed"
      ? "expired"
      : "none";

  const nullifierShort = proofResult?.nullifier
    ? formatHash(proofResult.nullifier, 6, 4)
    : "—";
  const proofTimeLabel = elapsedLabel ? elapsedLabel : "—";

  const vis = useStagger(6, 70);

  if (!isConnected) return <NotConnected />;

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-5 py-8 sm:px-8">

      {/* Wrong network */}
      {isWrongNetwork && <WrongNetworkBanner />}

      {/* ── Page header ─────────────────────────────────────────────── */}
      <div
        className={[
          "flex flex-col gap-3 transition-all duration-500 sm:flex-row sm:items-center sm:justify-between",
          vis[0] ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2",
        ].join(" ")}
      >
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight text-white">
              Compliance Dashboard
            </h1>
            {address && (
              <span className="hidden items-center gap-1.5 rounded-full border border-[#262626] bg-[#1a1a1a] px-2.5 py-0.5 sm:inline-flex">
                <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e]" aria-hidden="true" />
                <span className="font-mono text-[11px] text-[#a0a0a0]">{truncateAddr(address)}</span>
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-[#646464]">
            {SUPPORTED_CHAIN_NAME} testnet · Zero-knowledge compliance proofs
          </p>
        </div>

        <Link
          to="/app/ledger"
          className="inline-flex w-fit items-center gap-2 rounded-lg bg-[#22c55e] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#16a34a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22c55e]/50"
        >
          Generate Proof
          <ArrowSmIcon className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* ── Compliance status hero ──────────────────────────────────── */}
      <StatusCard
        state={complianceState}
        secsLeft={secsLeft}
        txHash={submission?.txHash ?? null}
        vis={vis[1] ?? false}
      />

      {/* ── KPI strip ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiTile
          label="Proof generation"
          value={proofTimeLabel}
          sub="UltraHonk in-browser"
          icon={<BoltIcon />}
          vis={vis[2] ?? false}
          delay={0}
        />
        <KpiTile
          label="Nullifier"
          value={nullifierShort}
          sub={proofResult ? "Unique per proof" : "No proof yet"}
          icon={<FingerprintIcon />}
          vis={vis[3] ?? false}
          delay={60}
        />
        <KpiTile
          label="Network"
          value={SUPPORTED_CHAIN_NAME}
          sub="Sepolia testnet"
          icon={<GlobeIcon />}
          vis={vis[4] ?? false}
          delay={120}
        />
      </div>

      {/* ── Bottom grid: sanctions panel + contracts ─────────────────── */}
      <div
        className={[
          "grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px] transition-all duration-500",
          vis[5] ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3",
        ].join(" ")}
        style={{ transitionDelay: "300ms" }}
      >
        <SanctionsListCard />
        <ContractsPanel vis={vis[5] ?? false} />
      </div>
    </div>
  );
}

export default Dashboard;

// ---------------------------------------------------------------------------
// Icon atoms
// ---------------------------------------------------------------------------

function ArrowSmIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 10 10" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 5h6M5 2l3 3-3 3" />
    </svg>
  );
}

function ExternalIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 10 10" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 2H2.5a1 1 0 0 0-1 1v4.5a1 1 0 0 0 1 1H7a1 1 0 0 0 1-1V6" />
      <path d="M6 1H9v3M9 1 5.5 4.5" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 1.5L3 8h4.5L5.5 12.5 11 6H6.5L8 1.5z" />
    </svg>
  );
}

function FingerprintIcon() {
  return (
    <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4.5 3A4 4 0 0 1 11 7c0 2-.5 3-1 4" />
      <path d="M3 5A5.5 5.5 0 0 0 1.5 7c0 2.5 1 4.5 2 5.5" />
      <path d="M7 5a2.5 2.5 0 0 1 2.5 2.5c0 1.5-.5 3-1 3.5" />
      <path d="M7 5A2.5 2.5 0 0 0 4.5 7.5c0 2 .5 3.5 1.5 5" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="7" cy="7" r="5.5" />
      <path d="M1.5 7h11M7 1.5c-1.3 1.8-2 3.5-2 5.5S5.7 10.7 7 12.5M7 1.5c1.3 1.8 2 3.5 2 5.5S8.3 10.7 7 12.5" />
    </svg>
  );
}
