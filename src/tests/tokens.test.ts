import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  COLOR,
  DURATION,
  EASE,
  ON_CORAL,
  RADIUS,
  SIZE,
  TYPE,
} from '../client/ui/tokens.ts';

/**
 * The design system has two representations — `tokens.ts` for the canvas, a
 * custom-property mirror in `index.css` for Tailwind — and one of the two is
 * always the one somebody forgets. A screen half in the new palette and half in
 * the old is the kind of bug that survives review because each half looks fine.
 *
 * The contrast block is different in kind: it checks the *claims* §13 makes
 * about its own palette rather than the palette itself. Those ratios are the
 * reason the rules exist, and a palette tweak that quietly breaks one should
 * fail here rather than in an accessibility audit after launch.
 */

const CSS = readFileSync(
  new URL('../client/index.css', import.meta.url).pathname.replace(
    /^\/([A-Za-z]:)/,
    '$1'
  ),
  'utf8'
);

const cssVar = (name: string): string => {
  const match = new RegExp(`--${name}:\\s*([^;]+);`).exec(CSS);
  assert.ok(match, `index.css declares no --${name}`);
  return match[1]!.trim();
};

describe('design tokens', () => {
  it('mirrors every colour into CSS', () => {
    const pairs: ReadonlyArray<readonly [string, string]> = [
      ['color-bg', COLOR.bg],
      ['color-bg-elevated', COLOR.bgElevated],
      ['color-ground', COLOR.ground],
      ['color-ink', COLOR.ink],
      ['color-mist', COLOR.mist],
      ['color-coral', COLOR.coral],
      ['color-coral-pressed', COLOR.coralPressed],
      ['color-gold', COLOR.gold],
      ['color-pip', COLOR.pip],
    ];
    for (const [name, value] of pairs) {
      assert.equal(
        cssVar(name).toLowerCase(),
        value.toLowerCase(),
        `--${name} drifted from tokens.ts`
      );
    }
  });

  it('mirrors radii, durations, easings and control heights', () => {
    assert.equal(cssVar('radius-chip'), `${RADIUS.chip}px`);
    assert.equal(cssVar('radius-button'), `${RADIUS.button}px`);
    assert.equal(cssVar('radius-panel'), `${RADIUS.panel}px`);
    assert.equal(cssVar('radius-card'), `${RADIUS.card}px`);

    assert.equal(cssVar('duration-micro'), `${DURATION.micro}ms`);
    assert.equal(cssVar('duration-short'), `${DURATION.short}ms`);
    assert.equal(cssVar('duration-medium'), `${DURATION.medium}ms`);
    assert.equal(cssVar('duration-long'), `${DURATION.long}ms`);

    assert.equal(cssVar('ease-out-expo'), EASE.outExpo);
    assert.equal(cssVar('ease-out-quad'), EASE.outQuad);
    assert.equal(cssVar('ease-in-out-sine'), EASE.inOutSine);
    assert.equal(cssVar('ease-spring'), EASE.spring);

    assert.equal(cssVar('size-cta'), `${SIZE.cta}px`);
    assert.equal(cssVar('size-secondary'), `${SIZE.secondary}px`);
    assert.equal(cssVar('size-chip'), `${SIZE.chip}px`);
    assert.equal(cssVar('size-touch-target'), `${SIZE.touchTarget}px`);
  });

  it('keeps the type scale to six roles', () => {
    assert.deepEqual(Object.keys(TYPE), [
      'display',
      'score',
      'heading',
      'label',
      'body',
      'numeric',
    ]);
  });

  it('never lets a tappable control fall under the touch floor', () => {
    for (const [role, height] of [
      ['cta', SIZE.cta],
      ['secondary', SIZE.secondary],
      ['icon', SIZE.icon],
    ] as const) {
      assert.ok(
        height >= 44,
        `${role} is ${height}px; 44 is the drawn floor and 48 the hit area`
      );
    }
    assert.ok(SIZE.touchTarget >= 48);
  });
});

// ---------------------------------------------------------------------------
// Contrast
// ---------------------------------------------------------------------------

/** WCAG 2.1 relative luminance. */
const luminance = (hex: string): number => {
  const channel = (i: number): number => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
};

const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
};

describe('palette contrast (the claims §13 makes about itself)', () => {
  it('meets the ratios the spec quotes', () => {
    const cases: ReadonlyArray<readonly [string, number, string, string]> = [
      ['ink on bg', 15, COLOR.ink, COLOR.bg],
      ['mist on bg', 7, COLOR.mist, COLOR.bg],
      ['gold on bg', 11.5, COLOR.gold, COLOR.bg],
      ['bg on coral', 6.4, COLOR.bg, COLOR.coral],
    ];
    for (const [label, claimed, fg, bg] of cases) {
      const actual = contrast(fg, bg);
      assert.ok(
        actual >= claimed - 0.15,
        `${label}: spec claims ${claimed}:1, measured ${actual.toFixed(2)}:1`
      );
    }
  });

  it('shows why text on coral is bg and never white', () => {
    // The rule reads like taste until the number is on the page: white on
    // coral fails AA for body text outright.
    const white = contrast('#FFFFFF', COLOR.coral);
    assert.ok(white < 4.5, `white on coral is ${white.toFixed(2)}:1, not a choice`);
    assert.ok(contrast(ON_CORAL, COLOR.coral) > white * 2);
  });

  it('keeps every text colour readable on the elevated panel too', () => {
    // Panels are `bgElevated`, not `bg`; a colour that only passes on the
    // darker of the two would fail exactly where the result screen lives.
    assert.ok(contrast(COLOR.ink, COLOR.bgElevated) >= 12);
    assert.ok(contrast(COLOR.mist, COLOR.bgElevated) >= 4.5);
    assert.ok(contrast(COLOR.gold, COLOR.bgElevated) >= 8);
  });
});
