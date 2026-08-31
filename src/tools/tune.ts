import {
  generateLevel,
  mulberry32,
  resolveRerollK,
  simulateLevel,
  xmur3,
} from '../shared/sim.ts';
import {
  D_MAX,
  D_MIN,
  G,
  GAUGE_PERIOD_MS,
  H_MAX,
  H_MIN,
  LAUNCH_DAY,
  PERFECT_RADIUS,
  SPACE_W,
  TARGET_R,
  V_MAX,
  V_MIN,
} from '../shared/tunables.ts';
import type { ModifierId } from '../shared/types.ts';
import { MODIFIER_LABEL } from '../shared/copy.ts';

/**
 * Calibration harness (GDD 9.5).
 *
 * The scoring curve is a product decision about the distribution of emotions:
 * a median around 72-80 so the mass of players feels competent, roughly a
 * quarter above 90, one to three percent of Bullseyes, and a Perfect rate near
 * a tenth of a percent so it stays legendary. None of that is visible by
 * reading the formula. It only shows up when you simulate a population.
 *
 * Players are modelled as GDD 9.5 specifies: they know the optimal release and
 * miss it by a Gaussian error in milliseconds.
 *
 * That model has a hard consequence worth stating up front. The error in
 * milliseconds maps linearly to a miss in units, so with a half-normal miss the
 * probability of landing inside the Perfect radius is roughly
 *
 *     P(perfect) ~ 0.8 * PERFECT_RADIUS / (sensitivity * sigma)
 *
 * and `PERFECT_RADIUS / sensitivity` cannot go below one millisecond, because
 * `holdMs` is an integer. So the *finest achievable* Perfect rate is about
 * `0.8 / sigma`: 2.7% at sigma = 30 ms, 1.8% at 45 ms, 0.9% at 90 ms. GDD 8
 * asks for 0.05-0.3%, which needs an effective sigma of roughly 270-1600 ms.
 * No choice of scoring constants changes that — it is a property of the input
 * granularity and the error model, not of the curve.
 *
 * The report therefore sweeps past the 30-60 ms of 9.5. Those three values
 * describe motor jitter for a player who already knows the answer, which is a
 * practice-mode player. An official first shot also has to *judge* the day's
 * conditions, and the sweep shows where that lands.
 *
 *   npm run tune
 *   npm run tune -- --shots 300000 --days 60 --sigmas 30,45,60
 */

type Options = {
  readonly shots: number;
  readonly daysPerModifier: number;
  readonly sigmas: readonly number[];
  readonly verbose: boolean;
};

const parseOptions = (argv: readonly string[]): Options => {
  const read = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    return index === -1 ? undefined : argv[index + 1];
  };
  return {
    shots: Number(read('--shots') ?? 100_000),
    daysPerModifier: Number(read('--days') ?? 40),
    // The three values of GDD 9.5, plus the realistic one the sweep found.
    sigmas: (read('--sigmas') ?? '30,45,60,90').split(',').map(Number),
    verbose: argv.includes('--verbose'),
  };
};

const MODIFIERS: readonly ModifierId[] = [
  'CLEAR',
  'CROSSWIND',
  'TAILWIND',
  'GUSTY',
  'MOON',
  'TINY',
  'LONG',
];

/** Deterministic standard normal, so two runs of the report agree. */
const gaussian = (rnd: () => number): (() => number) => {
  let spare: number | null = null;
  return (): number => {
    if (spare !== null) {
      const value = spare;
      spare = null;
      return value;
    }
    let u: number;
    let v: number;
    let s: number;
    do {
      u = rnd() * 2 - 1;
      v = rnd() * 2 - 1;
      s = u * u + v * v;
    } while (s === 0 || s >= 1);
    const factor = Math.sqrt((-2 * Math.log(s)) / s);
    spare = v * factor;
    return u * factor;
  };
};

type DayPlan = {
  readonly dayNumber: number;
  readonly rerollK: number;
  readonly optimalHoldMs: number;
  readonly bestScore: number;
  /** Logical units of landing distance per millisecond of release error. */
  readonly sensitivity: number;
  readonly reachableSpan: number;
};

