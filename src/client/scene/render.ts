import {
  MUZZLE_X,
  MUZZLE_Y,
  PERFECT_RADIUS,
  PLATEAU_HALF_WIDTH,
  SPACE_W,
} from '../../shared/tunables.ts';
import { windAt } from '../../shared/sim.ts';
import { verdictFor } from '../../shared/copy.ts';
import type { Level, Point, ShotResult } from '../../shared/types.ts';
import { clamp01, prefersReducedMotion } from '../motion.ts';
import { COLOR } from '../ui/tokens.ts';
import { ATMOSPHERE, GOLD, INK, type Palette } from '../theme.ts';
import { toScreenX, toScreenY, type Camera } from './camera.ts';
import { drawPip, pipMoodFor, type PipMood } from './pip.ts';
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
  /**
   * How much the world dims, 0 to 1 (§5).
   *
   * The tension of a single shot is *shown*, not announced: no red, no
   * countdown, no warning copy. The world simply closes in a little while the
   * thumb is down, and further still when the ball is about to land.
   */
  readonly vignette: number;
  /**
   * Seconds since the shot landed, for the reactions that play once. Separate
   * from `time` because a two-hop celebration keyed on the scene clock hops
   * forever.
   */
  readonly moodTime: number;
};

const PIP_RADIUS_UNITS = 22;

/**
 * Pip is never drawn smaller than this across, whatever the camera scale.
 *
 * GDD 28 makes the shot axis sacred: the full 1000-unit width is always in
 * frame, so on a 390px phone the scale is 0.39 and 22 world units come out as a
 * **17px** mascot — a dot with eyes. The QA checklist calls anything under 28px
 * a failure, and it is right: the character is the brand, and at that size
 * there is no character.
 */
const PIP_MIN_DIAMETER_PX = 28;

