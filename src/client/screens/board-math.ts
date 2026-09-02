import { scoreForDx } from '../../shared/sim.ts';
import { OUT_SPAN } from '../../shared/tunables.ts';

/**
 * How far from the centre a score was thrown from (§7's distance column).
 *
 * `/api/leaderboard` returns rank, username and score — no distance — and the
 * only backend additions this redesign is allowed are `yesterdayShots` and, in
 * P2, a streak. But the distance is not missing information: the score *is* a
 * function of it, monotonic and pure, so it can be recovered exactly where it
 * is needed.
 *
 * **Bisected against `scoreForDx`, not inverted algebraically.** The closed
 * form is easy to write and would restate `MAT_DROP`, `MAT_EXP`, `OUT_MAX`,
 * `OUT_EXP` and `PERFECT_RADIUS` in a second place — five constants that have
 * already moved once, when the daily warm-up widened the mat. A search over the
 * real function cannot drift from it, and forty iterations for ten rows costs
 * nothing.
 *
 * Client-side on purpose: `copy.ts` is in the feed bundle's import graph, and
 * pulling `sim.ts` in there would put the day's simulation on the feed card.
 */
const ITERATIONS = 40;

export const dxForScore = (score: number, targetR: number): number => {
  const max = targetR + OUT_SPAN;
  if (score <= 0) return max;
  if (score >= 100) return 0;

  let low = 0;
  let high = max;
  for (let i = 0; i < ITERATIONS; i++) {
    const mid = (low + high) / 2;
    // Monotonic decreasing: a higher score means a smaller distance.
    if (scoreForDx(mid, targetR) > score) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
};

/**
 * §7's window: two above and two below, five rows.
 *
 * The endpoint sends a radius of three, which is seven rows and eleven in
 * total with the leaders — enough to overflow a 320x568 screen, where the panel
 * was measured clipped. Trimming here rather than changing the endpoint keeps
 * the backend untouched (the redesign may add one field and this is not it) and
 * happens to be what §7 asked for in the first place.
 */
export const WINDOW_RADIUS = 2;

/**
 * The five rows around the player, from whatever the endpoint sent.
 *
 * Centred on `isMe` when it is there. When it is not — the player has not shot
 * — there is no centre to trim around, so the rows are left alone and the
 * caller shows the "not played" state instead.
 */
export const windowAround = <T extends { readonly isMe: boolean }>(
  rows: readonly T[]
): readonly T[] => {
  const me = rows.findIndex((r) => r.isMe);
  if (me < 0) return rows;

  const size = WINDOW_RADIUS * 2 + 1;
  // Slide rather than shrink. A player in last place has nothing below them,
  // and centring on that would drop two rows that exist above -- fewer
  // neighbours precisely for the player who most needs to see someone ahead.
  const from = Math.max(0, Math.min(me - WINDOW_RADIUS, rows.length - size));
  return rows.slice(from, from + size);
};

/** §7: under this many players there is no ranking worth drawing. */
export const MIN_FOR_BOARD = 5;

/**
 * Which of §7's three boards this is.
 *
 * Pulled out of the component because the interesting cases are the empty ones
 * and they are the hardest to reach by hand: a day with three players, and a
 * player who opens the board before shooting. Both are decisions, not layout.
 */
export type BoardState = 'early' | 'not-played' | 'ranked';

export const boardState = (
  total: number,
  windowRows: readonly unknown[]
): BoardState => {
  if (total < MIN_FOR_BOARD) return 'early';
  return windowRows.length > 0 ? 'ranked' : 'not-played';
};

/** The column reads in whole units, like every other distance (§10.4). */
export const distanceLabel = (score: number, targetR: number): string =>
  String(Math.round(dxForScore(score, targetR)));
