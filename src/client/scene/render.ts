import {
  MUZZLE_X,
  MUZZLE_Y,
  PERFECT_RADIUS,
  PLATEAU_HALF_WIDTH,
  SPACE_W,
} from '../../shared/tunables.ts';
import type { Level, Point, ShotResult } from '../../shared/types.ts';
import { clamp01 } from '../motion.ts';
import { GOLD, INK, type Palette } from '../theme.ts';
import { toScreenX, toScreenY, type Camera } from './camera.ts';
import { drawPip, type PipMood } from './pip.ts';
import type { ParticleField, WindStreak } from './particles.ts';

/**
 * The whole scene, drawn on one canvas every frame.
 *
 * Flat shapes, hard edges, no blur: the look is Kinetic Minimal (GDD 24), so
 * all of the polish budget goes into movement rather than into fill detail.
 * React never touches this — it renders the panels around the scene, and the
 * animation loop owns everything inside it.
 */

export type SceneView = {
  readonly level: Level;
  readonly palette: Palette;
  readonly camera: Camera;
  /** Seconds since the scene opened. */
  readonly time: number;
  /** Gauge value in [0, 1]; null while nothing is charging. */
  readonly power: number | null;
  /** The shot being played back, or null. */
  readonly shot: ShotResult | null;
  /** How far through the flight, in [0, 1]. */
  readonly flightProgress: number;
  /** Faded replay of the official shot, shown during practice (GDD 20). */
  readonly ghost: readonly Point[] | null;
  readonly showImpactMarker: boolean;
  readonly practice: boolean;
  readonly windStreaks: readonly WindStreak[];
  readonly particles: ParticleField;
  /** White flash of a Perfect, 0 to 1. */
  readonly flash: number;
  /** Screen shake offset in canvas pixels. */
  readonly shakeX: number;
  readonly shakeY: number;
};

const PIP_RADIUS_UNITS = 22;

