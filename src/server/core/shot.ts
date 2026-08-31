import { generateLevel, simulateLevel } from '../../shared/sim.ts';
import { BULLSEYE_SCORE, DAY_TTL_S } from '../../shared/tunables.ts';
import type {
  ImpactKind,
  ResultSummary,
  StreakState,
} from '../../shared/types.ts';
import * as analytics from './analytics.ts';
import { dayNumberAt, resolveSubmissionDay } from './clock.ts';
import { ensureDayMeta } from './day.ts';
import * as keys from './keys.ts';
import {
  encodeCompositeScore,
  percentileFor,
  rankFromAscending,
} from './ranking.ts';
import type { RedisLike } from './redis-port.ts';
import { applyShotToUser, readUser } from './user.ts';

/**
 * Submitting the one shot of the day.
 *
 * Two rules govern everything here:
 *
 *   1. **The server never trusts the client.** Only `holdMs` crosses the wire;
 *      the score is re-derived from the shared simulation. `clientScore` is
 *      compared purely to detect divergence, and the server's number always
 *      wins (GDD 32.1).
 *   2. **One shot per account per UTC day, whatever happens.** Two tabs, two
 *      devices, a double tap on a flaky connection: the first write wins and
 *      every other caller is handed the shot that already exists (GDD 31).
 */

/** Divergence above this between client and server is logged as SIM_MISMATCH. */
const SIM_TOLERANCE = 0.01;

/** Longest press we will consider. Holding is free, but not for a week. */
const MAX_HOLD_MS = 600_000;

export type ShotDeps = {
  readonly redis: RedisLike;
  readonly now: () => number;
  /** Unique per attempt; makes the lock read-back an exact comparison. */
  readonly nonce: () => string;
};

/** The audit record stored in the daily lock. */
export type StoredShot = {
  readonly holdMs: number;
  readonly score: number;
  readonly dx: number;
  /** Positive overshoots the mat, negative undershoots it. Drives Format B. */
  readonly signedDx: number;
  readonly impact: ImpactKind;
  /** How far below the plateau top a wall impact landed; 0 otherwise. */
  readonly cliffDrop: number;
  readonly ts: number;
  readonly nonce: string;
};

export type SubmitParams = {
  readonly userId: string;
  readonly username: string;
  readonly claimedDay: number;
  readonly holdMs: number;
  readonly clientScore: number;
};

export type SubmitOutcome =
  | {
      readonly status: 'recorded';
      readonly dayNumber: number;
      readonly result: ResultSummary;
      readonly streak: StreakState;
      readonly perfectCountToday: number;
      readonly simMismatch: boolean;
    }
  | {
      readonly status: 'already_played';
      readonly dayNumber: number;
      readonly result: ResultSummary;
    }
  | { readonly status: 'day_rolled'; readonly dayNumber: number }
  | { readonly status: 'bad_request' };

const parseStored = (raw: string): StoredShot | null => {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    if (typeof record['holdMs'] !== 'number') return null;
    if (typeof record['score'] !== 'number') return null;
    return {
      holdMs: record['holdMs'],
      score: record['score'],
      dx: typeof record['dx'] === 'number' ? record['dx'] : 0,
      signedDx: typeof record['signedDx'] === 'number' ? record['signedDx'] : 0,
      impact: (record['impact'] as ImpactKind) ?? 'GROUND',
      cliffDrop:
        typeof record['cliffDrop'] === 'number' ? record['cliffDrop'] : 0,
      ts: typeof record['ts'] === 'number' ? record['ts'] : 0,
      nonce: typeof record['nonce'] === 'string' ? record['nonce'] : '',
    };
  } catch {
    return null;
  }
};

/**
 * The daily lock holds the shot in a single hash field.
 *
 * GDD 9.7 describes it as a string written with `SET NX`, but `set` with `nx`
 * is typed `Promise<string>` on this platform with no documented failure value,
 * so the winner would have to be inferred by reading the key back. `hSetNX`
 * returns 1 or 0 and leaves nothing to infer. The payload and the semantics are
 * unchanged; only the Redis type differs.
 */
const LOCK_FIELD = 'shot';

export const readStoredShot = async (
  redis: RedisLike,
  userId: string,
  dayNumber: number
): Promise<StoredShot | null> => {
  const raw = await redis.hGet(keys.userPlayed(userId, dayNumber), LOCK_FIELD);
  return raw === undefined ? null : parseStored(raw);
};

/**
 * Turns a stored shot into what the result screen shows, reading the live
 * standing from the sorted set every time. Rank is never cached: it moves all
 * day as other players shoot.
 */
export const summarise = async (
  redis: RedisLike,
  dayNumber: number,
  userId: string,
  shot: StoredShot
): Promise<ResultSummary> => {
  const key = keys.dayScores(dayNumber);
  const [ascending, total] = await Promise.all([
    redis.zRank(key, userId),
    redis.zCard(key),
  ]);

  const rank =
    ascending === undefined || total === 0
      ? 0
      : rankFromAscending(ascending, total);

  return {
    score: shot.score,
    dx: shot.dx,
    signedDx: shot.signedDx,
    impact: shot.impact,
    cliffDrop: shot.cliffDrop,
    holdMs: shot.holdMs,
    rank,
    total,
    percentile: rank === 0 ? 100 : percentileFor(rank, total),
    isBullseye: shot.score >= BULLSEYE_SCORE,
    isPerfect: shot.score === 100,
  };
};

