import { useEffect, useState } from 'react';
import type { JSX, ReactNode } from 'react';

import {
  COPY,
  cliffLine,
  formatScore,
  impactDirection,
  nextShotLine,
  perfectsTodayLine,
  standingFor,
  streakTextLine,
  streakResetLine,
  tomorrowTextLine,
  verdictFor,
  verdictTone,
} from '../../shared/copy.ts';
import type {
  ModifierId,
  ResultSummary,
  StreakState,
} from '../../shared/types.ts';
import { CASCADE_STEP_MS, COUNT_UP_MS, easeOutCubic, prefersReducedMotion } from '../motion.ts';
import { paletteFor } from '../theme.ts';
import { Glyph } from '../ui/Glyph.tsx';
import { COPY_GLYPH, FLAME_GLYPH, MODIFIER_GLYPH } from '../ui/glyphs.ts';

/**
 * The result panel (§6, wireframe G).
 *
 * The old one answered *score, distance, chip, streak, actions*. §1.2's audit
 * is that the brain asks a different set, in a different order — **where did I
 * land, was that good, what did I score, how do I compare, what is my streak,
 * what can I do, when is the next one** — and that the first two had no visual
 * answer at all, because the scene was wiped to draw the number.
 *
 * So the scene stays (the panel rises over a frozen world) and this component
 * answers the other five in that order, once each.
 *
 * **One filled coral block, and it is the CTA.** The old screen had two — the
 * percentile pill and `POST MY SHOT` — competing for the same eye. The chip is
 * coral *text* now, which §13 allows and a filled block is not.
 */

const CASCADE_STEPS = 5;

/**
 * Timer-driven, not CSS `animation-delay`. A document timeline stalls while the
 * tab is unfocused, and a `POST MY SHOT` held at `opacity: 0` by a frozen delay
 * is a button the player cannot press. The worst case here is that everything
 * appears at once, which is the reduced-motion behaviour anyway.
 */
const useCascade = (active: boolean): number => {
  const animate = active && !prefersReducedMotion();
  const [revealed, setRevealed] = useState(animate ? 0 : CASCADE_STEPS);

  useEffect(() => {
    if (!animate) return;
    const timers = Array.from({ length: CASCADE_STEPS }, (_, i) =>
      window.setTimeout(() => setRevealed(i + 1), COUNT_UP_MS + i * CASCADE_STEP_MS)
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [animate]);

  return revealed;
};

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

const Step = (props: {
  readonly index: number;
  readonly revealed: number;
  readonly children: ReactNode;
}): JSX.Element => {
  const shown = props.revealed > props.index;
  return (
    <div
      className="transition-[opacity,transform] duration-300 ease-out"
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? 'translateY(0)' : 'translateY(8px)',
      }}
    >
      {props.children}
    </div>
  );
};

const TONE_CLASS = {
  gold: 'text-[color:var(--color-gold)]',
  coral: 'text-[color:var(--color-coral)]',
  ink: 'text-[color:var(--color-ink)]',
  mist: 'text-[color:var(--color-mist)]',
} as const;

