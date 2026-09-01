import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  impactDirection,
  standingFor,
  verdictFor,
  verdictTone,
  type Verdict,
} from '../shared/copy.ts';
import { scoreForDx } from '../shared/sim.ts';
import { BULLSEYE_SCORE, TARGET_R } from '../shared/tunables.ts';
import type { ImpactKind } from '../shared/types.ts';

/**
 * §10.2 gives its bands as score ranges and explains them as geometry in the
 * same sentence: "87 = bord du tapis". The daily warm-up moved the curve and
 * the mat edge is 76 now, so the ranges and the geometry no longer agree — and
 * the function follows the geometry, because a ball resting *on* the mat being
 * told `NEAR MISS` is the exact failure the spec was guarding against.
 *
 * These tests are therefore written at the geometric boundaries the function
 * actually uses, plus the score boundaries the spec cares about most (100, 99,
 * 0) and the two impacts that replace a band outright.
 */

const at = (
  dx: number,
  targetR = TARGET_R,
  impact: ImpactKind = dx <= targetR ? 'MAT' : 'GROUND'
): Verdict =>
  verdictFor({ score: scoreForDx(dx, targetR), dx, impact, targetR });

describe('the verdict word (§10.2)', () => {
  it('names the two that are about the score, not the distance', () => {
    assert.equal(at(0), 'PERFECT');
    assert.equal(at(4), 'PERFECT', 'the Perfect radius is inclusive');
    assert.ok(scoreForDx(4.01, TARGET_R) < 100);
    assert.notEqual(at(4.01), 'PERFECT');

    // Bullseye is a score threshold: whatever dx reaches 99 earns it.
    const bullseyeDx = 9;
    assert.ok(scoreForDx(bullseyeDx, TARGET_R) >= BULLSEYE_SCORE);
    assert.equal(at(bullseyeDx), 'BULLSEYE');
    assert.ok(scoreForDx(12, TARGET_R) < BULLSEYE_SCORE);
    assert.notEqual(at(12), 'BULLSEYE');
  });

  it('changes over exactly at each geometric boundary', () => {
    const R = TARGET_R;
    const cases: ReadonlyArray<readonly [number, Verdict, Verdict]> = [
      // radius multiple, inside, just outside
      [(32 / 60) * R, 'SO CLOSE', 'ON THE MAT'],
      [R, 'ON THE MAT', 'NEAR MISS'],
      [(128 / 60) * R, 'NEAR MISS', 'NOT BAD'],
      [(251 / 60) * R, 'NOT BAD', 'ROUGH LANDING'],
      [(444 / 60) * R, 'ROUGH LANDING', 'SCENIC ROUTE'],
    ];
    for (const [edge, inside, outside] of cases) {
      assert.equal(at(edge), inside, `at ${edge.toFixed(2)}`);
      assert.equal(at(edge + 0.01), outside, `just past ${edge.toFixed(2)}`);
    }
  });

  it('keeps a ball on the mat out of the miss words', () => {
    // The regression §10.2's literal score bands would have caused: the mat now
    // ends at 76, and `ON THE MAT` started at 87.
    for (let dx = 10; dx <= TARGET_R; dx += 5) {
      const verdict = at(dx);
      assert.ok(
        ['SO CLOSE', 'ON THE MAT', 'BULLSEYE', 'PERFECT'].includes(verdict),
        `dx ${dx} is on the mat and reads "${verdict}" (score ${scoreForDx(dx, TARGET_R).toFixed(2)})`
      );
    }
  });

  it('means the same thing on a Tiny Target day', () => {
    // The bug this prevents is the one that shipped in the share grid: a fixed
    // distance means "inner ring" on a full mat and "well outside" on a half
    // one. In radii it is the same shot.
    const tiny = TARGET_R / 2;
    for (const radii of [0.4, 0.9, 1.8, 3.5]) {
      assert.equal(
        at(radii * tiny, tiny),
        at(radii * TARGET_R, TARGET_R),
        `${radii} radii reads differently on a small mat`
      );
    }
  });

  it('lets the two impacts replace the band outright', () => {
    // A wall strike can score respectably and is still a wall strike.
    assert.equal(
      verdictFor({ score: 80, dx: 20, impact: 'CLIFF', targetR: TARGET_R }),
      'INTO THE WALL'
    );
    assert.equal(
      verdictFor({ score: 0, dx: 900, impact: 'OFF_THE_MAP', targetR: TARGET_R }),
      'OFF THE MAP'
    );
    assert.equal(
      verdictFor({ score: 0, dx: 700, impact: 'GROUND', targetR: TARGET_R }),
      'OFF THE MAP',
      'a zero is off the map however it got there'
    );
  });

  it('never says anything red, bottom or failed', () => {
    const words: Verdict[] = [
      'PERFECT', 'BULLSEYE', 'SO CLOSE', 'ON THE MAT', 'NEAR MISS',
      'NOT BAD', 'ROUGH LANDING', 'SCENIC ROUTE', 'OFF THE MAP', 'INTO THE WALL',
    ];
    for (const word of words) {
      assert.doesNotMatch(word, /fail|bottom|worst|bad shot|loser/i);
      assert.notEqual(verdictTone(word), 'red' as never);
    }
    assert.equal(verdictTone('PERFECT'), 'gold');
    assert.equal(verdictTone('SO CLOSE'), 'coral');
    assert.equal(verdictTone('SCENIC ROUTE'), 'mist');
  });
});

