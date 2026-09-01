/**
 * The design system, in one place (redesign spec §13).
 *
 * Two consumers with different needs, one source:
 *
 * - **Canvas** wants raw values. `drawScene` cannot read a CSS variable per
 *   frame, so it imports these constants directly.
 * - **CSS** wants custom properties. `index.css` mirrors this file inside
 *   Tailwind's `@theme` block; the mirror is asserted against these values by
 *   `src/tests/tokens.test.ts`, so the two cannot drift apart silently.
 *
 * **Zero dependencies, and it must stay that way.** The React-free inline
 * bundle imports this module, and anything reachable from it ships in the feed.
 *
 * Nothing here encodes a *decision*; it encodes the spec's decisions. Changing
 * a value changes the game's look everywhere at once, which is the point.
 */

// -- Colour ------------------------------------------------------------------

/**
 * The palette is deliberately eight colours and no more.
 *
 * `skyTop` / `skyBottom` are absent: they belong to the per-modifier themes in
 * `theme.ts`, which override them at run time. Everything here is constant
 * whatever the day.
 */
export const COLOR = {
  /** Page background and the bottom of a neutral sky. */
  bg: '#0D1626',
  /** Panels: result, leaderboard, condition cards. Lifts off `bg` by value. */
  bgElevated: '#16233A',
  /** Ground silhouettes, and Pip's pupils. */
  ground: '#0A0F1A',
  /** Primary text, score, gauge. 15:1 on `bg`. */
  ink: '#F2F6FC',
  /** Secondary text, distances, low verdicts. 7:1 on `bg`. */
  mist: '#8DA3BF',
  /** Action and energy. Filled CTA, percentile chip, flame, 95–98.99 verdict. */
  coral: '#FF6B4A',
  /** Pressed state of a coral control. */
  coralPressed: '#E6553A',
  /** Bullseye, Perfect, records, top three. 11.5:1 on `bg`. */
  gold: '#FFC53D',
  /** Pip's body. */
  pip: '#2A3242',
} as const;

/**
 * The target's rings, as drawn.
 *
 * `outer` is ink at 70%: the ring has to read as a ring without competing with
 * the score, which is the same colour at full strength.
 */
export const RING = {
  outer: 'rgba(242, 246, 252, 0.7)',
  mid: COLOR.coral,
  center: COLOR.gold,
} as const;

/**
 * Two rules that a reviewer can check on a screenshot, kept here because they
 * are design decisions rather than lint:
 *
 * 1. **Text on coral is `bg`, never white.** White on coral is 2.5:1 and fails
 *    AA outright; `bg` on coral is 6.4:1.
 * 2. **One filled coral block per screen**, and it is the CTA. Coral as *text*
 *    is allowed for context chips and the verdict — those are not blocks.
 */
export const ON_CORAL = COLOR.bg;

// -- Typography --------------------------------------------------------------

/**
 * One family. `public/fonts/space-grotesk-latin.woff2` ships in the bundle —
 * a Devvit web view cannot fetch a font from anywhere else.
 *
 * Measured at integration (`node tools/qa/font-check.mjs`): the face loads,
 * `font-variant-numeric: tabular-nums` collapses the digit spread from 19.61px
 * to **0px per 100px em**, and a digit advances **0.62em**. So §13's fixed-box
 * fallback is not needed; `TABULAR` is enough.
 */
export const FONT_FAMILY =
  "'Space Grotesk', ui-sans-serif, system-ui, 'Segoe UI', Roboto, sans-serif";

/** Verified present. Re-run `font-check` if the font file is ever replaced. */
export const TABULAR = 'tabular-nums' as const;

/** Six roles, no seventh. A size not in this table does not exist. */
export const TYPE = {
  /** Feed wordmark, verdict word. */
  display: { size: 44, weight: 700, tracking: '-0.01em' },
  /** The score. 56 on desktop, and on mobile taller than 760. */
  score: { size: 44, sizeLarge: 56, weight: 700, tabular: true },
  /** Panel headers. */
  heading: { size: 20, weight: 700 },
  /** Chips and stamps. The only uppercase besides CTAs and verdicts. */
  label: { size: 12, weight: 700, tracking: '0.06em', uppercase: true },
  /** Context lines, proof lines, secondary buttons. */
  body: { size: 15, weight: 500 },
  /** Ranks, distances, countdowns. */
  numeric: { size: 15, weight: 700, tabular: true },
} as const;

// -- Space, radius, size -----------------------------------------------------

/** A 4/8 grid. Six steps. */
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const RADIUS = {
  /** Fully round: chips and pills. */
  chip: 999,
  button: 14,
  /** Panels are rounded on their top corners only; they rise from the edge. */
  panel: 24,
  card: 12,
} as const;

export const SIZE = {
  /** The filled CTA. */
  cta: 56,
  /** Ghost buttons, the copy icon. */
  secondary: 44,
  chip: 28,
  icon: 44,
  /**
   * The floor for anything tappable, independent of its drawn height: a 44px
   * control still needs 48px of hit area.
   */
  touchTarget: 48,
} as const;

export const STROKE = {
  /** Rings and the gauge. */
  thin: 2,
  /** The centre ring, so it reads as the centre. */
  thick: 3,
  /** Impact → centre: 2px dash, 6px gap. */
  dash: [2, 6] as const,
} as const;

// -- Motion ------------------------------------------------------------------

/**
 * Four durations and a ceiling. `reveal` is not a step: it is the budget the
 * whole result cascade has to fit inside.
 */
export const DURATION = {
  micro: 120,
  short: 200,
  medium: 320,
  long: 600,
  reveal: 1600,
} as const;

/**
 * CSS easing strings. The JavaScript equivalents used by the canvas live in
 * `motion.ts`; these two sets describe the same curves for two engines.
 *
 * `spring` is a cubic-bezier approximation of spring(0.6): CSS has no springs,
 * and one overshoot is all the spec asks for.
 */
export const EASE = {
  outExpo: 'cubic-bezier(0.16, 1, 0.3, 1)',
  outQuad: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
  inOutSine: 'cubic-bezier(0.37, 0, 0.63, 1)',
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  outBack: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
} as const;

/**
 * Particle ceilings, per surface.
 *
 * The feed's budget is the strict one: it runs in someone's scroll, capped at
 * 30fps, on a device already rendering a feed.
 */
export const PARTICLES = {
  feed: 24,
  mobileAmbient: 40,
  mobileBurst: 80,
  /** Desktop doubles both mobile figures. */
  desktopFactor: 2,
} as const;

/** Canvas never renders above 2×, whatever the device claims. */
export const MAX_DPR = 2;

// -- Breakpoints -------------------------------------------------------------

/**
 * Read as: below `compact` is the cramped layout; `mobile` up to `tablet` is
 * the reference; `desktop` and above gets the wide compositions.
 */
export const BREAKPOINT = {
  compact: 360,
  mobile: 600,
  tablet: 900,
} as const;

/** Design references from §12, used by the QA capture list. */
export const VIEWPORT = {
  /** The worst case a Reddit mobile app may hand an inline view (issue #254). */
  feedMin: { width: 360, height: 350 },
  feed: { width: 360, height: 512 },
  feedDesktop: { width: 700, height: 512 },
  expanded: { width: 390, height: 720 },
  expandedMin: { width: 360, height: 640 },
  expandedDesktop: { width: 480, height: 760 },
} as const;
