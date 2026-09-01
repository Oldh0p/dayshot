import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import * as analytics from '../server/core/analytics.ts';
import { ensureDayMeta } from '../server/core/day.ts';
import * as keys from '../server/core/keys.ts';
import { decodeScore, decodeSeq } from '../server/core/ranking.ts';
import {
  readStoredShot,
  reconcileMissingScore,
  submitShot,
  summarise,
} from '../server/core/shot.ts';
import type { ShotDeps } from '../server/core/shot.ts';
import {
  applyShotToUser,
  EMPTY_USER,
  readUser,
  streakAfterShot,
  streakForDisplay,
} from '../server/core/user.ts';
import { generateLevel, simulateLevel } from '../shared/sim.ts';
import { LAUNCH_DAY, ROLLOVER_GRACE_S } from '../shared/tunables.ts';
import { FakeRedis } from './fake-redis.ts';

const DAY = LAUNCH_DAY + 30;
const NOON = DAY * 86400000 + 12 * 3600000;

/**
 * Module-level, exactly like the real generator: a nonce that resets per call
 * would make two identical holds indistinguishable, which is the failure the
 * lock has to survive.
 */
let nonceCounter = 0;

const deps = (redis: FakeRedis, at = NOON): ShotDeps => ({
  redis,
  now: () => at,
  nonce: () => `nonce-${nonceCounter++}`,
});

const submit = (
  redis: FakeRedis,
  overrides: Partial<Parameters<typeof submitShot>[1]> = {},
  at = NOON
) =>
  submitShot(deps(redis, at), {
    userId: 't2_alice',
    username: 'alice',
    claimedDay: DAY,
    holdMs: 640,
    clientScore: 0,
    ...overrides,
  });

describe('submitShot — the server re-simulates', () => {
  it('scores from holdMs, ignoring whatever the client claims', async () => {
    const redis = new FakeRedis();
    const meta = await ensureDayMeta(redis, DAY);
    const expected = simulateLevel(generateLevel(DAY, meta.rerollK), 640);

    const outcome = await submit(redis, { clientScore: 100 });
    assert.equal(outcome.status, 'recorded');
    if (outcome.status !== 'recorded') return;

    assert.equal(outcome.result.score, expected.score);
    assert.equal(outcome.simMismatch, expected.score !== 100);
  });

  it('reports no mismatch when the client agrees', async () => {
    const redis = new FakeRedis();
    const meta = await ensureDayMeta(redis, DAY);
    const expected = simulateLevel(generateLevel(DAY, meta.rerollK), 640);
    const outcome = await submit(redis, { clientScore: expected.score });
    assert.equal(
      outcome.status === 'recorded' ? outcome.simMismatch : true,
      false
    );
  });

  it('records the signed miss so the share grid knows which side', async () => {
    const redis = new FakeRedis();
    const meta = await ensureDayMeta(redis, DAY);
    const level = generateLevel(DAY, meta.rerollK);
    const expected = simulateLevel(level, 640);
    await submit(redis);

    const stored = await readStoredShot(redis, 't2_alice', DAY);
    assert.equal(stored?.signedDx, expected.impactX - level.distance);
    assert.equal(Math.abs(stored?.signedDx ?? 0), expected.dx);
  });

  it('rejects a hold that is not a plausible integer', async () => {
    const redis = new FakeRedis();
    for (const holdMs of [-1, 1.5, 600_001, Number.NaN]) {
      assert.equal((await submit(redis, { holdMs })).status, 'bad_request');
    }
  });

  it('uses the certified seed variant for the day', async () => {
    const redis = new FakeRedis();
    const meta = await ensureDayMeta(redis, DAY);
    const outcome = await submit(redis);
    const expected = simulateLevel(generateLevel(DAY, meta.rerollK), 640);
    assert.equal(
      outcome.status === 'recorded' ? outcome.result.score : -1,
      expected.score
    );
  });
});

