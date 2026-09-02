import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  INITIAL_STATE,
  isPractice,
  isWarmup,
  openingPhase,
  reduce,
  type GameState,
  type Phase,
} from '../client/machine.ts';
import type {
  ResultSummary,
  ShotResult,
  StateResponse,
} from '../shared/types.ts';

const serverState = (over: Partial<StateResponse> = {}): StateResponse => ({
  dayNumber: 20697,
  displayDay: 1,
  rerollK: 0,
  serverNow: 0,
  modifier: 'CLEAR',
  playedToday: false,
  myResult: null,
  streak: { current: 0, longest: 0, justReset: false },
  warmupPending: false,
  shotsToday: 0,
  yesterdayShots: 0,
  topScore: 0,
  perfectsToday: 0,
  tomorrowModifier: 'MOON',
  sharedToday: false,
  shareConsent: false,
  username: 'alice',
  ...over,
});

const shot = (over: Partial<ShotResult> = {}): ShotResult => ({
  power: 0.5,
  score: 82.5,
  dx: 40,
  impactX: 640,
  impactY: 0,
  impact: 'MAT',
  cliffDrop: 0,
  isPerfect: false,
  isBullseye: false,
  flightMs: 1200,
  trajectory: [{ x: 120, y: 120 }],
  ...over,
});

const response = {
  score: 82.5,
  dx: 40,
  signedDx: -40,
  impact: 'MAT' as const,
  cliffDrop: 0,
  holdMs: 640,
  rank: 2,
  total: 2,
  percentile: 100,
  isBullseye: false,
  isPerfect: false,
  perfectCountToday: 0,
  streak: { current: 1, longest: 1, justReset: false },
  simMismatch: false,
};

const result: ResultSummary = {
  score: 82.5,
  dx: 40,
  signedDx: -40,
  impact: 'MAT',
  cliffDrop: 0,
  holdMs: 640,
  rank: 12,
  total: 400,
  percentile: 3,
  isBullseye: false,
  isPerfect: false,
};

const run = (start: GameState, ...actions: Parameters<typeof reduce>[1][]): GameState =>
  actions.reduce(reduce, start);

const loaded = (over: Partial<StateResponse> = {}): GameState =>
  reduce(INITIAL_STATE, {
    type: 'loaded',
    server: serverState(over),
    clockOffset: 0,
    practiceBest: 0,
    practiceTries: 0,
  });

describe('opening phase', () => {
  it('gives a brand new player the warm-up', () => {
    assert.equal(openingPhase(serverState({ warmupPending: true })), 'warmup_aim');
  });

  it('never shows the warm-up twice', () => {
    assert.equal(openingPhase(serverState({ warmupPending: false })), 'ready');
  });

  it('lands a returning player straight on their result', () => {
    assert.equal(
      openingPhase(serverState({ playedToday: true, warmupPending: false })),
      'result'
    );
  });

  it('prefers the result over the warm-up if somehow both apply', () => {
    assert.equal(
      openingPhase(serverState({ playedToday: true, warmupPending: true })),
      'result'
    );
  });

  it('lets a logged-out visitor shoot rather than walling them out', () => {
    // Reddit's launch guidance: don't gate the core experience behind a login
    // wall. Having felt the shot is what makes the account worth creating.
    assert.equal(openingPhase(serverState({ username: null })), 'warmup_aim');
  });

  it('marks the session as logged out so the demo level is used', () => {
    const anonymous = reduce(INITIAL_STATE, {
      type: 'loaded',
      server: serverState({ username: null }),
      clockOffset: 0,
      practiceBest: 0,
      practiceTries: 0,
    });
    assert.equal(anonymous.loggedOut, true);
    // ...and a signed-in session is not.
    assert.equal(loaded().loggedOut, false);
  });
});

describe('the official shot', () => {
  it('walks the whole GDD 9.8 sequence', () => {
    const phases: Phase[] = [];
    let state = loaded();
    phases.push(state.phase);

    for (const action of [
      { type: 'aim_start' },
      { type: 'fired', shot: shot() },
      { type: 'impact' },
      { type: 'awaiting_server' },
      { type: 'confirmed', result, response: null },
    ] as Parameters<typeof reduce>[1][]) {
      state = reduce(state, action);
      phases.push(state.phase);
    }

    assert.deepEqual(phases, [
      'ready',
      'aiming',
      'in_flight',
      'impact',
      'scoring_pending',
      'result',
    ]);
    assert.equal(state.result?.score, 82.5);
  });

  it('keeps the official shot as the practice ghost', () => {
    const fired = shot({ score: 91 });
    const state = run(
      loaded(),
      { type: 'aim_start' },
      { type: 'fired', shot: fired },
      { type: 'impact' },
      { type: 'confirmed', result, response: null }
    );
    assert.equal(state.ghost, fired);
  });
});

