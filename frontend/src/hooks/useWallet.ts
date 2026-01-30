import { useCallback } from "react";
import {
  useAccount,
  useChainId,
  useConnect,
  useDisconnect,
  useSwitchChain,
} from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";

import { useWalletStore } from "@/store/walletStore";
import { SUPPORTED_CHAIN_ID, SUPPORTED_CHAIN_NAME } from "@/lib/constants";
import { wagmiConfig } from "@/lib/wagmi";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseWalletReturn {
  // State (from store — stable, no wagmi re-renders leaking out)
  address:          string | null;
  chainId:          number | null;
  isConnected:      boolean;
  isWrongNetwork:   boolean;
  isConnecting:     boolean;
  error:            string | null;

  // Derived
  walletLabel:      string;
  explorerUrl:      string | null;

  // Actions
  connectMetaMask:     () => Promise<void>;
  connectWalletConnect: () => Promise<void>;
  disconnect:          () => Promise<void>;
  switchToSepolia:     () => Promise<void>;
  clearError:          () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useWallet(): UseWalletReturn {
  const wagmiAccount  = useAccount();
  const wagmiChainId  = useChainId();
  const { connectAsync }     = useConnect();
  const { disconnectAsync }  = useDisconnect();
  const { switchChainAsync } = useSwitchChain();

  // Read display state from the Zustand store (synced by WalletSync component)
  const address        = useWalletStore((s) => s.address);
  const chainId        = useWalletStore((s) => s.chainId);
  const isConnected    = useWalletStore((s) => s.isConnected);
  const isWrongNetwork = useWalletStore((s) => s.isWrongNetwork);
  const status         = useWalletStore((s) => s.status);
  const error          = useWalletStore((s) => s.error);
  const walletLabel    = useWalletStore((s) => {
    // Inline selectWalletLabel to avoid import cycle
    switch (s.status) {
      case "connecting":    return "Connecting…";
      case "wrong-network": return `Switch to ${SUPPORTED_CHAIN_NAME}`;
      case "error":         return "Connection Error";
      case "connected":     return s.address
        ? `${s.address.slice(0, 6)}…${s.address.slice(-4)}`
        : "Connected";
      default:              return "Connect Wallet";
    }
  });

  const { setConnecting, setDisconnected, setError, clearError } = useWalletStore.getState();

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------

  const explorerUrl = address
    ? `https://sepolia.etherscan.io/address/${address}`
    : null;

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const connectMetaMask = useCallback(async () => {
    setConnecting();
    try {
      await connectAsync({
        connector: injected({ target: "metaMask" }),
        chainId: SUPPORTED_CHAIN_ID,
      });
      // WalletSync will pick up the wagmi state change and update the store
    } catch (err) {
      const message = err instanceof Error ? err.message : "MetaMask connection failed";
      setError(message);
    }
  }, [connectAsync, setConnecting, setError]);

  const connectWalletConnect = useCallback(async () => {
    const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined;
    if (!projectId) {
      setError("WalletConnect project ID is not configured.");
      return;
    }
    setConnecting();
    try {
      await connectAsync({
        connector: walletConnect({
          projectId,
          metadata: {
            name: "NullProof",
            description: "ZK-gated OFAC compliance for DeFi protocols",
            url: window.location.origin,
            icons: ["https://nullproof.xyz/icon.png"],
          },
          showQrModal: true,
        }),
        chainId: SUPPORTED_CHAIN_ID,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "WalletConnect connection failed";
      setError(message);
    }
  }, [connectAsync, setConnecting, setError]);

  const disconnect = useCallback(async () => {
    try {
      await disconnectAsync();
      setDisconnected();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Disconnect failed";
      setError(message);
    }
  }, [disconnectAsync, setDisconnected, setError]);

  const switchToSepolia = useCallback(async () => {
    try {
      await switchChainAsync({ chainId: SUPPORTED_CHAIN_ID });
      // WalletSync handles the store update after chain switch
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to switch network";
      setError(message);
    }
  }, [switchChainAsync, setError]);

  return {
    address:              address ? String(address) : null,
    chainId,
    isConnected,
    isWrongNetwork,
    isConnecting:         status === "connecting",
    error,
    walletLabel,
    explorerUrl,
    connectMetaMask,
    connectWalletConnect,
    disconnect,
    switchToSepolia,
    clearError,
  };
}

// ---------------------------------------------------------------------------
// WalletSync — mount once in App.tsx to keep wagmi → store in sync
// ---------------------------------------------------------------------------

/**
 * Renderless component. Mount exactly once at the root of the app.
 * Watches wagmi's useAccount / useChainId and syncs changes into walletStore.
 *
 * Usage in App.tsx:
 *   import { WalletSync } from "@/hooks/useWallet";
 *   <WalletSync />
 */
export function WalletSync(): null {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { setConnected, setDisconnected } = useWalletStore.getState();

  // React to wagmi state changes
  if (isConnected && address) {
    setConnected(address, chainId);
  } else {
    setDisconnected();
  }

  return null;
}
