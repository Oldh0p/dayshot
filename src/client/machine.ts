import type {
  LeaderboardResponse,
  ResultSummary,
  ShotResponse,
  ShotResult,
  StateResponse,
} from '../shared/types.ts';

/**
 * The day's state machine (GDD 9.8).
 *
 *   boot
 *     -> (warmupPending ? warmup_aim -> warmup_result -> interstitial)
 *     -> ready -> aiming -> in_flight -> impact -> scoring_pending -> result
 *     -> result <-> practice
 *
 * Returning the same day lands straight on `result`. Transverse states —
 * offline, submission failure, rollover, logged out — are held alongside the
 * phase rather than replacing it, because none of them should erase what the
 * player was looking at.
 */

export type Phase =
  | 'boot'
  | 'logged_out'
  | 'warmup_aim'
  | 'warmup_flight'
  | 'warmup_result'
  | 'interstitial'
  | 'ready'
  | 'aiming'
  | 'in_flight'
  | 'impact'
  | 'scoring_pending'
  | 'result'
  | 'practice_aim'
  | 'practice_flight'
  | 'practice_result';

/** Whether the current phase is a shot the player is charging. */
export const isAiming = (phase: Phase): boolean =>
  phase === 'ready' ||
  phase === 'aiming' ||
  phase === 'warmup_aim' ||
  phase === 'practice_aim';

/** Whether the scene is playing a shot back. */
export const isFlying = (phase: Phase): boolean =>
  phase === 'in_flight' ||
  phase === 'warmup_flight' ||
  phase === 'practice_flight';

/** Practice is dressed differently and can never be mistaken for the real thing. */
export const isPractice = (phase: Phase): boolean =>
  phase === 'practice_aim' ||
  phase === 'practice_flight' ||
  phase === 'practice_result';

export const isWarmup = (phase: Phase): boolean =>
  phase === 'warmup_aim' ||
  phase === 'warmup_flight' ||
  phase === 'warmup_result';

export type Transient =
  /** No connection. The shot is safe; the banner says so. */
  | 'offline'
  /** A shot is queued and being retried. */
  | 'submitting'
  /** The UTC day turned over before the player fired. */
  | 'day_rolled'
  | 'error';

export type GameState = {
  readonly phase: Phase;
  readonly server: StateResponse | null;
  /**
   * Milliseconds to add to the device clock to reach the server's. Only the
   * server decides what day it is, and this is how the countdown honours that
   * without trusting the device (GDD 31).
   */
  readonly clockOffset: number;
  readonly board: LeaderboardResponse | null;
  /** The shot being shown, official or otherwise. */
  readonly shot: ShotResult | null;
  /** The server's confirmed result for today's official shot. */
  readonly result: ResultSummary | null;
  /** Extra fields that only arrive with a fresh submission. */
  readonly submission: ShotResponse | null;
  /** The official shot, replayed as a ghost during practice (GDD 20). */
  readonly ghost: ShotResult | null;
  readonly transient: Transient | null;
  /** The misfire hint fires once per session, then never again (GDD 6). */
  readonly misfireUsed: boolean;
  readonly showMisfireHint: boolean;
  readonly practiceBest: number;
  readonly practiceTries: number;
  readonly sharedUrl: string | null;
  /**
   * Set the moment the warm-up is over, and never cleared.
   *
   * The server is told separately, but a reload happens 1.6 s later and that
   * call may still be in flight or may have failed offline. Without this flag a
   * stale `warmupPending: true` would send the player back into the warm-up they
   * just finished, forever.
   */
  readonly warmupDone: boolean;
  /**
   * No Reddit account. The visitor plays a fixed demo level rather than the
   * day's, so a private window cannot scout today's conditions before the real
   * attempt (GDD 5).
   */
  readonly loggedOut: boolean;
};

export const INITIAL_STATE: GameState = {
  phase: 'boot',
  server: null,
  clockOffset: 0,
  board: null,
  shot: null,
  result: null,
  submission: null,
  ghost: null,
  transient: null,
  misfireUsed: false,
  showMisfireHint: false,
  practiceBest: 0,
  practiceTries: 0,
  sharedUrl: null,
  warmupDone: false,
  loggedOut: false,
};

