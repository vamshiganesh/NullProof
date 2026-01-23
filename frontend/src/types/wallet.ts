export type SupportedWalletId =
  | "injected"
  | "metaMask"
  | "walletConnect"
  | "safe"
  | "unknown";

export type WalletConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "wrong-network"
  | "error";

export interface NetworkConfig {
  chainId: number;
  name: string;
  displayName: string;
  rpcUrl?: string;
  blockExplorerName?: string;
  blockExplorerUrl?: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  isTestnet: boolean;
}

export interface WalletAccount {
  address: string;
  shortAddress: string;
  ensName?: string;
  connectorId?: SupportedWalletId;
  connectorName?: string;
}

export interface WalletState {
  status: WalletConnectionStatus;
  isConnected: boolean;
  isConnecting: boolean;
  isReconnecting: boolean;
  address?: string;
  shortAddress?: string;
  ensName?: string;
  connectorId?: SupportedWalletId;
  connectorName?: string;
  chainId?: number;
  chainName?: string;
  isSupportedChain: boolean;
  lastConnectedAt?: string;
  errorMessage?: string;
}

export interface WalletConnectResult {
  address: string;
  chainId: number;
  connectorId: SupportedWalletId;
  connectorName: string;
}

export interface WalletActions {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  switchToSepolia: () => Promise<void>;
  clearError: () => void;
}
