import type { LeaderboardEntry } from '../../shared/types.ts';
import * as keys from './keys.ts';
import type { RedisLike } from './redis-port.ts';

/**
 * Leaderboard maths.
 *
 * Devvit's Redis has `zRank` but **no `zRevRank`**, and scores need a tiebreak
 * anyway: GDD II.8 puts the earlier submission ahead when two players tie. Both
 * problems have the same solution — pack the score and the arrival order into
 * one sorted-set score:
 *
 *     composite = round(score * 100) * TIE_SPACE + (TIE_SPACE - 1 - seq)
 *
 * Every member is then unique, so descending rank is exactly
 * `zCard - zRank(member)`, and a lower `seq` (an earlier shot) sorts higher for
 * free. The largest composite is about 1.0e12, comfortably inside the 2^53
 * where integer arithmetic on a double is exact.
 */

const TIE_SPACE = 1e8;
const MAX_SEQ = TIE_SPACE - 2;

export const encodeCompositeScore = (score: number, seq: number): number => {
  const cents = Math.round(score * 100);
  const bounded = seq < 0 ? 0 : seq > MAX_SEQ ? MAX_SEQ : seq;
  return cents * TIE_SPACE + (TIE_SPACE - 1 - bounded);
};

export const decodeScore = (composite: number): number => {
  const tie = composite % TIE_SPACE;
  return (composite - tie) / TIE_SPACE / 100;
};

export const decodeSeq = (composite: number): number =>
  TIE_SPACE - 1 - (composite % TIE_SPACE);

/** One-based rank, best first. */
export const rankFromAscending = (
  ascendingRank: number,
  total: number
): number => total - ascendingRank;

/**
 * Share of players this shot beat or matched, as a percentage: the "TOP 4.2%"
 * headline that lets an average player leave with something to be proud of
 * (GDD 13).
 */
export const percentileFor = (rank: number, total: number): number => {
  if (total <= 0) return 100;
  return Math.round((rank / total) * 1000) / 10;
};

export type Standing = {
  readonly rank: number;
  readonly total: number;
  readonly percentile: number;
};

/** Reads a player's live standing for the day. */
export const standingFor = async (
  redis: RedisLike,
  dayNumber: number,
  userId: string
): Promise<Standing | null> => {
  const key = keys.dayScores(dayNumber);
  const [ascending, total] = await Promise.all([
    redis.zRank(key, userId),
    redis.zCard(key),
  ]);
  if (ascending === undefined || total === 0) return null;

  const rank = rankFromAscending(ascending, total);
  return { rank, total, percentile: percentileFor(rank, total) };
};

const toEntries = (
  rows: readonly { member: string; score: number }[],
  startRank: number,
  names: Record<string, string>,
  meId: string | null
): LeaderboardEntry[] =>
  rows.map((row, index) => ({
    rank: startRank + index,
    username: names[row.member] ?? 'anonymous',
    score: decodeScore(row.score),
    isMe: row.member === meId,
  }));

/**
 * Top three plus a window around the player.
 *
 * The window is the point: a player at #184 should see #181 through #187, never
 * be told to go and find themselves on page 47 (GDD 13).
 */
export const leaderboardFor = async (
  redis: RedisLike,
  dayNumber: number,
  userId: string | null,
  windowRadius = 3
): Promise<{
  top: LeaderboardEntry[];
  around: LeaderboardEntry[];
  total: number;
}> => {
  const key = keys.dayScores(dayNumber);
  const total = await redis.zCard(key);
  if (total === 0) return { top: [], around: [], total: 0 };

  const names = await redis.hGetAll(keys.dayNames(dayNumber));

  const topRows = await redis.zRange(key, 0, 2, {
    by: 'rank',
    reverse: true,
  });
  const top = toEntries(topRows, 1, names, userId);

  if (!userId) return { top, around: [], total };

  const ascending = await redis.zRank(key, userId);
  if (ascending === undefined) return { top, around: [], total };

  const myRank = rankFromAscending(ascending, total);
  const from = Math.max(0, myRank - 1 - windowRadius);
  const to = Math.min(total - 1, myRank - 1 + windowRadius);
  const aroundRows = await redis.zRange(key, from, to, {
    by: 'rank',
    reverse: true,
  });

  return { top, around: toEntries(aroundRows, from + 1, names, userId), total };
};
