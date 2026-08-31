import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  generateLevel,
  powerForHold,
  resolveRerollK,
  round2,
  scoreForDx,
  simulate,
  simulateLevel,
  simulateWithPower,
  sweepLevel,
  windAt,
} from '../shared/sim.ts';
import {
  BULLSEYE_SCORE,
  GAUGE_PERIOD_MS,
  GUST_SPAN_S,
  LAUNCH_DAY,
  MUZZLE_X,
  MUZZLE_Y,
  OUT_MAX,
  OUT_SPAN,
  PERFECT_RADIUS,
  PLATEAU_HALF_WIDTH,
  SIM_MAX_STEPS,
  SPACE_W,
  TARGET_R,
} from '../shared/tunables.ts';
import type { Level } from '../shared/types.ts';

const SAMPLE_DAYS = Array.from({ length: 200 }, (_, i) => LAUNCH_DAY + i);

describe('powerForHold', () => {
  it('is a triangular wave over the gauge period', () => {
    assert.equal(powerForHold(0), 0);
    assert.equal(powerForHold(GAUGE_PERIOD_MS / 2), 1);
    assert.equal(round2(powerForHold(GAUGE_PERIOD_MS / 4)), 0.5);
    assert.equal(round2(powerForHold((GAUGE_PERIOD_MS * 3) / 4)), 0.5);
    assert.equal(powerForHold(GAUGE_PERIOD_MS), 0);
  });

  it('rises and falls linearly, unlike a sine', () => {
    // Equal steps of hold time must move the gauge by equal amounts.
    const step = GAUGE_PERIOD_MS / 100;
    const deltas: number[] = [];
    for (let i = 0; i < 49; i++) {
      deltas.push(powerForHold((i + 1) * step) - powerForHold(i * step));
    }
    for (const d of deltas) assert.ok(Math.abs(d - deltas[0]!) < 1e-12);
  });

  it('repeats every period, so a long hold is a legitimate choice', () => {
    for (const holdMs of [137, 700, 1399, 2044]) {
      assert.equal(
        powerForHold(holdMs),
        powerForHold(holdMs + GAUGE_PERIOD_MS * 7)
      );
    }
  });

  it('stays within [0, 1] for every integer hold up to ten seconds', () => {
    for (let holdMs = 0; holdMs <= 10000; holdMs++) {
      const p = powerForHold(holdMs);
      assert.ok(p >= 0 && p <= 1, `power ${p} at holdMs ${holdMs}`);
    }
  });
});

describe('scoreForDx — the specified boundaries', () => {
  it('scores a Perfect at and inside the perfect radius', () => {
    assert.equal(scoreForDx(0, TARGET_R), 100);
    assert.equal(scoreForDx(PERFECT_RADIUS, TARGET_R), 100);
  });

  it('leaves the Perfect zone immediately past the radius', () => {
    assert.ok(scoreForDx(PERFECT_RADIUS + 0.001, TARGET_R) < 100);
  });

  it('scores 87.00 exactly at the rim of the mat (dx = 60)', () => {
    assert.equal(scoreForDx(60, TARGET_R), 87);
  });

  it('scores 0 exactly at the outer edge (dx = 660)', () => {
    assert.equal(scoreForDx(TARGET_R + OUT_SPAN, TARGET_R), 0);
    assert.equal(scoreForDx(660, TARGET_R), 0);
  });

  it('floors at 0 beyond the outer edge', () => {
    assert.equal(scoreForDx(661, TARGET_R), 0);
    assert.equal(scoreForDx(5000, TARGET_R), 0);
  });

  it('matches the reference points quoted in the design document', () => {
    // "~99.1 a dx = 12 (seuil Bullseye), ~95.4 a dx = 30, 87.0 au bord".
    assert.ok(Math.abs(scoreForDx(12, TARGET_R) - 99.1) < 0.1);
    assert.ok(Math.abs(scoreForDx(30, TARGET_R) - 95.4) < 0.1);
    // "Un tir rate a 300 u donne encore ~44".
    assert.ok(Math.abs(scoreForDx(300, TARGET_R) - 44) < 1);
  });

  it('decreases monotonically with distance', () => {
    let previous = 101;
    for (let dx = 0; dx <= 700; dx += 0.25) {
      const score = scoreForDx(dx, TARGET_R);
      assert.ok(score <= previous, `score rose at dx ${dx}`);
      previous = score;
    }
  });

  it('is continuous at the zone seam', () => {
    assert.ok(
      Math.abs(scoreForDx(60, TARGET_R) - scoreForDx(60.0001, TARGET_R)) < 0.01
    );
  });

  it('never returns more than two decimals', () => {
    for (let dx = 0; dx <= 700; dx += 0.13) {
      const score = scoreForDx(dx, TARGET_R);
      assert.equal(round2(score), score);
    }
  });

  it('tightens every zone on a Tiny Target day', () => {
    const tiny = TARGET_R / 2;
    // The rim moves in, so the same miss is punished harder.
    assert.equal(scoreForDx(tiny, tiny), OUT_MAX);
    assert.equal(scoreForDx(tiny + OUT_SPAN, tiny), 0);
    assert.ok(scoreForDx(20, tiny) < scoreForDx(20, TARGET_R));
    // ...but the Perfect radius is unchanged: a bullseye is a bullseye.
    assert.equal(scoreForDx(PERFECT_RADIUS, tiny), 100);
  });
});

