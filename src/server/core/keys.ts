/**
 * Every Redis key the app uses (GDD 9.7).
 *
 * Devvit's Redis cannot list keys, so a key that loses its name is lost. Keeping
 * the whole namespace in one file is the only way to keep that from happening.
 */

/** Sorted set of the day's scores. Member: userId. Score: composite (ranking.ts). */
export const dayScores = (dayNumber: number): string =>
  `day:${dayNumber}:scores`;

/** Hash of the day's shared facts: rerollK, postId, counters. */
export const dayMeta = (dayNumber: number): string => `day:${dayNumber}:meta`;

/** Monotonic submission counter, used as the leaderboard tiebreaker. */
export const daySeq = (dayNumber: number): string => `day:${dayNumber}:seq`;

/**
 * userId -> username for the day's players.
 *
 * Not in the GDD 9.7 table, but `/api/leaderboard` has to return usernames and
 * resolving them one Reddit call at a time would not fit the request budget.
 */
export const dayNames = (dayNumber: number): string =>
  `day:${dayNumber}:names`;

/** Aggregated analytics counters (GDD 9.10). No per-user tracking. */
export const dayStats = (dayNumber: number): string =>
  `stats:daily:${dayNumber}`;

/** Long-lived per-player hash: streak, records, first-visit flag. */
export const user = (userId: string): string => `user:${userId}`;

/**
 * The daily lock: a hash whose single `shot` field is claimed with `hSetNX` and
 * holds the audit record. Its existence *is* "this player has played today".
 * See `shot.ts` for why it is a hash and not the string GDD 9.7 describes.
 */
export const userPlayed = (userId: string, dayNumber: number): string =>
  `user:${userId}:played:${dayNumber}`;

/** Marks that the player's score card has been posted for the day. */
export const userShared = (userId: string, dayNumber: number): string =>
  `user:${userId}:shared:${dayNumber}`;

/**
 * commentId -> "userId|dayNumber" for every published score card.
 *
 * Exists so the comment-delete trigger can find what to forget: the event
 * carries a comment id and nothing else useful.
 */
export const sharedIndex = (): string => 'shared:by-comment';
