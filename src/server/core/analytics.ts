import { DAY_TTL_S } from '../../shared/tunables.ts';
import type { AnalyticsEvent } from '../../shared/types.ts';
import * as keys from './keys.ts';
import type { RedisLike } from './redis-port.ts';

/**
 * Aggregated daily counters (GDD 9.10).
 *
 * Deliberately dumb: one hash per day, one field per event or bucketed
 * dimension, `hIncrBy` to move it. Nothing is stored per player beyond what the
 * game already needs to run, and no free-form text from the client ever becomes
 * a key.
 */

/** The only event names the client may report. Anything else is dropped. */
export const ALLOWED_EVENTS: readonly string[] = [
  'launch',
  'warmup_start',
  'warmup_complete',
  'aim_start',
  'shot_submitted',
  'shot_scored',
  'result_viewed',
  'share_comment',
  'share_copy',
  'practice_shot',
  /*
   * The feed card's three (§17). `inline_view` is throttled to once per session
   * per post by the client, because a feed impression fires as the card scrolls
   * past and an unthrottled counter would measure scrolling rather than
   * reading. `expand_click` over `inline_view` is the launch rate the whole
   * redesign is a bet on.
   */
  'inline_view',
  'expand_click',
  'leaderboard_open',
  'subscribe_prompt_shown',
  'subscribe_prompt_accepted',
  'error_network',
  'error_submit',
  'error_render',
];

/** Props are bucketed to short slugs; anything longer is a client bug. */
const SAFE_VALUE = /^[a-z0-9_.:+-]{1,24}$/;
const MAX_PROPS = 4;

export const bump = async (
  redis: RedisLike,
  dayNumber: number,
  field: string,
  by = 1
): Promise<void> => {
  await redis.hIncrBy(keys.dayStats(dayNumber), field, by);
};

/** Buckets a score into the ten-point bands the health dashboard reads. */
export const scoreBucket = (score: number): string => {
  if (score >= 100) return '100';
  const band = Math.floor(score / 10) * 10;
  return `${band}-${band + 9}`;
};

/** Buckets a hold into quarter-second bands, never the raw value. */
export const holdBucket = (holdMs: number): string => {
  const band = Math.floor(holdMs / 250) * 250;
  return `${band}`;
};

export const record = async (
  redis: RedisLike,
  dayNumber: number,
  event: AnalyticsEvent
): Promise<boolean> => {
  if (!ALLOWED_EVENTS.includes(event.name)) return false;

  await bump(redis, dayNumber, event.name);

  const props = Object.entries(event.props ?? {}).slice(0, MAX_PROPS);
  for (const [key, value] of props) {
    const slug = String(value).toLowerCase();
    if (!SAFE_VALUE.test(key) || !SAFE_VALUE.test(slug)) continue;
    await bump(redis, dayNumber, `${event.name}:${key}:${slug}`);
  }

  await redis.expire(keys.dayStats(dayNumber), DAY_TTL_S);
  return true;
};