describe('windAt', () => {
  const gustyDay = SAMPLE_DAYS.map((d) => generateLevel(d)).find(
    (l) => l.modifier === 'GUSTY'
  )!;

  it('is constant when the day is not gusty', () => {
    const calm = SAMPLE_DAYS.map((d) => generateLevel(d)).find(
      (l) => l.modifier === 'CLEAR'
    )!;
    for (const t of [0, 0.3, 1.1, 2.7]) {
      assert.equal(windAt(calm, t), calm.windBase);
    }
  });

  it('stays inside the base wind plus or minus the gust amplitude', () => {
    for (let t = 0; t < GUST_SPAN_S * 3; t += 0.01) {
      const w = windAt(gustyDay, t);
      assert.ok(
        Math.abs(w - gustyDay.windBase) <= gustyDay.gustAmp + 1e-9,
        `gust ${w} escaped the amplitude at t=${t}`
      );
    }
  });

  it('wraps cleanly at the end of its span', () => {
    assert.ok(Math.abs(windAt(gustyDay, 0) - windAt(gustyDay, GUST_SPAN_S)) < 1e-9);
  });

  it('actually varies', () => {
    const samples = new Set<number>();
    for (let t = 0; t < GUST_SPAN_S; t += 0.05) samples.add(windAt(gustyDay, t));
    assert.ok(samples.size > 10);
  });
});

describe('simulate', () => {
  it('is reproducible for the same integer inputs', () => {
    for (const day of SAMPLE_DAYS.slice(0, 30)) {
      for (const holdMs of [0, 137, 349, 700, 1042, 1399, 2500]) {
        const a = simulate(day, holdMs);
        const b = simulate(day, holdMs);
        assert.equal(a.score, b.score);
        assert.equal(a.dx, b.dx);
        assert.equal(a.impact, b.impact);
        assert.equal(a.impactX, b.impactX);
        assert.deepEqual(a.trajectory, b.trajectory);
      }
    }
  });

  it('starts every shot at the muzzle', () => {
    const first = simulate(LAUNCH_DAY, 500).trajectory[0]!;
    assert.equal(first.x, MUZZLE_X);
    assert.equal(first.y, MUZZLE_Y);
  });

  it('never exhausts the step budget on a real day', () => {
    for (const day of SAMPLE_DAYS) {
      const level = generateLevel(day);
      for (let power = 0; power <= 1; power += 0.02) {
        const { trajectory } = simulateWithPower(level, power);
        assert.ok(
          trajectory.length < SIM_MAX_STEPS,
          `day ${day} power ${power} used ${trajectory.length} steps`
        );
      }
    }
  });

  it('resolves an impact for every reachable release', () => {
    for (const day of SAMPLE_DAYS.slice(0, 40)) {
      const level = generateLevel(day);
      for (let holdMs = 0; holdMs < GAUGE_PERIOD_MS; holdMs += 7) {
        const result = simulateLevel(level, holdMs);
        assert.ok(Number.isFinite(result.score));
        assert.ok(result.score >= 0 && result.score <= 100);
        assert.ok(result.dx >= 0);
      }
    }
  });

  it('measures dx symmetrically around the centre of the mat', () => {
    const level = generateLevel(LAUNCH_DAY);
    const over = simulateWithPower(level, 1);
    assert.equal(over.dx, Math.abs(over.impactX - level.distance));
  });

  it('produces a Bullseye somewhere on every certified day', () => {
    for (const day of SAMPLE_DAYS.slice(0, 60)) {
      const k = resolveRerollK(day);
      const { bestScore } = sweepLevel(generateLevel(day, k));
      assert.ok(
        bestScore >= BULLSEYE_SCORE,
        `day ${day} tops out at ${bestScore} with k=${k}`
      );
    }
  });
});

