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
 *     -> result <-> practice_aim <-> practice_flight
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
  | 'practice_flight';

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
  phase === 'practice_aim' || phase === 'practice_flight';

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
  /**
   * The attempt just landed, and the one before it.
   *
   * Deliberately not `state.shot`: that is the scene's trajectory and it is
   * replaced the instant the player starts the next throw, which would blank
   * the number a chaining player is reading. These two are written only at
   * impact and survive the whole of the next charge and flight.
   */
  readonly practiceLast: ShotResult | null;
  readonly practicePrevScore: number | null;
  /** Whether that attempt set the day's best, decided against the old tally. */
  readonly practiceIsBest: boolean;
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
   * The finger is down and the gauge is running.
   *
   * Deliberately *not* derived from the phase. The phase says which kind of
   * shot this is; whether the button is held is a different axis entirely, and
   * conflating them produced two mirrored lies. The official shot got away with
   * it because it owns a phase for each state -- `ready` then `aiming` -- but
   * the warm-up and practice each have one phase for both, so the warm-up said
   * "HOLD TO AIM" while the player was already holding, and practice said
   * "RELEASE TO SHOOT" before they had touched anything.
   *
   * One flag, set on aim-start and cleared on release, is true for all three.
   */
  readonly charging: boolean;
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
  practiceLast: null,
  practicePrevScore: null,
  practiceIsBest: false,
  sharedUrl: null,
  warmupDone: false,
  charging: false,
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
  | {
      readonly type: 'practice_scored';
      readonly best: number;
      readonly tries: number;
      readonly shot: ShotResult;
    }
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
        charging: false,
      };

    case 'board':
      return { ...state, board: action.board };

    case 'logged_out':
      return { ...state, phase: 'logged_out' };

    case 'aim_start':
      // `ready -> aiming` still happens for the official shot, because other
      // things read those phases; `charging` is what the prompt now reads, and
      // it is true for the warm-up and practice as well.
      return {
        ...state,
        charging: true,
        phase: state.phase === 'ready' ? 'aiming' : state.phase,
      };

    case 'misfire':
      // Only the very first press of the official shot is protected. Repeating
      // it would turn the safety net into a way to scan the gauge for free.
      return {
        ...state,
        misfireUsed: true,
        showMisfireHint: true,
        charging: false,
        phase: 'ready',
      };

    case 'dismiss_misfire':
      return { ...state, showMisfireHint: false };

    case 'fired': {
      const next: Phase =
        state.phase === 'warmup_aim'
          ? 'warmup_flight'
          : state.phase === 'practice_aim'
            ? 'practice_flight'
            : 'in_flight';
      return {
        ...state,
        phase: next,
        shot: action.shot,
        showMisfireHint: false,
        charging: false,
      };
    }

    case 'impact': {
      if (state.phase === 'warmup_flight') {
        return { ...state, phase: 'warmup_result' };
      }
      if (state.phase === 'practice_flight') {
        /*
         * Straight back to aiming, which is the whole change: there is no
         * terminal practice state to dismiss. `canAim` already lists
         * `practice_aim`, `guardMisfire` is already false there and `fired`
         * already routes it to `practice_flight`, so the loop closes without a
         * single new branch. What the player just threw stays on screen in
         * `practiceLast`, which nothing here clears.
         */
        return { ...state, phase: 'practice_aim' };
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
      return {
        ...state,
        phase: 'interstitial',
        warmupDone: true,
        shot: null,
        charging: false,
      };

    case 'begin_practice':
      return {
        ...state,
        phase: 'practice_aim',
        shot: null,
        charging: false,
        // Entering the range is a fresh lane: no last attempt, and no delta
        // measured against a shot from a previous visit.
        practiceLast: null,
        practicePrevScore: null,
        practiceIsBest: false,
      };

    case 'practice_scored':
      return {
        ...state,
        practiceBest: action.best,
        practiceTries: action.tries,
        practiceLast: action.shot,
        practicePrevScore: state.practiceLast?.score ?? null,
        /*
         * Measured against the tally *before* this shot, so the very first
         * attempt of the day is not announced as beating something. `tries`
         * has already been incremented by `recordPractice` when it arrives.
         */
        practiceIsBest: state.practiceTries > 0 && action.best > state.practiceBest,
      };

    case 'leave_practice':
      return { ...state, phase: 'result', shot: state.ghost, charging: false };

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