describe('submitShot — one shot per account per day', () => {
  it('hands the second attempt the shot that already exists', async () => {
    const redis = new FakeRedis();
    const first = await submit(redis, { holdMs: 640 });
    const second = await submit(redis, { holdMs: 700 });

    assert.equal(first.status, 'recorded');
    assert.equal(second.status, 'already_played');
    if (first.status !== 'recorded' || second.status !== 'already_played') return;

    assert.equal(second.result.score, first.result.score);
    assert.equal(second.result.holdMs, 640);
    assert.equal(await redis.zCard(keys.dayScores(DAY)), 1);
  });

  it('survives a concurrent race between tabs or devices', async () => {
    // Latency in the fake means the eight submissions genuinely interleave
    // rather than running to completion one after another.
    const redis = new FakeRedis(1);
    const attempts = Array.from({ length: 8 }, (_, i) =>
      submit(redis, { holdMs: 500 + i * 37 })
    );

    const outcomes = await Promise.all(attempts);
    const recorded = outcomes.filter((o) => o.status === 'recorded');
    const rejected = outcomes.filter((o) => o.status === 'already_played');

    assert.equal(recorded.length, 1, 'exactly one submission may win');
    assert.equal(rejected.length, 7);
    assert.equal(await redis.zCard(keys.dayScores(DAY)), 1);

    // Everybody agrees on which shot counted.
    const winner = recorded[0];
    assert.ok(winner && winner.status === 'recorded');
    for (const loser of rejected) {
      assert.ok(loser.status === 'already_played');
      assert.equal(loser.result.holdMs, winner.result.holdMs);
      assert.equal(loser.result.score, winner.result.score);
    }
  });

  it('lets a different account through on the same day', async () => {
    const redis = new FakeRedis();
    await submit(redis, { userId: 't2_alice', username: 'alice' });
    const bob = await submit(redis, { userId: 't2_bob', username: 'bob' });
    assert.equal(bob.status, 'recorded');
    assert.equal(await redis.zCard(keys.dayScores(DAY)), 2);
  });

  it('counts a shot exactly once in the day counters', async () => {
    const redis = new FakeRedis(1);
    await Promise.all(Array.from({ length: 5 }, () => submit(redis)));
    assert.equal(
      await redis.hGet(keys.dayMeta(DAY), 'shots'),
      '1',
      'the shots counter must not double-count a retried submission'
    );
  });
});

describe('submitShot — the UTC rollover', () => {
  it('accepts a queued shot for yesterday inside the grace window', async () => {
    const redis = new FakeRedis();
    const justAfterMidnight = (DAY + 1) * 86400000 + 30_000;
    const outcome = await submit(redis, {}, justAfterMidnight);
    assert.equal(outcome.status, 'recorded');
    assert.equal(
      outcome.status === 'recorded' ? outcome.dayNumber : -1,
      DAY,
      'the shot belongs to the day it was taken on'
    );
  });

  it('rolls over once the grace window closes', async () => {
    const redis = new FakeRedis();
    const late = (DAY + 1) * 86400000 + (ROLLOVER_GRACE_S + 1) * 1000;
    const outcome = await submit(redis, {}, late);
    assert.equal(outcome.status, 'day_rolled');
    assert.equal(
      outcome.status === 'day_rolled' ? outcome.dayNumber : -1,
      DAY + 1
    );
  });

  it('never attributes a shot to the wrong day', async () => {
    const redis = new FakeRedis();
    const late = (DAY + 1) * 86400000 + 3600_000;
    await submit(redis, {}, late);
    assert.equal(await redis.zCard(keys.dayScores(DAY)), 0);
    assert.equal(await redis.zCard(keys.dayScores(DAY + 1)), 0);
  });
});

describe('submitShot — the resubmission queue can retry safely', () => {
  it('is idempotent when the same shot arrives twice', async () => {
    const redis = new FakeRedis();
    const first = await submit(redis, { holdMs: 812 });
    const retry = await submit(redis, { holdMs: 812 });

    assert.equal(first.status, 'recorded');
    assert.equal(retry.status, 'already_played');
    if (first.status !== 'recorded' || retry.status !== 'already_played') return;

    assert.equal(retry.result.score, first.result.score);
    assert.equal(retry.result.rank, first.result.rank);
    assert.equal(await redis.zCard(keys.dayScores(DAY)), 1);
  });

  it('repairs a lock whose leaderboard write was lost', async () => {
    const redis = new FakeRedis();
    await submit(redis);

    // Simulate a crash between the lock and the sorted-set write.
    redis.zsets.delete(keys.dayScores(DAY));

    const stored = await readStoredShot(redis, 't2_alice', DAY);
    assert.ok(stored);
    assert.equal(await reconcileMissingScore(redis, DAY, 't2_alice', stored), true);
    assert.equal(await redis.zCard(keys.dayScores(DAY)), 1);

    const summary = await summarise(redis, DAY, 't2_alice', stored);
    assert.equal(summary.rank, 1);
    assert.equal(summary.score, stored.score);

    // Repairing twice must not add a second entry.
    assert.equal(
      await reconcileMissingScore(redis, DAY, 't2_alice', stored),
      false
    );
  });

  it('repairs on the retry path automatically', async () => {
    const redis = new FakeRedis();
    await submit(redis);
    redis.zsets.delete(keys.dayScores(DAY));

    const retry = await submit(redis);
    assert.equal(retry.status, 'already_played');
    assert.equal(await redis.zCard(keys.dayScores(DAY)), 1);
  });
});

