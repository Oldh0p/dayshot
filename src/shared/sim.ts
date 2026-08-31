import type {
  ImpactKind,
  Level,
  ModifierId,
  Point,
  ShotResult,
} from './types.ts';
import {
  ANGLE_MAX_DEG,
  ANGLE_MIN_DEG,
  BULLSEYE_SCORE,
  D_MAX,
  D_MIN,
  G,
  GAUGE_PERIOD_MS,
  GUST_SPAN_S,
  GUST_TABLE_SIZE,
  gustAmp,
  H_MAX,
  H_MIN,
  LONG_SHOT_D_MAX,
  LONG_SHOT_D_MIN,
  MAT_DROP,
  MAT_EXP,
  MODIFIER_WEIGHTS,
  MODIFIER_WIND_RANGE,
  MOON_GRAVITY_FACTOR,
  MUZZLE_X,
  MUZZLE_Y,
  OUT_EXP,
  OUT_MAX,
  OUT_SPAN,
  PALETTE_VARIANTS,
  PERFECT_RADIUS,
  CLIFF_HEIGHT_PENALTY,
  PLATEAU_HALF_WIDTH,
  SIM_DT,
  SIM_MAX_STEPS,
  SPACE_W,
  TARGET_R,
  TINY_TARGET_FACTOR,
  V_MAX,
  V_MIN,
  WIND_BASE_MAX,
  WIND_BASE_MIN,
} from './tunables.ts';

/**
 * The deterministic core of DAYSHOT: PRNG, daily level generation, ballistic
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
 *
 * **The literal `oneshot:` is frozen for life and is not a brand string.** It
 * names nothing a player ever sees; it is the input to the hash that decides
 * every level. The game was called ONE SHOT when this was written and is called
 * DAYSHOT now — changing this prefix would silently regenerate every day the
 * game has ever had. A test asserts it.
 */
export const seedStringFor = (dayNumber: number, rerollK: number): string =>
  rerollK === 0 ? `oneshot:${dayNumber}` : `oneshot:${dayNumber}:r${rerollK}`;

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

// ---------------------------------------------------------------------------
// Input mapping
// ---------------------------------------------------------------------------

/**
 * Samples the power gauge for a press of `holdMs` milliseconds.
 *
 * The gauge is a triangular wave, not a sine: a sine slows at its extremes and
 * would make the top of the gauge far easier to hit than the middle, which is
 * exactly the part of the skill we want to keep honest (GDD 6).
 */
export const powerForHold = (holdMs: number): number => {
  const phase = (holdMs % GAUGE_PERIOD_MS) / GAUGE_PERIOD_MS;
  return phase < 0.5 ? 2 * phase : 2 * (1 - phase);
};

// ---------------------------------------------------------------------------
// Scoring (GDD II.8, normative summary in 9.4)
// ---------------------------------------------------------------------------

/**
 * Score for a horizontal miss distance, out of 100, rounded half-up to two
 * decimals.
 *
 * Three zones, all measured on `dx` so overshoot and undershoot are symmetric:
 *
 *   1. `dx <= PERFECT_RADIUS`     -> 100.00, a Perfect.
 *   2. on the mat                 -> 100 down to `100 - MAT_DROP` at the rim.
 *   3. up to `OUT_SPAN` beyond it -> `OUT_MAX` down to 0.
 *
 * The zone boundaries follow `targetR` rather than a hard-coded 60. GDD II.8
 * writes the default mat radius into the formula, but Tiny Target halves the
 * mat (GDD 11.7) and would otherwise be a purely cosmetic modifier instead of
 * "the day of legends". At the default radius of 60 this reproduces the
 * document's 4 / 60 / 660 boundaries exactly.
 *
 * `Math.pow` is implementation-approximated rather than correctly rounded, so
 * two engines may differ in the last bit or so of the raw curve. That cannot
 * survive rounding to two decimals except on a measure-zero boundary, the
 * server score is authoritative anyway, and GDD 31 already specifies the
 * "recalibrated" path for a divergence.
 */
