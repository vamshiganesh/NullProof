import React, {
  useState,
  useRef,
  useCallback,
  useId,
  type ReactNode,
} from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TooltipSide = "top" | "bottom" | "left" | "right";
export type TooltipSize = "xs" | "sm" | "md";

export interface TooltipProps {
  /** The tooltip content — plain string or rich JSX. */
  content:      ReactNode;
  children:     ReactNode;
  side?:        TooltipSide;
  size?:        TooltipSize;
  /** Delay before showing in ms (default: 400). */
  delayMs?:     number;
  /** Max width override (default driven by size). */
  maxWidth?:    string;
  /** Disable the tooltip entirely. */
  disabled?:    boolean;
  className?:   string;
}

// ---------------------------------------------------------------------------
// Style maps
// ---------------------------------------------------------------------------

const SIZE_STYLES: Record<TooltipSize, string> = {
  xs: "text-[10px] px-1.5 py-0.5 max-w-[160px]",
  sm: "text-xs     px-2   py-1   max-w-[220px]",
  md: "text-sm     px-2.5 py-1.5 max-w-[300px]",
};

// Tooltip panel + arrow positioning per side
const SIDE_PANEL: Record<TooltipSide, string> = {
  top:    "bottom-full left-1/2 -translate-x-1/2 mb-2",
  bottom: "top-full    left-1/2 -translate-x-1/2 mt-2",
  left:   "right-full  top-1/2  -translate-y-1/2 mr-2",
  right:  "left-full   top-1/2  -translate-y-1/2 ml-2",
};

const SIDE_ARROW: Record<TooltipSide, string> = {
  top:    "top-full  left-1/2 -translate-x-1/2  border-t-zinc-700 border-x-transparent border-b-transparent border-[5px]",
  bottom: "bottom-full left-1/2 -translate-x-1/2 border-b-zinc-700 border-x-transparent border-t-transparent border-[5px]",
  left:   "left-full  top-1/2  -translate-y-1/2  border-l-zinc-700 border-y-transparent border-r-transparent border-[5px]",
  right:  "right-full top-1/2  -translate-y-1/2  border-r-zinc-700 border-y-transparent border-l-transparent border-[5px]",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Tooltip({
  content,
  children,
  side     = "top",
  size     = "sm",
  delayMs  = 400,
  maxWidth,
  disabled = false,
  className = "",
}: TooltipProps) {
  const [visible, setVisible]   = useState(false);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipId = useId();

  const show = useCallback(() => {
    if (disabled) return;
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
    showTimer.current = setTimeout(() => setVisible(true), delayMs);
  }, [disabled, delayMs]);

  const hide = useCallback(() => {
    if (showTimer.current) { clearTimeout(showTimer.current); showTimer.current = null; }
    // Small grace period so cursor can move onto the tooltip itself
    hideTimer.current = setTimeout(() => setVisible(false), 80);
  }, []);

  const showNow = useCallback(() => {
    if (disabled) return;
    if (showTimer.current) clearTimeout(showTimer.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setVisible(true);
  }, [disabled]);

  const hideNow = useCallback(() => {
    if (showTimer.current) clearTimeout(showTimer.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setVisible(false);
  }, []);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (showTimer.current) clearTimeout(showTimer.current);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  return (
    <span
      className={["relative inline-flex items-center", className].join(" ")}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={showNow}
      onBlur={hideNow}
    >
      {/* Trigger — annotate with aria-describedby when visible */}
      <span
        aria-describedby={visible ? tooltipId : undefined}
        className="inline-flex items-center"
      >
        {children}
      </span>

      {/* Tooltip panel */}
      {visible && !disabled && (
        <span
          id={tooltipId}
          role="tooltip"
          onMouseEnter={hideTimer.current ? () => { if(hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; } } : undefined}
          onMouseLeave={hide}
          className={[
            // Position
            "absolute z-50 pointer-events-none",
            SIDE_PANEL[side],
            // Appearance
            "bg-zinc-900 border border-zinc-700",
            "text-zinc-200 font-sans leading-snug",
            "rounded-lg shadow-xl shadow-black/40",
            // Sizing
            SIZE_STYLES[size],
            // Animation — fade + slight translate in from the correct side
            "animate-[tooltipIn_120ms_ease-out_forwards]",
            // Whitespace
            "whitespace-normal break-words",
          ].join(" ")}
          style={maxWidth ? { maxWidth } : undefined}
        >
          {content}

          {/* Arrow */}
          <span
            aria-hidden="true"
            className={[
              "absolute w-0 h-0",
              SIDE_ARROW[side],
            ].join(" ")}
          />
        </span>
      )}
    </span>
  );
}

export default Tooltip;
