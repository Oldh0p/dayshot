import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import * as keys from '../server/core/keys.ts';
import { submitShot } from '../server/core/shot.ts';
import { buildState } from '../server/core/state.ts';
import { markWarmupDone } from '../server/core/user.ts';
import { LAUNCH_DAY } from '../shared/tunables.ts';
import { FakeRedis } from './fake-redis.ts';

/**
 * Two accounts must never see each other's state.
 *
 * Written after a playtest where a second account reported a score identical to
 * the first's, down to the hundredth. That turned out to be the cliff
 * degeneracy — two different releases into the same wall genuinely scored the
 * same — but "two players share a result" is also exactly what a leaked user id
 * looks like, and the difference matters far too much to be argued from
 * inspection. So it is a test.
 */

const DAY = LAUNCH_DAY + 120;
const NOON = DAY * 86400000 + 12 * 3600000;

let nonceCounter = 0;
const deps = (redis: FakeRedis, at = NOON) => ({
  redis,
  now: () => at,
  nonce: () => `iso-${nonceCounter++}`,
});

const play = (redis: FakeRedis, userId: string, holdMs: number) =>
  submitShot(deps(redis), {
    userId,
    username: userId.replace('t2_', ''),
    claimedDay: DAY,
    holdMs,
    clientScore: 0,
  });

const stateOf = (redis: FakeRedis, userId: string, at = NOON) =>
  buildState(redis, {
    userId,
    username: userId.replace('t2_', ''),
    now: at,
  });

describe('two accounts on the same day', () => {
  it('each get their own lock, holdMs and audit record', async () => {
    const redis = new FakeRedis();
    await play(redis, 't2_alice', 421);
    await play(redis, 't2_bob', 903);

    const alice = JSON.parse(
      (await redis.hGet(keys.userPlayed('t2_alice', DAY), 'shot')) ?? '{}'
    );
    const bob = JSON.parse(
      (await redis.hGet(keys.userPlayed('t2_bob', DAY), 'shot')) ?? '{}'
    );

    assert.equal(alice.holdMs, 421);
    assert.equal(bob.holdMs, 903);
    assert.notEqual(alice.nonce, bob.nonce);
  });

  it('does not let one account\'s shot satisfy the other\'s lock', async () => {
    const redis = new FakeRedis();
    await play(redis, 't2_alice', 421);

    // Bob has not played, however much Alice has.
    const before = await stateOf(redis, 't2_bob');
    assert.equal(before.playedToday, false);
    assert.equal(before.myResult, null);

    const bob = await play(redis, 't2_bob', 903);
    assert.equal(bob.status, 'recorded', 'Alice must not block Bob');

    // And Alice keeps hers.
    const alice = await stateOf(redis, 't2_alice');
    assert.equal(alice.myResult?.holdMs, 421);
  });

  it('keeps streaks apart', async () => {
    const redis = new FakeRedis();
    // Alice has been playing; Bob is new today.
    await redis.hSet(keys.user('t2_alice'), {
      streak: '11',
      longest: '11',
      lastPlayedDay: String(DAY - 1),
      firstVisitDone: '1',
    });

    const aliceShot = await play(redis, 't2_alice', 421);
    const bobShot = await play(redis, 't2_bob', 903);

    assert.equal(
      aliceShot.status === 'recorded' ? aliceShot.streak.current : -1,
      12
    );
    assert.equal(
      bobShot.status === 'recorded' ? bobShot.streak.current : -1,
      1,
      "a new account starts at one, whatever anybody else's streak is"
    );

    assert.equal((await stateOf(redis, 't2_alice')).streak.current, 12);
    assert.equal((await stateOf(redis, 't2_bob')).streak.current, 1);
  });

  it('scopes the warm-up flag to one account', async () => {
    const redis = new FakeRedis();
    assert.equal((await stateOf(redis, 't2_alice')).warmupPending, true);
    assert.equal((await stateOf(redis, 't2_bob')).warmupPending, true);

    await markWarmupDone(redis, 't2_alice', DAY);

    assert.equal((await stateOf(redis, 't2_alice')).warmupPending, false);
    assert.equal(
      (await stateOf(redis, 't2_bob')).warmupPending,
      true,
      "Alice finishing her warm-up must not take Bob's"
    );
  });

  it('scopes the warm-up flag to one day as well as one account', async () => {
    const redis = new FakeRedis();
    await markWarmupDone(redis, 't2_alice', DAY);

    assert.equal(
      (await stateOf(redis, 't2_alice', NOON + 86400000)).warmupPending,
      true,
      "Alice's warm-up yesterday must not spend her warm-up today"
    );
    assert.equal(
      (await stateOf(redis, 't2_bob', NOON + 86400000)).warmupPending,
      true
    );
  });

  it('scopes the share record', async () => {
    const redis = new FakeRedis();
    await play(redis, 't2_alice', 421);
    await play(redis, 't2_bob', 903);
    await redis.hSet(keys.userShared('t2_alice', DAY), { url: 'x' });

    assert.equal((await stateOf(redis, 't2_alice')).sharedToday, true);
    assert.equal((await stateOf(redis, 't2_bob')).sharedToday, false);
  });

  it('gives each a distinct place on the board', async () => {
    const redis = new FakeRedis();
    await play(redis, 't2_alice', 421);
    await play(redis, 't2_bob', 903);

    const alice = await stateOf(redis, 't2_alice');
    const bob = await stateOf(redis, 't2_bob');

    assert.equal(alice.myResult?.total, 2);
    assert.equal(bob.myResult?.total, 2);
    assert.notEqual(alice.myResult?.rank, bob.myResult?.rank);
    assert.equal(await redis.zCard(keys.dayScores(DAY)), 2);
  });

  it('separates two accounts that genuinely scored the same', async () => {
    // The cliff case from the playtest: identical scores are legitimate, and
    // the earlier shot must still rank ahead.
    const redis = new FakeRedis();
    const first = await play(redis, 't2_alice', 421);
    const second = await play(redis, 't2_bob', 421);

    assert.equal(first.status, 'recorded');
    assert.equal(second.status, 'recorded');
    if (first.status !== 'recorded' || second.status !== 'recorded') return;
    assert.equal(first.result.score, second.result.score);
    assert.equal(first.result.rank, 1, 'the earlier shot wins the tie');
    assert.equal(second.result.rank, 2);
  });

  it('never writes a key belonging to another account', async () => {
    const redis = new FakeRedis();
    await play(redis, 't2_alice', 421);

    const touched = [
      ...redis.strings.keys(),
      ...redis.hashes.keys(),
      ...redis.zsets.keys(),
    ];
    const foreign = touched.filter(
      (key) => key.startsWith('user:') && !key.startsWith('user:t2_alice')
    );
    assert.deepEqual(foreign, [], `wrote outside its own namespace: ${foreign}`);
  });
});
