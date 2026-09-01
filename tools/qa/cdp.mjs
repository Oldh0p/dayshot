/**
 * A minimal Chrome DevTools Protocol client, and the harness lifecycle around
 * it. Shared by every QA tool in this directory.
 *
 * No dependency: node 24 ships a global WebSocket. See `capture.mjs` for why
 * CDP rather than `chrome --screenshot` (headless Chrome on Windows clamps
 * `--window-size` to 500px, so mobile viewports are simply not reachable that
 * way).
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

export const ROOT = resolve(import.meta.dirname, '../..');
export const HARNESS_PORT = 5599;
export const BASE = `http://localhost:${HARNESS_PORT}`;

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export class Cdp {
  #ws;
  #id = 0;
  #pending = new Map();

  static async attach(wsUrl) {
    const client = new Cdp();
    client.#ws = new WebSocket(wsUrl);
    client.#ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      const resolver = client.#pending.get(msg.id);
      if (!resolver) return;
      client.#pending.delete(msg.id);
      if (msg.error) resolver.reject(new Error(msg.error.message));
      else resolver.resolve(msg.result);
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

  /** Evaluate in the page and return the value. Throws on a page-side throw. */
  async eval(expression) {
    const { result, exceptionDetails } = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (exceptionDetails) throw new Error(exceptionDetails.text);
    return result.value;
  }

  close() {
    this.#ws.close();
  }
}

const pageSocket = async (port) => {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      /* chrome not listening yet */
    }
    await wait(250);
  }
  throw new Error('Chrome DevTools endpoint never came up');
};

/**
 * Runs `fn(cdp)` with the harness serving `dist/client` and a headless browser
 * attached, then tears both down whatever happens.
 */
export const withBrowser = async (fn, { cdpPort = 9333 } = {}) => {
  const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!chrome) throw new Error('No Chrome or Edge found:\n  ' + CHROME_CANDIDATES.join('\n  '));

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
      `--remote-debugging-port=${cdpPort}`,
      '--user-data-dir=' + join(ROOT, 'node_modules', '.qa-chrome'),
      'about:blank',
    ],
    { stdio: 'ignore' }
  );

  try {
    await wait(600);
    const cdp = await Cdp.attach(await pageSocket(cdpPort));
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    const out = await fn(cdp);
    cdp.close();
    return out;
  } finally {
    browser.kill();
    harness.kill();
  }
};
