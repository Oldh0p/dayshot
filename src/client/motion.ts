/**
 * Motion policy (GDD 26, 31).
 *
 * One switch decides whether the game shakes, slows down and throws confetti,
 * or fades instead. The gauge is never affected: it is the gameplay, not
 * decoration, and removing it would remove the game.
 */

let reduced = false;

if (typeof window !== 'undefined' && window.matchMedia) {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  reduced = query.matches;
  query.addEventListener('change', (event) => {
    reduced = event.matches;
  });
}

export const prefersReducedMotion = (): boolean => reduced;

/** Screen shake amplitude in pixels, or zero when motion is reduced. */
export const shakeAmplitude = (base: number): number => (reduced ? 0 : base);

/** Time scale for the approach slow-motion; 1 when motion is reduced. */
export const slowMotionScale = (base: number): number => (reduced ? 1 : base);

/** Whether to spawn particle bursts at all. */
export const allowParticles = (): boolean => !reduced;

// -- Easing ------------------------------------------------------------------

export const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);

/** Decelerating ease, the workhorse for anything arriving on screen. */
export const easeOutCubic = (t: number): number => {
  const p = clamp01(t);
  return 1 - (1 - p) * (1 - p) * (1 - p);
};

/** Overshoots slightly, for the count-up and the streak flame. */
export const easeOutBack = (t: number): number => {
  const p = clamp01(t);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const q = p - 1;
  return 1 + c3 * q * q * q + c1 * q * q;
};

export const easeInOutQuad = (t: number): number => {
  const p = clamp01(t);
  return p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) * (-2 * p + 2) / 2;
};

export const lerp = (a: number, b: number, t: number): number =>
  a + (b - a) * clamp01(t);

// -- Timing constants (GDD 26) ----------------------------------------------

/** Micro-freeze between release and launch. The tir has to land like a punch. */
export const RELEASE_FREEZE_MS = 60;
export const RELEASE_SHAKE_MS = 90;
export const RELEASE_SHAKE_PX = 4;

/** Slow-motion on a close approach. */
export const SLOWMO_SCALE = 0.25;
export const SLOWMO_MS = 250;

/** Score count-up and the cascade of result lines behind it. */
export const COUNT_UP_MS = 600;
export const CASCADE_STEP_MS = 300;

/** Perfect: freeze, then flash. The only maximal animation in the game. */
export const PERFECT_FREEZE_MS = 250;
export const PERFECT_FLASH_MS = 80;
