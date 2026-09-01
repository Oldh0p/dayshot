import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

import { powerForHold, simulateLevel } from '../../shared/sim.ts';
import {
  MISFIRE_MS,
  SLOWMO_TRIGGER_DX,
} from '../../shared/tunables.ts';
import type { Level, Point, ShotResult } from '../../shared/types.ts';
import { audio } from '../audio.ts';
import {
  PERFECT_FLASH_MS,
  PERFECT_FREEZE_MS,
  RELEASE_FREEZE_MS,
  RELEASE_SHAKE_MS,
  RELEASE_SHAKE_PX,
  SLOWMO_MS,
  SLOWMO_SCALE,
  clamp01,
  prefersReducedMotion,
  shakeAmplitude,
  slowMotionScale,
} from '../motion.ts';
import type { Palette } from '../theme.ts';
import { apexOf, buildCamera, flightZoom, PANEL_SHARE } from './camera.ts';
import { ATMOSPHERE } from '../theme.ts';
import type { ModifierId } from '../../shared/types.ts';
import { PARTICLES } from '../ui/tokens.ts';
import {
  ParticleField,
  makeWindStreaks,
  updateWindStreaks,
  type WindStreak,
} from './particles.ts';
import { SLOWMO_FROM, drawScene, shouldSlowMotion } from './render.ts';

/**
 * The animation loop.
 *
 * Everything inside the scene lives here and nothing of it goes through React
 * state: a re-render per frame would cost the 60 fps that GDD 9.11.10 asks for
 * on a mid-range 2022 phone. React owns the panels around the canvas and is
 * told only when a phase changes.
 *
 * The gauge is driven by `performance.now()` rather than by a frame counter, so
 * it oscillates at exactly the same speed on a 120 Hz iPhone and a stuttering
 * Android from 2019 (GDD 6).
 */

export type SceneOptions = {
  readonly level: Level | null;
  readonly palette: Palette;
  readonly practice: boolean;
  /** Whether the player may currently charge a shot. */
  readonly canAim: boolean;
  /** True only for the very first press of the official shot. */
  readonly guardMisfire: boolean;
  /** The shot to play back, or null while aiming. */
  readonly shot: ShotResult | null;
  readonly ghost: readonly Point[] | null;
  readonly onAimStart: () => void;
  readonly onMisfire: () => void;
  readonly onFire: (shot: ShotResult, holdMs: number) => void;
  readonly onImpact: (shot: ShotResult) => void;
};

type Runtime = {
  time: number;
  holdStart: number | null;
  power: number | null;
  /** Seconds of flight played back so far. */
  flightElapsed: number;
  playing: ShotResult | null;
  freezeLeft: number;
  shakeLeft: number;
  slowMoLeft: number;
  flash: number;
  impactFired: boolean;
  windStreaks: WindStreak[];
  particles: ParticleField;
};

/**
 * How many ambient streaks this day gets.
 *
 * §13 caps mobile at 40 ambient and doubles it on desktop; §11 says how much of
 * that budget each atmosphere wants. A day with no modifier yet — the moment
 * before the first state response — gets the calm default rather than nothing,
 * so the scene is never empty while it waits.
 */
/** §5: the world dims 12% under the thumb, 20% as the ball comes down. */
const HOLD_VIGNETTE = 0.12;
const SLOWMO_VIGNETTE = 0.2;

/** §5: particles run at 0.6x while charging. */
const HOLD_AIR_SCALE = 0.6;

const ambientBudget = (modifier: ModifierId | null): number => {
  const wide = typeof window !== 'undefined' && window.innerWidth >= 900;
  const ceiling = PARTICLES.mobileAmbient * (wide ? PARTICLES.desktopFactor : 1);
  const density = modifier ? ATMOSPHERE[modifier].density : 0.6;
  return Math.max(4, Math.round(ceiling * density));
};

