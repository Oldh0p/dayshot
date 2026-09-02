import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { pipMoodFor, type PipMood } from '../client/scene/pip.ts';
import { verdictFor, type Verdict } from '../shared/copy.ts';
import { scoreForDx } from '../shared/sim.ts';
import { TARGET_R } from '../shared/tunables.ts';

/**
 * The mascot and the verdict word sit on the same screen, a centimetre apart.
 * If they disagree the player believes the face, and the face is the thing with
 * no test behind it — which is exactly how the old rig ended up doing a pleased
 * landing under `NEAR MISS`: it read `score >= 87`, a threshold that meant "on
 * the mat" under the previous scoring curve and means "a decent miss" under
 * this one.
 *
 * So the face is derived from the verdict, and this is what holds them together.
 */

const ALL_VERDICTS: readonly Verdict[] = [
  'PERFECT',
  'BULLSEYE',
  'SO CLOSE',
  'ON THE MAT',
  'NEAR MISS',
  'NOT BAD',
  'ROUGH LANDING',
  'SCENIC ROUTE',
  'OFF THE MAP',
  'INTO THE WALL',
];

describe('how Pip takes the news (§8)', () => {
  it('has a face for every verdict', () => {
    for (const verdict of ALL_VERDICTS) {
      assert.ok(pipMoodFor(verdict), `${verdict} has no face`);
    }
  });

  it('matches §8 exactly', () => {
    const table: ReadonlyArray<readonly [Verdict, PipMood]> = [
      ['PERFECT', 'bliss'],
      ['BULLSEYE', 'star'],
      ['SO CLOSE', 'peek'],
      ['ON THE MAT', 'bright'],
      ['NEAR MISS', 'deadpan'],
      ['NOT BAD', 'deadpan'],
      ['ROUGH LANDING', 'dazed'],
      ['SCENIC ROUTE', 'dazed'],
      ['OFF THE MAP', 'dazed'],
      ['INTO THE WALL', 'dazed'],
    ];
    for (const [verdict, mood] of table) {
      assert.equal(pipMoodFor(verdict), mood, verdict);
    }
  });

  it('never celebrates a shot the word calls a miss', () => {
    // The regression the old threshold caused, stated as a rule rather than a
    // number: whatever the curve does next, a miss must not get a hop.
    const celebrations: PipMood[] = ['bliss', 'star', 'bright'];
    for (const verdict of ALL_VERDICTS) {
      if (/MISS|ROUGH|SCENIC|OFF THE MAP|INTO THE WALL/.test(verdict)) {
        assert.ok(
          !celebrations.includes(pipMoodFor(verdict)),
          `${verdict} gets ${pipMoodFor(verdict)}`
        );
      }
    }
  });

  it('reacts to a real shot the same way the panel reads it', () => {
    // Walking the mat outward: the face has to change over exactly where the
    // word does, because they are the same decision.
    for (let dx = 2; dx < 400; dx += 6) {
      const verdict = verdictFor({
        score: scoreForDx(dx, TARGET_R),
        dx,
        impact: dx <= TARGET_R ? 'MAT' : 'GROUND',
        targetR: TARGET_R,
      });
      const mood = pipMoodFor(verdict);
      const onTheMat = dx <= TARGET_R;
      if (onTheMat) {
        assert.ok(
          ['bliss', 'star', 'peek', 'bright'].includes(mood),
          `dx ${dx} is on the mat and Pip is ${mood}`
        );
      } else {
        assert.ok(
          !['bliss', 'star'].includes(mood),
          `dx ${dx} is off the mat and Pip is ${mood}`
        );
      }
    }
  });

  it('has all twelve of §8, and no two collapsed into one', () => {
    // Six faces come from the verdict bands and six from game states. §8
    // promises twelve expressions; if the count drops, two have merged and the
    // mascot's range is smaller than the spec claims.
    const fromVerdicts = new Set(ALL_VERDICTS.map(pipMoodFor));
    const fromStates: PipMood[] = ['idle', 'blink', 'glance', 'fear', 'flight', 'squint'];
    const all = new Set([...fromVerdicts, ...fromStates]);
    assert.equal(all.size, 12, [...all].join(', '));
    // `deadpan` covers two bands and `dazed` four: §8's own grouping, so ten
    // verdicts map onto six faces.
    assert.equal(fromVerdicts.size, 6);
  });
});
