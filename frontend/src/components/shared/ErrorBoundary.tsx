// frontend/src/components/shared/ErrorBoundary.tsx
//
// React class-based error boundary — catches unhandled render/lifecycle
// errors in any subtree and renders a fallback UI instead of a blank screen.
//
// Three usage tiers:
//
//   1. <RootErrorBoundary>          — wraps the entire app in main.tsx
//      Full-page fallback, always shows "Reload page" + optional reset
//
//   2. <SectionErrorBoundary>       — wraps major page sections
//      Contained card fallback, shows error detail in dev, generic in prod
//
//   3. <InlineErrorBoundary>        — wraps small widgets (charts, cards)
//      Minimal inline fallback, just an error icon + retry
//
// All three share a single ErrorBoundary class with a `tier` prop.
//
// Additional features:
//   • Copies full error + stack to clipboard in dev mode
//   • "Try again" resets the boundary state (re-mounts children)
//   • onError callback prop for external logging (Sentry, etc.)
//   • ErrorBoundary.displayName set for React DevTools legibility

import React from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ErrorBoundaryTier = "root" | "section" | "inline";

export interface ErrorBoundaryProps {
  children:     React.ReactNode;
  tier?:        ErrorBoundaryTier;
  /**
   * Custom fallback element. When provided, replaces the built-in UI
   * entirely. Receives the error so it can render contextually.
   */
  fallback?:    (error: Error, reset: () => void) => React.ReactNode;
  /**
   * Called whenever an error is caught — wire up Sentry / DataDog here.
   */
  onError?:     (error: Error, info: React.ErrorInfo) => void;
  /**
   * Label shown in the fallback heading (e.g. "Proof panel").
   * Falls back to a generic label based on tier.
   */
  label?:       string;
  className?:   string;
}

interface ErrorBoundaryState {
  hasError:    boolean;
  error:       Error | null;
  errorInfo:   React.ErrorInfo | null;
  /** Incremented on reset to force full re-mount of children */
  resetKey:    number;
  /** Whether the error detail has been copied to clipboard */
  copied:      boolean;
}

// ---------------------------------------------------------------------------
// isDev — hides stack traces in production
// ---------------------------------------------------------------------------

const isDev =
  typeof process !== "undefined"
    ? process.env.NODE_ENV !== "production"
    : import.meta.env?.DEV ?? false;

// ---------------------------------------------------------------------------
// ErrorBoundary class
// ---------------------------------------------------------------------------

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  static displayName = "ErrorBoundary";

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError:  false,
      error:     null,
      errorInfo: null,
      resetKey:  0,
      copied:    false,
    };
    this.reset      = this.reset.bind(this);
    this.copyError  = this.copyError.bind(this);
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.setState({ errorInfo: info });
    this.props.onError?.(error, info);

    if (isDev) {
      // eslint-disable-next-line no-console
      console.group("[ErrorBoundary] Caught error");
      console.error(error);
      console.error("Component stack:", info.componentStack);
      console.groupEnd();
    }
  }

  reset() {
    this.setState((prev) => ({
      hasError:  false,
      error:     null,
      errorInfo: null,
      resetKey:  prev.resetKey + 1,
      copied:    false,
    }));
  }

  async copyError() {
    const { error, errorInfo } = this.state;
    if (!error) return;

    const text = [
      `Error: ${error.message}`,
      "",
      error.stack ?? "(no stack)",
      "",
      "Component stack:",
      errorInfo?.componentStack ?? "(unavailable)",
    ].join("\n");

    try {
      await navigator.clipboard.writeText(text);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    } catch { /* silent */ }
  }

  render() {
    const { hasError, error, errorInfo, resetKey, copied } = this.state;
    const { children, tier = "section", fallback, label, className = "" } = this.props;

    if (!hasError) {
      // Key forces full re-mount of children on reset
      return (
        <React.Fragment key={resetKey}>
          {children}
        </React.Fragment>
      );
    }

    // Custom fallback
    if (fallback && error) {
      return <>{fallback(error, this.reset)}</>;
    }

    // Built-in fallback by tier
    const safeError = error ?? new Error("Unknown error");

    switch (tier) {
      case "root":
        return (
          <RootFallback
            error={safeError}
            errorInfo={errorInfo}
            label={label ?? ""}
            copied={copied}
            onReset={this.reset}
            onCopy={this.copyError}
            className={className}
          />
        );
      case "inline":
        return (
          <InlineFallback
            error={safeError}
            label={label ?? ""}
            onReset={this.reset}
            className={className}
          />
        );
      case "section":
      default:
        return (
          <SectionFallback
            error={safeError}
            errorInfo={errorInfo}
            label={label ?? ""}
            copied={copied}
            onReset={this.reset}
            onCopy={this.copyError}
            className={className}
          />
        );
    }
  }
}

