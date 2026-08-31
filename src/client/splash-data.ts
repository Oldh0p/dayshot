import { MODIFIER_EMOJI, MODIFIER_LABEL } from '../shared/copy.ts';
import type { ModifierId } from '../shared/types.ts';

/**
 * Parsing of the feed card's `postData`, kept separate from the component so it
 * can be tested without a DOM.
 *
 * Two states have to stay distinguishable: **no data at all** — an old post, or
 * one created before the field existed — and **a day number that happens to be
 * zero or negative**, which is what every day before `LAUNCH_DAY` produces. They
 * used to render identically, which meant a pre-launch card silently dropped the
 * number while the post title still showed it. One state, two answers, is a bug
 * waiting to be misread.
 */

export type SplashData = {
  /** `null` when the post carries no day number, never a fabricated zero. */
  readonly displayDay: number | null;
  readonly modifier: ModifierId;
  readonly modifierLabel: string;
  readonly modifierEmoji: string;
  /**
   * Set only by the `[DEV] Refresh splash data` action, to find out whether an
   * updated `postData` reaches a card already in the feed (GDD 9.13.2). Absent
   * in production, and nothing renders when it is absent — which is why the card
   * carries no counter at creation, when the count would be zero.
   */
  readonly devProbe: string | null;
};

const MODIFIERS: readonly ModifierId[] = [
  'CLEAR',
  'CROSSWIND',
  'TAILWIND',
  'GUSTY',
  'MOON',
  'TINY',
  'LONG',
];

const isModifier = (value: unknown): value is ModifierId =>
  MODIFIERS.some((id) => id === value);

export const parseSplashData = (postData: unknown): SplashData => {
  const data: Record<string, unknown> =
    typeof postData === 'object' && postData !== null
      ? (postData as Record<string, unknown>)
      : {};

  const modifier = isModifier(data['modifier']) ? data['modifier'] : 'CLEAR';
  const day = data['displayDay'];
  const probe = data['devProbe'];

  return {
    displayDay: typeof day === 'number' && Number.isFinite(day) ? day : null,
    modifier,
    modifierLabel: MODIFIER_LABEL[modifier],
    modifierEmoji: MODIFIER_EMOJI[modifier],
    devProbe: typeof probe === 'string' ? probe : null,
  };
};
