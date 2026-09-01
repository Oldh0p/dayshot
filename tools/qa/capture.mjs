/**
 * QA screenshot capture, over the Chrome DevTools Protocol.
 *
 *   node tools/qa/capture.mjs before
 *   node tools/qa/capture.mjs after --only=result,feed
 *
 * **Why CDP and not `chrome --screenshot`.** Headless Chrome on Windows clamps
 * `--window-size` to a 500px minimum: asking for 360 or 390 silently renders at
 * 500 and the screenshot is a layout that does not exist. Measured, not assumed
 * -- `--window-size=360` reports `innerWidth === 500`. Since the whole point is
 * mobile-first (the spec designs for 350px), the flag is unusable here.
 * `Emulation.setDeviceMetricsOverride` sets the viewport exactly, and node 24
 * ships a global WebSocket, so driving it costs no dependency.
 *
 * It also buys what later phases need: clicks (states behind a button),
 * `prefers-reduced-motion`, and CPU throttling for the phase 9 budget.
 */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chrome) {
  console.error('No Chrome or Edge found:\n  ' + CHROME_CANDIDATES.join('\n  '));
  process.exit(1);
}

const ROOT = resolve(import.meta.dirname, '../..');
const HARNESS_PORT = 5599;
const CDP_PORT = 9333;
const BASE = `http://localhost:${HARNESS_PORT}`;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// -- shot list ---------------------------------------------------------------

const MOBILE = { w: 390, h: 720 };
const SMALL = { w: 360, h: 640 };
const TINY = { w: 360, h: 350 };
const FEED_DESKTOP = { w: 700, h: 512 };
const DESKTOP = { w: 900, h: 760 };

/**
 * `prep` drives the harness's own reset endpoint, so a state that needs a
 * finished shot does not need one to be played. `steps` are clicks by button
 * label, for the screens that live behind a button.
 */
export const SHOTS = [
  // §4.4's three cards, at the three sizes §12 designs for.
  { name: 'feed-A-350', url: '/splash.html', prep: 'played=0&anon=1', ...TINY },
  { name: 'feed-A-512', url: '/splash.html', prep: 'played=0&anon=1', w: 360, h: 512 },
  { name: 'feed-A-desktop', url: '/splash.html', prep: 'played=0&anon=1', ...FEED_DESKTOP },
  { name: 'feed-B-350', url: '/splash.html', prep: 'played=0&streak=7', ...TINY },
  { name: 'feed-B-512', url: '/splash.html', prep: 'played=0&streak=7', w: 360, h: 512 },
  { name: 'feed-C-350', url: '/splash.html', prep: 'played=1&streak=7', ...TINY },
  { name: 'feed-C-512', url: '/splash.html', prep: 'played=1&streak=7', w: 360, h: 512 },
  { name: 'feed-C-desktop', url: '/splash.html', prep: 'played=1&streak=7', ...FEED_DESKTOP },
  { name: 'feed-mobile', url: '/splash.html', prep: 'played=0&streak=7', ...MOBILE },
  { name: 'ready-mobile', url: '/', prep: 'played=0', ...MOBILE },
  { name: 'ready-warmup', url: '/', prep: 'played=0&warmup=1', ...MOBILE },
  { name: 'ready-desktop', url: '/', prep: 'played=0', ...DESKTOP },
  { name: 'result-mobile', url: '/', prep: 'played=1', ...MOBILE },
  { name: 'result-mobile-640', url: '/', prep: 'played=1', ...SMALL },
  { name: 'result-desktop', url: '/', prep: 'played=1', ...DESKTOP },
  {
    name: 'leaderboard-mobile',
    url: '/',
    prep: 'played=1',
    ...MOBILE,
    steps: [{ click: 'Leaderboard' }],
  },
  {
    name: 'leaderboard-desktop',
    url: '/',
    prep: 'played=1',
    ...DESKTOP,
    steps: [{ click: 'Leaderboard' }],
  },
  {
    name: 'practice-mobile',
    url: '/',
    prep: 'played=1',
    ...MOBILE,
    steps: [{ click: 'Practice' }],
  },
  {
    name: 'help-mobile',
    url: '/',
    prep: 'played=1',
    ...MOBILE,
    steps: [{ click: '?' }],
  },
  {
    name: 'consent-mobile',
    url: '/',
    prep: 'played=1',
    ...MOBILE,
    steps: [{ click: 'POST MY SHOT' }],
  },
];

// -- CDP client --------------------------------------------------------------

class Cdp {
  #ws;
  #id = 0;
  #pending = new Map();

  static async attach(wsUrl) {
    const client = new Cdp();
    client.#ws = new WebSocket(wsUrl);
    client.#ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      const resolver = client.#pending.get(msg.id);
      if (resolver) {
        client.#pending.delete(msg.id);
        msg.error ? resolver.reject(new Error(msg.error.message)) : resolver.resolve(msg.result);
      }
    });
    await new Promise((ok, no) => {
      client.#ws.addEventListener('open', ok, { once: true });
      client.#ws.addEventListener('error', no, { once: true });
    });
    return client;
  }

  send(method, params = {}) {
    const id = ++this.#id;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.#ws.close();
  }
}

