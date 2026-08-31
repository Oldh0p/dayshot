import type { ModifierId } from './types.ts';

/**
 * Every number that shapes the feel of the game lives here (GDD 9.5).
 *
 * The launch values come out of `npm run tune` (`src/tools/tune.ts`), never out
 * of intuition — the scoring curve is a product decision about the distribution
 * of emotions, and the only way to see that distribution is to simulate it.
 *
 * ## What calibration changed, and what it did not
 *
 * The **scoring curve is untouched**. GDD II.8's constants turn out to be right:
 * they put the median at 75 and a quarter of shots above 90, exactly as GDD 8
 * asks, for a population whose release error is about 90 ms.
 *
 * The **launch geometry was broken and is fixed**. With the document's starting
 * values the ball's range at full power was roughly 2.6x the width of the
 * logical space, and `V_MIN = 900` was fast enough that even a zero-power shot
 * overshot the nearest targets. The consequences were measurable: 29% of days
 * could not be won at all and were only rescued by the reroll guard-rail, and
 * 63% of the gauge scored a flat zero. After calibration that is 0.3% and 15%.
 *
 * Two GDD 8 targets are **not reachable and were not chased**: 1-3% Bullseyes
 * and 0.05-0.3% Perfects. Because `holdMs` is an integer, the finest possible
 * Perfect rate is the chance of hitting the single best millisecond, about
 * `0.8 / sigma` — 2.7% at sigma = 30 ms, 0.9% at 90 ms. Reaching 0.1% needs an
 * effective sigma above ~270 ms. No choice of constants changes that; it is a
 * property of the input granularity. Measure the live rate before touching
 * `PERFECT_RADIUS` or `BULLSEYE_SCORE`.
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

/**
 * Launch speed at the bottom and the top of the gauge.
 *
 * Calibrated down from the document's 900/1900. At 900 the ball cleared the
 * nearest mats before the gauge had left zero, so a whole class of days offered
 * no undershoot at all; at 1900 it left the 1000-unit world less than a third
 * of the way up the gauge. These values put the shortest shot around x = 250
 * and the longest just past the far edge, so both halves of the gauge mean
 * something and going off the map stays a real but earned punishment.
 */
export const V_MIN = 400;
export const V_MAX = 1350;

/** Fixed integration step. Semi-implicit Euler, never frame-driven. */
export const SIM_DT = 1 / 120;

/** Safety cap on the integration loop. A 2 s flight is 240 steps. */
export const SIM_MAX_STEPS = 400;

// -- Daily level ranges ------------------------------------------------------

/**
 * Narrowed from 38-62 degrees. The steepest angles cost so much range that a far
 * mat became unreachable on the same day the shallowest angles made a near one
 * impossible to miss short of.
 */
export const ANGLE_MIN_DEG = 40;
export const ANGLE_MAX_DEG = 58;

/**
 * Narrowed from 520-880. At 880 the plateau's far edge sat at 1020, past the
 * edge of the world, so every overshoot was an instant zero and the miss was
 * asymmetric — which GDD II.7 explicitly says it must not be.
 */
export const D_MIN = 500;
export const D_MAX = 800;

/**
 * Narrowed from 0-420. A tall plateau costs the ball an extra fall on the far
 * side, which pushed overshoots off the map; 280 keeps the cliff dramatic
 * without making the far half of the gauge dead.
 */
export const H_MIN = 0;
export const H_MAX = 280;

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

/**
 * Below this many players, the result screen shows a rank instead of a
 * percentile.
 *
 * "TOP 100.0% TODAY" for the only player of the day is true and absurd, and so
 * is "TOP 33.3%" out of three. A percentage only says something a rank does not
 * once the field is big enough that the rank has stopped being a name and
 * started being an address: 50 gives the figure 2% of granularity, which is the
 * point where one decimal stops implying a precision the crowd cannot support.
 *
 * Below it a rank is both more accurate and more flattering — "#7 today" beats
 * "TOP 14%" — and GDD 13's whole argument for the percentile is that it makes an
 * average player *feel placed*. With eleven players it does the opposite.
 */
export const PERCENTILE_MIN_PLAYERS = 50;

/**
 * Zone 2, on the mat: `100 - MAT_DROP * u^MAT_EXP`, u normalised over the mat.
 * Unchanged by calibration — see the note at the top of this file.
 */
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

/**
 * `dayNumber` of ONE SHOT #1 — currently 2026-09-01 UTC.
 *
 * This decides one thing only: the number in the title. Levels come from
 * `dayNumber`, which is absolute, so moving `LAUNCH_DAY` renumbers the display
 * and changes no gameplay at all.
 *
 * **The rule at launch:** run `npm run launch-day <YYYY-MM-DD>` for the date of
 * the first public post, paste the number here, and never touch it again.
 * Before that date the arithmetic yields zero or a negative — which is correct,
 * and is why `ensureDailyPost` warns loudly rather than quietly clamping: a
 * clamp would make two different days both call themselves #1.
 */
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

/** Long Shot pins the distance to the top of its range (the top ~27%). */
export const LONG_SHOT_D_MIN = 720;
export const LONG_SHOT_D_MAX = 800;
