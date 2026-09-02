import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { soundEnabled } from '../client/storage.ts';

/**
 * Reddit's inline-mode requirements, item 5, "Safe use of sound", in full:
 *
 *   - Audio should not play unless there is a user interaction
 *   - Include a button to mute in your game
 *   - Use the visibilityChange handler to mute any sounds if a user scrolls away
 *
 * Three bullets, and this app satisfied one of them. The other two were the
 * price of turning sound on by default, and they are worth guarding rather than
 * remembering: they sit in the same numbered checklist that rejected version
 * 0.4 for the scroll trap, so the reviewer is demonstrably reading that page.
 *
 * Source-level assertions, like `no-inline-scroll.test.ts`, for the same
 * reason: none of this fails in a way a developer notices. It fails in review.
 */

const src = (path: string): string =>
  readFileSync(
    new URL(`../${path}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
    'utf8'
  );

const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('Reddit audio requirements', () => {
  it('never builds an AudioContext outside a gesture path', () => {
    const code = stripComments(src('client/audio.ts'));
    // The constructor may appear exactly once, inside `ensure()`, which every
    // caller reaches from a pointer or key handler. A second site would almost
    // certainly be a load-time one.
    const constructions = code.match(/new Ctor\(/g) ?? [];
    assert.equal(constructions.length, 1, 'more than one AudioContext site');

    // And nothing may call it at module scope: every `ensure()` in the client
    // must sit inside a function body.
    for (const file of ['client/audio.ts', 'client/App.tsx']) {
      const lines = stripComments(src(file)).split('\n');
      const topLevel = lines.filter((line) => /^(audio\.)?ensure\(/.test(line));
      assert.deepEqual(topLevel, [], `${file} arms audio at module scope`);
    }
  });

  it('puts a mute button in the game, not only in the help sheet', () => {
    const bar = stripComments(src('client/screens/DayBar.tsx'));
    assert.match(bar, /<button/, 'the day bar has no button at all');
    assert.match(bar, /SOUND_ON_GLYPH|SOUND_OFF_GLYPH/, 'no sound glyph');
    assert.match(bar, /onToggleSound/, 'the glyph is not wired to anything');
    assert.match(bar, /aria-pressed/, 'the toggle announces no state');
    // 48px is the hit-target floor the accessibility pass set, and a mute
    // button that cannot be hit is the same as no mute button.
    assert.match(bar, /h-12 w-12/, 'the mute button is under the 48px floor');
  });

  it('mutes on visibilitychange in the game, not just in the feed card', () => {
    const app = stripComments(src('client/App.tsx'));
    assert.match(app, /visibilitychange/, 'the game ignores visibilitychange');
    assert.match(
      app,
      /audio\.setHidden\(document\.hidden\)/,
      'visibilitychange does not reach the audio engine'
    );

    const engine = stripComments(src('client/audio.ts'));
    assert.match(engine, /setHidden\(hidden: boolean\)/, 'no setHidden');
    // Suspending, not only ducking: a suspended context's clock stops, so cues
    // scheduled while hidden cannot all come due at once on return.
    assert.match(engine, /this\.ctx\.suspend\(\)/, 'the context is never suspended');
  });

  it('arms sound by default, even where storage is unavailable', () => {
    // In Node there is no `window`, so every read throws and returns null --
    // which is also a browser with storage disabled. Sound must still be on.
    assert.equal(soundEnabled(), true);
  });

  it('keeps the feed card silent', () => {
    // Belt and braces over `inline-bundle.test.ts`: the rule the feed must obey
    // is not "quiet", it is "cannot make noise".
    const inline = ['main.ts', 'scene-lite.ts', 'states.ts']
      .map((f) => src(`client/inline/${f}`))
      .join('\n');
    assert.doesNotMatch(inline, /audio\.ts|AudioContext|from '\.\.\/audio/);
  });
});
