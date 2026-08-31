import type { StreakState } from '../../shared/types.ts';
import * as keys from './keys.ts';
import type { RedisLike } from './redis-port.ts';

/** The long-lived per-player record (GDD 9.7). */
export type UserState = {
  readonly firstVisitDone: boolean;
  readonly streak: number;
  readonly longest: number;
  readonly lastPlayedDay: number | null;
  readonly best: number;
  readonly perfects: number;
  readonly bullseyes: number;
  readonly daysPlayed: number;
};

export const EMPTY_USER: UserState = {
  firstVisitDone: false,
  streak: 0,
  longest: 0,
  lastPlayedDay: null,
  best: 0,
  perfects: 0,
  bullseyes: 0,
  daysPlayed: 0,
};

const num = (raw: string | undefined, fallback: number): number => {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
};

export const readUser = async (
  redis: RedisLike,
  userId: string
): Promise<UserState> => {
  const hash = await redis.hGetAll(keys.user(userId));
  if (Object.keys(hash).length === 0) return EMPTY_USER;

  const lastPlayedRaw = hash['lastPlayedDay'];
  return {
    firstVisitDone: hash['firstVisitDone'] === '1',
    streak: num(hash['streak'], 0),
    longest: num(hash['longest'], 0),
    lastPlayedDay:
      lastPlayedRaw === undefined ? null : num(lastPlayedRaw, 0),
    best: num(hash['best'], 0),
    perfects: num(hash['perfects'], 0),
    bullseyes: num(hash['bullseyes'], 0),
    daysPlayed: num(hash['daysPlayed'], 0),
  };
};

export const markWarmupDone = async (
  redis: RedisLike,
  userId: string
): Promise<void> => {
  await redis.hSet(keys.user(userId), { firstVisitDone: '1' });
};

/**
 * The streak once a shot for `dayNumber` is recorded.
 *
 * The streak counts consecutive UTC days on which the player *took* a shot. How
 * good the shot was never enters into it: a 14.20 extends a streak exactly like
 * a 99.80, because the game celebrates showing up and never performance
 * (GDD M7).
 *
 * `justReset` drives the reset copy. It stays false for a lapsed streak of one
 * day, where "Streak reset. Longest: 1" would be noise rather than
 * acknowledgement.
 */
export const streakAfterShot = (
  user: UserState,
  dayNumber: number
): StreakState => {
  const continued = user.lastPlayedDay === dayNumber - 1;
  const current = continued ? user.streak + 1 : 1;
  return {
    current,
    longest: Math.max(user.longest, current),
    justReset:
      !continued &&
      user.lastPlayedDay !== null &&
      user.lastPlayedDay < dayNumber - 1 &&
      user.streak >= 2,
  };
};

/**
 * The streak to show before today's shot.
 *
 * A streak that has not lapsed still stands even though today is unplayed —
 * the player can extend it in the next few seconds. One that has lapsed reads
 * as zero, with the reset copy due.
 */
export const streakForDisplay = (
  user: UserState,
  dayNumber: number,
  playedToday: boolean
): StreakState => {
  if (playedToday || user.lastPlayedDay === dayNumber - 1) {
    return { current: user.streak, longest: user.longest, justReset: false };
  }
  return {
    current: 0,
    longest: user.longest,
    justReset: user.lastPlayedDay !== null && user.streak >= 2,
  };
};

/** Applies a recorded shot to the player's long-lived record. */
export const applyShotToUser = async (
  redis: RedisLike,
  userId: string,
  user: UserState,
  dayNumber: number,
  score: number,
  isPerfect: boolean,
  isBullseye: boolean
): Promise<StreakState> => {
  const streak = streakAfterShot(user, dayNumber);

  await redis.hSet(keys.user(userId), {
    streak: String(streak.current),
    longest: String(streak.longest),
    lastPlayedDay: String(dayNumber),
    best: String(Math.max(user.best, score)),
    perfects: String(user.perfects + (isPerfect ? 1 : 0)),
    bullseyes: String(user.bullseyes + (isBullseye ? 1 : 0)),
    daysPlayed: String(user.daysPlayed + 1),
    firstVisitDone: '1',
  });

  return streak;
};
