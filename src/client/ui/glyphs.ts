import type { ModifierId } from '../../shared/types.ts';

/**
 * The vector icon set, as path data (§3).
 *
 * §3 refuses system emoji in the UI: they render differently on every OS, at
 * sizes nobody controls, in colours that fight the palette — and the modifier
 * is the one thing a stranger has to be able to read at a glance. They stay in
 * the share texts, which are Reddit comments and not this app's surface.
 *
 * **Path data, not components.** Two consumers need these and they cannot share
 * a renderer: the feed bundle builds an SVG string and must never import React,
 * while the game's screens want JSX. Both read this file, so there is one set
 * of shapes rather than two that drift.
 *
 * All drawn on a 16×16 grid, stroked rather than filled, so a single
 * `currentColor` and `stroke-width` control every one of them.
 */

export const GLYPH_VIEWBOX = '0 0 16 16';

export const MODIFIER_GLYPH: Record<ModifierId, readonly string[]> = {
  /** A star, for a sky with nothing in it. */
  CLEAR: [
    'M8 2v3M8 11v3M2 8h3M11 8h3',
    'M4.5 4.5l1.6 1.6M11.5 4.5l-1.6 1.6M4.5 11.5l1.6-1.6M11.5 11.5l-1.6-1.6',
  ],
  /** Three streaks and an arrowhead: wind crossing the shot. */
  CROSSWIND: ['M2 5h9M2 8h12M2 11h7', 'M9 2.5 11.5 5 9 7.5'],
  /** One streak, one arrow, pointing where the ball is going. */
  TAILWIND: ['M2 8h11', 'M9.5 4.5 13 8l-3.5 3.5'],
  /** A gust: the same wind, broken. */
  GUSTY: ['M2 5h6l2 2-2 2h4', 'M2 11h5'],
  /** A crescent. */
  MOON: ['M11 3a5.5 5.5 0 1 0 2 6 4.5 4.5 0 0 1-2-6z'],
  /** A small circle under a lens. */
  TINY: ['M7 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M10 10l4 4'],
  /** Two arrowheads: further than it looks. */
  LONG: ['M2 8h10', 'M6 4.5 9.5 8 6 11.5M9.5 4.5 13 8l-3.5 3.5'],
};

/** The streak flame. Replaces 🔥, which rendered as a different fire per OS. */
export const FLAME_GLYPH: readonly string[] = [
  'M8 14c2.5 0 4-1.7 4-3.9 0-2.6-2-3.6-2.6-6.1-1 .8-1.3 1.9-1.2 3C7.4 6 7 4.6 7.4 2 5.6 3.4 4 5.6 4 8.4 4 11.4 5.7 14 8 14z',
];

/** The distance mark. Replaces 🎯 beside "6.4 from center". */
export const TARGET_GLYPH: readonly string[] = [
  'M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z',
  'M8 5.8a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4z',
];

/**
 * Copy. Replaces the words "Copy card" (§6): copying is a secondary gesture,
 * and the three text links it sat in wrapped at 390px once the real font
 * arrived.
 */
export const COPY_GLYPH: readonly string[] = [
  'M5.5 5.5V3.2A1.2 1.2 0 0 1 6.7 2h6.1A1.2 1.2 0 0 1 14 3.2v6.1a1.2 1.2 0 0 1-1.2 1.2h-2.3',
  'M9.3 5.5H3.2A1.2 1.2 0 0 0 2 6.7v6.1A1.2 1.2 0 0 0 3.2 14h6.1a1.2 1.2 0 0 0 1.2-1.2V6.7a1.2 1.2 0 0 0-1.2-1.2z',
];

/**
 * An `<svg>` string, for the feed bundle. React callers use `<Glyph>` instead,
 * which reads the same paths.
 */
export const glyphSvg = (
  paths: readonly string[],
  size = 14,
  label?: string
): string =>
  `<svg width="${size}" height="${size}" viewBox="${GLYPH_VIEWBOX}" fill="none" ` +
  `stroke="currentColor" stroke-width="1.5" stroke-linecap="round" ` +
  `stroke-linejoin="round" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'}>` +
  paths.map((d) => `<path d="${d}"/>`).join('') +
  `</svg>`;
