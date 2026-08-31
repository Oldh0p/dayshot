import type { ModifierId } from '../shared/types.ts';

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
  skyLow: '#0D1626',
  skyHigh: '#1E3A5C',
  ground: '#0A0F1A',
  accent: '#FF6B4A',
  air: '#8DA3BF',
  targetGlow: 0.6,
};

const PALETTES: Record<ModifierId, Palette> = {
  CLEAR: BASE,
  // Steel-streaked sky: the classic hated-and-loved day.
  CROSSWIND: {
    ...BASE,
    skyLow: '#0B1620',
    skyHigh: '#26506B',
    accent: '#5FC9E8',
    air: '#A9C8DA',
    targetGlow: 0.5,
  },
  TAILWIND: {
    ...BASE,
    skyLow: '#10161F',
    skyHigh: '#2D4A4A',
    accent: '#63E0B0',
    air: '#93C9B6',
  },
  GUSTY: {
    ...BASE,
    skyLow: '#0E1220',
    skyHigh: '#39355F',
    accent: '#C08CFF',
    air: '#B0A6D6',
    targetGlow: 0.45,
  },
  // Deep indigo and a big moon: the prettiest arc in the game.
  MOON: {
    ...BASE,
    skyLow: '#0A0F24',
    skyHigh: '#2A2E6B',
    accent: '#9FB4FF',
    air: '#8E9BD6',
    targetGlow: 0.85,
  },
  TINY: {
    ...BASE,
    skyLow: '#120E1C',
    skyHigh: '#4A2C4E',
    accent: '#FF8FB1',
    air: '#C79BB4',
    targetGlow: 0.9,
  },
  LONG: {
    ...BASE,
    skyLow: '#0C1420',
    skyHigh: '#1B4256',
    accent: '#FFB35C',
    air: '#9FBCC9',
    targetGlow: 0.55,
  },
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

export const GOLD = '#FFC53D';
export const INK = '#F2F6FC';
export const MIST = '#8DA3BF';
export const PIP_BODY = '#2A3242';
