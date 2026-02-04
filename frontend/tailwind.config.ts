import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#050816",
          soft:    "#0b1020",
          muted:   "#11182d",
          panel:   "#0f172a",
          elevated:"#162033",
        },
        fg: {
          DEFAULT: "#f8fafc",
          muted:   "#94a3b8",
          subtle:  "#64748b",
          dim:     "#475569",
        },
        border: {
          DEFAULT: "#1e293b",
          soft:    "#243247",
          strong:  "#334155",
        },
        accent: {
          DEFAULT: "#22c55e",
          soft:    "#4ade80",
          strong:  "#16a34a",
          glow:    "#86efac",
        },
        status: {
          success: "#22c55e",
          warning: "#f59e0b",
          danger:  "#ef4444",
          info:    "#38bdf8",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        panel:   "0 0 0 1px rgba(148,163,184,0.08), 0 12px 32px rgba(2,6,23,0.40)",
        glow:    "0 0 0 1px rgba(34,197,94,0.18), 0 0 24px rgba(34,197,94,0.12)",
        danger:  "0 0 0 1px rgba(239,68,68,0.18), 0 0 20px rgba(239,68,68,0.10)",
      },
      borderRadius: {
        xl:  "1rem",
        "2xl":"1.25rem",
        "3xl":"1.5rem",
      },
      keyframes: {
        shimmer: {
          "0%":   { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "0.55" },
          "50%":      { opacity: "1" },
        },
        scanline: {
          "0%":   { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100%)" },
        },
        countUp: {
          "0%":   { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        indeterminate: {                                    // ADD
          "0%":   { left: "-33%", width: "33%" },          // ADD
          "50%":  { left: "30%",  width: "50%" },          // ADD
          "100%": { left: "110%", width: "33%" },          // ADD
        },
      },
      animation: {
        shimmer:  "shimmer 2.5s linear infinite",
        pulseSoft:"pulseSoft 2s ease-in-out infinite",
        scanline: "scanline 2.4s linear infinite",
        countUp:  "countUp 300ms ease-out",
        indeterminate: "indeterminate 1.4s ease-in-out infinite",
      },
      backgroundImage: {
        "panel-grid":
          "linear-gradient(to right, rgba(148,163,184,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.06) 1px, transparent 1px)",
        "accent-radial":
          "radial-gradient(circle at center, rgba(34,197,94,0.18), rgba(34,197,94,0.00) 70%)",
      },
      backgroundSize: {
        "panel-grid": "24px 24px",
      },
      transitionTimingFunction: {
        smooth: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [],
} satisfies Config;
