import type { ModifierId } from '../shared/types.ts';
import { COLOR } from './ui/tokens.ts';

/**
 * The day's palette (GDD 24, 49).
 *
 * The modifier *is* the theme: no per-day art, no assets, just three colours
 * and a light source. That is what makes daily theming free and what makes the
 * post recognisable in a feed at a glance.
 */
export type Palette = {
  /** Bottom of the sky gradient. */
  readonly skyLow: string;
  /** Top of the sky gradient. */
  readonly skyHigh: string;
  /** Ground and silhouettes. */
  readonly ground: string;
  /** The day's accent: gauge, target ring, CTA. */
  readonly accent: string;
  /** Wind particles and haze. */
  readonly air: string;
  /** Extra glow behind the target, 0 to 1. */
  readonly targetGlow: number;
};

const BASE: Palette = {
  skyLow: COLOR.bg,
  skyHigh: '#1E3A5C',
  ground: COLOR.ground,
  accent: COLOR.coral,
  air: COLOR.mist,
  targetGlow: 0.6,
};

/**
 * The seven atmospheres (§11), sky values exactly as specified.
 *
 * **No per-modifier accent.** These carried six saturated accents — cyan,
 * green, purple, pink, amber — which put the palette well past the nine colours
 * §13 allows and gave five different colours the job §13 reserves for coral:
 * action. §11 marks `accent` optional and names it for no modifier, because
 * recognition there comes from the sky, the particles and Pip's tic. So the
 * gauge, the trail and the mat's middle ring are coral on every day, and the
 * day is told by the air around them.
 */
const PALETTES: Record<ModifierId, Palette> = {
  CLEAR: BASE,
  /** Steel. */
  CROSSWIND: {
    ...BASE,
    skyHigh: '#2B3D52',
    skyLow: '#0F1A28',
    air: '#A9C8DA',
    targetGlow: 0.5,
  },
  /** Warm: the wind is behind you. */
  TAILWIND: {
    ...BASE,
    skyHigh: '#3A2F4F',
    skyLow: '#0D1626',
    air: '#C2B0C9',
  },
  GUSTY: {
    ...BASE,
    skyHigh: '#26364A',
    skyLow: '#0D1626',
    air: '#A6B6C9',
    targetGlow: 0.45,
  },
  /** Indigo, and a moon big enough to be the point. */
  MOON: {
    ...BASE,
    skyHigh: '#2A2657',
    skyLow: '#120F2A',
    air: '#9E9BD6',
    targetGlow: 0.85,
  },
  /** Same sky as Clear: the day is told by the spot and the smaller mat. */
  TINY: {
    ...BASE,
    skyHigh: '#1E3A5C',
    skyLow: '#0D1626',
    air: '#8DA3BF',
    targetGlow: 0.9,
  },
  /** Colder and deeper, so the far mat reads as far. */
  LONG: {
    ...BASE,
    skyHigh: '#1B3350',
    skyLow: '#0A0F1A',
    air: '#9FBCC9',
    targetGlow: 0.55,
  },
};

/**
 * What the day does to the air, to Pip, and to the mat (§11).
 *
 * Split from the palette because a colour is not an atmosphere: two days can
 * share a sky and still be unmistakable — Tiny Target has Clear Skies' exact
 * gradient and is recognised by a spotlight, a halved mat and a squint.
 */
export type Atmosphere = {
  /** How the wind is drawn. */
  readonly air: 'stars' | 'streaks' | 'speedlines' | 'gusts' | 'rising' | 'spot' | 'haze';
  /** Multiplier on the ambient particle budget (§13 caps the absolute count). */
  readonly density: number;
  /** Pip's standing tic, on top of his breathing. */
  readonly tic: 'none' | 'lean' | 'squint' | 'wide' | 'slow';
  /** A pennant on the mat, for the days where the wind is the whole story. */
  readonly pennant: boolean;
};

export const ATMOSPHERE: Record<ModifierId, Atmosphere> = {
  CLEAR: { air: 'stars', density: 0.5, tic: 'none', pennant: false },
  CROSSWIND: { air: 'streaks', density: 1, tic: 'lean', pennant: true },
  TAILWIND: { air: 'speedlines', density: 0.9, tic: 'none', pennant: false },
  GUSTY: { air: 'gusts', density: 1, tic: 'none', pennant: true },
  MOON: { air: 'rising', density: 0.4, tic: 'slow', pennant: false },
  TINY: { air: 'spot', density: 0.1, tic: 'squint', pennant: false },
  LONG: { air: 'haze', density: 0.6, tic: 'wide', pennant: false },
};

/** Small per-day hue shifts so two Crosswind days do not look identical. */
const VARIANT_SHIFT = [0, 6, -5, 11];

const shiftHex = (hex: string, degrees: number): string => {
  if (degrees === 0) return hex;
  const value = Number.parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;

  // Cheap hue rotation: mix towards a rotated primary. Enough for a variation
  // that reads as "a different evening", not enough to break the identity.
  const t = Math.abs(degrees) / 90;
  const towards = degrees > 0 ? [r, g * 0.9 + 20, b * 1.05] : [r * 1.05, g, b * 0.9 + 12];
  const mix = (a: number, bb: number): number =>
    Math.max(0, Math.min(255, Math.round(a * (1 - t) + bb * t)));

  const out = [
    mix(r, towards[0] ?? r),
    mix(g, towards[1] ?? g),
    mix(b, towards[2] ?? b),
  ];
  return `#${out.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
};

export const paletteFor = (
  modifier: ModifierId,
  variant: number,
  practice = false
): Palette => {
  const base = PALETTES[modifier];
  const shift = VARIANT_SHIFT[variant % VARIANT_SHIFT.length] ?? 0;
  const palette: Palette = {
    ...base,
    skyLow: shiftHex(base.skyLow, shift),
    skyHigh: shiftHex(base.skyHigh, shift),
  };

  if (!practice) return palette;

  // Practice is desaturated by 20% and can never be mistaken for the real
  // thing in a screenshot (GDD 20).
  return {
    ...palette,
    skyLow: desaturate(palette.skyLow, 0.2),
    skyHigh: desaturate(palette.skyHigh, 0.2),
    accent: desaturate(palette.accent, 0.35),
    air: desaturate(palette.air, 0.35),
    targetGlow: palette.targetGlow * 0.5,
  };
};

const desaturate = (hex: string, amount: number): string => {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  const grey = 0.299 * r + 0.587 * g + 0.114 * b;
  const mix = (c: number): number =>
    Math.round(c * (1 - amount) + grey * amount);
  return `#${[mix(r), mix(g), mix(b)]
    .map((c) => c.toString(16).padStart(2, '0'))
    .join('')}`;
};

/** Applies the day's palette to the CSS variables the DOM panels read. */
export const applyPalette = (palette: Palette): void => {
  const root = document.documentElement.style;
  root.setProperty('--sky-low', palette.skyLow);
  root.setProperty('--sky-high', palette.skyHigh);
  root.setProperty('--accent', palette.accent);
};

/*
 * Re-exported rather than redeclared. These four were literals here and in
 * `tokens.ts`, which is one palette in two files: the kind of duplication that
 * stays correct right up until somebody changes one of them.
 */
export const GOLD = COLOR.gold;
export const INK = COLOR.ink;
export const MIST = COLOR.mist;
export const PIP_BODY = COLOR.pip;
