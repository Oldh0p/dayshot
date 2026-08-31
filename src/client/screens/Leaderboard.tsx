import type { JSX } from 'react';

import { formatScore } from '../../shared/copy.ts';
import type { LeaderboardEntry } from '../../shared/types.ts';

/**
 * Top three, then the player's own window (GDD 13).
 *
 * The window is the whole point: someone at #184 sees #181 to #187 and stays a
 * person in a race, instead of a number on page 47.
 */
export const Leaderboard = (props: {
  readonly top: readonly LeaderboardEntry[];
  readonly around: readonly LeaderboardEntry[];
}): JSX.Element | null => {
  if (props.top.length === 0) return null;

  const gap =
    props.around.length > 0 &&
    (props.around[0]?.rank ?? 0) > (props.top[props.top.length - 1]?.rank ?? 0) + 1;

  return (
    <div className="w-full px-6 pb-4 text-[15px]">
      <Rows entries={props.top} />
      {gap && (
        <div className="py-1 text-center text-[color:var(--color-mist)]">···</div>
      )}
      {!gap && props.around.length > 0 && <div className="h-1" />}
      <Rows entries={props.around.filter((e) => !props.top.some((t) => t.rank === e.rank))} />
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
          {entry.isMe ? 'YOU' : entry.username}
        </span>
        <span>{formatScore(entry.score)}</span>
      </div>
    ))}
  </>
);