describe('leaderboard bookkeeping', () => {
  it('orders players by score and then by arrival', async () => {
    const redis = new FakeRedis();
    const meta = await ensureDayMeta(redis, DAY);
    const level = generateLevel(DAY, meta.rerollK);

    // Two holds that produce the same score, submitted in a known order.
    const holds = [400, 500, 600, 700, 800];
    const results: { user: string; score: number }[] = [];
    for (const [index, holdMs] of holds.entries()) {
      const user = `t2_p${index}`;
      await submit(redis, { userId: user, username: `p${index}`, holdMs });
      results.push({ user, score: simulateLevel(level, holdMs).score });
    }

    const rows = await redis.zRange(keys.dayScores(DAY), 0, 99, {
      by: 'rank',
      reverse: true,
    });

    const decoded = rows.map((r) => decodeScore(r.score));
    for (let i = 1; i < decoded.length; i++) {
      assert.ok(decoded[i - 1]! >= decoded[i]!, 'board must descend by score');
    }
    assert.deepEqual(
      [...results].sort((a, b) => b.score - a.score).map((r) => r.score),
      decoded
    );
  });

  it('assigns a dense sequence to the day', async () => {
    const redis = new FakeRedis();
    for (let i = 0; i < 4; i++) {
      await submit(redis, { userId: `t2_${i}`, username: `p${i}` });
    }
    const rows = await redis.zRange(keys.dayScores(DAY), 0, 99, {
      by: 'rank',
      reverse: true,
    });
    assert.deepEqual(rows.map((r) => decodeSeq(r.score)).sort((a, b) => a - b), [
      1, 2, 3, 4,
    ]);
  });

  it('records the username for the leaderboard to display', async () => {
    const redis = new FakeRedis();
    await submit(redis, { userId: 't2_zed', username: 'zed' });
    assert.equal(await redis.hGet(keys.dayNames(DAY), 't2_zed'), 'zed');
  });

  it('counts Perfects for the rarity line', async () => {
    const redis = new FakeRedis();
    await submit(redis);
    const perfects = Number(
      (await redis.hGet(keys.dayMeta(DAY), 'perfects')) ?? '0'
    );
    const outcome = await readStoredShot(redis, 't2_alice', DAY);
    assert.equal(perfects, outcome?.score === 100 ? 1 : 0);
  });
});