/**
 * The best integer release, found by scanning one full gauge period.
 *
 * This is the number GDD 32.3 keeps unpublished, which is why it lives in the
 * tooling and never in anything the client bundles.
 */
const planDay = (dayNumber: number): DayPlan => {
  const rerollK = resolveRerollK(dayNumber);
  const level = generateLevel(dayNumber, rerollK);

  let optimalHoldMs = 0;
  let bestScore = -1;
  let minLanding = Number.POSITIVE_INFINITY;
  let maxLanding = Number.NEGATIVE_INFINITY;

  for (let holdMs = 0; holdMs < GAUGE_PERIOD_MS; holdMs++) {
    const shot = simulateLevel(level, holdMs);
    if (shot.score > bestScore) {
      bestScore = shot.score;
      optimalHoldMs = holdMs;
    }
    const landing = Math.min(shot.impactX, SPACE_W + 400);
    if (landing < minLanding) minLanding = landing;
    if (landing > maxLanding) maxLanding = landing;
  }

  // Local slope around the optimum: how many units of miss one millisecond of
  // error costs. This is the single number that governs how hard the day feels.
  const near = simulateLevel(level, optimalHoldMs + 10);
  const far = simulateLevel(level, Math.max(0, optimalHoldMs - 10));
  const sensitivity = Math.abs(near.impactX - far.impactX) / 20;

  return {
    dayNumber,
    rerollK,
    optimalHoldMs,
    bestScore,
    sensitivity,
    reachableSpan: maxLanding - minLanding,
  };
};

type Bucket = {
  scores: number[];
  perfects: number;
  bullseyes: number;
  above90: number;
  zeros: number;
  offMap: number;
  cliffs: number;
  dxSum: number;
};

const emptyBucket = (): Bucket => ({
  scores: [],
  perfects: 0,
  bullseyes: 0,
  above90: 0,
  zeros: 0,
  offMap: 0,
  cliffs: 0,
  dxSum: 0,
});

const quantile = (sorted: readonly number[], q: number): number => {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor(q * sorted.length));
  return sorted[index] ?? 0;
};

type Summary = {
  readonly label: string;
  readonly n: number;
  readonly median: number;
  readonly p10: number;
  readonly p90: number;
  readonly mean: number;
  readonly above90Pct: number;
  readonly bullseyePct: number;
  readonly perfectPct: number;
  readonly zeroPct: number;
  readonly offMapPct: number;
  readonly cliffPct: number;
  readonly meanDx: number;
};

const summarise = (label: string, bucket: Bucket): Summary => {
  const sorted = [...bucket.scores].sort((a, b) => a - b);
  const n = sorted.length || 1;
  const pct = (count: number): number => Math.round((count / n) * 10000) / 100;
  return {
    label,
    n: sorted.length,
    median: Math.round(quantile(sorted, 0.5) * 100) / 100,
    p10: Math.round(quantile(sorted, 0.1) * 100) / 100,
    p90: Math.round(quantile(sorted, 0.9) * 100) / 100,
    mean: Math.round((sorted.reduce((a, b) => a + b, 0) / n) * 100) / 100,
    above90Pct: pct(bucket.above90),
    bullseyePct: pct(bucket.bullseyes),
    perfectPct: Math.round((bucket.perfects / n) * 1000000) / 10000,
    zeroPct: pct(bucket.zeros),
    offMapPct: pct(bucket.offMap),
    cliffPct: pct(bucket.cliffs),
    meanDx: Math.round((bucket.dxSum / n) * 10) / 10,
  };
};

const pad = (value: string, width: number): string => value.padStart(width);

const printTable = (rows: readonly Summary[]): void => {
  const header = [
    pad('population', 12),
    pad('n', 8),
    pad('p10', 7),
    pad('median', 7),
    pad('p90', 7),
    pad('>=90%', 7),
    pad('bull%', 7),
    pad('perf%', 8),
    pad('zero%', 7),
    pad('off%', 7),
    pad('cliff%', 7),
    pad('mean dx', 8),
  ].join(' ');
  console.log(header);
  console.log('-'.repeat(header.length));
  for (const row of rows) {
    console.log(
      [
        pad(row.label, 12),
        pad(String(row.n), 8),
        pad(row.p10.toFixed(2), 7),
        pad(row.median.toFixed(2), 7),
        pad(row.p90.toFixed(2), 7),
        pad(row.above90Pct.toFixed(1), 7),
        pad(row.bullseyePct.toFixed(2), 7),
        pad(row.perfectPct.toFixed(3), 8),
        pad(row.zeroPct.toFixed(1), 7),
        pad(row.offMapPct.toFixed(1), 7),
        pad(row.cliffPct.toFixed(1), 7),
        pad(row.meanDx.toFixed(1), 8),
      ].join(' ')
    );
  }
};