export const useScene = (options: SceneOptions): {
  canvasRef: (node: HTMLCanvasElement | null) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
} => {
  /**
   * A callback ref rather than a `useRef`: the canvas only mounts once the day
   * has loaded, so an effect keyed on an object ref would run against `null`
   * and never start the loop.
   */
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  // The loop reads its options through a ref so that a change of callback does
  // not tear down and rebuild the animation frame. Writing a ref during render
  // is not allowed, so the sync happens after commit; the loop is at most one
  // frame behind, which nothing here is sensitive to.
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const runtime = useRef<Runtime>({
    time: 0,
    holdStart: null,
    power: null,
    flightElapsed: 0,
    playing: null,
    freezeLeft: 0,
    shakeLeft: 0,
    slowMoLeft: 0,
    flash: 0,
    impactFired: false,
    windStreaks: makeWindStreaks(ambientBudget(null)),
    particles: new ParticleField(),
  });

  /*
   * The air is re-seeded when the day's modifier changes, not once at boot.
   *
   * It used to be a flat 26 streaks on every day, which flattens §11: Tiny
   * Target is meant to be nearly still air under a spotlight and Gusty is meant
   * to be busy, and both looked the same. The absolute ceiling is §13's, the
   * fraction is the atmosphere's.
   */
  const modifier = options.level?.modifier ?? null;
  useEffect(() => {
    runtime.current.windStreaks = makeWindStreaks(ambientBudget(modifier));
  }, [modifier]);

  // A new shot resets the playback clock and opens the release sequence.
  const shotId = options.shot;
  useEffect(() => {
    const state = runtime.current;
    if (!shotId) {
      state.playing = null;
      state.flightElapsed = 0;
      state.impactFired = false;
      state.particles.clear();
      return;
    }
    state.playing = shotId;
    state.flightElapsed = 0;
    state.impactFired = false;
    state.freezeLeft = prefersReducedMotion() ? 0 : RELEASE_FREEZE_MS / 1000;
    state.shakeLeft = prefersReducedMotion() ? 0 : RELEASE_SHAKE_MS / 1000;
    state.slowMoLeft = 0;
    state.flash = 0;
    audio.play('release');
    audio.startFlight();
  }, [shotId]);

  useEffect(() => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let frame = 0;
    let last = performance.now();

    const render = (now: number): void => {
      frame = requestAnimationFrame(render);

      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      const state = runtime.current;
      const opts = optionsRef.current;
      state.time += dt;

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = Math.max(1, Math.round(width * dpr));
        canvas.height = Math.max(1, Math.round(height * dpr));
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const level = opts.level;
      if (!level) {
        ctx.clearRect(0, 0, width, height);
        return;
      }

      // -- Gauge, in real time -------------------------------------------
      if (state.holdStart !== null) {
        const holdMs = now - state.holdStart;
        state.power = powerForHold(holdMs);
        audio.updateHold(state.power);
      }

      // -- Flight playback -----------------------------------------------
      let flightProgress = 0;
      const playing = state.playing;

      if (playing) {
        if (state.freezeLeft > 0) {
          // The micro-freeze between release and launch. Without it the shot
          // leaves without ever having been held.
          state.freezeLeft -= dt;
        } else {
          const duration = Math.max(0.2, playing.flightMs / 1000);
          const progressNow = clamp01(state.flightElapsed / duration);

          // Slow motion only when the ball is genuinely about to be close, and
          // only once. That is what keeps it a heartbeat and not a gimmick.
          if (
            state.slowMoLeft <= 0 &&
            progressNow >= SLOWMO_FROM &&
            progressNow < 1 &&
            shouldSlowMotion(playing, SLOWMO_TRIGGER_DX) &&
            !prefersReducedMotion()
          ) {
            state.slowMoLeft = SLOWMO_MS / 1000;
            audio.play('slowmo');
          }

          const scale =
            state.slowMoLeft > 0 ? slowMotionScale(SLOWMO_SCALE) : 1;
          if (state.slowMoLeft > 0) state.slowMoLeft -= dt;

          state.flightElapsed += dt * scale;
          flightProgress = clamp01(state.flightElapsed / duration);

          const speed =
            (Math.abs(playing.impactX - 120) / Math.max(0.2, duration)) *
            (1 - flightProgress * 0.3);
          audio.updateFlight(speed);

          if (flightProgress >= 1 && !state.impactFired) {
            state.impactFired = true;
            audio.stopFlight();
            handleImpact(state, playing, opts);
            opts.onImpact(playing);
          }
        }
      }

      if (state.shakeLeft > 0) state.shakeLeft -= dt;
      if (state.flash > 0) state.flash = Math.max(0, state.flash - dt * 6);

      state.particles.update(dt);
      /*
       * The air slows while the thumb is down (§5). Not stopped: a frozen sky
       * reads as a bug, and the wind is still the thing the player is trying to
       * account for. Six tenths is enough to feel the world hold its breath.
       */
      const airScale = state.holdStart !== null ? HOLD_AIR_SCALE : 1;
      updateWindStreaks(state.windStreaks, level.windBase, dt * airScale);

      // -- Camera ---------------------------------------------------------
      const apex = playing ? apexOf(playing.trajectory) : 700;
      const zoom = playing ? flightZoom(flightProgress) : 1;
      // The panel only owns the bottom of the frame while the player is
      // aiming; once the ball is away it is the scene's again.
      const inset = opts.canAim ? height * PANEL_SHARE : 0;
      const camera = buildCamera(width, height, apex, zoom, inset);

      const shakeMagnitude =
        state.shakeLeft > 0
          ? shakeAmplitude(RELEASE_SHAKE_PX) *
            (state.shakeLeft / (RELEASE_SHAKE_MS / 1000))
          : 0;

      drawScene(ctx, {
        level,
        palette: opts.palette,
        camera,
        time: state.time,
        power: state.holdStart !== null ? state.power : null,
        shot: playing,
        flightProgress,
        ghost: opts.ghost,
        showImpactMarker: state.impactFired,
        practice: opts.practice,
        windStreaks: state.windStreaks,
        particles: state.particles,
        flash: state.flash,
        shakeX: (Math.random() - 0.5) * 2 * shakeMagnitude,
        shakeY: (Math.random() - 0.5) * 2 * shakeMagnitude,
        vignette:
          state.slowMoLeft > 0
            ? SLOWMO_VIGNETTE
            : state.holdStart !== null
              ? HOLD_VIGNETTE
              : 0,
      });
    };

    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [canvas]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>): void => {
      const opts = optionsRef.current;
      if (!opts.canAim || !opts.level) return;
      event.preventDefault();

      // Audio can only be created inside a real gesture.
      audio.ensure();
      audio.startAmbience();

      runtime.current.holdStart = performance.now();
      runtime.current.power = 0;
      audio.startHold();
      opts.onAimStart();
    },
    []
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>): void => {
      const opts = optionsRef.current;
      const state = runtime.current;
      if (state.holdStart === null || !opts.level) return;
      event.preventDefault();

      const holdMs = Math.round(performance.now() - state.holdStart);
      state.holdStart = null;
      state.power = null;
      audio.stopHold();

      // A pocket, a scroll, a notification: the first flick must never be able
      // to spend the day's only shot (GDD M1). It is armed exactly once, so it
      // cannot be used to sample the gauge for free.
      if (opts.guardMisfire && holdMs < MISFIRE_MS) {
        audio.play('ui');
        opts.onMisfire();
        return;
      }

      opts.onFire(simulateLevel(opts.level, holdMs), holdMs);
    },
    []
  );

  return { canvasRef: setCanvas, onPointerDown, onPointerUp };
};

