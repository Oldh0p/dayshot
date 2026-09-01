import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import * as keys from '../server/core/keys.ts';
import { encodeCompositeScore } from '../server/core/ranking.ts';
import { submitShot } from '../server/core/shot.ts';
import { buildState } from '../server/core/state.ts';
import { applyShotToUser, EMPTY_USER, markWarmupDone } from '../server/core/user.ts';
import { generateLevel } from '../shared/sim.ts';
import { LAUNCH_DAY } from '../shared/tunables.ts';
import { FakeRedis } from './fake-redis.ts';

const DAY = LAUNCH_DAY + 60;
const NOON = DAY * 86400000 + 12 * 3600000;

let nonceCounter = 0;
const deps = (redis: FakeRedis, at = NOON) => ({
  redis,
  now: () => at,
  nonce: () => `state-nonce-${nonceCounter++}`,
});

const play = (redis: FakeRedis, userId: string, holdMs: number, at = NOON) =>
  submitShot(deps(redis, at), {
    userId,
    username: userId.replace('t2_', ''),
    claimedDay: DAY,
    holdMs,
    clientScore: 0,
  });

describe('buildState', () => {
  it('describes the day without ever sending the level', async () => {
    const redis = new FakeRedis();
    const state = await buildState(redis, {
      userId: 't2_alice',
      username: 'alice',
      now: NOON,
    });

    assert.equal(state.dayNumber, DAY);
    // The first day this installation ever sees is its #1, whenever that
    // happens to be -- the approval date of a submission is not knowable when
    // it is submitted.
    assert.equal(state.displayDay, 1);
    assert.equal(state.serverNow, NOON);
    assert.equal(
      state.modifier,
      generateLevel(DAY, state.rerollK).modifier,
      'the client must be able to regenerate the level from what it is told'
    );
    // Nothing about distance, wind, angle or gusts travels.
    const wire = JSON.stringify(state);
    for (const leak of ['distance', 'windBase', 'angleDeg', 'gustTable']) {
      assert.ok(!wire.includes(leak), `state leaked ${leak}`);
    }
  });

  it('opens on a first visit and never again', async () => {
    const redis = new FakeRedis();
    const before = await buildState(redis, {
      userId: 't2_new',
      username: 'new',
      now: NOON,
    });
    assert.equal(before.warmupPending, true);

    await markWarmupDone(redis, 't2_new', DAY);
    const after = await buildState(redis, {
      userId: 't2_new',
      username: 'new',
      now: NOON,
    });
    assert.equal(after.warmupPending, false);
  });

  it('asks for a warm-up again tomorrow, and every day after', async () => {
    // The point of the daily warm-up: yesterday's does not spend today's. This
    // is the whole behaviour, so it is asserted across three consecutive days
    // rather than two -- an off-by-one that only came back on alternate days
    // would pass a two-day test.
    const redis = new FakeRedis();
    for (let offset = 0; offset < 3; offset++) {
      const at = NOON + offset * 86400000;
      const opening = await buildState(redis, {
        userId: 't2_regular',
        username: 'regular',
        now: at,
      });
      assert.equal(
        opening.warmupPending,
        true,
        `day +${offset} must open with a warm-up of its own`
      );

      await markWarmupDone(redis, 't2_regular', DAY + offset);
      const after = await buildState(redis, {
        userId: 't2_regular',
        username: 'regular',
        now: at,
      });
      assert.equal(after.warmupPending, false, `day +${offset} warm-up spent`);
    }
  });

  it('reports the shot once it has been taken', async () => {
    const redis = new FakeRedis();
    const outcome = await play(redis, 't2_alice', 640);
    assert.equal(outcome.status, 'recorded');

    const state = await buildState(redis, {
      userId: 't2_alice',
      username: 'alice',
      now: NOON,
    });
    assert.equal(state.playedToday, true);
    assert.equal(
      state.myResult?.score,
      outcome.status === 'recorded' ? outcome.result.score : -1
    );
    assert.equal(state.myResult?.rank, 1);
    assert.equal(state.myResult?.total, 1);
    assert.equal(state.streak.current, 1);
  });

  it("counts the world's shots and reports the day's best", async () => {
    const redis = new FakeRedis();
    for (let i = 0; i < 6; i++) {
      await play(redis, `t2_p${i}`, 400 + i * 60);
    }

    const state = await buildState(redis, {
      userId: 't2_p0',
      username: 'p0',
      now: NOON,
    });
    assert.equal(state.shotsToday, 6);

    const rows = await redis.zRange(keys.dayScores(DAY), 0, 0, {
      by: 'rank',
      reverse: true,
    });
    const best = rows[0];
    assert.ok(best);
    assert.equal(state.topScore, Math.round(state.topScore * 100) / 100);
    assert.ok(state.topScore >= (state.myResult?.score ?? 0));
  });

  it('serves a logged-out visitor the day without an account', async () => {
    const redis = new FakeRedis();
    await play(redis, 't2_alice', 640);

    const state = await buildState(redis, {
      userId: null,
      username: null,
      now: NOON,
    });
    assert.equal(state.username, null);
    assert.equal(state.playedToday, false);
    assert.equal(state.myResult, null);
    // A visitor with no account has warmed up nothing; the client sends them
    // to a demo shot on `username === null` before this is ever consulted.
    assert.equal(state.warmupPending, true);
    assert.equal(state.shotsToday, 1);
  });

  it('names the modifier of tomorrow, not of today', async () => {
    const redis = new FakeRedis();
    const state = await buildState(redis, {
      userId: 't2_alice',
      username: 'alice',
      now: NOON,
    });
    const tomorrow = await buildState(redis, {
      userId: 't2_alice',
      username: 'alice',
      now: NOON + 86400000,
    });
    assert.equal(state.tomorrowModifier, tomorrow.modifier);
  });

  it("shows a standing streak before today's shot", async () => {
    const redis = new FakeRedis();
    await applyShotToUser(redis, 't2_alice', EMPTY_USER, DAY - 1, 70, false, false);
    const state = await buildState(redis, {
      userId: 't2_alice',
      username: 'alice',
      now: NOON,
    });
    assert.equal(state.playedToday, false);
    assert.equal(state.streak.current, 1);
    assert.equal(state.streak.justReset, false);
  });

  it('announces a lapsed streak', async () => {
    const redis = new FakeRedis();
    await redis.hSet(keys.user('t2_alice'), {
      streak: '12',
      longest: '17',
      lastPlayedDay: String(DAY - 5),
      firstVisitDone: '1',
    });
    const state = await buildState(redis, {
      userId: 't2_alice',
      username: 'alice',
      now: NOON,
    });
    assert.deepEqual(state.streak, {
      current: 0,
      longest: 17,
      justReset: true,
    });
  });

  it('repairs a lost leaderboard write before anyone sees a rank of zero', async () => {
    const redis = new FakeRedis();
    await play(redis, 't2_alice', 640);
    redis.zsets.delete(keys.dayScores(DAY));

    const state = await buildState(redis, {
      userId: 't2_alice',
      username: 'alice',
      now: NOON,
    });
    assert.equal(state.myResult?.rank, 1);
    assert.equal(state.shotsToday, 0, 'the count is read before the repair');

    const after = await buildState(redis, {
      userId: 't2_alice',
      username: 'alice',
      now: NOON,
    });
    assert.equal(after.shotsToday, 1);
  });

  it('certifies the seed it advertises', async () => {
    const redis = new FakeRedis();
    for (let offset = 0; offset < 7; offset++) {
      const at = (DAY + offset) * 86400000 + 3600000;
      const state = await buildState(redis, {
        userId: null,
        username: null,
        now: at,
      });
      assert.equal(
        state.modifier,
        generateLevel(state.dayNumber, state.rerollK).modifier
      );
    }
  });

  it('is stable under a burst of cold requests', async () => {
    const redis = new FakeRedis(1);
    const states = await Promise.all(
      Array.from({ length: 6 }, () =>
        buildState(redis, { userId: null, username: null, now: NOON })
      )
    );
    const ks = new Set(states.map((s) => s.rerollK));
    assert.equal(ks.size, 1);
  });
});

