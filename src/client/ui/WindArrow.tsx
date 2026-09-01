import type { JSX } from 'react';

import { COLOR } from './tokens.ts';

/**
 * The wind, as a length (§5).
 *
 * A `←` or `→` says only which way. §5 asks for an arrow whose length is
 * proportional to the wind's strength, because the number alone is abstract:
 * −380 means nothing until it is longer than the −80 of a calm day.
 *
 * **This is the accessible reading, not a decoration.** §11 is explicit that the
 * wind must never be legible only through the particles blowing across the
 * scene — those are atmosphere, and a player with reduced motion sees fewer of
 * them or none. The arrow and the value are the truth, so they carry the sign,
 * the magnitude and a text label.
 */

/**
 * The strongest wind any modifier can draw (`MODIFIER_WIND_RANGE`: Crosswind
 * reaches −420, Tailwind +400). Normalising against the game's maximum rather
 * than the day's keeps two days comparable — a long arrow means a hard day, on
 * every day.
 */
const MAX_WIND = 420;

const SHAFT_MIN = 10;
const SHAFT_MAX = 34;

export const WindArrow = (props: {
  readonly windBase: number;
  readonly label: string;
}): JSX.Element => {
  const wind = Math.round(props.windBase);
  const strength = Math.min(1, Math.abs(wind) / MAX_WIND);
  const shaft = SHAFT_MIN + (SHAFT_MAX - SHAFT_MIN) * strength;
  const width = SHAFT_MAX + 4;
  const blowsLeft = wind < 0;

  // Drawn left-to-right, then mirrored, so one path serves both directions.
  const tail = 2;
  const head = tail + shaft;

  return (
    <svg
      width={width}
      height={12}
      viewBox={`0 0 ${width} 12`}
      fill="none"
      role="img"
      aria-label={props.label}
      className="shrink-0"
      style={{ transform: blowsLeft ? 'scaleX(-1)' : undefined }}
    >
      <path
        d={`M${tail} 6h${shaft}`}
        stroke={COLOR.coral}
        strokeWidth={2}
        strokeLinecap="round"
      />
      <path
        d={`M${head - 4} 2.5 ${head} 6 ${head - 4} 9.5`}
        stroke={COLOR.coral}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};
