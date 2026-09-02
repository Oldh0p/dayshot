import { soundEnabled, setSoundEnabled } from './storage.ts';

/**
 * The sound design of GDD 27, synthesised rather than sampled.
 *
 * Twelve cues, no asset bytes, and no music: the game lives in a feed, and a
 * loop would wear out in three days. The instrument of the game is the wind,
 * and the only cue that carries real information is the hold — its pitch tracks
 * the gauge, so the shot is playable with your eyes closed.
 *
 * Everything is created lazily on the first gesture, which is what mobile
 * autoplay policies require anyway.
 */

const MASTER_GAIN = 0.5;

type Cue =
  | 'ambience'
  | 'hold'
  | 'release'
  | 'flight'
  | 'slowmo'
  | 'impact-ground'
  | 'impact-mat'
  | 'near-miss'
  | 'bullseye'
  | 'perfect'
  | 'streak'
  | 'ui';

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private holdOsc: OscillatorNode | null = null;
  private holdGain: GainNode | null = null;
  private flightOsc: OscillatorNode | null = null;
  private flightGain: GainNode | null = null;
  private ambienceGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private enabled = soundEnabled();
  private hidden = false;

  isEnabled(): boolean {
    return this.enabled;
  }

  /** Muted for either reason: the player said so, or nobody is looking. */
  private get silent(): boolean {
    return !this.enabled || this.hidden;
  }

  /**
   * Reddit's third audio requirement, verbatim: "Use the visibilityChange
   * handler to mute any sounds if a user scrolls away."
   *
   * Suspending the context rather than only ducking the gain matters, because
   * a suspended context's clock stops: cues scheduled against `currentTime`
   * while hidden would otherwise all come due at once on return.
   */
  setHidden(hidden: boolean): void {
    if (this.hidden === hidden) return;
    this.hidden = hidden;
    if (!this.ctx || !this.master) return;
    if (hidden) {
      this.stopHold();
      this.stopFlight();
      this.master.gain.setTargetAtTime(0, this.now, 0.04);
      void this.ctx.suspend();
    } else {
      void this.ctx.resume();
      this.master.gain.setTargetAtTime(MASTER_GAIN, this.now, 0.1);
    }
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    setSoundEnabled(on);
    if (!on) {
      this.stopHold();
      this.stopFlight();
      if (this.ambienceGain && this.ctx) {
        this.ambienceGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      }
    } else {
      this.ensure();
      this.startAmbience();
    }
  }

  /** Must be called from inside a real user gesture. */
  ensure(): void {
    if (!this.enabled) return;
    if (this.ctx) {
      /*
       * A context that already exists is not necessarily running. A webview
       * that was backgrounded comes back suspended, iOS suspends aggressively,
       * and this used to return here and leave the game silent for the rest of
       * the session with no way back. Resuming an already-running context is
       * free, so it is never worth checking whether it is needed.
       */
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;

    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = MASTER_GAIN;
    this.master.connect(this.ctx.destination);

    const length = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buffer;
  }

  private get now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  private tone(
    frequency: number,
    duration: number,
    type: OscillatorType,
    peak: number,
    slideTo?: number
  ): void {
    if (this.silent || !this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, this.now);
    if (slideTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(20, slideTo),
        this.now + duration
      );
    }
    gain.gain.setValueAtTime(0.0001, this.now);
    gain.gain.exponentialRampToValueAtTime(peak, this.now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.now + duration);
    osc.connect(gain).connect(this.master);
    osc.start();
    osc.stop(this.now + duration + 0.05);
  }

  private noise(duration: number, peak: number, cutoff: number): void {
    if (this.silent || !this.ctx || !this.master || !this.noiseBuffer) return;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(peak, this.now);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.now + duration);
    source.connect(filter).connect(gain).connect(this.master);
    source.start();
    source.stop(this.now + duration + 0.05);
  }

  /** "The world was waiting for you": a very low pad plus a breath of wind. */
  startAmbience(): void {
    if (this.silent || !this.ctx || !this.master || this.ambienceGain) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 55;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(0.05, this.now, 1.5);
    osc.connect(gain).connect(this.master);
    osc.start();
    this.ambienceGain = gain;
  }

  /**
   * The hold tone glides with the gauge. This is the one cue that *is*
   * information rather than decoration (GDD 27).
   */
  startHold(): void {
    if (this.silent || !this.ctx || !this.master || this.holdOsc) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 180;
    gain.gain.setValueAtTime(0.0001, this.now);
    gain.gain.exponentialRampToValueAtTime(0.16, this.now + 0.05);
    osc.connect(gain).connect(this.master);
    osc.start();
    this.holdOsc = osc;
    this.holdGain = gain;
  }

  updateHold(power: number): void {
    if (!this.holdOsc || !this.ctx) return;
    this.holdOsc.frequency.setTargetAtTime(
      180 + power * 460,
      this.now,
      0.02
    );
  }

  stopHold(): void {
    if (!this.holdOsc || !this.holdGain || !this.ctx) return;
    this.holdGain.gain.setTargetAtTime(0.0001, this.now, 0.03);
    this.holdOsc.stop(this.now + 0.2);
    this.holdOsc = null;
    this.holdGain = null;
  }

  startFlight(): void {
    if (this.silent || !this.ctx || !this.master || this.flightOsc) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 700;
    gain.gain.value = 0.05;
    osc.connect(gain).connect(this.master);
    osc.start();
    this.flightOsc = osc;
    this.flightGain = gain;
  }

  updateFlight(speed: number): void {
    if (!this.flightOsc || !this.ctx) return;
    this.flightOsc.frequency.setTargetAtTime(
      420 + Math.min(1, speed / 1600) * 700,
      this.now,
      0.05
    );
  }

  stopFlight(): void {
    if (!this.flightOsc || !this.flightGain || !this.ctx) return;
    this.flightGain.gain.setTargetAtTime(0.0001, this.now, 0.05);
    this.flightOsc.stop(this.now + 0.3);
    this.flightOsc = null;
    this.flightGain = null;
  }

  play(cue: Cue): void {
    if (this.silent) return;
    this.ensure();

    switch (cue) {
      case 'release':
        // A round, dry pop. The moment has to land like a punch.
        this.tone(420, 0.16, 'sine', 0.32, 120);
        this.noise(0.06, 0.18, 900);
        break;
      case 'slowmo':
        // Filtered heartbeat: everything else steps back for a quarter second.
        this.tone(60, 0.28, 'sine', 0.3);
        this.tone(52, 0.3, 'sine', 0.22);
        break;
      case 'impact-ground':
        this.tone(90, 0.22, 'sine', 0.3, 55);
        this.noise(0.2, 0.16, 500);
        break;
      case 'impact-mat':
        // Thud plus the tok of a taut mat: you can hear that you hit it.
        this.tone(120, 0.18, 'sine', 0.3, 70);
        this.tone(640, 0.1, 'triangle', 0.14);
        this.noise(0.12, 0.1, 1400);
        break;
      case 'near-miss':
        // The audible grimace.
        this.tone(520, 0.22, 'sine', 0.16, 300);
        break;
      case 'bullseye':
        [660, 880, 1180].forEach((frequency, index) => {
          window.setTimeout(() => this.tone(frequency, 0.22, 'triangle', 0.2), index * 90);
        });
        break;
      case 'perfect':
        // The only fanfare in the game. Its rarity is the reward.
        [523, 659, 784, 1046, 1318].forEach((frequency, index) => {
          window.setTimeout(
            () => this.tone(frequency, 0.5, 'triangle', 0.24),
            index * 70
          );
        });
        window.setTimeout(() => this.noise(0.7, 0.1, 5000), 120);
        break;
      case 'streak':
        this.noise(0.18, 0.12, 2600);
        this.tone(880, 0.12, 'sine', 0.16);
        break;
      case 'ui':
        this.tone(1200, 0.05, 'sine', 0.07);
        break;
      default:
        break;
    }
  }
}

export const audio = new AudioEngine();

/**
 * Arms the engine on the player's first qualifying gesture, wherever it lands.
 *
 * The scene's own handlers call `ensure()`, but they sit behind `canAim`, so a
 * player who opens the game to a result they already took -- every visit after
 * the one where they played -- never reached one. This listens at the document,
 * in the capture phase, and takes itself off after the first hit.
 *
 * The event list is deliberate. `pointerdown` is absent because it does not
 * grant user activation for touch, and `scroll`, `wheel` and `focus` never do;
 * these five are the ones a browser accepts as "the user did something".
 */
const UNLOCK_EVENTS = ['pointerup', 'touchend', 'mousedown', 'keydown', 'click'];

export const unlockAudioOnFirstGesture = (): (() => void) => {
  const stop = (): void => {
    for (const type of UNLOCK_EVENTS) {
      document.removeEventListener(type, unlock, true);
    }
  };
  /*
   * Synchronous on purpose: WebKit only honours the gesture for five seconds
   * and an `await` before `resume()` can land outside that window.
   */
  const unlock = (): void => {
    audio.ensure();
    audio.startAmbience();
    stop();
  };
  for (const type of UNLOCK_EVENTS) {
    document.addEventListener(type, unlock, true);
  }
  return stop;
};
