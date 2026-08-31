import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  dayNumberAt,
  displayDayFor,
  msUntilRollover,
  resolveSubmissionDay,
  secondsIntoDay,
} from '../server/core/clock.ts';
import { attachPost, ensureDayMeta } from '../server/core/day.ts';
import * as keys from '../server/core/keys.ts';
import {
  decodeScore,
  decodeSeq,
  encodeCompositeScore,
  leaderboardFor,
  percentileFor,
  rankFromAscending,
  standingFor,
} from '../server/core/ranking.ts';
import { generateLevel, resolveRerollK, sweepLevel } from '../shared/sim.ts';
import {
  BULLSEYE_SCORE,
  LAUNCH_DAY,
  ROLLOVER_GRACE_S,
} from '../shared/tunables.ts';
import { FakeRedis } from './fake-redis.ts';

const MS_PER_DAY = 86400000;
const utc = (iso: string): number => Date.parse(iso);

describe('clock', () => {
  it('numbers days from the UTC epoch', () => {
    assert.equal(dayNumberAt(utc('1970-01-01T00:00:00Z')), 0);
    assert.equal(dayNumberAt(utc('1970-01-01T23:59:59Z')), 0);
    assert.equal(dayNumberAt(utc('1970-01-02T00:00:00Z')), 1);
    assert.equal(dayNumberAt(utc('2026-09-01T00:00:00Z')), LAUNCH_DAY);
  });

  it('opens the game on ONE SHOT #1', () => {
    assert.equal(displayDayFor(LAUNCH_DAY), 1);
    assert.equal(displayDayFor(LAUNCH_DAY + 246), 247);
  });

  it('numbers days before launch honestly rather than clamping them', () => {
    // A clamp would be the tempting fix for a `#0` title, and it would make two
    // different days both call themselves #1. The arithmetic stays exact; a
    // non-positive number is the signal that LAUNCH_DAY has not been set yet,
    // and `ensureDailyPost` says so in the log.
    assert.equal(displayDayFor(LAUNCH_DAY - 1), 0);
    assert.equal(displayDayFor(LAUNCH_DAY - 5), -4);
  });

  it('advances by exactly one a day, forever', () => {
    for (let offset = 0; offset < 500; offset++) {
      assert.equal(
        displayDayFor(LAUNCH_DAY + offset + 1) -
          displayDayFor(LAUNCH_DAY + offset),
        1
      );
    }
  });

  it('counts down to the next UTC midnight', () => {
    assert.equal(msUntilRollover(utc('2026-09-01T00:00:00Z')), MS_PER_DAY);
    assert.equal(msUntilRollover(utc('2026-09-01T23:59:59Z')), 1000);
    assert.equal(secondsIntoDay(utc('2026-09-01T00:01:30Z')), 90);
  });
});

describe('resolveSubmissionDay', () => {
  const today = dayNumberAt(utc('2026-09-02T12:00:00Z'));

  it('accepts a shot for the current day', () => {
    assert.deepEqual(
      resolveSubmissionDay(today, utc('2026-09-02T12:00:00Z')),
      { accepted: true, dayNumber: today }
    );
  });

  it('honours yesterday inside the grace window', () => {
    const justAfterMidnight = utc('2026-09-03T00:00:30Z');
    assert.deepEqual(resolveSubmissionDay(today, justAfterMidnight), {
      accepted: true,
      dayNumber: today,
    });
  });

  it('accepts the very edge of the grace window', () => {
    const edge = utc('2026-09-03T00:00:00Z') + ROLLOVER_GRACE_S * 1000;
    assert.equal(resolveSubmissionDay(today, edge).accepted, true);
  });

  it('rolls the day over once the grace window closes', () => {
    const late = utc('2026-09-03T00:00:00Z') + (ROLLOVER_GRACE_S + 1) * 1000;
    const outcome = resolveSubmissionDay(today, late);
    assert.equal(outcome.accepted, false);
    assert.equal(outcome.dayNumber, today + 1);
  });

  it('never accepts a day from the future', () => {
    assert.equal(
      resolveSubmissionDay(today + 1, utc('2026-09-02T12:00:00Z')).accepted,
      false
    );
  });

  it('never accepts a day from long ago', () => {
    assert.equal(
      resolveSubmissionDay(today - 5, utc('2026-09-02T12:00:00Z')).accepted,
      false
    );
  });
});

describe('composite leaderboard score', () => {
  it('round-trips the score', () => {
    for (const score of [0, 12.34, 72.5, 98.73, 99.99, 100]) {
      assert.equal(decodeScore(encodeCompositeScore(score, 7)), score);
    }
  });

  it('round-trips the arrival order', () => {
    for (const seq of [0, 1, 999, 1_000_000]) {
      assert.equal(decodeSeq(encodeCompositeScore(50, seq)), seq);
    }
  });

  it('stays inside exact integer range', () => {
    const largest = encodeCompositeScore(100, 0);
    assert.ok(largest < Number.MAX_SAFE_INTEGER);
    assert.equal(largest, Math.round(largest));
  });

  it('ranks a higher score above a lower one', () => {
    assert.ok(encodeCompositeScore(98.74, 9999) > encodeCompositeScore(98.73, 0));
  });

  it('breaks a tie in favour of the earlier shot', () => {
    assert.ok(encodeCompositeScore(98.73, 4) > encodeCompositeScore(98.73, 5));
  });

  it('gives every submission a distinct key', () => {
    const seen = new Set<number>();
    for (let seq = 0; seq < 500; seq++) seen.add(encodeCompositeScore(72.5, seq));
    assert.equal(seen.size, 500);
  });
});

