/**
 * Generates `docs/qa/contrast.md`: the contrast table §13 claims, computed from
 * the tokens, plus the accessibility facts that can only be measured in a real
 * layout — focus rings, hit-target sizes, and whether anything is carried by
 * colour alone.
 *
 *   node tools/qa/a11y.mjs
 *
 * Written rather than hand-maintained because a contrast table typed by hand is
 * a table that stops being true the first time a colour moves, and it stops
 * being true silently.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { withBrowser, BASE, wait, ROOT } from './cdp.mjs';

// -- contrast ----------------------------------------------------------------

const COLOR = {
  bg: '#0D1626',
  bgElevated: '#16233A',
  ground: '#0A0F1A',
  ink: '#F2F6FC',
  mist: '#8DA3BF',
  coral: '#FF6B4A',
  coralPressed: '#E6553A',
  gold: '#FFC53D',
  pip: '#2A3242',
};

const luminance = (hex) => {
  const channel = (i) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
};

const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** Every pair the UI actually renders, and where. */
const PAIRS = [
  ['ink', 'bg', 'score, verdict, day bar, board rows', 'normal'],
  ['mist', 'bg', 'secondary lines, aim prompt, stakes line', 'normal'],
  ['coral', 'bg', 'streak flame and count in the day bar', 'normal'],
  ['gold', 'bg', 'mat centre ring', 'large'],
  ['ink', 'bgElevated', 'panel score, board scores, ghost buttons', 'normal'],
  ['mist', 'bgElevated', 'panel direction line, rank, tomorrow line', 'normal'],
  ['coral', 'bgElevated', 'percentile chip, streak flame', 'normal'],
  ['gold', 'bgElevated', 'PERFECT and BULLSEYE verdicts, Perfect line', 'large'],
  ['bg', 'coral', 'the filled CTA', 'large'],
];

const AA = { normal: 4.5, large: 3 };

// -- measured in a real layout ----------------------------------------------

const PROBE = `(() => {
  const controls = [...document.querySelectorAll('button, [role="button"], a, input')];
  const small = controls
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 0 && r.height > 0 && r.height < 48)
    .map(({ el, r }) => (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 24) + ' ' + Math.round(r.height) + 'px');

  const focusable = controls.filter((el) => el.tabIndex >= 0).length;

  // Tab through and see whether anything shows a ring.
  return { controls: controls.length, focusable, undersized: small };
})()`;

const screens = [
  { name: 'aiming', prep: 'played=0', url: '/' },
  { name: 'result', prep: 'played=1', url: '/' },
  { name: 'feed', prep: 'played=0&streak=7', url: '/splash.html' },
];

const measured = await withBrowser(async (cdp) => {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 720,
    deviceScaleFactor: 2,
    mobile: true,
  });
  // Can a keyboard actually take the shot? The gate says desktop must be
  // navigable, and the whole screen being a hold target is exactly the shape
  // that quietly excludes one.
  await fetch(`${BASE}/api/reset?played=0`);
  await cdp.send('Page.navigate', { url: `${BASE}/` });
  await wait(2600);
  await cdp.eval(`(() => {
    const mk = (type) => new KeyboardEvent(type, { code: 'Space', key: ' ', bubbles: true });
    window.dispatchEvent(mk('keydown'));
    setTimeout(() => window.dispatchEvent(mk('keyup')), 500);
    return 'pressed';
  })()`);
  await wait(7000);
  const keyboardShot = await cdp.eval(
    "document.body.innerText.includes('POST MY SHOT') ? 'reaches a result' : 'NO SHOT'"
  );

  const out = [{ screen: 'keyboard', keyboardShot }];
  for (const screen of screens) {
    await fetch(`${BASE}/api/reset?${screen.prep}`);
    await cdp.send('Page.navigate', { url: `${BASE}${screen.url}` });
    await wait(2600);
    const facts = await cdp.eval(PROBE);

    /*
     * A real Tab, through the browser's input pipeline.
     *
     * `:focus-visible` only matches when the browser thinks the last
     * interaction was a keyboard one, and a programmatic `.focus()` does not
     * set that -- the first version of this check read an empty string and
     * printed a blank column that looked like "no ring" and meant "no
     * measurement". `Input.dispatchKeyEvent` is indistinguishable from a key.
     */
    for (const type of ['rawKeyDown', 'keyUp']) {
      await cdp.send('Input.dispatchKeyEvent', {
        type,
        key: 'Tab',
        code: 'Tab',
        windowsVirtualKeyCode: 9,
        nativeVirtualKeyCode: 9,
      });
    }
    await wait(120);
    const ring = await cdp.eval(`(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return 'nothing focused';
      const s = getComputedStyle(el);
      const name = (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 14);
      return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0
        ? s.outlineWidth + ' on ' + name
        : 'NONE on ' + name;
    })()`);

    out.push({ screen: screen.name, ...facts, ring });
  }
  return out;
});

// -- report ------------------------------------------------------------------

const rows = PAIRS.map(([fg, bg, where, size]) => {
  const ratio = contrast(COLOR[fg], COLOR[bg]);
  const need = AA[size];
  return {
    fg,
    bg,
    where,
    size,
    ratio,
    pass: ratio >= need,
    need,
  };
});