export const drawScene = (
  ctx: CanvasRenderingContext2D,
  view: SceneView
): void => {
  const { camera, palette } = view;

  ctx.save();
  ctx.translate(view.shakeX, view.shakeY);

  drawSky(ctx, view);
  drawStarsIfNeeded(ctx, view);
  drawMoonIfNeeded(ctx, view);
  drawWind(ctx, view);
  drawGround(ctx, view);
  drawDistanceTicksIfNeeded(ctx, view);
  drawPlateau(ctx, view);
  drawSpotlightIfNeeded(ctx, view);
  drawTarget(ctx, view);
  drawPennantIfNeeded(ctx, view);
  drawLauncher(ctx, view);

  if (view.ghost) drawTrajectory(ctx, view, view.ghost, 'rgba(242,246,252,0.18)', 2);

  if (view.shot) {
    const upTo = Math.max(
      1,
      Math.floor(view.shot.trajectory.length * clamp01(view.flightProgress))
    );
    // No `slice`: this ran every frame of every flight and allocated up to 122
    // points each time, for a function that only reads the last 40.
    drawTrail(ctx, view, view.shot.trajectory, upTo);
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

  if (view.vignette > 0) drawVignette(ctx, view);

  if (view.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${clamp01(view.flash)})`;
    ctx.fillRect(0, 0, camera.width, camera.height);
  }

  if (view.practice) drawPracticeWatermark(ctx, camera, palette);
};

/**
 * Drawn outside the shake transform: a vignette that moves with the screen
 * reads as a moving frame rather than as the light closing in.
 */
let vignetteCache: { canvas: HTMLCanvasElement; key: string } | null = null;

/**
 * Rasterised once at full strength and composited with an alpha, for the same
 * reason as the sky: a full-screen radial gradient is expensive to rasterise
 * and cheap to blit. Drawn straight, it cost fourteen dropped frames a flight
 * on a 4x-throttled CPU — measured, and reproduced across three runs before
 * being believed.
 *
 * Strength varies only between 12% and 20% (§5), so one bitmap and a
 * `globalAlpha` cover every case without a second cache entry.
 */
const drawVignette = (
  ctx: CanvasRenderingContext2D,
  view: SceneView
): void => {
  const { camera } = view;
  const dpr = ctx.getTransform().a || 1;
  const key = `${camera.width}x${camera.height}@${dpr}`;

  if (vignetteCache?.key !== key) {
    const canvas = vignetteCache?.canvas ?? document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(camera.width * dpr));
    canvas.height = Math.max(1, Math.ceil(camera.height * dpr));
    const off = canvas.getContext('2d');
    if (!off) return;

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const outer = Math.hypot(cx, cy);
    const shade = off.createRadialGradient(cx, cy, outer * 0.45, cx, cy, outer);
    shade.addColorStop(0, 'rgba(0, 0, 0, 0)');
    shade.addColorStop(1, 'rgba(0, 0, 0, 1)');
    off.fillStyle = shade;
    off.fillRect(0, 0, canvas.width, canvas.height);
    vignetteCache = { canvas, key };
  }

  ctx.globalAlpha = clamp01(view.vignette);
  ctx.drawImage(vignetteCache.canvas, 0, 0, camera.width, camera.height);
  ctx.globalAlpha = 1;
};

// -- Background --------------------------------------------------------------

/**
 * The sky, rasterised once per palette and blitted after that.
 *
 * A full-viewport gradient is the single most expensive thing the frame draws,
 * and it was being re-rasterised sixty times a second for an image that only
 * changes when the day's palette does. A CPU profile of a throttled flight put
 * **88% of the time in `(program)`** -- the compositor, not JavaScript, whose
 * whole share was about 8%. That is what says the cost is pixels rather than
 * code, and why batching the trail's stroke calls beforehand bought only three
 * frames.
 *
 * Safe to cache despite the moving camera, because this one is screen space:
 * `drawSky` never reads the camera's position, only its size.
 */
let skyCache: {
  canvas: HTMLCanvasElement;
  key: string;
} | null = null;

const skyBitmap = (
  width: number,
  height: number,
  dpr: number,
  skyHigh: string,
  skyLow: string
): HTMLCanvasElement | null => {
  const key = `${width}x${height}@${dpr}:${skyHigh}:${skyLow}`;
  if (skyCache?.key === key) return skyCache.canvas;

  const canvas = skyCache?.canvas ?? document.createElement('canvas');
  // At device resolution, not CSS resolution. The first version of this cache
  // stored CSS pixels and let the context's DPR transform scale it up on every
  // blit; resampling a 470x800 bitmap each frame cost *more* than the gradient
  // it replaced -- 53 dropped frames against 1. Measured both ways.
  canvas.width = Math.max(1, Math.ceil(width * dpr));
  canvas.height = Math.max(1, Math.ceil(height * dpr));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, skyHigh);
  gradient.addColorStop(1, skyLow);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  skyCache = { canvas, key };
  return canvas;
};

const drawSky = (ctx: CanvasRenderingContext2D, view: SceneView): void => {
  const { camera, palette } = view;
  const w = camera.width + 80;
  const h = camera.height + 80;
  // The context carries the DPR in its transform; `translate` does not touch it.
  const dpr = ctx.getTransform().a || 1;
  const bitmap = skyBitmap(w, h, dpr, palette.skyHigh, palette.skyLow);

  if (!bitmap) {
    // No offscreen context: draw it the slow way rather than draw nothing.
    const gradient = ctx.createLinearGradient(0, 0, 0, camera.height);
    gradient.addColorStop(0, palette.skyHigh);
    gradient.addColorStop(1, palette.skyLow);
    ctx.fillStyle = gradient;
    ctx.fillRect(-40, -40, w, h);
    return;
  }
  // Explicit destination size: source is device pixels, destination is CSS.
  ctx.drawImage(bitmap, -40, -40, w, h);
};

/**
 * The four decorations that make a day nameable without reading the chip (§11).
 *
 * The gate for this phase is exactly that: someone should be able to say
 * "Moon Gravity" from the picture. A sky gradient alone does not carry it —
 * Tiny Target and Clear Skies share a gradient, deliberately — so each day gets
 * one object that only it has.
 */

/** Clear Skies: a fixed constellation that twinkles. Seeded, so it holds still. */
const drawStarsIfNeeded = (
  ctx: CanvasRenderingContext2D,
  view: SceneView
): void => {
  if (ATMOSPHERE[view.level.modifier].air !== 'stars') return;
  const { camera } = view;
  ctx.fillStyle = COLOR.ink;
  for (let i = 0; i < 12; i++) {
    // A cheap deterministic scatter: the same sky every frame and every day.
    const x = ((i * 137) % 100) / 100 * camera.width;
    const y = ((i * 61) % 70) / 100 * camera.height;
    const twinkle = 0.35 + 0.35 * Math.sin(view.time * 1.4 + i);
    ctx.globalAlpha = prefersReducedMotion() ? 0.5 : twinkle;
    ctx.beginPath();
    ctx.arc(x, y, 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
};

/**
 * Long Shot: ticks every 100 units along the ground.
 *
 * The one day where the distance is the difficulty, so the ground is given a
 * ruler. It also happens to be the most useful decoration in the game.
 */
const drawDistanceTicksIfNeeded = (
  ctx: CanvasRenderingContext2D,
  view: SceneView
): void => {
  if (ATMOSPHERE[view.level.modifier].air !== 'haze') return;
  const { camera, palette } = view;
  const groundY = toScreenY(camera, 0);
  ctx.strokeStyle = palette.air;
  ctx.globalAlpha = 0.28;
  ctx.lineWidth = 1;
  for (let x = 100; x < SPACE_W; x += 100) {
    const sx = toScreenX(camera, x);
    const tall = x % 200 === 0;
    ctx.beginPath();
    ctx.moveTo(sx, groundY);
    ctx.lineTo(sx, groundY + (tall ? 10 : 5));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
};

/** Tiny Target: a cone of light, because the mat is half the size it was. */
const drawSpotlightIfNeeded = (
  ctx: CanvasRenderingContext2D,
  view: SceneView
): void => {
  if (ATMOSPHERE[view.level.modifier].air !== 'spot') return;
  const { camera, level } = view;
  const cx = toScreenX(camera, level.distance);
  const top = toScreenY(camera, level.height + 520);
  const base = toScreenY(camera, level.height);
  const spread = Math.max(24, level.targetR * camera.scale * 3.2);

  const cone = ctx.createLinearGradient(0, top, 0, base);
  cone.addColorStop(0, 'rgba(255, 197, 61, 0)');
  cone.addColorStop(1, 'rgba(255, 197, 61, 0.1)');
  ctx.fillStyle = cone;
  ctx.beginPath();
  ctx.moveTo(cx - spread * 0.25, top);
  ctx.lineTo(cx + spread * 0.25, top);
  ctx.lineTo(cx + spread, base);
  ctx.lineTo(cx - spread, base);
  ctx.closePath();
  ctx.fill();
};

/**
 * Crosswind and Gusty: a pennant on the mat.
 *
 * §11 calls it a reading aid and means it — it is the only decoration that
 * carries information, and on a Gusty day it is the only thing on screen that
 * shows a gust arriving before the ball does.
 */
const drawPennantIfNeeded = (
  ctx: CanvasRenderingContext2D,
  view: SceneView
): void => {
  if (!ATMOSPHERE[view.level.modifier].pennant) return;
  const { camera, level, palette } = view;
  const x = toScreenX(camera, level.distance + level.targetR * 1.6);
  const base = toScreenY(camera, level.height);
  const height = Math.max(18, 34 * camera.scale);
  const wind = windAt(level, view.time);
  const direction = wind < 0 ? -1 : 1;
  const strength = Math.min(1, Math.abs(wind) / 420);
  const flutter = prefersReducedMotion() ? 0 : Math.sin(view.time * 6) * 2;

  ctx.strokeStyle = palette.air;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, base);
  ctx.lineTo(x, base - height);
  ctx.stroke();

  const length = height * (0.35 + strength * 0.5) * direction;
  ctx.fillStyle = COLOR.coral;
  ctx.beginPath();
  ctx.moveTo(x, base - height);
  ctx.lineTo(x + length, base - height + 4 + flutter);
  ctx.lineTo(x, base - height + 9);
  ctx.closePath();
  ctx.fill();
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

/**
 * The air, in §11's seven styles.
 *
 * Three of them are the same streaks at different lengths and heights, and two
 * are not streaks at all. The distinction that matters is at the bottom: a
 * `spot` day draws almost nothing, because Tiny Target's identity is *stillness*
 * under a spotlight, and a Gusty day pulses, because a gust the player can see
 * arriving is the only warning that day gives.
 */
const drawWind = (ctx: CanvasRenderingContext2D, view: SceneView): void => {
  const { camera, palette, level } = view;
  const air = ATMOSPHERE[level.modifier].air;
  if (air === 'spot') return;

  const direction = level.windBase < 0 ? -1 : 1;
  const strength = clamp01(Math.abs(level.windBase) / 420);
  if (strength < 0.02 && air !== 'speedlines') return;

  /*
   * Gusty pulses: a bloom every 0.8-2s, which is what makes the flag snap and
   * the day feel like it is doing something to the ball. Frozen under reduced
   * motion rather than removed, so the day still reads.
   */
  const gustPhase =
    air === 'gusts' && !prefersReducedMotion()
      ? 0.6 + 0.4 * Math.max(0, Math.sin(view.time * 2.2))
      : 1;

  ctx.strokeStyle = palette.air;
  ctx.lineWidth = Math.max(1, camera.scale * (air === 'speedlines' ? 1.1 : 1.6));
  ctx.globalAlpha = (0.1 + strength * 0.3) * gustPhase;

  for (const streak of view.windStreaks) {
    // Tailwind's speed lines hug the ground and run long: the wind is behind
    // the shot, so it reads along the axis the ball travels rather than across.
    const low = air === 'speedlines' && streak.y > 320;
    if (air === 'speedlines' && !low) continue;

    const x = toScreenX(camera, streak.x);
    const y = toScreenY(camera, streak.y);
    const stretch = air === 'speedlines' ? 2.2 : 1;
    const length = streak.length * camera.scale * (0.4 + strength) * stretch;
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

  /*
   * §9's reward, and the only place besides the mat's own light where a glow is
   * allowed at all (§3).
   *
   * A Bullseye lifts the halo from 18% to 40%; a Perfect adds the shockwave
   * below. Both are gated on the shot having landed, so the mat does not
   * announce a Bullseye while the ball is still in the air.
   */
  const landed = view.shot !== null && view.flightProgress >= 1;
  const celebrating = landed && (view.shot?.isBullseye || view.shot?.isPerfect);
  const glow = celebrating ? Math.max(palette.targetGlow, 1.8) : palette.targetGlow;
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

  /*
   * The Perfect shockwave: one expanding ring, 600ms, out-expo, fading as it
   * goes. Under reduced motion it is a fade in place rather than an expansion,
   * per §9's last line.
   */
  if (landed && view.shot?.isPerfect) {
    const progress = clamp01(view.moodTime / 0.6);
    if (progress < 1) {
      const eased = 1 - Math.pow(1 - progress, 4);
      const still = prefersReducedMotion();
      const radius = level.targetR * unit * (still ? 2.4 : 1 + eased * 5);
      ctx.strokeStyle = `rgba(255, 197, 61, ${(1 - progress) * 0.8})`;
      ctx.lineWidth = Math.max(2, unit * 4 * (1 - progress));
      ctx.beginPath();
      ctx.ellipse(cx, cy, radius, radius * 0.34, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
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
  const radius = Math.max(PIP_RADIUS_UNITS * unit, PIP_MIN_DIAMETER_PX / 2);

  let mood: PipMood = 'idle';
  let squash = 0;
  let position = { x: MUZZLE_X, y: MUZZLE_Y, angle: 0, speed: 0 };

  if (shot && view.flightProgress > 0) {
    position = pointAt(view);
    if (view.flightProgress >= 1) {
      /*
       * The face comes from the verdict the player is reading, not from a
       * second threshold beside it. It used to be `score >= 87`, which was the
       * mat edge under the old curve and is now well inside the miss bands --
       * so Pip did his pleased landing under `NEAR MISS`. One source, no drift.
       */
      mood = pipMoodFor(
        verdictFor({
          score: shot.score,
          dx: shot.dx,
          impact: shot.impact,
          targetR: view.level.targetR,
        })
      );
    } else {
      mood = 'flight';
      squash = clamp01(position.speed / 1400);
    }
  } else if (view.power !== null) {
    // §8's fear: the eyes shrink as the hold lengthens.
    mood = 'fear';
    squash = view.power;
  } else if (ATMOSPHERE[view.level.modifier].tic === 'squint') {
    // Tiny Target's tic, deferred from phase 3 until the rig could carry it.
    mood = 'squint';
  }

  drawPip(ctx, {
    x: toScreenX(camera, position.x),
    y: toScreenY(camera, position.y),
    radius,
    mood,
    squash,
    angle: position.angle,
    time: view.time,
    moodTime: view.moodTime,
    // Crosswind leans Pip into the wind: 1.5 degrees, the only tic that is a
    // rotation rather than a face.
    lean:
      ATMOSPHERE[view.level.modifier].tic === 'lean'
        ? (view.level.windBase < 0 ? 1 : -1) * (Math.PI / 180) * 1.5
        : 0,
  });
};

/** How much of the arc keeps its trail behind the ball. */
const TRAIL_SAMPLES = 40;

/**
 * The fade is drawn in this many bands, not per segment.
 *
 * It used to be one `beginPath`/`stroke` per sample — forty canvas state
 * changes and forty rasterisations every frame, because alpha and width change
 * along the tail. Measured on a 4x-throttled CPU that was seventeen dropped
 * frames per flight while aiming dropped one. Five bands is the same gradient
 * to the eye at a fifth of the calls: the tail is ~40 samples long and the
 * alpha step between bands is under a tenth.
 */
const TRAIL_BANDS = 5;

const drawTrail = (
  ctx: CanvasRenderingContext2D,
  view: SceneView,
  points: readonly Point[],
  upTo: number
): void => {
  const end = Math.min(upTo, points.length);
  if (end < 2) return;
  const { camera, palette } = view;

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = palette.accent;

  const tail = Math.max(0, end - TRAIL_SAMPLES);
  const span = Math.max(1, end - tail);

  for (let band = 0; band < TRAIL_BANDS; band++) {
    const from = tail + Math.floor((span * band) / TRAIL_BANDS);
    const to = tail + Math.floor((span * (band + 1)) / TRAIL_BANDS);
    if (to - from < 1) continue;

    const strength = (band + 0.5) / TRAIL_BANDS;
    ctx.globalAlpha = 0.08 + strength * 0.5;
    ctx.lineWidth = Math.max(1, camera.scale * (2 + strength * 6));

    ctx.beginPath();
    // Start one sample early so consecutive bands meet instead of leaving a gap.
    for (let i = Math.max(1, from); i <= to && i < end; i++) {
      const a = points[i - 1];
      const b = points[i];
      if (!a || !b) continue;
      if (i === Math.max(1, from)) {
        ctx.moveTo(toScreenX(camera, a.x), toScreenY(camera, a.y));
      }
      ctx.lineTo(toScreenX(camera, b.x), toScreenY(camera, b.y));
    }
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
 * one (GDD 20).
 *
 * It used to be the word set diagonally across the whole frame at 16% of the
 * viewport width -- **307px of type on a full-screen desktop** -- which buried
 * the scene it was supposed to annotate. It was also redundant: the panel
 * already prints `PRACTICE` where the verdict goes, the score is italic, the
 * palette is desaturated and there is no share button. Four signals; the fifth
 * did not need to be a billboard.
 *
 * A badge instead, at a fixed size so it never grows with the window: pinned
 * under the day bar, always in frame, unmistakable in a screenshot and out of
 * the way of the game.
 */
const drawPracticeWatermark = (
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  palette: Palette
): void => {
  const label = 'PRACTICE';
  const height = 22;
  const y = 74; // clear of the day bar, which the canvas is drawn behind

  ctx.save();
  ctx.font = `700 12px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const width = ctx.measureText(label).width + 34;
  const x = camera.width / 2;

  ctx.globalAlpha = 0.85;
  ctx.fillStyle = 'rgba(13, 22, 38, 0.72)';
  ctx.beginPath();
  ctx.roundRect(x - width / 2, y - height / 2, width, height, height / 2);
  ctx.fill();

  ctx.strokeStyle = palette.air;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.globalAlpha = 0.9;
  ctx.fillStyle = palette.air;
  // The tracking §13 gives labels, done by hand: canvas has no letter-spacing.
  const tracked = label.split('').join(' ');
  ctx.fillText(tracked, x, y + 0.5);
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