export type Action =
  | {
      readonly type: 'loaded';
      readonly server: StateResponse;
      readonly clockOffset: number;
      readonly practiceBest: number;
      readonly practiceTries: number;
    }
  | { readonly type: 'board'; readonly board: LeaderboardResponse }
  | { readonly type: 'logged_out' }
  | { readonly type: 'aim_start' }
  | { readonly type: 'misfire' }
  | { readonly type: 'dismiss_misfire' }
  | { readonly type: 'fired'; readonly shot: ShotResult }
  | { readonly type: 'impact' }
  | { readonly type: 'awaiting_server' }
  | { readonly type: 'confirmed'; readonly result: ResultSummary; readonly response: ShotResponse | null }
  | { readonly type: 'warmup_done' }
  | { readonly type: 'begin_practice' }
  | { readonly type: 'practice_scored'; readonly best: number; readonly tries: number }
  | { readonly type: 'leave_practice' }
  | { readonly type: 'transient'; readonly value: Transient | null }
  | { readonly type: 'shared'; readonly url: string };

/**
 * The opening phase for a freshly loaded day.
 *
 * A brand new player gets the warm-up: one shot clearly marked as not counting,
 * so their first ranked score is a choice and not an accident (GDD M2). Someone
 * who has already fired today lands on their result, which doubles as the
 * "come back later" screen.
 */
export const openingPhase = (
  server: StateResponse,
  warmupDone = false
): Phase => {
  // A visitor with no account still gets to shoot. Reddit's launch guidance is
  // explicit that the core experience must not sit behind a login wall, and a
  // demo shot is a far better argument for signing up than a locked screen.
  if (!server.username) return 'warmup_aim';
  if (server.playedToday) return 'result';
  if (server.warmupPending && !warmupDone) return 'warmup_aim';
  return 'ready';
};

export const reduce = (state: GameState, action: Action): GameState => {
  switch (action.type) {
    case 'loaded':
      return {
        ...state,
        server: action.server,
        clockOffset: action.clockOffset,
        phase: openingPhase(action.server, state.warmupDone),
        loggedOut: !action.server.username,
        result: action.server.myResult,
        practiceBest: action.practiceBest,
        practiceTries: action.practiceTries,
        transient: null,
      };

    case 'board':
      return { ...state, board: action.board };

    case 'logged_out':
      return { ...state, phase: 'logged_out' };

    case 'aim_start':
      if (state.phase === 'ready') return { ...state, phase: 'aiming' };
      return state;

    case 'misfire':
      // Only the very first press of the official shot is protected. Repeating
      // it would turn the safety net into a way to scan the gauge for free.
      return { ...state, misfireUsed: true, showMisfireHint: true, phase: 'ready' };

    case 'dismiss_misfire':
      return { ...state, showMisfireHint: false };

    case 'fired': {
      const next: Phase =
        state.phase === 'warmup_aim'
          ? 'warmup_flight'
          : state.phase === 'practice_aim'
            ? 'practice_flight'
            : 'in_flight';
      return { ...state, phase: next, shot: action.shot, showMisfireHint: false };
    }

    case 'impact': {
      if (state.phase === 'warmup_flight') {
        return { ...state, phase: 'warmup_result' };
      }
      if (state.phase === 'practice_flight') {
        return { ...state, phase: 'practice_result' };
      }
      return { ...state, phase: 'impact' };
    }

    case 'awaiting_server':
      return { ...state, phase: 'scoring_pending' };

    case 'confirmed':
      return {
        ...state,
        // The server can answer while the ball is still in the air. Jumping to
        // the result then would cut the flight short, so the confirmation is
        // recorded and `impact` is left to advance the phase.
        phase: isFlying(state.phase) ? state.phase : 'result',
        result: action.result,
        // Never regress to null. The confirmation arrives once with a full
        // response and may be re-dispatched at impact without one; letting the
        // second overwrite the first cost a brand new player their streak,
        // which fell back to the state loaded before they had shot.
        submission: action.response ?? state.submission,
        ghost: state.shot,
        transient: null,
      };

    case 'warmup_done':
      return { ...state, phase: 'interstitial', warmupDone: true, shot: null };

    case 'begin_practice':
      return { ...state, phase: 'practice_aim', shot: null };

    case 'practice_scored':
      return {
        ...state,
        practiceBest: action.best,
        practiceTries: action.tries,
      };

    case 'leave_practice':
      return { ...state, phase: 'result', shot: state.ghost };

    case 'transient':
      return { ...state, transient: action.value };

    case 'shared':
      return { ...state, sharedUrl: action.url };

    default:
      return state;
  }
};

/** `interstitial` is a beat, not a screen: it advances on its own. */
export const INTERSTITIAL_MS = 1600;
