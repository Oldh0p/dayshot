import { Hono } from 'hono';
import type { TaskRequest, TaskResponse } from '@devvit/web/server';

import { ensureDailyPost } from '../core/post.ts';
import { currentSubreddit, nonce, now, redditApi, store } from '../platform.ts';

export const schedulerRoutes = new Hono();

/**
 * The daily task, declared in `devvit.json` with `cron: "0 0 * * *"`.
 *
 * Devvit cron strings are UTC, which is exactly the rollover the game runs on
 * (GDD M10): one reset for the whole planet, at a constant hour, because the
 * rendezvous only works if it never moves.
 */
schedulerRoutes.post('/daily', async (c) => {
  const input = await c.req.json<TaskRequest>();
  const subredditName = currentSubreddit();

  if (!subredditName) {
    console.error(`[daily] task "${input.name}" ran without a subreddit`);
    return c.json<TaskResponse>({}, 200);
  }

  try {
    const outcome = await ensureDailyPost({
      redis: store,
      reddit: redditApi,
      subredditName,
      now,
      nonce,
    });
    console.log(
      `[daily] day ${outcome.dayNumber} (#${outcome.displayDay}) ` +
        `post=${outcome.postId ?? 'none'} created=${outcome.created}` +
        (outcome.reason ? ` reason=${outcome.reason}` : '')
    );
  } catch (error) {
    // Never throw out of a scheduled task: the platform would retry blindly and
    // the claim released in ensureDailyPost already makes the next run safe.
    console.error('[daily] failed to create the post', error);
  }

  return c.json<TaskResponse>({}, 200);
});
