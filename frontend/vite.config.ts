import { defineConfig, loadEnv } from "vite";
import react                     from "@vitejs/plugin-react";
import wasm                      from "vite-plugin-wasm";
import { resolve }               from "node:path";
import { fileURLToPath }         from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({ mode }) => {
  // Expose all VITE_* env vars to the app
  const env = loadEnv(mode, process.cwd(), "VITE_");

  return {
    // ── Plugins ──────────────────────────────────────────────────────────────
    plugins: [
      react(),
      wasm(),      // Serves .wasm files correctly; required for snarkjs
    ],

    // ── Path aliases ──────────────────────────────────────────────────────────
    // @/ → src/  (used by every file from 36 onwards)
    resolve: {
      alias: {
        "@": resolve(__dirname, "src"),
      },
    },

    // ── Dev server ────────────────────────────────────────────────────────────
    server: {
      port:        3000,
      strictPort:  false,
      headers: {
        // Required for snarkjs SharedArrayBuffer (WASM threads)
        "Cross-Origin-Opener-Policy":   "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
      },
    },

    // ── Preview server (same headers) ────────────────────────────────────────
    preview: {
      port: 3000,
      headers: {
        "Cross-Origin-Opener-Policy":   "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
      },
    },

    // ── Build ─────────────────────────────────────────────────────────────────
    build: {
      outDir:    "dist",
      sourcemap: mode === "development",

      // esnext target: enables native top-level await (required by snarkjs)
      // replaces the broken vite-plugin-top-level-await
      target: "esnext",

      rollupOptions: {
        output: {
          // Split vendor chunks for better caching
          manualChunks: {
            "react-vendor":  ["react", "react-dom", "react-router-dom"],
            "wagmi-vendor":  ["wagmi", "viem", "@tanstack/react-query"],
            "zk-vendor":     ["snarkjs", "@zk-kit/imt"],
            "chart-vendor":  ["recharts"],
            "motion-vendor": ["framer-motion"],
          },
        },
      },
    },

    // ── Worker (snarkjs proof generation runs in a Web Worker) ───────────────
    worker: {
      format:  "es",     // ES module workers; required for WASM imports inside workers
      plugins: () => [wasm()],  // wasm plugin must also apply inside worker bundles
    },

    // ── Asset handling ────────────────────────────────────────────────────────
    // bb.js ships compressed WASM (.wasm.gz); serve these as raw assets.
    assetsInclude: ["**/*.wasm.gz", "**/*.gz"],

    // ── Optimise deps ─────────────────────────────────────────────────────────
    optimizeDeps: {
      // snarkjs and @zk-kit/imt use WASM + top-level await;
      // exclude from pre-bundling so Vite doesn't try to CommonJS-wrap them.
      //
      // bb.js + noir packages must ALSO be excluded: they spawn nested workers
      // via `new Worker(new URL('./thread.worker.js', import.meta.url))`, which
      // only resolves correctly when the package is served as native ESM
      // (pre-bundling rewrites import.meta.url and breaks the worker path).
      exclude: [
        "snarkjs",
        "@zk-kit/imt",
        "@aztec/bb.js",
        "@noir-lang/noir_js",
        "@noir-lang/acvm_js",
        "@noir-lang/noirc_abi",
      ],
      esbuildOptions: {
        target: "esnext",
      },
    },

    // ── Define (replaces at build time) ──────────────────────────────────────
    define: {
      // Silences Buffer-not-defined errors from ethers/viem in browser
      global: "globalThis",
    },
  };
});
