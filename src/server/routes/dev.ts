import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { context, reddit, scheduler } from '@devvit/web/server';

import { dayNumberAt } from '../core/clock.ts';
import * as keys from '../core/keys.ts';
import {
  decodeScore,
  encodeCompositeScore,
  rankFromAscending,
} from '../core/ranking.ts';
import { now, store } from '../platform.ts';

/**
 * Moderator-only probes, used to answer the platform questions of GDD 9.13
 * during a playtest without waiting for midnight or guessing from the docs.
 *
 * **These must be removed from `devvit.json` before publishing.** They are
 * behind `forUserType: "moderator"`, but a shipped game has no business
 * carrying scheduler triggers and Redis self-checks in its menu.
 */
export const dev = new Hono();

const toast = (text: string): UiResponse => ({ showToast: text });

/**
 * Fires the daily scheduler task two minutes from now.
 *
 * Proves the whole scheduler pipeline — declaration, dispatch, handler — without
 * waiting for 00:00 UTC. It does not prove the *cron expression* is read as UTC;
 * only tomorrow's log can do that. Press once to arm, once again after two
 * minutes to read the counter back.
 */
dev.post('/schedule-daily', async (c) => {
  const dayNumber = dayNumberAt(now());
  const fired = await store.hGet(keys.dayStats(dayNumber), 'scheduler_fired');

  try {
    await scheduler.runJob({
      name: 'daily-post-once',
      runAt: new Date(now() + 120_000),
      data: { source: 'dev-menu' },
    });
    return c.json<UiResponse>(
      toast(
        `Armed for +2 min. Scheduler has fired ${fired ?? '0'} time(s) today.`
      ),
      200
    );
  } catch (error) {
    console.error('[dev] could not schedule the one-off task', error);
    return c.json<UiResponse>(toast('Could not schedule the task'), 400);
  }
});

/**
 * Writes a probe value into the post's `postData`.
 *
 * Answers GDD 9.13.2: does an updated `postData` reach the feed card without a
 * new post? The splash renders `devProbe` as a small line when it is present and
 * nothing at all when it is not, so the product card stays free of it.
 */
dev.post('/refresh-splash', async (c) => {
  const postId = context.postId;
  if (!postId) return c.json<UiResponse>(toast('Open this from a post'), 400);

  try {
    const post = await reddit.getPostById(postId);
    const current = context.postData ?? {};
    const stamp = new Date(now()).toISOString().slice(11, 19);
    await post.setPostData({ ...current, devProbe: stamp });
    return c.json<UiResponse>(
      toast(`postData set to ${stamp} — now check the feed card`),
      200
    );
  } catch (error) {
    console.error('[dev] setPostData failed', error);
    return c.json<UiResponse>(toast('setPostData failed — see logs'), 400);
  }
});

/**
 * Self-check for the one Redis assumption the whole leaderboard rests on.
 *
 * `zRank` is documented as the *ascending* index and there is no `zRevRank`, so
 * every rank in the game is `zCard - zRank`. The in-memory fake reproduces that,
 * but the fake is only as right as my reading of the docs. This writes five
 * known members to a scratch key, checks the ordering and the ranks against what
 * the fake would say, then deletes the key. It never touches a real day.
 */
dev.post('/verify-redis', async (c) => {
  const key = `dev:ranking-check:${now()}`;
  const failures: string[] = [];

  try {
    // Scores chosen so the composite ordering and the plain ordering differ:
    // p1 and p3 tie on score and must be separated by arrival order.
    const members = [
      { id: 'p0', score: 99.94, seq: 5 },
      { id: 'p1', score: 72.5, seq: 1 },
      { id: 'p2', score: 12.0, seq: 3 },
      { id: 'p3', score: 72.5, seq: 2 },
      { id: 'p4', score: 100, seq: 4 },
    ];
    for (const m of members) {
      await store.zAdd(key, {
        member: m.id,
        score: encodeCompositeScore(m.score, m.seq),
      });
    }

    const total = await store.zCard(key);
    if (total !== 5) failures.push(`zCard=${total}, expected 5`);

    const descending = await store.zRange(key, 0, 4, {
      by: 'rank',
      reverse: true,
    });
    const order = descending.map((row) => row.member).join(',');
    // p4 (100) then p0 (99.94) then the tie, earlier seq first, then p2.
    if (order !== 'p4,p0,p1,p3,p2') {
      failures.push(`reverse rank order was ${order}, expected p4,p0,p1,p3,p2`);
    }

    const decoded = descending[0] ? decodeScore(descending[0].score) : -1;
    if (decoded !== 100) failures.push(`decoded top score ${decoded}`);

    const ascending = await store.zRank(key, 'p0');
    if (ascending === undefined) {
      failures.push('zRank returned undefined for a present member');
    } else {
      const rank = rankFromAscending(ascending, total);
      if (rank !== 2) {
        failures.push(`zRank put p0 at rank ${rank}, expected 2`);
      }
    }

    const missing = await store.zRank(key, 'nobody');
    if (missing !== undefined) {
      failures.push(`zRank returned ${missing} for an absent member`);
    }

    const window = await store.zRange(key, 1, 3, { by: 'rank', reverse: true });
    if (window.map((r) => r.member).join(',') !== 'p0,p1,p3') {
      failures.push('a ranked window did not slice as expected');
    }

    return c.json<UiResponse>(
      toast(
        failures.length === 0
          ? 'Redis ranking OK — zRank ascending, reverse window exact'
          : `FAIL: ${failures.join(' | ')}`
      ),
      200
    );
  } catch (error) {
    console.error('[dev] redis ranking check threw', error);
    return c.json<UiResponse>(toast('Redis check threw — see logs'), 400);
  } finally {
    await store.del(key);
  }
});

/**
 * Forgets which post belongs to today, so `[DEV] Create today's post` will make
 * a fresh one.
 *
 * `ensureDailyPost` is idempotent by design, which is right in production and
 * painful during a playtest: iterating on the title or the seed comment
 * otherwise means waiting for the next UTC day. It clears the binding only —
 * scores, streaks and the day's seed are untouched, and the old post stays on
 * Reddit for you to delete by hand.
 */
dev.post('/unbind-post', async (c) => {
  const dayNumber = dayNumberAt(now());
  const previous = await store.hGet(keys.dayMeta(dayNumber), 'postId');

  await store.hDel(keys.dayMeta(dayNumber), [
    'postId',
    'seedCommentId',
    'postClaim',
  ]);

  return c.json<UiResponse>(
    toast(
      previous
        ? `Unbound ${previous}. Create today's post again for a fresh one.`
        : 'Today had no post bound.'
    ),
    200
  );
});