export const scoreForDx = (dx: number, targetR: number): number => {
  if (dx <= PERFECT_RADIUS) return 100;

  if (dx <= targetR) {
    const u = (dx - PERFECT_RADIUS) / (targetR - PERFECT_RADIUS);
    // Capped just below 100 so that "the scoreboard says 100.00" and "this was
    // a Perfect" can never disagree. The raw curve still rounds to 100.00 for
    // roughly a sixth of a unit past the Perfect radius, which would show a
    // player a perfect score with no Perfect celebration behind it.
    return Math.min(round2(100 - MAT_DROP * Math.pow(u, MAT_EXP)), 99.99);
  }

  if (dx <= targetR + OUT_SPAN) {
    const u = (dx - targetR) / OUT_SPAN;
    return round2(OUT_MAX * (1 - Math.pow(u, OUT_EXP)));
  }

  return 0;
};

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

/**
 * Horizontal acceleration at flight time `t`.
 *
 * A constant on a normal day. On a Gusty day the seeded 16-entry table is
 * interpolated linearly over `GUST_SPAN_S` and wraps — deterministic, with no
 * trigonometry at run time, and visible on screen as drifting particles so that
 * an unfair day is always legible (GDD 33).
 */
export const windAt = (level: Level, t: number): number => {
  if (level.gustAmp === 0) return level.windBase;

  const f = (t / GUST_SPAN_S) * GUST_TABLE_SIZE;
  const i = Math.floor(f);
  const frac = f - i;
  const a = level.gustTable[wrapGustIndex(i)] ?? 0;
  const b = level.gustTable[wrapGustIndex(i + 1)] ?? 0;

  return level.windBase + level.gustAmp * (a + (b - a) * frac);
};

const wrapGustIndex = (i: number): number =>
  ((i % GUST_TABLE_SIZE) + GUST_TABLE_SIZE) % GUST_TABLE_SIZE;

const buildResult = (
  level: Level,
  power: number,
  impact: ImpactKind,
  impactX: number,
  impactY: number,
  flightMs: number,
  trajectory: readonly Point[],
  cliffDrop = 0
): ShotResult => {
  const dx = Math.abs(impactX - level.distance);

  // A cliff is scored through the wall: the horizontal miss is the same for
  // everyone who hits it, so the height missed is what separates the shots.
  // `dx` itself stays the honest horizontal distance, because the result screen
  // reports it as one.
  const scoringDx =
    impact === 'CLIFF' ? dx + CLIFF_HEIGHT_PENALTY * cliffDrop : dx;

  const score =
    impact === 'OFF_THE_MAP' ? 0 : scoreForDx(scoringDx, level.targetR);

  return {
    power,
    score,
    dx,
    impactX,
    impactY,
    flightMs,
    impact,
    cliffDrop,
    isPerfect: score === 100,
    isBullseye: score >= BULLSEYE_SCORE,
    trajectory,
  };
};

/**
 * Runs the shot for an already-sampled gauge value.
 *
 * Semi-implicit Euler at a fixed `dt`, using nothing but `+ - * /` so that two
 * devices produce bit-identical trajectories. Do not reassociate the arithmetic
 * in this loop: IEEE-754 addition is not associative, and a tidier rewrite is a
 * silent desync.
 */
