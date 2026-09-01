import type { JSX } from 'react';
import { Glyph } from '../ui/Glyph.tsx';
import { WindArrow } from '../ui/WindArrow.tsx';
import { MODIFIER_GLYPH } from '../ui/glyphs.ts';

import {
  COPY,
  distanceLine,
  formatWind,
  MODIFIER_LABEL,
  windDirectionLabel,
} from '../../shared/copy.ts';
import type { Level } from '../../shared/types.ts';

/**
 * The day's conditions, animated in one at a time on entry (GDD 5).
 *
 * This is the planning beat: the player reads the wind, the distance and the
 * modifier, and decides how hard to charge *before* touching the screen. It is
 * also the accessibility contract — the wind is always an arrow **and** a
 * number, never a colour (GDD 49).
 */
export const Conditions = (props: {
  readonly level: Level;
  readonly hint: string | null;
}): JSX.Element => (
  <div className="flex flex-col items-center gap-2 px-6">
    <div className="flex items-center gap-4 text-[15px] tabular">
      <span
        className="rise flex items-center gap-1.5 font-semibold"
        style={{ animationDelay: '80ms' }}
      >
        <span>{COPY.windLabel}</span>
        <span>{formatWind(props.level.windBase)}</span>
        <WindArrow
          windBase={props.level.windBase}
          label={windDirectionLabel(props.level.windBase)}
        />
      </span>
      <span className="rise font-semibold" style={{ animationDelay: '260ms' }}>
        {distanceLine(props.level.distance)}
      </span>
    </div>

    <span
      className="rise inline-flex items-center gap-1.5 rounded-chip border border-white/15 px-3 py-1 text-[13px] font-semibold tracking-wide"
      style={{ animationDelay: '440ms' }}
    >
      <Glyph paths={MODIFIER_GLYPH[props.level.modifier]} />
      <span>{MODIFIER_LABEL[props.level.modifier].toUpperCase()}</span>
    </span>

    {props.hint && (
      <span className="pop text-[13px] text-[color:var(--accent)]">
        {props.hint}
      </span>
    )}
  </div>
);