const handleImpact = (
  state: Runtime,
  shot: ShotResult,
  opts: SceneOptions
): void => {
  const speed = Math.abs(shot.impactX) / Math.max(0.2, shot.flightMs / 1000);

  if (shot.impact === 'CLIFF') {
    audio.play('impact-ground');
    state.particles.poof(shot.impactX, shot.impactY, speed, opts.palette.air);
  } else if (shot.impact === 'MAT') {
    audio.play('impact-mat');
    state.particles.poof(shot.impactX, shot.impactY, speed, opts.palette.accent);
  } else if (shot.impact === 'OFF_THE_MAP') {
    audio.play('near-miss');
  } else {
    audio.play('impact-ground');
    state.particles.poof(shot.impactX, shot.impactY, speed, opts.palette.air);
  }

  // A whiff for the near miss: the grimace you can hear (GDD 27).
  if (!shot.isBullseye && shot.dx > 60 && shot.dx <= 90) {
    audio.play('near-miss');
  }

  if (shot.isPerfect) {
    state.flash = prefersReducedMotion() ? 0 : 1;
    state.freezeLeft = prefersReducedMotion()
      ? 0
      : (PERFECT_FREEZE_MS + PERFECT_FLASH_MS) / 1000;
    state.particles.confetti(shot.impactX, shot.impactY);
    audio.play('perfect');
  } else if (shot.isBullseye) {
    audio.play('bullseye');
  }
};