/** Chrome needs a moment before /json/list answers. */
const targetUrl = async () => {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      /* not up yet */
    }
    await wait(250);
  }
  throw new Error('Chrome DevTools endpoint never came up');
};

// -- run ---------------------------------------------------------------------

const set = process.argv[2] ?? 'before';
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const only = onlyArg ? onlyArg.slice('--only='.length).split(',') : null;

const outDir = join(ROOT, 'docs', 'qa', set);
mkdirSync(outDir, { recursive: true });

/*
 * Refuse to run against a harness this script did not start.
 *
 * A stale server left over from an earlier run keeps the port, the new one
 * fails to bind silently (stdio is ignored), and every capture is taken against
 * whatever code that old process was built from. It cost an afternoon once: the
 * feed's anonymous state kept rendering as a returning player because a harness
 * from before the flag existed was still answering.
 */
try {
  const stale = await fetch(`${BASE}/api/state`, { signal: AbortSignal.timeout(800) });
  if (stale.ok) {
    console.error(
      `
A server is already listening on ${HARNESS_PORT}. Captures would be ` +
        `taken against it, not against this build.
Stop it first, then re-run.`
    );
    process.exit(1);
  }
} catch {
  // Nothing there: good.
}

const harness = spawn(process.execPath, [join(ROOT, 'tools/devharness/server.mjs')], {
  cwd: ROOT,
  stdio: 'ignore',
});

const browser = spawn(
  chrome,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${CDP_PORT}`,
    '--user-data-dir=' + join(ROOT, 'node_modules', '.qa-chrome'),
    'about:blank',
  ],
  { stdio: 'ignore' }
);

let failures = 0;
try {
  await wait(600);
  const cdp = await Cdp.attach(await targetUrl());
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  for (const shot of SHOTS) {
    if (only && !only.some((o) => shot.name.includes(o))) continue;

    await fetch(`${BASE}/api/reset?${shot.prep}`);
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: shot.w,
      height: shot.h,
      deviceScaleFactor: 2,
      mobile: shot.w < 600,
    });
    await cdp.send('Page.navigate', { url: `${BASE}${shot.url}` });
    await wait(2600); // load + the result cascade, which is ~1.6s

    for (const step of shot.steps ?? []) {
      const { result } = await cdp.send('Runtime.evaluate', {
        expression: `(() => {
          const b = [...document.querySelectorAll('button')]
            .find(x => x.textContent.trim() === ${JSON.stringify(step.click)});
          if (!b) return 'MISSING';
          b.click();
          return 'ok';
        })()`,
        returnByValue: true,
      });
      if (result.value === 'MISSING') {
        console.log(`  ! ${shot.name}: no button "${step.click}" — skipped`);
        failures++;
      }
      await wait(700);
    }

    // The viewport is the truth; never capture beyond it.
    const { data } = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    const file = join(outDir, `${shot.name}.png`);
    writeFileSync(file, Buffer.from(data, 'base64'));

    /*
     * Scroll *and* clipping. A screen laid out with `overflow: hidden` cannot
     * scroll — which is the rule — so the way it fails instead is by cutting
     * content off at an edge, silently. `HOLD TO AIM` sitting half outside the
     * frame looks like a rendering artefact in a screenshot and is a layout
     * bug; only measuring tells them apart.
     */
    const { result: measured } = await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const d = document.documentElement;
        const w = d.clientWidth, h = d.clientHeight;
        const clipped = [...document.querySelectorAll('#root *')]
          .filter((el) => {
            if (!el.textContent?.trim() && el.tagName !== 'CANVAS') return false;
            const r = el.getBoundingClientRect();
            if (r.width < 1 || r.height < 1) return false;
            if (getComputedStyle(el).visibility === 'hidden') return false;
            return r.bottom > h + 0.5 || r.top < -0.5 || r.right > w + 0.5 || r.left < -0.5;
          })
          .map((el) => (el.textContent || el.tagName).trim().slice(0, 22));
        return w + 'x' + h +
          (d.scrollWidth > w ? ' SCROLLS-X' : '') +
          (d.scrollHeight > h ? ' SCROLLS-Y' : '') +
          (clipped.length ? '  CLIPPED: ' + [...new Set(clipped)].slice(0, 3).join(' | ') : '');
      })()`,
      returnByValue: true,
    });
    if (measured.value.includes('CLIPPED') || measured.value.includes('SCROLLS')) failures++;
    console.log(`  ${String(shot.w + 'x' + shot.h).padEnd(9)} ${shot.name.padEnd(20)} viewport ${measured.value}`);
  }
  cdp.close();
} finally {
  browser.kill();
  harness.kill();
}

process.exit(failures > 0 ? 1 : 0);
