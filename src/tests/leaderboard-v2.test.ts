import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  boardState,
  distanceLabel,
  dxForScore,
  MIN_FOR_BOARD,
  windowAround,
} from '../client/screens/board-math.ts';
import { boardEarly, COPY } from '../shared/copy.ts';
import { scoreForDx } from '../shared/sim.ts';
import { PERFECT_RADIUS, TARGET_R } from '../shared/tunables.ts';

/**
 * §7 asks for a distance column that `/api/leaderboard` does not send, and this
 * redesign is allowed exactly one backend addition, which is not this one. The
 * distance is recoverable instead: the score is a monotonic function of it. So
 * the first half of this file checks that the recovery is exact, and the second
 * checks the two board states that are hardest to reach by hand — a day with
 * three players, and someone opening the board before they have shot.
 */

describe('recovering the distance from the score (§7)', () => {
  it('round-trips every distance that has its own score', () => {
    // Below the Perfect radius every distance scores 100, so the score cannot
    // name which one — that is a property of the game, not of the inverse.
    for (let dx = PERFECT_RADIUS + 1; dx <= TARGET_R + 500; dx += 7) {
      const back = dxForScore(scoreForDx(dx, TARGET_R), TARGET_R);
      assert.ok(
        Math.abs(back - dx) < 0.5,
        `dx ${dx} came back as ${back.toFixed(2)}`
      );
    }
  });

  it('crosses the seam between the mat and the ground cleanly', () => {
    // The curve is piecewise and the join is where an algebraic inverse would
    // most easily be written wrong.
    for (const dx of [TARGET_R - 0.5, TARGET_R, TARGET_R + 0.5]) {
      const back = dxForScore(scoreForDx(dx, TARGET_R), TARGET_R);
      assert.ok(Math.abs(back - dx) < 0.5, `seam at ${dx} -> ${back.toFixed(2)}`);
    }
  });

  it('answers sensibly at both ends', () => {
    assert.equal(dxForScore(100, TARGET_R), 0, 'a Perfect is the centre');
    assert.ok(dxForScore(0, TARGET_R) > TARGET_R, 'a zero is well outside');
    assert.equal(distanceLabel(100, TARGET_R), '0');
  });

  it('follows the mat when Tiny Target halves it', () => {
    const tiny = TARGET_R / 2;
    for (let dx = PERFECT_RADIUS + 1; dx <= tiny * 4; dx += 5) {
      const back = dxForScore(scoreForDx(dx, tiny), tiny);
      assert.ok(Math.abs(back - dx) < 0.5, `tiny dx ${dx} -> ${back.toFixed(2)}`);
    }
  });

  it('never shows a decimal in the column', () => {
    for (const score of [99.94, 76.51, 43.07, 0]) {
      assert.match(distanceLabel(score, TARGET_R), /^\d+$/, `score ${score}`);
    }
  });

  it('agrees with the curve it inverts, not with a copy of its constants', () => {
    // The point of bisecting rather than solving: if the scoring curve moves
    // again, this stays true without anyone remembering to update it.
    const dx = 137;
    const score = scoreForDx(dx, TARGET_R);
    assert.ok(Math.abs(scoreForDx(dxForScore(score, TARGET_R), TARGET_R) - score) < 0.01);
  });
});

describe("the window around you (§7)", () => {
  const row = (rank: number, isMe = false) => ({ rank, isMe });

  it('keeps two above and two below', () => {
    const rows = [180, 181, 182, 183, 184, 185, 186].map((r) => row(r, r === 183));
    const shown = windowAround(rows).map((r) => r.rank);
    assert.deepEqual(shown, [181, 182, 183, 184, 185]);
  });

  it('slides rather than shrinking at the edges of what was sent', () => {
    const top = [1, 2, 3, 4, 5].map((r) => row(r, r === 1));
    assert.deepEqual(windowAround(top).map((r) => r.rank), [1, 2, 3, 4, 5]);
    const bottom = [96, 97, 98, 99, 100].map((r) => row(r, r === 100));
    assert.deepEqual(windowAround(bottom).map((r) => r.rank), [96, 97, 98, 99, 100]);
  });

  it('leaves the rows alone when there is no centre to trim around', () => {
    // No `isMe` means the player has not shot; the caller shows the "not
    // played" state, and inventing a centre here would hide rows for nothing.
    const rows = [1, 2, 3].map((r) => row(r));
    assert.equal(windowAround(rows).length, 3);
  });

  it('fits the shortest screen §12 designs for', () => {
    // The bug this fixes, as a number: eleven rows plus a header, a standing
    // line and a button do not fit 320x568, and the panel was measured clipped.
    const rows = Array.from({ length: 7 }, (_, i) => row(180 + i, i === 3));
    assert.ok(windowAround(rows).length <= 5);
  });
});

describe('the three boards (§7)', () => {
  const rows = (n: number): readonly number[] => Array.from({ length: n }, (_, i) => i);

  it('calls a thin day early rather than empty', () => {
    for (const total of [0, 1, 3, MIN_FOR_BOARD - 1]) {
      assert.equal(boardState(total, rows(0)), 'early', `total ${total}`);
    }
    assert.notEqual(boardState(MIN_FOR_BOARD, rows(3)), 'early');
  });

  it('says so when the player has no row of their own yet', () => {
    assert.equal(boardState(8421, rows(0)), 'not-played');
    assert.equal(boardState(8421, rows(5)), 'ranked');
  });

  it('phrases both empty states as an invitation', () => {
    assert.equal(boardEarly(3), "Only 3 shots so far — you're early.");
    assert.equal(boardEarly(1), "Only 1 shot so far — you're early.");
    for (const line of [boardEarly(3), COPY.boardNotPlayed]) {
      assert.doesNotMatch(line, /no |none|empty|nobody|sorry/i, line);
    }
  });
});
