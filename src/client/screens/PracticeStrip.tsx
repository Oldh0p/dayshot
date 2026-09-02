import type { JSX, PointerEvent } from 'react';

import {
  COPY,
  formatScore,
  impactDirection,
  practiceBestChip,
  practiceDelta,
} from '../../shared/copy.ts';
import { unranked } from '../result-view.ts';
import type { ShotResult } from '../../shared/types.ts';

/**
 * Practice, after the `Again` button was deleted.
 *
 * The old loop showed the full result panel — the same slab the official shot
 * gets — and then required a tap to reopen aiming. Chaining ten shots meant ten
 * taps and twenty camera moves, and a player reported it as exactly that. There
 * is no terminal practice phase any more: the ball stops and the screen is
 * already armed, so this is not a result, it is a readout.
 *
 * Three fixed-height rows, inside the same `PANEL_SHARE` band the aiming layout
 * already reserves (142px at 320×568; this needs 130). Fixed heights are the
 * point: nothing on screen moves between attempts, so a player mid-chain never
 * has to re-find the number they are reading.
 *
 * What is deliberately absent: a verdict word (practice is already said by the
 * canvas badge, the desaturated palette and the italic score), the wind and
 * distance cards (constant all day, and read before the official shot), a tries
 * sentence, any count-up or cascade, and any filled coral block — practice has
 * no call to action.
 */
export const PracticeStrip = (props: {
  /** The attempt just landed, or `null` before the first one. */
  readonly last: ShotResult | null;
  readonly prevScore: number | null;
  readonly isBest: boolean;
  readonly best: number;
  readonly tries: number;
  readonly targetR: number;
  /** The mat's centre, so a miss can be told short from long. */
  readonly distance: number;
  readonly charging: boolean;
  readonly onLeave: () => void;
}): JSX.Element => {
  const shot = props.last;
  const delta =
    shot && props.prevScore !== null ? shot.score - props.prevScore : null;

  /*
   * `unranked` is where the miss gets its sign, and it is the same call the
   * official panel makes. It used to hard-code `signedDx: 0`, which
   * `impactDirection` reads as `0 < 0 ? 'short' : 'over'` -- so every shot that
   * came through here was announced as long, including the ones that fell
   * short. Which way to correct is the one thing practice exists to tell you.
   */
  const view = unranked(shot, props.distance);

  return (
    <div className="relative px-5 pt-2">
      {/*
        Behind the strip only, so the 15px and 12px lines hold their contrast
        over a bright sky. Nothing above the strip is dimmed: the whole point of
        this screen is that the world stays visible.
      */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-t from-[color:var(--color-bg)] to-transparent"
      />

      <div className="relative">
        <div role="status" aria-live="polite">
          {/* A: the number the player asked to keep on screen. */}
          <div className="flex h-11 items-baseline justify-between gap-3">
            <span className="tabular text-[44px] font-extrabold italic leading-none text-[color:var(--color-ink)]">
              {shot ? formatScore(shot.score) : ''}
            </span>
            {shot && props.isBest ? (
              <span className="tabular text-[15px] font-bold tracking-[0.06em] text-[color:var(--color-gold)]">
                {COPY.practiceNewBest}
              </span>
            ) : (
              delta !== null && (
                <span
                  className={`tabular text-[15px] font-bold ${
                    delta > 0
                      ? 'text-[color:var(--color-ink)]'
                      : 'text-[color:var(--color-mist)]'
                  }`}
                >
                  {practiceDelta(delta)}
                </span>
              )
            )}
          </div>

          {/* B: which way to correct, and the mark to beat. */}
          <div className="mt-1 flex h-[18px] items-baseline justify-between gap-3">
            <span className="truncate text-[15px] text-[color:var(--color-mist)]">
              {shot
                ? impactDirection({
                    signedDx: view.signedDx,
                    dx: view.dx,
                    impact: view.impact,
                    cliffDrop: view.cliffDrop,
                    targetR: props.targetR,
                  })
                : ''}
            </span>
            {props.tries > 0 && (
              <span className="tabular shrink-0 text-[12px] font-bold tracking-[0.06em] text-[color:var(--color-mist)]">
                {practiceBestChip(props.best)}
              </span>
            )}
          </div>
        </div>

        {/* C: what to do next, and the only way out. */}
        <div className="mt-2 flex h-12 items-center gap-3">
          <span
            className={`flex-1 text-center text-[15px] font-bold tracking-[0.12em] whitespace-nowrap text-[color:var(--color-mist)] ${
              props.charging ? '' : 'breathe'
            }`}
          >
            {props.charging ? COPY.releaseToShoot : COPY.holdToAim}
          </span>
          <button
            type="button"
            onClick={props.onLeave}
            /*
              The screen is a hold target now, so a tap meant for this button
              would otherwise bubble to the root and throw a shot on the way
              out.
            */
            onPointerDown={(event: PointerEvent) => event.stopPropagation()}
            onPointerUp={(event: PointerEvent) => event.stopPropagation()}
            className="h-12 shrink-0 rounded-button border border-white/25 px-4 text-[15px] text-[color:var(--color-ink)]"
          >
            {COPY.practiceLeave}
          </button>
        </div>
      </div>
    </div>
  );
};
