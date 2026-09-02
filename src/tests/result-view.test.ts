import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resultOnScreen, unranked } from '../client/result-view.ts';
import type { Phase } from '../client/machine.ts';
import type { ResultSummary, ShotResult } from '../shared/types.ts';

const shot = (score: number, dx: number, impactX = 0): ShotResult => ({
  power: 0.5,
  score,
  dx,
  impactX,
  impactY: 0,
  impact: 'MAT',
  cliffDrop: 0,
  isPerfect: false,
  isBullseye: false,
  flightMs: 1200,
  trajectory: [],
});

/** The confirmed, ranked shot of the day. */
const OFFICIAL: ResultSummary = {
  score: 67.8,
  dx: 140,
  signedDx: 140,
  impact: 'GROUND',
  cliffDrop: 0,
  holdMs: 640,
  rank: 184,
  total: 41203,
  percentile: 4.2,
  isBullseye: false,
  isPerfect: false,
};

describe('which result the screen shows', () => {
  it('shows this practice attempt, not the ranked shot', () => {
    // The bug this guards: the official result outlives entering practice, so
    // reading it unconditionally pinned the number at 67.80 however the
    // practice throw went. Practice exists to answer "how did *that* one do".
    const attempt = resultOnScreen('practice_flight', OFFICIAL, shot(91.22, 12));
    assert.equal(attempt.score, 91.22);
    assert.equal(attempt.dx, 12);
    assert.notEqual(attempt.score, OFFICIAL.score);
  });

  it('changes from one practice attempt to the next', () => {
    const scores = [91.22, 34.5, 99.01].map(
      (s) => resultOnScreen('practice_flight', OFFICIAL, shot(s, 5)).score
    );
    assert.deepEqual(scores, [91.22, 34.5, 99.01]);
  });

  it('never lends a practice attempt a rank', () => {
    const attempt = resultOnScreen('practice_flight', OFFICIAL, shot(99.9, 1));
    assert.equal(attempt.rank, 0);
    assert.equal(attempt.total, 0);
    assert.notEqual(attempt.rank, OFFICIAL.rank);
  });

  it('gives the ranked shot back the moment practice is left', () => {
    // `leave_practice` returns the phase to `result`; the official summary was
    // kept precisely so this needs no refetch.
    assert.deepEqual(resultOnScreen('result', OFFICIAL, shot(99.9, 1)), OFFICIAL);
  });

  it('shows the official result on every non-practice phase', () => {
    const phases: Phase[] = ['result', 'scoring_pending', 'impact'];
    for (const phase of phases) {
      assert.equal(
        resultOnScreen(phase, OFFICIAL, shot(12.3, 400)).score,
        OFFICIAL.score,
        `phase ${phase} must not show the practice shot`
      );
    }
  });

  it('falls back to the shot while the server is still answering', () => {
    // Between impact and confirmation the score is known client-side and only
    // the rank is travelling.
    const pending = resultOnScreen('scoring_pending', null, shot(80.91, 42));
    assert.equal(pending.score, 80.91);
    assert.equal(pending.rank, 0);
  });

  it('survives having nothing to show at all', () => {
    assert.equal(resultOnScreen('result', null, null).score, 0);
    assert.equal(unranked(null).impact, 'GROUND');
  });
});

/**
 * Which way to correct.
 *
 * `impactDirection` reads the sign of `signedDx` and nothing else, and
 * `unranked` used to hand it a hard-coded 0 -- which that expression reads as
 * "over". So every unranked shot claimed to be long: every practice attempt,
 * and the official one too for the moment between impact and the server's
 * answer. The one number practice exists to give you was wrong in half the
 * cases, silently, and always in the same direction.
 */
describe('the sign of a miss', () => {
  const DISTANCE = 600;

  it('calls a shot that fell short short', () => {
    const view = unranked(shot(40, 120, DISTANCE - 120), DISTANCE);
    assert.equal(view.signedDx, -120);
  });

  it('calls a shot that went long over', () => {
    const view = unranked(shot(40, 120, DISTANCE + 120), DISTANCE);
    assert.equal(view.signedDx, 120);
  });

  it('is unsigned when the day distance is unknown', () => {
    // The honest fallback: no distance, no claim about direction.
    assert.equal(unranked(shot(40, 120, 480)).signedDx, 0);
    assert.equal(unranked(null, DISTANCE).signedDx, 0);
  });

  it('agrees with the official shot it stands in for', () => {
    // `scoring_pending` shows this while the rank is still travelling, so it
    // must not contradict the panel that replaces it a second later.
    const short = resultOnScreen('scoring_pending', null, shot(58, 90, 510), DISTANCE);
    assert.ok(short.signedDx < 0, 'a short shot read as long');
  });
});
