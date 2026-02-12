// frontend/src/components/ledger/ProofStatePanel.tsx
//
// Displays the full state of an attached ZK proof before/during a deposit:
//   • Proof hash          — truncated, copyable, full value on hover
//   • Nullifier           — truncated, copyable, on-chain used-check
//   • Validity window     — countdown ring + expiry timestamp
//   • Proof metadata      — proving system, circuit, address count, generation time
//   • Live expiry clock   — ticks every second; transitions amber → rose as deadline nears
//   • Nullifier used flag — queries readIsNullifierUsed() once on mount

import React, {
    useCallback,
    useEffect,
    useRef,
    useState,
  } from "react";
  
  import {
    readIsNullifierUsed,
    createDefaultPublicClient,
  } from "@/lib/chain/contracts";
  import {
    formatHash,
    formatNullifier,
    formatDuration,
    formatTimestamp,
    timeAgo,
  } from "@/lib/format";
  import type { ProofData } from "@/types/proof";
  
  // ---------------------------------------------------------------------------
  // Types
  // ---------------------------------------------------------------------------
  
  export interface ProofStatePanelProps {
    proof:      ProofData;
    className?: string;
  }
  
  type NullifierCheckState = "idle" | "checking" | "unused" | "used" | "error";
  
  // ---------------------------------------------------------------------------
  // Countdown helpers
  // ---------------------------------------------------------------------------
  
  interface Countdown {
    totalSeconds:   number;
    remainingMs:    number;
    remainingLabel: string;
    /** 0–1 fraction of validity window elapsed */
    fraction:       number;
    isExpired:      boolean;
    urgency:        "ok" | "warn" | "critical" | "expired";
  }
  
  function buildCountdown(validUntil: string, validityWindow: number): Countdown {
    const expMs     = new Date(validUntil).getTime();
    const nowMs     = Date.now();
    const remainMs  = expMs - nowMs;
    const totalMs   = validityWindow * 1_000;
    const fraction  = Math.min(1, Math.max(0, 1 - remainMs / totalMs));
    const isExpired = remainMs <= 0;
  
    let remainingLabel: string;
    if (isExpired) {
      remainingLabel = "Expired";
    } else {
      const s   = Math.floor(remainMs / 1_000);
      const h   = Math.floor(s / 3_600);
      const m   = Math.floor((s % 3_600) / 60);
      const sec = s % 60;
      if (h > 0)       remainingLabel = `${h}h ${m}m`;
      else if (m > 0)  remainingLabel = `${m}m ${sec}s`;
      else             remainingLabel = `${sec}s`;
    }
  
    const urgency: Countdown["urgency"] = isExpired
      ? "expired"
      : remainMs < 5 * 60_000
      ? "critical"
      : remainMs < 30 * 60_000
      ? "warn"
      : "ok";
  
    return {
      totalSeconds:   validityWindow,
      remainingMs:    Math.max(0, remainMs),
      remainingLabel,
      fraction,
      isExpired,
      urgency,
    };
  }
  
  // ---------------------------------------------------------------------------
  // Countdown ring (SVG arc)
  // ---------------------------------------------------------------------------
  
  function CountdownRing({
    fraction,
    urgency,
    label,
  }: {
    fraction: number;
    urgency:  Countdown["urgency"];
    label:    string;
  }) {
    const R          = 22;
    const STROKE     = 3;
    const circumference = 2 * Math.PI * R;
    const dashOffset    = circumference * fraction;   // elapsed → arc consumed
  
    const trackColor: Record<Countdown["urgency"], string> = {
      ok:       "#14532d",   // dark green track
      warn:     "#78350f",
      critical: "#7f1d1d",
      expired:  "#3f3f46",
    };
  
    const arcColor: Record<Countdown["urgency"], string> = {
      ok:       "#34d399",
      warn:     "#fbbf24",
      critical: "#f87171",
      expired:  "#52525b",
    };
  
    return (
      <div className="relative flex h-14 w-14 shrink-0 items-center justify-center">
        <svg
          viewBox="0 0 56 56"
          className="-rotate-90"
          aria-hidden="true"
        >
          {/* Track */}
          <circle
            cx="28" cy="28" r={R}
            fill="none"
            stroke={trackColor[urgency]}
            strokeWidth={STROKE}
          />
          {/* Arc — remaining */}
          <circle
            cx="28" cy="28" r={R}
            fill="none"
            stroke={arcColor[urgency]}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{ transition: "stroke-dashoffset 0.9s linear, stroke 0.4s ease" }}
          />
        </svg>
        {/* Centre label */}
        <span
          className="absolute text-center font-mono text-[9px] font-semibold leading-tight tabular-nums"
          style={{ color: arcColor[urgency] }}
        >
          {label}
        </span>
      </div>
    );
  }
  
  // ---------------------------------------------------------------------------
  // Copy button (inline micro)
  // ---------------------------------------------------------------------------
  
  function CopyBtn({ value, label }: { value: string; label: string }) {
    const [copied, setCopied] = useState(false);
  
    async function handleCopy(e: React.MouseEvent) {
      e.preventDefault();
      try {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch { /* silent */ }
    }
  
    return (
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? "Copied" : `Copy ${label}`}
        title={copied ? "Copied!" : `Copy ${label}`}
        className={[
          "rounded p-0.5 transition-colors duration-150",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500",
          copied
            ? "text-teal-400"
            : "text-zinc-700 hover:text-zinc-400 hover:bg-zinc-800",
        ].join(" ")}
      >
        {copied ? (
          <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M1.5 5l2 2 5-4" />
          </svg>
        ) : (
          <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="6" height="6.5" rx="1" />
            <path d="M6.5 3V2a1 1 0 0 0-1-1H1.5a1 1 0 0 0-1 1V7a1 1 0 0 0 1 1H2.5" />
          </svg>
        )}
      </button>
    );
  }
  
  // ---------------------------------------------------------------------------
  // Field row
  // ---------------------------------------------------------------------------
  
  function FieldRow({
    label,
    children,
    mono  = false,
    faint = false,
  }: {
    label:    string;
    children: React.ReactNode;
    mono?:    boolean;
    faint?:   boolean;
  }) {
    return (
      <div className="flex items-start justify-between gap-4 py-2.5">
        <span className="shrink-0 text-[10px] uppercase tracking-widest text-zinc-700">
          {label}
        </span>
        <span
          className={[
            "text-right text-[11px] leading-snug",
            mono  ? "font-mono tabular-nums" : "font-medium",
            faint ? "text-zinc-600"          : "text-zinc-300",
          ].join(" ")}
        >
          {children}
        </span>
      </div>
    );
  }
  
  // ---------------------------------------------------------------------------
  // Nullifier status badge
  // ---------------------------------------------------------------------------
  
  function NullifierBadge({ state }: { state: NullifierCheckState }) {
    if (state === "idle" || state === "checking") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[9px] font-medium text-zinc-600">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-700" />
          Checking…
        </span>
      );
    }
    if (state === "unused") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-teal-500/25 bg-teal-500/8 px-1.5 py-0.5 text-[9px] font-semibold text-teal-400">
          <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
          Unused
        </span>
      );
    }
    if (state === "used") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/25 bg-rose-500/8 px-1.5 py-0.5 text-[9px] font-semibold text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
          Already used
        </span>
      );
    }
    // error
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/8 px-1.5 py-0.5 text-[9px] font-medium text-amber-400">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        Check failed
      </span>
    );
  }
  
  // ---------------------------------------------------------------------------
  // Urgency banner (shown only at warn / critical / expired)
  // ---------------------------------------------------------------------------
  
  function UrgencyBanner({ urgency, label }: { urgency: Countdown["urgency"]; label: string }) {
    if (urgency === "ok") return null;
  
    const styles: Record<string, string> = {
      warn:     "border-amber-500/20 bg-amber-500/5  text-amber-400",
      critical: "border-rose-500/20  bg-rose-500/5   text-rose-400",
      expired:  "border-zinc-700/40  bg-zinc-900      text-zinc-500",
    };
  
    const messages: Record<string, string> = {
      warn:     `Proof expires in ${label} — submit soon.`,
      critical: `Proof expires in ${label}! Submit immediately.`,
      expired:  "This proof has expired. Generate a new one before submitting.",
    };
  
    return (
      <div
        role="alert"
        className={[
          "mx-5 mb-0 mt-0 flex items-start gap-2 rounded-lg border px-3 py-2.5",
          styles[urgency] ?? "",
        ].join(" ")}
      >
        <svg viewBox="0 0 14 14" className="mt-0.5 h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M7 1L13 12H1L7 1z" />
          <line x1="7" y1="5.5" x2="7" y2="8" />
          <circle cx="7" cy="10" r="0.6" fill="currentColor" />
        </svg>
        <p className="text-[11px] leading-relaxed">{messages[urgency]}</p>
      </div>
    );
  }
  
  // ---------------------------------------------------------------------------
  // ProofStatePanel
  // ---------------------------------------------------------------------------
  
  export function ProofStatePanel({ proof, className = "" }: ProofStatePanelProps) {
    // ── Live countdown ────────────────────────────────────────────────────
    const [countdown, setCountdown] = useState<Countdown>(() =>
      buildCountdown(proof.validUntil, proof.validityWindow),
    );
  
    const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
    useEffect(() => {
      tickRef.current = setInterval(() => {
        setCountdown(buildCountdown(proof.validUntil, proof.validityWindow));
      }, 1_000);
      return () => {
        if (tickRef.current) clearInterval(tickRef.current);
      };
    }, [proof.validUntil, proof.validityWindow]);
  
    // ── Nullifier on-chain check ──────────────────────────────────────────
    const [nullifierState, setNullifierState] =
      useState<NullifierCheckState>("idle");
  
    const checkNullifier = useCallback(async () => {
      if (!proof.nullifier?.startsWith("0x")) return;
      setNullifierState("checking");
      try {
        const client = createDefaultPublicClient();
        const used   = await readIsNullifierUsed(
          proof.nullifier as `0x${string}`,
          client,
        );
        setNullifierState(used ? "used" : "unused");
      } catch {
        setNullifierState("error");
      }
    }, [proof.nullifier]);
  
    useEffect(() => {
      checkNullifier();
    }, [checkNullifier]);
  
    // ── Generation time label ─────────────────────────────────────────────
    const generatedLabel = (() => {
      const ms = proof.generatedInMs;
      if (ms < 1_000)    return `${ms}ms`;
      if (ms < 60_000)   return `${(ms / 1_000).toFixed(1)}s`;
      return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1_000)}s`;
    })();
  
    // ── Urgency colours ───────────────────────────────────────────────────
    const urgencyTextColor: Record<Countdown["urgency"], string> = {
      ok:       "text-teal-400",
      warn:     "text-amber-400",
      critical: "text-rose-400",
      expired:  "text-zinc-600",
    };
  
    // ---------------------------------------------------------------------------
    // Render
    // ---------------------------------------------------------------------------
  
    return (
      <div
        className={[
          "flex flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950",
          className,
        ].join(" ")}
        aria-label="Attached proof state"
      >
        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-5 py-3">
          <div className="flex items-center gap-2">
            {/* Shield-check icon */}
            <svg viewBox="0 0 18 18" className="h-4 w-4 text-teal-500" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 1.5L2 4.5v4c0 4 3.1 7.3 7 8 3.9-.7 7-4 7-8v-4L9 1.5z" />
              <path d="M6.5 9l2 2 3-3" />
            </svg>
            <span className="text-xs font-semibold tracking-wide text-zinc-300">
              Attached Proof
            </span>
          </div>
  
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2 py-0.5 font-mono text-[10px] text-zinc-600">
              {proof.provingSystem}
            </span>
            <span
              className={[
                "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                countdown.isExpired
                  ? "border-zinc-700/40 bg-zinc-900 text-zinc-600"
                  : "border-teal-500/25 bg-teal-500/8 text-teal-400",
              ].join(" ")}
            >
              {countdown.isExpired ? "Expired" : "Valid"}
            </span>
          </div>
        </div>
  
        {/* ── Urgency banner (warn / critical / expired) ─────────────────── */}
        {countdown.urgency !== "ok" && (
          <div className="px-0 pt-3">
            <UrgencyBanner
              urgency={countdown.urgency}
              label={countdown.remainingLabel}
            />
          </div>
        )}
  
        {/* ── Validity countdown hero ───────────────────────────────────── */}
        <div className="flex items-center gap-4 px-5 py-4">
          <CountdownRing
            fraction={countdown.fraction}
            urgency={countdown.urgency}
            label={countdown.remainingLabel}
          />
  
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-widest text-zinc-700">
              Time remaining
            </p>
            <p
              className={[
                "mt-0.5 font-mono text-lg font-semibold tabular-nums leading-none",
                urgencyTextColor[countdown.urgency],
              ].join(" ")}
            >
              {countdown.remainingLabel}
            </p>
            <p className="mt-1 text-[10px] text-zinc-700 tabular-nums">
              Valid for {formatDuration(countdown.totalSeconds)} ·{" "}
              expires{" "}
              {formatTimestamp(
                Math.floor(new Date(proof.validUntil).getTime() / 1_000),
                { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
              )}
            </p>
          </div>
        </div>
  
        {/* ── Field rows ────────────────────────────────────────────────── */}
        <div className="border-t border-zinc-800/60 px-5">
          <div className="divide-y divide-zinc-800/40">
  
            {/* Proof hash */}
            <FieldRow label="Proof hash" mono>
              <span className="flex items-center justify-end gap-1.5">
                <span
                  className="cursor-default text-zinc-400"
                  title={proof.proofHash}
                >
                  {formatHash(proof.proofHash, 10, 8)}
                </span>
                <CopyBtn value={proof.proofHash} label="proof hash" />
              </span>
            </FieldRow>
  
            {/* Nullifier */}
            <FieldRow label="Nullifier" mono>
              <span className="flex flex-col items-end gap-1">
                <span className="flex items-center gap-1.5">
                  <span
                    className="cursor-default text-zinc-400"
                    title={proof.nullifier}
                  >
                    {formatNullifier(proof.nullifier)}
                  </span>
                  <CopyBtn value={proof.nullifier} label="nullifier" />
                </span>
                <NullifierBadge state={nullifierState} />
              </span>
            </FieldRow>
  
            {/* Merkle root */}
            <FieldRow label="Merkle root" mono faint>
              <span className="flex items-center gap-1.5">
                <span title={proof.merkleRoot}>
                  {formatHash(proof.merkleRoot, 8, 6)}
                </span>
                <CopyBtn value={proof.merkleRoot} label="merkle root" />
              </span>
            </FieldRow>
  
            {/* Public inputs */}
            <FieldRow label="Public inputs" mono faint>
              {proof.publicInputs.length === 1
                ? formatHash(proof.publicInputs[0]!, 8, 6)
                : `${proof.publicInputs.length} inputs`}
            </FieldRow>
  
            {/* Validity window */}
            <FieldRow label="Validity window">
              {formatDuration(proof.validityWindow)}
            </FieldRow>
  
            {/* Address count */}
            <FieldRow label="Addresses screened">
              {proof.addressCount.toLocaleString("en-US")}
            </FieldRow>
  
            {/* Circuit */}
            <FieldRow label="Circuit" faint>
              {proof.circuitName}
            </FieldRow>
  
            {/* Generated */}
            <FieldRow label="Generated" faint>
              <span title={proof.generatedAt}>
                {timeAgo(Math.floor(new Date(proof.generatedAt).getTime() / 1_000))}
              </span>
            </FieldRow>
  
            {/* Proving time */}
            <FieldRow label="Proving time" mono faint>
              {generatedLabel}
            </FieldRow>
  
          </div>
        </div>
  
        {/* ── Footer ────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-t border-zinc-800/40 px-5 py-2.5">
          <p className="text-[10px] text-zinc-700">
            Non-membership proven · nullifier prevents replay
          </p>
          {nullifierState === "error" && (
            <button
              type="button"
              onClick={checkNullifier}
              className={[
                "text-[10px] text-zinc-600 underline underline-offset-2",
                "hover:text-zinc-400 transition-colors duration-100",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500 rounded",
              ].join(" ")}
            >
              Retry check
            </button>
          )}
        </div>
      </div>
    );
  }
  
  export default ProofStatePanel;