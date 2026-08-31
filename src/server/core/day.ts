import { generateLevel, resolveRerollK } from '../../shared/sim.ts';
import { DAY_TTL_S } from '../../shared/tunables.ts';
import type { ModifierId } from '../../shared/types.ts';
import * as keys from './keys.ts';
import type { RedisLike } from './redis-port.ts';

/**
 * The shared facts about a UTC day: which seed variant everyone plays, which
 * post it lives under, and the running counters the result screen reads.
 */
export type DayMeta = {
  readonly dayNumber: number;
  readonly rerollK: number;
  readonly postId: string | null;
  readonly seedCommentId: string | null;
  readonly shots: number;
  readonly perfects: number;
  readonly topScore: number;
  readonly tomorrowModifier: ModifierId;
  readonly frozen: boolean;
};

const parseNumber = (raw: string | undefined, fallback: number): number => {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
};

const parseMeta = (
  dayNumber: number,
  hash: Record<string, string>,
  fallbackTomorrow: ModifierId
): DayMeta => ({
  dayNumber,
  rerollK: parseNumber(hash['rerollK'], 0),
  postId: hash['postId'] ?? null,
  seedCommentId: hash['seedCommentId'] ?? null,
  shots: parseNumber(hash['shots'], 0),
  perfects: parseNumber(hash['perfects'], 0),
  topScore: parseNumber(hash['topScore'], 0),
  tomorrowModifier: (hash['tomorrowModifier'] as ModifierId) ?? fallbackTomorrow,
  frozen: hash['frozen'] === '1',
});

/**
 * Reads a day's meta, computing and persisting it the first time it is asked
 * for.
 *
 * The expensive part is the validity guard-rail of GDD 9.3: sweep the whole
 * gauge and, if no release can reach a Bullseye, reroll the seed with a salt
 * until one can. That has to happen exactly once per day and the answer has to
 * be shared, because every client generates its own level from `dayNumber` plus
 * this `rerollK` — two clients disagreeing about `k` would be two different
 * games.
 *
 * `hSetNX` makes the first writer win, so a burst of cold requests at midnight
 * converges on one value instead of racing. Tomorrow's modifier is resolved and
 * cached at the same time: the teaser has to name the modifier the player will
 * actually get, which means resolving tomorrow's reroll too (GDD M8).
 *
 * The sweep costs about a thousand simulations, a few milliseconds against a
 * 30-second request budget.
 */
export const ensureDayMeta = async (
  redis: RedisLike,
  dayNumber: number
): Promise<DayMeta> => {
  const key = keys.dayMeta(dayNumber);
  const existing = await redis.hGetAll(key);

  if (existing['rerollK'] !== undefined) {
    return parseMeta(dayNumber, existing, tomorrowModifierFor(dayNumber));
  }

  const rerollK = resolveRerollK(dayNumber);
  const tomorrow = tomorrowModifierFor(dayNumber);

  await redis.hSetNX(key, 'rerollK', String(rerollK));
  await redis.hSetNX(key, 'tomorrowModifier', tomorrow);
  await redis.expire(key, DAY_TTL_S);

  const settled = await redis.hGetAll(key);
  return parseMeta(dayNumber, settled, tomorrow);
};

/**
 * The modifier a player will meet tomorrow.
 *
 * Resolving tomorrow's reroll as well is what keeps the teaser honest: a reroll
 * changes the seed, and with it the modifier, so reading it off `k = 0` could
 * promise a Moon Gravity day that never arrives.
 */
export const tomorrowModifierFor = (dayNumber: number): ModifierId =>
  generateLevel(dayNumber + 1, resolveRerollK(dayNumber + 1)).modifier;

/** Records the post a day's players should be commenting under. */
export const attachPost = async (
  redis: RedisLike,
  dayNumber: number,
  postId: string
): Promise<boolean> => {
  const written = await redis.hSetNX(
    keys.dayMeta(dayNumber),
    'postId',
    postId
  );
  return written === 1;
};

export const attachSeedComment = async (
  redis: RedisLike,
  dayNumber: number,
  commentId: string
): Promise<void> => {
  await redis.hSetNX(keys.dayMeta(dayNumber), 'seedCommentId', commentId);
};

/**
 * Closes yesterday's books so the seed comment can quote a stable number even
 * as late shots trickle in through the grace window.
 */
export const freezeDay = async (
  redis: RedisLike,
  dayNumber: number
): Promise<void> => {
  await redis.hSet(keys.dayMeta(dayNumber), { frozen: '1' });
};
