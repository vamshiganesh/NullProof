import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { Address } from "viem";

import { SUPPORTED_CHAIN_ID, SUPPORTED_CHAIN_NAME } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WalletStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "wrong-network"
  | "error";

export interface WalletState {
  // State
  address: Address | null;
  chainId: number | null;
  status: WalletStatus;
  error: string | null;
  isConnected: boolean;
  isWrongNetwork: boolean;

  // Actions
  setConnected: (address: Address, chainId: number) => void;
  setConnecting: () => void;
  setDisconnected: () => void;
  setChainId: (chainId: number) => void;
  setError: (error: string) => void;
  clearError: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deriveStatus(chainId: number | null): WalletStatus {
  if (chainId === null) return "disconnected";
  return chainId === SUPPORTED_CHAIN_ID ? "connected" : "wrong-network";
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useWalletStore = create<WalletState>()(
  devtools(
    (set) => ({
      // Initial state
      address: null,
      chainId: null,
      status: "disconnected",
      error: null,
      isConnected: false,
      isWrongNetwork: false,

      // Actions
      setConnected: (address, chainId) =>
        set(
          {
            address,
            chainId,
            status: deriveStatus(chainId),
            isConnected: chainId === SUPPORTED_CHAIN_ID,
            isWrongNetwork: chainId !== SUPPORTED_CHAIN_ID,
            error: null,
          },
          false,
          "wallet/setConnected",
        ),

      setConnecting: () =>
        set(
          { status: "connecting", error: null },
          false,
          "wallet/setConnecting",
        ),

      setDisconnected: () =>
        set(
          {
            address: null,
            chainId: null,
            status: "disconnected",
            isConnected: false,
            isWrongNetwork: false,
            error: null,
          },
          false,
          "wallet/setDisconnected",
        ),

      setChainId: (chainId) =>
        set(
          (state) => ({
            chainId,
            status: state.address ? deriveStatus(chainId) : "disconnected",
            isConnected: !!state.address && chainId === SUPPORTED_CHAIN_ID,
            isWrongNetwork: !!state.address && chainId !== SUPPORTED_CHAIN_ID,
          }),
          false,
          "wallet/setChainId",
        ),

      setError: (error) =>
        set(
          { status: "error", error },
          false,
          "wallet/setError",
        ),

      clearError: () =>
        set(
          { error: null },
          false,
          "wallet/clearError",
        ),
    }),
    { name: "WalletStore" },
  ),
);

// ---------------------------------------------------------------------------
// Selectors (stable references — prevents unnecessary re-renders)
// ---------------------------------------------------------------------------

export const selectAddress       = (s: WalletState) => s.address;
export const selectChainId       = (s: WalletState) => s.chainId;
export const selectWalletStatus  = (s: WalletState) => s.status;
export const selectIsConnected   = (s: WalletState) => s.isConnected;
export const selectIsWrongNetwork = (s: WalletState) => s.isWrongNetwork;
export const selectWalletError   = (s: WalletState) => s.error;

/**
 * Human-readable status string for the wallet connection button.
 * "Connect Wallet" | "Connecting…" | "0x1234…5678" | "Wrong Network" | "Error"
 */
export function selectWalletLabel(s: WalletState): string {
  switch (s.status) {
    case "connecting":    return "Connecting…";
    case "wrong-network": return `Switch to ${SUPPORTED_CHAIN_NAME}`;
    case "error":         return "Connection Error";
    case "connected":     return s.address
      ? `${s.address.slice(0, 6)}…${s.address.slice(-4)}`
      : "Connected";
    default:              return "Connect Wallet";
  }
}
