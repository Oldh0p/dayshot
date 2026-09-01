import { allowParticles } from '../motion.ts';
import { COLOR } from '../ui/tokens.ts';

/**
 * Particles, kept to a budget a five-year-old phone can hold at 60 fps.
 *
 * Three uses only: the wind that makes the day's conditions visible, the poof
 * of dust at impact, and the confetti of a Perfect. `prefers-reduced-motion`
 * silences all three (GDD 31).
 */

export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  gravity: number;
};

const MAX_PARTICLES = 140;

export class ParticleField {
  private readonly particles: Particle[] = [];

  get count(): number {
    return this.particles.length;
  }

  clear(): void {
    this.particles.length = 0;
  }

  private spawn(particle: Particle): void {
    if (this.particles.length >= MAX_PARTICLES) return;
    this.particles.push(particle);
  }

  /**
   * Dust at the landing point, sized by how hard the ball arrived.
   */
  poof(x: number, y: number, speed: number, color: string): void {
    if (!allowParticles()) return;
    const count = Math.min(18, 6 + Math.round(speed / 120));
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI * (0.15 + Math.random() * 0.7);
      const force = 40 + Math.random() * (60 + speed * 0.08);
      this.spawn({
        x,
        y,
        vx: Math.cos(angle) * force * (Math.random() < 0.5 ? -1 : 1),
        vy: Math.sin(angle) * force,
        life: 0,
        maxLife: 0.45 + Math.random() * 0.35,
        size: 2 + Math.random() * 3,
        color,
        gravity: 220,
      });
    }
  }

  /**
   * The Perfect celebration, and the only place confetti is allowed to exist.
   * Its rarity is the reward (GDD 9).
   */
  confetti(x: number, y: number): void {
    if (!allowParticles()) return;
    /*
     * §9 makes the Perfect celebration gold particles and a shockwave; phase 7
     * rewrites it. Tokenised here rather than restyled, so this phase changes
     * no pixels: the fourth colour is Crosswind's accent, which is a theme
     * value and has no token by design (§13 stops at nine colours).
     */
    const CROSSWIND_ACCENT = '#5FC9E8';
    const colors = [COLOR.gold, COLOR.coral, COLOR.ink, CROSSWIND_ACCENT];
    for (let i = 0; i < 60; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const force = 180 + Math.random() * 260;
      this.spawn({
        x,
        y,
        vx: Math.cos(angle) * force,
        vy: Math.sin(angle) * force,
        life: 0,
        maxLife: 1.1 + Math.random() * 0.8,
        size: 3 + Math.random() * 4,
        color: colors[i % colors.length] ?? COLOR.gold,
        gravity: 380,
      });
    }
  }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      if (!p) continue;
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  draw(
    ctx: CanvasRenderingContext2D,
    project: (x: number, y: number) => readonly [number, number],
    scale: number
  ): void {
    for (const p of this.particles) {
      const fade = 1 - p.life / p.maxLife;
      const [sx, sy] = project(p.x, p.y);
      ctx.globalAlpha = fade;
      ctx.fillStyle = p.color;
      ctx.fillRect(
        sx - p.size * scale * 0.5,
        sy - p.size * scale * 0.5,
        Math.max(1, p.size * scale),
        Math.max(1, p.size * scale)
      );
    }
    ctx.globalAlpha = 1;
  }
}

/**
 * Wind streaks. Always drawn, always in the direction the wind actually blows,
 * because an unfair day has to be legible on screen (GDD 33) and the wind must
 * never be communicated by colour alone (GDD 49).
 */
export type WindStreak = { x: number; y: number; length: number; speed: number };

export const makeWindStreaks = (count: number): WindStreak[] =>
  Array.from({ length: count }, () => ({
    x: Math.random() * 1000,
    y: 60 + Math.random() * 700,
    length: 20 + Math.random() * 70,
    speed: 0.4 + Math.random() * 0.9,
  }));

export const updateWindStreaks = (
  streaks: WindStreak[],
  windBase: number,
  dt: number
): void => {
  const drift = windBase * 0.42;
  for (const streak of streaks) {
    streak.x += drift * streak.speed * dt;
    if (streak.x < -120) streak.x = 1120;
    if (streak.x > 1120) streak.x = -120;
  }
};
