import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ensureDayMeta } from '../server/core/day.ts';
import * as keys from '../server/core/keys.ts';
import { ensureDailyPost } from '../server/core/post.ts';
import { shareShot } from '../server/core/share.ts';
import { submitShot } from '../server/core/shot.ts';
import { dailyPostTitle, shareFormatB } from '../shared/copy.ts';
import { generateLevel } from '../shared/sim.ts';
import { LAUNCH_DAY } from '../shared/tunables.ts';
import { FakeRedis } from './fake-redis.ts';
import { FakeReddit } from './fake-reddit.ts';

const DAY = LAUNCH_DAY + 90;
const MIDNIGHT = DAY * 86400000;
const NOON = MIDNIGHT + 12 * 3600000;

let counter = 0;
const nonce = (): string => `daily-nonce-${counter++}`;

const dailyDeps = (
  redis: FakeRedis,
  reddit: FakeReddit,
  at = MIDNIGHT
) => ({
  redis,
  reddit,
  subredditName: 'OneShotGame',
  now: () => at,
  nonce,
});

describe('ensureDailyPost', () => {
  it('creates the post with the contractual title', async () => {
    const redis = new FakeRedis();
    const reddit = new FakeReddit();

    const outcome = await ensureDailyPost(dailyDeps(redis, reddit));
    assert.equal(outcome.created, true);
    assert.equal(reddit.posts.length, 1);

    const meta = await ensureDayMeta(redis, DAY);
    const level = generateLevel(DAY, meta.rerollK);
    assert.equal(
      reddit.posts[0]?.title,
      dailyPostTitle(outcome.displayDay, level.modifier)
    );
    assert.equal(reddit.posts[0]?.entry, 'default');
    assert.equal(reddit.posts[0]?.subredditName, 'OneShotGame');
  });

  it('never puts the day\'s answer in the feed card', async () => {
    const redis = new FakeRedis();
    const reddit = new FakeReddit();
    await ensureDailyPost(dailyDeps(redis, reddit));

    const postData = JSON.stringify(reddit.posts[0]?.postData ?? {});
    for (const leak of ['distance', 'wind', 'angle', 'gust', 'height']) {
      assert.ok(
        !postData.toLowerCase().includes(leak),
        `postData leaked ${leak}: ${postData}`
      );
    }
    // Under the platform's 2 KB ceiling, with room to spare.
    assert.ok(postData.length < 1024);
  });

  it('posts and stickies the seed comment', async () => {
    const redis = new FakeRedis();
    const reddit = new FakeReddit();
    await ensureDailyPost(dailyDeps(redis, reddit));

    assert.equal(reddit.comments.length, 1);
    const seed = reddit.comments[0];
    assert.ok(seed);
    assert.equal(seed.parentId, reddit.posts[0]?.id);
    assert.equal(seed.runAs, 'APP');
    assert.equal(seed.sticky, true);
    assert.equal(seed.distinguished, true);
    assert.match(seed.text, /^Day #\d+ — .+\. Post your score below\./);

    const meta = await ensureDayMeta(redis, DAY);
    assert.equal(meta.seedCommentId, seed.id);
  });

  it('is idempotent, whichever entry point runs it', async () => {
    const redis = new FakeRedis();
    const reddit = new FakeReddit();

    const first = await ensureDailyPost(dailyDeps(redis, reddit));
    const second = await ensureDailyPost(dailyDeps(redis, reddit));
    const third = await ensureDailyPost(dailyDeps(redis, reddit, NOON));

    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(third.created, false);
    assert.equal(second.postId, first.postId);
    assert.equal(third.postId, first.postId);
    assert.equal(reddit.posts.length, 1);
    assert.equal(reddit.comments.length, 1);
  });

  it('creates exactly one post when the cron and a moderator race', async () => {
    const redis = new FakeRedis(1);
    const reddit = new FakeReddit();

    const outcomes = await Promise.all(
      Array.from({ length: 5 }, () => ensureDailyPost(dailyDeps(redis, reddit)))
    );

    assert.equal(outcomes.filter((o) => o.created).length, 1);
    assert.equal(reddit.posts.length, 1);
  });

  it('releases the claim when Reddit refuses, so the next run can retry', async () => {
    const redis = new FakeRedis();
    const reddit = new FakeReddit();
    reddit.failNextPost = true;

    await assert.rejects(() => ensureDailyPost(dailyDeps(redis, reddit)));
    assert.equal(
      await redis.hGet(keys.dayMeta(DAY), 'postClaim'),
      undefined,
      'a failed attempt must not lock the day out of having a post'
    );

    const retry = await ensureDailyPost(dailyDeps(redis, reddit));
    assert.equal(retry.created, true);
    assert.equal(reddit.posts.length, 1);
  });

  it('freezes yesterday when the new day opens', async () => {
    const redis = new FakeRedis();
    const reddit = new FakeReddit();
    await ensureDayMeta(redis, DAY - 1);

    await ensureDailyPost(dailyDeps(redis, reddit));
    assert.equal(await redis.hGet(keys.dayMeta(DAY - 1), 'frozen'), '1');
  });

  it('quotes yesterday in the seed comment when there is something to quote', async () => {
    const redis = new FakeRedis();
    const reddit = new FakeReddit();

    // Someone played yesterday.
    await submitShot(
      { redis, now: () => (DAY - 1) * 86400000 + 3600000, nonce },
      {
        userId: 't2_alice',
        username: 'alice',
        claimedDay: DAY - 1,
        holdMs: 640,
        clientScore: 0,
      }
    );

    await ensureDailyPost(dailyDeps(redis, reddit));
    const seed = reddit.comments[0]?.text ?? '';
    assert.match(seed, /Perfect/);
  });

  it('says nothing about yesterday on the very first day', async () => {
    const redis = new FakeRedis();
    const reddit = new FakeReddit();
    await ensureDailyPost(dailyDeps(redis, reddit));
    const seed = reddit.comments[0]?.text ?? '';
    assert.equal(seed.endsWith('Post your score below.'), true);
  });
});

describe('shareShot', () => {
  const setup = async () => {
    const redis = new FakeRedis();
    const reddit = new FakeReddit();
    await ensureDailyPost(dailyDeps(redis, reddit));
    await submitShot(
      { redis, now: () => NOON, nonce },
      {
        userId: 't2_alice',
        username: 'alice',
        claimedDay: DAY,
        holdMs: 640,
        clientScore: 0,
      }
    );
    return { redis, reddit };
  };

  it('replies to the stickied seed comment, as the user', async () => {
    const { redis, reddit } = await setup();
    const meta = await ensureDayMeta(redis, DAY);

    const outcome = await shareShot(
      { redis, reddit, now: () => NOON },
      't2_alice'
    );
    assert.equal(outcome.status, 'posted');

    const card = reddit.comments[1];
    assert.ok(card);
    assert.equal(card.parentId, meta.seedCommentId);
    assert.equal(card.runAs, 'USER');
  });

  it('publishes Format B built from the server\'s own record', async () => {
    const { redis, reddit } = await setup();
    const meta = await ensureDayMeta(redis, DAY);
    const level = generateLevel(DAY, meta.rerollK);

    const outcome = await shareShot(
      { redis, reddit, now: () => NOON },
      't2_alice'
    );
    assert.equal(outcome.status, 'posted');
    if (outcome.status !== 'posted') return;

    const stored = JSON.parse(
      (await redis.hGet(keys.userPlayed('t2_alice', DAY), 'shot')) ?? '{}'
    );
    assert.equal(
      outcome.card,
      shareFormatB({
        displayDay: DAY - LAUNCH_DAY + 1,
        modifier: level.modifier,
        windBase: level.windBase,
        score: stored.score,
        percentile: 100,
        streak: 1,
        signedDx: stored.signedDx,
      })
    );
    assert.equal(reddit.comments[1]?.text, outcome.card);
  });

  it('never publishes the power that produced the shot', async () => {
    const { redis, reddit } = await setup();
    const outcome = await shareShot(
      { redis, reddit, now: () => NOON },
      't2_alice'
    );
    assert.equal(outcome.status, 'posted');
    const text = reddit.comments[1]?.text ?? '';
    assert.ok(!/hold|power|ms\b/i.test(text), text);
  });

  it('posts once, however many times the button is pressed', async () => {
    const { redis, reddit } = await setup();

    const outcomes = await Promise.all([
      shareShot({ redis, reddit, now: () => NOON }, 't2_alice'),
      shareShot({ redis, reddit, now: () => NOON }, 't2_alice'),
      shareShot({ redis, reddit, now: () => NOON }, 't2_alice'),
    ]);

    assert.equal(outcomes.filter((o) => o.status === 'posted').length, 1);
    assert.equal(reddit.comments.length, 2, 'seed comment plus one card');

    const again = await shareShot(
      { redis, reddit, now: () => NOON },
      't2_alice'
    );
    assert.equal(again.status, 'already_shared');
    assert.match(
      again.status === 'already_shared' ? again.commentUrl : '',
      /^https:\/\/reddit\.com/
    );
  });

  it('remembers the consent so it is only asked once', async () => {
    const { redis, reddit } = await setup();
    await shareShot({ redis, reddit, now: () => NOON }, 't2_alice');
    assert.equal(
      await redis.hGet(keys.user('t2_alice'), 'shareConsent'),
      '1'
    );
  });

  it('refuses to share a shot that was never taken', async () => {
    const { redis, reddit } = await setup();
    const outcome = await shareShot(
      { redis, reddit, now: () => NOON },
      't2_stranger'
    );
    assert.equal(outcome.status, 'not_played');
    assert.equal(reddit.comments.length, 1);
  });

  it('lets the player retry when Reddit refuses the comment', async () => {
    const { redis, reddit } = await setup();
    reddit.failNextComment = true;

    await assert.rejects(() =>
      shareShot({ redis, reddit, now: () => NOON }, 't2_alice')
    );

    const retry = await shareShot(
      { redis, reddit, now: () => NOON },
      't2_alice'
    );
    assert.equal(retry.status, 'posted');
  });
});
