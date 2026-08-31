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
  readonly isPerfect: boolean;
  readonly isBullseye: boolean;
  /** Flight duration in milliseconds, for the client's animation clock. */
  readonly flightMs: number;
  /** One sample per integration step, for rendering and the practice ghost. */
  readonly trajectory: readonly Point[];
};
