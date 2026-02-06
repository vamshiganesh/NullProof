// frontend/src/components/layout/Sidebar.tsx
import React from "react";
import { NavLink } from "react-router-dom";

import { StatusDot } from "@/components/ui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SidebarItem = {
  label: string;
  to: string;
  end?: boolean;
};

export interface SidebarProps {
  className?: string;
  collapsed?: boolean;
  networkLabel?: string;
  networkState?: "live" | "pending" | "error" | "idle" | "warning";
}

// ---------------------------------------------------------------------------
// Navigation model
// ---------------------------------------------------------------------------

const NAV_ITEMS: SidebarItem[] = [
  { label: "Dashboard",  to: "/" ,          end: true  },
  { label: "ZK-Proofs",  to: "/proofs" },
  { label: "Compliance", to: "/compliance" },
  { label: "Audits",     to: "/audits" },
  { label: "Settings",   to: "/settings" },
];

// ---------------------------------------------------------------------------
// Small inline SVG icons
// ---------------------------------------------------------------------------

function DashboardIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="8" height="8" rx="2" className={active ? "opacity-100" : "opacity-80"} />
      <rect x="13" y="3" width="8" height="5" rx="2" className={active ? "opacity-100" : "opacity-60"} />
      <rect x="13" y="10" width="8" height="11" rx="2" className={active ? "opacity-100" : "opacity-80"} />
      <rect x="3" y="13" width="8" height="8" rx="2" className={active ? "opacity-100" : "opacity-60"} />
    </svg>
  );
}

function ProofsIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 7h10M7 12h10M7 17h6" className={active ? "opacity-100" : "opacity-80"} />
      <path d="M5 5h14v14H5z" className={active ? "opacity-100" : "opacity-60"} />
    </svg>
  );
}

function ComplianceIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3l7 3v5c0 4.5-2.8 7.9-7 10-4.2-2.1-7-5.5-7-10V6l7-3z" />
      <path d="M9.2 12.3l1.9 1.9 3.9-4.1" className={active ? "opacity-100" : "opacity-80"} />
    </svg>
  );
}

function AuditsIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 6h9M10 12h9M10 18h9" />
      <path d="M5 6h.01M5 12h.01M5 18h.01" className={active ? "opacity-100" : "opacity-80"} />
    </svg>
  );
}

function SettingsIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path
        d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 0 1-4 0v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a2 2 0 0 1 0-4h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a2 2 0 0 1 4 0v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6H20a2 2 0 0 1 0 4h-.2a1 1 0 0 0-.9.6z"
        className={active ? "opacity-100" : "opacity-70"}
      />
    </svg>
  );
}

function getIcon(label: string, active: boolean) {
  switch (label) {
    case "Dashboard":
      return <DashboardIcon active={active} />;
    case "ZK-Proofs":
      return <ProofsIcon active={active} />;
    case "Compliance":
      return <ComplianceIcon active={active} />;
    case "Audits":
      return <AuditsIcon active={active} />;
    case "Settings":
      return <SettingsIcon active={active} />;
    default:
      return <DashboardIcon active={active} />;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Sidebar({
  className = "",
  collapsed = false,
  networkLabel = "Sepolia",
  networkState = "live",
}: SidebarProps) {
  return (
    <aside
      className={[
        "hidden lg:flex lg:flex-col",
        collapsed ? "lg:w-20" : "lg:w-72",
        "border-r border-zinc-800",
        "bg-zinc-950/95",
        "backdrop-blur-xl",
        className,
      ].join(" ")}
    >
      <div className="flex h-full flex-col">
        {/* Brand */}
        <div className="border-b border-zinc-800 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 shadow-[0_0_24px_rgba(16,185,129,0.12)]">
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 3l7 4v5c0 4.4-2.6 7.6-7 9-4.4-1.4-7-4.6-7-9V7l7-4z" />
                <path d="M8.5 12.5l2.2 2.2 4.8-5" />
              </svg>
            </div>

            {!collapsed && (
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold tracking-tight text-zinc-100">
                  NullProof
                </p>
                <p className="truncate font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                  ZK Compliance Console
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav
          aria-label="Primary"
          className="flex-1 overflow-y-auto px-3 py-4"
        >
          <ul className="space-y-1" role="list">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end ?? false}
                  className={({ isActive }) =>
                    [
                      "group relative flex items-center gap-3 rounded-xl px-3 py-2.5",
                      "transition-all duration-150 ease-out",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",
                      isActive
                        ? "bg-emerald-500/10 text-emerald-400 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.18)]"
                        : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100",
                      collapsed ? "justify-center" : "",
                    ].join(" ")
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <span
                          aria-hidden="true"
                          className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-emerald-400"
                        />
                      )}

                      <span
                        className={[
                          "flex items-center justify-center",
                          isActive ? "text-emerald-400" : "text-zinc-500 group-hover:text-zinc-300",
                        ].join(" ")}
                      >
                        {getIcon(item.label, isActive)}
                      </span>

                      {!collapsed && (
                        <span className="truncate text-sm font-medium">
                          {item.label}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/* Footer / network badge */}
        <div className="border-t border-zinc-800 px-4 py-4">
          <div
            className={[
              "flex items-center rounded-xl border border-zinc-800 bg-zinc-900/80",
              collapsed ? "justify-center px-2 py-3" : "gap-3 px-3 py-3",
            ].join(" ")}
          >
            <StatusDot
              state={networkState}
              size="sm"
              label={`Network status: ${networkState}`}
            />

            {!collapsed && (
              <div className="min-w-0">
                <p className="text-xs font-medium text-zinc-200">
                  {networkLabel}
                </p>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                  Network live
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;