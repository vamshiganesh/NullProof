import React, { useState, useCallback, useId } from "react";
import {
  useConnect,
  useDisconnect,
  useAccount,
  useSwitchChain,
} from "wagmi";
import { sepolia } from "wagmi/chains";

import { Button, Spinner, StatusDot, Tooltip } from "@/components/ui";
import { SUPPORTED_CHAIN_ID, SUPPORTED_CHAIN_NAME } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConnectWalletButtonProps {
  /** Compact pill variant — used inside TopNav. Full button used on landing/empty states. */
  variant?:   "full" | "compact";
  className?: string;
  /** Called after successful connection. */
  onConnected?: (address: string) => void;
}

type ModalView = "select" | "connecting" | "wrong-network" | "error";

// ---------------------------------------------------------------------------
// Connector icons (inline SVG — zero bundle cost)
// ---------------------------------------------------------------------------

function MetaMaskIcon() {
  return (
    <svg viewBox="0 0 40 40" className="h-8 w-8" aria-hidden="true">
      <rect width="40" height="40" rx="10" fill="#F6851B" />
      <path
        d="M30.5 8.5L21.2 15.5l1.7-4.1 7.6-2.9z"
        fill="#E2761B" stroke="#E2761B" strokeWidth="0.3" strokeLinecap="round" strokeLinejoin="round"
      />
      <path
        d="M9.5 8.5l9.2 7.1-1.6-4.1L9.5 8.5zM27.3 26.2l-2.5 3.8 5.3 1.5 1.5-5.2-4.3-.1zM8.4 26.3l1.5 5.2 5.3-1.5-2.5-3.8-4.3.1z"
        fill="#E4761B" stroke="#E4761B" strokeWidth="0.3" strokeLinecap="round" strokeLinejoin="round"
      />
      <path
        d="M14.9 19.2l-1.4 2.2 5.1.2-.2-5.5-3.5 3.1zM25.1 19.2l-3.6-3.2-.1 5.6 5.1-.2-1.4-2.2zM15.2 30l3-1.5-2.6-2-.4 3.5zM21.8 28.5l3 1.5-.4-3.5-2.6 2z"
        fill="#E4761B" stroke="#E4761B" strokeWidth="0.3" strokeLinecap="round" strokeLinejoin="round"
      />
      <path
        d="M24.8 30l-3-1.5.2 1.8v1l2.8-1.3zM15.2 30l2.8 1.3v-1l.2-1.8-3 1.5z"
        fill="#D7C1B3" stroke="#D7C1B3" strokeWidth="0.3" strokeLinecap="round" strokeLinejoin="round"
      />
      <path
        d="M18 24.7l-2.5-.8 1.8-.8.7 1.6zM22 24.7l.7-1.6 1.8.8-2.5.8z"
        fill="#233447" stroke="#233447" strokeWidth="0.3" strokeLinecap="round" strokeLinejoin="round"
      />
      <path
        d="M15.2 30l.4-3.5-2.9.1 2.5 3.4zM24.4 26.5l.4 3.5 2.5-3.4-2.9-.1zM26.5 21.4l-5.1.2.5 2.7.7-1.6 1.8.8 2.1-2.1zM15.5 23.3l1.8-.8.7 1.6.5-2.7-5.1-.2 2.1 2.1z"
        fill="#CD6116" stroke="#CD6116" strokeWidth="0.3" strokeLinecap="round" strokeLinejoin="round"
      />
      <path
        d="M13.5 21.4l2.1 4.1-.1-2-.2-2.1H13.5zM24.7 23.5l-.2 2 2.1-4.1h-1.8l-.1 2.1zM18.6 21.6l-.5 2.7.6 3.1.1-4.1-.2-1.7zM21.4 21.6l-.2 1.7.1 4.1.6-3.1-.5-2.7z"
        fill="#E4751F" stroke="#E4751F" strokeWidth="0.3" strokeLinecap="round" strokeLinejoin="round"
      />
      <path
        d="M22 24.7l-.6 3.1.4.3 2.6-2 .2-2-2.6.6zM15.5 23.5l.2 2 2.6 2 .4-.3-.6-3.1-2.6-.6z"
        fill="#F6851B" stroke="#F6851B" strokeWidth="0.3" strokeLinecap="round" strokeLinejoin="round"
      />
      <path
        d="M22.1 31.3v-1l-.2-.2h-3.8l-.2.2v1l-2.8-1.3 1 .8 2 1.4h3.4l2-1.4 1-.8-2.4 1.3z"
        fill="#C0AD9E" stroke="#C0AD9E" strokeWidth="0.3" strokeLinecap="round" strokeLinejoin="round"
      />
      <path
        d="M21.8 28.5l-.4-.3h-2.8l-.4.3-.2 1.8.2-.2h3.8l.2.2-.4-1.8z"
        fill="#161616" stroke="#161616" strokeWidth="0.3" strokeLinecap="round" strokeLinejoin="round"
      />
      <path
        d="M30.8 15.9l.7-3.5-1.1-3.9-8.6 6.4 3.3 2.8 4.7 1.4 1-1.2-.5-.3.7-.7-.5-.4.7-.6-.4-.5zM8.5 12.4l.7 3.5-.4.5.7.6-.5.4.7.7-.5.3 1 1.2 4.7-1.4 3.3-2.8-8.6-6.4-1.1 3.9z"
        fill="#763D16" stroke="#763D16" strokeWidth="0.3" strokeLinecap="round" strokeLinejoin="round"
      />
      <path
        d="M29.8 19.6l-4.7-1.4 1.4 2.2-2.1 4.1 2.9-.1h4.3l-1.8-4.8zM14.9 18.2l-4.7 1.4-1.7 4.8h4.3l2.9.1-2.1-4.1 1.3-2.2zM19.6 19.4l.3-5.4 1.4-3.9h-6.3l1.4 3.9.3 5.4.1 1.8v4l2.7.1.1-4v-1.9z"
        fill="#F6851B" stroke="#F6851B" strokeWidth="0.3" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

function WalletConnectIcon() {
  return (
    <svg viewBox="0 0 40 40" className="h-8 w-8" aria-hidden="true">
      <rect width="40" height="40" rx="10" fill="#3B99FC" />
      <path
        d="M11.5 16.5c4.7-4.6 12.3-4.6 17 0l.6.6c.2.2.2.6 0 .8l-2 2c-.1.1-.3.1-.4 0l-.8-.8c-3.3-3.2-8.5-3.2-11.8 0l-.8.9c-.1.1-.3.1-.4 0l-2-2c-.2-.2-.2-.5 0-.8l.6-.7zm21 3.9l1.8 1.7c.2.2.2.6 0 .8l-7.9 7.7c-.2.2-.6.2-.8 0l-5.6-5.5c-.1-.1-.2-.1-.3 0l-5.6 5.5c-.2.2-.6.2-.8 0L5.5 22.9c-.2-.2-.2-.6 0-.8l1.8-1.7c.2-.2.6-.2.8 0l5.6 5.5c.1.1.2.1.3 0l5.6-5.5c.2-.2.6-.2.8 0l5.6 5.5c.1.1.2.1.3 0l5.6-5.5c.2-.2.5-.2.7 0z"
        fill="white"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

function ConnectModal({
  onClose,
  onConnected,
}: {
  onClose:     () => void;
  onConnected?: (address: string) => void;
}) {
  const { connect, connectors, isPending, error } = useConnect();
  const { switchChain }                            = useSwitchChain();
  const { chain }                                  = useAccount();

  const [view, setView]               = useState<ModalView>("select");
  const [connectingId, setConnecting] = useState<string | null>(null);
  const [connectError, setError]      = useState<string | null>(null);

  const titleId = useId();

  const handleConnect = useCallback(
    (connectorId: string) => {
      const connector = connectors.find((c) => c.id === connectorId);
      if (!connector) return;

      setConnecting(connectorId);
      setView("connecting");
      setError(null);

      connect(
        { connector, chainId: SUPPORTED_CHAIN_ID },
        {
          onSuccess: (data) => {
            onConnected?.(data.accounts[0] ?? "");
            onClose();
          },
          onError: (err) => {
            setError(err.message ?? "Connection failed");
            setView("error");
            setConnecting(null);
          },
        },
      );
    },
    [connect, connectors, onClose, onConnected],
  );

  const handleSwitchNetwork = useCallback(() => {
    switchChain(
      { chainId: SUPPORTED_CHAIN_ID },
      {
        onSuccess: onClose,
        onError:   (err) => {
          setError(err.message ?? "Network switch failed");
          setView("error");
        },
      },
    );
  }, [switchChain, onClose]);

  // Check if wallet is on wrong network after connecting
  React.useEffect(() => {
    if (chain && chain.id !== SUPPORTED_CHAIN_ID) {
      setView("wrong-network");
    }
  }, [chain]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-zinc-950/80 backdrop-blur-sm"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={[
          "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
          "w-full max-w-sm",
          "rounded-2xl border border-zinc-800 bg-zinc-950",
          "shadow-2xl shadow-black/60",
          "animate-[tooltipIn_150ms_ease-out_forwards]",
          "px-6 pb-6 pt-5",
        ].join(" ")}
      >
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <h2
            id={titleId}
            className="text-sm font-semibold tracking-tight text-zinc-100"
          >
            {view === "wrong-network"
              ? "Wrong Network"
              : view === "error"
              ? "Connection Failed"
              : view === "connecting"
              ? "Connecting…"
              : "Connect Wallet"}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>

        {/* ── Select view ─────────────────────────────────────── */}
        {view === "select" && (
          <div className="flex flex-col gap-2">
            {/* MetaMask */}
            <button
              onClick={() => handleConnect("io.metamask")}
              disabled={isPending}
              className={[
                "flex items-center gap-3 rounded-xl border border-zinc-800",
                "bg-zinc-900 px-4 py-3",
                "text-sm font-medium text-zinc-200",
                "hover:bg-zinc-800 hover:border-zinc-700",
                "active:bg-zinc-700",
                "transition-all duration-150",
                "focus-visible:outline-none focus-visible:ring-2",
                "focus-visible:ring-zinc-500 focus-visible:ring-offset-2",
                "focus-visible:ring-offset-zinc-950",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              ].join(" ")}
            >
              <MetaMaskIcon />
              <div className="text-left">
                <p className="text-sm font-medium text-zinc-100">MetaMask</p>
                <p className="text-[11px] text-zinc-500">Browser extension</p>
              </div>
            </button>

            {/* WalletConnect — only if project ID is configured */}
            {connectors.some((c) => c.id === "walletConnect") && (
              <button
                onClick={() => handleConnect("walletConnect")}
                disabled={isPending}
                className={[
                  "flex items-center gap-3 rounded-xl border border-zinc-800",
                  "bg-zinc-900 px-4 py-3",
                  "text-sm font-medium text-zinc-200",
                  "hover:bg-zinc-800 hover:border-zinc-700",
                  "active:bg-zinc-700",
                  "transition-all duration-150",
                  "focus-visible:outline-none focus-visible:ring-2",
                  "focus-visible:ring-zinc-500 focus-visible:ring-offset-2",
                  "focus-visible:ring-offset-zinc-950",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                ].join(" ")}
              >
                <WalletConnectIcon />
                <div className="text-left">
                  <p className="text-sm font-medium text-zinc-100">WalletConnect</p>
                  <p className="text-[11px] text-zinc-500">Mobile &amp; hardware wallets</p>
                </div>
              </button>
            )}

            <p className="mt-2 text-center text-[11px] text-zinc-600">
              Connects to {SUPPORTED_CHAIN_NAME} testnet only
            </p>
          </div>
        )}

        {/* ── Connecting view ──────────────────────────────────── */}
        {view === "connecting" && (
          <div className="flex flex-col items-center gap-4 py-6">
            <Spinner size="lg" variant="emerald" label="Connecting to wallet…" />
            <div className="text-center">
              <p className="text-sm font-medium text-zinc-200">
                Waiting for wallet
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Approve the connection request in{" "}
                {connectingId === "walletConnect" ? "your wallet app" : "MetaMask"}
              </p>
            </div>
            <button
              onClick={() => { setView("select"); setConnecting(null); }}
              className="text-xs text-zinc-600 hover:text-zinc-400 underline underline-offset-2 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {/* ── Wrong network view ───────────────────────────────── */}
        {view === "wrong-network" && (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-amber-400/20 bg-amber-400/10">
              <svg viewBox="0 0 24 24" className="h-6 w-6 text-amber-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M10.3 3.6L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-zinc-200">
                Wrong network
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                NullProof requires {SUPPORTED_CHAIN_NAME}.
                Please switch your network.
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              fullWidth
              onClick={handleSwitchNetwork}
            >
              Switch to {SUPPORTED_CHAIN_NAME}
            </Button>
          </div>
        )}

        {/* ── Error view ───────────────────────────────────────── */}
        {view === "error" && (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-rose-400/20 bg-rose-400/10">
              <svg viewBox="0 0 24 24" className="h-6 w-6 text-rose-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-zinc-200">
                Connection failed
              </p>
              {connectError && (
                <p className="mt-1 max-w-[240px] text-[11px] text-zinc-500 break-words">
                  {connectError}
                </p>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              fullWidth
              onClick={() => { setView("select"); setError(null); }}
            >
              Try again
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// ConnectWalletButton
// ---------------------------------------------------------------------------

export function ConnectWalletButton({
  variant   = "full",
  className = "",
  onConnected,
}: ConnectWalletButtonProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const { isConnected }           = useAccount();

  // Already connected — render nothing (WalletBadge handles connected state)
  if (isConnected) return null;

  if (variant === "compact") {
    return (
      <>
        <button
          onClick={() => setModalOpen(true)}
          className={[
            "inline-flex items-center gap-2 rounded-xl",
  "border border-emerald-500/30 bg-emerald-500/10",
  "px-3 py-1.5 text-xs font-medium text-emerald-400",
  "hover:bg-emerald-500/20 hover:border-emerald-500/50",
  "active:bg-emerald-500/25 transition-all duration-150",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",
            className,
          ].join(" ")}
        >
          <StatusDot state="idle" size="xs" label="Wallet disconnected" />
          Connect
        </button>

        {modalOpen && (
          <ConnectModal
            onClose={() => setModalOpen(false)}
            onConnected={onConnected ?? (() => {})}
          />
        )}
      </>
    );
  }

  return (
    <>
      <Button
        variant="primary"
        size="md"
        onClick={() => setModalOpen(true)}
        leftIcon={
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <path d="M16 12h2" />
          </svg>
        }
        className={className}
      >
        Connect Wallet
      </Button>

      {modalOpen && (
        <ConnectModal
          onClose={() => setModalOpen(false)}
          onConnected={onConnected ?? (() => {})}
        />
      )}
    </>
  );
}

export default ConnectWalletButton;
