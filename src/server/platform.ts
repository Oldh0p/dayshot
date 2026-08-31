import { context, reddit, redis } from '@devvit/web/server';

import type {
  CreatedComment,
  CreatedPost,
  RedditLike,
  SubmitCommentOptions,
  SubmitPostOptions,
} from './core/reddit-port.ts';
import type { RedisLike } from './core/redis-port.ts';

/**
 * The seam between Devvit and the game.
 *
 * Everything below `core/` is written against the two narrow ports; this file
 * is the only place that knows they are backed by a real platform. If Devvit's
 * surface drifts, the breakage shows up here at compile time rather than at
 * midnight in production.
 */

/** Structural check: the platform client must still satisfy the port. */
export const store: RedisLike = redis;

export const redditApi: RedditLike = {
  async submitCustomPost(options: SubmitPostOptions): Promise<CreatedPost> {
    return reddit.submitCustomPost({
      subredditName: options.subredditName,
      title: options.title,
      entry: options.entry,
      postData: options.postData,
      textFallback: options.textFallback,
    });
  },

  async submitComment(
    options: SubmitCommentOptions
  ): Promise<CreatedComment> {
    return reddit.submitComment({
      id: options.id,
      text: options.text,
      runAs: options.runAs,
    });
  },
};

/** Unique per attempt, which is what makes the daily lock's read-back exact. */
let nonceCounter = 0;
export const nonce = (): string =>
  `${Date.now().toString(36)}-${(nonceCounter++).toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;

export const now = (): number => Date.now();

/**
 * The subreddit the app is installed in. Present in every context the game
 * runs from: request, trigger, scheduler and menu action.
 */
export const currentSubreddit = (): string | null =>
  context.subredditName ?? null;
