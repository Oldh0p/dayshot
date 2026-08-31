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

export const buildCamera = (
  canvasWidth: number,
  canvasHeight: number,
  apex: number,
  zoom = 1
): Camera => {
  const viewHeight = Math.max(BASE_VIEW_HEIGHT, apex + TOP_MARGIN);

  // Fit the width first — the shot axis is sacred — then pull back further if
  // the arc still would not fit vertically.
  const scale = Math.min(canvasWidth / SPACE_W, canvasHeight / viewHeight) * zoom;

  // Ground sits just above the bottom edge so the launcher never touches it.
  const groundPixels = canvasHeight - Math.min(48, canvasHeight * 0.08);

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
