import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  dayOfWeekUTC,
  generateLevel,
  mulberry32,
  seedStringFor,
  xmur3,
} from '../shared/sim.ts';
import {
  ANGLE_MAX_DEG,
  ANGLE_MIN_DEG,
  D_MAX,
  D_MIN,
  GUST_TABLE_SIZE,
  H_MAX,
  H_MIN,
  LAUNCH_DAY,
  LONG_SHOT_D_MIN,
  MODIFIER_WEIGHTS,
  MODIFIER_WIND_RANGE,
  MOON_GRAVITY_FACTOR,
  PALETTE_VARIANTS,
  TARGET_R,
  WIND_BASE_MAX,
  WIND_BASE_MIN,
  G,
} from '../shared/tunables.ts';
import type { ModifierId } from '../shared/types.ts';

/** A spread of days wide enough to hit every weekday and every modifier. */
const SAMPLE_DAYS = Array.from({ length: 400 }, (_, i) => LAUNCH_DAY + i);

describe('PRNG', () => {
  it('is a pure function of the seed string', () => {
    const draw = (s: string): number[] => {
      const rnd = mulberry32(xmur3(s)());
      return [rnd(), rnd(), rnd()];
    };
    assert.deepEqual(draw('oneshot:20697'), draw('oneshot:20697'));
    assert.notDeepEqual(draw('oneshot:20697'), draw('oneshot:20698'));
  });

  it('produces floats in [0, 1)', () => {
    const rnd = mulberry32(xmur3('oneshot:20697')());
    for (let i = 0; i < 10000; i++) {
      const v = rnd();
      assert.ok(v >= 0 && v < 1, `out of range: ${v}`);
    }
  });

  it('stays uniform enough to keep the modifier weights honest', () => {
    const rnd = mulberry32(xmur3('uniformity')());
    const buckets = new Array<number>(10).fill(0);
    const n = 100000;
    for (let i = 0; i < n; i++) buckets[Math.floor(rnd() * 10)]!++;
    for (const count of buckets) {
      assert.ok(
        Math.abs(count - n / 10) < n / 100,
        `bucket skew too large: ${count}`
      );
    }
  });

  it('builds the reroll seed string exactly as specified', () => {
    assert.equal(seedStringFor(247, 0), 'oneshot:247');
    assert.equal(seedStringFor(247, 1), 'oneshot:247:r1');
    assert.equal(seedStringFor(247, 12), 'oneshot:247:r12');
  });
});

describe('dayOfWeekUTC', () => {
  it('agrees with the Date API across a long span', () => {
    for (const day of SAMPLE_DAYS) {
      assert.equal(dayOfWeekUTC(day), new Date(day * 86400000).getUTCDay());
    }
  });
});

describe('generateLevel', () => {
  it('is reproducible from dayNumber and rerollK alone', () => {
    for (const day of SAMPLE_DAYS.slice(0, 50)) {
      assert.deepEqual(generateLevel(day), generateLevel(day));
      assert.deepEqual(generateLevel(day, 3), generateLevel(day, 3));
    }
  });

  it('produces a different level for each reroll index', () => {
    const day = LAUNCH_DAY + 5;
    const seen = new Set<string>();
    for (let k = 0; k < 8; k++) {
      const level = generateLevel(day, k);
      seen.add(`${level.distance}|${level.height}|${level.windBase}`);
    }
    assert.equal(seen.size, 8);
  });

  it('keeps every parameter inside its declared range', () => {
    for (const day of SAMPLE_DAYS) {
      const level = generateLevel(day);
      assert.ok(level.distance >= D_MIN && level.distance <= D_MAX);
      assert.ok(level.height >= H_MIN && level.height <= H_MAX);
      assert.ok(
        level.angleDeg >= ANGLE_MIN_DEG && level.angleDeg <= ANGLE_MAX_DEG
      );
      assert.equal(level.gustTable.length, GUST_TABLE_SIZE);
      for (const g of level.gustTable) assert.ok(g >= -1 && g < 1);
      assert.ok(
        level.paletteVariant >= 0 && level.paletteVariant < PALETTE_VARIANTS
      );

      const windRange = MODIFIER_WIND_RANGE[level.modifier];
      const [lo, hi] = windRange ?? [WIND_BASE_MIN, WIND_BASE_MAX];
      assert.ok(
        level.windBase >= lo && level.windBase <= hi,
        `${level.modifier} wind ${level.windBase} outside [${lo}, ${hi}]`
      );
    }
  });

  it('rounds the launch direction to six decimals', () => {
    for (const day of SAMPLE_DAYS.slice(0, 60)) {
      const { cosTheta, sinTheta } = generateLevel(day);
      assert.equal(Math.round(cosTheta * 1e6) / 1e6, cosTheta);
      assert.equal(Math.round(sinTheta * 1e6) / 1e6, sinTheta);
      // Still a unit vector to within the quantisation.
      assert.ok(Math.abs(cosTheta * cosTheta + sinTheta * sinTheta - 1) < 1e-5);
    }
  });

  it('applies each modifier override', () => {
    const byModifier = new Map<ModifierId, ReturnType<typeof generateLevel>>();
    for (const day of SAMPLE_DAYS) {
      const level = generateLevel(day);
      if (!byModifier.has(level.modifier)) byModifier.set(level.modifier, level);
    }

    for (const [id] of MODIFIER_WEIGHTS) {
      assert.ok(byModifier.has(id), `modifier never drawn in sample: ${id}`);
    }

    assert.equal(byModifier.get('MOON')!.gravity, G * MOON_GRAVITY_FACTOR);
    assert.equal(byModifier.get('TINY')!.targetR, TARGET_R / 2);
    assert.ok(byModifier.get('LONG')!.distance >= LONG_SHOT_D_MIN);
    assert.ok(byModifier.get('GUSTY')!.gustAmp > 0);

    for (const [id, level] of byModifier) {
      if (id !== 'MOON') assert.equal(level.gravity, G);
      if (id !== 'TINY') assert.equal(level.targetR, TARGET_R);
      if (id !== 'GUSTY') assert.equal(level.gustAmp, 0);
    }
  });

  it('forces Clear Skies on Mondays and Sundays', () => {
    for (const day of SAMPLE_DAYS) {
      const dow = dayOfWeekUTC(day);
      if (dow === 1 || dow === 0) {
        assert.equal(
          generateLevel(day).modifier,
          'CLEAR',
          `day ${day} (dow ${dow}) should be Clear Skies`
        );
      }
    }
  });

  it('still draws every value on a forced-modifier day', () => {
    // The proof that the forced weekdays consume their draw: a Monday's
    // distance must match what the raw second draw of its seed produces.
    const monday = SAMPLE_DAYS.find((d) => dayOfWeekUTC(d) === 1)!;
    const rnd = mulberry32(xmur3(seedStringFor(monday, 0))());
    rnd(); // modifier draw, consumed even though Monday is forced
    const uDistance = rnd();
    assert.equal(
      generateLevel(monday).distance,
      D_MIN + (D_MAX - D_MIN) * uDistance
    );
  });

  it('varies the modifier across the week', () => {
    const weekdayModifiers = new Set(
      SAMPLE_DAYS.filter((d) => dayOfWeekUTC(d) > 1).map(
        (d) => generateLevel(d).modifier
      )
    );
    assert.ok(
      weekdayModifiers.size >= 6,
      `expected a varied week, saw ${[...weekdayModifiers].join(', ')}`
    );
  });
});
