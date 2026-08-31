/**
 * The slice of the Devvit Reddit client this game uses.
 *
 * Same reasoning as `redis-port.ts`: the daily post handler and the share
 * endpoint are logic worth testing, and neither should need a live subreddit to
 * run. The route layer adapts the real client to this port.
 */

/** Thing ids are branded template literals on the platform. */
export type ThingId = `t1_${string}` | `t3_${string}`;

const isThingId = (id: string): id is ThingId =>
  id.startsWith('t1_') || id.startsWith('t3_');

/**
 * Narrows a string read back out of Redis to a thing id.
 *
 * A validated guard rather than a cast: a malformed id fails here, where it can
 * be reported, instead of inside the Reddit API.
 */
export const asThingId = (id: string): ThingId | null =>
  isThingId(id) ? id : null;

export type CreatedPost = { readonly id: string };

export type CreatedComment = {
  readonly id: string;
  readonly permalink: string;
  distinguish(makeSticky?: boolean): Promise<void>;
};

export type SubmitPostOptions = {
  readonly subredditName: string;
  readonly title: string;
  /** Entrypoint name from `devvit.json`; `default` is the feed card. */
  readonly entry: string;
  readonly postData: Record<string, string | number | boolean>;
  readonly textFallback: { readonly text: string };
};

export type SubmitCommentOptions = {
  readonly id: ThingId;
  readonly text: string;
  readonly runAs: 'USER' | 'APP';
};

export type RedditLike = {
  submitCustomPost(options: SubmitPostOptions): Promise<CreatedPost>;
  submitComment(options: SubmitCommentOptions): Promise<CreatedComment>;
};