describe('the misfire guard', () => {
  it('cancels the first too-short press and offers a hint', () => {
    const state = run(loaded(), { type: 'aim_start' }, { type: 'misfire' });
    assert.equal(state.phase, 'ready');
    assert.equal(state.showMisfireHint, true);
    assert.equal(state.misfireUsed, true);
  });

  it('arms only once, so the gauge cannot be scanned for free', () => {
    const after = run(loaded(), { type: 'aim_start' }, { type: 'misfire' });
    // The caller checks `misfireUsed` before offering the guard again; once it
    // is set, a short press has to become a real shot.
    assert.equal(after.misfireUsed, true);
  });

  it('clears the hint as soon as a shot goes out', () => {
    const state = run(
      loaded(),
      { type: 'aim_start' },
      { type: 'misfire' },
      { type: 'aim_start' },
      { type: 'fired', shot: shot() }
    );
    assert.equal(state.showMisfireHint, false);
  });
});

describe('the warm-up', () => {
  it('runs its own flight and result before the real thing', () => {
    let state = loaded({ warmupPending: true });
    assert.equal(state.phase, 'warmup_aim');
    assert.ok(isWarmup(state.phase));

    state = reduce(state, { type: 'fired', shot: shot() });
    assert.equal(state.phase, 'warmup_flight');

    state = reduce(state, { type: 'impact' });
    assert.equal(state.phase, 'warmup_result');

    state = reduce(state, { type: 'warmup_done' });
    assert.equal(state.phase, 'interstitial');
  });

  it('is never re-entered, even if the server has not caught up', () => {
    // The reload that follows the interstitial can still see `warmupPending: true`
    // if `/api/warmup-done` is slow or failed offline. Sending the player back
    // into the warm-up they just finished would be an unbreakable loop.
    const after = run(
      loaded({ warmupPending: true }),
      { type: 'fired', shot: shot() },
      { type: 'impact' },
      { type: 'warmup_done' },
      {
        type: 'loaded',
        server: serverState({ warmupPending: true }),
        clockOffset: 0,
        practiceBest: 0,
        practiceTries: 0,
      }
    );
    assert.equal(after.phase, 'ready');
  });

  it('does not record a result', () => {
    const state = run(
      loaded({ warmupPending: true }),
      { type: 'fired', shot: shot({ score: 99.4 }) },
      { type: 'impact' }
    );
    assert.equal(state.result, null);
  });
});