export const drawScene = (
  ctx: CanvasRenderingContext2D,
  view: SceneView
): void => {
  const { camera, palette } = view;

  ctx.save();
  ctx.translate(view.shakeX, view.shakeY);

  drawSky(ctx, view);
  drawMoonIfNeeded(ctx, view);
  drawWind(ctx, view);
  drawGround(ctx, view);
  drawPlateau(ctx, view);
  drawTarget(ctx, view);
  drawLauncher(ctx, view);

  if (view.ghost) drawTrajectory(ctx, view, view.ghost, 'rgba(242,246,252,0.18)', 2);

  if (view.shot) {
    const upTo = Math.max(
      1,
      Math.floor(view.shot.trajectory.length * clamp01(view.flightProgress))
    );
    drawTrail(ctx, view, view.shot.trajectory.slice(0, upTo));
  }

  drawBall(ctx, view);

  if (view.showImpactMarker && view.shot) drawImpactMarker(ctx, view, view.shot);

  view.particles.draw(
    ctx,
    (x, y) => [toScreenX(camera, x), toScreenY(camera, y)],
    camera.scale
  );

  if (view.power !== null) drawGauge(ctx, view, view.power);

  ctx.restore();

  if (view.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${clamp01(view.flash)})`;
    ctx.fillRect(0, 0, camera.width, camera.height);
  }

  if (view.practice) drawPracticeWatermark(ctx, camera, palette);
};

// -- Background --------------------------------------------------------------

const drawSky = (ctx: CanvasRenderingContext2D, view: SceneView): void => {
  const { camera, palette } = view;
  const gradient = ctx.createLinearGradient(0, 0, 0, camera.height);
  gradient.addColorStop(0, palette.skyHigh);
  gradient.addColorStop(1, palette.skyLow);
  ctx.fillStyle = gradient;
  ctx.fillRect(-40, -40, camera.width + 80, camera.height + 80);
};

/** Moon Gravity gets a moon. The prettiest day should look like one. */
const drawMoonIfNeeded = (
  ctx: CanvasRenderingContext2D,
  view: SceneView
): void => {
  if (view.level.modifier !== 'MOON') return;
  const { camera } = view;
  const cx = toScreenX(camera, 760);
  const cy = toScreenY(camera, 900);
  const r = 120 * camera.scale;

  ctx.fillStyle = 'rgba(226, 232, 255, 0.92)';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(170, 184, 224, 0.5)';
  for (const [dx, dy, cr] of [
    [-0.3, -0.2, 0.22],
    [0.25, 0.1, 0.16],
    [-0.05, 0.35, 0.12],
  ] as const) {
    ctx.beginPath();
    ctx.arc(cx + dx * r, cy + dy * r, cr * r, 0, Math.PI * 2);
    ctx.fill();
  }
};

const drawWind = (ctx: CanvasRenderingContext2D, view: SceneView): void => {
  const { camera, palette, level } = view;
  const direction = level.windBase < 0 ? -1 : 1;
  const strength = clamp01(Math.abs(level.windBase) / 420);
  if (strength < 0.02) return;

  ctx.strokeStyle = palette.air;
  ctx.lineWidth = Math.max(1, camera.scale * 1.6);
  ctx.globalAlpha = 0.1 + strength * 0.3;

  for (const streak of view.windStreaks) {
    const x = toScreenX(camera, streak.x);
    const y = toScreenY(camera, streak.y);
    const length = streak.length * camera.scale * (0.4 + strength);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + direction * length, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
};

const drawGround = (ctx: CanvasRenderingContext2D, view: SceneView): void => {
  const { camera, palette } = view;
  const groundY = toScreenY(camera, 0);
  ctx.fillStyle = palette.ground;
  ctx.fillRect(-40, groundY, camera.width + 80, camera.height - groundY + 80);

  // A single hairline where ground meets sky reads as a horizon without any
  // gradient work.
  ctx.strokeStyle = 'rgba(242,246,252,0.10)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  ctx.lineTo(camera.width, groundY);
  ctx.stroke();
};

const drawPlateau = (ctx: CanvasRenderingContext2D, view: SceneView): void => {
  const { camera, palette, level } = view;
  if (level.height <= 0) return;

  const left = toScreenX(camera, level.distance - PLATEAU_HALF_WIDTH);
  const right = toScreenX(camera, level.distance + PLATEAU_HALF_WIDTH);
  const top = toScreenY(camera, level.height);
  const bottom = toScreenY(camera, 0);

  ctx.fillStyle = palette.ground;
  ctx.fillRect(left, top, right - left, bottom - top);

  // The cliff face, lit just enough to read as the thing that stops the ball.
  ctx.fillStyle = 'rgba(242,246,252,0.06)';
  ctx.fillRect(left, top, Math.max(2, camera.scale * 6), bottom - top);

  ctx.strokeStyle = 'rgba(242,246,252,0.14)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(right, top);
  ctx.stroke();
};

// -- Target ------------------------------------------------------------------

/**
 * The bullseye mat, drawn in false perspective so the miss can be *seen*
 * (GDD M9). The rings are separated by lightness as well as hue, so the mat
 * stays readable to a colour-blind player (GDD 31).
 */
const drawTarget = (ctx: CanvasRenderingContext2D, view: SceneView): void => {
  const { camera, palette, level } = view;
  const cx = toScreenX(camera, level.distance);
  const cy = toScreenY(camera, level.height);
  const unit = camera.scale;

  const glow = palette.targetGlow;
  if (glow > 0) {
    const gradient = ctx.createRadialGradient(
      cx,
      cy,
      0,
      cx,
      cy,
      level.targetR * 3.2 * unit
    );
    gradient.addColorStop(0, `rgba(255,197,61,${0.22 * glow})`);
    gradient.addColorStop(1, 'rgba(255,197,61,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, level.targetR * 3.2 * unit, 0, Math.PI * 2);
    ctx.fill();
  }

  // Flattened ellipses: the mat lies on the ground, seen from a low angle.
  const rings: readonly (readonly [number, string])[] = [
    [level.targetR, 'rgba(242,246,252,0.16)'],
    [level.targetR * 0.62, 'rgba(242,246,252,0.30)'],
    [level.targetR * 0.3, palette.accent],
    [PERFECT_RADIUS * 2.2, GOLD],
  ];

  for (const [radius, color] of rings) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(cx, cy, radius * unit, radius * unit * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
  }
};

// -- Launcher ----------------------------------------------------------------

const drawLauncher = (ctx: CanvasRenderingContext2D, view: SceneView): void => {
  const { camera, palette, level } = view;
  const x = toScreenX(camera, MUZZLE_X);
  const y = toScreenY(camera, MUZZLE_Y);
  const unit = camera.scale;

  ctx.strokeStyle = palette.ground;
  ctx.lineWidth = Math.max(3, 22 * unit);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, toScreenY(camera, 0));
  ctx.lineTo(x, y);
  ctx.stroke();

  // A short barrel pointing along the day's angle: the one thing the player
  // cannot change, shown rather than written.
  const barrel = 54 * unit;
  ctx.strokeStyle = 'rgba(242,246,252,0.28)';
  ctx.lineWidth = Math.max(2, 8 * unit);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + level.cosTheta * barrel, y - level.sinTheta * barrel);
  ctx.stroke();
};

// -- Ball and flight ---------------------------------------------------------

const pointAt = (view: SceneView): { x: number; y: number; angle: number; speed: number } => {
  const { shot } = view;
  if (!shot || shot.trajectory.length === 0) {
    return { x: MUZZLE_X, y: MUZZLE_Y, angle: 0, speed: 0 };
  }

  const points = shot.trajectory;
  const exact = clamp01(view.flightProgress) * (points.length - 1);
  const index = Math.min(points.length - 1, Math.floor(exact));
  const next = Math.min(points.length - 1, index + 1);
  const t = exact - index;

  const a = points[index] ?? points[0];
  const b = points[next] ?? a;
  if (!a || !b) return { x: MUZZLE_X, y: MUZZLE_Y, angle: 0, speed: 0 };

  const x = a.x + (b.x - a.x) * t;
  const y = a.y + (b.y - a.y) * t;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return {
    x,
    y,
    angle: -Math.atan2(dy, dx),
    speed: Math.hypot(dx, dy) * 120,
  };
};

const drawBall = (ctx: CanvasRenderingContext2D, view: SceneView): void => {
  const { camera, shot } = view;
  const unit = camera.scale;
  const radius = PIP_RADIUS_UNITS * unit;

  let mood: PipMood = 'idle';
  let squash = 0;
  let position = { x: MUZZLE_X, y: MUZZLE_Y, angle: 0, speed: 0 };

  if (shot && view.flightProgress > 0) {
    position = pointAt(view);
    if (view.flightProgress >= 1) {
      mood = shot.isPerfect
        ? 'perfect'
        : shot.score >= 87
          ? 'impact-good'
          : 'impact-bad';
    } else {
      mood = 'flight';
      squash = clamp01(position.speed / 1400);
    }
  } else if (view.power !== null) {
    mood = 'aim';
    squash = view.power;
  }

  drawPip(ctx, {
    x: toScreenX(camera, position.x),
    y: toScreenY(camera, position.y),
    radius,
    mood,
    squash,
    angle: position.angle,
    time: view.time,
  });
};

const drawTrail = (
  ctx: CanvasRenderingContext2D,
  view: SceneView,
  points: readonly Point[]
): void => {
  if (points.length < 2) return;
  const { camera, palette } = view;

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Fade the tail so the eye follows the head of the arc.
  const tail = Math.max(0, points.length - 40);
  for (let i = Math.max(1, tail); i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (!a || !b) continue;
    const strength = (i - tail) / Math.max(1, points.length - tail);
    ctx.strokeStyle = palette.accent;
    ctx.globalAlpha = 0.08 + strength * 0.5;
    ctx.lineWidth = Math.max(1, camera.scale * (2 + strength * 6));
    ctx.beginPath();
    ctx.moveTo(toScreenX(camera, a.x), toScreenY(camera, a.y));
    ctx.lineTo(toScreenX(camera, b.x), toScreenY(camera, b.y));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
};

const drawTrajectory = (
  ctx: CanvasRenderingContext2D,
  view: SceneView,
  points: readonly Point[],
  color: string,
  width: number
): void => {
  if (points.length < 2) return;
  const { camera } = view;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash([6, 8]);
  ctx.beginPath();
  points.forEach((point, index) => {
    const x = toScreenX(camera, point.x);
    const y = toScreenY(camera, point.y);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.setLineDash([]);
};

/**
 * The verdict: a marker on the exact landing point and a dotted line back to
 * the centre. The player should never have to take the score on trust — the
 * miss is right there, measured (GDD 26.5).
 */
const drawImpactMarker = (
  ctx: CanvasRenderingContext2D,
  view: SceneView,
  shot: ShotResult
): void => {
  const { camera, level } = view;
  const x = toScreenX(camera, shot.impactX);
  const y = toScreenY(camera, shot.impactY);
  const cx = toScreenX(camera, level.distance);
  const cy = toScreenY(camera, level.height);

  ctx.strokeStyle = 'rgba(242,246,252,0.55)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 5]);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(cx, cy);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = shot.isPerfect ? GOLD : INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y - 26);
  ctx.lineTo(x, y - 6);
  ctx.stroke();
  ctx.fillStyle = shot.isPerfect ? GOLD : INK;
  ctx.beginPath();
  ctx.arc(x, y - 3, 3.5, 0, Math.PI * 2);
  ctx.fill();
};

// -- Gauge -------------------------------------------------------------------

/**
 * The power gauge: an arc around the launcher, graduated but never numbered.
 *
 * No number, because reading a percentage would replace the skill of feeling
 * the rhythm with the skill of reading a readout (GDD 9.9).
 */
const drawGauge = (
  ctx: CanvasRenderingContext2D,
  view: SceneView,
  power: number
): void => {
  const { camera, palette } = view;
  const x = toScreenX(camera, MUZZLE_X);
  const y = toScreenY(camera, MUZZLE_Y);
  const radius = Math.max(38, 84 * camera.scale);
  const start = -Math.PI * 0.85;
  const end = -Math.PI * 0.05;

  ctx.lineCap = 'round';

  ctx.strokeStyle = 'rgba(242,246,252,0.16)';
  ctx.lineWidth = Math.max(5, 9 * camera.scale);
  ctx.beginPath();
  ctx.arc(x, y, radius, start, end);
  ctx.stroke();

  // Graduations, so the player can learn where "just past the peak" is.
  ctx.strokeStyle = 'rgba(242,246,252,0.3)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i <= 4; i++) {
    const angle = start + ((end - start) * i) / 4;
    const inner = radius - 7;
    const outer = radius + 7;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner);
    ctx.lineTo(x + Math.cos(angle) * outer, y + Math.sin(angle) * outer);
    ctx.stroke();
  }

  const filled = start + (end - start) * clamp01(power);
  ctx.strokeStyle = palette.accent;
  ctx.lineWidth = Math.max(5, 9 * camera.scale);
  ctx.beginPath();
  ctx.arc(x, y, radius, start, filled);
  ctx.stroke();

  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(
    x + Math.cos(filled) * radius,
    y + Math.sin(filled) * radius,
    Math.max(4, 6 * camera.scale),
    0,
    Math.PI * 2
  );
  ctx.fill();
};

// -- Practice dressing -------------------------------------------------------

/**
 * A screenshot of a practice shot must be impossible to pass off as an official
 * one (GDD 20). The watermark, the desaturated palette and the italic score are
 * the three signals, and they are deliberately not subtle.
 */
const drawPracticeWatermark = (
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  palette: Palette
): void => {
  ctx.save();
  ctx.translate(camera.width / 2, camera.height / 2);
  ctx.rotate(-0.42);
  ctx.globalAlpha = 0.1;
  ctx.fillStyle = palette.air;
  ctx.font = `800 ${Math.round(camera.width * 0.16)}px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PRACTICE', 0, 0);
  ctx.restore();
  ctx.globalAlpha = 1;
};

const FONT_STACK =
  "'Space Grotesk', ui-sans-serif, system-ui, 'Segoe UI', Roboto, sans-serif";

/** True when the ball's projected landing deserves the slow-motion approach. */
export const shouldSlowMotion = (shot: ShotResult, triggerDx: number): boolean =>
  shot.dx <= triggerDx && shot.impact !== 'OFF_THE_MAP';

/** Progress at which the approach begins, i.e. the last stretch of the flight. */
export const SLOWMO_FROM = 0.82;

export const worldEdge = SPACE_W;