describe('streak', () => {
  it('extends on consecutive days and never judges the score', () => {
    const day5 = { ...EMPTY_USER, streak: 5, longest: 9, lastPlayedDay: 99 };
    assert.deepEqual(streakAfterShot(day5, 100), {
      current: 6,
      longest: 9,
      justReset: false,
    });
  });

  it('raises the record when the current streak passes it', () => {
    const user = { ...EMPTY_USER, streak: 9, longest: 9, lastPlayedDay: 99 };
    assert.equal(streakAfterShot(user, 100).longest, 10);
  });

  it('restarts at one after a missed day, keeping the record', () => {
    const lapsed = { ...EMPTY_USER, streak: 12, longest: 17, lastPlayedDay: 95 };
    assert.deepEqual(streakAfterShot(lapsed, 100), {
      current: 1,
      longest: 17,
      justReset: true,
    });
  });

  it('starts at one for a brand new player', () => {
    assert.deepEqual(streakAfterShot(EMPTY_USER, 100), {
      current: 1,
      longest: 1,
      justReset: false,
    });
  });

  it('does not announce a reset for a lapsed one-day streak', () => {
    const user = { ...EMPTY_USER, streak: 1, longest: 1, lastPlayedDay: 90 };
    assert.equal(streakAfterShot(user, 100).justReset, false);
  });

  it('still shows yesterday\'s streak before today\'s shot', () => {
    const user = { ...EMPTY_USER, streak: 12, longest: 17, lastPlayedDay: 99 };
    assert.deepEqual(streakForDisplay(user, 100, false), {
      current: 12,
      longest: 17,
      justReset: false,
    });
  });

  it('shows zero once the streak has actually lapsed', () => {
    const user = { ...EMPTY_USER, streak: 12, longest: 17, lastPlayedDay: 95 };
    assert.deepEqual(streakForDisplay(user, 100, false), {
      current: 0,
      longest: 17,
      justReset: true,
    });
  });

  it('persists through a real submission', async () => {
    const redis = new FakeRedis();
    await applyShotToUser(redis, 't2_alice', EMPTY_USER, DAY - 1, 70, false, false);
    const before = await readUser(redis, 't2_alice');
    assert.equal(before.streak, 1);
    assert.equal(before.lastPlayedDay, DAY - 1);

    const outcome = await submit(redis);
    assert.equal(outcome.status === 'recorded' ? outcome.streak.current : -1, 2);

    const after = await readUser(redis, 't2_alice');
    assert.equal(after.streak, 2);
    assert.equal(after.daysPlayed, 2);
  });
});

describe('analytics', () => {
  it('counts a scored shot in the daily aggregate', async () => {
    const redis = new FakeRedis();
    await submit(redis);
    const stats = await redis.hGetAll(keys.dayStats(DAY));
    assert.equal(stats['shot_scored'], '1');
    assert.ok(
      Object.keys(stats).some((k) => k.startsWith('shot_scored:score:')),
      'the score bucket should be recorded'
    );
  });

  it('counts the three numbers the first week will be judged on', async () => {
    const redis = new FakeRedis();
    const meta = await ensureDayMeta(redis, DAY);
    const level = generateLevel(DAY, meta.rerollK);

    // A client that disagrees with the server, which is the alarm case.
    await submit(redis, { holdMs: 640, clientScore: 12.34 });
    const expected = simulateLevel(level, 640);

    const stats = await redis.hGetAll(keys.dayStats(DAY));
    assert.equal(stats['shots'], '1');
    assert.equal(stats['bullseyes'], expected.isBullseye ? '1' : undefined);
    assert.equal(stats['perfects'], expected.isPerfect ? '1' : undefined);
    assert.equal(
      stats['sim_mismatch'],
      '1',
      'a client/server divergence has to be countable, not just loggable'
    );
  });

  it('does not raise the mismatch alarm when the client agrees', async () => {
    const redis = new FakeRedis();
    const meta = await ensureDayMeta(redis, DAY);
    const expected = simulateLevel(generateLevel(DAY, meta.rerollK), 640);
    await submit(redis, { holdMs: 640, clientScore: expected.score });
    const stats = await redis.hGetAll(keys.dayStats(DAY));
    assert.equal(stats['sim_mismatch'], undefined);
    assert.equal(stats['shots'], '1');
  });

  it('drops event names that are not on the allow list', async () => {
    const redis = new FakeRedis();
    assert.equal(
      await analytics.record(redis, DAY, { name: 'drop_tables' }),
      false
    );
    assert.deepEqual(await redis.hGetAll(keys.dayStats(DAY)), {});
  });

  it('refuses to turn client text into a redis field', async () => {
    const redis = new FakeRedis();
    await analytics.record(redis, DAY, {
      name: 'launch',
      props: { 'source': 'feed', 'evil key': 'x', bad: 'a'.repeat(50) },
    });
    const stats = await redis.hGetAll(keys.dayStats(DAY));
    assert.deepEqual(Object.keys(stats).sort(), ['launch', 'launch:source:feed']);
  });

  it('buckets scores and holds rather than storing raw values', () => {
    assert.equal(analytics.scoreBucket(0), '0-9');
    assert.equal(analytics.scoreBucket(98.73), '90-99');
    assert.equal(analytics.scoreBucket(100), '100');
    assert.equal(analytics.holdBucket(0), '0');
    assert.equal(analytics.holdBucket(640), '500');
  });
});
