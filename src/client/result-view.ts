import type { ResultSummary, ShotResult } from '../shared/types.ts';
import type { Phase } from './machine.ts';
import { isPractice } from './machine.ts';

/**
 * Which result the result screen is actually showing.
 *
 * There are two of them and they are not interchangeable. `state.result` is the
 * **official** shot, confirmed by the server; it survives entering practice on
 * purpose, because leaving practice restores that screen and because the share
 * card is built from it and must never carry a practice score. `state.shot` is
 * whatever was thrown last, which during practice is the attempt just landed.
 *
 * The screen has to prefer the second one while practising. It used to read the
 * official result unconditionally, so every practice attempt displayed the
 * ranked score again -- the number could not change no matter how the throw
 * went, which makes practice unreadable as practice: the one thing it exists to
 * tell you is how *this* throw did.
 */
export const resultOnScreen = (
  phase: Phase,
  official: ResultSummary | null,
  shot: ShotResult | null
): ResultSummary =>
  isPractice(phase)
    ? unranked(shot)
    : (official ?? unranked(shot));

/**
 * A shot dressed as a result before -- or without -- a server verdict.
 *
 * Used for the moment between impact and confirmation, when the score is known
 * client-side and only the rank is still travelling, and for every practice
 * attempt, which is never ranked at all. The rank fields are deliberately inert
 * rather than absent: a practice attempt has no standing, and `percentile: 100`
 * is the honest value for "you beat nobody, because nobody was racing".
 */
export const unranked = (shot: ShotResult | null): ResultSummary => ({
  score: shot?.score ?? 0,
  dx: shot?.dx ?? 0,
  signedDx: 0,
  impact: shot?.impact ?? 'GROUND',
  cliffDrop: shot?.cliffDrop ?? 0,
  holdMs: 0,
  rank: 0,
  total: 0,
  percentile: 100,
  isBullseye: shot?.isBullseye ?? false,
  isPerfect: shot?.isPerfect ?? false,
});
