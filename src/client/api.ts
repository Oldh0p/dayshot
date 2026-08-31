import type {
  AnalyticsEvent,
  ErrorCode,
  LeaderboardResponse,
  ResultSummary,
  ShareResponse,
  ShotRequest,
  ShotResponse,
  StateResponse,
} from '../shared/types.ts';

/**
 * Typed wrappers over the game's endpoints.
 *
 * Everything returns a discriminated result rather than throwing, because on
 * this client every failure has a specific screen behind it: a rollover reloads
 * the day, an offline error queues the shot, an already-played answer shows the
 * shot that counted.
 */

export type ApiResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly code: ErrorCode | 'NETWORK'; readonly data?: unknown };

const request = async <T>(
  path: string,
  init?: RequestInit
): Promise<ApiResult<T>> => {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    return { ok: false, code: 'NETWORK' };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (response.ok) return { ok: true, data: body as T };

  const code =
    typeof body === 'object' && body !== null && 'error' in body
      ? ((body as { error: ErrorCode }).error ?? 'SERVER_ERROR')
      : 'SERVER_ERROR';

  return { ok: false, code, data: body };
};

const postJson = <T>(path: string, payload: unknown): Promise<ApiResult<T>> =>
  request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

export const fetchState = (): Promise<ApiResult<StateResponse>> =>
  request<StateResponse>('/api/state');

export const fetchLeaderboard = (): Promise<ApiResult<LeaderboardResponse>> =>
  request<LeaderboardResponse>('/api/leaderboard');

export const submitShot = (
  payload: ShotRequest
): Promise<ApiResult<ShotResponse>> => postJson<ShotResponse>('/api/shot', payload);

export const completeWarmup = (): Promise<ApiResult<{ ok: boolean }>> =>
  postJson('/api/warmup-done', {});

export const postShareComment = (): Promise<ApiResult<ShareResponse>> =>
  postJson<ShareResponse>('/api/share-comment', {});

/** Analytics is best-effort and must never delay or break a session. */
export const track = (event: AnalyticsEvent): void => {
  void postJson('/api/analytics', event).catch(() => undefined);
};

/**
 * Pulls the existing result out of an `ALREADY_PLAYED` response.
 *
 * The server sends the shot that counted alongside the error, so a second tab
 * can show the real result instead of an apology (GDD 31).
 */
export const alreadyPlayedResult = (body: unknown): ResultSummary | null => {
  if (typeof body !== 'object' || body === null) return null;
  const result = (body as { result?: unknown }).result;
  if (typeof result !== 'object' || result === null) return null;
  if (typeof (result as ResultSummary).score !== 'number') return null;
  return result as ResultSummary;
};

/** Pulls the permalink out of an `ALREADY_SHARED` response. */
export const alreadySharedUrl = (body: unknown): string | null => {
  if (typeof body !== 'object' || body === null) return null;
  const url = (body as { commentUrl?: unknown }).commentUrl;
  return typeof url === 'string' && url.length > 0 ? url : null;
};
