import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  COPY,
  dailyPostTitle,
  formatCountdown,
  formatWind,
  fromCenterLine,
  markerCell,
  MODIFIER_EMOJI,
  MODIFIER_LABEL,
  nextShotLine,
  perfectRarityLine,
  ringForDx,
  seedComment,
  shareFormatA,
  shareFormatB,
  shareGrid,
  streakLine,
  streakResetLine,
  tomorrowLine,
  topPercentLine,
  windArrow,
  windLine,
} from '../shared/copy.ts';
import type { ShareCardInput } from '../shared/copy.ts';
import type { ModifierId } from '../shared/types.ts';

/** The worked example from GDD IV.17, reproduced exactly. */
const REFERENCE_CARD: ShareCardInput = {
  displayDay: 247,
  modifier: 'CROSSWIND',
  windBase: -380,
  score: 98.73,
  percentile: 4.2,
  streak: 12,
  signedDx: 6.4,
};

describe('copy — contractual wordings (GDD 9.9)', () => {
  it('matches the document character for character', () => {
    assert.equal(COPY.tagline, 'One attempt. Every day.');
    assert.equal(COPY.warmupBanner, "WARM-UP — this one doesn't count");
    assert.equal(COPY.warmupOver, 'That was practice. Now for real.');
    assert.equal(COPY.holdToAim, 'HOLD TO AIM');
    assert.equal(COPY.misfireHint, 'Hold… then release');
    assert.equal(COPY.postMyShot, 'POST MY SHOT');
    assert.equal(COPY.practice, 'Practice');
    assert.equal(COPY.offTheMap, 'OFF THE MAP');
    assert.equal(
      COPY.helpBody,
      'Hold to charge, release to shoot. Closest to center wins. One official shot per day.'
    );
  });

  it('renders the templated lines as specified', () => {
    assert.equal(topPercentLine(4.2), 'TOP 4.2% TODAY');
    assert.equal(fromCenterLine(6.4), '6.4 from center');
    assert.equal(streakLine(12), '🔥 12 DAY STREAK');
    assert.equal(tomorrowLine('MOON'), 'Tomorrow: MOON GRAVITY 🌙');
    assert.equal(nextShotLine(8 * 3600000 + 42 * 60000 + 17000), 'Next shot in 08:42:17');
    assert.equal(
      streakResetLine(17),
      'Streak reset. Longest: 17 🔥 — Day 1 starts now.'
    );
    assert.equal(
      perfectRarityLine(38, 42617),
      'Only 38 of 42,617 players hit a Perfect today.'
    );
  });

  it('formats a score to two decimals and a percentile to one', () => {
    assert.equal(topPercentLine(100), 'TOP 100.0% TODAY');
    assert.equal(shareFormatA({ ...REFERENCE_CARD, score: 100 }).includes('100.00'), true);
    assert.equal(shareFormatA({ ...REFERENCE_CARD, score: 0 }).includes('0.00'), true);
  });

  it('covers every modifier with a label and a glyph', () => {
    const ids: ModifierId[] = [
      'CLEAR',
      'CROSSWIND',
      'TAILWIND',
      'GUSTY',
      'MOON',
      'TINY',
      'LONG',
    ];
    for (const id of ids) {
      assert.ok(MODIFIER_LABEL[id].length > 0);
      assert.ok(MODIFIER_EMOJI[id].length > 0);
    }
  });
});

describe('countdown', () => {
  it('zero-pads every field', () => {
    assert.equal(formatCountdown(0), '00:00:00');
    assert.equal(formatCountdown(1000), '00:00:01');
    assert.equal(formatCountdown(61000), '00:01:01');
    assert.equal(formatCountdown(23 * 3600000 + 59 * 60000 + 59000), '23:59:59');
  });

  it('never runs backwards past zero', () => {
    assert.equal(formatCountdown(-5000), '00:00:00');
  });
});

describe('wind', () => {
  it('uses a real minus sign and an explicit plus', () => {
    assert.equal(formatWind(-380), '−380');
    assert.equal(formatWind(280.4), '+280');
    assert.equal(formatWind(0), '+0');
  });

  it('points the arrow the way the wind pushes', () => {
    assert.equal(windArrow(-380), '←');
    assert.equal(windArrow(18), '→');
    assert.equal(windLine(-380), 'WIND −380 ←');
  });
});

