import type { JSX, PointerEvent } from 'react';

import { COPY, dayLabel, MODIFIER_LABEL } from '../../shared/copy.ts';
import type { ModifierId } from '../../shared/types.ts';
import { Glyph } from '../ui/Glyph.tsx';
import {
  FLAME_GLYPH,
  MODIFIER_GLYPH,
  SOUND_OFF_GLYPH,
  SOUND_ON_GLYPH,
} from '../ui/glyphs.ts';

/**
 * The status bar of the day (GDD 9.9): number, modifier, streak, and the one
 * question mark that leads to the rules. Nothing else earns a place up here.
 *
 * Except mute, which earns it by rule rather than by taste: Reddit's inline
 * mode requirements ask for "a button to mute in your game", and the sound
 * checkbox this app used to rely on was two taps deep inside the help sheet.
 * A control the player cannot find is not a control.
 *
 * Both buttons stop their pointer events here. The root element is a hold
 * target whenever the player can aim, and in practice it is armed the whole
 * time -- so without this, tapping mute or `?` charges a shot and letting go
 * throws it. The official shot is protected by the misfire guard; practice
 * deliberately is not, which is exactly where it would have bitten.
 */
const swallow = (event: PointerEvent): void => event.stopPropagation();
export const DayBar = (props: {
  /** `null` for a logged-out visitor: the day is not theirs to see yet. */
  readonly displayDay: number | null;
  readonly modifier: ModifierId | null;
  readonly streak: number;
  readonly soundOn: boolean;
  readonly onToggleSound: () => void;
  readonly onHelp: () => void;
}): JSX.Element => (
  <header className="flex items-center gap-3 px-4 py-3 text-[13px] text-[color:var(--color-mist)]">
    {/* The day never wraps: at 320px the mute button made this row tight
        enough to break "Day #2" across two lines. The modifier is the one that
        gives, and it already truncates with an ellipsis. */}
    <span className="shrink-0 whitespace-nowrap font-bold tracking-wide text-[color:var(--color-ink)] tabular">
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
      <span className="flex items-center">
        <button
          type="button"
          aria-label={props.soundOn ? COPY.soundMute : COPY.soundUnmute}
          aria-pressed={!props.soundOn}
          onClick={props.onToggleSound}
          onPointerDown={swallow}
          onPointerUp={swallow}
          className="grid h-12 w-12 -my-3 place-items-center rounded-full text-[color:var(--color-mist)] transition-colors hover:text-[color:var(--color-ink)]"
        >
          <Glyph
            paths={props.soundOn ? SOUND_ON_GLYPH : SOUND_OFF_GLYPH}
            size={16}
          />
        </button>
        <button
          type="button"
          aria-label={COPY.helpTitle}
          onClick={props.onHelp}
          onPointerDown={swallow}
          onPointerUp={swallow}
          className="grid h-12 w-12 -my-3 place-items-center rounded-full text-[color:var(--color-mist)] transition-colors hover:text-[color:var(--color-ink)]"
        >
          ?
        </button>
      </span>
    </span>
  </header>
);
