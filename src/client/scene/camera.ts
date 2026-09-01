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
