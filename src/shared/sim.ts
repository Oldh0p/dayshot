import type { Level, ModifierId } from './types.ts';
import {
  ANGLE_MAX_DEG,
  ANGLE_MIN_DEG,
  D_MAX,
  D_MIN,
  GUST_TABLE_SIZE,
  H_MAX,
  H_MIN,
  LONG_SHOT_D_MAX,
  LONG_SHOT_D_MIN,
  MODIFIER_WEIGHTS,
  MODIFIER_WIND_RANGE,
  MOON_GRAVITY_FACTOR,
  PALETTE_VARIANTS,
  TARGET_R,
  TINY_TARGET_FACTOR,
  WIND_BASE_MAX,
  WIND_BASE_MIN,
  G,
  gustAmp,
} from './tunables.ts';

/**
 * The deterministic core of ONE SHOT: PRNG, daily level generation, ballistic
 * simulation and scoring. Imported *verbatim* by the client and the server.
 *
 * Contract (GDD 9.2, 9.4):
 *   - zero dependencies, zero imports outside this folder;
 *   - only arithmetic, comparisons, and 32-bit integer operations in the PRNG;
 *   - the only trigonometry runs once per level and its results are rounded to
 *     six decimals immediately, so that no engine's `cos`/`sin` implementation
 *     can make two devices disagree;
 *   - `simulate(dayNumber, holdMs)` is bit-identical on both sides for the same
 *     integer inputs.
 *
 * The server is still authoritative. This file exists so that the client can
 * *show* the truth immediately, not so that it can be believed.
 */

// ---------------------------------------------------------------------------
// PRNG — xmur3 seeding into mulberry32 (GDD 9.3)
// ---------------------------------------------------------------------------

/** Hashes a string into a 32-bit seed. Standard xmur3. */
export const xmur3 = (str: string): (() => number) => {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (): number => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
};

/** 32-bit PRNG producing floats in [0, 1). Standard mulberry32. */
export const mulberry32 = (seed: number): (() => number) => {
  let a = seed;
  return (): number => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * Seed string for a day. `rerollK` is 0 on virtually every day; it only moves
 * when the validity guard-rail rejects a degenerate level (GDD 9.3).
 */
export const seedStringFor = (dayNumber: number, rerollK: number): string =>
  rerollK === 0
    ? `oneshot:${dayNumber}`
    : `oneshot:${dayNumber}:r${rerollK}`;

const rngFor = (dayNumber: number, rerollK: number): (() => number) =>
  mulberry32(xmur3(seedStringFor(dayNumber, rerollK))());

// ---------------------------------------------------------------------------
// Small arithmetic helpers
// ---------------------------------------------------------------------------

const mix = (a: number, b: number, u: number): number => a + (b - a) * u;

/** Rounds to six decimals — the firewall against engine-specific trigonometry. */
const round6 = (v: number): number => Math.round(v * 1e6) / 1e6;

/** Rounds half-up to two decimals, the display and storage precision of a score. */
export const round2 = (v: number): number => Math.round(v * 100) / 100;

/**
 * UTC weekday for a day number, 0 = Sunday. Day 0 was a Thursday, hence the
 * offset of 4. Pure arithmetic, so the client and the server cannot disagree
 * about which day of the week it is.
 */
export const dayOfWeekUTC = (dayNumber: number): number => (dayNumber + 4) % 7;

// ---------------------------------------------------------------------------
// Daily level generation
// ---------------------------------------------------------------------------

/**
 * Picks the day's modifier.
 *
 * The weekly cadence is a feature, not decoration: Monday is always a soft
 * restart, and Sunday is reserved for Golden Day, which is V1 — until then it
 * is Clear Skies too (GDD 9.3). Both forced days still *consume* the draw, so
 * the sequence of every later draw is unaffected by the weekday.
 */
const pickModifier = (u: number, dayNumber: number): ModifierId => {
  const dow = dayOfWeekUTC(dayNumber);
  if (dow === 1 || dow === 0) return 'CLEAR';

  let total = 0;
  for (const entry of MODIFIER_WEIGHTS) total += entry[1];

  const target = u * total;
  let acc = 0;
  for (const entry of MODIFIER_WEIGHTS) {
    acc += entry[1];
    if (target < acc) return entry[0];
  }
  // Unreachable while `u < 1`, but the type system does not know that.
  return 'CLEAR';
};

/**
 * Generates the level for a UTC day.
 *
 * **The draw order below is frozen for life.** Every draw happens on every day,
 * whatever the modifier — a modifier changes the *range* a value is drawn from,
 * never the number of values drawn. Reordering or skipping a draw would rewrite
 * every past day of the game (GDD 9.3).
 */
export const generateLevel = (dayNumber: number, rerollK = 0): Level => {
  const rnd = rngFor(dayNumber, rerollK);

  // 1. modifier
  const uModifier = rnd();
  // 2. distance
  const uDistance = rnd();
  // 3. height
  const uHeight = rnd();
  // 4. base wind
  const uWind = rnd();
  // 5. launch angle
  const uAngle = rnd();
  // 6. gust table — always drawn, used only when the day is Gusty
  const gustTable: number[] = [];
  for (let i = 0; i < GUST_TABLE_SIZE; i++) gustTable.push(rnd() * 2 - 1);
  // 7. palette variation
  const uPalette = rnd();

  const modifier = pickModifier(uModifier, dayNumber);

  const distance =
    modifier === 'LONG'
      ? mix(LONG_SHOT_D_MIN, LONG_SHOT_D_MAX, uDistance)
      : mix(D_MIN, D_MAX, uDistance);

  const height = mix(H_MIN, H_MAX, uHeight);

  const windRange = MODIFIER_WIND_RANGE[modifier];
  const windBase = windRange
    ? mix(windRange[0], windRange[1], uWind)
    : mix(WIND_BASE_MIN, WIND_BASE_MAX, uWind);

  const angleDeg = mix(ANGLE_MIN_DEG, ANGLE_MAX_DEG, uAngle);
  const angleRad = (angleDeg * Math.PI) / 180;

  return {
    dayNumber,
    rerollK,
    modifier,
    distance,
    height,
    windBase,
    gustAmp: modifier === 'GUSTY' ? gustAmp(windBase) : 0,
    gustTable,
    angleDeg,
    // The only trigonometry in the whole simulation, immediately quantised.
    cosTheta: round6(Math.cos(angleRad)),
    sinTheta: round6(Math.sin(angleRad)),
    gravity: modifier === 'MOON' ? G * MOON_GRAVITY_FACTOR : G,
    targetR: modifier === 'TINY' ? TARGET_R * TINY_TARGET_FACTOR : TARGET_R,
    paletteVariant: Math.floor(uPalette * PALETTE_VARIANTS),
  };
};
