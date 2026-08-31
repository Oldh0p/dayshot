import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { JSX } from 'react';
import { showLoginPrompt, showToast } from '@devvit/web/client';

import { COPY, shareFormatA, shareFormatB } from '../shared/copy.ts';
import { generateLevel } from '../shared/sim.ts';
import type { ResultSummary, ShotResult } from '../shared/types.ts';
import {
  alreadySharedUrl,
  completeWarmup,
  fetchLeaderboard,
  fetchState,
  postShareComment,
  track,
} from './api.ts';
import {
  INITIAL_STATE,
  INTERSTITIAL_MS,
  isPractice,
  isWarmup,
  reduce,
} from './machine.ts';
import type { QueueOutcome } from './queue.ts';
import { ShotQueue } from './queue.ts';
import { useScene } from './scene/useScene.ts';
import { Conditions } from './screens/Conditions.tsx';
import { DayBar } from './screens/DayBar.tsx';
import { Leaderboard } from './screens/Leaderboard.tsx';
import {
  DayRolled,
  HelpSheet,
  LoggedOut,
  ShareConsent,
  StatusBanner,
} from './screens/Overlays.tsx';
import { Result } from './screens/Result.tsx';
import {
  markHelpSeen,
  readPractice,
  recordPractice,
  soundEnabled,
} from './storage.ts';
import { applyPalette, paletteFor } from './theme.ts';

/**
 * The game.
 *
 * The layout follows GDD 28: a thin bar for the day, roughly two thirds of the
 * height for the scene, and the low third for the conditions, the prompt, and
 * then the result panel. The whole surface is the trigger — there is no button
 * to aim at with a thumb, and nothing else is interactive while charging.
 */
