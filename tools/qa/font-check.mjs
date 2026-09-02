/**
 * Does the embedded font actually load, and does it have tabular figures?
 *
 *   node tools/qa/font-check.mjs
 *
 * §13 of the redesign spec makes this a build-time question rather than an
 * assumption: "if the embedded font does not expose `tnum`, render each digit in
 * a fixed 0.62em box". Guessing either way is a bug — a fixed-box fallback over
 * a font that already has tabular figures spaces the score wrong, and no
 * fallback over a font that lacks them makes the countdown jitter every second.
 *
 * Measured, not read off a spec sheet: ten digits are rendered in the real
 * font, with and without `font-variant-numeric: tabular-nums`, and their widths
 * compared. Exits non-zero if the font failed to load at all.
 */
import { withBrowser, BASE, wait } from './cdp.mjs';

const PROBE = `(async () => {
  await document.fonts.ready;

  const loaded = document.fonts.check('700 44px "Space Grotesk"');

  const measure = (tabular) => {
    const el = document.createElement('span');
    el.style.cssText =
      'position:absolute;visibility:hidden;font-family:"Space Grotesk";' +
      'font-weight:700;font-size:100px;' +
      (tabular ? 'font-variant-numeric:tabular-nums;' : '');
    document.body.appendChild(el);
    const widths = [];
    for (let d = 0; d <= 9; d++) {
      el.textContent = String(d);
      widths.push(el.getBoundingClientRect().width);
    }
    el.remove();
    return widths;
  };

  const proportional = measure(false);
  const tabular = measure(true);
  const spread = (w) => Math.max(...w) - Math.min(...w);

  // The family actually used, in case the @font-face never applied.
  const probe = document.createElement('span');
  probe.style.cssText = 'font-family:"Space Grotesk";position:absolute;visibility:hidden';
  probe.textContent = '0';
  document.body.appendChild(probe);
  const used = getComputedStyle(probe).fontFamily;
  probe.remove();

  return {
    loaded,
    usedFamily: used,
    proportional,
    tabular,
    proportionalSpread: +spread(proportional).toFixed(2),
    tabularSpread: +spread(tabular).toFixed(2),
    emWidth: +(tabular[0] / 100).toFixed(4),
  };
})()`;

/* Runs on import: spawns a harness and drives Chrome. See capture.mjs. */
if (!import.meta.main) {
  throw new Error(
    `${import.meta.filename} is a script, not a module. Run it with node instead.`
  );
}

const report = await withBrowser(async (cdp) => {
  await cdp.send('Page.navigate', { url: `${BASE}/splash.html` });
  await wait(2000);
  return cdp.eval(PROBE);
});

console.log('\nSpace Grotesk — embedded font check\n');
console.log(`  loaded ...................... ${report.loaded ? 'yes' : 'NO'}`);
console.log(`  computed family ............. ${report.usedFamily}`);
console.log(`  digit widths, proportional .. spread ${report.proportionalSpread}px / 100px em`);
console.log(`  digit widths, tabular-nums .. spread ${report.tabularSpread}px / 100px em`);
console.log(`  advance width of a digit .... ${report.emWidth}em`);

if (!report.loaded) {
  console.error('\n  FAIL: the @font-face never applied. The bundle is rendering in a fallback.');
  process.exit(1);
}

const hasTnum = report.tabularSpread < 0.5;
const alreadyMonospacedDigits = report.proportionalSpread < 0.5;

console.log('');
if (hasTnum) {
  console.log(
    alreadyMonospacedDigits
      ? '  VERDICT: digits are already equal-width; `tabular-nums` is a no-op but harmless.'
      : '  VERDICT: `tabular-nums` works. No fixed-box fallback needed (§13).'
  );
} else {
  console.log(
    `  VERDICT: NO tabular figures — digits still vary by ${report.tabularSpread}px per 100px.`
  );
  console.log(`  Implement the §13 fallback: fixed ${report.emWidth}em boxes per digit.`);
}