describe('practice', () => {
  it('is only reachable from the result screen', () => {
    const state = run(
      loaded(),
      { type: 'aim_start' },
      { type: 'fired', shot: shot() },
      { type: 'impact' },
      { type: 'confirmed', result, response: null },
      { type: 'begin_practice' }
    );
    assert.equal(state.phase, 'practice_aim');
    assert.ok(isPractice(state.phase));
  });

  it('never touches the official result', () => {
    const state = run(
      loaded(),
      { type: 'aim_start' },
      { type: 'fired', shot: shot() },
      { type: 'impact' },
      { type: 'confirmed', result, response: null },
      { type: 'begin_practice' },
      { type: 'fired', shot: shot({ score: 100, isPerfect: true }) },
      { type: 'impact' },
      { type: 'practice_scored', best: 100, tries: 14, shot: shot({ score: 100 }) }
    );
    // Back to aiming, not to a result: practice has no terminal state any more.
    assert.equal(state.phase, 'practice_aim');
    assert.equal(state.result?.score, 82.5, 'the ranked score must not move');
    assert.equal(state.practiceBest, 100);
    assert.equal(state.practiceTries, 14);
  });

  /*
   * The loop a player reported as tedious: every practice shot ended on the
   * full result panel and required tapping `Again` to aim once more. Ten shots
   * meant ten taps and twenty camera moves. The landing now re-arms, so these
   * tests state what has to stay true for the chain to work.
   */
  it('re-arms itself, so a chain of shots needs no button', () => {
    let state = run(loaded(), { type: 'begin_practice' });
    for (let i = 1; i <= 3; i++) {
      state = run(
        state,
        { type: 'aim_start' },
        { type: 'fired', shot: shot({ score: 50 + i }) },
        { type: 'impact' },
        { type: 'practice_scored', best: 53, tries: i, shot: shot({ score: 50 + i }) }
      );
      assert.equal(state.phase, 'practice_aim', `stalled after shot ${i}`);
      assert.equal(state.charging, false, `still charging after shot ${i}`);
    }
    assert.equal(state.practiceTries, 3);
  });

  it('keeps the last attempt readable while the next one is thrown', () => {
    // `practiceLast` is not `shot`: the scene's trajectory is replaced the
    // instant the player starts the next throw, and the number they are
    // reading must not blink out with it.
    const landed = run(
      loaded(),
      { type: 'begin_practice' },
      { type: 'fired', shot: shot({ score: 71.5 }) },
      { type: 'impact' },
      { type: 'practice_scored', best: 71.5, tries: 1, shot: shot({ score: 71.5 }) }
    );
    const charging = run(landed, { type: 'aim_start' }, {
      type: 'fired',
      shot: shot({ score: 12 }),
    });
    assert.equal(charging.practiceLast?.score, 71.5);
  });

  it('measures the delta against the previous attempt only', () => {
    const first = run(
      loaded(),
      { type: 'begin_practice' },
      { type: 'practice_scored', best: 40, tries: 1, shot: shot({ score: 40 }) }
    );
    assert.equal(first.practicePrevScore, null, 'the first shot has no delta');
    assert.equal(first.practiceIsBest, false, 'the first shot beat nothing');

    const second = run(first, {
      type: 'practice_scored',
      best: 62,
      tries: 2,
      shot: shot({ score: 62 }),
    });
    assert.equal(second.practicePrevScore, 40);
    assert.equal(second.practiceIsBest, true);

    const third = run(second, {
      type: 'practice_scored',
      best: 62,
      tries: 3,
      shot: shot({ score: 51 }),
    });
    assert.equal(third.practicePrevScore, 62);
    assert.equal(third.practiceIsBest, false, 'a worse shot is not a best');
  });

  it('starts a fresh lane each time practice is entered', () => {
    const state = run(
      loaded(),
      { type: 'begin_practice' },
      { type: 'practice_scored', best: 90, tries: 1, shot: shot({ score: 90 }) },
      { type: 'leave_practice' },
      { type: 'begin_practice' }
    );
    assert.equal(state.practiceLast, null);
    assert.equal(state.practicePrevScore, null);
    // The day's tally survives, because it is the day's, not the visit's.
    assert.equal(state.practiceBest, 90);
  });

  it('restores the official shot when leaving practice', () => {
    const official = shot({ score: 82.5 });
    const state = run(
      loaded(),
      { type: 'aim_start' },
      { type: 'fired', shot: official },
      { type: 'impact' },
      { type: 'confirmed', result, response: null },
      { type: 'begin_practice' },
      { type: 'fired', shot: shot({ score: 100 }) },
      { type: 'impact' },
      { type: 'leave_practice' }
    );
    assert.equal(state.phase, 'result');
    assert.equal(state.shot, official);
  });
});

describe('transverse states', () => {
  it('never replaces the phase the player is looking at', () => {
    const state = run(
      loaded(),
      { type: 'aim_start' },
      { type: 'fired', shot: shot() },
      { type: 'impact' },
      { type: 'awaiting_server' },
      { type: 'transient', value: 'offline' }
    );
    assert.equal(state.phase, 'scoring_pending');
    assert.equal(state.transient, 'offline');
  });

  it('clears once the server confirms', () => {
    const state = run(
      loaded(),
      { type: 'aim_start' },
      { type: 'fired', shot: shot() },
      { type: 'transient', value: 'submitting' },
      { type: 'impact' },
      { type: 'confirmed', result, response: null }
    );
    assert.equal(state.transient, null);
  });
});

