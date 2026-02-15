// frontend/src/layouts/AppLayout.tsx
//
// Shell layout for all /app/* routes.
//
// Structure:
//   ┌─────────────────────────────────────────────────┐
//   │  Sidebar (240px) │  Topbar (48px)               │
//   │                  ├─────────────────────────────  │
//   │  Nav items       │  <Outlet /> ← sole scroll    │
//   │                  │             region            │
//   │  [collapse btn]  │                               │
//   └─────────────────────────────────────────────────┘
//
// Collapsed sidebar: 56px icon-only rail.
// Mobile (<768px): sidebar hidden behind a slide-in drawer
//                  triggered by the hamburger in the topbar.
//
// Scroll contract: ONLY the main content area scrolls.
//   sidebar, topbar → position:fixed / sticky, overflow:hidden
//   main             → overflow-y:auto, flex-1
//
// Collapse state persisted in localStorage key "nullproof:sidebar:collapsed"

import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
  } from "react";
  import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
  
  import WalletButton from "@/components/wallet/ConnectWalletButton";
  
  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------
  
  const SIDEBAR_FULL_W  = 240;   // px
  const SIDEBAR_RAIL_W  = 56;    // px — icon-only collapsed rail
  const TOPBAR_H        = 48;    // px
  const MOBILE_BREAK    = 768;   // px — matches Tailwind md:
  
  const LS_KEY = "nullproof:sidebar:collapsed";
  
  // ---------------------------------------------------------------------------
  // Nav item definitions
  // ---------------------------------------------------------------------------
  
  interface NavItem {
    label:   string;
    to:      string;
    /** Matches any sub-path — e.g. /app/ledger/123 */
    matchPrefix?: boolean;
  }
  
  const NAV_ITEMS: NavItem[] = [
    { label: "Dashboard", to: "/app/dashboard"               },
    { label: "Deposit",   to: "/app/deposit"                 },
    { label: "Ledger",    to: "/app/ledger",   matchPrefix: true },
    { label: "Settings",  to: "/app/settings"                },
  ];
  
  // ---------------------------------------------------------------------------
  // Nav icons (inline SVG, keyed by route segment)
  // ---------------------------------------------------------------------------
  
  function NavIcon({ to, className }: { to: string; className?: string }) {
    const cls = className ?? "h-4 w-4";
    const segment = to.split("/").pop() ?? "";
  
    switch (segment) {
      case "dashboard":
        return (
          <svg viewBox="0 0 16 16" className={cls} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1" />
            <rect x="9"   y="1.5" width="5.5" height="5.5" rx="1" />
            <rect x="1.5" y="9"   width="5.5" height="5.5" rx="1" />
            <rect x="9"   y="9"   width="5.5" height="5.5" rx="1" />
          </svg>
        );
      case "deposit":
        return (
          <svg viewBox="0 0 16 16" className={cls} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M8 2v9M4.5 7.5L8 11l3.5-3.5" />
            <path d="M2.5 13.5h11" />
          </svg>
        );
      case "ledger":
        return (
          <svg viewBox="0 0 16 16" className={cls} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="2" y="1.5" width="12" height="13" rx="1.5" />
            <path d="M5 5h6M5 8h6M5 11h4" />
          </svg>
        );
      case "settings":
        return (
          <svg viewBox="0 0 16 16" className={cls} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="8" cy="8" r="2" />
            <path d="M8 1.5v1.3M8 13.2v1.3M1.5 8h1.3M13.2 8h1.3M3.4 3.4l.9.9M11.7 11.7l.9.9M3.4 12.6l.9-.9M11.7 4.3l.9-.9" />
          </svg>
        );
      default:
        return (
          <svg viewBox="0 0 16 16" className={cls} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="8" cy="8" r="5.5" />
          </svg>
        );
    }
  }
  
  // ---------------------------------------------------------------------------
  // Layout context — exposes collapse toggle to children if needed
  // ---------------------------------------------------------------------------
  
  interface AppLayoutCtx {
    collapsed:    boolean;
    toggleSidebar: () => void;
  }
  
  const AppLayoutContext = createContext<AppLayoutCtx>({
    collapsed:     false,
    toggleSidebar: () => {},
  });
  
  export function useAppLayout() {
    return useContext(AppLayoutContext);
  }
  
  // ---------------------------------------------------------------------------
  // Logo mark (inline SVG — consistent with site brand)
  // ---------------------------------------------------------------------------
  
  function LogoMark({ size = 24 }: { size?: number }) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden="true"
      >
        {/* Outer shield */}
        <path
          d="M16 2L4 7v8c0 8 5.4 13.5 12 15 6.6-1.5 12-7 12-15V7L16 2z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-teal-500"
        />
        {/* Inner checkmark */}
        <path
          d="M10.5 16l3.5 3.5 7.5-7"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-teal-400"
        />
      </svg>
    );
  }
  
  // ---------------------------------------------------------------------------
  // Sidebar nav item
  // ---------------------------------------------------------------------------
  
  function SideNavItem({
    item,
    collapsed,
    onClick,
  }: {
    item:      NavItem;
    collapsed: boolean;
    onClick?:  () => void;
  }) {
    const location = useLocation();
    const isActive = item.matchPrefix
      ? location.pathname.startsWith(item.to)
      : location.pathname === item.to ||
        location.pathname.startsWith(item.to + "/");
  
    return (
      <NavLink
        to={item.to}
        onClick={onClick}
        aria-label={collapsed ? item.label : undefined}
        title={collapsed ? item.label : undefined}
        className={[
          "group relative flex items-center rounded-lg transition-all duration-150",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal-500/60",
          collapsed
            ? "h-9 w-9 justify-center"
            : "h-9 gap-3 px-3",
          isActive
            ? "bg-teal-500/10 text-teal-400"
            : [
                "text-zinc-500",
                "hover:bg-zinc-800/60 hover:text-zinc-200",
              ].join(" "),
        ].join(" ")}
      >
        {/* Active indicator bar */}
        {isActive && (
          <span
            className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-teal-500"
            aria-hidden="true"
          />
        )}
  
        <NavIcon to={item.to} />
  
        {/* Label — hidden when collapsed */}
        {!collapsed && (
          <span className="text-[13px] font-medium leading-none">
            {item.label}
          </span>
        )}
  
        {/* Tooltip on collapsed hover */}
        {collapsed && (
          <span
            className={[
              "pointer-events-none absolute left-full ml-3 z-50",
              "whitespace-nowrap rounded-lg border border-zinc-800 bg-zinc-900",
              "px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 shadow-lg",
              "opacity-0 translate-x-1 transition-all duration-150",
              "group-hover:opacity-100 group-hover:translate-x-0",
            ].join(" ")}
            role="tooltip"
          >
            {item.label}
          </span>
        )}
      </NavLink>
    );
  }
  
  // ---------------------------------------------------------------------------
  // Sidebar
  // ---------------------------------------------------------------------------
  
  function Sidebar({
    collapsed,
    onToggle,
    onNavClick,
  }: {
    collapsed:   boolean;
    onToggle:    () => void;
    onNavClick?: () => void;
  }) {
    const width = collapsed ? SIDEBAR_RAIL_W : SIDEBAR_FULL_W;
  
    return (
      <aside
        style={{ width }}
        className={[
          "flex h-full flex-col overflow-hidden",
          "border-r border-zinc-800 bg-zinc-950",
          "transition-[width] duration-200 ease-out",
        ].join(" ")}
        aria-label="Main navigation"
      >
        {/* ── Brand / Logo ─────────────────────────────────────────── */}
        <div
          className={[
            "flex shrink-0 items-center border-b border-zinc-800",
            "transition-all duration-200",
            collapsed
              ? `h-[${TOPBAR_H}px] justify-center px-0`
              : `h-[${TOPBAR_H}px] gap-2.5 px-4`,
          ].join(" ")}
          style={{ height: TOPBAR_H }}
        >
          <Link
            to="/app/dashboard"
            className="flex items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal-500/60"
            aria-label="NullProof — go to dashboard"
          >
            <LogoMark size={22} />
            {!collapsed && (
              <span className="text-sm font-semibold tracking-tight text-zinc-200">
                NullProof
              </span>
            )}
          </Link>
        </div>
  
        {/* ── Nav items ────────────────────────────────────────────── */}
        <nav className={["flex flex-1 flex-col gap-1 overflow-y-auto py-3", collapsed ? "px-2" : "px-3"].join(" ")}>
          {NAV_ITEMS.map((item) => (
            <SideNavItem
              key={item.to}
              item={item}
              collapsed={collapsed}
              {...(onNavClick ? { onClick: onNavClick } : {})}
            />
          ))}
        </nav>
  
        {/* ── Collapse toggle ──────────────────────────────────────── */}
        <div
          className={[
            "shrink-0 border-t border-zinc-800 py-3",
            collapsed ? "flex justify-center px-0" : "px-3",
          ].join(" ")}
        >
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={[
              "flex items-center rounded-lg transition-colors duration-150",
              "text-zinc-700 hover:bg-zinc-800/60 hover:text-zinc-400",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-600",
              collapsed
                ? "h-9 w-9 justify-center"
                : "h-9 w-full gap-3 px-3",
            ].join(" ")}
          >
            {/* Chevron — flips direction */}
            <svg
              viewBox="0 0 16 16"
              className={[
                "h-4 w-4 transition-transform duration-200",
                collapsed ? "rotate-180" : "rotate-0",
              ].join(" ")}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M10 4L6 8l4 4" />
            </svg>
            {!collapsed && (
              <span className="text-[12px] font-medium">Collapse</span>
            )}
          </button>
        </div>
      </aside>
    );
  }
  
  // ---------------------------------------------------------------------------
  // Topbar
  // ---------------------------------------------------------------------------
  
  function Topbar({
    onMenuClick,
    mobileDrawerOpen,
  }: {
    onMenuClick:      () => void;
    mobileDrawerOpen: boolean;
  }) {
    const location = useLocation();
  
    // Derive page title from current route
    const pageTitle = (() => {
      const segment = location.pathname.split("/").filter(Boolean).pop() ?? "";
      const item    = NAV_ITEMS.find((n) => n.to.endsWith(segment));
      return item?.label ?? "NullProof";
    })();
  
    return (
      <header
        className="flex shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-950 px-4"
        style={{ height: TOPBAR_H }}
        role="banner"
      >
        {/* ── Left: mobile hamburger + page title ──────────────────── */}
        <div className="flex items-center gap-3">
          {/* Hamburger — mobile only */}
          <button
            type="button"
            onClick={onMenuClick}
            aria-label={mobileDrawerOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={mobileDrawerOpen}
            className={[
              "flex h-8 w-8 items-center justify-center rounded-lg md:hidden",
              "text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-600",
            ].join(" ")}
          >
            {mobileDrawerOpen ? (
              /* X */
              <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M3 3l10 10M13 3L3 13" />
              </svg>
            ) : (
              /* Hamburger */
              <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <path d="M2 4h12M2 8h12M2 12h12" />
              </svg>
            )}
          </button>
  
          {/* Page title */}
          <h1 className="text-sm font-semibold text-zinc-300">
            {pageTitle}
          </h1>
        </div>
  
        {/* ── Right: network badge + wallet ────────────────────────── */}
        <div className="flex items-center gap-3">
          {/* Sepolia network badge */}
          <span className="hidden items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900 px-2.5 py-1 sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-teal-500" aria-hidden="true" />
            <span className="font-mono text-[10px] font-medium text-zinc-600">
              Sepolia
            </span>
          </span>
  
          {/* Wallet button (built — File 88) */}
          <WalletButton />
        </div>
      </header>
    );
  }
  
  // ---------------------------------------------------------------------------
  // Mobile drawer backdrop + slide-in panel
  // ---------------------------------------------------------------------------
  
  function MobileDrawer({
    open,
    onClose,
  }: {
    open:    boolean;
    onClose: () => void;
  }) {
    // Trap scroll when open
    useEffect(() => {
      if (open) {
        document.body.style.overflow = "hidden";
      } else {
        document.body.style.overflow = "";
      }
      return () => { document.body.style.overflow = ""; };
    }, [open]);
  
    // Close on Escape
    useEffect(() => {
      if (!open) return;
      function onKey(e: KeyboardEvent) {
        if (e.key === "Escape") onClose();
      }
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);
  
    return (
      <>
        {/* Backdrop */}
        <div
          aria-hidden="true"
          onClick={onClose}
          className={[
            "fixed inset-0 z-40 bg-zinc-950/80 backdrop-blur-sm md:hidden",
            "transition-opacity duration-200",
            open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
          ].join(" ")}
        />
  
        {/* Slide-in panel */}
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
          className={[
            "fixed inset-y-0 left-0 z-50 flex flex-col md:hidden",
            "w-[220px] border-r border-zinc-800 bg-zinc-950",
            "transition-transform duration-200 ease-out",
            open ? "translate-x-0" : "-translate-x-full",
          ].join(" ")}
        >
          {/* Drawer header */}
          <div
            className="flex shrink-0 items-center gap-2.5 border-b border-zinc-800 px-4"
            style={{ height: TOPBAR_H }}
          >
            <LogoMark size={20} />
            <span className="text-sm font-semibold tracking-tight text-zinc-200">
              NullProof
            </span>
          </div>
  
          {/* Nav */}
          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-3">
            {NAV_ITEMS.map((item) => (
              <SideNavItem
                key={item.to}
                item={item}
                collapsed={false}
                onClick={onClose}
              />
            ))}
          </nav>
        </div>
      </>
    );
  }
  
  // ---------------------------------------------------------------------------
  // AppLayout
  // ---------------------------------------------------------------------------
  
  export function AppLayout() {
    // ── Sidebar collapse state (persisted) ────────────────────────────────
    const [collapsed, setCollapsed] = useState<boolean>(() => {
      try {
        return localStorage.getItem(LS_KEY) === "1";
      } catch {
        return false;
      }
    });
  
    const toggleSidebar = useCallback(() => {
      setCollapsed((prev) => {
        const next = !prev;
        try { localStorage.setItem(LS_KEY, next ? "1" : "0"); } catch { /* silent */ }
        return next;
      });
    }, []);
  
    // Auto-collapse on narrow viewports
    const didAutoCollapse = useRef(false);
  
    useEffect(() => {
      function check() {
        if (window.innerWidth < MOBILE_BREAK) {
          // On mobile the drawer handles navigation — keep sidebar state neutral
          return;
        }
        // On first desktop mount, respect persisted state
        didAutoCollapse.current = true;
      }
      check();
      window.addEventListener("resize", check);
      return () => window.removeEventListener("resize", check);
    }, []);
  
    // ── Mobile drawer ──────────────────────────────────────────────────────
    const [drawerOpen, setDrawerOpen] = useState(false);
  
    // Close drawer on route change
    const location = useLocation();
    const prevPathRef = useRef(location.pathname);
  
    useEffect(() => {
      if (prevPathRef.current !== location.pathname) {
        prevPathRef.current = location.pathname;
        setDrawerOpen(false);
      }
    }, [location.pathname]);
  
    // ── Sidebar width CSS var for content offset ───────────────────────────
    const sidebarWidth = collapsed ? SIDEBAR_RAIL_W : SIDEBAR_FULL_W;
  
    return (
      <AppLayoutContext.Provider value={{ collapsed, toggleSidebar }}>
        <div className="flex h-dvh overflow-hidden bg-zinc-950 text-zinc-200">
  
          {/* ── Desktop sidebar (hidden on mobile) ────────────────────── */}
          <div className="hidden md:flex">
            <Sidebar
              collapsed={collapsed}
              onToggle={toggleSidebar}
            />
          </div>
  
          {/* ── Mobile drawer ─────────────────────────────────────────── */}
          <MobileDrawer
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
          />
  
          {/* ── Right column: topbar + content ───────────────────────── */}
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <Topbar
              onMenuClick={() => setDrawerOpen((o) => !o)}
              mobileDrawerOpen={drawerOpen}
            />
  
            {/* ── Main content — SOLE scroll region ─────────────────── */}
            <main
              id="main-content"
              className="flex-1 overflow-y-auto"
              tabIndex={-1}
            >
              {/* Skip-link target */}
              <a
                href="#main-content"
                className={[
                  "sr-only focus:not-sr-only",
                  "fixed left-4 top-4 z-50 rounded-lg border border-zinc-700",
                  "bg-zinc-900 px-4 py-2 text-sm text-zinc-200",
                  "focus:outline-none focus:ring-2 focus:ring-teal-500",
                ].join(" ")}
              >
                Skip to content
              </a>
  
              <Outlet />
            </main>
          </div>
        </div>
      </AppLayoutContext.Provider>
    );
  }
  
  export default AppLayout;