export const simulateWithPower = (level: Level, power: number): ShotResult => {
  const v0 = V_MIN + power * (V_MAX - V_MIN);

  let x = MUZZLE_X;
  let y = MUZZLE_Y;
  let vx = v0 * level.cosTheta;
  let vy = v0 * level.sinTheta;
  let t = 0;

  const trajectory: Point[] = [{ x, y }];
  const wallX = level.distance - PLATEAU_HALF_WIDTH;
  const plateauRightX = level.distance + PLATEAU_HALF_WIDTH;

  for (let step = 0; step < SIM_MAX_STEPS; step++) {
    const prevX = x;
    const prevY = y;

    vx = vx + windAt(level, t) * SIM_DT;
    vy = vy - level.gravity * SIM_DT;
    x = x + vx * SIM_DT;
    y = y + vy * SIM_DT;
    t = t + SIM_DT;

    // The face of the plateau stops the ball dead: a CLIFF, the day's comedy.
    if (prevX < wallX && x >= wallX) {
      const s = (wallX - prevX) / (x - prevX);
      const crossY = prevY + (y - prevY) * s;
      if (crossY < level.height) {
        trajectory.push({ x: wallX, y: crossY });
        return buildResult(
          level,
          power,
          'CLIFF',
          wallX,
          crossY,
          (t - SIM_DT + s * SIM_DT) * 1000,
          trajectory,
          level.height - crossY
        );
      }
    }

    // Effective ground: the plateau top inside its span, the ground plane
    // everywhere else.
    const onPlateau = x >= wallX && x <= plateauRightX;
    const groundY = onPlateau ? level.height : 0;

    if (y <= groundY && prevY > groundY) {
      const s = (prevY - groundY) / (prevY - y);
      const impactX = prevX + (x - prevX) * s;
      trajectory.push({ x: impactX, y: groundY });
      const impact: ImpactKind =
        impactX > SPACE_W ? 'OFF_THE_MAP' : onPlateau ? 'MAT' : 'GROUND';
      return buildResult(
        level,
        power,
        impact,
        impactX,
        groundY,
        (t - SIM_DT + s * SIM_DT) * 1000,
        trajectory
      );
    }

    trajectory.push({ x, y });

    // Left the logical space entirely. A zero, and it is meant to be funny.
    if (x > SPACE_W) {
      return buildResult(
        level,
        power,
        'OFF_THE_MAP',
        x,
        y,
        t * 1000,
        trajectory
      );
    }
  }

  // Unreachable for every level the generator can produce; a shot that somehow
  // outran the step budget is treated as having left the world.
  return buildResult(level, power, 'OFF_THE_MAP', x, y, t * 1000, trajectory);
};

/** Runs the shot for a press duration, in milliseconds. */
export const simulateLevel = (level: Level, holdMs: number): ShotResult =>
  simulateWithPower(level, powerForHold(holdMs));

/**
 * The public contract of GDD 9.4: same integers in, same score out, on the
 * client and on the server.
 */
export const simulate = (
  dayNumber: number,
  holdMs: number,
  rerollK = 0
): ShotResult => simulateLevel(generateLevel(dayNumber, rerollK), holdMs);

// ---------------------------------------------------------------------------
// Validity guard-rail (GDD 9.3)
// ---------------------------------------------------------------------------

/** Step of the power sweep used to certify a day, as specified in GDD 9.3. */
export const SWEEP_STEP = 0.001;

/** Result of sweeping the whole gauge across a level. */
export type Sweep = {
  readonly bestScore: number;
  readonly bestPower: number;
};

/**
 * Sweeps the gauge from 0 to 1 and reports the best release.
 *
 * Server and tooling only. The client bundle must never import this: the whole
 * anti-cheat posture rests on the optimum being computable but not *published*
 * (GDD 32.3), and Vite drops the export as long as nothing under `src/client`
 * reaches for it.
 */
export const sweepLevel = (level: Level): Sweep => {
  let bestScore = -1;
  let bestPower = 0;

  const steps = Math.round(1 / SWEEP_STEP);
  for (let i = 0; i <= steps; i++) {
    const power = i * SWEEP_STEP;
    const { score } = simulateWithPower(level, power);
    if (score > bestScore) {
      bestScore = score;
      bestPower = power;
    }
    if (bestScore === 100) break;
  }

  return { bestScore, bestPower };
};

/** Maximum reroll attempts before the least-bad variant is accepted. */
const MAX_REROLL_K = 64;

/**
 * Resolves the reroll index for a day.
 *
 * A seed can in principle produce a level nobody can win — a target tucked
 * behind a cliff too tall to clear, say. That day would be broken for the whole
 * planet, so the server sweeps the gauge before creating the post and rerolls
 * with a salted seed until a Bullseye is reachable. The chosen `k` is persisted
 * so that every client generates the same level (GDD 9.3).
 */
export const resolveRerollK = (dayNumber: number): number => {
  let fallbackK = 0;
  let fallbackScore = -1;

  for (let k = 0; k < MAX_REROLL_K; k++) {
    const { bestScore } = sweepLevel(generateLevel(dayNumber, k));
    if (bestScore >= BULLSEYE_SCORE) return k;
    if (bestScore > fallbackScore) {
      fallbackScore = bestScore;
      fallbackK = k;
    }
  }

  console.warn(
    `[sim] no reroll reached ${BULLSEYE_SCORE} for day ${dayNumber}; ` +
      `falling back to k=${fallbackK} (best ${fallbackScore})`
  );
  return fallbackK;
};
