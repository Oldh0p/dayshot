/**
 * How the feed card behaves on the surface Reddit actually judges it on.
 *
 *   node tools/qa/inline-perf.mjs [--throttle=4]
 *
 * Devvit's inline requirements open with performance — "Load initial content in
 * under 1 second", "Lighthouse score >80", measured on the *inline post* — and
 * `perf.mjs` never went near it: it navigates to `/`, which the harness maps to
 * `game.html`. The card's cost had never been measured at all.
 *
 * It matters beyond the checklist. A card that janks while it scrolls into view
 * feels exactly like the thing this app was rejected for twice: the feed
 * stops moving under the cursor.
 */
import { withBrowser, BASE, wait } from './cdp.mjs';

/* Runs on import: spawns a harness and drives Chrome. See capture.mjs. */
if (!import.meta.main) {
  throw new Error(
    `${import.meta.filename} is a script, not a module. Run it with node instead.`
  );
}

const arg = (name, fallback) => {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? Number(found.slice(name.length + 3)) : fallback;
};
const throttle = arg('throttle', 4);

/* Times the real frame, not this callback: see the note in perf.mjs. */
const RECORDER = `(() => {
  window.__f = [];
  const raf = window.requestAnimationFrame.bind(window);
  let last = performance.now();
  const tick = (t) => { window.__f.push(t - last); last = t; raf(tick); };
  raf(tick);
  return 'recording';
})()`;

const report = await withBrowser(async (cdp) => {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 512,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  await fetch(`${BASE}/api/reset?played=0`);

  const started = Date.now();
  await cdp.send('Page.navigate', { url: `${BASE}/splash.html` });

  // "Load initial content": the CTA is the thing a scroller must see.
  let ready = null;
  for (let i = 0; i < 120 && ready === null; i++) {
    await wait(50);
    const seen = await cdp.eval(
      "document.body && document.body.innerText.trim().length > 0 ? 1 : 0"
    );
    if (seen) ready = Date.now() - started;
  }

  await cdp.eval(RECORDER);
  await wait(3000);
  const frames = await cdp.eval('window.__f.splice(0, window.__f.length)');

  const bytes = await cdp.eval(`(() => {
    const n = performance.getEntriesByType('resource')
      .reduce((sum, r) => sum + (r.encodedBodySize || 0), 0);
    const doc = performance.getEntriesByType('navigation')[0];
    return n + (doc ? doc.encodedBodySize : 0);
  })()`);

  return { ready, frames, bytes };
});

const f = report.frames.filter((x) => x > 0).sort((a, b) => a - b);
const at = (q) => (f.length ? f[Math.floor(f.length * q)] : 0);
const dropped = f.filter((x) => x > 20).length;

console.log(`\nFeed card — 390x512, CPU throttle ${throttle}x\n`);
console.log(`  content visible   ${report.ready}ms       (requirement: under 1000ms)`);
console.log(`  transferred       ${(report.bytes / 1024).toFixed(1)} KB`);
console.log(`  frames measured   ${f.length}`);
console.log(`  median frame      ${at(0.5).toFixed(1)}ms`);
console.log(`  p95 frame         ${at(0.95).toFixed(1)}ms`);
console.log(`  over 20ms         ${dropped}  (${((dropped / (f.length || 1)) * 100).toFixed(1)}%)\n`);

const slow = report.ready === null || report.ready > 1000;
if (slow) console.log('  SLOW: initial content did not arrive within a second.\n');
if (f.length === 0) {
  console.log('  NOTHING MEASURED — rAF never ran; the numbers above mean nothing.\n');
  process.exit(2);
}
process.exit(slow ? 1 : 0);