// ---------------------------------------------------------------------------
// Shared icon helpers
// ---------------------------------------------------------------------------

function AlertHexIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9"  x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 8A6 6 0 1 1 8.5 2.1" />
      <path d="M14 2v4h-4" />
    </svg>
  );
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 14 14"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="4" width="8.5" height="9" rx="1.2" />
      <path d="M9.5 4V2.5a1.2 1.2 0 0 0-1.2-1.2H2A1.2 1.2 0 0 0 .8 2.5V10a1.2 1.2 0 0 0 1.2 1.2H4" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 12 12"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M1.5 6l3 3 6-5.5" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Stack trace block (dev only)
// ---------------------------------------------------------------------------

function StackTrace({
  error,
  errorInfo,
  copied,
  onCopy,
}: {
  error:     Error;
  errorInfo: React.ErrorInfo | null;
  copied:    boolean;
  onCopy:    () => void;
}) {
  if (!isDev) return null;

  return (
    <details className="group mt-4">
      <summary
        className={[
          "flex cursor-pointer select-none items-center gap-2",
          "rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2",
          "text-[10px] font-medium text-zinc-600 transition-colors",
          "hover:border-zinc-700 hover:text-zinc-400",
        ].join(" ")}
      >
        <svg viewBox="0 0 12 12" className="h-3 w-3 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 2l4 4-4 4" />
        </svg>
        Stack trace
        <span className="ml-auto rounded bg-zinc-800 px-1 py-0.5 font-mono text-[9px] text-zinc-700">
          dev only
        </span>
      </summary>

      <div className="relative mt-2 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/80">
        {/* Copy button */}
        <button
          type="button"
          onClick={onCopy}
          aria-label={copied ? "Copied" : "Copy error to clipboard"}
          className={[
            "absolute right-2 top-2 flex items-center gap-1.5 rounded-md px-2 py-1",
            "text-[10px] font-medium transition-colors duration-150",
            "border focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500",
            copied
              ? "border-teal-500/30 bg-teal-500/10 text-teal-400"
              : "border-zinc-800 bg-zinc-900 text-zinc-600 hover:text-zinc-400",
          ].join(" ")}
        >
          {copied ? (
            <><CheckIcon className="h-2.5 w-2.5" /> Copied</>
          ) : (
            <><CopyIcon className="h-2.5 w-2.5" /> Copy</>
          )}
        </button>

        <pre className="max-h-60 overflow-auto p-3 pr-20 font-mono text-[9px] leading-relaxed text-zinc-500">
          <span className="text-rose-400">{error.name}: </span>
          <span className="text-zinc-300">{error.message}</span>
          {"\n\n"}
          <span className="text-zinc-600">{error.stack}</span>
          {errorInfo?.componentStack && (
            <>
              {"\n\nComponent stack:"}
              <span className="text-zinc-700">{errorInfo.componentStack}</span>
            </>
          )}
        </pre>
      </div>
    </details>
  );
}

// ---------------------------------------------------------------------------
// RootFallback — full-page
// ---------------------------------------------------------------------------

interface FallbackProps {
  error:      Error;
  errorInfo?: React.ErrorInfo | null;
  label?:     string;
  copied?:    boolean;
  onReset:    () => void;
  onCopy?:    () => void;
  className?: string;
}

