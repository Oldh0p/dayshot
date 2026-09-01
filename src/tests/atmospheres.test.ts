import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ATMOSPHERE, paletteFor } from '../client/theme.ts';
import { COLOR } from '../client/ui/tokens.ts';
import { MODIFIER_GLYPH } from '../client/ui/glyphs.ts';
import { MODIFIER_WEIGHTS } from '../shared/tunables.ts';
import type { ModifierId } from '../shared/types.ts';

/**
 * §11 gives seven skies as hex pairs and §13 gives a nine-colour palette. Both
 * are the kind of decision that erodes one plausible edit at a time: a day that
 * "needs a bit more contrast", an accent that "reads better in the gauge". The
 * point of pinning them is not that these exact values are sacred — it is that
 * changing one should be a decision, not a drift.
 */

const MODIFIERS = MODIFIER_WEIGHTS.map(([id]) => id);

/** Straight from §11's table. */
const SPEC_SKIES: Record<ModifierId, readonly [string, string]> = {
  CLEAR: ['#1E3A5C', '#0D1626'],
  CROSSWIND: ['#2B3D52', '#0F1A28'],
  TAILWIND: ['#3A2F4F', '#0D1626'],
  GUSTY: ['#26364A', '#0D1626'],
  MOON: ['#2A2657', '#120F2A'],
  TINY: ['#1E3A5C', '#0D1626'],
  LONG: ['#1B3350', '#0A0F1A'],
};

describe('the seven atmospheres (§11)', () => {
  it('gives every modifier the sky the spec names', () => {
    for (const id of MODIFIERS) {
      const palette = paletteFor(id, 0);
      const [top, bottom] = SPEC_SKIES[id];
      assert.equal(palette.skyHigh.toLowerCase(), top.toLowerCase(), `${id} sky top`);
      assert.equal(
        palette.skyLow.toLowerCase(),
        bottom.toLowerCase(),
        `${id} sky bottom`
      );
    }
  });

  it('leaves the action colour to coral on every day', () => {
    // These carried six saturated accents, which gave five different colours
    // the job §13 reserves for one. §11 marks `accent` optional and names it
    // for no modifier: the day is told by the sky, not by recolouring the CTA.
    for (const id of MODIFIERS) {
      assert.equal(
        paletteFor(id, 0).accent.toLowerCase(),
        COLOR.coral.toLowerCase(),
        `${id} recolours the action`
      );
    }
  });

  it('describes an atmosphere and a glyph for each of the seven', () => {
    for (const id of MODIFIERS) {
      const atmosphere = ATMOSPHERE[id];
      assert.ok(atmosphere, `${id} has no atmosphere`);
      assert.ok(
        atmosphere.density > 0 && atmosphere.density <= 1,
        `${id} density ${atmosphere.density} is not a fraction of the budget`
      );
      assert.ok(MODIFIER_GLYPH[id].length > 0, `${id} has no glyph`);
    }
  });

  it('distinguishes the two days that share a sky', () => {
    // Tiny Target reuses Clear Skies' gradient exactly, which is in the spec.
    // What must differ is everything else, or the day is unreadable.
    assert.equal(paletteFor('TINY', 0).skyHigh, paletteFor('CLEAR', 0).skyHigh);
    assert.notDeepEqual(ATMOSPHERE.TINY, ATMOSPHERE.CLEAR);
    assert.notEqual(ATMOSPHERE.TINY.tic, ATMOSPHERE.CLEAR.tic);
  });

  it('keeps a pennant only where the wind is the whole story', () => {
    // §11 puts one on Crosswind and Gusty. A pennant on a calm day is furniture.
    const withPennant = MODIFIERS.filter((id) => ATMOSPHERE[id].pennant);
    assert.deepEqual(withPennant.sort(), ['CROSSWIND', 'GUSTY']);
  });

  it('never lets a day out-glow the Perfect celebration', () => {
    for (const id of MODIFIERS) {
      assert.ok(
        paletteFor(id, 0).targetGlow <= 1,
        `${id} glows past the ceiling §3 reserves for Perfect`
      );
    }
  });
});