export const App = (): JSX.Element => {
  const [state, dispatch] = useReducer(reduce, INITIAL_STATE);
  const [showHelp, setShowHelp] = useState(false);
  const [askConsent, setAskConsent] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [soundOn, setSoundOn] = useState(soundEnabled);
  /**
   * The countdown reads this rather than calling `Date.now()` while rendering,
   * so render stays a pure function of state.
   */
  const [nowMs, setNowMs] = useState(() => Date.now());

  const queue = useRef<ShotQueue>(new ShotQueue());
  const confirmed = useRef<ResultSummary | null>(null);

  const server = state.server;

  // -- Leaderboard -----------------------------------------------------------

  const refreshBoard = useCallback(async (): Promise<void> => {
    const response = await fetchLeaderboard();
    if (response.ok) dispatch({ type: 'board', board: response.data });
  }, []);

  // -- Submission ------------------------------------------------------------

  const handleQueueOutcome = useCallback(
    (outcome: QueueOutcome): void => {
      if (outcome.status === 'confirmed') {
        confirmed.current = outcome.result;
        dispatch({
          type: 'confirmed',
          result: outcome.result,
          response: outcome.response ?? null,
        });
        void refreshBoard();
        track({
          name: 'shot_scored',
          props: { bullseye: outcome.result.isBullseye },
        });
        return;
      }
      if (outcome.status === 'day_rolled') {
        dispatch({ type: 'transient', value: 'day_rolled' });
        return;
      }
      if (outcome.status === 'logged_out') {
        dispatch({ type: 'logged_out' });
        return;
      }
      dispatch({ type: 'transient', value: 'error' });
    },
    [refreshBoard]
  );

  // -- Boot ------------------------------------------------------------------

  const load = useCallback(async (): Promise<void> => {
    const response = await fetchState();
    if (!response.ok) {
      dispatch({ type: 'transient', value: 'offline' });
      return;
    }

    const data = response.data;
    const practice = readPractice(data.dayNumber);
    dispatch({
      type: 'loaded',
      server: data,
      // Every countdown is drawn from the server's clock, never the device's.
      clockOffset: data.serverNow - Date.now(),
      practiceBest: practice.best,
      practiceTries: practice.tries,
    });
    track({ name: 'launch', props: { played: data.playedToday } });

    // A shot left behind by a crash, a reload or a closed tab still counts.
    const pending = queue.current.pending();
    if (pending && !data.playedToday) {
      dispatch({ type: 'transient', value: 'submitting' });
      queue.current.resume(pending, { onOutcome: handleQueueOutcome });
    }
  }, [handleQueueOutcome]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const online = (): void => dispatch({ type: 'transient', value: null });
    const offline = (): void => dispatch({ type: 'transient', value: 'offline' });
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, []);

  // -- The day ---------------------------------------------------------------

  const level = useMemo(
    () => (server ? generateLevel(server.dayNumber, server.rerollK) : null),
    [server]
  );

  const practiceMode = isPractice(state.phase);

  const palette = useMemo(
    () =>
      level
        ? paletteFor(level.modifier, level.paletteVariant, practiceMode)
        : paletteFor('CLEAR', 0),
    [level, practiceMode]
  );

  useEffect(() => {
    applyPalette(palette);
  }, [palette]);

  // -- Input -----------------------------------------------------------------

  const phase = state.phase;

  const onFire = useCallback(
    (shot: ShotResult, holdMs: number): void => {
      dispatch({ type: 'fired', shot });

      if (isWarmup(phase) || isPractice(phase) || !server) return;

      // The submission leaves now, while the ball is still in the air, so the
      // rank has usually arrived by the time the count-up finishes.
      confirmed.current = null;
      dispatch({ type: 'transient', value: 'submitting' });
      queue.current.enqueue(
        {
          dayNumber: server.dayNumber,
          holdMs,
          clientScore: shot.score,
          takenAt: Date.now() + state.clockOffset,
        },
        {
          onPending: () => dispatch({ type: 'transient', value: 'submitting' }),
          onOutcome: handleQueueOutcome,
        }
      );
      track({
        name: 'shot_submitted',
        props: { modifier: server.modifier.toLowerCase() },
      });
    },
    [server, phase, state.clockOffset, handleQueueOutcome]
  );

  const onImpact = useCallback(
    (shot: ShotResult): void => {
      dispatch({ type: 'impact' });

      if (isPractice(phase) && server) {
        const tally = recordPractice(server.dayNumber, shot.score);
        dispatch({
          type: 'practice_scored',
          best: tally.best,
          tries: tally.tries,
        });
        track({
          name: 'practice_shot',
          props: { try: Math.min(tally.tries, 99) },
        });
        return;
      }

      if (isWarmup(phase)) return;

      // The client's score is already on screen; only the rank waits.
      if (confirmed.current) {
        dispatch({
          type: 'confirmed',
          result: confirmed.current,
          response: null,
        });
      } else {
        dispatch({ type: 'awaiting_server' });
      }
    },
    [server, phase]
  );

  const onAimStart = useCallback((): void => {
    dispatch({ type: 'aim_start' });
    track({ name: 'aim_start' });
  }, []);

  const onMisfire = useCallback((): void => {
    dispatch({ type: 'misfire' });
  }, []);

  const { canvasRef, onPointerDown, onPointerUp } = useScene({
    level,
    palette,
    practice: practiceMode,
    canAim:
      phase === 'ready' ||
      phase === 'aiming' ||
      phase === 'warmup_aim' ||
      phase === 'practice_aim',
    guardMisfire: phase !== 'practice_aim' && !state.misfireUsed,
    shot: state.shot,
    ghost: practiceMode && state.ghost ? state.ghost.trajectory : null,
    onAimStart,
    onMisfire,
    onFire,
    onImpact,
  });

  // -- Beats -----------------------------------------------------------------

  useEffect(() => {
    if (phase !== 'warmup_result') return;
    const timer = window.setTimeout(() => {
      void (async () => {
        // Tell the server first, so the reload that follows sees the flag.
        // `warmupDone` in the machine covers the case where this never lands.
        await completeWarmup();
        dispatch({ type: 'warmup_done' });
      })();
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'interstitial') return;
    const timer = window.setTimeout(() => void load(), INTERSTITIAL_MS);
    return () => window.clearTimeout(timer);
  }, [phase, load]);

  useEffect(() => {
    if (phase === 'result') void refreshBoard();
  }, [phase, refreshBoard]);

  // -- Sharing ---------------------------------------------------------------

  const doShare = useCallback(async (): Promise<void> => {
    setSharing(true);
    const response = await postShareComment();
    setSharing(false);

    if (response.ok) {
      dispatch({ type: 'shared', url: response.data.commentUrl });
      showToast(COPY.sharePosted);
      track({ name: 'share_comment' });
      return;
    }
    const existing = alreadySharedUrl(response.data);
    if (existing) {
      dispatch({ type: 'shared', url: existing });
      showToast(COPY.shareAlreadyPosted);
      return;
    }
    showToast(COPY.genericError);
  }, []);

  const consentGiven = server?.shareConsent ?? false;

  const onShare = useCallback((): void => {
    // Posting as the player is a separate, explicit decision — asked once, then
    // remembered server-side (GDD IV.17, and Reddit's own review rules).
    if (consentGiven) {
      void doShare();
      return;
    }
    setAskConsent(true);
  }, [consentGiven, doShare]);

  const streakNow = state.submission?.streak ?? server?.streak ?? null;
  const streakCount = streakNow?.current ?? 0;
  const result = state.result;

  const onCopy = useCallback((): void => {
    if (!server || !result || !level) return;
    const card = {
      displayDay: server.displayDay,
      modifier: level.modifier,
      windBase: level.windBase,
      score: result.score,
      percentile: result.percentile,
      streak: streakCount,
      signedDx: result.signedDx,
      targetR: level.targetR,
    };
    void copyToClipboard(`${shareFormatA(card)}\n\n${shareFormatB(card)}`);
    track({ name: 'share_copy' });
  }, [server, result, streakCount, level]);

  const onHelp = useCallback((): void => {
    markHelpSeen();
    setShowHelp(true);
  }, []);

  const onPractice = useCallback((): void => {
    dispatch({ type: 'begin_practice' });
  }, []);

  const onLeavePractice = useCallback((): void => {
    dispatch({ type: 'leave_practice' });
  }, []);

  const onReload = useCallback((): void => {
    dispatch({ type: 'transient', value: null });
    void load();
  }, [load]);

  const onCloseHelp = useCallback((): void => setShowHelp(false), []);
  const onCancelConsent = useCallback((): void => setAskConsent(false), []);
  const onConfirmConsent = useCallback((): void => {
    setAskConsent(false);
    void doShare();
  }, [doShare]);

  // -- Render ----------------------------------------------------------------

  if (!server || !level || !streakNow) {
    return (
      <div className="grid h-full place-items-center">
        <div className="text-center">
          <div className="text-[34px] font-extrabold tracking-tight">
            {COPY.title}
          </div>
          <div className="mt-1 text-[15px] text-[color:var(--color-mist)]">
            {COPY.tagline}
          </div>
        </div>
      </div>
    );
  }

  const msToRollover = Math.max(
    0,
    (server.dayNumber + 1) * 86400000 - (nowMs + state.clockOffset)
  );

  const aiming =
    phase === 'ready' ||
    phase === 'aiming' ||
    phase === 'warmup_aim' ||
    phase === 'practice_aim';

  const charging = phase === 'aiming' || phase === 'practice_aim';

  const showResult =
    phase === 'result' ||
    phase === 'scoring_pending' ||
    phase === 'practice_result';

  const bannerText =
    state.transient === 'offline'
      ? COPY.offline
      : state.transient === 'submitting'
        ? COPY.submitQueued
        : state.transient === 'error'
          ? COPY.submitFailed
          : null;

  return (
    <div
      className={`relative h-full select-none overflow-hidden ${
        aiming ? 'touch-none' : ''
      }`}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/*
        The scene fills the frame and everything else sits on top of it. On the
        result screen it stays visible behind a scrim, frozen with the shot's
        trajectory still drawn — the verdict should never hide the evidence
        (GDD 18).
      */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {showResult && (
        <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/55 to-black/85" />
      )}

      {bannerText && <StatusBanner text={bannerText} />}

      <div className="relative flex h-full flex-col">
        <DayBar
          displayDay={server.displayDay}
          modifier={server.modifier}
          streak={streakNow.current}
          onHelp={onHelp}
        />

        {/*
          Bottom-anchored, and scrollable only when it has to be. The scene
          keeps whatever height the panel does not need.
        */}
        <section className="mt-auto max-h-[88%] w-full overflow-y-auto pb-2">
        {isWarmup(phase) && phase !== 'warmup_result' && (
          <div className="pb-3 text-center text-[15px] font-bold tracking-wide text-[color:var(--color-gold)]">
            {COPY.warmupBanner}
          </div>
        )}

        {phase === 'interstitial' && (
          <div className="rise pb-8 text-center">
            <div className="text-[22px] font-extrabold">{COPY.warmupOver}</div>
            <div className="mt-1 text-[15px] text-[color:var(--color-mist)]">
              {COPY.warmupOverSub}
            </div>
          </div>
        )}

        {aiming && (
          <>
            <Conditions
              level={level}
              hint={state.showMisfireHint ? COPY.misfireHint : null}
            />
            <div
              className={`pt-5 text-center text-[22px] font-extrabold tracking-[0.18em] ${
                charging ? '' : 'breathe'
              }`}
            >
              {charging ? COPY.releaseToShoot : COPY.holdToAim}
            </div>
          </>
        )}

        {phase === 'warmup_result' && state.shot && (
          <div className="pb-6 text-center">
            <div className="text-[13px] tracking-wide text-[color:var(--color-mist)]">
              {COPY.warmupResultLead}
            </div>
            <div className="tabular text-[56px] font-extrabold leading-none">
              {state.shot.score.toFixed(2)}
            </div>
            <div className="text-[15px] text-[color:var(--color-mist)]">
              🎯 {state.shot.dx.toFixed(1)} from center
            </div>
          </div>
        )}

        {showResult && (
          <>
            {(result ?? state.shot) && (
              <Result
                result={result ?? optimisticResult(state.shot)}
                streak={streakNow}
                tomorrow={server.tomorrowModifier}
                msToRollover={msToRollover}
                perfectsToday={
                  state.submission?.perfectCountToday ?? server.perfectsToday
                }
                shotsToday={server.shotsToday}
                pending={phase === 'scoring_pending'}
                practice={phase === 'practice_result'}
                practiceBest={state.practiceBest}
                practiceTries={state.practiceTries}
                sharedUrl={state.sharedUrl}
                sharing={sharing}
                onShare={onShare}
                onCopy={onCopy}
                onPractice={onPractice}
                onLeaveboard={onLeavePractice}
              />
            )}
            {phase === 'result' && state.board && (
              <Leaderboard top={state.board.top} around={state.board.around} />
            )}
          </>
        )}
        </section>
      </div>

      {showHelp && (
        <HelpSheet
          soundOn={soundOn}
          onToggleSound={setSoundOn}
          onClose={onCloseHelp}
        />
      )}

      {askConsent && (
        <ShareConsent
          onConfirm={onConfirmConsent}
          onCancel={onCancelConsent}
        />
      )}

      {state.transient === 'day_rolled' && <DayRolled onReload={onReload} />}

      {phase === 'logged_out' && <LoggedOut onLogin={showLoginPrompt} />}
    </div>
  );
};

/** Clipboard access lives outside the component so render stays analysable. */
const copyToClipboard = async (text: string): Promise<void> => {
  try {
    await navigator.clipboard.writeText(text);
    showToast(COPY.shareCopied);
  } catch {
    showToast(COPY.genericError);
  }
};

/**
 * The optimistic result, shown while the server confirms.
 *
 * The score is already certain — both sides run the same simulation — so only
 * the rank waits. If the server ever disagrees, its number replaces this one
 * (GDD 31).
 */
const optimisticResult = (shot: ShotResult | null): ResultSummary => ({
  score: shot?.score ?? 0,
  dx: shot?.dx ?? 0,
  signedDx: 0,
  impact: shot?.impact ?? 'GROUND',
  holdMs: 0,
  rank: 0,
  total: 0,
  percentile: 100,
  isBullseye: shot?.isBullseye ?? false,
  isPerfect: shot?.isPerfect ?? false,
});
