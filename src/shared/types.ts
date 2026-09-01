/**
 * Domain types shared verbatim by the client and the server.
 *
 * Nothing player-visible lives here — labels and copy belong in `copy.ts`.
 */

/** The seven cost-S modifiers that ship in the MVP (GDD 36.9). */
export type ModifierId =
  | 'CLEAR'
  | 'CROSSWIND'
  | 'TAILWIND'
  | 'GUSTY'
  | 'MOON'
  | 'TINY'
  | 'LONG';

/** A point in the 1000x1600 logical space, origin bottom-left. */
export type Point = { readonly x: number; readonly y: number };

/**
 * Everything the seed decides about a day. Generated independently by the
 * client and the server from `dayNumber` + `rerollK`; never transmitted, never
 * stored per level.
 */
export type Level = {
  readonly dayNumber: number;
  /** Reroll index from the validity guard-rail; 0 on almost every day. */
  readonly rerollK: number;
  readonly modifier: ModifierId;
  /** Distance from the origin to the centre of the target mat. */
  readonly distance: number;
  /** Height of the target plateau above the ground plane. */
  readonly height: number;
  /** Constant horizontal acceleration, in u/s². */
  readonly windBase: number;
  /** Gust amplitude around `windBase`; zero on days that are not Gusty. */
  readonly gustAmp: number;
  /** Sixteen seeded samples in [-1, 1), interpolated over `GUST_SPAN_S`. */
  readonly gustTable: readonly number[];
  readonly angleDeg: number;
  /** Launch direction, computed once and rounded to 1e-6 (GDD 9.2). */
  readonly cosTheta: number;
  readonly sinTheta: number;
  readonly gravity: number;
  /** Mat radius; halved on Tiny Target, which is what makes that day bite. */
  readonly targetR: number;
  readonly paletteVariant: number;
};

/** How a shot ended. Drives both the score and the impact copy. */
export type ImpactKind =
  /** Came down on the target plateau. */
  | 'MAT'
  /** Came down on the ground plane, short of or beyond the plateau. */
  | 'GROUND'
  /** Hit the vertical face of the plateau. Badge: SPLAT. */
  | 'CLIFF'
  /** Left the logical space. Score 0, and it is meant to be funny. */
  | 'OFF_THE_MAP';

/** The outcome of one shot. Identical on the client and the server (GDD 9.4). */
export type ShotResult = {
  /** Gauge sample at release, in [0, 1]. */
  readonly power: number;
  /** Score out of 100, rounded half-up to two decimals. */
  readonly score: number;
  /** Horizontal distance from the centre of the mat, in logical units. */
  readonly dx: number;
  readonly impactX: number;
  readonly impactY: number;
  readonly impact: ImpactKind;
  /**
   * On a CLIFF, how far below the top of the plateau the ball hit the wall.
   * Zero on every other impact. Grades the wall so that grazing the lip and
   * hitting the base are not the same shot.
   */
  readonly cliffDrop: number;
  readonly isPerfect: boolean;
  readonly isBullseye: boolean;
  /** Flight duration in milliseconds, for the client's animation clock. */
  readonly flightMs: number;
  /** One sample per integration step, for rendering and the practice ghost. */
  readonly trajectory: readonly Point[];
};

// ---------------------------------------------------------------------------
// Server API contracts (GDD 9.6)
// ---------------------------------------------------------------------------

/** Machine-readable failure codes. Errors are always `{ error: CODE }`. */
export type ErrorCode =
  /** No Reddit account in context. */
  | 'LOGGED_OUT'
  /** The UTC day turned over between load and submission. */
  | 'DAY_ROLLED'
  /** The daily lock was already held. The existing result comes back with it. */
  | 'ALREADY_PLAYED'
  /** Nothing to share or read yet. */
  | 'NOT_PLAYED'
  /** The share comment for today already exists. */
  | 'ALREADY_SHARED'
  /** The day has no post to comment under. */
  | 'NO_POST'
  | 'BAD_REQUEST'
  | 'SERVER_ERROR';

export type ErrorResponse = { readonly error: ErrorCode };

/** Everything the result screen needs about one player's shot. */
export type ResultSummary = {
  readonly score: number;
  readonly dx: number;
  /** Signed miss: positive overshoots, negative undershoots. Drives Format B. */
  readonly signedDx: number;
  readonly impact: ImpactKind;
  /** See `ShotResult.cliffDrop`. */
  readonly cliffDrop: number;
  readonly holdMs: number;
  readonly rank: number;
  readonly total: number;
  /** Share of players at or above this score, as a percentage. */
  readonly percentile: number;
  readonly isBullseye: boolean;
  readonly isPerfect: boolean;
};

export type StreakState = {
  readonly current: number;
  readonly longest: number;
  /** True when the previous streak lapsed and the reset copy is due. */
  readonly justReset: boolean;
};

export type StateResponse = {
  readonly dayNumber: number;
  readonly displayDay: number;
  readonly rerollK: number;
  /** Server clock in epoch milliseconds; the client keeps an offset from it. */
  readonly serverNow: number;
  readonly modifier: ModifierId;
  readonly playedToday: boolean;
  readonly myResult: ResultSummary | null;
  readonly streak: StreakState;
  /**
   * The day's warm-up shot has not been taken yet. Every day opens with one
   * throw that does not count, on the day's real conditions, before the ranked
   * shot unlocks -- so this is a fact about the day, not about the account.
   */
  readonly warmupPending: boolean;
  readonly shotsToday: number;
  readonly topScore: number;
  readonly perfectsToday: number;
  readonly tomorrowModifier: ModifierId;
  readonly sharedToday: boolean;
  /**
   * Whether the player has already agreed to comment as themselves. Not in the
   * GDD 9.6 field list, but IV.17 asks for consent once and then remembers it,
   * and localStorage is wiped by every app update -- so it lives server-side.
   */
  readonly shareConsent: boolean;
  readonly username: string | null;
};

export type ShotRequest = {
  readonly dayNumber: number;
  readonly holdMs: number;
  readonly clientScore: number;
};

export type ShotResponse = ResultSummary & {
  readonly perfectCountToday: number;
  readonly streak: StreakState;
  /** The client's own simulation disagreed; the server score stands. */
  readonly simMismatch: boolean;
};

export type LeaderboardEntry = {
  readonly rank: number;
  readonly username: string;
  readonly score: number;
  readonly isMe: boolean;
};

export type LeaderboardResponse = {
  readonly top: readonly LeaderboardEntry[];
  readonly around: readonly LeaderboardEntry[];
  readonly total: number;
};

export type ShareResponse = {
  readonly ok: true;
  readonly commentUrl: string;
  readonly card: string;
};

/** Analytics events the client is allowed to report (GDD 9.10). */
export type AnalyticsEvent = {
  readonly name: string;
  readonly props?: Readonly<Record<string, string | number | boolean>>;
};
