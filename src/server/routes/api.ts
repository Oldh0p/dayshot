import { Hono } from 'hono';
import { context, redis } from '@devvit/web/server';

import type {
  AnalyticsEvent,
  ErrorResponse,
  LeaderboardResponse,
  ShotRequest,
  ShotResponse,
  StateResponse,
} from '../../shared/types.ts';
import * as analytics from '../core/analytics.ts';
import { dayNumberAt } from '../core/clock.ts';
import { leaderboardFor } from '../core/ranking.ts';
import type { RedisLike } from '../core/redis-port.ts';
import { submitShot } from '../core/shot.ts';
import { buildState } from '../core/state.ts';
import { markWarmupDone } from '../core/user.ts';

/**
 * The public API (GDD 9.6).
 *
 * Every endpoint takes the player's identity from the Devvit context and never
 * from the payload, so a request can only ever act on its own account.
 */
export const api = new Hono();

/**
 * The one place the platform's Redis client is bound to the port the core is
 * written against. If Devvit's surface ever drifts, this line stops compiling
 * instead of something failing at midnight.
 */
const store: RedisLike = redis;

/** Unique per attempt, which is what makes the daily lock's read-back exact. */
let nonceCounter = 0;
const nonce = (): string =>
  `${Date.now().toString(36)}-${(nonceCounter++).toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;

const fail = (code: ErrorResponse['error']): ErrorResponse => ({ error: code });

api.get('/state', async (c) => {
  try {
    const state: StateResponse = await buildState(store, {
      userId: context.userId ?? null,
      username: context.username ?? null,
      now: Date.now(),
    });
    return c.json<StateResponse>(state, 200);
  } catch (error) {
    console.error('[api] /state failed', error);
    return c.json<ErrorResponse>(fail('SERVER_ERROR'), 500);
  }
});

api.post('/shot', async (c) => {
  const userId = context.userId;
  if (!userId) return c.json<ErrorResponse>(fail('LOGGED_OUT'), 401);

  let body: ShotRequest;
  try {
    body = await c.req.json<ShotRequest>();
  } catch {
    return c.json<ErrorResponse>(fail('BAD_REQUEST'), 400);
  }

  try {
    const outcome = await submitShot(
      { redis: store, now: () => Date.now(), nonce },
      {
        userId,
        username: context.username ?? 'anonymous',
        claimedDay: body.dayNumber,
        holdMs: body.holdMs,
        clientScore: body.clientScore,
      }
    );

    switch (outcome.status) {
      case 'recorded':
        return c.json<ShotResponse>(
          {
            ...outcome.result,
            perfectCountToday: outcome.perfectCountToday,
            streak: outcome.streak,
            simMismatch: outcome.simMismatch,
          },
          200
        );

      case 'already_played':
        // The result travels with the error: a second tab should show the shot
        // that counted, not an apology.
        return c.json({ error: 'ALREADY_PLAYED', result: outcome.result }, 409);

      case 'day_rolled':
        return c.json<ErrorResponse>(fail('DAY_ROLLED'), 409);

      default:
        return c.json<ErrorResponse>(fail('BAD_REQUEST'), 400);
    }
  } catch (error) {
    console.error('[api] /shot failed', error);
    return c.json<ErrorResponse>(fail('SERVER_ERROR'), 500);
  }
});

api.post('/warmup-done', async (c) => {
  const userId = context.userId;
  if (!userId) return c.json<ErrorResponse>(fail('LOGGED_OUT'), 401);

  try {
    await markWarmupDone(store, userId);
    await analytics.record(store, dayNumberAt(Date.now()), {
      name: 'warmup_complete',
    });
    return c.json({ ok: true }, 200);
  } catch (error) {
    console.error('[api] /warmup-done failed', error);
    return c.json<ErrorResponse>(fail('SERVER_ERROR'), 500);
  }
});

api.get('/leaderboard', async (c) => {
  try {
    const dayNumber = dayNumberAt(Date.now());
    const board = await leaderboardFor(
      store,
      dayNumber,
      context.userId ?? null
    );
    return c.json<LeaderboardResponse>(board, 200);
  } catch (error) {
    console.error('[api] /leaderboard failed', error);
    return c.json<ErrorResponse>(fail('SERVER_ERROR'), 500);
  }
});

api.post('/analytics', async (c) => {
  try {
    const event = await c.req.json<AnalyticsEvent>();
    await analytics.record(store, dayNumberAt(Date.now()), event);
    return c.json({ ok: true }, 200);
  } catch {
    // Analytics must never be able to break a session.
    return c.json({ ok: false }, 200);
  }
});
