import { createConfig, http } from "wagmi";
import { sepolia } from "wagmi/chains";
import { injected, walletConnect } from "wagmi/connectors";

import { SUPPORTED_CHAIN_ID } from "@/lib/constants";

// ---------------------------------------------------------------------------
// WalletConnect project ID (required for WalletConnect v2)
// Get one free at https://cloud.walletconnect.com
// ---------------------------------------------------------------------------
const walletConnectProjectId =
  (import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined) ?? "";

// ---------------------------------------------------------------------------
// Wagmi config
// ---------------------------------------------------------------------------
export const wagmiConfig = createConfig({
  chains: [sepolia],

  connectors: [
    // MetaMask (and any injected EIP-1193 provider: Rabby, Brave Wallet, etc.)
    injected({
      target: "metaMask",
    }),

    // WalletConnect v2 — mobile wallets, hardware wallets via QR
    ...(walletConnectProjectId
      ? [
          walletConnect({
            projectId: walletConnectProjectId,
            metadata: {
              name: "NullProof",
              description: "ZK-gated OFAC compliance for DeFi protocols",
              url: typeof window !== "undefined" ? window.location.origin : "https://nullproof.xyz",
              icons: ["https://nullproof.xyz/icon.png"],
            },
            showQrModal: true,
          }),
        ]
      : []),
  ],

  transports: {
    [SUPPORTED_CHAIN_ID]: http(
      (import.meta.env.VITE_SEPOLIA_RPC_URL as string | undefined) ?? undefined
    ),
  },
});

// ---------------------------------------------------------------------------
// Type augmentation for wagmi's module-level config inference
// ---------------------------------------------------------------------------
declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