describe('the comparison line (§10.3)', () => {
  it('says something true when there is nobody to compare to', () => {
    const alone = standingFor(1, 1);
    assert.equal(alone.line, 'You opened the day.');
    assert.equal(alone.chip, null);
    assert.equal(alone.rankLine, null, 'a rank out of one is not information');
  });

  it('counts heads while the field is small', () => {
    assert.equal(standingFor(2, 2).line, '#2 of 2 today');
    assert.equal(standingFor(7, 12).line, '#7 of 12 today');
    assert.equal(standingFor(30, 49).line, '#30 of 49 today');
    assert.equal(standingFor(30, 49).rankLine, null);
  });

  it('switches to percentiles exactly at 50 players', () => {
    assert.match(standingFor(25, 49).line, /of 49 today/);
    assert.doesNotMatch(standingFor(25, 50).line, /of 50 today/);
    assert.ok(standingFor(25, 50).rankLine);
  });

  it('gives the top three a gold chip of their own', () => {
    for (const rank of [1, 2, 3]) {
      const standing = standingFor(rank, 4381);
      assert.equal(standing.line, `#${rank} TODAY`);
      assert.equal(standing.chip, 'gold');
      assert.equal(standing.rankLine, `#${rank} / 4,381`);
    }
    assert.notEqual(standingFor(4, 4381).chip, 'gold');
  });

  it('carries one decimal under ten percent and none above', () => {
    const sharp = standingFor(184, 4381);
    assert.match(sharp.line, /^TOP \d\.\d% TODAY$/, sharp.line);
    const broad = standingFor(1204, 4381);
    assert.match(broad.line, /^TOP \d+% TODAY$/, broad.line);
  });

  it('phrases the bottom half as what you beat, never as bottom', () => {
    const low = standingFor(4000, 4381);
    assert.match(low.line, /^You beat \d+% today$/);
    assert.equal(low.chip, null);
    assert.doesNotMatch(low.line, /bottom|last|worst/i);
    assert.equal(low.rankLine, '#4,000 / 4,381');
  });
});

describe('where it landed (§10.4)', () => {
  const base = { impact: 'GROUND' as ImpactKind, cliffDrop: 0, targetR: TARGET_R };

  it('says which side, in whole units', () => {
    assert.equal(impactDirection({ ...base, signedDx: 48, dx: 48.4 }), '48 over — inner ring');
    assert.equal(impactDirection({ ...base, signedDx: -251, dx: 251.4 }), '251 short');
  });

  it('tells you when you were still on the mat', () => {
    const onMat = impactDirection({ ...base, signedDx: -12, dx: 12, impact: 'MAT' });
    assert.equal(onMat, '12 short — inner ring');
  });

  it('describes the wall by how far below the top it caught', () => {
    assert.equal(
      impactDirection({ ...base, signedDx: -30, dx: 30, impact: 'CLIFF', cliffDrop: 180.4 }),
      'into the wall, 180 below the top'
    );
  });

  it('has one thing to say about leaving the map', () => {
    assert.equal(
      impactDirection({ ...base, signedDx: 900, dx: 900, impact: 'OFF_THE_MAP' }),
      'off the map'
    );
  });

  it('never shows a decimal', () => {
    for (const dx of [6.4, 48.49, 251.51, 999.99]) {
      assert.doesNotMatch(
        impactDirection({ ...base, signedDx: dx, dx }),
        /\d\.\d/,
        `dx ${dx} leaked a decimal`
      );
    }
  });
});