describe('impact classification', () => {
  const level = (over: Partial<Level>): Level => ({
    ...generateLevel(LAUNCH_DAY),
    ...over,
  });

  it('records a CLIFF on the face of the plateau, at dx = 140', () => {
    // A tall plateau close in: anything that clears the ground hits the wall.
    const wall = level({
      distance: 600,
      height: 400,
      windBase: 0,
      gustAmp: 0,
      modifier: 'CLEAR',
    });
    const cliffs = [];
    for (let power = 0; power <= 1; power += 0.005) {
      const shot = simulateWithPower(wall, power);
      if (shot.impact === 'CLIFF') cliffs.push(shot);
    }
    assert.ok(cliffs.length > 0, 'expected some shots to hit the wall');
    for (const shot of cliffs) {
      assert.equal(shot.impactX, wall.distance - PLATEAU_HALF_WIDTH);
      assert.equal(shot.dx, PLATEAU_HALF_WIDTH);
      assert.ok(shot.impactY < wall.height);
      assert.equal(shot.score, scoreForDx(PLATEAU_HALF_WIDTH, wall.targetR));
    }
  });

  it('records OFF_THE_MAP with a score of zero once the ball leaves the space', () => {
    const flat = level({
      distance: 520,
      height: 0,
      windBase: 400,
      gustAmp: 0,
      modifier: 'TAILWIND',
    });
    const escaped = simulateWithPower(flat, 1);
    assert.equal(escaped.impact, 'OFF_THE_MAP');
    assert.equal(escaped.score, 0);
    assert.ok(escaped.impactX > SPACE_W);
  });

  it('separates a landing on the mat from a landing on the ground', () => {
    // Flat day: the plateau top and the ground plane are the same height, so
    // only the x span distinguishes them. That is the classification under test.
    const day = level({
      distance: 700,
      height: 0,
      windBase: 0,
      gustAmp: 0,
      modifier: 'CLEAR',
    });
    const kinds = new Set<string>();
    for (let power = 0; power <= 1; power += 0.002) {
      kinds.add(simulateWithPower(day, power).impact);
    }
    assert.ok(kinds.has('MAT'));
    assert.ok(kinds.has('GROUND'));

    for (let power = 0; power <= 1; power += 0.002) {
      const shot = simulateWithPower(day, power);
      if (shot.impact === 'MAT') {
        assert.equal(shot.impactY, day.height);
        assert.ok(shot.dx <= PLATEAU_HALF_WIDTH + 1e-9);
      }
      if (shot.impact === 'GROUND') {
        assert.equal(shot.impactY, 0);
      }
    }
  });

  it('flags Perfect and Bullseye consistently with the score', () => {
    for (const day of SAMPLE_DAYS.slice(0, 25)) {
      const lvl = generateLevel(day);
      for (let power = 0; power <= 1; power += 0.003) {
        const shot = simulateWithPower(lvl, power);
        assert.equal(shot.isPerfect, shot.score === 100);
        assert.equal(shot.isBullseye, shot.score >= BULLSEYE_SCORE);
        if (shot.isPerfect) assert.ok(shot.dx <= PERFECT_RADIUS);
      }
    }
  });
});

describe('resolveRerollK', () => {
  it('is deterministic', () => {
    for (const day of SAMPLE_DAYS.slice(0, 20)) {
      assert.equal(resolveRerollK(day), resolveRerollK(day));
    }
  });

  it('returns the first index whose level can be won', () => {
    for (const day of SAMPLE_DAYS.slice(0, 20)) {
      const k = resolveRerollK(day);
      for (let earlier = 0; earlier < k; earlier++) {
        assert.ok(
          sweepLevel(generateLevel(day, earlier)).bestScore < BULLSEYE_SCORE,
          `k=${earlier} was already winnable on day ${day}`
        );
      }
    }
  });

  it('rescues a deliberately degenerate day', () => {
    // A hand-built level with the target buried behind an unreachable wall
    // must fail the sweep, which is exactly what the guard-rail looks for.
    const broken = {
      ...generateLevel(LAUNCH_DAY),
      distance: 880,
      height: 1500,
      windBase: -420,
      gustAmp: 0,
    };
    assert.ok(sweepLevel(broken).bestScore < BULLSEYE_SCORE);
  });
});
