// frontend/src/App.tsx
//
// React Router v6 route tree · Layout wrappers · Wagmi + Zustand providers
//
// Route architecture:
//
//   /                          → <Landing>           (no shell — fullscreen marketing page)
//   /app                       → redirect → /app/dashboard
//   /app/dashboard             → <Dashboard>
//   /app/proof                 → <Proofs>            (proof history list)
//   /app/proof/generate        → <ProofGenerate>     (proof wizard)
//   /app/proof/ready           → <ProofReady>        (proof ready / submit)
//   /app/deposit/confirmed     → <DepositConfirmed>  (post-deposit success)
//   /app/protocol              → <Protocol>          (tab shell: overview | circuit | contract | benchmarks)
//   /app/protocol/circuit      → redirect → /app/protocol?tab=circuit
//   /app/ledger                → <Ledger>            (sanctions IMT explorer)
//   /app/radar                 → <Radar>             (live sanctions feed)
//   /app/audits                → <Audits>
//   /app/integrations          → <Integrations>
//   *                          → <NotFound>
//
// Provider stack (outermost → innermost):
//   WagmiProvider
//     QueryClientProvider
//       RouterProvider (or BrowserRouter — see below)
//         <AppShell>  (Sidebar + TopNav — only for /app/* routes)
//           WalletSync  (renderless — syncs wagmi → walletStore)
//           <Outlet>
//
// QueryClient is created once per module so HMR doesn't recreate it.

import React, { Suspense, useEffect } from "react";
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { wagmiConfig }  from "@/lib/wagmi";
import { WalletSync }   from "@/hooks/useWallet";
import { Sidebar }      from "@/components/layout/Sidebar";
import { TopNav }       from "@/components/layout/TopNav";

import { useWalletStore }   from "@/store/walletStore";
import { useSanctionsStore } from "@/store/sanctionsStore";
import { useWallet }         from "@/hooks/useWallet";

import { useState }           from "react";
import type { WalletBadgeProps } from "@/components/layout/TopNav";


// ---------------------------------------------------------------------------
// Lazy page imports
// Every app-shell page is code-split. Landing is eager (first paint matters).
// ---------------------------------------------------------------------------

import Landing from "@/pages/Landing";

const Dashboard       = React.lazy(() => import("@/pages/Dashboard"));
const Proofs          = React.lazy(() => import("@/pages/Proofs"));
const ProofGenerate   = React.lazy(() => import("@/pages/ProofGenerate"));
const ProofReady      = React.lazy(() => import("@/pages/ProofReady"));
const DepositConfirmed = React.lazy(() => import("@/pages/DepositConfirmed"));
const Protocol        = React.lazy(() => import("@/pages/Protocol"));
const ProtocolCircuit = React.lazy(() => import("@/pages/ProtocolCircuit"));
const Ledger          = React.lazy(() => import("@/pages/Ledger"));
const Radar           = React.lazy(() => import("@/pages/Radar"));
const Audits          = React.lazy(() => import("@/pages/Audits"));
const Integrations    = React.lazy(() => import("@/pages/Integrations"));
const NotFound        = React.lazy(() => import("@/pages/NotFound"));

// ---------------------------------------------------------------------------
// QueryClient — single instance, created at module scope
// ---------------------------------------------------------------------------

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 5-minute stale window — conservative default for on-chain data
      staleTime: 5 * 60 * 1_000,
      // Retry at most twice on network errors before surfacing to the UI
      retry: 2,
      retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 30_000),
    },
  },
});

// ---------------------------------------------------------------------------
// PageLoader — minimal skeleton shown during lazy-chunk fetch
// ---------------------------------------------------------------------------

function PageLoader() {
  return (
    <div className="flex h-full min-h-[60vh] w-full items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        {/* Animated logo mark */}
        <svg
          viewBox="0 0 32 32"
          className="h-8 w-8 animate-pulse text-teal-500"
          fill="none"
          aria-hidden="true"
        >
          <rect
            x="6" y="6" width="20" height="20" rx="4"
            stroke="currentColor" strokeWidth="1.8"
          />
          <path
            d="M11 16l3 3 7-7"
            stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round"
          />
        </svg>
        <span className="text-[11px] font-medium uppercase tracking-widest text-zinc-600">
          Loading…
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ScrollToTop — reset scroll on route change
// ---------------------------------------------------------------------------

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname]);
  return null;
}

// ---------------------------------------------------------------------------
// AppShell — wraps all /app/* routes
//
// Layout:
//   ┌────────────────────────────────────────────┐
//   │  <Sidebar>  │  <TopNav>                    │
//   │  (fixed,    │  (sticky, full-width)         │
//   │   desktop)  ├──────────────────────────────┤
//   │             │  <main>  ← <Outlet>           │
//   │             │  (scrollable content area)    │
//   └────────────────────────────────────────────┘
//
// On mobile the Sidebar collapses to a bottom drawer / hamburger triggered
// from TopNav. TopNav receives no props — it reads walletStore directly.
// ---------------------------------------------------------------------------

