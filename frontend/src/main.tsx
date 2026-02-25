// frontend/src/main.tsx
//
// Application entry point.
//
// Responsibilities:
//   1. Import all global CSS in the correct cascade order
//   2. Mount the React tree into #root with ReactDOM.createRoot
//   3. Wrap in StrictMode (enables double-invoke checks in development)
//
// CSS import order (matters — each layer builds on the previous):
//   fonts.css      → @import Google Fonts (Inter, JetBrains Mono) + --font-* tokens
//   globals.css    → @tailwind base/components/utilities + CSS custom properties
//                    + scrollbar, selection, focus-visible, reduced-motion rules
//   animations.css → @keyframes + animation utilities consumed by components
//
// No provider setup here — all providers (WagmiProvider, QueryClientProvider,
// BrowserRouter) live in App.tsx so this file stays a pure boot file.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// ── Global styles (order is load-order — do not reorder) ──────────────────
import "@/styles/fonts.css";
import "@/styles/globals.css";
import "@/styles/animations.css";

// ── Store boot — import eagerly so the hydration IIFE in proofStore.ts ────
// runs before any lazy-loaded page component reads the store. This ensures
// Dashboard and Ledger see the restored proof on first render.
import "@/store/proofStore";

// ── App ───────────────────────────────────────────────────────────────────
import { App } from "@/App";

// ---------------------------------------------------------------------------
// Mount
//
// #root is guaranteed to exist by index.html. The non-null assertion (!)
// is intentional — if the element is somehow missing, a loud crash at boot
// is preferable to a silent failure deeper in the tree.
//
// The pre-rendered .app-boot skeleton inside #root (visible during the
// JS download) is replaced entirely by React on the first render.
// ---------------------------------------------------------------------------

const rootElement = document.getElementById("root")!;

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);