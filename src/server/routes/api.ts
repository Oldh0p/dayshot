import { Hono } from 'hono';
import { context } from '@devvit/web/server';

import type {
  AnalyticsEvent,
  ErrorResponse,
  LeaderboardResponse,
  ShareResponse,
  ShotRequest,
  ShotResponse,
  StateResponse,
} from '../../shared/types.ts';
import * as analytics from '../core/analytics.ts';
import { dayNumberAt } from '../core/clock.ts';
import { leaderboardFor } from '../core/ranking.ts';
import { shareShot } from '../core/share.ts';
import { submitShot } from '../core/shot.ts';
import { buildState } from '../core/state.ts';
import { markWarmupDone } from '../core/user.ts';
import { nonce, now, redditApi, store } from '../platform.ts';

/**
 * The public API (GDD 9.6).
 *
 * Every endpoint takes the player's identity from the Devvit context and never
 * from the payload, so a request can only ever act on its own account.
 */
export const api = new Hono();

const fail = (code: ErrorResponse['error']): ErrorResponse => ({ error: code });

api.get('/state', async (c) => {
  try {
    const state: StateResponse = await buildState(store, {
      userId: context.userId ?? null,
      username: context.username ?? null,
      now: now(),
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
      { redis: store, now, nonce },
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
    await analytics.record(store, dayNumberAt(now()), {
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
    const dayNumber = dayNumberAt(now());
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
    await analytics.record(store, dayNumberAt(now()), event);
    return c.json({ ok: true }, 200);
  } catch {
    // Analytics must never be able to break a session.
    return c.json({ ok: false }, 200);
  }
});

/**
 * `POST MY SHOT` (GDD 9.6).
 *
 * The card is built from the server's record of the shot, never from anything
 * the client sends. The comment is a claim about a score, so it has to be the
 * server's claim.
 */
api.post('/share-comment', async (c) => {
  const userId = context.userId;
  if (!userId) return c.json<ErrorResponse>(fail('LOGGED_OUT'), 401);

  try {
    const outcome = await shareShot(
      { redis: store, reddit: redditApi, now },
      userId
    );

    switch (outcome.status) {
      case 'posted':
        await analytics.record(store, dayNumberAt(now()), {
          name: 'share_comment',
        });
        return c.json<ShareResponse>(
          { ok: true, commentUrl: outcome.commentUrl, card: outcome.card },
          200
        );
      case 'already_shared':
        return c.json(
          { error: 'ALREADY_SHARED', commentUrl: outcome.commentUrl },
          409
        );
      case 'not_played':
        return c.json<ErrorResponse>(fail('NOT_PLAYED'), 409);
      default:
        return c.json<ErrorResponse>(fail('NO_POST'), 409);
    }
  } catch (error) {
    console.error('[api] /share-comment failed', error);
    return c.json<ErrorResponse>(fail('SERVER_ERROR'), 500);
  }
});
