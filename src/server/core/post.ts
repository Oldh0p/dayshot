import {
  dailyPostTitle,
  MODIFIER_EMOJI,
  MODIFIER_LABEL,
  seedComment,
  splashDescription,
  type YesterdayStats,
} from '../../shared/copy.ts';
import { generateLevel } from '../../shared/sim.ts';
import { dayNumberAt } from './clock.ts';
import {
  attachPost,
  attachSeedComment,
  displayDayFrom,
  ensureDayMeta,
  freezeDay,
  resolveAnchorDay,
} from './day.ts';
import * as keys from './keys.ts';
import { decodeScore } from './ranking.ts';
import { asThingId, type RedditLike } from './reddit-port.ts';
import type { RedisLike } from './redis-port.ts';

/**
 * The daily post (GDD 9.6).
 *
 * Runs from the `0 0 * * *` UTC cron, from the app-install trigger, and from
 * the `[DEV] Create today's post` moderator action. All three take exactly the
 * same path, which is the point: the thing a moderator triggers by hand during
 * a playtest is the thing that runs at midnight, not a parallel implementation
 * of it.
 */

export type DailyDeps = {
  readonly redis: RedisLike;
  readonly reddit: RedditLike;
  readonly subredditName: string;
  readonly now: () => number;
  readonly nonce: () => string;
};

export type DailyOutcome = {
  readonly dayNumber: number;
  readonly displayDay: number;
  readonly postId: string | null;
  readonly created: boolean;
  readonly reason?: string;
};

/** Reads yesterday's numbers for the seed comment's headline. */
const readYesterday = async (
  redis: RedisLike,
  dayNumber: number
): Promise<YesterdayStats | null> => {
  const previous = dayNumber - 1;
  const [meta, shots, topRows] = await Promise.all([
    redis.hGetAll(keys.dayMeta(previous)),
    redis.zCard(keys.dayScores(previous)),
    redis.zRange(keys.dayScores(previous), 0, 0, {
      by: 'rank',
      reverse: true,
    }),
  ]);

  if (shots === 0) return null;
  const topRow = topRows[0];
  return {
    perfects: Number(meta['perfects'] ?? '0'),
    topScore: topRow ? decodeScore(topRow.score) : 0,
    shots,
  };
};

/**
 * Creates today's post if it does not exist yet.
 *
 * A `postClaim` field taken with `hSetNX` gates creation, so the cron and a
 * moderator pressing the dev action at the same second cannot produce two posts
 * for one day. The claim is released if creation throws, otherwise the day
 * would be permanently unable to retry.
 */
export const ensureDailyPost = async (
  deps: DailyDeps
): Promise<DailyOutcome> => {
  const { redis, reddit, subredditName, now, nonce } = deps;

  const at = now();
  const dayNumber = dayNumberAt(at);
  // Claimed on the very first post this installation makes, so the first one
  // reads #1 whenever review happens to land.
  const displayDay = displayDayFrom(
    dayNumber,
    await resolveAnchorDay(redis, dayNumber)
  );
  const meta = await ensureDayMeta(redis, dayNumber);

  if (meta.postId) {
    return {
      dayNumber,
      displayDay,
      postId: meta.postId,
      created: false,
      reason: 'already exists',
    };
  }

  const claimed = await redis.hSetNX(
    keys.dayMeta(dayNumber),
    'postClaim',
    nonce()
  );
  if (claimed !== 1) {
    const existing = await redis.hGet(keys.dayMeta(dayNumber), 'postId');
    return {
      dayNumber,
      displayDay,
      postId: existing ?? null,
      created: false,
      reason: 'creation already in flight',
    };
  }

  const level = generateLevel(dayNumber, meta.rerollK);

  try {
    const post = await reddit.submitCustomPost({
      subredditName,
      title: dailyPostTitle(displayDay, level.modifier),
      entry: 'default',
      // Under 2 KB, and it is sent to every client: nothing about the level's
      // parameters may go in here or the day's answer travels with the card.
      postData: {
        dayNumber,
        displayDay,
        rerollK: meta.rerollK,
        modifier: level.modifier,
        modifierLabel: MODIFIER_LABEL[level.modifier],
        modifierEmoji: MODIFIER_EMOJI[level.modifier],
      },
      textFallback: { text: splashDescription(level.modifier) },
    });

    await attachPost(redis, dayNumber, post.id);

    const parent = asThingId(post.id);
    if (parent) {
      const yesterday = await readYesterday(redis, dayNumber);
      const comment = await reddit.submitComment({
        id: parent,
        text: seedComment(displayDay, level.modifier, yesterday),
        runAs: 'APP',
      });
      // Stickied on purpose: score cards are posted as replies to it, which
      // keeps a hundred near-identical comments out of the main thread and is
      // the pattern Reddit requires for user-attributed score comments.
      await comment.distinguish(true);
      await attachSeedComment(redis, dayNumber, comment.id);
    }

    await freezeDay(redis, dayNumber - 1);

    return { dayNumber, displayDay, postId: post.id, created: true };
  } catch (error) {
    // Release the claim so the next run can try again rather than leaving the
    // day permanently postless.
    await redis.hDel(keys.dayMeta(dayNumber), ['postClaim']);
    throw error;
  }
};