/**
 * Re-attaches a shot to the leaderboard if the lock survived but the sorted-set
 * write did not.
 *
 * The lock is written before the score, so a process that died in between would
 * otherwise leave a player locked out of the day with no rank at all. The lock
 * payload carries the score, so the repair is exact.
 */
export const reconcileMissingScore = async (
  redis: RedisLike,
  dayNumber: number,
  userId: string,
  shot: StoredShot
): Promise<boolean> => {
  const existing = await redis.zScore(keys.dayScores(dayNumber), userId);
  if (existing !== undefined) return false;

  const seq = await redis.incrBy(keys.daySeq(dayNumber), 1);
  await redis.zAdd(keys.dayScores(dayNumber), {
    member: userId,
    score: encodeCompositeScore(shot.score, seq),
  });
  return true;
};

export const submitShot = async (
  deps: ShotDeps,
  params: SubmitParams
): Promise<SubmitOutcome> => {
  const { redis, now, nonce } = deps;
  const { userId, username, claimedDay, holdMs, clientScore } = params;

  if (
    !Number.isInteger(holdMs) ||
    holdMs < 0 ||
    holdMs > MAX_HOLD_MS ||
    !Number.isInteger(claimedDay)
  ) {
    return { status: 'bad_request' };
  }

  const at = now();
  const day = resolveSubmissionDay(claimedDay, at);
  if (!day.accepted) {
    return { status: 'day_rolled', dayNumber: dayNumberAt(at) };
  }

  const dayNumber = day.dayNumber;
  const meta = await ensureDayMeta(redis, dayNumber);

  // The whole anti-cheat posture in two lines: the score is ours, not theirs.
  const level = generateLevel(dayNumber, meta.rerollK);
  const shot = simulateLevel(level, holdMs);

  const record: StoredShot = {
    holdMs,
    score: shot.score,
    dx: shot.dx,
    signedDx: shot.impactX - level.distance,
    impact: shot.impact,
    cliffDrop: shot.cliffDrop,
    ts: at,
    nonce: nonce(),
  };

  const payload = JSON.stringify(record);
  const lockKey = keys.userPlayed(userId, dayNumber);

  // Two independent signals decide the lock, because getting this wrong means
  // a player shoots twice in a day and the identity of the game is gone.
  // `hSetNX` reports the winner unambiguously, and reading the field back
  // confirms it: the nonce makes that comparison exact even when two attempts
  // carry the same hold. Either check alone would be enough; together they stay
  // correct if one of them ever behaves unexpectedly on the platform.
  const claimed = await redis.hSetNX(lockKey, LOCK_FIELD, payload);
  await redis.expire(lockKey, DAY_TTL_S);

  const stored = await redis.hGet(lockKey, LOCK_FIELD);
  if (claimed !== 1 || stored !== payload) {
    const existing = stored === undefined ? null : parseStored(stored);
    if (existing === null) return { status: 'bad_request' };
    await reconcileMissingScore(redis, dayNumber, userId, existing);
    return {
      status: 'already_played',
      dayNumber,
      result: await summarise(redis, dayNumber, userId, existing),
    };
  }

  const user = await readUser(redis, userId);
  const seq = await redis.incrBy(keys.daySeq(dayNumber), 1);

  await redis.zAdd(keys.dayScores(dayNumber), {
    member: userId,
    score: encodeCompositeScore(shot.score, seq),
  });
  await redis.expire(keys.dayScores(dayNumber), DAY_TTL_S);
  await redis.hSet(keys.dayNames(dayNumber), { [userId]: username });
  await redis.expire(keys.dayNames(dayNumber), DAY_TTL_S);

  await redis.hIncrBy(keys.dayMeta(dayNumber), 'shots', 1);
  if (shot.isPerfect) {
    await redis.hIncrBy(keys.dayMeta(dayNumber), 'perfects', 1);
  }
  if (shot.score > meta.topScore) {
    await redis.hSet(keys.dayMeta(dayNumber), {
      topScore: String(shot.score),
    });
  }

  const streak = await applyShotToUser(
    redis,
    userId,
    user,
    dayNumber,
    shot.score,
    shot.isPerfect,
    shot.isBullseye
  );

  const simMismatch = Math.abs(shot.score - clientScore) > SIM_TOLERANCE;
  if (simMismatch) {
    console.warn(
      `[shot] SIM_MISMATCH day=${dayNumber} holdMs=${holdMs} ` +
        `server=${shot.score} client=${clientScore}`
    );
  }

  await analytics.record(redis, dayNumber, {
    name: 'shot_scored',
    props: {
      score: analytics.scoreBucket(shot.score),
      modifier: level.modifier.toLowerCase(),
      impact: shot.impact.toLowerCase(),
    },
  });

  // Named counters rather than event props, because these three are what the
  // first week's decisions rest on: whether BULLSEYE_SCORE and PERFECT_RADIUS
  // need moving, and whether the shared simulation has drifted. `sim_mismatch`
  // in particular is an alarm, not a statistic -- a log line nobody greps is
  // not an alarm.
  await analytics.bump(redis, dayNumber, 'shots');
  if (shot.isBullseye) await analytics.bump(redis, dayNumber, 'bullseyes');
  if (shot.isPerfect) await analytics.bump(redis, dayNumber, 'perfects');
  if (simMismatch) await analytics.bump(redis, dayNumber, 'sim_mismatch');

  const perfectsRaw = await redis.hGet(keys.dayMeta(dayNumber), 'perfects');

  return {
    status: 'recorded',
    dayNumber,
    result: await summarise(redis, dayNumber, userId, record),
    streak,
    perfectCountToday: Number(perfectsRaw ?? '0'),
    simMismatch,
  };
};