describe('share Format A', () => {
  it('reproduces the document example exactly', () => {
    assert.equal(
      shareFormatA(REFERENCE_CARD),
      '🎯 ONE SHOT #247 · 98.73 · Top 4.2% · 🔥 12'
    );
  });
});

describe('share Format B', () => {
  it('reproduces the document example exactly', () => {
    assert.equal(
      shareFormatB(REFERENCE_CARD),
      [
        'ONE SHOT #247 🌬️−380',
        '🟦🟦🟥🟦🟦',
        '🟦🟥🟨🟥🟦',
        '🟥🟨🎯⚫🟥',
        '🟦🟥🟨🟥🟦',
        '🟦🟦🟥🟦🟦',
        '98.73 · Top 4.2% · 🔥12',
      ].join('\n')
    );
  });

  it('buckets the miss distance exactly as specified', () => {
    assert.equal(ringForDx(0), 0);
    assert.equal(ringForDx(4), 0);
    assert.equal(ringForDx(4.1), 1);
    assert.equal(ringForDx(12), 1);
    assert.equal(ringForDx(12.1), 2);
    assert.equal(ringForDx(35), 2);
    assert.equal(ringForDx(35.1), 3);
    assert.equal(ringForDx(60), 3);
    assert.equal(ringForDx(60.1), 4);
    assert.equal(ringForDx(9999), 4);
  });

  it('mirrors an undershoot to the left of the bullseye', () => {
    const over = shareGrid(6.4);
    const under = shareGrid(-6.4);
    assert.deepEqual(
      under,
      over.map((row) => [...row].reverse().join(''))
    );
  });

  it('walks the marker outward as the miss grows', () => {
    const cells = [0, 6, 20, 45, 200].map((dx) =>
      markerCell(ringForDx(dx), 1)
    );
    assert.deepEqual(cells, [
      [2, 2],
      [2, 3],
      [2, 4],
      [1, 4],
      [0, 4],
    ]);
  });

  it('keeps the marker on the correct side at every ring', () => {
    for (const dx of [6, 20, 45, 200]) {
      const ring = ringForDx(dx);
      assert.ok(markerCell(ring, 1)[1] > 2, `overshoot ring ${ring}`);
      assert.ok(markerCell(ring, -1)[1] < 2, `undershoot ring ${ring}`);
    }
  });

  it('keeps the bullseye visible on a dead-centre shot', () => {
    const grid = shareGrid(1.2);
    assert.equal(grid[2], '🟥🟨🎯🟨🟥');
    assert.ok(!grid.join('').includes('⚫'));
  });

  it('always renders a 5x5 grid', () => {
    for (const dx of [-900, -60, -12, -1, 0, 1, 12, 60, 900]) {
      const grid = shareGrid(dx);
      assert.equal(grid.length, 5);
      for (const row of grid) assert.equal([...row].length, 5);
    }
  });

  it('gives a different grid to different misses', () => {
    const seen = new Set(
      [-200, -45, -20, -6, 0, 6, 20, 45, 200].map((dx) =>
        shareGrid(dx).join('|')
      )
    );
    assert.equal(seen.size, 9);
  });

  it('never leaks the power that produced the shot', () => {
    const card = shareFormatB(REFERENCE_CARD);
    assert.ok(!/power/i.test(card));
    assert.ok(!card.includes('%\n'));
  });
});

describe('reddit-side copy', () => {
  it('builds the daily post title in the contractual shape', () => {
    assert.equal(
      dailyPostTitle(247, 'CROSSWIND'),
      '🎯 ONE SHOT #247 — Crosswind. One try. 24 hours.'
    );
  });

  it('opens the daily thread with a rule-built headline', () => {
    assert.equal(
      seedComment(247, 'CROSSWIND', -380, {
        perfects: 1,
        topScore: 99.94,
        shots: 42617,
      }),
      'Day #247 — Crosswind −380. Post your score below. Only 1 Perfect yesterday.'
    );
    assert.equal(
      seedComment(247, 'CROSSWIND', -380, {
        perfects: 0,
        topScore: 99.94,
        shots: 42617,
      }),
      'Day #247 — Crosswind −380. Post your score below. ' +
        'Nobody hit a Perfect yesterday — best was 99.94.'
    );
    assert.equal(
      seedComment(1, 'CLEAR', 12, null),
      'Day #1 — Clear Skies +12. Post your score below.'
    );
  });
});
