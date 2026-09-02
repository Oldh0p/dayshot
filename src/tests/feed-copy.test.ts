import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  COPY,
  feedPlayedLine,
  feedStreakChip,
  feedWaitingLine,
  socialProofLine,
  standingFor,
  type FeedFacts,
} from '../shared/copy.ts';

/**
 * The feed card is the only surface most people will ever see, and it is the
 * one place a made-up number would be both most tempting and most damaging:
 * a fabricated counter on a post card is an app-review rejection, and §4.3
 * forbids it outright. These tests pin the boundaries of the four rules and
 * then check the property behind all of them — that every figure on the card
 * came from the day's real facts.
 */

const facts = (over: Partial<FeedFacts> = {}): FeedFacts => ({
  shotsToday: 8421,
  yesterdayShots: 31842,
  topScore: 99.98,
  perfectsToday: 12,
  displayDay: 24,
  ...over,
});

describe('feed social proof (§4.3)', () => {
  it('quotes today once the day is big enough', () => {
    assert.equal(
      socialProofLine(facts({ shotsToday: 8421, perfectsToday: 0 })),
      '8,421 shots today · best 99.98'
    );
  });

  it('switches to yesterday exactly at 100 shots', () => {
    const under = socialProofLine(facts({ shotsToday: 99, perfectsToday: 0 }));
    const at = socialProofLine(facts({ shotsToday: 100, perfectsToday: 0 }));
    assert.equal(under, '31,842 shots yesterday · today just opened');
    assert.equal(at, '100 shots today · best 99.98');
  });

  it('replaces the best with Perfects only once the field is large', () => {
    const small = socialProofLine(
      facts({ shotsToday: 999, perfectsToday: 12 })
    );
    const large = socialProofLine(
      facts({ shotsToday: 1000, perfectsToday: 12 })
    );
    assert.match(small, /best 99\.98$/, 'under 1,000 shots the best still wins');
    assert.equal(large, '1,000 shots today · 12 Perfects today');
  });

  it('says Perfect, not Perfects, when there is one', () => {
    assert.match(
      socialProofLine(facts({ shotsToday: 4000, perfectsToday: 1 })),
      /1 Perfect today$/
    );
  });

  it('says the true thing on the first day the game ever runs', () => {
    assert.equal(
      socialProofLine(
        facts({ shotsToday: 0, yesterdayShots: 0, topScore: 0, displayDay: 1 })
      ),
      COPY.feedFirstEver
    );
  });

  it('does not claim a first shot ever on a later quiet day', () => {
    // Day 40 with an empty yesterday is a quiet community, not a launch.
    const line = socialProofLine(
      facts({ shotsToday: 3, yesterdayShots: 0, topScore: 0, displayDay: 40 })
    );
    assert.equal(line, '3 shots today');
    assert.doesNotMatch(line, /first shot ever/);
  });

  it('drops the best when there is no score to quote', () => {
    const line = socialProofLine(
      facts({ shotsToday: 140, topScore: 0, perfectsToday: 0 })
    );
    assert.equal(line, '140 shots today');
    assert.doesNotMatch(line, /best/);
  });

  it('never shows more than two figures', () => {
    for (const f of [
      facts(),
      facts({ shotsToday: 12 }),
      facts({ shotsToday: 0, yesterdayShots: 0, displayDay: 1 }),
      facts({ shotsToday: 5000, perfectsToday: 3 }),
    ]) {
      const numbers = socialProofLine(f).match(/[\d][\d,.]*/g) ?? [];
      assert.ok(numbers.length <= 2, `${socialProofLine(f)} shows ${numbers.length}`);
    }
  });

  it('invents nothing: every figure comes from the day', () => {
    const f = facts({ shotsToday: 8421, perfectsToday: 0 });
    const shown = (socialProofLine(f).match(/[\d][\d,.]*/g) ?? []).map((n) =>
      Number(n.replace(/,/g, ''))
    );
    const real = [f.shotsToday, f.yesterdayShots, f.topScore, f.perfectsToday];
    for (const value of shown) {
      assert.ok(real.includes(value), `${value} is on the card but not in the day`);
    }
  });
});

describe('feed states (§4.4)', () => {
  it('hides the streak chip until it means something', () => {
    assert.equal(feedStreakChip(0), null);
    assert.equal(feedStreakChip(1), null, 'a streak of one says only "you played"');
    assert.equal(feedStreakChip(2), '2 DAY STREAK');
    assert.equal(feedStreakChip(1204), '1,204 DAY STREAK');
  });

  it('carries no emoji, whatever §10.5 draws', () => {
    // §3 refuses system emoji in the UI (they render differently per OS) and
    // phase 10 greps for stragglers; §10.5's table draws a flame anyway. The
    // refusal wins and the flame is a vector glyph, so the string stays clean.
    for (const line of [
      feedStreakChip(7) ?? '',
      socialProofLine(facts()),
      feedWaitingLine(facts()),
      COPY.feedCta,
      COPY.feedMicro,
      COPY.feedFirstEver,
    ]) {
      assert.doesNotMatch(
        line,
        /\p{Extended_Pictographic}/u,
        `emoji in feed copy: ${line}`
      );
    }
  });

  it('tells a returning player the day is waiting and alive', () => {
    assert.equal(
      feedWaitingLine(facts({ perfectsToday: 0 })),
      'Your shot is waiting · 8,421 shots today'
    );
  });

  it('keeps the waiting line to two segments at 360px', () => {
    // It carried the full two-figure proof and truncated on the narrowest
    // card. §4.3's ceiling applies to the line, not to the proof inside it.
    for (const f of [
      facts(),
      facts({ shotsToday: 12 }),
      facts({ shotsToday: 0, yesterdayShots: 0, displayDay: 1 }),
    ]) {
      const segments = feedWaitingLine(f).split(' · ');
      assert.ok(
        segments.length <= 2,
        `${feedWaitingLine(f)} has ${segments.length} segments`
      );
    }
  });

  it('says only that the shot is waiting when there is nothing to add', () => {
    assert.equal(
      feedWaitingLine(facts({ shotsToday: 0, yesterdayShots: 0 })),
      'Your shot is waiting'
    );
  });

  it('phrases the played state exactly as the result screen would', () => {
    // One rank, one phrasing. A player must never meet two wordings of the
    // same standing on two surfaces of the same game.
    const standing = standingFor(1204, 8421).line;
    assert.equal(feedPlayedLine(94.61, standing), `TODAY 94.61 · ${standing}`);

    // Deliberately not pinned to a wording. §10.3 rewrites these lines --
    // `#7 of 12 today`, `You opened the day.`, and no more `FIRST SHOT TODAY`
    // -- in phase 4. The property that must survive that rewrite is this one:
    // the feed says whatever the result screen says, so changing it in one
    // place changes it in both.
    for (const [rank, total] of [
      [1, 1],
      [7, 12],
      [3, 49],
      [1204, 8421],
    ] as const) {
      const standing = standingFor(rank, total).line;
      assert.equal(
        feedPlayedLine(50.06, standing),
        `TODAY 50.06 · ${standing}`,
        `feed and result disagree at rank ${rank} of ${total}`
      );
    }
  });
});
