import { Hono } from 'hono';
import type { OnAppInstallRequest, TriggerResponse } from '@devvit/web/shared';

import { ensureDailyPost } from '../core/post.ts';
import { currentSubreddit, nonce, now, redditApi, store } from '../platform.ts';

export const triggers = new Hono();

/**
 * Installing the app mid-day should not mean waiting until midnight for the
 * first post. Same handler as the cron, so the day it creates is the day the
 * scheduler would have created.
 */
triggers.post('/on-app-install', async (c) => {
  const input = await c.req.json<OnAppInstallRequest>();
  const subredditName = currentSubreddit();

  if (!subredditName) {
    return c.json<TriggerResponse>(
      { status: 'error', message: 'No subreddit in context' },
      400
    );
  }

  try {
    const outcome = await ensureDailyPost({
      redis: store,
      reddit: redditApi,
      subredditName,
      now,
      nonce,
    });
    return c.json<TriggerResponse>(
      {
        status: 'success',
        message:
          `ONE SHOT #${outcome.displayDay} ` +
          `${outcome.created ? 'created' : 'already present'} in ` +
          `${subredditName} (trigger: ${input.type})`,
      },
      200
    );
  } catch (error) {
    console.error('[install] failed to create the first post', error);
    return c.json<TriggerResponse>(
      { status: 'error', message: 'Failed to create post' },
      400
    );
  }
});
