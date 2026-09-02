/**
 * Frame-time budget, measured (§13, phase 3 and phase 9 gates).
 *
 *   node tools/qa/perf.mjs
 *   node tools/qa/perf.mjs --throttle=4     # "slow mobile"
 *   node tools/qa/perf.mjs --seconds=6
 *
 * The point is to find out where the frame goes *before* rewriting the renderer
 * around a guess. Layer caching is the obvious optimisation and may well be the
 * wrong one: a sky gradient and three rectangles are cheap, and the particles,
 * the trail and the gauge arc are not. So: measure, then cut.
 *
 * Also answers a question left open in phase 0 — whether `requestAnimationFrame`
 * runs under headless Chrome. It is paused when the *preview pane* is hidden,
 * which is why hold and flight could not be captured interactively; headless is
 * a different animal and the check below says so out loud.
 */
import { withBrowser, BASE, wait } from './cdp.mjs';

const arg = (name, fallback) => {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? Number(found.slice(name.length + 3)) : fallback;
};

const throttle = arg('throttle', 1);
const seconds = arg('seconds', 5);

/**
 * Two different numbers, and the phase 9 gate wants the second one.
 *
 * `__frames` is the interval between frames, which is capped by the display:
 * a median of 16.7ms means 60fps and says nothing about cost. `__work` is the
 * time the page actually spends inside its own rAF callback -- the drawing --
 * which is what "median frame time under 10ms" has to mean, since 10ms is
 * below the interval a 60Hz screen can even produce.
 *
 * Measured by wrapping `requestAnimationFrame` before the app installs its
 * loop, so every callback the scene schedules is timed without touching the
 * scene's code.
 */
const RECORDER = `
  window.__frames = [];
  window.__work = [];
  window.__recording = true;

  if (!window.__wrapped) {
    window.__wrapped = true;
    const raf = window.requestAnimationFrame.bind(window);
    // Kept, so the recorder below can schedule itself without being timed.
    window.__rawRaf = raf;
    window.requestAnimationFrame = (cb) =>
      raf((t) => {
        const started = performance.now();
        cb(t);
        if (window.__recording) window.__work.push(performance.now() - started);
      });
  }

  /*
   * The recorder schedules itself through the *unwrapped* rAF.
   *
   * Timed through the wrapper it added a callback per frame that does almost
   * nothing, which halved the reported median: the number stopped describing
   * the game's drawing and started describing the average of the drawing and an
   * empty function.
   */
  (function record(last) {
    window.__rawRaf((now) => {
      if (!window.__recording) return;
      if (last !== undefined) window.__frames.push(now - last);
      record(now);
    });
  })();
  'recording'
`;

const percentile = (sorted, p) =>
  sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];

/* Runs on import: spawns a harness and drives Chrome. See capture.mjs. */
if (!import.meta.main) {
  throw new Error(
    `${import.meta.filename} is a script, not a module. Run it with node instead.`
  );
}

const report = await withBrowser(async (cdp) => {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 720,
    deviceScaleFactor: 2,
    mobile: true,
  });
  if (throttle > 1) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  }

  await fetch(`${BASE}/api/reset?played=0`);
  await cdp.send('Page.navigate', { url: `${BASE}/` });
  await wait(2500);

  await cdp.eval(RECORDER);
  await wait(1200);

  // Does rAF run at all here? If not, every number below is meaningless.
  const early = await cdp.eval('window.__frames.length');

  // Aiming: the longest-lived screen, and the one a player stares at.
  await wait(seconds * 500);
  const aiming = await cdp.eval(
    'window.__frames.splice(0, window.__frames.length)'
  );
  const aimingWork = await cdp.eval('window.__work.splice(0, window.__work.length)');

  // Flight: the camera moves every frame, so nothing static can be cached.
  await cdp.eval(`(() => {
    const el = document.querySelector('#root > div');
    const mk = (t) => new PointerEvent(t, {
      bubbles: true, cancelable: true, pointerId: 1,
      pointerType: 'touch', clientX: 195, clientY: 400, isPrimary: true,
    });
    el.dispatchEvent(mk('pointerdown'));
    setTimeout(() => el.dispatchEvent(mk('pointerup')), 500);
    return 'fired';
  })()`);
  await wait(seconds * 500 + 500);
  const flight = await cdp.eval(
    'window.__frames.splice(0, window.__frames.length)'
  );
  const flightWork = await cdp.eval('window.__work.splice(0, window.__work.length)');

  await cdp.eval('window.__recording = false');
  const text = await cdp.eval('document.body.innerText.replace(/\\n+/g, " | ")');

  return { early, aiming, flight, aimingWork, flightWork, text };
});

if (report.early === 0) {
  console.error('\nrequestAnimationFrame produced no frames. Nothing was measured.');
  process.exit(1);
}

const show = (label, frames) => {
  const sorted = [...frames].sort((a, b) => a - b);
  const median = percentile(sorted, 0.5);
  const p95 = percentile(sorted, 0.95);
  const dropped = frames.filter((f) => f > 20).length;
  console.log(
    `  ${label.padEnd(9)} ${String(frames.length).padStart(4)} frames` +
      `   median ${median.toFixed(2)}ms` +
      `   p95 ${p95.toFixed(2)}ms` +
      `   over 20ms: ${dropped}` +
      `   ~${(1000 / Math.max(median, 0.01)).toFixed(0)}fps`
  );
};

console.log(`\nFrame time — 390x720, CPU throttle ${throttle}x\n`);
show('aiming', report.aiming);
show('flight', report.flight);

/**
 * The gate's number. `show` above reports the interval between frames, which a
 * 60Hz display caps at 16.7ms whatever the page costs; this reports the time
 * the page spends inside its own callback, which is the thing a budget of
 * "under 10ms" can be about.
 */
const showWork = (label, work) => {
  const sorted = [...work].sort((a, b) => a - b);
  const median = percentile(sorted, 0.5);
  console.log(
    `  ${label.padEnd(9)} ${String(work.length).padStart(4)} callbacks` +
      `   median ${median.toFixed(2)}ms` +
      `   p95 ${percentile(sorted, 0.95).toFixed(2)}ms` +
      `   worst ${(sorted[sorted.length - 1] ?? 0).toFixed(2)}ms` +
      `   ${median < 10 ? 'under budget' : 'OVER 10ms BUDGET'}`
  );
};

console.log('');
console.log('Work per frame — what the page spends drawing');
console.log('');
showWork('aiming', report.aimingWork);
showWork('flight', report.flightWork);
console.log(`\n  reached: ${report.text.slice(0, 110)}`);
console.log(
  '\n  Note: rAF caps at the display rate, so a median near 16.7ms is the' +
    '\n  ceiling, not the cost. `over 20ms` is the number that matters.\n'
);
