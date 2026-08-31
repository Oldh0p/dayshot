import { useEffect, useState } from 'react';
import type { JSX, ReactNode } from 'react';

import {
  cliffLine,
  COPY,
  formatScore,
  fromCenterLine,
  globalRankLine,
  impactBadge,
  nextShotLine,
  perfectRarityLine,
  showsGlobalRank,
  standingHeadline,
  streakLine,
  streakResetLine,
  tomorrowLine,
} from '../../shared/copy.ts';
import type {
  ModifierId,
  ResultSummary,
  StreakState,
} from '../../shared/types.ts';
import { CASCADE_STEP_MS, COUNT_UP_MS, easeOutCubic, prefersReducedMotion } from '../motion.ts';

/**
 * The most important screen in the game (GDD 18).
 *
 * It is three things at once: the emotional payment, the object people share,
 * and tomorrow's appointment. The order matters more than the layout — score,
 * then the physical anchor, then the percentile, then the rest — because the
 * read should feel like a small story rather than a table.
 */

const useCountUp = (target: number, active: boolean): number => {
  const animate = active && !prefersReducedMotion();
  const [progress, setProgress] = useState(animate ? 0 : 1);

  useEffect(() => {
    if (!animate) return;
    let frame = 0;
    const started = performance.now();
    const step = (now: number): void => {
      setProgress(Math.min(1, (now - started) / COUNT_UP_MS));
      if (now - started < COUNT_UP_MS) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [animate]);

  return animate ? target * easeOutCubic(progress) : target;
};

const CASCADE_STEPS = 5;

/**
 * Reveals the result lines one at a time, 300 ms apart (GDD 18): the read
 * should feel like a small story rather than a table arriving at once.
 *
 * Driven by timers rather than CSS animation delays on purpose. A document
 * timeline stalls while the tab is unfocused, and a `POST MY SHOT` button held
 * at `opacity: 0` by a frozen delay would be a button the player cannot press.
 * With timers the worst case is that everything appears at once, which is
 * exactly the reduced-motion behaviour anyway.
 */
const useCascade = (active: boolean): number => {
  const animate = active && !prefersReducedMotion();
  const [revealed, setRevealed] = useState(animate ? 0 : CASCADE_STEPS);

  useEffect(() => {
    if (!animate) return;
    const timers = Array.from({ length: CASCADE_STEPS }, (_, i) =>
      window.setTimeout(
        () => setRevealed(i + 1),
        COUNT_UP_MS + i * CASCADE_STEP_MS
      )
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [animate]);

  return revealed;
};

const Cascade = (props: {
  readonly step: number;
  readonly revealed: number;
  readonly children: ReactNode;
}): JSX.Element => {
  const shown = props.revealed > props.step;
  return (
    <div
      className="transition-[opacity,transform] duration-300 ease-out"
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? 'translateY(0)' : 'translateY(10px)',
      }}
    >
      {props.children}
    </div>
  );
};

export const Result = (props: {
  readonly result: ResultSummary;
  readonly streak: StreakState;
  readonly tomorrow: ModifierId;
  readonly msToRollover: number;
  readonly perfectsToday: number;
  readonly shotsToday: number;
  readonly pending: boolean;
  readonly practice: boolean;
  readonly practiceBest: number;
  readonly practiceTries: number;
  readonly sharedUrl: string | null;
  readonly sharing: boolean;
  readonly onShare: () => void;
  readonly onCopy: () => void;
  readonly onPractice: () => void;
  readonly onLeaveboard: () => void;
}): JSX.Element => {
  const score = useCountUp(props.result.score, !props.practice);
  const revealed = useCascade(!props.practice);
  const badge = impactBadge(props.result.impact);

  return (
    <div className="flex w-full flex-col items-center gap-1 px-6 pb-5 text-center">
      {/* A Bullseye or a Perfect announces itself before the number does. */}
      {props.result.isPerfect && (
        <div className="pop mb-1 rounded-[14px] bg-[color:var(--color-gold)] px-4 py-1.5 text-[15px] font-extrabold tracking-wide text-[#141A26]">
          {COPY.perfectStamp}
        </div>
      )}
      {!props.result.isPerfect && props.result.isBullseye && (
        <div className="pop mb-1 text-[15px] font-extrabold tracking-[0.2em] text-[color:var(--color-gold)]">
          {COPY.bullseye}
        </div>
      )}
      {badge && (
        <div className="pop mb-1 text-[13px] font-bold tracking-[0.2em] text-[color:var(--color-mist)]">
          {badge}
        </div>
      )}

      <div
        className={`tabular text-[64px] font-extrabold leading-none ${
          props.practice ? 'italic text-[color:var(--color-mist)]' : ''
        }`}
      >
        {formatScore(score)}
      </div>

      <div className="text-[15px] text-[color:var(--color-mist)]">
        {props.result.impact === 'CLIFF'
          ? cliffLine(props.result.cliffDrop)
          : `🎯 ${fromCenterLine(props.result.dx)}`}
      </div>

      {props.practice ? (
        <PracticePanel
          best={props.practiceBest}
          tries={props.practiceTries}
          onLeave={props.onLeaveboard}
          onAgain={props.onPractice}
        />
      ) : (
        <>
          <Cascade step={0} revealed={revealed}>
            <div className="mt-3 inline-block rounded-[14px] bg-[color:var(--accent)] px-4 py-1.5 text-[20px] font-extrabold tracking-wide text-[#141A26] tabular">
              {props.pending
                ? COPY.scoringPending
                : standingHeadline(props.result.rank, props.result.total)}
            </div>
          </Cascade>

          {/* Only once the headline is a percentile; before that it would just
              repeat the rank the pill already shows. */}
          {(props.pending || showsGlobalRank(props.result.total)) && (
            <Cascade step={1} revealed={revealed}>
              <div className="mt-2 text-[15px] text-[color:var(--color-mist)] tabular">
                {props.pending ? '· · ·' : globalRankLine(props.result.rank)}
              </div>
            </Cascade>
          )}

          <Cascade step={2} revealed={revealed}>
            <div className="mt-1 text-[15px] font-semibold tabular">
              {props.streak.justReset
                ? streakResetLine(props.streak.longest)
                : streakLine(props.streak.current)}
            </div>
          </Cascade>

          {props.result.isPerfect && props.perfectsToday > 0 && (
            <Cascade step={3} revealed={revealed}>
              <div className="mt-1 text-[13px] text-[color:var(--color-gold)]">
                {perfectRarityLine(props.perfectsToday, props.shotsToday)}
              </div>
            </Cascade>
          )}

          <Cascade step={3} revealed={revealed}>
            <div className="mt-5 flex w-full flex-col items-stretch gap-3">
              <button
                type="button"
                onClick={props.onShare}
                disabled={props.sharing || props.sharedUrl !== null}
                className="min-h-12 w-full rounded-[14px] bg-[color:var(--accent)] px-5 text-[17px] font-extrabold tracking-wide text-[#141A26] transition-opacity disabled:opacity-55"
              >
                {props.sharedUrl ? COPY.sharePosted : COPY.postMyShot}
              </button>

              {/* Separate actions, never merged: a Reddit review requirement. */}
              <div className="flex items-center justify-center gap-5 text-[15px] text-[color:var(--color-mist)]">
                <button
                  type="button"
                  onClick={props.onPractice}
                  className="min-h-12 px-2 underline-offset-4 hover:underline"
                >
                  {COPY.practice}
                </button>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={props.onCopy}
                  className="min-h-12 px-2 underline-offset-4 hover:underline"
                >
                  {COPY.copyCard}
                </button>
              </div>
            </div>
          </Cascade>

          <Cascade step={4} revealed={revealed}>
            <div className="mt-4 text-[13px] text-[color:var(--color-mist)]">
              <div>{tomorrowLine(props.tomorrow)}</div>
              <div className="tabular">{nextShotLine(props.msToRollover)}</div>
            </div>
          </Cascade>
        </>
      )}
    </div>
  );
};

/**
 * Practice keeps one private statistic and offers no way to share (GDD 20).
 * The number is the fuel for tomorrow, not a trophy for today.
 */
const PracticePanel = (props: {
  readonly best: number;
  readonly tries: number;
  readonly onAgain: () => void;
  readonly onLeave: () => void;
}): JSX.Element => (
  <div className="mt-4 flex w-full flex-col items-center gap-3">
    <div className="text-[13px] italic text-[color:var(--color-mist)] tabular">
      {props.tries > 0
        ? `Practice best today: ${formatScore(props.best)} (in ${props.tries} ${
            props.tries === 1 ? 'try' : 'tries'
          })`
        : ''}
    </div>
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={props.onAgain}
        className="min-h-12 rounded-[14px] border border-white/25 px-5 text-[15px] font-semibold"
      >
        Again
      </button>
      <button
        type="button"
        onClick={props.onLeave}
        className="min-h-12 px-3 text-[15px] text-[color:var(--color-mist)] underline-offset-4 hover:underline"
      >
        Back to my shot
      </button>
    </div>
  </div>
);
