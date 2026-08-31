import { Hono } from 'hono';
import type {
  OnAppInstallRequest,
  OnCommentDeleteRequest,
  TriggerResponse,
} from '@devvit/web/shared';

import { forgetSharedComment } from '../core/share.ts';
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
          `DAYSHOT #${outcome.displayDay} ` +
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

/**
 * A deleted score card must stop existing in the app too.
 *
 * Devvit's rules are explicit: on a comment-delete event the app has to drop
 * everything it holds about that comment. All this game keeps is a permalink,
 * recorded so the button can say "Already posted today" -- so forgetting it both
 * satisfies the rule and gives the player their share back, which is the
 * behaviour they were expecting when they deleted it.
 */
triggers.post('/on-comment-delete', async (c) => {
  const input = await c.req.json<OnCommentDeleteRequest>();
  const commentId = input.commentId;
  if (!commentId) return c.json<TriggerResponse>({ status: 'success' }, 200);

  try {
    const forgotten = await forgetSharedComment(store, commentId);
    return c.json<TriggerResponse>(
      {
        status: 'success',
        message: forgotten
          ? `Forgot the share record for ${commentId}`
          : `Nothing stored for ${commentId}`,
      },
      200
    );
  } catch (error) {
    console.error('[trigger] comment delete cleanup failed', error);
    return c.json<TriggerResponse>(
      { status: 'error', message: 'Cleanup failed' },
      400
    );
  }
});
