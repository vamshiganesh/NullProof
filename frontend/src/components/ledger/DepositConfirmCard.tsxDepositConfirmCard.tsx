// frontend/src/components/ledger/DepositConfirmCard.tsx
//
// Shown after a successful assertCompliant() transaction broadcast.
// Displays:
//   • Animated success state (checkmark + confetti burst)
//   • Transaction hash — truncated, copyable, Etherscan link
//   • Block number     — polled via waitForTransactionReceipt until mined
//   • Gas used         — from receipt once available
//   • Proof cached     — confirms the ProofData is persisted in the
//                        CachedProofEnvelope (sessionStorage key shown)
//   • Nullifier spent  — re-queries readIsNullifierUsed() after mining
//   • "New deposit" / "View on Etherscan" actions

import React, {
    useEffect,
    useRef,
    useState,
  } from "react";
  
  import { createDefaultPublicClient } from "@/lib/chain/contracts";
  import { readIsNullifierUsed }        from "@/lib/chain/contracts";
  import { formatHash, formatTimestamp } from "@/lib/format";
  import { txUrl }                       from "@/lib/constants";
  import type { ProofData }              from "@/types/proof";
  
  // ---------------------------------------------------------------------------
  // Types
  // ---------------------------------------------------------------------------
  
  export interface DepositConfirmCardProps {
    txHash:       string;
    proof:        ProofData;
    /** Called when the user clicks "New deposit" */
    onReset:      () => void;
    className?:   string;
  }
  
  interface TxReceipt {
    blockNumber: bigint;
    gasUsed:     bigint;
    status:      "success" | "reverted";
    minedAt:     number;   // unix seconds (approx — Date.now at receipt time)
  }
  
  type MineState = "pending" | "mined" | "reverted" | "timeout";
  
  // ---------------------------------------------------------------------------
  // Confetti canvas
  // ---------------------------------------------------------------------------
  
  interface Particle {
    x:  number; y:  number;
    vx: number; vy: number;
    r:  number;
    color: string;
    opacity: number;
    decay: number;
  }
  
  const CONFETTI_COLORS = [
    "#34d399", "#4f98a3", "#a78bfa",
    "#fbbf24", "#f472b6", "#60a5fa",
  ];
  
  function spawnConfetti(canvas: HTMLCanvasElement) {
    const ctx  = canvas.getContext("2d");
    if (!ctx) return;
  
    const W = canvas.width;
    const H = canvas.height;
  
    // Spawn from centre-top of the card
    const particles: Particle[] = Array.from({ length: 52 }, () => {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
      const speed = 2.5 + Math.random() * 5;
      return {
        x:       W / 2,
        y:       H * 0.28,
        vx:      Math.cos(angle) * speed,
        vy:      Math.sin(angle) * speed,
        r:       2 + Math.random() * 3,
        color:   CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)]!,
        opacity: 1,
        decay:   0.013 + Math.random() * 0.012,
      };
    });
  
    let raf: number;
  
    function frame() {
      ctx!.clearRect(0, 0, W, H);
      let alive = false;
      for (const p of particles) {
        p.vy      += 0.12;          // gravity
        p.vx      *= 0.99;          // drag
        p.x       += p.vx;
        p.y       += p.vy;
        p.opacity -= p.decay;
        if (p.opacity <= 0) continue;
        alive = true;
        ctx!.save();
        ctx!.globalAlpha = Math.max(0, p.opacity);
        ctx!.fillStyle   = p.color;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.restore();
      }
      if (alive) raf = requestAnimationFrame(frame);
    }
  
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }
  
  // ---------------------------------------------------------------------------
  // Animated checkmark
  // ---------------------------------------------------------------------------
  
  function AnimatedCheck() {
    return (
      <div className="relative flex h-16 w-16 items-center justify-center">
        {/* Outer pulse ring */}
        <span
          className="absolute inset-0 animate-ping rounded-full bg-teal-500/20"
          style={{ animationDuration: "1.4s" }}
          aria-hidden="true"
        />
        {/* Static ring */}
        <span
          className="absolute inset-0 rounded-full border-2 border-teal-500/30"
          aria-hidden="true"
        />
        {/* Circle fill */}
        <span
          className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-500/15"
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-6 w-6 text-teal-400"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            style={{
              strokeDasharray:  "30",
              strokeDashoffset: "0",
              animation: "checkDraw 0.45s cubic-bezier(0.16,1,0.3,1) 0.15s both",
            }}
          >
            <style>{`
              @keyframes checkDraw {
                from { stroke-dashoffset: 30; opacity: 0; }
                to   { stroke-dashoffset: 0;  opacity: 1; }
              }
            `}</style>
            <path d="M5 13l4 4L19 7" />
          </svg>
        </span>
      </div>
    );
  }
  
  // ---------------------------------------------------------------------------
  // Detail row
  // ---------------------------------------------------------------------------
  
  function DetailRow({
    label,
    children,
    skeleton = false,
  }: {
    label:     string;
    children?: React.ReactNode;
    skeleton?: boolean;
  }) {
    return (
      <div className="flex items-center justify-between gap-4 py-2.5">
        <span className="shrink-0 text-[10px] uppercase tracking-widest text-zinc-700">
          {label}
        </span>
        {skeleton ? (
          <span className="h-3 w-28 animate-pulse rounded bg-zinc-800" />
        ) : (
          <span className="text-right text-[11px] font-medium text-zinc-300">
            {children}
          </span>
        )}
      </div>
    );
  }
  
  // ---------------------------------------------------------------------------
  // Copy button
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
  // Proof cache status badge
  // ---------------------------------------------------------------------------
  
  function CacheBadge({ cached }: { cached: boolean }) {
    if (cached) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-teal-500/25 bg-teal-500/8 px-1.5 py-0.5 text-[9px] font-semibold text-teal-400">
          <svg viewBox="0 0 10 10" className="h-2 w-2" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M1.5 5l2 2 5-4" />
          </svg>
          Cached
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-zinc-700/40 bg-zinc-900 px-1.5 py-0.5 text-[9px] font-medium text-zinc-600">
        Not cached
      </span>
    );
  }
  
  // ---------------------------------------------------------------------------
  // Nullifier spent badge
  // ---------------------------------------------------------------------------
  
  function NullifierSpentBadge({ state }: { state: "checking" | "spent" | "unknown" }) {
    if (state === "checking") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[9px] text-zinc-600">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-700" />
          Verifying…
        </span>
      );
    }
    if (state === "spent") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-teal-500/25 bg-teal-500/8 px-1.5 py-0.5 text-[9px] font-semibold text-teal-400">
          <svg viewBox="0 0 10 10" className="h-2 w-2" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M1.5 5l2 2 5-4" />
          </svg>
          Spent on-chain
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-zinc-700/40 bg-zinc-900 px-1.5 py-0.5 text-[9px] font-medium text-zinc-600">
        Unconfirmed
      </span>
    );
  }
  
  // ---------------------------------------------------------------------------
  // DepositConfirmCard
  // ---------------------------------------------------------------------------
  
  export function DepositConfirmCard({
    txHash,
    proof,
    onReset,
    className = "",
  }: DepositConfirmCardProps) {
    // ── Canvas ref for confetti ────────────────────────────────────────────
    const canvasRef  = useRef<HTMLCanvasElement>(null);
    const cardRef    = useRef<HTMLDivElement>(null);
  
    // ── Transaction receipt polling ────────────────────────────────────────
    const [mineState, setMineState]   = useState<MineState>("pending");
    const [receipt,   setReceipt]     = useState<TxReceipt | null>(null);
    const abortRef                    = useRef(false);
  
    useEffect(() => {
      abortRef.current = false;
  
      async function waitForReceipt() {
        try {
          const client = createDefaultPublicClient();
          const raw    = await client.waitForTransactionReceipt({
            hash:    txHash as `0x${string}`,
            timeout: 120_000,   // 2 min max wait
          });
  
          if (abortRef.current) return;
  
          if (raw.status === "reverted") {
            setMineState("reverted");
            return;
          }
  
          setReceipt({
            blockNumber: raw.blockNumber,
            gasUsed:     raw.gasUsed,
            status:      "success",
            minedAt:     Math.floor(Date.now() / 1_000),
          });
          setMineState("mined");
        } catch {
          if (!abortRef.current) setMineState("timeout");
        }
      }
  
      waitForReceipt();
      return () => { abortRef.current = true; };
    }, [txHash]);
  
    // ── Fire confetti once mined ───────────────────────────────────────────
    useEffect(() => {
      if (mineState !== "mined") return;
      const canvas = canvasRef.current;
      const card   = cardRef.current;
      if (!canvas || !card) return;
      const rect    = card.getBoundingClientRect();
      canvas.width  = rect.width;
      canvas.height = rect.height;
      const cleanup = spawnConfetti(canvas);
      return () => cleanup?.();
    }, [mineState]);
  
    // ── Nullifier spent check (after mining) ──────────────────────────────
    const [nullifierSpent, setNullifierSpent] =
      useState<"checking" | "spent" | "unknown">("checking");
  
    useEffect(() => {
      if (mineState !== "mined") return;
      let cancelled = false;
  
      async function checkNullifier() {
        try {
          const client = createDefaultPublicClient();
          const used   = await readIsNullifierUsed(
            proof.nullifier as `0x${string}`,
            client,
          );
          if (!cancelled) setNullifierSpent(used ? "spent" : "unknown");
        } catch {
          if (!cancelled) setNullifierSpent("unknown");
        }
      }
  
      checkNullifier();
      return () => { cancelled = true; };
    }, [mineState, proof.nullifier]);
  
    // ── Proof cache check ──────────────────────────────────────────────────
    // The CachedProofEnvelope is written by the prover layer before this
    // component mounts. We simply read back the key to confirm it exists.
    const CACHE_KEY    = `nullproof:cached:${proof.walletAddress?.toLowerCase()}`;
    const [proofCached, setProofCached] = useState(false);
  
    useEffect(() => {
      try {
        // sessionStorage may be blocked in sandboxed contexts; guard silently
        const raw = sessionStorage.getItem(CACHE_KEY);
        setProofCached(!!raw);
      } catch {
        setProofCached(false);
      }
    }, [CACHE_KEY]);
  
    // ── Heading + subtext by mine state ───────────────────────────────────
    const headings: Record<MineState, { title: string; sub: string }> = {
      pending:  {
        title: "Transaction broadcast",
        sub:   "Waiting for the block to be mined on Sepolia…",
      },
      mined:    {
        title: "Deposit confirmed",
        sub:   "Your compliance proof was accepted on-chain.",
      },
      reverted: {
        title: "Transaction reverted",
        sub:   "The transaction was included but execution failed.",
      },
      timeout:  {
        title: "Confirmation timeout",
        sub:   "Transaction was broadcast but not yet confirmed. Check Etherscan.",
      },
    };
  
    const { title, sub } = headings[mineState];
  
    // ── Gas formatted ──────────────────────────────────────────────────────
    const gasLabel = receipt
      ? receipt.gasUsed.toLocaleString("en-US") + " gas"
      : null;
  
    // ---------------------------------------------------------------------------
    // Render
    // ---------------------------------------------------------------------------
  
    return (
      <div
        ref={cardRef}
        className={[
          "relative flex flex-col overflow-hidden rounded-2xl border bg-zinc-950",
          mineState === "mined"
            ? "border-teal-500/25"
            : mineState === "reverted"
            ? "border-rose-500/25"
            : "border-zinc-800",
          className,
        ].join(" ")}
        aria-live="polite"
        aria-label="Deposit confirmation"
      >
        {/* Confetti canvas — absolute, pointer-events-none */}
        <canvas
          ref={canvasRef}
          className="pointer-events-none absolute inset-0 z-10"
          aria-hidden="true"
        />
  
        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-5 py-3">
          <div className="flex items-center gap-2">
            {/* Receipt icon */}
            <svg viewBox="0 0 18 18" className="h-4 w-4 text-zinc-400" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 2h10v14l-2-1.5L10 16 9 14.5 8 16l-2-1.5L4 16V2z" />
              <path d="M6.5 6h5M6.5 9h3" />
            </svg>
            <span className="text-xs font-semibold tracking-wide text-zinc-300">
              Transaction Receipt
            </span>
          </div>
  
          {/* Network badge */}
          <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[10px] font-medium text-zinc-600">
            Sepolia
          </span>
        </div>
  
        {/* ── Success / pending hero ────────────────────────────────────── */}
        <div className="flex flex-col items-center gap-3 px-5 py-7 text-center">
          {mineState === "mined" ? (
            <AnimatedCheck />
          ) : mineState === "reverted" ? (
            /* X mark */
            <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-rose-500/30 bg-rose-500/10">
              <svg viewBox="0 0 24 24" className="h-6 w-6 text-rose-400" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </div>
          ) : (
            /* Spinner */
            <div className="flex h-16 w-16 items-center justify-center">
              <svg className="h-10 w-10 animate-spin text-zinc-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M21 12a9 9 0 1 1-6-8.5" strokeLinecap="round" />
              </svg>
            </div>
          )}
  
          <div>
            <h2 className="text-sm font-semibold text-zinc-200">{title}</h2>
            <p className="mt-1 max-w-[26ch] text-[11px] leading-relaxed text-zinc-600">
              {sub}
            </p>
          </div>
  
          {/* Pending block progress hint */}
          {mineState === "pending" && (
            <div className="flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
              <span className="text-[10px] text-zinc-600 tabular-nums">
                Awaiting block inclusion…
              </span>
            </div>
          )}
        </div>
  
        {/* ── Detail rows ───────────────────────────────────────────────── */}
        <div className="border-t border-zinc-800/60 px-5">
          <div className="divide-y divide-zinc-800/40">
  
            {/* Transaction hash */}
            <DetailRow label="Tx hash">
              <span className="flex items-center gap-1.5">
                <span
                  className="cursor-default font-mono text-[11px] text-zinc-400"
                  title={txHash}
                >
                  {formatHash(txHash, 10, 8)}
                </span>
                <CopyBtn value={txHash} label="transaction hash" />
                <a
                  href={txUrl(txHash)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="View transaction on Etherscan"
                  title="View on Etherscan"
                  className={[
                    "rounded p-0.5 text-zinc-700 transition-colors duration-150",
                    "hover:text-zinc-400 hover:bg-zinc-800",
                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500",
                  ].join(" ")}
                >
                  <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 2H2a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V6" />
                    <path d="M6.5 1H9v2.5M9 1 5.5 4.5" />
                  </svg>
                </a>
              </span>
            </DetailRow>
  
            {/* Block number */}
            <DetailRow
              label="Block"
              skeleton={mineState === "pending"}
            >
              {receipt ? (
                <span className="font-mono tabular-nums text-zinc-300">
                  #{receipt.blockNumber.toLocaleString("en-US")}
                </span>
              ) : mineState === "timeout" ? (
                <span className="text-zinc-600">—</span>
              ) : null}
            </DetailRow>
  
            {/* Status */}
            <DetailRow label="Status">
              {mineState === "pending" && (
                <span className="inline-flex items-center gap-1.5 text-amber-400">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
                  Pending
                </span>
              )}
              {mineState === "mined" && (
                <span className="inline-flex items-center gap-1.5 text-teal-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
                  Success
                </span>
              )}
              {mineState === "reverted" && (
                <span className="inline-flex items-center gap-1.5 text-rose-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                  Reverted
                </span>
              )}
              {mineState === "timeout" && (
                <span className="inline-flex items-center gap-1.5 text-zinc-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
                  Unconfirmed
                </span>
              )}
            </DetailRow>
  
            {/* Gas used */}
            {gasLabel && (
              <DetailRow label="Gas used">
                <span className="font-mono tabular-nums text-zinc-400">
                  {gasLabel}
                </span>
              </DetailRow>
            )}
  
            {/* Mined at */}
            {receipt && (
              <DetailRow label="Mined at">
                <span className="text-zinc-500">
                  {formatTimestamp(receipt.minedAt, {
                    month:  "short",
                    day:    "numeric",
                    hour:   "numeric",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>
              </DetailRow>
            )}
  
            {/* Nullifier */}
            <DetailRow label="Nullifier">
              <span className="flex flex-col items-end gap-1">
                <span
                  className="cursor-default font-mono text-[10px] text-zinc-500"
                  title={proof.nullifier}
                >
                  {formatHash(proof.nullifier, 10, 6)}
                </span>
                <NullifierSpentBadge state={nullifierSpent} />
              </span>
            </DetailRow>
  
            {/* Proof cached */}
            <DetailRow label="Proof cache">
              <span className="flex flex-col items-end gap-1">
                <CacheBadge cached={proofCached} />
                {proofCached && (
                  <span
                    className="cursor-default font-mono text-[9px] text-zinc-700"
                    title={CACHE_KEY}
                  >
                    {CACHE_KEY.length > 32
                      ? CACHE_KEY.slice(0, 18) + "…" + CACHE_KEY.slice(-10)
                      : CACHE_KEY}
                  </span>
                )}
              </span>
            </DetailRow>
  
            {/* Proof hash */}
            <DetailRow label="Proof hash">
              <span className="flex items-center gap-1.5">
                <span
                  className="cursor-default font-mono text-[10px] text-zinc-600"
                  title={proof.proofHash}
                >
                  {formatHash(proof.proofHash, 8, 6)}
                </span>
                <CopyBtn value={proof.proofHash} label="proof hash" />
              </span>
            </DetailRow>
  
          </div>
        </div>
  
        {/* ── Reverted warning ─────────────────────────────────────────── */}
        {mineState === "reverted" && (
          <div
            role="alert"
            className="mx-5 mt-4 rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2.5"
          >
            <p className="text-[11px] leading-relaxed text-rose-400">
              <span className="font-semibold">Transaction reverted.</span>{" "}
              Possible causes: nullifier already used, proof expired, or
              protocol paused. Check Etherscan for the revert reason, then
              generate a fresh proof.
            </p>
          </div>
        )}
  
        {/* ── Actions ───────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2 px-5 pb-5 pt-4 sm:flex-row">
          {/* Etherscan CTA */}
          <a
            href={txUrl(txHash)!}
            target="_blank"
            rel="noopener noreferrer"
            className={[
              "flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-3",
              "text-sm font-semibold transition-colors duration-150",
              "border-zinc-800 bg-zinc-900 text-zinc-400",
              "hover:border-zinc-700 hover:text-zinc-200",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",
            ].join(" ")}
          >
            <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5.5 2.5H3a1 1 0 0 0-1 1v7.5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V8" />
              <path d="M8.5 1H13v4.5M13 1 7 7" />
            </svg>
            View on Etherscan
          </a>
  
          {/* New deposit CTA */}
          <button
            type="button"
            onClick={onReset}
            className={[
              "flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3",
              "text-sm font-semibold transition-all duration-150",
              "bg-teal-600 text-white",
              "hover:bg-teal-500 active:scale-[0.99]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",
            ].join(" ")}
          >
            <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M7 1v12M3 5l4-4 4 4" />
            </svg>
            New deposit
          </button>
        </div>
      </div>
    );
  }
  
  export default DepositConfirmCard;