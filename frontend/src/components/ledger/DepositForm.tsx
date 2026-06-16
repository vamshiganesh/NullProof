// frontend/src/components/ledger/DepositForm.tsx
//
// Amount input + transaction details panel shown before a user submits
// an assertCompliant() call via ComplianceGate.
//
// Responsibilities:
//   • ETH amount input with live USD equivalent (price fetched via CoinGecko)
//   • Transaction detail rows: network fee estimate, validity window, nullifier preview
//   • Inline validation: insufficient balance, below dust threshold, paused protocol
//   • Submit button that fires writeAssertCompliant() with the attached proof
//   • Emits onSuccess(txHash) so the parent page can transition to DepositConfirmCard

import React, {
    useCallback,
    useEffect,
    useRef,
    useState,
  } from "react";
  import { parseEther, formatEther, type Address } from "viem";
  import { useAccount, useBalance } from "wagmi";
  
  import {
    readValidityWindow,
    readSubmissionPaused,
    createDefaultPublicClient,
  } from "@/lib/chain/contracts";
  import { submitAssertCompliant } from "@/lib/chain/submitProof";
  import { writeVaultDeposit } from "@/lib/chain/contracts";
  import { formatETH, formatDuration, formatNullifier, formatHash } from "@/lib/format";
  import { COMPLIANT_VAULT_ADDRESS, DEFAULT_VALIDITY_WINDOW_SECONDS } from "@/lib/constants";
  import type { ProofData } from "@/types/proof";
  
  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------
  
  /** Minimum deposit in ETH — anything below this is considered dust. */
  const DUST_THRESHOLD_ETH = 0.0001;
  
  /** CoinGecko free-tier price endpoint — no API key required. */
  const ETH_PRICE_URL =
    "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd";
  
  /** Gas estimate for assertCompliant() in gas units (empirically measured). */
  const ASSERT_GAS_ESTIMATE = 220_000n;
  
  // ---------------------------------------------------------------------------
  // Types
  // ---------------------------------------------------------------------------
  
  export interface DepositFormProps {
    /** The ZK proof that will be bundled with the assertCompliant() call. */
    proof: ProofData;
    /** Called when the tx is successfully broadcast; parent transitions to confirm card. */
    onSuccess: (txHash: string) => void;
    /** Optional extra class on the outer wrapper. */
    className?: string;
  }
  
  type SubmitState =
    | "idle"
    | "simulating"
    | "awaiting-wallet"
    | "broadcasting"
    | "error";
  
  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  
  /** Parse user input string to wei — returns null on invalid input. */
  function parseAmountToWei(raw: string): bigint | null {
    const trimmed = raw.trim();
    if (!trimmed || isNaN(Number(trimmed)) || Number(trimmed) < 0) return null;
    try {
      return parseEther(trimmed as `${number}`);
    } catch {
      return null;
    }
  }
  
  /** Format a gas cost (wei) as a human-readable ETH string with 6 decimals. */
  function formatGasCost(wei: bigint): string {
    return `${parseFloat(formatEther(wei)).toFixed(6)} ETH`;
  }
  
  // ---------------------------------------------------------------------------
  // Sub-components
  // ---------------------------------------------------------------------------
  
  function DetailRow({
    label,
    value,
    valueClass = "text-zinc-300",
    loading = false,
  }: {
    label:       string;
    value:       React.ReactNode;
    valueClass?: string;
    loading?:    boolean;
  }) {
    return (
      <div className="flex items-center justify-between gap-4 py-2.5">
        <span className="text-[11px] text-zinc-600">{label}</span>
        {loading ? (
          <span className="h-3 w-20 animate-pulse rounded bg-zinc-800" />
        ) : (
          <span className={`text-[11px] font-medium tabular-nums ${valueClass}`}>
            {value}
          </span>
        )}
      </div>
    );
  }
  
  function InputError({ message }: { message: string }) {
    return (
      <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-[11px] text-rose-400">
        <svg viewBox="0 0 12 12" className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="6" cy="6" r="5" />
          <line x1="6" y1="4" x2="6" y2="6.5" />
          <circle cx="6" cy="8.5" r="0.6" fill="currentColor" />
        </svg>
        {message}
      </p>
    );
  }
  
  // ---------------------------------------------------------------------------
  // DepositForm
  // ---------------------------------------------------------------------------
  
  export function DepositForm({ proof, onSuccess, className = "" }: DepositFormProps) {
    const { address } = useAccount();
    const { data: balanceData } = useBalance({ address });
  
    // ── Input state ────────────────────────────────────────────────────────
    const [rawAmount, setRawAmount]     = useState("");
    const [inputError, setInputError]   = useState<string | null>(null);
    const [isFocused, setIsFocused]     = useState(false);
  
    // ── Derived amounts ────────────────────────────────────────────────────
    const amountWei = parseAmountToWei(rawAmount);
    const amountNum = amountWei !== null ? parseFloat(formatEther(amountWei)) : 0;
  
    // ── ETH price ──────────────────────────────────────────────────────────
    const [ethPriceUsd, setEthPriceUsd] = useState<number | null>(null);
    const usdEquiv =
      ethPriceUsd !== null && amountNum > 0
        ? `≈ $${(amountNum * ethPriceUsd).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : null;
  
    useEffect(() => {
      let cancelled = false;
      fetch(ETH_PRICE_URL)
        .then((r) => r.json())
        .then((d: { ethereum?: { usd?: number } }) => {
          if (!cancelled) setEthPriceUsd(d?.ethereum?.usd ?? null);
        })
        .catch(() => { /* price is nice-to-have; silent fail */ });
      return () => { cancelled = true; };
    }, []);
  
    // ── Protocol meta ──────────────────────────────────────────────────────
    const [validityWindow, setValidityWindow] = useState<bigint>(DEFAULT_VALIDITY_WINDOW_SECONDS);
    const [isPaused, setIsPaused]             = useState(false);
    const [gasCostWei, setGasCostWei]         = useState<bigint | null>(null);
    const [metaLoading, setMetaLoading]       = useState(true);
  
    useEffect(() => {
      let cancelled = false;
      async function fetchMeta() {
        try {
          const client = createDefaultPublicClient();
          const [vw, paused, gasPrice] = await Promise.all([
            readValidityWindow(client),
            readSubmissionPaused(client),
            client.getGasPrice(),
          ]);
          if (cancelled) return;
          setValidityWindow(vw);
          setIsPaused(paused);
          setGasCostWei(gasPrice * ASSERT_GAS_ESTIMATE);
        } catch {
          // non-critical; defaults remain
        } finally {
          if (!cancelled) setMetaLoading(false);
        }
      }
      fetchMeta();
      return () => { cancelled = true; };
    }, []);
  
    // ── Validation ─────────────────────────────────────────────────────────
    const validate = useCallback((): string | null => {
      if (!rawAmount.trim()) return "Enter an amount";
      if (amountWei === null) return "Invalid amount";
      if (amountNum < DUST_THRESHOLD_ETH) return `Minimum ${DUST_THRESHOLD_ETH} ETH`;
      if (balanceData && amountWei > balanceData.value)
        return `Insufficient balance (${formatETH(balanceData.value)})`;
      if (isPaused) return "Protocol submissions are currently paused";
      return null;
    }, [rawAmount, amountWei, amountNum, balanceData, isPaused]);
  
    // Re-validate on every relevant change
    useEffect(() => {
      if (!rawAmount) { setInputError(null); return; }
      setInputError(validate());
    }, [rawAmount, balanceData, isPaused, validate]);
  
    // ── Submit ─────────────────────────────────────────────────────────────
    const [submitState, setSubmitState] = useState<SubmitState>("idle");
    const [txError, setTxError]         = useState<string | null>(null);
    const abortRef                      = useRef(false);
  
    async function handleSubmit(e: React.FormEvent) {
      e.preventDefault();
      const err = validate();
      if (err) { setInputError(err); return; }
      if (!address) return;
  
      abortRef.current = false;
      setTxError(null);
  
      try {
        setSubmitState("simulating");
        setSubmitState("awaiting-wallet");

        const amountWei = parseAmountToWei(rawAmount);
        if (!amountWei) return;

        let txHash: string;
        if (COMPLIANT_VAULT_ADDRESS) {
          txHash = await writeVaultDeposit({
            proof:        proof.proof     as `0x${string}`,
            publicInputs: proof.publicInputs as `0x${string}`[],
            nullifier:    proof.nullifier as `0x${string}`,
            value:        amountWei,
            account:      address as Address,
          });
        } else {
          const result = await submitAssertCompliant({
            proof:        proof.proof     as `0x${string}`,
            publicInputs: proof.publicInputs as `0x${string}`[],
            nullifier:    proof.nullifier as `0x${string}`,
            account:      address as Address,
          });
          txHash = result.txHash;
        }
  
        if (abortRef.current) return;
        setSubmitState("broadcasting");
        onSuccess(txHash);
      } catch (err: unknown) {
        if (abortRef.current) return;
        const msg =
          err instanceof Error ? err.message : "Transaction failed";
        // Surface user-friendly rejections
        const clean = msg.includes("User rejected")
          ? "Wallet request rejected."
          : msg.includes("insufficient funds")
          ? "Insufficient funds for gas."
          : msg.length > 120
          ? msg.slice(0, 120) + "…"
          : msg;
        setTxError(clean);
        setSubmitState("error");
      }
    }
  
    // ── "Use max" helper ────────────────────────────────────────────────────
    function handleUseMax() {
      if (!balanceData) return;
      // Leave ~0.002 ETH for gas headroom
      const headroom = parseEther("0.002");
      const usable   = balanceData.value > headroom ? balanceData.value - headroom : 0n;
      setRawAmount(parseFloat(formatEther(usable)).toFixed(6));
    }
  
    // ── Derived UI state ────────────────────────────────────────────────────
    const isSubmitting =
      submitState === "simulating" ||
      submitState === "awaiting-wallet" ||
      submitState === "broadcasting";
  
    const canSubmit =
      !isSubmitting &&
      !inputError &&
      !!rawAmount.trim() &&
      !isPaused;
  
    const submitLabel: Record<SubmitState, string> = {
      idle:             COMPLIANT_VAULT_ADDRESS ? "Deposit to CompliantVault" : "Submit Proof & Deposit",
      simulating:       "Simulating…",
      "awaiting-wallet":"Confirm in wallet…",
      broadcasting:     "Broadcasting…",
      error:            "Retry",
    };
  
    // ── Proof expiry label ──────────────────────────────────────────────────
    const proofExpiryLabel = (() => {
      const exp = new Date(proof.validUntil);
      const now = new Date();
      const diffMs = exp.getTime() - now.getTime();
      if (diffMs <= 0) return { text: "Expired", color: "text-rose-400" };
      if (diffMs < 5 * 60 * 1000) return { text: `Expires in ${Math.ceil(diffMs / 60_000)}m`, color: "text-amber-400" };
      return {
        text: exp.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
        color: "text-teal-400",
      };
    })();
  
    // ---------------------------------------------------------------------------
    // Render
    // ---------------------------------------------------------------------------
  
    return (
      <form
        onSubmit={handleSubmit}
        noValidate
        className={[
          "flex flex-col gap-0 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950",
          className,
        ].join(" ")}
        aria-label="Deposit form"
      >
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-5 py-3">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 18 18" className="h-4 w-4 text-zinc-400" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 2v14M4 7l5-5 5 5" />
            </svg>
            <span className="text-xs font-semibold tracking-wide text-zinc-300">
              Deposit Amount
            </span>
          </div>
          {isPaused && (
            <span className="rounded-full border border-amber-500/30 bg-amber-500/8 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
              Paused
            </span>
          )}
        </div>
  
        {/* ── Amount input ─────────────────────────────────────────────── */}
        <div className="px-5 pt-5 pb-4">
          <label
            htmlFor="deposit-amount"
            className="mb-2 block text-[11px] font-medium uppercase tracking-widest text-zinc-600"
          >
            Amount (ETH)
          </label>
  
          <div
            className={[
              "flex items-center gap-3 rounded-xl border px-4 py-3",
              "transition-colors duration-150",
              isFocused
                ? "border-teal-500/50 bg-zinc-900/80"
                : inputError
                ? "border-rose-500/40 bg-zinc-900/60"
                : "border-zinc-800 bg-zinc-900/60",
            ].join(" ")}
          >
            {/* ETH symbol */}
            <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-zinc-500" fill="currentColor" aria-hidden="true">
              <path d="M8 0L3 8.5 8 11.5 13 8.5 8 0z" opacity=".6"/>
              <path d="M3 9.5L8 16l5-6.5L8 12.5 3 9.5z" opacity=".85"/>
            </svg>
  
            <input
              id="deposit-amount"
              type="number"
              inputMode="decimal"
              step="any"
              min={DUST_THRESHOLD_ETH}
              placeholder="0.0000"
              value={rawAmount}
              onChange={(e) => setRawAmount(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              disabled={isSubmitting}
              aria-describedby={inputError ? "deposit-amount-error" : undefined}
              aria-invalid={!!inputError}
              className={[
                "min-w-0 flex-1 bg-transparent font-mono text-xl font-semibold tabular-nums",
                "outline-none placeholder:text-zinc-700",
                "disabled:cursor-not-allowed disabled:opacity-50",
                inputError ? "text-rose-300" : "text-zinc-100",
              ].join(" ")}
            />
  
            {/* USD equivalent */}
            {usdEquiv && !inputError && (
              <span className="shrink-0 text-[11px] text-zinc-600 tabular-nums">
                {usdEquiv}
              </span>
            )}
  
            {/* Use max */}
            {balanceData && !isSubmitting && (
              <button
                type="button"
                onClick={handleUseMax}
                className={[
                  "shrink-0 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1",
                  "text-[10px] font-semibold uppercase tracking-wider text-zinc-500",
                  "transition-colors duration-100 hover:border-zinc-700 hover:text-zinc-300",
                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500",
                ].join(" ")}
              >
                Max
              </button>
            )}
          </div>
  
          {/* Balance hint */}
          {balanceData && (
            <p className="mt-1.5 text-[10px] text-zinc-700 tabular-nums">
              Balance: {formatETH(balanceData.value)}
            </p>
          )}
  
          {/* Validation error */}
          {inputError && (
            <div id="deposit-amount-error">
              <InputError message={inputError} />
            </div>
          )}
        </div>
  
        {/* ── Transaction details ───────────────────────────────────────── */}
        <div className="border-t border-zinc-800/60 px-5">
          <div className="divide-y divide-zinc-800/50">
            <DetailRow
              label="Estimated network fee"
              value={gasCostWei !== null ? formatGasCost(gasCostWei) : "—"}
              loading={metaLoading}
            />
            <DetailRow
              label="Proof validity window"
              value={formatDuration(validityWindow)}
              loading={metaLoading}
            />
            <DetailRow
              label="Proof valid until"
              value={proofExpiryLabel.text}
              valueClass={proofExpiryLabel.color}
            />
            <DetailRow
              label="Nullifier"
              value={
                <span
                  className="cursor-default font-mono text-[10px] text-zinc-500"
                  title={proof.nullifier}
                >
                  {formatNullifier(proof.nullifier)}
                </span>
              }
            />
            <DetailRow
              label="Proof hash"
              value={
                <span
                  className="cursor-default font-mono text-[10px] text-zinc-500"
                  title={proof.proofHash}
                >
                  {formatHash(proof.proofHash, 8, 6)}
                </span>
              }
            />
            <DetailRow
              label="Network"
              value="Sepolia"
              valueClass="text-zinc-500"
            />
          </div>
        </div>
  
        {/* ── Proof attestation banner ──────────────────────────────────── */}
        <div className="mx-5 mt-4 rounded-lg border border-teal-500/15 bg-teal-500/5 px-3 py-2.5">
          <p className="text-[11px] leading-relaxed text-teal-600">
            <span className="font-semibold text-teal-400">ZK proof attached.</span>{" "}
            Your address will be proven non-member of the sanctions list without
            revealing it on-chain. The nullifier prevents replay.
          </p>
        </div>
  
        {/* ── Submit error ──────────────────────────────────────────────── */}
        {txError && (
          <div className="mx-5 mt-3 rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2.5">
            <p className="text-[11px] text-rose-400">{txError}</p>
          </div>
        )}
  
        {/* ── Submit button ─────────────────────────────────────────────── */}
        <div className="px-5 pb-5 pt-4">
          <button
            type="submit"
            disabled={!canSubmit}
            aria-live="polite"
            className={[
              "relative w-full overflow-hidden rounded-xl px-4 py-3.5",
              "text-sm font-semibold tracking-wide transition-all duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",
              canSubmit
                ? "bg-teal-600 text-white hover:bg-teal-500 active:scale-[0.99]"
                : "cursor-not-allowed bg-zinc-900 text-zinc-600",
            ].join(" ")}
          >
            {/* Shimmer effect while submitting */}
            {isSubmitting && (
              <span
                className="absolute inset-0 -translate-x-full animate-[shimmer_1.4s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/8 to-transparent"
                aria-hidden="true"
              />
            )}
  
            <span className="relative flex items-center justify-center gap-2">
              {isSubmitting && (
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M21 12a9 9 0 1 1-6-8.5" strokeLinecap="round" />
                </svg>
              )}
              {submitLabel[submitState]}
            </span>
          </button>
  
          {/* Wallet prompt hint */}
          {submitState === "awaiting-wallet" && (
            <p className="mt-2 text-center text-[10px] text-zinc-700">
              Check your wallet to approve the transaction
            </p>
          )}
        </div>
      </form>
    );
  }
  
  export default DepositForm;