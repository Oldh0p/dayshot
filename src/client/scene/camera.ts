import { MUZZLE_Y, SPACE_W } from '../../shared/tunables.ts';
import type { Point } from '../../shared/types.ts';
import { clamp01, lerp } from '../motion.ts';

/**
 * Maps the 1000-wide logical space onto the canvas.
 *
 * GDD 28 is strict about one thing: the whole arc must be visible without
 * scrolling or panning, and the shot axis is never cropped. So the horizontal
 * span is always the full logical width, and the vertical span grows to contain
 * the apex of whatever is about to be shown.
 */

export type Camera = {
  /** Pixels per logical unit. */
  readonly scale: number;
  /** Canvas pixel offset of logical (0, 0). */
  readonly originX: number;
  readonly originY: number;
  readonly width: number;
  readonly height: number;
};

/** Vertical span shown when nothing forces a wider view. */
const BASE_VIEW_HEIGHT = 780;
const TOP_MARGIN = 120;

/**
 * Share of the canvas the bottom panel occupies while aiming (§5: day bar 44px,
 * scene at least 56%, panel about 25%).
 *
 * Without it the ground line sat 48px off the bottom edge and the conditions,
 * the pill and `HOLD TO AIM` were drawn *over* the mat — measured at 390x720,
 * where fitting the 1000-unit width gives a scale of 0.39 and packs the whole
 * world into the bottom 42% of the frame, exactly where the panel lives.
 */
export const PANEL_SHARE = 0.25;

/**
 * And the share the result panel covers (§6: "~50% de la hauteur"). The scene
 * keeps the rest, which is the whole point of the redesign: the verdict is
 * shown *over* the world, never instead of it.
 */
export const RESULT_PANEL_SHARE = 0.5;

export const buildCamera = (
  canvasWidth: number,
  canvasHeight: number,
  apex: number,
  zoom = 1,
  /** Pixels reserved below the ground line for the panel. */
  bottomInset = 0
): Camera => {
  const viewHeight = Math.max(BASE_VIEW_HEIGHT, apex + TOP_MARGIN);

  // Fit the width first — the shot axis is sacred — then pull back further if
  // the arc still would not fit vertically.
  const scale = Math.min(canvasWidth / SPACE_W, canvasHeight / viewHeight) * zoom;

  // Ground sits above whatever the panel reserves, and never closer to the
  // bottom edge than the launcher's own height.
  const groundPixels =
    canvasHeight - Math.max(bottomInset, Math.min(48, canvasHeight * 0.08));

  return {
    scale,
    originX: (canvasWidth - SPACE_W * scale) / 2,
    originY: groundPixels,
    width: canvasWidth,
    height: canvasHeight,
  };
};

/**
 * The result framing (§6).
 *
 * After a shot the question is no longer "can I see the whole arc" — it is
 * "how close was that". So the camera stops obeying GDD 28's full-width rule,
 * which it only has to obey while a shot is still possible, and frames the two
 * points that answer the question: where the ball stopped, and the centre of
 * the mat.
 *
 * Two floors keep it honest. The mat never falls under `MIN_TARGET_PX` on
 * screen, because a verdict about a target too small to see is not a verdict;
 * and the framing never zooms *in* past the aiming view on a near miss, which
 * would make a good shot feel like a different game.
 */
const RESULT_MARGIN = 0.12;
const MIN_TARGET_PX = 24;

export const resultFraming = (
  canvasWidth: number,
  canvasHeight: number,
  impactX: number,
  targetX: number,
  targetR: number,
  bottomInset: number,
  /** The aiming camera, as the zoom floor. */
  base: Camera
): Camera => {
  const left = Math.min(impactX, targetX - targetR);
  const right = Math.max(impactX, targetX + targetR);
  const span = Math.max(targetR * 4, right - left);

  const usableWidth = canvasWidth * (1 - RESULT_MARGIN * 2);
  const wanted = usableWidth / span;

  // Never further out than the aiming view, never so close that the mat is
  // still a dot, and never past a doubling — a hair-thin miss should not throw
  // the player into a microscope.
  const scale = Math.min(
    Math.max(wanted, base.scale, MIN_TARGET_PX / Math.max(1, targetR)),
    // A push-in, not a new scene. At 2.4x the result was a different world from
    // the one the shot was taken in, and arriving there in a cut made three
    // framings in about a second -- too many to follow.
    base.scale * 1.5
  );

  const centreX = (left + right) / 2;
  const groundPixels = canvasHeight - bottomInset;

  return {
    scale,
    originX: canvasWidth / 2 - centreX * scale,
    originY: groundPixels,
    width: canvasWidth,
    height: canvasHeight,
  };
};

/**
 * Between two framings, so the result arrives as a move rather than a cut.
 *
 * §6 asks for 400ms out-expo and the first implementation simply swapped
 * cameras on the frame the ball landed. Combined with the ground line jumping
 * when the aiming panel's reservation disappeared, a single shot produced three
 * different worlds in about a second.
 */
export const lerpCamera = (from: Camera, to: Camera, t: number): Camera => {
  const eased = 1 - Math.pow(1 - clamp01(t), 5); // out-expo
  return {
    scale: lerp(from.scale, to.scale, eased),
    originX: lerp(from.originX, to.originX, eased),
    originY: lerp(from.originY, to.originY, eased),
    width: to.width,
    height: to.height,
  };
};

/** §6: how long the result framing takes to arrive. */
export const RESULT_FRAMING_MS = 400;

export const toScreenX = (camera: Camera, x: number): number =>
  camera.originX + x * camera.scale;

export const toScreenY = (camera: Camera, y: number): number =>
  camera.originY - y * camera.scale;

/** Highest point a trajectory reaches, for sizing the view. */
export const apexOf = (points: readonly Point[]): number => {
  let apex = MUZZLE_Y;
  for (const point of points) if (point.y > apex) apex = point.y;
  return apex;
};

/**
 * The gentle zoom that follows the ball (GDD 26.3).
 *
 * Deliberately small and never a pan: losing sight of the target mid-flight
 * would take away the only thing the player can still do, which is watch.
 */
export const flightZoom = (progress: number): number =>
  lerp(1, 1.06, Math.sin(clamp01(progress) * Math.PI));