function AppShell() {
    const [sidebarOpen, setSidebarOpen] = useState(false);
  
    // Derive WalletBadgeProps from walletStore + wallet actions
    const wallet = useWallet();
    const networkState = useWalletStore((s) =>
      s.isWrongNetwork ? "warning" : s.isConnected ? "live" : "idle"
    );
  
    // Build the wallet prop TopNav expects
    const walletBadge: WalletBadgeProps = {
        ...(wallet.address ? { address: wallet.address } : {}),
        connected:    wallet.isConnected,
        onConnect:    wallet.connectMetaMask,
        onDisconnect: wallet.disconnect,
      };
  
    return (
      <div className="flex h-dvh overflow-hidden bg-zinc-950">
        <Sidebar />
  
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <TopNav
            wallet={walletBadge}
            networkLabel="Sepolia"
            networkState={networkState}
            onMenuOpen={() => setSidebarOpen(true)}
          />
  
          <main
            id="main-content"
            className="flex-1 overflow-y-auto overflow-x-hidden"
            tabIndex={-1}
          >
            <WalletSync />
            <ScrollToTop />
            <Suspense fallback={<PageLoader />}>
              <Outlet />
            </Suspense>
          </main>
        </div>
      </div>
    );
  }

// ---------------------------------------------------------------------------
// Route tree
// ---------------------------------------------------------------------------

function AppRoutes() {
  return (
    <Routes>
      {/* ── Public / marketing ── */}
      <Route
        path="/"
        element={
          <Suspense fallback={<PageLoader />}>
            <Landing />
          </Suspense>
        }
      />

      {/* ── App shell ── all /app/* children share Sidebar + TopNav ── */}
      <Route path="/app" element={<AppShell />}>
        {/* Default /app → /app/dashboard */}
        <Route index element={<Navigate to="dashboard" replace />} />

        {/* Dashboard */}
        <Route path="dashboard" element={<Dashboard />} />

        {/* Proof flow */}
        <Route path="proof">
          {/* /app/proof → proof history list */}
          <Route index element={<Proofs />} />
          {/* /app/proof/generate → live proof wizard */}
          <Route path="generate" element={<ProofGenerate />} />
          {/* /app/proof/ready → proof ready + submit */}
          <Route path="ready" element={<ProofReady />} />
        </Route>

        {/* Post-deposit success screen */}
        <Route path="deposit">
          <Route path="confirmed" element={<DepositConfirmed />} />
        </Route>

        {/* Protocol reference — tab routing handled inside <Protocol> via ?tab= */}
        <Route path="protocol">
          {/* /app/protocol  (tab=overview by default inside Protocol) */}
          <Route index element={<Protocol />} />
          {/*
           * /app/protocol/circuit — canonical deep-link URL.
           * Redirects to the query-param form so <Protocol> handles
           * the active-tab state in a single place.
           */}
          <Route
            path="circuit"
            element={<Navigate to="/app/protocol?tab=circuit" replace />}
          />
        </Route>

        {/* Sanctions IMT explorer */}
        <Route path="ledger" element={<Ledger />} />

        {/* Live sanctions / watchlist feed */}
        <Route path="radar" element={<Radar />} />

        {/* Audits */}
        <Route path="audits" element={<Audits />} />

        {/* Integrations */}
        <Route path="integrations" element={<Integrations />} />

        {/* Catch-all inside /app — show 404 inside the shell */}
        <Route path="*" element={<NotFound />} />
      </Route>

      {/* ── Global 404 (outside shell) ── */}
      <Route
        path="*"
        element={
          <Suspense fallback={<PageLoader />}>
            <NotFound />
          </Suspense>
        }
      />
    </Routes>
  );
}

// ---------------------------------------------------------------------------
// App — top-level provider stack
//
// Order matters:
//   1. WagmiProvider      — provides wagmi context (useAccount, useChainId, …)
//   2. QueryClientProvider — provides @tanstack/react-query context (used by
//                            wagmi internally + our own useQuery calls)
//   3. BrowserRouter      — provides React Router context
//   4. AppRoutes          — the route tree
//
// Nothing above WagmiProvider depends on wallet state. No Zustand providers
// are needed — Zustand stores are module-level singletons accessed directly.
// ---------------------------------------------------------------------------

export function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          {/*
           * Skip-to-content link — first focusable element in the DOM.
           * Hidden visually until focused; targets #main-content in AppShell.
           */}
          <a
            href="#main-content"
            className={[
              "fixed left-2 top-2 z-[9999] rounded-lg px-3 py-2",
              "bg-teal-500 text-sm font-semibold text-zinc-950",
              "opacity-0 shadow-lg",
              "focus:opacity-100",
              "translate-y-[-110%] focus:translate-y-0",
              "transition-all duration-200",
              "-outline-offset-2 outline-2 outline-teal-300",
            ].join(" ")}
          >
            Skip to content
          </a>

          <AppRoutes />
        </BrowserRouter>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export default App;