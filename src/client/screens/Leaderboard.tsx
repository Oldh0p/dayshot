import type { JSX } from 'react';

import { COPY, formatScore } from '../../shared/copy.ts';
import type { LeaderboardEntry } from '../../shared/types.ts';

/**
 * Top three, then the player's own window (GDD 13).
 *
 * The window is the whole point: someone at #184 sees #181 to #187 and stays a
 * person in a race, instead of a number on page 47.
 *
 * **A page of its own, reached with a button.** It used to sit stacked under
 * the result, which on a phone-sized post pushed the pair past the viewport and
 * made the web view scroll -- forbidden by Reddit's review rules, because a
 * scroll inside the post swallows the swipe the feed was waiting for. Ten rows
 * and a verdict do not fit together on a short screen, so they no longer try to.
 */
export const Leaderboard = (props: {
  readonly top: readonly LeaderboardEntry[];
  readonly around: readonly LeaderboardEntry[];
  readonly onBack: () => void;
}): JSX.Element | null => {
  if (props.top.length === 0) return null;

  const window = props.around.filter(
    (e) => !props.top.some((t) => t.rank === e.rank)
  );
  const lastTop = props.top[props.top.length - 1]?.rank ?? 0;
  const gap = window.length > 0 && (window[0]?.rank ?? 0) > lastTop + 1;

  return (
    <div className="flex w-full flex-col px-6 pb-4 text-[15px]">
      <div className="pb-2 text-center text-[13px] font-semibold tracking-[0.3em] text-[color:var(--color-mist)]">
        {COPY.boardTitle}
      </div>

      <Rows entries={props.top} />
      {gap && (
        <div className="py-1 text-center text-[color:var(--color-mist)]">
          ···
        </div>
      )}
      {!gap && window.length > 0 && <div className="h-1" />}
      <Rows entries={window} />

      <button
        type="button"
        onClick={props.onBack}
        className="mt-4 min-h-12 w-full rounded-[14px] border border-white/20 text-[15px] font-semibold"
      >
        {COPY.boardBack}
      </button>
    </div>
  );
};

const Rows = (props: {
  readonly entries: readonly LeaderboardEntry[];
}): JSX.Element => (
  <>
    {props.entries.map((entry) => (
      <div
        key={entry.rank}
        className={`flex items-baseline gap-3 py-1 tabular ${
          entry.isMe
            ? 'font-extrabold text-[color:var(--color-ink)]'
            : 'text-[color:var(--color-mist)]'
        }`}
      >
        <span className="w-12 text-right">#{entry.rank}</span>
        <span className="flex-1 truncate">
          {entry.isMe ? COPY.boardYou : entry.username}
        </span>
        <span>{formatScore(entry.score)}</span>
      </div>
    ))}
  </>
);
