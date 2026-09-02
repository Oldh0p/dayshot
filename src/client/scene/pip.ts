import { PIP_BODY } from '../theme.ts';
import { COLOR } from '../ui/tokens.ts';
import { clamp01, prefersReducedMotion } from '../motion.ts';
import type { Verdict } from '../../shared/copy.ts';

/**
 * Pip: the projectile *is* the character (GDD 25, redesign §8).
 *
 * **Seven shapes, and no eighth.** A body disc, one fixed highlight, two eye
 * whites, two pupils, an eyelid arc, a four-point star pupil, and a pair of
 * closed happy arcs. Everything else — twelve expressions across a feed card,
 * a hold, a flight and eight verdict bands — is transformation: scale, rotation,
 * pupil offset, eyelid coverage.
 *
 * The mouth the earlier rig drew is gone. §8's anatomy does not have one, and
 * that is a design decision rather than an omission: a mouth is the shape that
 * tempts you into drawing a *thirteenth* expression, and the eyes already carry
 * every state the game has. Dazed is orbiting pupils, not a wavy line.
 *
 * Nothing here reads the simulation. Pip is told where he is and how he feels.
 */

export type PipMood =
  /** Feed and aiming: lids open, pupils centred, breathing. */
  | 'idle'
  /** Lids fully closed, 120ms. */
  | 'blink'
  /** Pupils toward the mat. */
  | 'glance'
  /** Under the thumb: pupils shrink, body squashes, one pixel of tremble. */
  | 'fear'
  /** In the air: squinting, pupils along the velocity, stretched. */
  | 'flight'
  /** SCENIC ROUTE, ROUGH LANDING, OFF THE MAP. */
  | 'dazed'
  /** NOT BAD, NEAR MISS. */
  | 'deadpan'
  /** ON THE MAT. */
  | 'bright'
  /** SO CLOSE: both eyes shut, then one opens. */
  | 'peek'
  /** BULLSEYE. */
  | 'star'
  /** PERFECT. */
  | 'bliss'
  /** Tiny Target's squint. */
  | 'squint';

export type PipRender = {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly mood: PipMood;
  /** 0 = round, 1 = fully squashed or stretched. */
  readonly squash: number;
  /** Direction of travel in radians, for the flight stretch. */
  readonly angle: number;
  /** Seconds since the scene opened, for breathing and blinking. */
  readonly time: number;
  /**
   * Seconds since this mood began. Reactions that play once — the dazed orbit,
   * the star's two hops — need their own clock, or they restart on every frame
   * the scene happens to be redrawn from.
   */
  readonly moodTime?: number;
  /** Crosswind's lean, in radians. Applied on top of everything else. */
  readonly lean?: number;
};

const EYE_WHITE = COLOR.ink;
/** §13 puts pupils on `ground`, which is also the ground the mat sits on. */
const EYE_PUPIL = COLOR.ground;

/** Shared geometry, as fractions of the body radius (§8). */
const EYE_X = 0.36;
const EYE_Y = -0.12;
const EYE_R = 0.2;
const PUPIL_R = 0.42;

type Face = {
  /** Eyelid coverage, 0 open to 1 shut. */
  readonly lids: readonly [number, number];
  /** Pupil offset from the eye's centre, in body radii. */
  readonly look: readonly [number, number];
  /** Pupil size multiplier. */
  readonly pupil: number;
  readonly style: 'round' | 'star' | 'happy';
};

const OPEN: Face = { lids: [0, 0], look: [0, 0], pupil: 1, style: 'round' };

/**
 * The face for a mood, at a moment.
 *
 * Kept as data rather than branches inside the drawing code, so the twelve
 * expressions can be read side by side and a new one cannot quietly forget a
 * field.
 */
