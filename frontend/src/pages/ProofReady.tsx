// frontend/src/pages/ProofReady.tsx
//
// Route: /app/proofs/ready — Privacy Proof Active
//
// This screen has three sub-phases driven by proofStore.status:
//
//   "generated"  → Proof ready, waiting for user to submit on-chain
//   "submitting" → Transaction pending, wallet spinner
//   "confirmed"  → tx confirmed — celebratory state with receipt
//
// Layout:
//   • Hero "shield" with animated proof-active glow
//   • Proof data card  (nullifier · root · public inputs · proof hex)
//   • On-chain submit CTA with live tx state
//   • Confirmed receipt panel (tx hash, block, time)
//   • "Generate new proof" / "Back to dashboard" actions

import React, {
    useCallback,
    useEffect,
    useRef,
    useState,
  } from "react";
  import { useNavigate } from "react-router-dom";
  
  import {
    useProofStore,
    selectProofStatus,
    selectProofResult,
    selectSubmission,
    selectElapsedLabel,
    selectReadyToSubmit,
    selectIsConfirmed,
  } from "@/store/proofStore";
  import {
    useWalletStore,
    selectAddress,
  } from "@/store/walletStore";
  import {
    useSanctionsStore,
    selectCurrentRoot,
  } from "@/store/sanctionsStore";
  import { formatHash } from "@/lib/format";
  import { SUPPORTED_CHAIN_NAME } from "@/lib/constants";
  
  // ---------------------------------------------------------------------------
  // Tiny helpers
  // ---------------------------------------------------------------------------
  
  function timeAgo(unixMs: number): string {
    const diff = Math.floor((Date.now() - unixMs) / 1000);
    if (diff < 60)  return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  }
  
  function formatDate(unixMs: number): string {
    return new Date(unixMs).toLocaleString(undefined, {
      month:  "short",
      day:    "numeric",
      hour:   "2-digit",
      minute: "2-digit",
    });
  }
  
  // ---------------------------------------------------------------------------
  // Copy-to-clipboard hook
  // ---------------------------------------------------------------------------
  
  function useCopy(timeoutMs = 1800) {
    const [copied, setCopied] = useState<string | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout>>();
  
    const copy = useCallback((text: string, key: string) => {
      void navigator.clipboard.writeText(text).then(() => {
        clearTimeout(timerRef.current);
        setCopied(key);
        timerRef.current = setTimeout(() => setCopied(null), timeoutMs);
      });
    }, [timeoutMs]);
  
    useEffect(() => () => clearTimeout(timerRef.current), []);
  
    return { copied, copy };
  }
  
  // ---------------------------------------------------------------------------
  // AnimatedShield — SVG hero graphic, states: idle | active | confirmed
  // ---------------------------------------------------------------------------
  
  type ShieldPhase = "ready" | "submitting" | "confirmed";
  
  function AnimatedShield({ phase }: { phase: ShieldPhase }) {
    return (
      <div className="relative flex h-24 w-24 items-center justify-center sm:h-28 sm:w-28">
        {/* Outer pulse rings */}
        {(phase === "ready" || phase === "submitting") && (
          <>
            <span
              className="absolute inset-0 rounded-full border border-teal-500/20 animate-ping"
              style={{ animationDuration: "2.4s" }}
              aria-hidden="true"
            />
            <span
              className="absolute inset-3 rounded-full border border-teal-500/15 animate-ping"
              style={{ animationDuration: "2.4s", animationDelay: "0.6s" }}
              aria-hidden="true"
            />
          </>
        )}
  
        {/* Confirmed burst rings */}
        {phase === "confirmed" && (
          <>
            <span
              className="absolute inset-0 rounded-full border border-teal-400/25 animate-ping"
              style={{ animationDuration: "1.8s" }}
              aria-hidden="true"
            />
            <span
              className="absolute -inset-3 rounded-full border border-teal-500/10 animate-ping"
              style={{ animationDuration: "2.2s", animationDelay: "0.4s" }}
              aria-hidden="true"
            />
          </>
        )}
  
        {/* Glow disc */}
        <div
          className={[
            "absolute inset-2 rounded-full blur-xl transition-all duration-700",
            phase === "confirmed"
              ? "bg-teal-400/25"
              : phase === "submitting"
              ? "bg-teal-500/18 animate-pulse"
              : "bg-teal-500/12",
          ].join(" ")}
          aria-hidden="true"
        />
  
        {/* Shield SVG */}
        <div className="relative z-10">
          <svg
            viewBox="0 0 56 64"
            width="52"
            height="60"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-label={
              phase === "confirmed"
                ? "Proof confirmed"
                : phase === "submitting"
                ? "Submitting proof"
                : "Proof ready"
            }
            role="img"
          >
            <defs>
              <linearGradient id="shield-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={phase === "confirmed" ? "#34d399" : "#2dd4bf"} stopOpacity="0.18" />
                <stop offset="100%" stopColor={phase === "confirmed" ? "#059669" : "#0d9488"} stopOpacity="0.06" />
              </linearGradient>
              <filter id="shield-glow">
                <feGaussianBlur stdDeviation="1.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
  
            {/* Shield body */}
            <path
              d="M28 2L4 12v18c0 16 12 28 24 32C52 58 52 46 52 30V12L28 2z"
              fill="url(#shield-grad)"
              stroke={phase === "confirmed" ? "#34d399" : "#2dd4bf"}
              strokeWidth="1.25"
              filter="url(#shield-glow)"
            />
  
            {/* Confirmed check */}
            {phase === "confirmed" && (
              <path
                d="M17 32l8 8 14-16"
                stroke="#34d399"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                filter="url(#shield-glow)"
              />
            )}
  
            {/* Submitting spinner */}
            {phase === "submitting" && (
              <circle
                cx="28"
                cy="31"
                r="8"
                stroke="#2dd4bf"
                strokeWidth="1.5"
                strokeDasharray="20 32"
                strokeLinecap="round"
                className="animate-spin"
                style={{ transformOrigin: "28px 31px" }}
              />
            )}
  
            {/* Ready lock icon */}
            {phase === "ready" && (
              <g>
                <rect x="20" y="29" width="16" height="12" rx="2" stroke="#2dd4bf" strokeWidth="1.4" fill="none" />
                <path d="M22 29v-3a6 6 0 1 1 12 0v3" stroke="#2dd4bf" strokeWidth="1.4" strokeLinecap="round" />
                <circle cx="28" cy="35" r="1.5" fill="#2dd4bf" />
              </g>
            )}
          </svg>
        </div>
      </div>
    );
  }
  
  // ---------------------------------------------------------------------------
  // DataRow — mono key/value row with copy button
  // ---------------------------------------------------------------------------
  
  function DataRow({
    label,
    value,
    copyKey,
    fullValue,
    copied,
    onCopy,
    accent = false,
  }: {
    label:     string;
    value:     string;
    copyKey:   string;
    fullValue: string;
    copied:    string | null;
    onCopy:    (text: string, key: string) => void;
    accent?:   boolean;
  }) {
    const isCopied = copied === copyKey;
  
    return (
      <div className="group flex items-center justify-between gap-3 rounded-xl border border-zinc-800/80 bg-zinc-900/30 px-3.5 py-2.5 transition-colors hover:border-zinc-700/80 hover:bg-zinc-900/50">
        <div className="min-w-0 flex-1">
          <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-widest text-zinc-600">
            {label}
          </p>
          <p className={[
            "truncate font-mono text-[11px] leading-tight",
            accent ? "text-teal-300" : "text-zinc-400",
          ].join(" ")}>
            {value}
          </p>
        </div>
        <button
          onClick={() => onCopy(fullValue, copyKey)}
          aria-label={isCopied ? "Copied" : `Copy ${label}`}
          className={[
            "shrink-0 rounded-lg border px-2 py-1 text-[9px] font-semibold uppercase tracking-wider",
            "transition-all duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal-500",
            isCopied
              ? "border-teal-500/30 bg-teal-500/10 text-teal-400"
              : "border-zinc-700 bg-zinc-800/60 text-zinc-600 hover:border-zinc-600 hover:text-zinc-400 group-hover:border-zinc-600",
          ].join(" ")}
        >
          {isCopied ? "✓ Copied" : "Copy"}
        </button>
      </div>
    );
  }
  
  // ---------------------------------------------------------------------------
  // ConfirmedReceipt
  // ---------------------------------------------------------------------------
  
  function ConfirmedReceipt({
    txHash,
    blockNumber,
    confirmedAt,
  }: {
    txHash:      string;
    blockNumber: bigint;
    confirmedAt: number;
  }) {
    const { copied, copy } = useCopy();
  
    return (
      <div className="rounded-2xl border border-teal-500/20 bg-teal-500/4 p-5">
        <div className="mb-4 flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-xl border border-teal-500/25 bg-teal-500/10">
            <CheckIcon className="h-3.5 w-3.5 text-teal-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-teal-300">On-chain Confirmed</p>
            <p className="text-[10px] text-zinc-600">{formatDate(confirmedAt)} · {SUPPORTED_CHAIN_NAME}</p>
          </div>
          <div className="ml-auto flex items-center gap-1 rounded-full border border-teal-500/20 bg-teal-500/8 px-2.5 py-1">
            <span className="h-1 w-1 animate-pulse rounded-full bg-teal-400" aria-hidden="true" />
            <span className="text-[10px] font-medium text-teal-400">Verified</span>
          </div>
        </div>
  
        <div className="space-y-2">
          <DataRow
            label="Transaction Hash"
            value={formatHash(txHash, 12, 8)}
            fullValue={txHash}
            copyKey="txHash"
            copied={copied}
            onCopy={copy}
            accent
          />
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-3.5 py-2.5">
              <p className="text-[9px] font-semibold uppercase tracking-widest text-zinc-600">Block</p>
              <p className="mt-0.5 font-mono text-xs text-zinc-300">#{blockNumber.toString()}</p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-3.5 py-2.5">
              <p className="text-[9px] font-semibold uppercase tracking-widest text-zinc-600">Confirmed</p>
              <p className="mt-0.5 font-mono text-xs text-zinc-300">{timeAgo(confirmedAt)}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  // ---------------------------------------------------------------------------
  // ProofDataCard
  // ---------------------------------------------------------------------------
  
  function ProofDataCard({
    proof,
    publicInputs,
    nullifier,
    rootUsed,
    generatedAt,
    elapsedLabel,
  }: {
    proof:        string;
    publicInputs: string[];
    nullifier:    string;
    rootUsed:     string;
    generatedAt:  number;
    elapsedLabel: string | null;
  }) {
    const { copied, copy } = useCopy();
    const [expanded, setExpanded] = useState(false);
  
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <DataIcon className="h-3.5 w-3.5 text-zinc-500" />
            <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
              Proof Data
            </h3>
          </div>
          <div className="flex items-center gap-2">
            {elapsedLabel && (
              <span className="rounded-lg border border-teal-500/20 bg-teal-500/8 px-2 py-0.5 font-mono text-[10px] text-teal-400">
                Generated in {elapsedLabel}
              </span>
            )}
            <span className="text-[10px] text-zinc-700">{timeAgo(generatedAt)}</span>
          </div>
        </div>
  
        {/* Rows */}
        <div className="space-y-2 p-4">
          <DataRow
            label="Nullifier"
            value={formatHash(nullifier, 14, 10)}
            fullValue={nullifier}
            copyKey="nullifier"
            copied={copied}
            onCopy={copy}
            accent
          />
          <DataRow
            label="Merkle Root"
            value={formatHash(rootUsed, 14, 10)}
            fullValue={rootUsed}
            copyKey="rootUsed"
            copied={copied}
            onCopy={copy}
          />
          {publicInputs.map((inp, i) => (
            <DataRow
              key={i}
              label={`Public Input [${i}]`}
              value={formatHash(inp, 14, 10)}
              fullValue={inp}
              copyKey={`pi-${i}`}
              copied={copied}
              onCopy={copy}
            />
          ))}
  
          {/* Proof hex (expandable) */}
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 px-3.5 py-2.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-widest text-zinc-600">
                  Proof Bytes
                </p>
                <p className="font-mono text-[10px] text-zinc-600">
                  {Math.ceil((proof.length - 2) / 2)} bytes
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => copy(proof, "proof")}
                  aria-label={copied === "proof" ? "Copied" : "Copy proof hex"}
                  className={[
                    "rounded-lg border px-2 py-1 text-[9px] font-semibold uppercase tracking-wider",
                    "transition-all duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal-500",
                    copied === "proof"
                      ? "border-teal-500/30 bg-teal-500/10 text-teal-400"
                      : "border-zinc-700 bg-zinc-800/60 text-zinc-600 hover:border-zinc-600 hover:text-zinc-400",
                  ].join(" ")}
                >
                  {copied === "proof" ? "✓ Copied" : "Copy hex"}
                </button>
                <button
                  onClick={() => setExpanded((v) => !v)}
                  aria-label={expanded ? "Collapse proof" : "Expand proof"}
                  className="rounded-lg border border-zinc-700 bg-zinc-800/60 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-zinc-600 transition-all hover:border-zinc-600 hover:text-zinc-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal-500"
                >
                  {expanded ? "Hide" : "Show"}
                </button>
              </div>
            </div>
  
            {expanded && (
              <div className="mt-2.5 max-h-28 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950/80 p-2.5">
                <p className="break-all font-mono text-[9px] leading-relaxed text-zinc-600">
                  {proof}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
  
  // ---------------------------------------------------------------------------
  // SubmitButton
  // ---------------------------------------------------------------------------
  
  function SubmitButton({
    phase,
    onSubmit,
    disabled,
  }: {
    phase:    ShieldPhase;
    onSubmit: () => void;
    disabled: boolean;
  }) {
    const isSubmitting = phase === "submitting";
    const isConfirmed  = phase === "confirmed";
  
    return (
      <button
        onClick={onSubmit}
        disabled={disabled || isConfirmed}
        aria-label={
          isConfirmed ? "Proof already confirmed" :
          isSubmitting ? "Submitting…" :
          "Submit proof on-chain"
        }
        className={[
          "relative flex w-full items-center justify-center gap-2.5 overflow-hidden rounded-2xl",
          "py-3.5 text-sm font-semibold transition-all duration-300",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1 focus-visible:ring-offset-zinc-950",
          isConfirmed
            ? "border border-teal-500/20 bg-teal-500/8 text-teal-400 cursor-default"
            : isSubmitting
            ? "border border-teal-500/20 bg-teal-500/10 text-teal-400 cursor-wait"
            : disabled
            ? "border border-zinc-800 bg-zinc-900/40 text-zinc-600 cursor-not-allowed"
            : "border border-teal-500/30 bg-teal-500/10 text-teal-300 hover:bg-teal-500/16 hover:border-teal-400/40 hover:text-teal-200 active:scale-[0.99]",
        ].join(" ")}
      >
        {/* Shimmer sweep while submitting */}
        {isSubmitting && (
          <span
            className="pointer-events-none absolute inset-0 -translate-x-full animate-[shimmer_1.4s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-teal-400/8 to-transparent"
            aria-hidden="true"
          />
        )}
  
        {isConfirmed ? (
          <>
            <CheckIcon className="h-4 w-4" aria-hidden="true" />
            Proof Confirmed On-Chain
          </>
        ) : isSubmitting ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border border-teal-600 border-t-teal-300" aria-hidden="true" />
            Awaiting Wallet Confirmation…
          </>
        ) : (
          <>
            <ChainIcon className="h-4 w-4" aria-hidden="true" />
            Submit Proof On-Chain
          </>
        )}
      </button>
    );
  }
  
  // ---------------------------------------------------------------------------
  // PrivacyBadges — what this proof guarantees
  // ---------------------------------------------------------------------------
  
  function PrivacyBadges() {
    const badges = [
      { icon: <ZkIcon className="h-3 w-3" />, label: "Zero-knowledge" },
      { icon: <ShieldSmIcon className="h-3 w-3" />, label: "Non-sanctioned" },
      { icon: <EyeOffIcon className="h-3 w-3" />, label: "Address hidden" },
      { icon: <UnlinkIcon className="h-3 w-3" />, label: "Non-linkable" },
    ];
  
    return (
      <div className="flex flex-wrap gap-1.5">
        {badges.map(({ icon, label }) => (
          <div
            key={label}
            className="flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900/60 px-2.5 py-1"
          >
            <span className="text-teal-500" aria-hidden="true">{icon}</span>
            <span className="text-[10px] font-medium text-zinc-500">{label}</span>
          </div>
        ))}
      </div>
    );
  }
  
  // ---------------------------------------------------------------------------
  // Empty / redirect guard
  // ---------------------------------------------------------------------------
  
  function NoProofGuard() {
    const navigate = useNavigate();
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900">
          <AlertIcon className="h-5 w-5 text-zinc-600" />
        </div>
        <div>
          <p className="text-sm font-medium text-zinc-400">No proof found</p>
          <p className="mt-1 text-xs text-zinc-700">Generate a proof first before viewing this screen.</p>
        </div>
        <button
          onClick={() => navigate("/app/proofs/generate")}
          className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-xs font-medium text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-600"
        >
          Generate Proof
        </button>
      </div>
    );
  }
  
  // ---------------------------------------------------------------------------
  // ProofReady — main page
  // ---------------------------------------------------------------------------
  
  export function ProofReady() {
    const navigate    = useNavigate();
    const address     = useWalletStore(selectAddress);
    const currentRoot = useSanctionsStore(selectCurrentRoot);
  
    const status       = useProofStore(selectProofStatus);
    const result       = useProofStore(selectProofResult);
    const submission   = useProofStore(selectSubmission);
    const elapsedLabel = useProofStore(selectElapsedLabel);
    const readyToSubmit = useProofStore(selectReadyToSubmit);
    const isConfirmed   = useProofStore(selectIsConfirmed);
  
    const {
      startSubmission,
      setConfirmed,
      setError,
      reset,
    } = useProofStore();
  
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
      const id = setTimeout(() => setMounted(true), 40);
      return () => clearTimeout(id);
    }, []);
  
    // Derived phase for visual components
    const phase: ShieldPhase =
      isConfirmed       ? "confirmed" :
      status === "submitting" ? "submitting" :
      "ready";
  
    // ---------------------------------------------------------------------------
    // Submit handler — calls the verifier contract
    // ---------------------------------------------------------------------------
    const handleSubmit = useCallback(async () => {
        if (!result || !address) return;
        startSubmission();
      
        try {
          const { writeAssertCompliant, createDefaultPublicClient } = await import(
            "@/lib/chain/contracts"
          );
      
          const txHash = await writeAssertCompliant({
            proof:        result.proof,
            publicInputs: result.publicInputs,
            nullifier:    result.nullifier,
            account:      address,
          });
      
          // Wait for the transaction receipt to get block number
          const publicClient = createDefaultPublicClient();
          const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      
          setConfirmed({
            txHash,
            confirmedAt:  Date.now(),
            blockNumber:  receipt.blockNumber,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Submission failed";
          setError(msg);
        }
      }, [result, address, startSubmission, setConfirmed, setError]);
  
    // ---------------------------------------------------------------------------
    // Root staleness check
    // ---------------------------------------------------------------------------
    const rootMismatch =
      result && currentRoot && result.rootUsed !== currentRoot;
  
    // Guard: no proof
    if (!result && status !== "submitting" && status !== "confirmed") {
      return (
        <div className="p-6">
          <NoProofGuard />
        </div>
      );
    }
  
    return (
      <div
        className={[
          "flex flex-col gap-5 p-4 pb-10 sm:p-6 lg:p-8 transition-all duration-500",
          mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3",
        ].join(" ")}
      >
        {/* ── Hero section ─────────────────────────────────────────────── */}
        <div className="flex flex-col items-center gap-4 py-6 text-center sm:py-8">
          <AnimatedShield phase={phase} />
  
          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight text-zinc-100 sm:text-2xl">
              {isConfirmed
                ? "Proof Confirmed On-Chain"
                : status === "submitting"
                ? "Submitting to Chain…"
                : "Privacy Proof Active"}
            </h1>
            <p className="text-xs text-zinc-600">
              {isConfirmed
                ? `Verified on ${SUPPORTED_CHAIN_NAME} · Non-membership proven`
                : status === "submitting"
                ? "Waiting for wallet confirmation and block inclusion"
                : "Your address is cryptographically proven non-sanctioned"}
            </p>
          </div>
  
          <PrivacyBadges />
        </div>
  
        {/* ── Address / chain strip ─────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {address && (
            <div className="flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-500" aria-hidden="true" />
              <span className="font-mono text-xs text-zinc-500">
                {formatHash(address, 8, 6)}
              </span>
            </div>
          )}
          <div className="flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" aria-hidden="true" />
            <span className="text-xs text-zinc-600">{SUPPORTED_CHAIN_NAME}</span>
          </div>
          {elapsedLabel && (
            <div className="flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-1.5">
              <ClockIcon className="h-3 w-3 text-zinc-600" aria-hidden="true" />
              <span className="font-mono text-xs text-zinc-600">Proved in {elapsedLabel}</span>
            </div>
          )}
        </div>
  
        {/* ── Root staleness warning ────────────────────────────────────── */}
        {rootMismatch && !isConfirmed && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
            <div>
              <p className="text-xs font-semibold text-amber-300">Sanctions root has changed</p>
              <p className="mt-0.5 text-[11px] text-amber-600">
                The on-chain root no longer matches the root used for this proof.
                Consider regenerating before submitting.
              </p>
              <button
                onClick={() => { reset(); navigate("/app/proofs/generate"); }}
                className="mt-2 text-[10px] font-semibold text-amber-400 underline underline-offset-2 hover:text-amber-300 focus-visible:outline-none"
              >
                Regenerate proof →
              </button>
            </div>
          </div>
        )}
  
        {/* ── Main grid ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
  
          {/* Left: proof data card */}
          <div className="flex flex-col gap-4">
            {result && (
              <ProofDataCard
                proof={result.proof}
                publicInputs={result.publicInputs}
                nullifier={result.nullifier}
                rootUsed={result.rootUsed}
                generatedAt={result.generatedAt}
                elapsedLabel={elapsedLabel}
              />
            )}
  
            {/* Confirmed receipt */}
            {isConfirmed && submission && (
              <ConfirmedReceipt
                txHash={submission.txHash}
                blockNumber={submission.blockNumber}
                confirmedAt={submission.confirmedAt}
              />
            )}
          </div>
  
          {/* Right: actions panel */}
          <div className="flex flex-col gap-3">
            {/* Submit CTA */}
            {!isConfirmed && (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4">
                <div className="mb-4 flex items-center gap-2">
                  <ChainIcon className="h-3.5 w-3.5 text-zinc-500" aria-hidden="true" />
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                    Submit On-Chain
                  </h3>
                </div>
                <p className="mb-4 text-[11px] leading-relaxed text-zinc-600">
                  Submit this proof to the NullProof verifier contract. The smart contract
                  will verify the ZK proof and log your nullifier without revealing your address.
                </p>
                <SubmitButton
                  phase={phase}
                  onSubmit={handleSubmit}
                  disabled={!readyToSubmit}
                />
                {status === "error" && (
                  <p className="mt-2.5 text-center text-[11px] text-rose-400">
                    {useProofStore.getState().error}
                  </p>
                )}
              </div>
            )}
  
            {/* What this proves */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4">
              <div className="mb-3 flex items-center gap-2">
                <InfoIcon className="h-3.5 w-3.5 text-zinc-500" aria-hidden="true" />
                <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                  What This Proves
                </h3>
              </div>
              <ul className="space-y-2.5">
                {[
                  {
                    icon: <CheckIcon className="h-3 w-3 text-teal-500" />,
                    text: "Your address is a leaf in the Merkle tree of non-sanctioned addresses",
                  },
                  {
                    icon: <CheckIcon className="h-3 w-3 text-teal-500" />,
                    text: "The Merkle root matches the on-chain snapshot at time of generation",
                  },
                  {
                    icon: <CheckIcon className="h-3 w-3 text-teal-500" />,
                    text: "No third party learns which leaf or address corresponds to yours",
                  },
                  {
                    icon: <CheckIcon className="h-3 w-3 text-teal-500" />,
                    text: "The nullifier prevents the same proof being submitted twice",
                  },
                ].map(({ icon, text }, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0" aria-hidden="true">{icon}</span>
                    <span className="text-[11px] leading-relaxed text-zinc-500">{text}</span>
                  </li>
                ))}
              </ul>
            </div>
  
            {/* Secondary actions */}
            <div className="flex flex-col gap-2">
              <button
                onClick={() => { reset(); navigate("/app/proofs/generate"); }}
                className={[
                  "flex items-center justify-center gap-2 rounded-xl border border-zinc-800 py-2.5",
                  "text-xs font-medium text-zinc-600 transition-colors",
                  "hover:border-zinc-700 hover:text-zinc-400",
                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-700",
                ].join(" ")}
              >
                <RefreshIcon className="h-3 w-3" aria-hidden="true" />
                Generate New Proof
              </button>
              <button
                onClick={() => navigate("/app")}
                className={[
                  "flex items-center justify-center gap-2 rounded-xl border border-zinc-800 py-2.5",
                  "text-xs font-medium text-zinc-600 transition-colors",
                  "hover:border-zinc-700 hover:text-zinc-400",
                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-700",
                ].join(" ")}
              >
                <HomeIcon className="h-3 w-3" aria-hidden="true" />
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  export default ProofReady;
  
  // ---------------------------------------------------------------------------
  // Icons
  // ---------------------------------------------------------------------------
  
  function CheckIcon({ className }: { className?: string }) {
    return (
      <svg viewBox="0 0 12 12" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 6l2.5 2.5L10 3.5" />
      </svg>
    );
  }
  function DataIcon({ className }: { className?: string }) {
    return (
      <svg viewBox="0 0 14 14" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <ellipse cx="7" cy="4" rx="5" ry="2" />
        <path d="M2 4v3c0 1.1 2.24 2 5 2s5-.9 5-2V4" />
        <path d="M2 7v3c0 1.1 2.24 2 5 2s5-.9 5-2V7" />
      </svg>
    );
  }
  function ChainIcon({ className }: { className?: string }) {
    return (
      <svg viewBox="0 0 14 14" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5.5 8.5l3-3" />
        <path d="M8 6.5l1.5-1.5a2.12 2.12 0 0 1 3 3L11 9.5" />
        <path d="M6 7.5L4.5 9a2.12 2.12 0 0 1-3-3L3 4.5" />
      </svg>
    );
  }
  function ClockIcon({ className }: { className?: string }) {
    return (
      <svg viewBox="0 0 14 14" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="7" cy="7" r="5.5" />
        <path d="M7 4.5V7l2 1.5" />
      </svg>
    );
  }
  function AlertIcon({ className }: { className?: string }) {
    return (
      <svg viewBox="0 0 14 14" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M7 1.5L1.5 11.5h11L7 1.5z" />
        <path d="M7 6v3M7 10.5v.5" />
      </svg>
    );
  }
  function InfoIcon({ className }: { className?: string }) {
    return (
      <svg viewBox="0 0 14 14" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="7" cy="7" r="5.5" />
        <path d="M7 9.5V7M7 4.5v.5" />
      </svg>
    );
  }
  function RefreshIcon({ className }: { className?: string }) {
    return (
      <svg viewBox="0 0 12 12" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M10 6A4 4 0 1 1 6 2" />
        <path d="M6 2l2-2M6 2l2 2" />
      </svg>
    );
  }
  function HomeIcon({ className }: { className?: string }) {
    return (
      <svg viewBox="0 0 14 14" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 6.5L7 2l5 4.5" />
        <path d="M3.5 5.5V12h7V5.5" />
        <path d="M5.5 12V8.5h3V12" />
      </svg>
    );
  }
  function ZkIcon({ className }: { className?: string }) {
    return (
      <svg viewBox="0 0 12 12" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M1.5 3h9M1.5 9h9M3 3L9 9" />
      </svg>
    );
  }
  function ShieldSmIcon({ className }: { className?: string }) {
    return (
      <svg viewBox="0 0 12 12" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 1L2 3v3.5C2 9.5 4 11 6 11.5 10 11 10 8.5 10 6.5V3L6 1z" />
      </svg>
    );
  }
  function EyeOffIcon({ className }: { className?: string }) {
    return (
      <svg viewBox="0 0 12 12" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 2l8 8M4.7 4.7a2 2 0 0 0 2.6 2.6" />
        <path d="M1.5 6S3 3 6 3c.7 0 1.4.2 2 .5M8.7 4.7C9.7 5.2 10.5 6 10.5 6S9 9 6 9c-.5 0-1-.1-1.4-.3" />
      </svg>
    );
  }
  function UnlinkIcon({ className }: { className?: string }) {
    return (
      <svg viewBox="0 0 12 12" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4.5 7.5l3-3" />
        <path d="M3 2L2 3M10 9l-1 1M7 5l2-2a2 2 0 1 1 0 2.83" />
        <path d="M5 7l-2 2a2 2 0 0 1 0-2.83" />
      </svg>
    );
  }