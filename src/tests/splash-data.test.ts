import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseSplashData } from '../client/splash-data.ts';

/**
 * The feed card is the only surface a scrolling reader ever sees, so what it
 * omits matters as much as what it shows.
 */
describe('splash data', () => {
  it('reads a post created by the daily handler', () => {
    const data = parseSplashData({
      dayNumber: 20697,
      displayDay: 1,
      rerollK: 0,
      modifier: 'CROSSWIND',
      modifierLabel: 'Crosswind',
      modifierEmoji: '🌬️',
    });

    assert.equal(data.displayDay, 1);
    assert.equal(data.modifier, 'CROSSWIND');
    assert.equal(data.modifierLabel, 'Crosswind');
  });

  it('tells a missing day number apart from a pre-launch one', () => {
    // Two states that used to render identically. A card with no data must not
    // invent a number; a card from before LAUNCH_DAY must show the one it has,
    // because the post title alongside it already does.
    assert.equal(parseSplashData({}).displayDay, null);
    assert.equal(parseSplashData(undefined).displayDay, null);
    assert.equal(parseSplashData({ displayDay: 0 }).displayDay, 0);
    assert.equal(parseSplashData({ displayDay: -4 }).displayDay, -4);
  });

  it('survives anything at all in postData', () => {
    for (const junk of [null, 'nope', 42, [], { modifier: 'NONSENSE' }]) {
      const data = parseSplashData(junk);
      assert.equal(data.modifier, 'CLEAR');
      assert.ok(data.modifierLabel.length > 0);
      assert.equal(data.displayDay, null);
    }
  });

  it('carries no counter, because at 00:00 UTC the count is zero', () => {
    // "0 shots so far" is not an invitation. The card is the day, the modifier
    // and one instruction; the world's shot count belongs inside the game.
    const data = parseSplashData({ displayDay: 12, modifier: 'MOON' });
    assert.deepEqual(Object.keys(data).sort(), [
      'displayDay',
      'modifier',
      'modifierEmoji',
      'modifierLabel',
    ]);
  });
});