/** GDD 8's distribution targets, checked rather than eyeballed. */
const TARGETS = {
  medianMin: 72,
  medianMax: 80,
  above90Min: 20,
  above90Max: 32,
  bullseyeMin: 1,
  bullseyeMax: 3,
  perfectMin: 0.05,
  perfectMax: 0.3,
};

const verdictFor = (row: Summary): string[] => {
  const notes: string[] = [];
  if (row.median < TARGETS.medianMin) notes.push(`median ${row.median} too low`);
  if (row.median > TARGETS.medianMax) notes.push(`median ${row.median} too high`);
  if (row.above90Pct < TARGETS.above90Min)
    notes.push(`only ${row.above90Pct}% above 90`);
  if (row.above90Pct > TARGETS.above90Max)
    notes.push(`${row.above90Pct}% above 90 is too generous`);
  if (row.bullseyePct < TARGETS.bullseyeMin)
    notes.push(`bullseyes ${row.bullseyePct}% too rare`);
  if (row.bullseyePct > TARGETS.bullseyeMax)
    notes.push(`bullseyes ${row.bullseyePct}% too common`);
  if (row.perfectPct < TARGETS.perfectMin)
    notes.push(`perfects ${row.perfectPct}% too rare`);
  if (row.perfectPct > TARGETS.perfectMax)
    notes.push(`perfects ${row.perfectPct}% too common`);
  return notes;
};

