import { PIP_BODY } from '../theme.ts';
import { COLOR } from '../ui/tokens.ts';
import { clamp01 } from '../motion.ts';

/**
 * Pip: the projectile *is* the character (GDD 25).
 *
 * A charcoal sphere with two eyes and a mouth line. That is the whole rig — no
 * sprites, no frames. Every emotional state is squash, stretch and two eyes,
 * which is why the mascot costs nothing to animate and can carry the failure of
 * a bad shot without it feeling like a punishment.
 */

export type PipMood =
  | 'idle'
  | 'aim'
  | 'flight'
  | 'impact-good'
  | 'impact-bad'
  | 'perfect';

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
};

const EYE_WHITE = COLOR.ink;
/* §13 puts pupils on `ground`. They were #141A26, a near-identical dark that
   existed only here -- one fewer almost-black in the palette. */
const EYE_PUPIL = COLOR.ground;

export const drawPip = (
  ctx: CanvasRenderingContext2D,
  pip: PipRender
): void => {
  const { x, y, radius, mood, squash, angle, time } = pip;

  ctx.save();
  ctx.translate(x, y);

  // Squash and stretch preserve volume, which is what sells weight.
  let scaleX = 1;
  let scaleY = 1;
  if (mood === 'aim') {
    scaleX = 1 + 0.28 * squash;
    scaleY = 1 - 0.22 * squash;
  } else if (mood === 'flight') {
    ctx.rotate(angle);
    scaleX = 1 + 0.35 * squash;
    scaleY = 1 - 0.24 * squash;
  } else if (mood === 'idle') {
    const breathe = Math.sin(time * 2.1) * 0.03;
    scaleX = 1 - breathe;
    scaleY = 1 + breathe;
  } else if (mood === 'impact-good' || mood === 'perfect') {
    const bounce = Math.max(0, Math.sin(time * 12)) * 0.12;
    scaleX = 1 + bounce;
    scaleY = 1 - bounce;
  } else if (mood === 'impact-bad') {
    scaleX = 1.18;
    scaleY = 0.86;
  }

  ctx.scale(scaleX, scaleY);

  ctx.fillStyle = PIP_BODY;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();

  // A single rim light, no blur: depth comes from colour (GDD 49).
  ctx.strokeStyle = 'rgba(242, 246, 252, 0.22)';
  ctx.lineWidth = Math.max(1, radius * 0.12);
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.94, Math.PI * 1.15, Math.PI * 1.85);
  ctx.stroke();

  drawFace(ctx, radius, mood, time);
  ctx.restore();
};

const drawFace = (
  ctx: CanvasRenderingContext2D,
  radius: number,
  mood: PipMood,
  time: number
): void => {
  const eyeOffsetX = radius * 0.36;
  const eyeOffsetY = -radius * 0.12;
  const eyeR = radius * 0.3;

  // A blink every few seconds keeps idle alive without any extra state.
  const blinkPhase = (time % 4.2) / 4.2;
  const blinking = mood === 'idle' && blinkPhase > 0.965;

  if (mood === 'perfect') {
    // Sunglasses. Earned exactly once in a very long while.
    ctx.fillStyle = EYE_PUPIL;
    ctx.fillRect(-radius * 0.78, eyeOffsetY - eyeR * 0.9, radius * 1.56, eyeR * 1.7);
    ctx.strokeStyle = EYE_PUPIL;
    ctx.lineWidth = radius * 0.1;
    ctx.beginPath();
    ctx.moveTo(-radius * 0.95, eyeOffsetY);
    ctx.lineTo(-radius * 0.78, eyeOffsetY);
    ctx.moveTo(radius * 0.78, eyeOffsetY);
    ctx.lineTo(radius * 0.95, eyeOffsetY);
    ctx.stroke();
    drawMouth(ctx, radius, 'grin');
    return;
  }

  for (const side of [-1, 1]) {
    const cx = side * eyeOffsetX;

    if (blinking) {
      ctx.strokeStyle = EYE_PUPIL;
      ctx.lineWidth = Math.max(1.2, radius * 0.11);
      ctx.beginPath();
      ctx.moveTo(cx - eyeR * 0.7, eyeOffsetY);
      ctx.lineTo(cx + eyeR * 0.7, eyeOffsetY);
      ctx.stroke();
      continue;
    }

    ctx.fillStyle = EYE_WHITE;
    ctx.beginPath();
    if (mood === 'aim' || mood === 'flight') {
      // Narrowed against the wind, and against the pressure.
      ctx.ellipse(cx, eyeOffsetY, eyeR, eyeR * 0.55, 0, 0, Math.PI * 2);
    } else {
      ctx.arc(cx, eyeOffsetY, eyeR, 0, Math.PI * 2);
    }
    ctx.fill();

    if (mood === 'impact-bad') {
      // Dazed spirals. The failure has to be endearing, never a scolding.
      ctx.strokeStyle = EYE_PUPIL;
      ctx.lineWidth = Math.max(1, radius * 0.08);
      ctx.beginPath();
      for (let a = 0; a < Math.PI * 3; a += 0.25) {
        const r = (a / (Math.PI * 3)) * eyeR * 0.85;
        const px = cx + Math.cos(a + time * 3) * r;
        const py = eyeOffsetY + Math.sin(a + time * 3) * r;
        if (a === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      continue;
    }

    if (mood === 'impact-good') {
      drawStar(ctx, cx, eyeOffsetY, eyeR * 0.85);
      continue;
    }

    ctx.fillStyle = EYE_PUPIL;
    const look = mood === 'flight' ? eyeR * 0.3 : 0;
    ctx.beginPath();
    ctx.arc(cx + look, eyeOffsetY, eyeR * 0.46, 0, Math.PI * 2);
    ctx.fill();
  }

  drawMouth(
    ctx,
    radius,
    mood === 'impact-good'
      ? 'grin'
      : mood === 'impact-bad'
        ? 'wobble'
        : mood === 'aim' || mood === 'flight'
          ? 'tight'
          : 'neutral'
  );
};

type Mouth = 'neutral' | 'tight' | 'grin' | 'wobble';

const drawMouth = (
  ctx: CanvasRenderingContext2D,
  radius: number,
  mouth: Mouth
): void => {
  const y = radius * 0.42;
  ctx.strokeStyle = EYE_PUPIL;
  ctx.lineWidth = Math.max(1.2, radius * 0.11);
  ctx.lineCap = 'round';
  ctx.beginPath();

  if (mouth === 'grin') {
    ctx.arc(0, y - radius * 0.16, radius * 0.34, 0.15 * Math.PI, 0.85 * Math.PI);
  } else if (mouth === 'wobble') {
    ctx.moveTo(-radius * 0.28, y);
    ctx.quadraticCurveTo(-radius * 0.1, y - radius * 0.12, 0, y);
    ctx.quadraticCurveTo(radius * 0.1, y + radius * 0.12, radius * 0.28, y);
  } else if (mouth === 'tight') {
    ctx.moveTo(-radius * 0.18, y);
    ctx.lineTo(radius * 0.18, y);
  } else {
    ctx.moveTo(-radius * 0.22, y);
    ctx.quadraticCurveTo(0, y + radius * 0.1, radius * 0.22, y);
  }

  ctx.stroke();
};

const drawStar = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number
): void => {
  ctx.fillStyle = COLOR.gold;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? size : size * 0.45;
    const px = cx + Math.cos(angle) * r;
    const py = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
};

/** How squashed Pip is while the gauge climbs: anticipation you can read. */
export const aimSquash = (power: number): number => clamp01(power);