describe('leaderboard entries carry decoded scores', () => {
  it('never exposes the composite sort key', async () => {
    const redis = new FakeRedis();
    await redis.zAdd(keys.dayScores(DAY), {
      member: 't2_alice',
      score: encodeCompositeScore(98.73, 4),
    });
    await redis.hSet(keys.dayNames(DAY), { t2_alice: 'alice' });

    const { leaderboardFor } = await import('../server/core/ranking.ts');
    const board = await leaderboardFor(redis, DAY, 't2_alice');
    assert.equal(board.top[0]?.score, 98.73);
    assert.equal(board.top[0]?.username, 'alice');
    assert.equal(board.top[0]?.isMe, true);
  });
});

describe('day numbering', () => {
  it('calls the first day it ever sees #1, and counts up from there', async () => {
    const redis = new FakeRedis();

    const first = await buildState(redis, {
      userId: 't2_alice',
      username: 'alice',
      now: NOON,
    });
    assert.equal(first.displayDay, 1);

    const later = await buildState(redis, {
      userId: 't2_alice',
      username: 'alice',
      now: NOON + 9 * 86400000,
    });
    assert.equal(later.displayDay, 10);
  });

  it('never re-anchors, however many cold requests race', async () => {
    const redis = new FakeRedis(1);
    const states = await Promise.all(
      Array.from({ length: 6 }, () =>
        buildState(redis, { userId: null, username: null, now: NOON })
      )
    );
    assert.deepEqual(new Set(states.map((s) => s.displayDay)), new Set([1]));

    // And a later day still counts from the same anchor.
    const tomorrow = await buildState(redis, {
      userId: null,
      username: null,
      now: NOON + 86400000,
    });
    assert.equal(tomorrow.displayDay, 2);
  });

  it('gives a fresh installation its own #1', async () => {
    // Redis is namespaced per installation, so a second community starting
    // later counts from its own first day rather than inheriting ours.
    const older = new FakeRedis();
    await buildState(older, { userId: null, username: null, now: NOON });

    const newer = new FakeRedis();
    const state = await buildState(newer, {
      userId: null,
      username: null,
      now: NOON + 100 * 86400000,
    });
    assert.equal(state.displayDay, 1);
  });
});
