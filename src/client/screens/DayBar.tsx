import type { JSX } from 'react';

import { COPY, dayLabel, MODIFIER_LABEL } from '../../shared/copy.ts';
import type { ModifierId } from '../../shared/types.ts';
import { Glyph } from '../ui/Glyph.tsx';
import { FLAME_GLYPH, MODIFIER_GLYPH } from '../ui/glyphs.ts';

/**
 * The status bar of the day (GDD 9.9): number, modifier, streak, and the one
 * question mark that leads to the rules. Nothing else earns a place up here.
 */
export const DayBar = (props: {
  /** `null` for a logged-out visitor: the day is not theirs to see yet. */
  readonly displayDay: number | null;
  readonly modifier: ModifierId | null;
  readonly streak: number;
  readonly onHelp: () => void;
}): JSX.Element => (
  <header className="flex items-center gap-3 px-4 py-3 text-[13px] text-[color:var(--color-mist)]">
    <span className="font-bold tracking-wide text-[color:var(--color-ink)] tabular">
      {props.displayDay === null ? COPY.title : dayLabel(props.displayDay)}
    </span>
    <span className="flex min-w-0 items-center gap-1.5 truncate">
      {props.modifier === null ? (
        COPY.demoLabel
      ) : (
        <>
          <Glyph paths={MODIFIER_GLYPH[props.modifier]} />
          <span className="truncate">{MODIFIER_LABEL[props.modifier]}</span>
        </>
      )}
    </span>
    <span className="ml-auto flex items-center gap-3">
      {props.streak > 0 && (
        <span className="tabular flex items-center gap-1 font-semibold text-[color:var(--color-coral)]">
          <Glyph paths={FLAME_GLYPH} label={COPY.streakLabel} />
          {props.streak}
        </span>
      )}
      <button
        type="button"
        aria-label={COPY.helpTitle}
        onClick={props.onHelp}
        className="grid h-12 w-12 -my-3 place-items-center rounded-full text-[color:var(--color-mist)] transition-colors hover:text-[color:var(--color-ink)]"
      >
        ?
      </button>
    </span>
  </header>
);
