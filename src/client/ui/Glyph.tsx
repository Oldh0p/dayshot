import type { JSX } from 'react';

import { GLYPH_VIEWBOX } from './glyphs.ts';

/**
 * The React side of the icon set. Shapes come from `glyphs.ts`, which the feed
 * bundle also reads — one set of paths, two renderers, no drift.
 *
 * Inherits `currentColor`, so a glyph is coloured by the text around it and
 * never carries a colour of its own. That is what stops an icon set from
 * becoming a tenth palette entry (§13 stops at nine).
 */
export const Glyph = (props: {
  readonly paths: readonly string[];
  readonly size?: number;
  /**
   * Present only when the glyph carries meaning the text does not repeat. Next
   * to its own label — every modifier chip — it is decoration, and naming it
   * twice is noise to a screen reader.
   */
  readonly label?: string;
}): JSX.Element => (
  <svg
    width={props.size ?? 14}
    height={props.size ?? 14}
    viewBox={GLYPH_VIEWBOX}
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="inline-block shrink-0 align-[-0.12em]"
    {...(props.label
      ? { role: 'img', 'aria-label': props.label }
      : { 'aria-hidden': true })}
  >
    {props.paths.map((d) => (
      <path key={d} d={d} />
    ))}
  </svg>
);
