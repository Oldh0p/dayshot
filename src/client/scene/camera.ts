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
 * What the result panel reserves, in pixels (§6: "~50% de la hauteur"). The
 * scene keeps the rest, which is the whole point of the redesign: the verdict
 * is shown *over* the world, never instead of it.
 *
 * A pixel figure and not a share, because the panel's content is fixed and so
 * is its height -- about 350px, plus margin. A share got it wrong in both
 * directions: half of an 896px screen is 448 and left a slab of empty ground,
 * while half of a 647px one is 323 against a 347px panel, which put the mat
 * *behind* the panel edge. Both were measured on real screenshots.
 */
export const RESULT_PANEL_PX = 380;

/** Clamps, so a very tall or very short screen still gets a scene. */
export const RESULT_PANEL_MIN_SHARE = 0.42;
export const RESULT_PANEL_MAX_SHARE = 0.62;

/** The band, for a given height. */
export const resultPanelInset = (height: number): number =>
  Math.min(
    Math.max(RESULT_PANEL_PX, height * RESULT_PANEL_MIN_SHARE),
    height * RESULT_PANEL_MAX_SHARE
  );

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
const MIN_TARGET_PX = 24;

export const resultFraming = (
  canvasWidth: number,
  canvasHeight: number,
  targetR: number,
  bottomInset: number,
  /** The aiming camera. This framing stays as close to it as it can. */
  base: Camera
): Camera => {
  /*
   * **The whole world stays in frame.**
   *
   * The first version framed the impact and the mat with a 12% margin and
   * recentred on the pair, which is what §6 asks for in words -- and on a real
   * phone it cropped the launcher out entirely. The report was that you could
   * no longer tell what game you were looking at, and that is right: DAYSHOT is
   * a throw *across a gap*, and a close-up of a ball resting on a mat is a
   * different picture. It also removes the only scale reference on screen, so
   * "16 short" stops meaning anything.
   *
   * So the horizontal framing stays the shot's own. What has to change is the
   * ground line, because the result panel is taller than the aiming one -- and
   * a push-in, but only when the mat would otherwise be too small to read as a
   * verdict at all.
   */
  const needed = MIN_TARGET_PX / Math.max(1, targetR);
  const scale = Math.min(Math.max(base.scale, needed), base.scale * 1.5);

  // The same point of the world stays under the middle of the screen, so a
  // push-in reads as a push-in and never as a pan.
  const centreX = (base.width / 2 - base.originX) / base.scale;

  return {
    scale,
    originX: canvasWidth / 2 - centreX * scale,
    originY: canvasHeight - bottomInset,
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
