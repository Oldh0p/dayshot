import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Reddit's review rules forbid a scrolling web view inside a post outright: a
 * scroll there competes with the feed's own gestures, so a swipe meant for
 * Reddit gets eaten by the game. Version 0.4 was rejected for exactly this --
 * the result screen stacked the verdict and a ten-row leaderboard, which does
 * not fit a post-sized viewport, and the panel scrolled.
 *
 * The fix was structural: the board became a page reached with a button, and
 * `index.css` locks the document. This test guards the rule itself, because the
 * failure is invisible in a desktop browser and only shows up in review, days
 * later. A scrollable container reads as a perfectly reasonable line of code.
 */

const CLIENT = new URL('../client/', import.meta.url).pathname.replace(
  /^\/([A-Za-z]:)/,
  '$1'
);

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(tsx?|css|html)$/.test(entry.name) ? [full] : [];
  });

/** Comments explain the rule and must not be mistaken for breaking it. */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const SCROLLERS =
  /overflow-(?:y-|x-)?(?:auto|scroll)|overflow\s*:\s*(?:auto|scroll)/;

describe('no in-line scroll trap', () => {
  it('has no scrollable container anywhere in the client', () => {
    const offenders = sourceFiles(CLIENT)
      .map((file) => ({
        file,
        code: stripComments(readFileSync(file, 'utf8')),
      }))
      .filter(({ code }) => SCROLLERS.test(code))
      .map(({ file, code }) => `${file}: ${SCROLLERS.exec(code)?.[0]}`);

    assert.deepEqual(
      offenders,
      [],
      `Reddit rejects apps whose in-line web view scrolls. Lay the screen out to\n` +
        `fit, or reach the overflow with a button as the leaderboard does.\n` +
        offenders.join('\n')
    );
  });

  it('locks the document itself, whichever entrypoint is served', () => {
    const css = readFileSync(join(CLIENT, 'index.css'), 'utf8');
    const root = /html,\s*body,\s*#root\s*\{[\s\S]*?\}/.exec(css)?.[0] ?? '';
    assert.match(
      root,
      /overflow:\s*hidden/,
      'html, body and #root must not scroll: a screen that outgrows the ' +
        'viewport has to be redesigned, never scrolled.'
    );
  });
});

/**
 * The second rejection, which was the same rule and a different failure.
 *
 *   > it looks like the scroll trap is still there in the latest version under
 *   > review. Once I scroll into the game post, my mouse gets stuck.
 *
 * Nothing inside the card scrolls -- that was fixed and is guarded above. What
 * the report describes is the other half of the rule: Devvit's inline
 * requirements say "users must be able to scroll past your post naturally",
 * and a post can break that without scrolling at all, by refusing to pass the
 * gesture on.
 *
 * Two declarations can do it, and both were present.
 */
const stripHtmlComments = (source: string): string =>
  source.replace(/<!--[\s\S]*?-->/g, '');

describe('the feed can still be scrolled past', () => {
  const css = (path: string): string =>
    stripComments(
      readFileSync(
        new URL(`../client/${path}`, import.meta.url).pathname.replace(
          /^\/([A-Za-z]:)/,
          '$1'
        ),
        'utf8'
      )
    );

  it('never suppresses scroll chaining', () => {
    /*
     * `overscroll-behavior: none` has exactly one possible effect in a document
     * that cannot scroll: stopping the wheel or swipe from reaching the feed
     * behind it. There is no legitimate use for it on either surface.
     */
    for (const file of ['index.css', 'inline/inline.css']) {
      assert.doesNotMatch(
        css(file),
        /overscroll-behavior\s*:\s*(none|contain)/,
        `${file} suppresses scroll chaining`
      );
    }
  });

  it('does not take zoom away from the inline card', () => {
    /*
     * "No zoom or pan interference" sits in the same numbered requirement as
     * the scroll rules. The expanded game may lock the viewport -- it is a
     * gesture surface the player chose to open -- but the card in the feed may
     * not.
     */
    // HTML comments too: the note explaining why these are absent names them.
    const splash = stripHtmlComments(
      readFileSync(
        new URL('../client/splash.html', import.meta.url).pathname.replace(
          /^\/([A-Za-z]:)/,
          '$1'
        ),
        'utf8'
      )
    );
    assert.doesNotMatch(splash, /user-scalable\s*=\s*no/);
    assert.doesNotMatch(splash, /maximum-scale/);
  });
});
