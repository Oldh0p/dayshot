import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { context } from '@devvit/web/server';

import { ensureDailyPost } from '../core/post.ts';
import { currentSubreddit, nonce, now, redditApi, store } from '../platform.ts';

export const menu = new Hono();

/**
 * `[DEV] Create today's post`.
 *
 * Runs the daily handler on demand so a playtest does not have to wait for
 * midnight. Deliberately the *same* code path as the cron, including its
 * idempotency: if today's post already exists it navigates there and says so,
 * because that is what the scheduler would do too.
 */
menu.post('/create-today', async (c) => {
  const subredditName = currentSubreddit();
  if (!subredditName) {
    return c.json<UiResponse>({ showToast: 'No subreddit in context' }, 400);
  }

  try {
    const outcome = await ensureDailyPost({
      redis: store,
      reddit: redditApi,
      subredditName,
      now,
      nonce,
    });

    if (!outcome.postId) {
      return c.json<UiResponse>(
        { showToast: `Day #${outcome.displayDay}: ${outcome.reason ?? 'no post'}` },
        200
      );
    }

    return c.json<UiResponse>(
      {
        showToast: outcome.created
          ? `Created DAYSHOT #${outcome.displayDay}`
          : `DAYSHOT #${outcome.displayDay} already exists`,
        navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${outcome.postId.replace('t3_', '')}`,
      },
      200
    );
  } catch (error) {
    console.error('[menu] dev-create-today failed', error);
    return c.json<UiResponse>({ showToast: 'Failed to create post' }, 400);
  }
});