const faceFor = (mood: PipMood, t: number, moodT: number): Face => {
  const still = prefersReducedMotion();
  switch (mood) {
    case 'blink':
      return { ...OPEN, lids: [1, 1] };

    case 'glance':
      return { ...OPEN, look: [0.14, 0] };

    case 'fear':
      // §8: pupils shrink with the hold. The eyes get smaller as the world
      // darkens, which is the whole tension of a single shot in one gesture.
      return { ...OPEN, pupil: 0.6, look: [0.04, 0.02] };

    case 'flight':
      return { ...OPEN, lids: [0.3, 0.3], look: [0.16, 0] };

    case 'dazed': {
      // Two turns in 900ms, then a slow blink.
      const turns = still ? 0 : Math.min(2, moodT / 0.45);
      const spin = turns * Math.PI * 2;
      const settled = moodT > 0.9;
      return {
        ...OPEN,
        look: settled ? [0, 0.04] : [Math.cos(spin) * 0.12, Math.sin(spin) * 0.12],
        lids: settled ? [0.55, 0.55] : [0, 0],
      };
    }

    case 'deadpan':
      // Looking sideways at the mat, one lid half down. The face of a shot
      // that was fine and nothing more.
      return { ...OPEN, look: [0.16, 0], lids: [0.5, 0] };

    case 'bright':
      return { ...OPEN, pupil: 1.2 };

    case 'peek': {
      // Both shut, then the left one opens toward the centre: the "argh" of a
      // shot that nearly went in, and the only expression with two beats.
      const opened = moodT > 0.5;
      return {
        ...OPEN,
        lids: opened ? [0, 1] : [1, 1],
        look: opened ? [0.16, 0] : [0, 0],
      };
    }

    case 'star':
      return { ...OPEN, style: 'star', pupil: 1.1 };

    case 'bliss':
      return { ...OPEN, style: 'happy' };

    case 'squint':
      return { ...OPEN, lids: [0.4, 0.4] };

    case 'idle':
    default: {
      // A blink every few seconds, from the shared clock, so a whole feed of
      // Pips does not blink in unison.
      const phase = (t % 4.2) / 4.2;
      return phase > 0.965 && !still ? { ...OPEN, lids: [1, 1] } : OPEN;
    }
  }
};

/** Body transform for a mood. Volume is preserved: that is what sells weight. */
const bodyFor = (
  mood: PipMood,
  squash: number,
  t: number,
  moodT: number
): { scaleX: number; scaleY: number; rotate: number; dy: number } => {
  const still = prefersReducedMotion();
  const flat = { scaleX: 1, scaleY: 1, rotate: 0, dy: 0 };

  switch (mood) {
    case 'fear': {
      const tremble = still ? 0 : Math.sin(t * 40) * 0.5;
      return {
        scaleX: 1 + 0.12 * squash,
        scaleY: 1 - 0.12 * squash,
        rotate: 0,
        dy: tremble,
      };
    }
    case 'flight':
      return {
        scaleX: 1 + 0.25 * squash,
        scaleY: 1 - 0.2 * squash,
        rotate: 0,
        dy: 0,
      };
    case 'dazed': {
      const wobble = still ? 0 : Math.sin(moodT * 6) * (Math.PI / 180) * 4;
      return { ...flat, rotate: wobble };
    }
    case 'bright': {
      // One spring hop, once.
      const hop = still ? 0 : Math.max(0, Math.sin(moodT * 7)) * (1 - clamp01(moodT / 0.9));
      return { ...flat, dy: -hop * 8 };
    }
    case 'star': {
      // Two.
      const hop = still ? 0 : Math.max(0, Math.sin(moodT * 9)) * (1 - clamp01(moodT / 1.4));
      return { ...flat, dy: -hop * 10 };
    }
    case 'bliss': {
      const float = still ? 0 : Math.sin(moodT * 2.2) * 6;
      return { ...flat, dy: float };
    }
    case 'idle':
    case 'glance':
    case 'squint': {
      const breathe = still ? 0 : Math.sin(t * 2.1) * 0.03;
      return { scaleX: 1 - breathe, scaleY: 1 + breathe, rotate: 0, dy: 0 };
    }
    default:
      return flat;
  }
};

