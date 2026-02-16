// frontend/src/pages/Ledger.tsx
//
// Route: /app/ledger — Compliance Ledger
//
// Two-panel layout:
//   Left  — "Deposit" form: submit an assertCompliant() transaction using the
//            current proof from proofStore, with address/nullifier/root fields
//            displayed as read-only context.
//   Right — Proof State panel: live on-chain status of the nullifier
//            (used/unused), validity window countdown, contract addresses.
//
// The word "deposit" here is metaphorical — you are "depositing" a compliance
// attestation into the on-chain ledger by calling assertCompliant().
// There is no ERC-20 or ETH involved.

import React, {
    useCallback,
    useEffect,
    useRef,
    useState,
  } from "react";
  import { useNavigate } from "react-router-dom";
  import type { Hex } from "viem";
  
  import {
    useProofStore,
    selectProofResult,
    selectSubmission,
    selectProofStatus,
    selectIsConfirmed,
    selectReadyToSubmit,
    selectElapsedLabel,
  } from "@/store/proofStore";
  import {
    useWalletStore,
    selectAddress,
    selectIsConnected,
  } from "@/store/walletStore";
  import {
    useSanctionsStore,
    selectCurrentRoot,
  } from "@/store/sanctionsStore";
  import {
    useIsNullifierUsed,
    useNullifierUsedAt,
    useValidityWindow,
    useSubmissionPaused,
  } from "@/hooks/useContractRead";
  import { formatHash } from "@/lib/format";
  import {
    COMPLIANCE_GATE_ADDRESS,
    SANCTIONS_LIST_ADDRESS,
    SUPPORTED_CHAIN_NAME,
  } from "@/lib/constants";
  
  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  
  function formatDate(unixMs: number): string {
    return new Date(unixMs).toLocaleString(undefined, {
      month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }
  
  function formatSeconds(s: bigint): string {
    const n = Number(s);
    if (n < 60)     return `${n}s`;
    if (n < 3600)   return `${Math.floor(n / 60)}m`;
    if (n < 86400)  return `${Math.floor(n / 3600)}h`;
    return `${Math.floor(n / 86400)}d`;
  }
  
  function timeAgo(unixSecs: bigint): string {
    const diff = Math.floor(Date.now() / 1000) - Number(unixSecs);
    if (diff < 60)   return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  }
  
  // ---------------------------------------------------------------------------
  // Copy hook
  // ---------------------------------------------------------------------------
  
  function useCopy(ms = 1600) {
    const [copied, setCopied] = useState<string | null>(null);
    const t = useRef<ReturnType<typeof setTimeout>>();
    const copy = useCallback((text: string, key: string) => {
      void navigator.clipboard.writeText(text).then(() => {
        clearTimeout(t.current);
        setCopied(key);
        t.current = setTimeout(() => setCopied(null), ms);
      });
    }, [ms]);
    useEffect(() => () => clearTimeout(t.current), []);
    return { copied, copy };
  }
  
  // ---------------------------------------------------------------------------
  // FieldRow — labelled read-only data field
  // ---------------------------------------------------------------------------
  
  function FieldRow({
    label,
    value,
    mono = true,
    accent = false,
    copyKey,
    fullValue,
    copied,
    onCopy,
  }: {
    label:      string;
    value:      string;
    mono?:      boolean;
    accent?:    boolean;
    copyKey?:   string;
    fullValue?: string;
    copied?:    string | null;
    onCopy?:    (text: string, key: string) => void;
  }) {
    const isCopied = copyKey && copied === copyKey;
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800/70 bg-zinc-900/25 px-3.5 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-widest text-zinc-600">{label}</p>
          <p className={[
            "truncate text-[11px] leading-tight",
            mono ? "font-mono" : "",
            accent ? "text-teal-300" : "text-zinc-400",
          ].join(" ")}>
            {value}
          </p>
        </div>
        {copyKey && fullValue && onCopy && (
          <button
            onClick={() => onCopy(fullValue, copyKey)}
            aria-label={isCopied ? "Copied" : `Copy ${label}`}
            className={[
              "shrink-0 rounded-lg border px-2 py-1 text-[9px] font-semibold uppercase tracking-wider",
              "transition-all duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal-500",
              isCopied
                ? "border-teal-500/25 bg-teal-500/8 text-teal-400"
                : "border-zinc-700 bg-zinc-800/60 text-zinc-600 hover:border-zinc-600 hover:text-zinc-400",
            ].join(" ")}
          >
            {isCopied ? "✓" : "Copy"}
          </button>
        )}
      </div>
    );
  }
  
  // ---------------------------------------------------------------------------
  // NullifierStatus — live on-chain probe
  // ---------------------------------------------------------------------------
  
  function NullifierStatus({ nullifier }: { nullifier: Hex }) {
    const used    = useIsNullifierUsed(nullifier);
    const usedAt  = useNullifierUsedAt(nullifier);
    const validity = useValidityWindow();
    const paused  = useSubmissionPaused();
  
    // Validity expiry
    const expiresAt: Date | null =
      used.data && usedAt.data && validity.data
        ? new Date((Number(usedAt.data) + Number(validity.data)) * 1000)
        : null;
  
    const isExpired = expiresAt ? expiresAt < new Date() : false;
  
    return (
      <div className="space-y-2">
        {/* Used / unused badge */}
        <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/30 px-3.5 py-2.5">
          <div>
            <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-widest text-zinc-600">On-chain status</p>
            {used.isLoading && (
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 animate-spin rounded-full border border-zinc-700 border-t-zinc-400" />
                <span className="text-[11px] text-zinc-600">Checking…</span>
              </div>
            )}
            {used.isError && (
              <span className="text-[11px] text-rose-400">Read error</span>
            )}
            {used.isSuccess && (
                <div className="flex items-center gap-1.5">
                    <span
                    className={[
                        "h-1.5 w-1.5 rounded-full",
                        used.data === true ? "bg-amber-400" : "bg-teal-400",
                    ].join(" ")}
                    aria-hidden="true"
                    />
                    <span
                    className={[
                        "text-[11px] font-medium",
                        used.data === true ? "text-amber-300" : "text-teal-300",
                    ].join(" ")}
                    >
                    {used.data === true ? "Nullifier consumed" : "Nullifier unused"}
                    </span>
                </div>
                )}
          </div>
          <button
            onClick={() => { used.refetch(); usedAt.refetch(); }}
            aria-label="Refresh nullifier status"
            className="rounded-lg border border-zinc-700 bg-zinc-800/60 p-1.5 text-zinc-600 transition-colors hover:border-zinc-600 hover:text-zinc-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-600"
          >
            <RefreshIcon className="h-3 w-3" />
          </button>
        </div>
  
        {/* Consumed at + expiry */}
        {used.data === true && usedAt.data != null && usedAt.data > 0n && (
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-3.5 py-2.5">
              <p className="text-[9px] font-semibold uppercase tracking-widest text-zinc-600">Consumed</p>
              <p className="mt-0.5 font-mono text-[11px] text-zinc-400">{timeAgo(usedAt.data)}</p>
            </div>
            {expiresAt && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-3.5 py-2.5">
                <p className="text-[9px] font-semibold uppercase tracking-widest text-zinc-600">
                  {isExpired ? "Expired" : "Valid until"}
                </p>
                <p className={[
                  "mt-0.5 font-mono text-[11px]",
                  isExpired ? "text-rose-400" : "text-teal-400",
                ].join(" ")}>
                  {isExpired ? "Expired" : formatDate(expiresAt.getTime())}
                </p>
              </div>
            )}
          </div>
        )}
  
        {/* Validity window */}
        {validity.isSuccess && validity.data !== null && (
          <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/30 px-3.5 py-2.5">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-widest text-zinc-600">Proof validity window</p>
              <p className="mt-0.5 font-mono text-[11px] text-zinc-400">
                {formatSeconds(validity.data)}
              </p>
            </div>
            <ClockIcon className="h-4 w-4 text-zinc-700" />
          </div>
        )}
  
        {/* Submission paused warning */}
        {paused.isSuccess && paused.data && (
          <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3.5 py-2.5">
            <AlertIcon className="h-3.5 w-3.5 shrink-0 text-amber-400" />
            <p className="text-[11px] text-amber-400">
              Contract submissions are currently paused by the admin.
            </p>
          </div>
        )}
      </div>
    );
  }
  
  // ---------------------------------------------------------------------------
  // ContractAddresses panel
  // ---------------------------------------------------------------------------
  
  function ContractAddresses({ copied, copy }: {
    copied: string | null;
    copy:   (text: string, key: string) => void;
  }) {
    const contracts = [
      { label: "ComplianceGate",  address: COMPLIANCE_GATE_ADDRESS,  key: "cg" },
      { label: "SanctionsList",   address: SANCTIONS_LIST_ADDRESS,   key: "sl" },
    ];
  
    return (
      <div className="space-y-2">
        {contracts.map(({ label, address, key }) => (
          <FieldRow
            key={key}
            label={label}
            value={formatHash(address, 10, 8)}
            fullValue={address}
            copyKey={key}
            copied={copied}
            onCopy={copy}
          />
        ))}
      </div>
    );
  }
  
  // ---------------------------------------------------------------------------
  // SubmitLedgerButton
  // ---------------------------------------------------------------------------
  
  type LedgerSubmitState = "ready" | "submitting" | "confirmed" | "disabled";
  
  function SubmitLedgerButton({
    state,
    onClick,
  }: {
    state:   LedgerSubmitState;
    onClick: () => void;
  }) {
    return (
      <button
        onClick={onClick}
        disabled={state === "disabled" || state === "confirmed" || state === "submitting"}
        className={[
          "relative flex w-full items-center justify-center gap-2.5 overflow-hidden",
          "rounded-2xl py-3.5 text-sm font-semibold transition-all duration-300",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1 focus-visible:ring-offset-zinc-950",
          state === "confirmed"
            ? "border border-teal-500/20 bg-teal-500/8 text-teal-400 cursor-default"
            : state === "submitting"
            ? "border border-teal-500/20 bg-teal-500/10 text-teal-400 cursor-wait"
            : state === "disabled"
            ? "border border-zinc-800 bg-zinc-900/40 text-zinc-600 cursor-not-allowed"
            : "border border-teal-500/30 bg-teal-500/10 text-teal-300 hover:bg-teal-500/16 hover:border-teal-400/40 hover:text-teal-200 active:scale-[0.99]",
        ].join(" ")}
      >
        {state === "submitting" && (
          <span
            className="pointer-events-none absolute inset-0 -translate-x-full animate-[shimmer_1.4s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-teal-400/8 to-transparent"
            aria-hidden="true"
          />
        )}
        {state === "confirmed" ? (
          <><CheckIcon className="h-4 w-4" aria-hidden="true" /> Attestation Recorded</>
        ) : state === "submitting" ? (
          <><span className="h-4 w-4 animate-spin rounded-full border border-teal-600 border-t-teal-300" aria-hidden="true" />Awaiting Confirmation…</>
        ) : state === "disabled" ? (
          <><LockIcon className="h-4 w-4" aria-hidden="true" />No Proof to Submit</>
        ) : (
          <><LedgerIcon className="h-4 w-4" aria-hidden="true" />Record Compliance Attestation</>
        )}
      </button>
    );
  }
  
  // ---------------------------------------------------------------------------
  // NoProofBanner
  // ---------------------------------------------------------------------------
  
  function NoProofBanner() {
    const navigate = useNavigate();
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-5 text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900">
          <ShieldOffIcon className="h-5 w-5 text-zinc-600" />
        </div>
        <p className="text-sm font-medium text-zinc-400">No active proof</p>
        <p className="mt-1 text-xs text-zinc-600">
          Generate a ZK proof before submitting a compliance attestation.
        </p>
        <button
          onClick={() => navigate("/app/proofs/generate")}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-700 py-2.5 text-xs font-medium text-zinc-500 transition-colors hover:border-zinc-600 hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-600"
        >
          <ArrowRightIcon className="h-3 w-3" />
          Generate Proof
        </button>
      </div>
    );
  }
  
  // ---------------------------------------------------------------------------
  // Ledger page
  // ---------------------------------------------------------------------------
  
  export function Ledger() {
    const navigate    = useNavigate();
    const address     = useWalletStore(selectAddress);
    const isConnected = useWalletStore(selectIsConnected);
    const currentRoot = useSanctionsStore(selectCurrentRoot);
  
    const proofResult   = useProofStore(selectProofResult);
    const submission    = useProofStore(selectSubmission);
    const proofStatus   = useProofStore(selectProofStatus);
    const isConfirmed   = useProofStore(selectIsConfirmed);
    const readyToSubmit = useProofStore(selectReadyToSubmit);
    const elapsedLabel  = useProofStore(selectElapsedLabel);
    const { startSubmission, setConfirmed, setError } = useProofStore();
  
    const { copied, copy } = useCopy();
  
    // Local submission state (in case user submits from this page directly)
    const [localSubmitting, setLocalSubmitting] = useState(false);
    const [localError,      setLocalError]      = useState<string | null>(null);
    const [localConfirmed,  setLocalConfirmed]  = useState(false);
  
    // Sync local confirmed state from proofStore
    useEffect(() => {
      if (isConfirmed) setLocalConfirmed(true);
    }, [isConfirmed]);
  
    // Mount animation
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
      const id = setTimeout(() => setMounted(true), 40);
      return () => clearTimeout(id);
    }, []);
  
    // Derived button state
    const submitState: LedgerSubmitState =
      localConfirmed || isConfirmed ? "confirmed"
      : localSubmitting || proofStatus === "submitting" ? "submitting"
      : !readyToSubmit || !isConnected ? "disabled"
      : "ready";
  
    // Root staleness
    const rootMismatch =
      proofResult && currentRoot && proofResult.rootUsed !== currentRoot;
  
    // ---------------------------------------------------------------------------
    // Submit handler
    // ---------------------------------------------------------------------------
    const handleSubmit = useCallback(async () => {
      if (!proofResult || !address || submitState !== "ready") return;
  
      setLocalSubmitting(true);
      setLocalError(null);
      startSubmission();
  
      try {
        const {
          writeAssertCompliant,
          createDefaultPublicClient,
        } = await import("@/lib/chain/contracts");
  
        const txHash = await writeAssertCompliant({
          proof:        proofResult.proof,
          publicInputs: proofResult.publicInputs,
          nullifier:    proofResult.nullifier,
          account:      address,
        });
  
        const publicClient = createDefaultPublicClient();
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  
        setLocalSubmitting(false);
        setLocalConfirmed(true);
  
        setConfirmed({
          txHash,
          confirmedAt:  Date.now(),
          blockNumber:  receipt.blockNumber,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Submission failed";
        setLocalSubmitting(false);
        setLocalError(msg);
        setError(msg);
      }
    }, [
      proofResult, address, submitState,
      startSubmission, setConfirmed, setError,
    ]);
  
    return (
      <div
        className={[
          "flex flex-col gap-5 p-4 pb-10 sm:p-6 lg:p-8 transition-all duration-500",
          mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3",
        ].join(" ")}
      >
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold text-zinc-100">Compliance Ledger</h1>
            <p className="mt-0.5 text-xs text-zinc-600">
              Submit a ZK attestation to the on-chain compliance registry
            </p>
          </div>
          <div className="flex items-center gap-2">
            {address && (
              <div className="flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-1.5">
                <span className={[
                  "h-1.5 w-1.5 rounded-full",
                  isConnected ? "bg-teal-500" : "bg-zinc-600",
                ].join(" ")} aria-hidden="true" />
                <span className="font-mono text-xs text-zinc-500">{formatHash(address, 8, 6)}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" aria-hidden="true" />
              <span className="text-xs text-zinc-600">{SUPPORTED_CHAIN_NAME}</span>
            </div>
          </div>
        </div>
  
        {/* ── Root strip ─────────────────────────────────────────────── */}
        {currentRoot && (
          <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/30 px-4 py-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Sanctions root</span>
            <span className="mx-1 h-3 w-px bg-zinc-800" aria-hidden="true" />
            <span className="font-mono text-[11px] text-teal-300/80">{formatHash(currentRoot, 14, 10)}</span>
            {rootMismatch && (
              <span className="ml-auto flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/8 px-2 py-0.5 text-[9px] font-medium text-amber-400">
                <AlertIcon className="h-2.5 w-2.5" />
                Root mismatch
              </span>
            )}
          </div>
        )}
  
        {/* ── Main grid ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_340px]">
  
          {/* ── Left: deposit form ─────────────────────────────────── */}
          <div className="flex flex-col gap-4">
  
            {/* Panel */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30">
              <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
                <LedgerIcon className="h-3.5 w-3.5 text-zinc-500" />
                <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                  Attestation Form
                </h2>
                {proofResult && (
                  <span className={[
                    "ml-auto rounded-full border px-2 py-0.5 text-[9px] font-medium",
                    localConfirmed || isConfirmed
                      ? "border-teal-500/20 bg-teal-500/8 text-teal-400"
                      : "border-zinc-800 bg-zinc-900 text-zinc-600",
                  ].join(" ")}>
                    {localConfirmed || isConfirmed ? "Recorded" : "Ready"}
                  </span>
                )}
              </div>
  
              <div className="p-4">
                {!proofResult ? (
                  <NoProofBanner />
                ) : (
                  <div className="flex flex-col gap-3">
                    {/* Proof fields */}
                    <FieldRow
                      label="Your Address"
                      value={address ? formatHash(address, 14, 10) : "—"}
                      fullValue={address ?? ""}
                      copyKey="addr"
                      copied={copied}
                      onCopy={copy}
                    />
                    <FieldRow
                      label="Nullifier"
                      value={formatHash(proofResult.nullifier, 14, 10)}
                      fullValue={proofResult.nullifier}
                      copyKey="null"
                      copied={copied}
                      onCopy={copy}
                      accent
                    />
                    <FieldRow
                      label="Merkle Root Used"
                      value={formatHash(proofResult.rootUsed, 14, 10)}
                      fullValue={proofResult.rootUsed}
                      copyKey="root"
                      copied={copied}
                      onCopy={copy}
                    />
                    {proofResult.publicInputs.map((pi, i) => (
                      <FieldRow
                        key={i}
                        label={`Public Input [${i}]`}
                        value={formatHash(pi, 14, 10)}
                        fullValue={pi}
                        copyKey={`pi-${i}`}
                        copied={copied}
                        onCopy={copy}
                      />
                    ))}
  
                    {/* Proof size */}
                    <div className="flex items-center justify-between rounded-xl border border-zinc-800/70 bg-zinc-900/25 px-3.5 py-2.5">
                      <div>
                        <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-widest text-zinc-600">Proof size</p>
                        <p className="font-mono text-[11px] text-zinc-400">
                          {Math.ceil((proofResult.proof.length - 2) / 2).toLocaleString()} bytes
                        </p>
                      </div>
                      {elapsedLabel && (
                        <span className="rounded-lg border border-teal-500/20 bg-teal-500/8 px-2 py-0.5 font-mono text-[10px] text-teal-400">
                          in {elapsedLabel}
                        </span>
                      )}
                    </div>
  
                    {/* Root mismatch warning */}
                    {rootMismatch && (
                      <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3.5 py-3">
                        <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                        <div>
                          <p className="text-[11px] font-medium text-amber-300">Root mismatch — submission will revert</p>
                          <p className="mt-0.5 text-[10px] text-amber-600">
                            The on-chain root has changed since this proof was generated.
                          </p>
                          <button
                            onClick={() => navigate("/app/proofs/generate")}
                            className="mt-1.5 text-[10px] font-semibold text-amber-400 underline underline-offset-2 hover:text-amber-300 focus-visible:outline-none"
                          >
                            Regenerate proof →
                          </button>
                        </div>
                      </div>
                    )}
  
                    {/* Submit button */}
                    <div className="pt-1">
                      <SubmitLedgerButton state={submitState} onClick={handleSubmit} />
                    </div>
  
                    {/* Local submission error */}
                    {localError && (
                      <div className="flex items-start gap-2 rounded-xl border border-rose-500/20 bg-rose-500/5 px-3.5 py-3">
                        <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
                        <p className="break-all text-[11px] text-rose-400">{localError}</p>
                      </div>
                    )}
  
                    {/* Confirmed receipt inline */}
                    {(localConfirmed || isConfirmed) && submission && (
                      <div className="rounded-xl border border-teal-500/20 bg-teal-500/5 p-4">
                        <div className="mb-2 flex items-center gap-2">
                          <CheckIcon className="h-3.5 w-3.5 text-teal-400" />
                          <span className="text-xs font-semibold text-teal-400">On-chain confirmed</span>
                        </div>
                        <div className="space-y-1.5">
                          <FieldRow
                            label="Transaction Hash"
                            value={formatHash(submission.txHash, 12, 8)}
                            fullValue={submission.txHash}
                            copyKey="txhash"
                            copied={copied}
                            onCopy={copy}
                            accent
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-3.5 py-2.5">
                              <p className="text-[9px] font-semibold uppercase tracking-widest text-zinc-600">Block</p>
                              <p className="mt-0.5 font-mono text-[11px] text-zinc-400">#{submission.blockNumber.toString()}</p>
                            </div>
                            <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-3.5 py-2.5">
                              <p className="text-[9px] font-semibold uppercase tracking-widest text-zinc-600">Confirmed</p>
                              <p className="mt-0.5 font-mono text-[11px] text-zinc-400">{formatDate(submission.confirmedAt)}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
  
            {/* What happens explanation */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/20 p-4">
              <div className="mb-3 flex items-center gap-2">
                <InfoIcon className="h-3.5 w-3.5 text-zinc-500" />
                <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                  What this does
                </h3>
              </div>
              <ol className="space-y-2">
                {[
                  "Calls assertCompliant() on the ComplianceGate contract with your proof bytes, public inputs, and nullifier.",
                  "The contract verifies the UltraHonk proof against the Verifier contract on-chain — no trust in this frontend.",
                  "If valid, it records the nullifier as consumed and emits a ProofVerified event with the validity expiry timestamp.",
                  "The nullifier prevents the same proof from being replayed — you'll need a new proof after the validity window expires.",
                ].map((text, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 text-[9px] font-semibold text-zinc-600">
                      {i + 1}
                    </span>
                    <span className="text-[11px] leading-relaxed text-zinc-600">{text}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
  
          {/* ── Right: proof state panel ───────────────────────────── */}
          <div className="flex flex-col gap-3">
  
            {/* Nullifier status card */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30">
              <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
                <PulseIcon className="h-3.5 w-3.5 text-zinc-500" />
                <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                  Nullifier State
                </h3>
                {proofResult && (
                  <span className="ml-auto font-mono text-[10px] text-zinc-700">
                    {formatHash(proofResult.nullifier, 6, 4)}
                  </span>
                )}
              </div>
              <div className="p-4">
                {proofResult ? (
                  <NullifierStatus nullifier={proofResult.nullifier} />
                ) : (
                  <p className="text-center text-[11px] text-zinc-600">
                    No nullifier — generate a proof first.
                  </p>
                )}
              </div>
            </div>
  
            {/* Proof metadata */}
            {proofResult && (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30">
                <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
                  <DataIcon className="h-3.5 w-3.5 text-zinc-500" />
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                    Proof Metadata
                  </h3>
                </div>
                <div className="space-y-2 p-4">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-3.5 py-2.5">
                      <p className="text-[9px] font-semibold uppercase tracking-widest text-zinc-600">Generated</p>
                      <p className="mt-0.5 font-mono text-[11px] text-zinc-400">
                        {formatDate(proofResult.generatedAt)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-3.5 py-2.5">
                      <p className="text-[9px] font-semibold uppercase tracking-widest text-zinc-600">Proved in</p>
                      <p className="mt-0.5 font-mono text-[11px] text-zinc-400">
                        {elapsedLabel ?? "—"}
                      </p>
                    </div>
                  </div>
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-3.5 py-2.5">
                    <p className="text-[9px] font-semibold uppercase tracking-widest text-zinc-600">Public inputs</p>
                    <p className="mt-0.5 font-mono text-[11px] text-zinc-400">
                      {proofResult.publicInputs.length} field{proofResult.publicInputs.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
              </div>
            )}
  
            {/* Contract addresses */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30">
              <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
                <ContractIcon className="h-3.5 w-3.5 text-zinc-500" />
                <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                  Contracts
                </h3>
                <span className="ml-auto text-[10px] text-zinc-700">{SUPPORTED_CHAIN_NAME}</span>
              </div>
              <div className="p-4">
                <ContractAddresses copied={copied} copy={copy} />
              </div>
            </div>
  
            {/* Navigation */}
            <div className="flex flex-col gap-2">
              <button
                onClick={() => navigate("/app/proofs/ready")}
                className="flex items-center justify-center gap-2 rounded-xl border border-zinc-800 py-2.5 text-xs font-medium text-zinc-600 transition-colors hover:border-zinc-700 hover:text-zinc-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-700"
              >
                <ShieldSmIcon className="h-3 w-3" />
                View Proof Ready Screen
              </button>
              <button
                onClick={() => navigate("/app")}
                className="flex items-center justify-center gap-2 rounded-xl border border-zinc-800 py-2.5 text-xs font-medium text-zinc-600 transition-colors hover:border-zinc-700 hover:text-zinc-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-700"
              >
                <HomeIcon className="h-3 w-3" />
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  export default Ledger;
  
  // ---------------------------------------------------------------------------
  // Icons
  // ---------------------------------------------------------------------------
  
  function CheckIcon({ className }: { className?: string }) {
    return <svg viewBox="0 0 12 12" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 6l2.5 2.5L10 3.5" /></svg>;
  }
  function AlertIcon({ className }: { className?: string }) {
    return <svg viewBox="0 0 14 14" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 1.5L1.5 11.5h11L7 1.5z" /><path d="M7 6v3M7 10.5v.5" /></svg>;
  }
  function InfoIcon({ className }: { className?: string }) {
    return <svg viewBox="0 0 14 14" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="7" cy="7" r="5.5" /><path d="M7 9.5V7M7 4.5v.5" /></svg>;
  }
  function LedgerIcon({ className }: { className?: string }) {
    return <svg viewBox="0 0 14 14" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="2" width="10" height="10" rx="1.5" /><path d="M5 5h4M5 7h4M5 9h2" /></svg>;
  }
  function LockIcon({ className }: { className?: string }) {
    return <svg viewBox="0 0 14 14" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3.5" y="6.5" width="7" height="5.5" rx="1" /><path d="M5 6.5v-2a2 2 0 1 1 4 0v2" /></svg>;
  }
  function ClockIcon({ className }: { className?: string }) {
    return <svg viewBox="0 0 14 14" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="7" cy="7" r="5.5" /><path d="M7 4.5V7l2 1.5" /></svg>;
  }
  function RefreshIcon({ className }: { className?: string }) {
    return <svg viewBox="0 0 12 12" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 6A4 4 0 1 1 6 2" /><path d="M6 2l2-2M6 2l2 2" /></svg>;
  }
  function PulseIcon({ className }: { className?: string }) {
    return <svg viewBox="0 0 14 14" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1 7h2l2-4 2 8 2-5 1.5 3H13" /></svg>;
  }
  function DataIcon({ className }: { className?: string }) {
    return <svg viewBox="0 0 14 14" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><ellipse cx="7" cy="4" rx="5" ry="2" /><path d="M2 4v3c0 1.1 2.24 2 5 2s5-.9 5-2V4" /><path d="M2 7v3c0 1.1 2.24 2 5 2s5-.9 5-2V7" /></svg>;
  }
  function ContractIcon({ className }: { className?: string }) {
    return <svg viewBox="0 0 14 14" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 2h6l2 2v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" /><path d="M8 2v3h3M5 7h4M5 9h3" /></svg>;
  }
  function ShieldOffIcon({ className }: { className?: string }) {
    return <svg viewBox="0 0 14 14" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 1.5L2 4v4c0 3 2 5 5 5.5" /><path d="M12 6V4L9.5 2.8M2 2l10 10" /></svg>;
  }
  function ArrowRightIcon({ className }: { className?: string }) {
    return <svg viewBox="0 0 12 12" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 6h8M7 3l3 3-3 3" /></svg>;
  }
  function HomeIcon({ className }: { className?: string }) {
    return <svg viewBox="0 0 14 14" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 6.5L7 2l5 4.5" /><path d="M3.5 5.5V12h7V5.5" /><path d="M5.5 12V8.5h3V12" /></svg>;
  }
  function ShieldSmIcon({ className }: { className?: string }) {
    return <svg viewBox="0 0 12 12" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 1L2 3v3.5C2 9.5 4 11 6 11.5 10 11 10 8.5 10 6.5V3L6 1z" /></svg>;
  }