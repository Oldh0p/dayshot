/**
 * Does the feed still scroll when the cursor is over the post?
 *
 *   node tools/qa/scroll-chain.mjs
 *
 * This is the measurement that was missing when DAYSHOT was rejected for an
 * in-line scroll trap a *second* time. The first rejection was the panel itself
 * scrolling, and that was fixed and guarded. The second report was different:
 *
 *   > Once I scroll into the game post, my mouse gets stuck.
 *
 * Nothing scrolls inside the card — and that is exactly the problem. A wheel
 * over a document that cannot scroll normally *chains* to the parent, which is
 * how the feed keeps moving. `overscroll-behavior: none` switches that off.
 * Every capture in `docs/qa/` shows the card alone in a viewport, where the
 * behaviour is invisible; it only exists inside a scrolling parent.
 *
 * So the rig now puts the card in one.
 */
import { withBrowser, BASE, wait } from './cdp.mjs';

/* Runs on import: spawns a harness and drives Chrome. See capture.mjs. */
if (!import.meta.main) {
  throw new Error(
    `${import.meta.filename} is a script, not a module. Run it with node instead.`
  );
}

const WHEEL_STEPS = 6;
const WHEEL_DELTA = 100;

/** Wheel `n` times at a point, then report how far the host page moved. */
const wheelAt = async (cdp, x, y) => {
  await cdp.eval('window.scrollTo(0, 0)');
  await wait(120);
  for (let i = 0; i < WHEEL_STEPS; i++) {
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x,
      y,
      deltaX: 0,
      deltaY: WHEEL_DELTA,
      pointerType: 'mouse',
    });
    await wait(60);
  }
  await wait(200);
  return cdp.eval('window.scrollY');
};

/**
 * A touch swipe, which is how the feed is actually scrolled on a phone. A wheel
 * and a swipe are stopped by different things: `touch-action: none` kills the
 * swipe and leaves the wheel alone, so testing only the wheel would have
 * reported a clean bill on a card nobody could scroll past with a thumb.
 */
const swipeAt = async (cdp, x, y) => {
  await cdp.eval('window.scrollTo(0, 0)');
  await wait(120);
  const touch = (ty) => ({ x, y: ty, radiusX: 8, radiusY: 8, force: 1 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(y)] });
  for (let step = 1; step <= 10; step++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [touch(y - step * 30)],
    });
    await wait(24);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await wait(400);
  return cdp.eval('window.scrollY');
};

const ENTRIES = [
  { name: 'feed card, same-origin', entry: 'splash.html', origin: 'same' },
  { name: 'feed card, cross-origin', entry: 'splash.html', origin: 'cross' },
  { name: 'game, same-origin', entry: 'game.html', origin: 'same' },
  { name: 'game, cross-origin', entry: 'game.html', origin: 'cross' },
];

const rows = await withBrowser(async (cdp) => {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 400,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });

  const out = [];
  for (const { name, entry, origin } of ENTRIES) {
    await cdp.send('Page.navigate', {
      url: `${BASE}/qa/scroll-host?entry=${entry}&origin=${origin}`,
    });
    await wait(2600);

    const box = JSON.parse(
      await cdp.eval(`(() => {
        const r = document.getElementById('post').getBoundingClientRect();
        return JSON.stringify({
          cx: Math.round(r.x + r.width / 2),
          cy: Math.round(r.y + r.height / 2),
        });
      })()`)
    );

    /*
     * The control, and the reason to believe the rest. A wheel over the plain
     * filler above the post must scroll the host; if it does not, the rig is
     * broken and the interesting number below means nothing.
     */
    const control = await wheelAt(cdp, box.cx, 40);
    const overPost = await wheelAt(cdp, box.cx, box.cy);
    const swipeControl = await swipeAt(cdp, box.cx, 300);
    const swipeOverPost = await swipeAt(cdp, box.cx, box.cy);

    out.push({ name, control, overPost, swipeControl, swipeOverPost });
  }
  return out;
});

const expected = WHEEL_STEPS * WHEEL_DELTA;
console.log(`\nScroll chaining — wheel ${WHEEL_STEPS}x${WHEEL_DELTA}px in a host page\n`);

let broken = 0;
let rigBroken = 0;
for (const r of rows) {
  if (r.control === 0) {
    rigBroken++;
    console.log(`  ${r.name.padEnd(24)} RIG BROKEN — the host did not scroll off the post either`);
    continue;
  }
  // Chaining is not required to be pixel-perfect; it is required to happen.
  const chains = r.overPost >= r.control * 0.5;
  const swipeChains =
    r.swipeControl === 0 ? null : r.swipeOverPost >= r.swipeControl * 0.5;
  if (!chains || swipeChains === false) broken++;
  console.log(
    `  ${r.name.padEnd(24)} wheel ${String(r.overPost).padStart(4)}/${String(r.control).padEnd(4)} ` +
      (chains ? 'ok  ' : 'STUCK  ') +
      `swipe ${String(r.swipeOverPost).padStart(4)}/${String(r.swipeControl).padEnd(4)} ` +
      (swipeChains === null ? '(no touch control)' : swipeChains ? 'ok' : 'STUCK')
  );
}
console.log(`\n  (a free host page would move ${expected}px)\n`);

if (rigBroken > 0) {
  console.log('  Fix the rig before trusting this.\n');
  process.exit(2);
}
process.exit(broken > 0 ? 1 : 0);