function RootFallback({
  error,
  errorInfo,
  label,
  copied = false,
  onReset,
  onCopy = () => {},
  className = "",
}: FallbackProps) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className={[
        "flex min-h-dvh flex-col items-center justify-center",
        "bg-zinc-950 px-6 py-16 text-center",
        className,
      ].join(" ")}
    >
      {/* Icon */}
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-rose-500/20 bg-rose-500/8">
        <AlertHexIcon className="h-9 w-9 text-rose-400" />
      </div>

      {/* Heading */}
      <h1 className="text-base font-semibold text-zinc-200">
        {label ? `${label} crashed` : "Something went wrong"}
      </h1>
      <p className="mt-2 max-w-[32ch] text-[12px] leading-relaxed text-zinc-600">
        {isDev
          ? error.message || "An unexpected error occurred."
          : "An unexpected error occurred. Reload the page to continue."}
      </p>

      {/* Actions */}
      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className={[
            "flex items-center gap-2 rounded-xl bg-zinc-200 px-5 py-2.5",
            "text-sm font-semibold text-zinc-900 transition-colors",
            "hover:bg-white active:scale-[0.99]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",
          ].join(" ")}
        >
          <RefreshIcon className="h-3.5 w-3.5" />
          Reload page
        </button>

        <button
          type="button"
          onClick={onReset}
          className={[
            "flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-2.5",
            "text-sm font-semibold text-zinc-400 transition-colors",
            "hover:border-zinc-700 hover:text-zinc-200 active:scale-[0.99]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",
          ].join(" ")}
        >
          Try again
        </button>
      </div>

      {/* Stack trace (dev) */}
      {isDev && errorInfo !== undefined && (
        <div className="mt-8 w-full max-w-xl text-left">
          <StackTrace
            error={error}
            errorInfo={errorInfo ?? null}
            copied={copied}
            onCopy={onCopy}
          />
        </div>
      )}

      {/* Error ID hint (prod) */}
      {!isDev && (
        <p className="mt-10 font-mono text-[10px] text-zinc-800">
          ERR_{Date.now().toString(36).toUpperCase()}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SectionFallback — contained card
// ---------------------------------------------------------------------------

function SectionFallback({
  error,
  errorInfo,
  label,
  copied = false,
  onReset,
  onCopy = () => {},
  className = "",
}: FallbackProps) {
  return (
    <div
      role="alert"
      aria-live="polite"
      className={[
        "flex flex-col items-center overflow-hidden rounded-2xl",
        "border border-rose-500/15 bg-zinc-950 px-6 py-10 text-center",
        className,
      ].join(" ")}
    >
      {/* Icon */}
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-rose-500/20 bg-rose-500/8">
        <AlertHexIcon className="h-6 w-6 text-rose-400" />
      </div>

      {/* Heading */}
      <h2 className="text-sm font-semibold text-zinc-300">
        {label ? `${label} failed to load` : "Something went wrong"}
      </h2>
      <p className="mt-1.5 max-w-[30ch] text-[11px] leading-relaxed text-zinc-600">
        {isDev
          ? error.message || "An unexpected error occurred in this section."
          : "This section encountered an error. Try again or reload the page."}
      </p>

      {/* Actions */}
      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={onReset}
          className={[
            "flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2",
            "text-[12px] font-semibold text-zinc-400 transition-colors",
            "hover:border-zinc-700 hover:text-zinc-200 active:scale-[0.99]",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",
          ].join(" ")}
        >
          <RefreshIcon className="h-3 w-3" />
          Try again
        </button>

        <button
          type="button"
          onClick={() => window.location.reload()}
          className={[
            "text-[11px] text-zinc-700 underline underline-offset-2 transition-colors",
            "hover:text-zinc-500",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-600",
          ].join(" ")}
        >
          Reload page
        </button>
      </div>

      {/* Stack trace (dev) */}
      {isDev && errorInfo !== undefined && (
        <div className="mt-6 w-full max-w-lg text-left">
          <StackTrace
            error={error}
            errorInfo={errorInfo ?? null}
            copied={copied}
            onCopy={onCopy}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// InlineFallback — minimal widget-level
// ---------------------------------------------------------------------------

function InlineFallback({
  error,
  label,
  onReset,
  className = "",
}: Omit<FallbackProps, "errorInfo" | "copied" | "onCopy">) {
  return (
    <div
      role="alert"
      aria-live="polite"
      className={[
        "flex items-center justify-between gap-3",
        "rounded-xl border border-rose-500/12 bg-rose-500/5 px-3 py-2.5",
        className,
      ].join(" ")}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        {/* Small alert icon */}
        <AlertHexIcon className="h-4 w-4 shrink-0 text-rose-500" />
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold text-zinc-400">
            {label ? `${label} error` : "Failed to render"}
          </p>
          {isDev && error.message && (
            <p className="mt-0.5 truncate font-mono text-[9px] text-zinc-700">
              {error.message}
            </p>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={onReset}
        aria-label="Retry"
        title="Retry"
        className={[
          "flex shrink-0 items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5",
          "text-[10px] font-semibold text-zinc-500 transition-colors",
          "hover:border-zinc-700 hover:text-zinc-300 active:scale-[0.98]",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500",
        ].join(" ")}
      >
        <RefreshIcon className="h-2.5 w-2.5" />
        Retry
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Convenience wrapper components (named exports for ergonomics)
// ---------------------------------------------------------------------------

export function RootErrorBoundary(
  props: Omit<ErrorBoundaryProps, "tier">,
) {
  return <ErrorBoundary {...props} tier="root" />;
}
RootErrorBoundary.displayName = "RootErrorBoundary";

export function SectionErrorBoundary(
  props: Omit<ErrorBoundaryProps, "tier">,
) {
  return <ErrorBoundary {...props} tier="section" />;
}
SectionErrorBoundary.displayName = "SectionErrorBoundary";

export function InlineErrorBoundary(
  props: Omit<ErrorBoundaryProps, "tier">,
) {
  return <ErrorBoundary {...props} tier="inline" />;
}
InlineErrorBoundary.displayName = "InlineErrorBoundary";

export default ErrorBoundary;