import type { Variants, Transition } from "framer-motion";

// ---------------------------------------------------------------------------
// Shared transitions
// ---------------------------------------------------------------------------

export const springSnappy: Transition = {
  type: "spring",
  stiffness: 400,
  damping: 30,
};

export const springGentle: Transition = {
  type: "spring",
  stiffness: 260,
  damping: 24,
};

export const easeFast: Transition = {
  type: "tween",
  ease: [0.16, 1, 0.3, 1], // expo-out — fast start, soft landing
  duration: 0.35,
};

export const easeMedium: Transition = {
  type: "tween",
  ease: [0.16, 1, 0.3, 1],
  duration: 0.5,
};

// ---------------------------------------------------------------------------
// Entrance variants
// ---------------------------------------------------------------------------

/** Fade up from 12px below — standard card / section entrance */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: easeFast,
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: { ...easeFast, duration: 0.2 },
  },
};

/** Simple opacity fade — overlays, toasts, status badges */
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.25, ease: "easeOut" },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.15, ease: "easeIn" },
  },
};

/** Fade in from the right — drawers, side panels */
export const fadeRight: Variants = {
  hidden: { opacity: 0, x: 24 },
  visible: {
    opacity: 1,
    x: 0,
    transition: easeFast,
  },
  exit: {
    opacity: 0,
    x: 24,
    transition: { ...easeFast, duration: 0.2 },
  },
};

/** Fade in from the left — back-navigation panels */
export const fadeLeft: Variants = {
  hidden: { opacity: 0, x: -24 },
  visible: {
    opacity: 1,
    x: 0,
    transition: easeFast,
  },
  exit: {
    opacity: 0,
    x: -24,
    transition: { ...easeFast, duration: 0.2 },
  },
};

/** Scale up from 95% — modals, popovers, dropdowns */
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: springSnappy,
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: { duration: 0.15, ease: "easeIn" },
  },
};

// ---------------------------------------------------------------------------
// Stagger containers
// ---------------------------------------------------------------------------

/**
 * Parent container that staggers children with 0.07s delay.
 * Use with fadeUp / fadeIn children.
 *
 * <motion.ul variants={stagger} initial="hidden" animate="visible">
 *   <motion.li variants={fadeUp}>…</motion.li>
 * </motion.ul>
 */
export const stagger: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.07,
      delayChildren: 0.05,
    },
  },
  exit: {
    transition: {
      staggerChildren: 0.04,
      staggerDirection: -1,
    },
  },
};

/**
 * Faster stagger for dense lists (nullifier history, root history rows).
 */
export const staggerFast: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.02,
    },
  },
  exit: {
    transition: { staggerChildren: 0.02, staggerDirection: -1 },
  },
};

// ---------------------------------------------------------------------------
// Proof flow specific
// ---------------------------------------------------------------------------

/**
 * Proof step indicator — slides in and pulses when active.
 * Used by the proof generation progress stepper.
 */
export const proofStep: Variants = {
  idle: { opacity: 0.4, scale: 1 },
  active: {
    opacity: 1,
    scale: 1.05,
    transition: springGentle,
  },
  done: {
    opacity: 1,
    scale: 1,
    transition: springSnappy,
  },
  error: {
    opacity: 1,
    scale: 1,
    x: [0, -4, 4, -4, 4, 0], // shake
    transition: { duration: 0.4, ease: "easeInOut" },
  },
};

/**
 * Success checkmark draw-on animation.
 * Apply to an SVG <path> with pathLength set to 1.
 */
export const checkmarkDraw: Variants = {
  hidden: { pathLength: 0, opacity: 0 },
  visible: {
    pathLength: 1,
    opacity: 1,
    transition: { pathLength: { duration: 0.5, ease: "easeOut" }, opacity: { duration: 0.1 } },
  },
};

/**
 * Container for the proof result card — slides up with a slight bounce
 * to give the success moment more weight.
 */
export const proofResult: Variants = {
  hidden: { opacity: 0, y: 24, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: springGentle,
  },
  exit: {
    opacity: 0,
    y: -16,
    transition: { duration: 0.2, ease: "easeIn" },
  },
};

// ---------------------------------------------------------------------------
// Layout / page transitions
// ---------------------------------------------------------------------------

/**
 * Full-page route transition — fades and shifts up slightly.
 * Wrap page root elements with this variant.
 */
export const pageTransition: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: easeMedium,
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: { duration: 0.2, ease: "easeIn" },
  },
};

/**
 * Overlay backdrop — semi-transparent black behind modals/drawers.
 */
export const backdrop: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2, ease: "easeOut" } },
  exit:   { opacity: 0, transition: { duration: 0.15, ease: "easeIn" } },
};