describe('a server answer that arrives mid-flight', () => {
  // Reported from a real playtest: a brand new account shot, and the result
  // screen said "streak 0". A second account on a slower connection said 1.
  // The server had answered before the ball landed.

  it('does not cut the flight short', () => {
    const state = run(
      loaded(),
      { type: 'aim_start' },
      { type: 'fired', shot: shot() },
      { type: 'confirmed', result, response }
    );
    assert.equal(
      state.phase,
      'in_flight',
      'the shot must stay in the air until it lands'
    );
    assert.equal(state.result?.score, 82.5, 'but the answer is recorded');
  });

  it('keeps the streak the server sent', () => {
    // The confirmation is dispatched twice: once when it arrives, once at
    // impact. The second carried no response, and overwriting the first with
    // null sent the result screen back to the state loaded before the shot --
    // which for a new account is a streak of zero.
    const state = run(
      loaded(),
      { type: 'aim_start' },
      { type: 'fired', shot: shot() },
      { type: 'confirmed', result, response },
      { type: 'impact' },
      { type: 'confirmed', result, response: null }
    );
    assert.equal(state.phase, 'result');
    assert.equal(state.submission?.streak.current, 1);
  });

  it('reaches the same place whichever order the two arrive in', () => {
    const serverFirst = run(
      loaded(),
      { type: 'aim_start' },
      { type: 'fired', shot: shot() },
      { type: 'confirmed', result, response },
      { type: 'impact' },
      { type: 'confirmed', result, response: null }
    );
    const impactFirst = run(
      loaded(),
      { type: 'aim_start' },
      { type: 'fired', shot: shot() },
      { type: 'impact' },
      { type: 'awaiting_server' },
      { type: 'confirmed', result, response }
    );

    assert.equal(serverFirst.phase, impactFirst.phase);
    assert.deepEqual(serverFirst.submission, impactFirst.submission);
    assert.deepEqual(serverFirst.result, impactFirst.result);
  });
});

/**
 * The gauge prompt reads `charging`, and `charging` is not the phase.
 *
 * It used to be `phase === 'aiming' || phase === 'practice_aim'`, which was two
 * mirrored lies. The official shot owns a phase for each state -- `ready` then
 * `aiming` -- so it read correctly. The warm-up and practice each have a single
 * phase covering both states, so the warm-up said HOLD TO AIM while the player
 * was already holding, and practice said RELEASE TO SHOOT before they had
 * touched the screen. The warm-up one now happens to every player every day.
 */
describe('holding the gauge', () => {
  const press = (state: GameState): GameState =>
    reduce(state, { type: 'aim_start' });

  it('is not charging before the screen is touched, in any mode', () => {
    const official = loaded();
    assert.equal(official.charging, false);

    const warmup = loaded({ warmupPending: true });
    assert.equal(warmup.phase, 'warmup_aim');
    assert.equal(warmup.charging, false, 'the warm-up must ask for a hold');

    const practice = reduce(
      { ...loaded(), phase: 'result' },
      { type: 'begin_practice' }
    );
    assert.equal(practice.phase, 'practice_aim');
    assert.equal(
      practice.charging,
      false,
      'practice must not ask for a release before the press'
    );
  });

  it('is charging once the screen is held, in any mode', () => {
    for (const [label, state] of [
      ['official', loaded()],
      ['warm-up', loaded({ warmupPending: true })],
      [
        'practice',
        reduce({ ...loaded(), phase: 'result' }, { type: 'begin_practice' }),
      ],
    ] as const) {
      assert.equal(press(state).charging, true, `${label} must charge`);
    }
  });

  it('still moves the official shot from ready to aiming', () => {
    // Other code reads those phases; only the prompt moved off them.
    assert.equal(press(loaded()).phase, 'aiming');
  });

  it('leaves the warm-up and practice phases alone while charging', () => {
    assert.equal(press(loaded({ warmupPending: true })).phase, 'warmup_aim');
    const practice = reduce(
      { ...loaded(), phase: 'result' },
      { type: 'begin_practice' }
    );
    assert.equal(press(practice).phase, 'practice_aim');
  });

  it('stops charging when the shot leaves the hand', () => {
    const fired = reduce(press(loaded()), { type: 'fired', shot: shot() });
    assert.equal(fired.charging, false);
  });

  it('stops charging when a misfire is caught', () => {
    // A flick in a pocket returns to `ready`, and the prompt has to go back to
    // asking for a hold rather than stranding a "release" on screen.
    const misfired = reduce(press(loaded()), { type: 'misfire' });
    assert.equal(misfired.charging, false);
    assert.equal(misfired.phase, 'ready');
  });

  it('stops charging on every exit from an aiming phase', () => {
    const held = press(loaded({ warmupPending: true }));
    assert.equal(reduce(held, { type: 'warmup_done' }).charging, false);

    const practising = press(
      reduce({ ...loaded(), phase: 'result' }, { type: 'begin_practice' })
    );
    assert.equal(reduce(practising, { type: 'leave_practice' }).charging, false);
  });
});
