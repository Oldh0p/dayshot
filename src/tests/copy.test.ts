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
  rankTodayLine,
  ringBoundaries,
  ringForDx,
  showsGlobalRank,
  standingHeadline,
  seedComment,
  shareFormatA,
  splashDescription,
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
import {
  LAUNCH_DAY,
  PERCENTILE_MIN_PLAYERS,
  PERFECT_RADIUS,
  TARGET_R,
} from '../shared/tunables.ts';
import { generateLevel } from '../shared/sim.ts';

/** Spelled out so the escape survives every layer of tooling in between. */
const NEWLINE = String.fromCharCode(10);

/** The worked example from GDD IV.17, reproduced exactly. */
const REFERENCE_CARD: ShareCardInput = {
  displayDay: 247,
  modifier: 'CROSSWIND',
  windBase: -380,
  score: 98.73,
  percentile: 4.2,
  streak: 12,
  signedDx: 6.4,
  targetR: TARGET_R,
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
    assert.equal(
      nextShotLine(8 * 3600000 + 42 * 60000 + 17000),
      'Next shot in 08:42:17'
    );
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
    assert.equal(
      shareFormatA({ ...REFERENCE_CARD, score: 100 }).includes('100.00'),
      true
    );
    assert.equal(
      shareFormatA({ ...REFERENCE_CARD, score: 0 }).includes('0.00'),
      true
    );
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
    assert.equal(
      formatCountdown(23 * 3600000 + 59 * 60000 + 59000),
      '23:59:59'
    );
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

  it('scales its buckets with the mat, so Tiny Target reads truthfully', () => {
    // The document's absolute buckets are right at the default radius...
    assert.deepEqual(ringBoundaries(TARGET_R), [4, 12, 35, 60]);

    // ...and wrong at any other. On a Tiny Target day the mat is 30 units
    // across, so a shot 35 out is well off it and must not draw as though it
    // had landed on the mat.
    const tiny = TARGET_R / 2;
    assert.equal(ringForDx(35, tiny), 4, 'off the mat entirely');
    assert.equal(ringForDx(35, TARGET_R), 2, 'well inside the mat');

    // The Perfect radius is absolute, not relative: a bullseye is a bullseye.
    assert.equal(ringBoundaries(tiny)[0], PERFECT_RADIUS);
    // The outermost boundary is always the rim of that day's mat.
    assert.equal(ringBoundaries(tiny).at(-1), tiny);
  });

  it('keeps the grid legible on a Tiny Target day', () => {
    const tiny = TARGET_R / 2;
    // A shot that is a Bullseye on a tiny mat still lands on the inner ring.
    assert.equal(ringForDx(6, tiny), 1);
    // The same distance that filled ring 1 at full size now reads further out.
    assert.ok(ringForDx(12, tiny) > ringForDx(12, TARGET_R));
  });

  it('draws the same miss differently on a tiny mat', () => {
    const tiny = TARGET_R / 2;

    // 35 units out is still on a full-size mat: middle row, outer cell.
    assert.deepEqual(shareGrid(35, TARGET_R), [
      '\u{1F7E6}\u{1F7E6}\u{1F7E5}\u{1F7E6}\u{1F7E6}',
      '\u{1F7E6}\u{1F7E5}\u{1F7E8}\u{1F7E5}\u{1F7E6}',
      '\u{1F7E5}\u{1F7E8}\u{1F3AF}\u{1F7E8}\u26AB',
      '\u{1F7E6}\u{1F7E5}\u{1F7E8}\u{1F7E5}\u{1F7E6}',
      '\u{1F7E6}\u{1F7E6}\u{1F7E5}\u{1F7E6}\u{1F7E6}',
    ]);

    // The same 35 units is well off a 30-unit mat, and the card has to say so:
    // the marker moves to the corner and the bullseye row is left untouched.
    const small = shareGrid(35, tiny);
    assert.equal(small[0], '\u{1F7E6}\u{1F7E6}\u{1F7E5}\u{1F7E6}\u26AB');
    assert.equal(small[2], '\u{1F7E5}\u{1F7E8}\u{1F3AF}\u{1F7E8}\u{1F7E5}');
    assert.notDeepEqual(small, shareGrid(35, TARGET_R));
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
    const cells = [0, 6, 20, 45, 200].map((dx) => markerCell(ringForDx(dx), 1));
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

  it('opens the daily thread as an invitation, not an announcement', () => {
    // Every score card replies to this comment, so its first line has to read
    // as the thread it is -- a reader who only sees the collapsed header should
    // still know what is underneath.
    assert.equal(
      seedComment(1, 'CLEAR', null),
      [
        '\u{1F3AF} **Drop your shot below**',
        '',
        'Day #1 \u2014 Clear Skies. Tap POST MY SHOT on your result and your ' +
          'card replies here. One shot per player, per day \u2014 everyone ' +
          'resets at 00:00 UTC.',
      ].join(NEWLINE)
    );
  });

  it('mentions yesterday only when somebody hit a Perfect', () => {
    const yesterday = (perfects: number) => ({
      perfects,
      topScore: 99.94,
      shots: 42617,
    });

    // Day one has no yesterday at all.
    assert.ok(seedComment(1, 'CLEAR', null).endsWith('00:00 UTC.'));

    // A day where nobody managed one says nothing rather than saying zero:
    // "Nobody hit a Perfect yesterday" reads as a scoreboard of failure.
    const quiet = seedComment(2, 'CLEAR', yesterday(0));
    assert.ok(quiet.endsWith('00:00 UTC.'));
    assert.ok(!/Perfect/.test(quiet));

    assert.ok(
      seedComment(247, 'CROSSWIND', yesterday(1)).endsWith(
        `${NEWLINE}${NEWLINE}Only 1 Perfect yesterday.`
      )
    );
    assert.ok(
      seedComment(247, 'CROSSWIND', yesterday(38)).endsWith(
        `${NEWLINE}${NEWLINE}38 Perfects yesterday.`
      )
    );
  });

  it("never leaks the day's conditions into the post or the thread", () => {
    // Reading the wind and the distance is the planning beat of the game
    // (GDD 5). A player who meets them in a comment has had that beat taken
    // away, so neither the title nor the seed comment may carry a value.
    //
    // The check is on every number that appears: anything that is not the day
    // number, the Perfect count, or part of "24 hours" / "00:00 UTC" is a leak.
    for (let offset = 0; offset < 200; offset++) {
      const day = LAUNCH_DAY + offset;
      const level = generateLevel(day);
      const displayDay = day - LAUNCH_DAY + 1;
      const perfects = 7;
      const allowed = new Set([displayDay, perfects, 24, 0]);

      for (const text of [
        dailyPostTitle(displayDay, level.modifier),
        seedComment(displayDay, level.modifier, {
          perfects,
          topScore: 99.94,
          shots: 1000,
        }),
        splashDescription(level.modifier),
      ]) {
        for (const match of text.matchAll(/\d+/g)) {
          const value = Number(match[0]);
          assert.ok(
            allowed.has(value),
            `leaked ${value} on day ${day}: ${text}`
          );
        }
        assert.ok(
          !text.includes(formatWind(level.windBase)),
          `leaked the wind on day ${day}: ${text}`
        );
      }
    }
  });
});

describe('the result headline', () => {
  it('never tells the only player of the day they are in the top 100%', () => {
    // True, and unreadable. The first shot of a day is worth naming for what it
    // is rather than dressing as a percentile.
    assert.equal(standingHeadline(1, 1), 'FIRST SHOT TODAY');
    assert.ok(!standingHeadline(1, 1).includes('%'));
  });

  it('shows a rank while the field is small', () => {
    // A percentile of two players is a rank wearing a disguise: "TOP 50.0%"
    // says less than "#2 today" and sounds worse.
    assert.equal(standingHeadline(1, 2), '#1 TODAY');
    assert.equal(standingHeadline(2, 2), '#2 TODAY');
    assert.equal(standingHeadline(3, 3), '#3 TODAY');
    assert.equal(standingHeadline(7, 20), '#7 TODAY');

    for (let total = 2; total < PERCENTILE_MIN_PLAYERS; total++) {
      for (const rank of [1, Math.ceil(total / 2), total]) {
        assert.ok(
          !standingHeadline(rank, total).includes('%'),
          `a percentile leaked at ${rank}/${total}`
        );
      }
    }
  });

  it('switches to the percentile once the crowd can support one', () => {
    assert.equal(
      standingHeadline(1, PERCENTILE_MIN_PLAYERS),
      `TOP ${(100 / PERCENTILE_MIN_PLAYERS).toFixed(1)}% TODAY`
    );
    assert.equal(standingHeadline(184, 4381), 'TOP 4.2% TODAY');
    assert.equal(standingHeadline(4381, 4381), 'TOP 100.0% TODAY');
  });

  it('changes over exactly once, at the threshold', () => {
    const isPercent = (total: number): boolean =>
      standingHeadline(1, total).includes('%');
    assert.equal(isPercent(PERCENTILE_MIN_PLAYERS - 1), false);
    assert.equal(isPercent(PERCENTILE_MIN_PLAYERS), true);
    // ...and stays a percentile from there on.
    for (let total = PERCENTILE_MIN_PLAYERS; total < 400; total += 7) {
      assert.ok(isPercent(total));
    }
  });

  it('drops the separate rank line while the headline is already a rank', () => {
    assert.equal(showsGlobalRank(1), false);
    assert.equal(showsGlobalRank(2), false);
    assert.equal(showsGlobalRank(PERCENTILE_MIN_PLAYERS - 1), false);
    assert.equal(showsGlobalRank(PERCENTILE_MIN_PLAYERS), true);
    assert.equal(showsGlobalRank(4381), true);
  });

  it('formats a large rank with thousands separators', () => {
    assert.equal(rankTodayLine(4102), '#4,102 TODAY');
  });

  it('is safe on an empty or impossible board', () => {
    assert.equal(standingHeadline(0, 0), 'FIRST SHOT TODAY');
    assert.equal(standingHeadline(1, 0), 'FIRST SHOT TODAY');
  });
});
