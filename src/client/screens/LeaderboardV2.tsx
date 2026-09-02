import type { JSX } from 'react';

import { boardEarly, COPY, formatCount, formatScore } from '../../shared/copy.ts';
import type { LeaderboardEntry } from '../../shared/types.ts';
import { boardState, distanceLabel, windowAround } from './board-math.ts';

/**
 * The day's board (§7, wireframe H).
 *
 * A panel over a darkened scene, never a screen of its own: §2's first rule is
 * that the world stays visible, and a leaderboard that replaces the game is a
 * leaderboard people leave.
 *
 * **The window is the point.** A top-10 tells 8,411 of 8,421 players nothing
 * except that they are not on it. Three leaders and then your own neighbours
 * keeps a player at #1,204 in a race with #1,203 and #1,205, which is a race
 * they can win tomorrow.
 */

const MEDAL = ['var(--color-gold)', 'var(--color-mist)', 'rgba(255,107,74,0.65)'];

const Row = (props: {
  readonly entry: LeaderboardEntry;
  readonly targetR: number;
  /** `null` outside the top three. `exactOptionalPropertyTypes` is on. */
  readonly medal: string | null;
}): JSX.Element => (
  <div
    className={`flex items-baseline gap-2 rounded-[8px] py-1.5 pr-2 pl-2 tabular ${
      props.entry.isMe
        ? 'bg-white/5 font-bold text-[color:var(--color-ink)]'
        : 'text-[color:var(--color-mist)]'
    }`}
    style={
      props.entry.isMe
        ? { boxShadow: 'inset 3px 0 0 0 var(--color-coral)' }
        : undefined
    }
  >
    {props.medal ? (
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: props.medal }}
        aria-hidden="true"
      />
    ) : (
      <span className="w-2 shrink-0" aria-hidden="true" />
    )}
    <span className="w-14 shrink-0 text-right text-[13px]">
      #{formatCount(props.entry.rank)}
    </span>
    <span className="min-w-0 flex-1 truncate text-[15px]">
      {props.entry.isMe ? COPY.boardYou : props.entry.username}
    </span>
    <span className="shrink-0 text-[15px] font-bold text-[color:var(--color-ink)]">
      {formatScore(props.entry.score)}
    </span>
    <span className="w-10 shrink-0 text-right text-[13px] text-[color:var(--color-mist)]">
      {distanceLabel(props.entry.score, props.targetR)}
    </span>
  </div>
);

export const LeaderboardV2 = (props: {
  readonly top: readonly LeaderboardEntry[];
  readonly around: readonly LeaderboardEntry[];
  readonly total: number;
  readonly targetR: number;
  /** Absent until the player has taken today's shot. */
  readonly standing: string | null;
  readonly onBack: () => void;
}): JSX.Element => {
  const window = windowAround(
    props.around.filter((e) => !props.top.some((t) => t.rank === e.rank))
  );
  const lastTop = props.top[props.top.length - 1]?.rank ?? 0;
  const gap = window.length > 0 && (window[0]?.rank ?? 0) > lastTop + 1;
  const state = boardState(props.total, window);

  return (
    <section className="panel-column safe-bottom w-full rounded-t-[24px] bg-[color:var(--color-bg-elevated)] px-4 pt-4 pb-4">
      <header className="flex items-baseline justify-between px-2 pb-2">
        <span className="text-[12px] font-bold tracking-[0.06em] text-[color:var(--color-mist)]">
          {COPY.boardTitle}
        </span>
        <span className="tabular text-[13px] text-[color:var(--color-mist)]">
          {`${formatCount(props.total)} ${props.total === 1 ? 'shot' : 'shots'}`}
        </span>
      </header>

      {state === 'early' ? (
        /* §7: three names is not a ranking, and pretending otherwise makes an
           empty day feel emptier. Being early is the better framing. */
        <p className="px-2 py-6 text-center text-[15px] text-[color:var(--color-mist)]">
          {boardEarly(props.total)}
        </p>
      ) : (
        <>
          {props.top.map((entry, i) => (
            <Row key={entry.rank} entry={entry} targetR={props.targetR} medal={MEDAL[i] ?? null} />
          ))}

          {gap && (
            <div
              className="py-1 text-center text-[13px] tracking-[0.3em] text-[color:var(--color-mist)]"
              aria-hidden="true"
            >
              · · ·
            </div>
          )}

          {state === 'ranked' ? (
            window.map((entry) => (
              <Row key={entry.rank} entry={entry} targetR={props.targetR} medal={null} />
            ))
          ) : (
            <p className="px-2 py-4 text-center text-[15px] text-[color:var(--color-mist)]">
              {COPY.boardNotPlayed}
            </p>
          )}

          {props.standing && (
            <p className="px-2 pt-3 text-[13px] text-[color:var(--color-mist)]">
              {props.standing}
            </p>
          )}
        </>
      )}

      <button
        type="button"
        onClick={props.onBack}
        className="mt-3 h-11 min-h-12 w-full rounded-button border border-white/20 text-[15px] font-semibold"
      >
        {COPY.boardBack}
      </button>
    </section>
  );
};