export const ResultV2 = (props: {
  readonly result: ResultSummary;
  readonly targetR: number;
  readonly streak: StreakState;
  readonly tomorrow: ModifierId;
  readonly msToRollover: number;
  readonly perfectsToday: number;
  readonly pending: boolean;
  readonly practice: boolean;
  readonly practiceBest: number;
  readonly practiceTries: number;
  readonly sharedUrl: string | null;
  readonly sharing: boolean;
  /** First reveal cascades; coming back from practice is instant (§6). */
  readonly firstReveal: boolean;
  readonly onShare: () => void;
  readonly onCopy: () => void;
  readonly onPractice: () => void;
  readonly onBoard: (() => void) | null;
  readonly onLeavePractice: () => void;
}): JSX.Element => {
  const { result } = props;
  const animate = !props.practice && props.firstReveal;
  const score = useCountUp(result.score, animate);
  const revealed = useCascade(animate);

  const verdict = verdictFor({
    score: result.score,
    dx: result.dx,
    impact: result.impact,
    targetR: props.targetR,
  });
  const tone = verdictTone(verdict);
  const standing = standingFor(result.rank, result.total);
  const tomorrowSky = paletteFor(props.tomorrow, 0).skyHigh;

  return (
    <section className="w-full rounded-t-[24px] bg-[color:var(--color-bg-elevated)] px-5 pt-4 pb-4">
      {/* 2 and 3: the word and the number, on one line (§6). */}
      <div className="flex items-baseline justify-between gap-3">
        <span
          className={`text-[28px] font-extrabold tracking-[-0.01em] ${TONE_CLASS[tone]}`}
        >
          {props.practice ? COPY.practiceWatermark : verdict}
        </span>
        <span
          className={`tabular text-[44px] font-extrabold leading-none ${
            props.practice ? 'italic text-[color:var(--color-mist)]' : ''
          }`}
        >
          {formatScore(score)}
        </span>
      </div>

      {/* 1, in words. The picture of it is in the scene behind this panel. */}
      <div className="mt-1 text-[13px] text-[color:var(--color-mist)]">
        {result.impact === 'CLIFF'
          ? cliffLine(result.cliffDrop)
          : impactDirection({
              signedDx: result.signedDx,
              dx: result.dx,
              impact: result.impact,
              cliffDrop: result.cliffDrop,
              targetR: props.targetR,
            })}
      </div>

      {props.practice ? (
        <PracticeActions
          best={props.practiceBest}
          tries={props.practiceTries}
          onAgain={props.onPractice}
          onLeave={props.onLeavePractice}
        />
      ) : (
        <>
          {/* 4: how the day compares. */}
          <Step index={0} revealed={revealed}>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px]">
              {props.pending ? (
                <span className="text-[color:var(--color-mist)]">
                  {COPY.scoringPending}
                </span>
              ) : (
                <>
                  <span
                    className={`font-extrabold tabular ${
                      standing.chip === 'gold'
                        ? 'text-[color:var(--color-gold)]'
                        : standing.chip === 'coral'
                          ? 'text-[color:var(--color-coral)]'
                          : 'text-[color:var(--color-ink)]'
                    }`}
                  >
                    {standing.line}
                  </span>
                  {standing.rankLine && (
                    <span className="tabular text-[color:var(--color-mist)]">
                      {standing.rankLine}
                    </span>
                  )}
                </>
              )}
            </div>
          </Step>

          {/* 5: the streak. */}
          <Step index={1} revealed={revealed}>
            <div className="mt-2 flex items-center gap-1.5 text-[15px] font-semibold tabular">
              <span className="text-[color:var(--color-coral)]">
                <Glyph paths={FLAME_GLYPH} />
              </span>
              {props.streak.justReset
                ? streakResetLine(props.streak.longest)
                : streakTextLine(props.streak.current)}
            </div>
          </Step>

          {result.isPerfect && props.perfectsToday > 0 && (
            <Step index={2} revealed={revealed}>
              <div className="mt-1 text-[13px] text-[color:var(--color-gold)]">
                {perfectsTodayLine(props.perfectsToday)}
              </div>
            </Step>
          )}

          {/* 6: what to do. One filled block, then two equal ghosts. */}
          <Step index={3} revealed={revealed}>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={props.onShare}
                disabled={props.sharing || props.sharedUrl !== null}
                className="h-[56px] w-full rounded-button bg-[color:var(--color-coral)] text-[17px] font-extrabold tracking-wide text-bg transition-opacity disabled:opacity-55"
              >
                {props.sharedUrl ? COPY.sharePosted : COPY.postMyShot}
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={props.onPractice}
                  className="h-11 min-h-12 flex-1 rounded-button border border-white/20 text-[15px]"
                >
                  {COPY.practice}
                </button>
                {props.onBoard && (
                  <button
                    type="button"
                    onClick={props.onBoard}
                    className="h-11 min-h-12 flex-1 rounded-button border border-white/20 text-[15px]"
                  >
                    {COPY.viewBoard}
                  </button>
                )}
                <button
                  type="button"
                  onClick={props.onCopy}
                  aria-label={COPY.copyCard}
                  className="grid h-11 min-h-12 w-12 place-items-center rounded-button border border-white/20 text-[color:var(--color-mist)]"
                >
                  <Glyph paths={COPY_GLYPH} size={16} />
                </button>
              </div>
            </div>
          </Step>

          {/* 7: tomorrow, as a strip of its sky and one line. */}
          <Step index={4} revealed={revealed}>
            <div className="mt-4">
              <div
                className="h-1 w-full rounded-full"
                style={{ backgroundColor: tomorrowSky }}
                aria-hidden="true"
              />
              <div className="mt-2 flex items-center justify-between text-[13px] text-[color:var(--color-mist)]">
                <span className="flex items-center gap-1.5">
                  <Glyph paths={MODIFIER_GLYPH[props.tomorrow]} />
                  {tomorrowTextLine(props.tomorrow)}
                </span>
                <span className="tabular">{nextShotLine(props.msToRollover)}</span>
              </div>
            </div>
          </Step>
        </>
      )}
    </section>
  );
};

/**
 * Practice keeps one private number and offers no way to share (GDD 20). The
 * score above is this attempt's; this line is the day's best, as context.
 */
const PracticeActions = (props: {
  readonly best: number;
  readonly tries: number;
  readonly onAgain: () => void;
  readonly onLeave: () => void;
}): JSX.Element => (
  <div className="mt-4 flex flex-col gap-3">
    {props.tries > 0 && (
      <div className="text-[13px] italic tabular text-[color:var(--color-mist)]">
        {`Practice best today: ${formatScore(props.best)} (in ${props.tries} ${
          props.tries === 1 ? 'try' : 'tries'
        })`}
      </div>
    )}
    <div className="flex gap-2">
      <button
        type="button"
        onClick={props.onAgain}
        className="h-[56px] flex-1 rounded-button border border-white/25 text-[17px] font-bold"
      >
        {COPY.practiceAgain}
      </button>
      <button
        type="button"
        onClick={props.onLeave}
        className="h-[56px] flex-1 rounded-button text-[15px] text-[color:var(--color-mist)]"
      >
        {COPY.practiceLeave}
      </button>
    </div>
  </div>
);