const main = (): void => {
  const options = parseOptions(process.argv.slice(2));

  console.log('ONE SHOT — calibration report');
  console.log('='.repeat(78));
  console.log(
    `tunables: GAUGE_PERIOD_MS=${GAUGE_PERIOD_MS} G=${G} ` +
      `V=[${V_MIN},${V_MAX}] D=[${D_MIN},${D_MAX}] H=[${H_MIN},${H_MAX}] ` +
      `R=${TARGET_R} PERFECT_RADIUS=${PERFECT_RADIUS}`
  );
  console.log(
    `sample: ${options.shots} shots per sigma, ` +
      `${options.daysPerModifier} days per modifier, ` +
      `sigmas ${options.sigmas.join('/')} ms`
  );
  console.log('');

  // Collect enough days of each modifier to average over the parameter ranges.
  const plansByModifier = new Map<ModifierId, DayPlan[]>();
  for (const id of MODIFIERS) plansByModifier.set(id, []);

  let day = LAUNCH_DAY;
  let scanned = 0;
  while (
    MODIFIERS.some(
      (id) => (plansByModifier.get(id)?.length ?? 0) < options.daysPerModifier
    ) &&
    scanned < 20000
  ) {
    const modifier = generateLevel(day).modifier;
    const bucket = plansByModifier.get(modifier);
    if (bucket && bucket.length < options.daysPerModifier) {
      bucket.push(planDay(day));
    }
    day++;
    scanned++;
  }

  const allPlans = MODIFIERS.flatMap((id) => plansByModifier.get(id) ?? []);
  const meanSensitivity =
    allPlans.reduce((a, p) => a + p.sensitivity, 0) / allPlans.length;
  const meanSpan =
    allPlans.reduce((a, p) => a + p.reachableSpan, 0) / allPlans.length;
  const rerolled = allPlans.filter((p) => p.rerollK > 0).length;

  console.log(
    `geometry: mean landing sensitivity ${meanSensitivity.toFixed(2)} u/ms, ` +
      `mean reachable span ${meanSpan.toFixed(0)} u, ` +
      `${rerolled}/${allPlans.length} days needed a reroll`
  );
  const perfectWindowMs = PERFECT_RADIUS / meanSensitivity;
  console.log(
    `          a Perfect needs the release within ` +
      `${perfectWindowMs.toFixed(2)} ms of the optimum, so the finest ` +
      `achievable Perfect rate is ~${(0.8 / 30).toFixed(3)}% at sigma=30 and ` +
      `~${((0.8 * Math.max(perfectWindowMs, 1)) / 90).toFixed(3)}% at sigma=90`
  );
  console.log('');

  const massFits: number[] = [];

  const shotsPerDay = Math.max(
    1,
    Math.round(options.shots / Math.max(1, allPlans.length))
  );

  for (const sigma of options.sigmas) {
    const rnd = mulberry32(xmur3(`tune:sigma:${sigma}`)());
    const normal = gaussian(rnd);

    const overall = emptyBucket();
    const byModifier = new Map<ModifierId, Bucket>();
    for (const id of MODIFIERS) byModifier.set(id, emptyBucket());

    for (const id of MODIFIERS) {
      const bucket = byModifier.get(id);
      if (!bucket) continue;
      for (const plan of plansByModifier.get(id) ?? []) {
        const level = generateLevel(plan.dayNumber, plan.rerollK);
        for (let i = 0; i < shotsPerDay; i++) {
          const holdMs = Math.max(
            0,
            Math.round(plan.optimalHoldMs + normal() * sigma)
          );
          const shot = simulateLevel(level, holdMs);
          for (const target of [bucket, overall]) {
            target.scores.push(shot.score);
            target.dxSum += Math.min(shot.dx, 1000);
            if (shot.score === 100) target.perfects++;
            if (shot.score >= 99) target.bullseyes++;
            if (shot.score >= 90) target.above90++;
            if (shot.score === 0) target.zeros++;
            if (shot.impact === 'OFF_THE_MAP') target.offMap++;
            if (shot.impact === 'CLIFF') target.cliffs++;
          }
        }
      }
    }

    console.log(`sigma = ${sigma} ms`);
    const rows = [
      summarise('ALL', overall),
      ...MODIFIERS.map((id) =>
        summarise(MODIFIER_LABEL[id].split(' ')[0] ?? id, byModifier.get(id) ?? emptyBucket())
      ),
    ];
    printTable(rows);

    const row = rows[0] ?? summarise('ALL', overall);
    const notes = verdictFor(row);
    console.log(
      notes.length === 0
        ? '  ✓ overall distribution is inside the GDD 8 targets'
        : `  ✗ ${notes.join('; ')}`
    );
    console.log('');

    const massOk =
      row.median >= TARGETS.medianMin &&
      row.median <= TARGETS.medianMax &&
      row.above90Pct >= TARGETS.above90Min &&
      row.above90Pct <= TARGETS.above90Max;
    if (massOk) massFits.push(sigma);
  }

  console.log('verdict');
  console.log('-'.repeat(78));
  console.log(
    massFits.length > 0
      ? `  median and >=90% land inside GDD 8 at sigma = ${massFits.join(', ')} ms.`
      : '  no sampled sigma puts the median inside GDD 8 — retune the curve.'
  );
  console.log(
    '  Bullseye and Perfect rates cannot reach their GDD 8 targets under this'
  );
  console.log(
    '  model at any sigma below ~270 ms: see the note at the top of this file.'
  );
  console.log(
    '  Measure the live rates before touching PERFECT_RADIUS or BULLSEYE_SCORE.'
  );

  if (options.verbose) {
    console.log('per-day detail');
    console.log('-'.repeat(78));
    for (const plan of allPlans) {
      const level = generateLevel(plan.dayNumber, plan.rerollK);
      console.log(
        `day ${plan.dayNumber} k=${plan.rerollK} ${level.modifier.padEnd(9)} ` +
          `D=${level.distance.toFixed(0)} H=${level.height.toFixed(0)} ` +
          `w=${level.windBase.toFixed(0)} a=${level.angleDeg.toFixed(1)} ` +
          `opt=${plan.optimalHoldMs}ms best=${plan.bestScore.toFixed(2)} ` +
          `sens=${plan.sensitivity.toFixed(2)}u/ms`
      );
    }
  }
};

main();
