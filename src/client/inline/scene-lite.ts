import { drawPip } from '../scene/pip.ts';
import { paletteFor, type Palette } from '../theme.ts';
import { COLOR, MAX_DPR, PARTICLES, RING } from '../ui/tokens.ts';
import type { ModifierId } from '../../shared/types.ts';

/**
 * The feed's scene: the game's world, at a different crop (§3, §4.2).
 *
 * Recognition is the whole point. Someone who scrolls past this twice should
 * know the game on the second pass, which only works if the card and the game
 * are the same picture — same Pip, same mat, same sky. So `drawPip` is the
 * game's, not a copy.
 *
 * **What it must never be.** No simulation: the arc is decorative and generic,
 * never the day's trajectory, or the card would hand out the answer (§4.2). No
 * audio. No input beyond the buttons `main.ts` owns. Nothing here can throw a
 * shot, and nothing here knows how.
 */

export type SceneMode =
  /** States A and B: Pip on the launcher, looking at the mat. */
  | { readonly kind: 'idle' }
  /**
   * State C: Pip where the shot landed. Placed from `signedDx` alone — the
   * miss distance the server already sent — because computing a real landing
   * point would mean importing the simulation.
   */
  | { readonly kind: 'landed'; readonly signedDx: number };

export type SceneOptions = {
  readonly canvas: HTMLCanvasElement;
  readonly modifier: ModifierId;
  readonly mode: SceneMode;
  readonly reducedMotion: boolean;
};

/** §4.5's loop, in seconds. */
const LOOP_S = 6;
const BLINK_MS = 120;
const COMET_FROM = 3.0;
const COMET_TO = 4.4;
const GLANCE_FROM = 2.0;
const GLANCE_TO = 3.6;
const PULSE_AT = 4.4;
const PULSE_MS = 500;

/** 30fps: this runs inside someone's scroll, on a device already busy. */
const FRAME_MS = 1000 / 30;

const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

const easeOutSine = (t: number): number => Math.sin((t * Math.PI) / 2);

type Drifter = { x: number; y: number; vx: number; vy: number; r: number };

/**
 * The world, in fractions of the canvas box, so one composition serves 360×350,
 * 360×512 and 700×512 without a second layout.
 */
const layout = (w: number, h: number) => {
  const wide = w / h > 1.25;
  return {
    groundY: h * (wide ? 0.74 : 0.72),
    launcherX: w * (wide ? 0.12 : 0.15),
    targetX: w * (wide ? 0.8 : 0.78),
    plateauY: h * (wide ? 0.56 : 0.5),
    targetR: Math.max(11, Math.min(w, h) * (wide ? 0.05 : 0.07)),
    /**
     * Two floors and a ceiling. Under 28px across a mascot reads as a dot, so
     * 14 is the radius floor; but a Pip bigger than the mat hides the one
     * object the card exists to point at, which is what the first 512px capture
     * did. The mat wins the tie.
     */
    pipR: Math.max(14, Math.min(h * 0.055, Math.min(w, h) * (wide ? 0.05 : 0.07) * 1.25)),
  };
};

export class InlineScene {
  #canvas: HTMLCanvasElement;
  #ctx: CanvasRenderingContext2D;
  #palette: Palette;
  #mode: SceneMode;
  #reduced: boolean;
  #drifters: Drifter[] = [];
  #raf = 0;
  #lastFrame = 0;
  #startedAt = 0;
  #running = false;
  #observer: IntersectionObserver | null = null;
  #onVisibility: (() => void) | null = null;

  constructor(options: SceneOptions) {
    this.#canvas = options.canvas;
    const ctx = options.canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    this.#ctx = ctx;
    this.#palette = paletteFor(options.modifier, 0);
    this.#mode = options.mode;
    this.#reduced = options.reducedMotion;
    this.#resize();
    this.#seedDrifters();
  }

