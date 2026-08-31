import { generateLevel } from '../../shared/sim.ts';
import type { StateResponse } from '../../shared/types.ts';
import { dayNumberAt } from './clock.ts';
import { displayDayFrom, ensureDayMeta, resolveAnchorDay } from './day.ts';
import * as keys from './keys.ts';
import { decodeScore } from './ranking.ts';
import type { RedisLike } from './redis-port.ts';
import { readStoredShot, reconcileMissingScore, summarise } from './shot.ts';
import { readUser, streakForDisplay } from './user.ts';

/**
 * Everything a client needs to open the game (GDD 9.6).
 *
 * The level itself is never sent: the client regenerates it from `dayNumber`
 * and `rerollK`, which is the whole point of a deterministic seed. What travels
 * is the state the client cannot know — whose turn it is, what the world has
 * scored today, and what the server thinks the time is.
 */
export type StateParams = {
  readonly userId: string | null;
  readonly username: string | null;
  readonly now: number;
};

export const buildState = async (
  redis: RedisLike,
  params: StateParams
): Promise<StateResponse> => {
  const { userId, username, now } = params;

  const dayNumber = dayNumberAt(now);
  const anchor = await resolveAnchorDay(redis, dayNumber);
  const meta = await ensureDayMeta(redis, dayNumber);
  const level = generateLevel(dayNumber, meta.rerollK);

  const scoresKey = keys.dayScores(dayNumber);
  const [shotsToday, topRows] = await Promise.all([
    redis.zCard(scoresKey),
    redis.zRange(scoresKey, 0, 0, { by: 'rank', reverse: true }),
  ]);

  // Derived from the sorted set rather than the counter: it is exact, and it
  // cannot drift if a write is ever lost.
  const topRow = topRows[0];
  const topScore = topRow ? decodeScore(topRow.score) : 0;

  const base = {
    dayNumber,
    displayDay: displayDayFrom(dayNumber, anchor),
    rerollK: meta.rerollK,
    serverNow: now,
    modifier: level.modifier,
    shotsToday,
    topScore,
    perfectsToday: meta.perfects,
    tomorrowModifier: meta.tomorrowModifier,
  };

  if (!userId) {
    return {
      ...base,
      playedToday: false,
      myResult: null,
      streak: { current: 0, longest: 0, justReset: false },
      firstVisit: false,
      sharedToday: false,
      shareConsent: false,
      username: null,
    };
  }

  const [user, stored, sharedRaw] = await Promise.all([
    readUser(redis, userId),
    readStoredShot(redis, userId, dayNumber),
    redis.hGet(keys.userShared(userId, dayNumber), 'url'),
  ]);

  if (stored) {
    // Self-heal a lock whose leaderboard write never landed, before anyone is
    // shown a rank of zero.
    await reconcileMissingScore(redis, dayNumber, userId, stored);
  }

  const streak = streakForDisplay(user, dayNumber, stored !== null);

  return {
    ...base,
    playedToday: stored !== null,
    myResult: stored
      ? await summarise(redis, dayNumber, userId, stored)
      : null,
    streak,
    firstVisit: !user.firstVisitDone,
    sharedToday: sharedRaw !== undefined,
    shareConsent: user.shareConsent,
    username,
  };
};