export const drawPip = (
  ctx: CanvasRenderingContext2D,
  pip: PipRender
): void => {
  const { x, y, radius, mood, squash, angle, time } = pip;
  const moodT = pip.moodTime ?? time;

  const body = bodyFor(mood, squash, time, moodT);
  const face = faceFor(mood, time, moodT);

  ctx.save();
  ctx.translate(x, y + body.dy);
  if (mood === 'flight') ctx.rotate(angle);
  ctx.rotate(body.rotate + (pip.lean ?? 0));
  ctx.scale(body.scaleX, body.scaleY);

  if (mood === 'bliss') {
    const halo = ctx.createRadialGradient(0, 0, radius, 0, 0, radius * 2.4);
    halo.addColorStop(0, 'rgba(255, 197, 61, 0.34)');
    halo.addColorStop(1, 'rgba(255, 197, 61, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = PIP_BODY;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();

  // §8's fixed highlight: one ellipse, top left, never animated. No blur —
  // depth comes from colour (§3).
  ctx.fillStyle = 'rgba(242, 246, 252, 0.25)';
  ctx.beginPath();
  ctx.ellipse(
    -radius * 0.36,
    -radius * 0.42,
    radius * 0.3,
    radius * 0.18,
    -0.6,
    0,
    Math.PI * 2
  );
  ctx.fill();

  drawFace(ctx, radius, face);
  ctx.restore();
};

const drawFace = (
  ctx: CanvasRenderingContext2D,
  radius: number,
  face: Face
): void => {
  const eyeR = radius * EYE_R;

  if (face.style === 'happy') {
    // Two upward arcs replace the eyes entirely.
    ctx.strokeStyle = EYE_WHITE;
    ctx.lineWidth = Math.max(1.5, radius * 0.1);
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(
        side * radius * EYE_X,
        radius * EYE_Y + eyeR * 0.3,
        eyeR,
        Math.PI * 1.15,
        Math.PI * 1.85
      );
      ctx.stroke();
    }
    return;
  }

  for (const side of [-1, 1]) {
    const cx = side * radius * EYE_X;
    const cy = radius * EYE_Y;

    ctx.fillStyle = EYE_WHITE;
    ctx.beginPath();
    ctx.arc(cx, cy, eyeR, 0, Math.PI * 2);
    ctx.fill();

    const px = cx + face.look[0] * radius;
    const py = cy + face.look[1] * radius;
    const pr = eyeR * PUPIL_R * face.pupil;

    ctx.fillStyle = EYE_PUPIL;
    if (face.style === 'star') drawStar(ctx, px, py, pr * 1.8);
    else {
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();
    }

    // The eyelid is an arc of the body colour dropped over the eye, which is
    // why it needs no mask and no second canvas.
    const lid = face.lids[side < 0 ? 0 : 1] ?? 0;
    if (lid > 0) {
      ctx.fillStyle = PIP_BODY;
      ctx.beginPath();
      ctx.rect(cx - eyeR * 1.1, cy - eyeR * 1.1, eyeR * 2.2, eyeR * 2.2 * lid);
      ctx.save();
      ctx.clip();
      ctx.beginPath();
      ctx.arc(cx, cy, eyeR * 1.02, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
};

/** The four-point pupil. Bullseye only, which is what makes it worth having. */
const drawStar = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number
): void => {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4 - Math.PI / 2;
    const reach = i % 2 === 0 ? r : r * 0.38;
    const px = cx + Math.cos(angle) * reach;
    const py = cy + Math.sin(angle) * reach;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
};

export const aimSquash = (power: number): number => clamp01(power);

/**
 * How Pip takes the news (§8).
 *
 * One mapping, from the verdict the player is reading to the face beside it, so
 * the mascot and the word can never disagree — the failure mode being a Pip
 * doing his delighted hop under `SCENIC ROUTE`.
 *
 * `INTO THE WALL` joins the dazed group: it is a bad outcome and the wall is
 * funny, which is the tone §10.2 asks for throughout — never a punishment.
 */
export const pipMoodFor = (verdict: Verdict): PipMood => {
  switch (verdict) {
    case 'PERFECT':
      return 'bliss';
    case 'BULLSEYE':
      return 'star';
    case 'SO CLOSE':
      return 'peek';
    case 'ON THE MAT':
      return 'bright';
    case 'NEAR MISS':
    case 'NOT BAD':
      return 'deadpan';
    default:
      return 'dazed';
  }
};
