/**
 * Where the frame actually goes.
 *
 *   node tools/qa/profile.mjs           # aiming
 *   node tools/qa/profile.mjs --flight
 *
 * Written after two rounds of optimising by inspection produced a 3-frame
 * improvement: the trail *looked* like the expensive part (forty stroke calls a
 * frame) and batching it into five bands barely moved the number. A CPU profile
 * names the function instead of nominating one.
 */
import { withBrowser, BASE, wait } from './cdp.mjs';

const flight = process.argv.includes('--flight');

const profile = await withBrowser(async (cdp) => {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 720,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await fetch(`${BASE}/api/reset?played=0`);
  await cdp.send('Page.navigate', { url: `${BASE}/` });
  await wait(2500);

  if (flight) {
    await cdp.eval(`(() => {
      const el = document.querySelector('#root > div');
      const mk = (t) => new PointerEvent(t, {
        bubbles: true, cancelable: true, pointerId: 1,
        pointerType: 'touch', clientX: 195, clientY: 400, isPrimary: true,
      });
      el.dispatchEvent(mk('pointerdown'));
      setTimeout(() => el.dispatchEvent(mk('pointerup')), 400);
      return 'fired';
    })()`);
    await wait(500);
  }

  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.start');
  await wait(2500);
  const { profile } = await cdp.send('Profiler.stop');
  return profile;
});

/** Self time per node, summed by function, in microseconds. */
const byFunction = new Map();
const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
const tickCount = new Map();
for (const id of profile.samples ?? []) {
  tickCount.set(id, (tickCount.get(id) ?? 0) + 1);
}
const totalSamples = (profile.samples ?? []).length || 1;
const spanMs = (profile.endTime - profile.startTime) / 1000;

for (const [id, count] of tickCount) {
  const node = nodes.get(id);
  if (!node) continue;
  const frame = node.callFrame;
  const name = frame.functionName || '(anonymous)';
  const file = (frame.url || '').split('/').pop() || '';
  const key = file ? `${name}  ${file}:${frame.lineNumber + 1}` : name;
  byFunction.set(key, (byFunction.get(key) ?? 0) + count);
}

const ranked = [...byFunction.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18);

console.log(`\nCPU profile — ${flight ? 'flight' : 'aiming'}, 4x throttle, ${spanMs.toFixed(0)}ms\n`);
for (const [name, count] of ranked) {
  const share = (count / totalSamples) * 100;
  const bar = '#'.repeat(Math.max(0, Math.round(share / 2)));
  console.log(`  ${share.toFixed(1).padStart(5)}%  ${bar.padEnd(26)} ${name}`);
}
console.log('');