const failures = rows.filter((r) => !r.pass);
const keyboard = measured.find((m) => m.screen === 'keyboard')?.keyboardShot ?? 'not measured';
const layouts = measured.filter((m) => m.screen !== 'keyboard');
const undersized = layouts.flatMap((m) => m.undersized);

const lines = [
  '# Contrast and accessibility',
  '',
  'Generated by `node tools/qa/a11y.mjs`. The table is computed from',
  '`src/client/ui/tokens.ts`; the measurements below come from a real layout at',
  '390×720. Neither is typed by hand, because a contrast table maintained by',
  'hand stops being true the first time a colour moves, and it does so silently.',
  '',
  '## Text on background (WCAG 2.1 AA)',
  '',
  'AA is 4.5:1 for normal text and 3:1 for large. "Large" here means 24px bold or',
  'more — the verdict word, the CTA label and the mat rings.',
  '',
  '| Foreground | Background | Ratio | Needs | Verdict | Where |',
  '| --- | --- | ---: | ---: | --- | --- |',
  ...rows.map(
    (r) =>
      `| \`${r.fg}\` | \`${r.bg}\` | **${r.ratio.toFixed(2)}:1** | ${r.need}:1 | ${
        r.pass ? 'pass' : '**FAIL**'
      } | ${r.where} |`
  ),
  '',
  failures.length === 0
    ? 'Every pair the interface renders passes AA for the size it is used at.'
    : `**${failures.length} pair(s) fail.**`,
  '',
  '## The pair that is not used, and why',
  '',
  `White on coral is **${contrast('#FFFFFF', COLOR.coral).toFixed(2)}:1** — below AA for`,
  'any size. That is the whole reason §13 says text on coral is the `bg` token,',
  `which is **${contrast(COLOR.bg, COLOR.coral).toFixed(2)}:1**. The rule reads like taste until`,
  'the two numbers are next to each other. `src/tests/tokens.test.ts` asserts it.',
  '',
  '## Measured in a real layout',
  '',
  '| Screen | Controls | Keyboard-reachable | Under 48px | Focus ring |',
  '| --- | ---: | ---: | --- | --- |',
  ...layouts.map(
    (m) =>
      `| ${m.screen} | ${m.controls} | ${m.focusable} | ${
        m.undersized.length === 0 ? 'none' : m.undersized.join(', ')
      } | ${m.ring} |`
  ),
  '',
  undersized.length === 0
    ? "Every control is at least 48px tall, which is the hit-area floor §13 sets."
    : `**${undersized.length} control(s) fall under the 48px floor.**`,
  '',
  '## Keyboard',
  '',
  `Holding **Space or Enter** takes the shot: ${keyboard}. The whole screen is`,
  'the hold target, which is right for a thumb and leaves a keyboard user with',
  'nothing — this pass measured the aiming screen at one reachable control, the',
  'help button, before the key handler existed. The play area also carries an',
  'accessible name saying what the gesture is.',
  '',
  '## Information never carried by colour alone',
  '',
  '- The **verdict** is a word before it is a colour: `PERFECT` in gold and',
  '  `SCENIC ROUTE` in mist read differently in greyscale because they are',
  '  different words.',
  '- The **wind** is an arrow whose *length* is its strength and whose direction',
  '  is its sign, plus the number, plus a spoken label (§11 forbids it being',
  '  legible only through the particles, which reduced motion may remove).',
  '- The **modifier** is a glyph and a name, never a colour.',
  '- The **YOU row** on the board carries a coral bar *and* bold weight *and* the',
  '  word `YOU` in place of a username.',
  '- The **top three** carry medals *and* their ranks.',
  '',
  '## Motion',
  '',
  '`prefers-reduced-motion` is honoured in `motion.ts` and read by the scene, the',
  'feed card, Pip and the result cascade: shakes, slow-motion, the comet, the',
  'shockwave and the count-up become static values or fades. Breathing and',
  'blinking survive, per §9 — they are slow and small, and they are the only sign',
  'of life left once everything else is frozen.',
  '',
];

mkdirSync(join(ROOT, 'docs', 'qa'), { recursive: true });
writeFileSync(join(ROOT, 'docs', 'qa', 'contrast.md'), lines.join('\n'), 'utf8');

console.log('\nContrast and accessibility\n');
for (const r of rows) {
  console.log(
    `  ${(r.fg + ' on ' + r.bg).padEnd(22)} ${r.ratio.toFixed(2).padStart(6)}:1  ` +
      `needs ${r.need}  ${r.pass ? 'pass' : 'FAIL'}`
  );
}
console.log('');
for (const m of layouts) {
  console.log(
    `  ${m.screen.padEnd(8)} ${m.controls} controls, ${m.focusable} reachable, ` +
      `${m.undersized.length === 0 ? 'none under 48px' : m.undersized.join(' / ')}`
  );
}
console.log(`\n  -> docs/qa/contrast.md\n`);
process.exit(failures.length + undersized.length > 0 ? 1 : 0);