describe('rank and percentile', () => {
  it('turns an ascending index into a one-based rank', () => {
    assert.equal(rankFromAscending(9, 10), 1);
    assert.equal(rankFromAscending(0, 10), 10);
  });

  it('reports the share of the field at or above the player', () => {
    assert.equal(percentileFor(1, 1000), 0.1);
    assert.equal(percentileFor(42, 1000), 4.2);
    assert.equal(percentileFor(1000, 1000), 100);
  });

  it('is safe on an empty board', () => {
    assert.equal(percentileFor(0, 0), 100);
  });
});

describe('leaderboard', () => {
  const seed = async (redis: FakeRedis, day: number, count: number) => {
    for (let i = 0; i < count; i++) {
      const userId = `t2_${String(i).padStart(4, '0')}`;
      // Descending scores, so player i lands at rank i + 1.
      await redis.zAdd(keys.dayScores(day), {
        member: userId,
        score: encodeCompositeScore(100 - i * 0.01, i),
      });
      await redis.hSet(keys.dayNames(day), { [userId]: `player${i}` });
    }
  };

  it('returns the podium and a window around the player', async () => {
    const redis = new FakeRedis();
    await seed(redis, 1, 500);

    const board = await leaderboardFor(redis, 1, 't2_0183');
    assert.equal(board.total, 500);
    assert.deepEqual(
      board.top.map((e) => e.rank),
      [1, 2, 3]
    );
    assert.deepEqual(
      board.around.map((e) => e.rank),
      [181, 182, 183, 184, 185, 186, 187]
    );
    const me = board.around.find((e) => e.isMe);
    assert.equal(me?.rank, 184);
    assert.equal(me?.username, 'player183');
  });

  it('clamps the window at the top of the board', async () => {
    const redis = new FakeRedis();
    await seed(redis, 1, 20);
    const board = await leaderboardFor(redis, 1, 't2_0000');
    assert.deepEqual(
      board.around.map((e) => e.rank),
      [1, 2, 3, 4]
    );
  });

  it('clamps the window at the bottom of the board', async () => {
    const redis = new FakeRedis();
    await seed(redis, 1, 20);
    const board = await leaderboardFor(redis, 1, 't2_0019');
    assert.deepEqual(
      board.around.map((e) => e.rank),
      [17, 18, 19, 20]
    );
  });

  it('handles a player who has not shot yet', async () => {
    const redis = new FakeRedis();
    await seed(redis, 1, 20);
    const board = await leaderboardFor(redis, 1, 't2_9999');
    assert.equal(board.top.length, 3);
    assert.equal(board.around.length, 0);
  });

  it('handles an empty day', async () => {
    const redis = new FakeRedis();
    const board = await leaderboardFor(redis, 1, 't2_0001');
    assert.deepEqual(board, { top: [], around: [], total: 0 });
  });

  it('agrees with standingFor', async () => {
    const redis = new FakeRedis();
    await seed(redis, 1, 250);
    const standing = await standingFor(redis, 1, 't2_0041');
    assert.deepEqual(standing, { rank: 42, total: 250, percentile: 16.8 });
  });
});

describe('ensureDayMeta', () => {
  it('computes and persists the reroll index once', async () => {
    const redis = new FakeRedis();
    const day = LAUNCH_DAY + 11;

    const first = await ensureDayMeta(redis, day);
    const writes = redis.log.filter((c) => c.startsWith('hSetNX')).length;

    const second = await ensureDayMeta(redis, day);
    const writesAfter = redis.log.filter((c) => c.startsWith('hSetNX')).length;

    assert.equal(first.rerollK, second.rerollK);
    assert.equal(first.tomorrowModifier, second.tomorrowModifier);
    assert.equal(writesAfter, writes, 'second read should not write');
  });

  it('certifies the day it hands out', async () => {
    const redis = new FakeRedis();
    for (let offset = 0; offset < 14; offset++) {
      const day = LAUNCH_DAY + offset;
      const meta = await ensureDayMeta(redis, day);
      const { bestScore } = sweepLevel(generateLevel(day, meta.rerollK));
      assert.ok(
        bestScore >= BULLSEYE_SCORE,
        `day ${day} shipped with an unwinnable level`
      );
    }
  });

  it('names the modifier players will actually meet tomorrow', async () => {
    const redis = new FakeRedis();
    const day = LAUNCH_DAY + 3;
    const today = await ensureDayMeta(redis, day);
    const tomorrow = await ensureDayMeta(redis, day + 1);

    assert.equal(
      today.tomorrowModifier,
      generateLevel(day + 1, tomorrow.rerollK).modifier
    );
    assert.equal(tomorrow.rerollK, resolveRerollK(day + 1));
  });

  it('converges on one value when cold requests race at midnight', async () => {
    const redis = new FakeRedis(1);
    const day = LAUNCH_DAY + 21;

    const metas = await Promise.all(
      Array.from({ length: 8 }, () => ensureDayMeta(redis, day))
    );

    const ks = new Set(metas.map((m) => m.rerollK));
    assert.equal(ks.size, 1, `clients disagreed about the seed: ${[...ks]}`);
  });

  it('binds the day to the first post only', async () => {
    const redis = new FakeRedis();
    const day = LAUNCH_DAY;
    await ensureDayMeta(redis, day);

    assert.equal(await attachPost(redis, day, 't3_first'), true);
    assert.equal(await attachPost(redis, day, 't3_second'), false);
    assert.equal((await ensureDayMeta(redis, day)).postId, 't3_first');
  });
});
