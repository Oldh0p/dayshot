import type { ModifierId } from './types.ts';

/**
 * Every number that shapes the feel of the game lives here (GDD 9.5).
 *
 * These are starting values. The launch values come out of `npm run tune`
 * (`src/tools/tune.ts`), never out of intuition — the scoring curve is a
 * product decision about the distribution of emotions, and the only way to see
 * that distribution is to simulate it.
 *
 * Changing anything in this file changes the outcome of every past day, so
 * treat edits after launch as a migration, not a tweak.
 */

// -- Logical space -----------------------------------------------------------
// Portrait, origin bottom-left. All rendering is a scale of this space.

export const SPACE_W = 1000;
export const SPACE_H = 1600;

/** Muzzle of the launcher — where Pip starts every shot. */
export const MUZZLE_X = 120;
export const MUZZLE_Y = 120;

/** Half-width of the target plateau; its face is the cliff at `D - 140`. */
export const PLATEAU_HALF_WIDTH = 140;

// -- Input -------------------------------------------------------------------

/** Full up-and-down period of the triangular power gauge, in milliseconds. */
export const GAUGE_PERIOD_MS = 1400;

/** A first press shorter than this is a misfire and is ignored (GDD M1). */
export const MISFIRE_MS = 120;

// -- Physics -----------------------------------------------------------------

export const G = 1700;
export const V_MIN = 900;
export const V_MAX = 1900;

/** Fixed integration step. Semi-implicit Euler, never frame-driven. */
export const SIM_DT = 1 / 120;

/** Safety cap on the integration loop. A 2 s flight is 240 steps. */
export const SIM_MAX_STEPS = 400;

// -- Daily level ranges ------------------------------------------------------

export const ANGLE_MIN_DEG = 38;
export const ANGLE_MAX_DEG = 62;

export const D_MIN = 520;
export const D_MAX = 880;

export const H_MIN = 0;
export const H_MAX = 420;

export const TARGET_R = 60;

/**
 * Wind range on days whose modifier is not about wind (Moon, Tiny, Long).
 *
 * GDD 9.3 lists wind overrides for Clear, Crosswind, Tailwind and Gusty but
 * never states the range for the other three. The global bound in GDD II.7 is
 * ±420, which is the span the wind modifiers already cover; reusing it here
 * would turn a Moon Gravity day into a crosswind day too and break the "one
 * headline modifier per day" rule (GDD 11). Gusty's own base range is the
 * closest specified neutral value, so it is what the other days use: real wind,
 * never the story of the day.
 */
export const WIND_BASE_MIN = -150;
export const WIND_BASE_MAX = 150;

// -- Gusts -------------------------------------------------------------------

/** Number of pre-generated gust samples, drawn from the seed every day. */
export const GUST_TABLE_SIZE = 16;

/**
 * Flight time, in seconds, that the gust table spans before it wraps. The table
 * is interpolated linearly over this window so gusts stay deterministic and,
 * crucially, *visible* on screen — an unfair day has to be legible (GDD 33).
 */
export const GUST_SPAN_S = 2;

/** Gust amplitude around the base wind, in u/s². */
export const gustAmp = (windBase: number): number =>
  0.4 * Math.abs(windBase) + 120;

// -- Scoring -----------------------------------------------------------------

/** `dx <= PERFECT_RADIUS` forces 100.00 and fires the Perfect celebration. */
export const PERFECT_RADIUS = 4;

/** A shot at or above this score earns the Bullseye treatment. */
export const BULLSEYE_SCORE = 99;

/** Zone 2, on the mat: `100 - MAT_DROP * u^MAT_EXP`, u normalised over the mat. */
export const MAT_DROP = 13;
export const MAT_EXP = 1.35;

/** Zone 3, off the mat: `OUT_MAX * (1 - u^OUT_EXP)` over `OUT_SPAN` units. */
export const OUT_MAX = 87;
export const OUT_EXP = 0.75;
export const OUT_SPAN = 600;

// -- Presentation ------------------------------------------------------------

/** Projected landing this close to centre triggers the slow-motion approach. */
export const SLOWMO_TRIGGER_DX = 30;

/** Number of palette variations drawn per day on top of the modifier palette. */
export const PALETTE_VARIANTS = 4;

// -- Calendar ----------------------------------------------------------------

/** `dayNumber` of ONE SHOT #1 — 2026-09-01 UTC. Frozen for life. */
export const LAUNCH_DAY = 20697;

/**
 * Grace window after UTC midnight during which a shot aimed at yesterday is
 * still accepted for yesterday (GDD 31, network-failure resubmission).
 */
export const ROLLOVER_GRACE_S = 90;

/** How long per-day Redis keys are kept, for audit and anti-cheat review. */
export const DAY_TTL_S = 90 * 24 * 60 * 60;

// -- Daily modifier table ----------------------------------------------------

/**
 * Weighted table for the daily modifier draw. **The order of this array is part
 * of the seed contract** — reordering it rewrites the history of the game.
 * Weights sum to 100.
 */
export const MODIFIER_WEIGHTS: readonly (readonly [ModifierId, number])[] = [
  ['CROSSWIND', 20],
  ['TAILWIND', 15],
  ['GUSTY', 15],
  ['MOON', 15],
  ['CLEAR', 15],
  ['TINY', 10],
  ['LONG', 10],
];

/** Per-modifier wind ranges (GDD 9.3). Modifiers absent here use the base range. */
export const MODIFIER_WIND_RANGE: Partial<
  Record<ModifierId, readonly [number, number]>
> = {
  CLEAR: [-80, 80],
  CROSSWIND: [-420, -300],
  TAILWIND: [250, 400],
  GUSTY: [-150, 150],
};

/** Moon Gravity, the only modifier that touches gravity. */
export const MOON_GRAVITY_FACTOR = 0.55;

/** Tiny Target halves the mat, and with it the whole scoring geometry. */
export const TINY_TARGET_FACTOR = 0.5;

/** Long Shot pins the distance to the top of its range. */
export const LONG_SHOT_D_MIN = 780;
export const LONG_SHOT_D_MAX = 880;