  /**
   * Starts drawing, and stops whenever nobody is looking.
   *
   * Two independent reasons to stop, because either alone leaves a case
   * running: the card scrolled out of the feed, and the tab went to the
   * background.
   */
  start(): void {
    this.#startedAt = performance.now();
    this.#observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((e) => e.isIntersecting);
        if (visible) this.#resume();
        else this.#pause();
      },
      { threshold: 0.05 }
    );
    this.#observer.observe(this.#canvas);

    this.#onVisibility = () => {
      if (document.hidden) this.#pause();
      else this.#resume();
    };
    document.addEventListener('visibilitychange', this.#onVisibility);

    this.#resume();
  }

  stop(): void {
    this.#pause();
    this.#observer?.disconnect();
    if (this.#onVisibility) {
      document.removeEventListener('visibilitychange', this.#onVisibility);
    }
  }

  resize(): void {
    this.#resize();
    this.#seedDrifters();
    this.#draw(this.#elapsed());
  }

  #elapsed(): number {
    return (performance.now() - this.#startedAt) / 1000;
  }

  #resume(): void {
    if (this.#running) return;
    this.#running = true;
    const tick = (now: number): void => {
      if (!this.#running) return;
      this.#raf = requestAnimationFrame(tick);
      if (now - this.#lastFrame < FRAME_MS) return;
      this.#lastFrame = now;
      this.#draw(this.#elapsed());
    };
    this.#raf = requestAnimationFrame(tick);
  }

  #pause(): void {
    this.#running = false;
    cancelAnimationFrame(this.#raf);
  }

  #resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const rect = this.#canvas.getBoundingClientRect();
    this.#canvas.width = Math.round(rect.width * dpr);
    this.#canvas.height = Math.round(rect.height * dpr);
    this.#ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  #box(): { w: number; h: number } {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    return { w: this.#canvas.width / dpr, h: this.#canvas.height / dpr };
  }

  #seedDrifters(): void {
    const { w, h } = this.#box();
    // §13 caps the feed at 24 particles, whatever the modifier asks for.
    const count = this.#reduced ? 0 : PARTICLES.feed;
    this.#drifters = Array.from({ length: count }, (_, i) => ({
      x: ((i * 97) % 100) / 100 * w,
      y: ((i * 61) % 100) / 100 * h * 0.7,
      vx: 6 + ((i * 13) % 10),
      vy: -2 + ((i * 7) % 5) * 0.4,
      r: 1 + ((i * 5) % 3) * 0.5,
    }));
  }

  // -- drawing ---------------------------------------------------------------

  #draw(t: number): void {
    const { w, h } = this.#box();
    const L = layout(w, h);
    const ctx = this.#ctx;
    const loop = this.#reduced ? 0 : t % LOOP_S;

    ctx.clearRect(0, 0, w, h);
    this.#sky(w, h);
    if (!this.#reduced) this.#drift(w, h);
    this.#ground(w, h, L);
    this.#plateau(L);
    // A landed Pip is drawn *under* the rings: he sits on the mat, and the mat
    // is the one object the card exists to point at.
    if (this.#mode.kind === 'landed') this.#pip(t, loop, L);
    this.#target(L, loop);
    this.#ghostArc(L, loop);
    if (this.#mode.kind === 'idle') this.#pip(t, loop, L);
  }

  #sky(w: number, h: number): void {
    const ctx = this.#ctx;
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, this.#palette.skyHigh);
    sky.addColorStop(1, this.#palette.skyLow);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
  }

  #drift(w: number, h: number): void {
    const ctx = this.#ctx;
    ctx.fillStyle = this.#palette.air;
    ctx.globalAlpha = 0.35;
    for (const p of this.#drifters) {
      p.x += p.vx / 30;
      p.y += p.vy / 30;
      if (p.x > w + 4) p.x = -4;
      if (p.y < -4) p.y = h * 0.7;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** Two bands, because depth here comes from value, not from shadows (§3). */
  #ground(w: number, h: number, L: ReturnType<typeof layout>): void {
    const ctx = this.#ctx;
    ctx.fillStyle = this.#palette.ground;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(0, L.groundY, w, h - L.groundY);
    ctx.globalAlpha = 1;
    ctx.fillRect(0, L.groundY + (h - L.groundY) * 0.38, w, h);
  }

  /**
   * The plateau the mat stands on. Value, not outline: §3 builds depth from
   * three planes of colour rather than shadows, so this is the ground band
   * lifted, with one lighter edge to catch the mat's light.
   */
  #plateau(L: ReturnType<typeof layout>): void {
    const ctx = this.#ctx;
    const { targetX, plateauY, targetR, groundY } = L;
    const halfWidth = targetR * 1.9;

    ctx.fillStyle = this.#palette.ground;
    ctx.globalAlpha = 0.92;
    ctx.fillRect(targetX - halfWidth, plateauY, halfWidth * 2, groundY - plateauY + 2);
    ctx.globalAlpha = 1;

    ctx.fillStyle = this.#palette.air;
    ctx.globalAlpha = 0.12;
    ctx.fillRect(targetX - halfWidth, plateauY, halfWidth * 2, 2);
    ctx.globalAlpha = 1;
  }

  #target(L: ReturnType<typeof layout>, loop: number): void {
    const ctx = this.#ctx;
    const { targetX, plateauY, targetR } = L;

    // The mat is the only light source in the scene (§3).
    const pulse =
      loop >= PULSE_AT && loop < PULSE_AT + PULSE_MS / 1000
        ? 1 + 0.04 * easeOutSine(1 - (loop - PULSE_AT) / (PULSE_MS / 1000))
        : 1;
    const r = targetR * pulse;

    const halo = ctx.createRadialGradient(targetX, plateauY, 0, targetX, plateauY, r * 2);
    halo.addColorStop(0, `rgba(255, 197, 61, ${0.18 * this.#palette.targetGlow})`);
    halo.addColorStop(1, 'rgba(255, 197, 61, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(targetX, plateauY, r * 2, 0, Math.PI * 2);
    ctx.fill();

    const ring = (radius: number, color: string, width: number): void => {
      ctx.beginPath();
      ctx.ellipse(targetX, plateauY, radius, radius * 0.34, 0, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
    };
    ring(r, RING.outer, 2);
    ring(r * 0.62, RING.mid, 2);
    ctx.fillStyle = RING.center;
    ctx.beginPath();
    ctx.ellipse(targetX, plateauY, r * 0.2, r * 0.2 * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * A generic arc, and the comet that runs it — the card's one spectacular
   * element (§4.5). Decorative by contract: it is a fixed curve between the
   * launcher and the mat, not the day's trajectory.
   */
  #ghostArc(L: ReturnType<typeof layout>, loop: number): void {
    if (this.#mode.kind === 'landed') return;
    const ctx = this.#ctx;
    const from = { x: L.launcherX, y: L.groundY - L.pipR * 1.6 };
    const to = { x: L.targetX, y: L.plateauY };
    const peak = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - L.pipR * 3.4 };

    const at = (p: number): { x: number; y: number } => {
      const inv = 1 - p;
      return {
        x: inv * inv * from.x + 2 * inv * p * peak.x + p * p * to.x,
        y: inv * inv * from.y + 2 * inv * p * peak.y + p * p * to.y,
      };
    };

    ctx.fillStyle = COLOR.ink;
    ctx.globalAlpha = 0.22;
    for (let i = 1; i < 24; i++) {
      const { x, y } = at(i / 24);
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (this.#reduced || loop < COMET_FROM || loop > COMET_TO) return;
    const p = easeInOutCubic((loop - COMET_FROM) / (COMET_TO - COMET_FROM));
    for (let tail = 0; tail < 4; tail++) {
      const q = Math.max(0, p - tail * 0.035);
      const { x, y } = at(q);
      ctx.globalAlpha = (1 - tail * 0.22) * 0.9;
      ctx.fillStyle = tail === 0 ? COLOR.ink : this.#palette.accent;
      ctx.beginPath();
      ctx.arc(x, y, tail === 0 ? 2.4 : 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  #pip(t: number, loop: number, L: ReturnType<typeof layout>): void {
    const ctx = this.#ctx;
    // Bound once so the narrowing survives: a `landed` boolean does not narrow
    // a field read off `this`.
    const mode = this.#mode;
    const landed = mode.kind === 'landed';

    // `signedDx` is a miss in world units; the card has no world, so it is
    // shown as a fraction of the mat's own radius. Truthful about which side
    // and roughly how far, without pretending to a scale it lacks.
    const x =
      mode.kind === 'landed'
        ? L.targetX + clampDx(mode.signedDx) * L.targetR * 1.6
        : L.launcherX;
    // Resting on the surface, not hovering over its middle.
    const y = landed ? L.plateauY - L.pipR * 0.9 : L.groundY - L.pipR * 1.6;

    if (!landed) {
      ctx.fillStyle = this.#palette.ground;
      ctx.fillRect(L.launcherX - 3, L.groundY - L.pipR * 1.1, 6, L.pipR * 1.4);
    }

    // §4.5: blink at 1.2s and 4.6s, glance between 2.0s and 3.6s.
    const blinking =
      !this.#reduced &&
      ((loop >= 1.2 && loop < 1.2 + BLINK_MS / 1000) ||
        (loop >= 4.6 && loop < 4.6 + BLINK_MS / 1000));
    // Reduced motion keeps the blink: it is slow, small, and the only sign of
    // life left once everything else is frozen (§9, last line).
    const reducedBlink = this.#reduced && t % 5 < BLINK_MS / 1000;

    const glancing = !this.#reduced && loop >= GLANCE_FROM && loop <= GLANCE_TO;

    drawPip(ctx, {
      x,
      y,
      radius: L.pipR,
      mood: blinking || reducedBlink ? 'impact-good' : glancing ? 'aim' : 'idle',
      squash: 0,
      angle: 0,
      time: this.#reduced ? 0 : t,
    });

    if (landed) this.#marker(x, y, L);
  }

  /** The dotted line back to the centre, and the drop marker (§4.4 state C). */
  #marker(x: number, y: number, L: ReturnType<typeof layout>): void {
    const ctx = this.#ctx;
    ctx.strokeStyle = COLOR.ink;
    ctx.globalAlpha = 0.55;
    ctx.setLineDash([2, 6]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(L.targetX, L.plateauY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    ctx.fillStyle = COLOR.coral;
    ctx.beginPath();
    ctx.moveTo(x, y - L.pipR * 1.5);
    ctx.lineTo(x - 5, y - L.pipR * 1.5 - 8);
    ctx.lineTo(x + 5, y - L.pipR * 1.5 - 8);
    ctx.closePath();
    ctx.fill();
  }
}

/** Beyond a couple of mat widths the card only needs to say "well past it". */
const clampDx = (signedDx: number): number => {
  const scaled = signedDx / 60;
  return Math.max(-2.6, Math.min(2.6, scaled));
};
