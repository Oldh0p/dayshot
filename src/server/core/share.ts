import { shareFormatB } from '../../shared/copy.ts';
import { generateLevel } from '../../shared/sim.ts';
import { DAY_TTL_S } from '../../shared/tunables.ts';
import { dayNumberAt, displayDayFor } from './clock.ts';
import { ensureDayMeta } from './day.ts';
import * as keys from './keys.ts';
import { asThingId, type RedditLike } from './reddit-port.ts';
import type { RedisLike } from './redis-port.ts';
import { readStoredShot, summarise } from './shot.ts';
import { readUser } from './user.ts';

/**
 * `POST MY SHOT` (GDD 9.6, IV.17).
 *
 * The card is rebuilt from the server's own record of the shot, never from
 * anything the client sends — the whole point of a share is that it is a claim
 * about a score, so it has to be the server's claim.
 *
 * It is posted as a reply to the day's stickied seed comment. That is a Reddit
 * review requirement for user-attributed score comments, not a preference: it
 * keeps a hundred near-identical cards folded away instead of burying the
 * conversation under the post.
 */

export type ShareDeps = {
  readonly redis: RedisLike;
  readonly reddit: RedditLike;
  readonly now: () => number;
};

export type ShareOutcome =
  | { readonly status: 'posted'; readonly commentUrl: string; readonly card: string }
  | { readonly status: 'already_shared'; readonly commentUrl: string }
  | { readonly status: 'not_played' }
  | { readonly status: 'no_post' };

const SHARE_STATE = 'state';
const SHARE_URL = 'url';

export const shareShot = async (
  deps: ShareDeps,
  userId: string
): Promise<ShareOutcome> => {
  const { redis, reddit, now } = deps;

  const dayNumber = dayNumberAt(now());
  const stored = await readStoredShot(redis, userId, dayNumber);
  if (!stored) return { status: 'not_played' };

  const meta = await ensureDayMeta(redis, dayNumber);
  const parentRaw = meta.seedCommentId ?? meta.postId;
  const parent = parentRaw ? asThingId(parentRaw) : null;
  if (!parent) return { status: 'no_post' };

  // Claim before posting, so a double tap on a slow connection cannot produce
  // two comments.
  const shareKey = keys.userShared(userId, dayNumber);
  const claimed = await redis.hSetNX(shareKey, SHARE_STATE, 'pending');
  if (claimed !== 1) {
    const url = await redis.hGet(shareKey, SHARE_URL);
    return { status: 'already_shared', commentUrl: url ?? '' };
  }

  try {
    const [summary, user] = await Promise.all([
      summarise(redis, dayNumber, userId, stored),
      readUser(redis, userId),
    ]);
    const level = generateLevel(dayNumber, meta.rerollK);

    const card = shareFormatB({
      displayDay: displayDayFor(dayNumber),
      modifier: level.modifier,
      windBase: level.windBase,
      score: summary.score,
      percentile: summary.percentile,
      streak: user.streak,
      signedDx: stored.signedDx,
      targetR: level.targetR,
    });

    const comment = await reddit.submitComment({
      id: parent,
      text: card,
      runAs: 'USER',
    });

    await redis.hSet(shareKey, {
      [SHARE_STATE]: 'posted',
      [SHARE_URL]: comment.permalink,
    });
    await redis.expire(shareKey, DAY_TTL_S);
    // Reverse index, so a comment-delete event can find what to forget without
    // a user id -- the trigger does not reliably carry one.
    await redis.hSet(keys.sharedIndex(), {
      [comment.id]: `${userId}|${dayNumber}`,
    });
    // Consent is remembered so the dialog is asked once, not every day.
    await redis.hSet(keys.user(userId), { shareConsent: '1' });

    return { status: 'posted', commentUrl: comment.permalink, card };
  } catch (error) {
    await redis.hDel(shareKey, [SHARE_STATE]);
    throw error;
  }
};

/**
 * Drops the record of a published score card.
 *
 * Called from the comment-delete trigger. The app never stores a comment's
 * text, only the permalink it produced, so forgetting that permalink is the
 * whole of what Devvit's deletion rule asks for here — and it lets the player
 * post a fresh card, which is what deleting one usually means they wanted.
 *
 * The index is keyed by comment id so the lookup does not need a user id, which
 * the trigger does not reliably carry.
 */
export const forgetSharedComment = async (
  redis: RedisLike,
  commentId: string
): Promise<boolean> => {
  const owner = await redis.hGet(keys.sharedIndex(), commentId);
  if (!owner) return false;

  const [userId, dayRaw] = owner.split('|');
  const dayNumber = Number(dayRaw);
  if (userId && Number.isFinite(dayNumber)) {
    await redis.del(keys.userShared(userId, dayNumber));
  }
  await redis.hDel(keys.sharedIndex(), [commentId]);
  return true;
};
