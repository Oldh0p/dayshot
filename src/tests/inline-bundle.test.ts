import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

/**
 * The feed card's two hard rules, enforced against the tree and the build
 * rather than against good intentions.
 *
 * 1. **Nothing that can throw a shot may reach the feed.** Not the simulation,
 *    not the game's state machine, not the audio engine, not a hold handler.
 *    The risk is not that someone adds `simulateLevel()` to the card on
 *    purpose; it is that a helper is imported for one innocent function and
 *    drags the module graph behind it.
 * 2. **The feed's payload stays under budget.** §4.6 sets 60 KB gzip. Phase 0
 *    measured the old React splash at ~70.5 KB — over budget before a single
 *    pixel was drawn, because the React runtime chunk alone is 65 KB. That is
 *    why the card is plain DOM, and this test is what keeps it that way.
 */

const CLIENT = resolve(
  new URL('../client', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
);
const DIST = resolve(
  new URL('../../dist/client', import.meta.url).pathname.replace(
    /^\/([A-Za-z]:)/,
    '$1'
  )
);

const BUDGET_BYTES = 60 * 1024;

/**
 * Everything the feed must not reach, and why each one matters. Matched on the
 * resolved path, so a re-export cannot smuggle one in.
 */
const FORBIDDEN: ReadonlyArray<readonly [string, string]> = [
  ['shared/sim.ts', 'the simulation: the feed would know the day’s answer'],
  ['client/machine.ts', 'the game state machine: nothing in the feed may hold a phase'],
  ['client/audio.ts', 'the audio engine: §4.5 forbids sound in the feed outright'],
  ['client/scene/useScene.ts', 'the hold handlers: a shot must be impossible here'],
  ['client/App.tsx', 'the whole game'],
  ['client/queue.ts', 'the submission queue'],
];

/** Bare specifiers the feed may not pull in. */
const FORBIDDEN_PACKAGES = ['react', 'react-dom', 'react/jsx-runtime'];

const IMPORT_RE = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;

/** Follows relative imports from an entry and returns every file reachable. */
const importGraph = (entry: string): { files: string[]; packages: string[] } => {
  const seen = new Set<string>();
  const packages = new Set<string>();
  const queue = [entry];

  while (queue.length > 0) {
    const file = queue.pop();
    if (!file || seen.has(file) || !existsSync(file)) continue;
    seen.add(file);

    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(IMPORT_RE)) {
      const spec = match[1]!;
      if (!spec.startsWith('.')) {
        // CSS side-effect imports are not packages; anything else bare is.
        if (!spec.endsWith('.css')) packages.add(spec);
        continue;
      }
      if (spec.endsWith('.css')) continue;
      queue.push(resolve(dirname(file), spec));
    }
  }
  return { files: [...seen], packages: [...packages] };
};

describe('the feed bundle cannot reach the game', () => {
  const graph = importGraph(join(CLIENT, 'inline', 'main.ts'));

  it('reaches nothing that could throw a shot', () => {
    for (const [suffix, why] of FORBIDDEN) {
      const offender = graph.files.find((f) =>
        f.replace(/\\/g, '/').endsWith(suffix)
      );
      assert.equal(
        offender,
        undefined,
        `the feed card imports ${suffix} — ${why}`
      );
    }
  });

  it('pulls in no React', () => {
    for (const pkg of FORBIDDEN_PACKAGES) {
      assert.ok(
        !graph.packages.includes(pkg),
        `the feed card imports ${pkg}; the runtime chunk alone is 65 KB gzip ` +
          `against a ${BUDGET_BYTES / 1024} KB budget`
      );
    }
  });

  it('reaches only what a card needs', () => {
    // A whitelist rather than a count: the interesting regression is a new
    // dependency nobody looked at, not the graph growing by one file.
    const allowed = [
      'client/inline/',
      'client/scene/pip.ts',
      'client/theme.ts',
      'client/motion.ts',
      'client/ui/tokens.ts',
      // Path data only. `Glyph.tsx` is the React renderer and is deliberately
      // not reachable from here: the shapes are shared, the renderer is not.
      'client/ui/glyphs.ts',
      'shared/copy.ts',
      'shared/types.ts',
      'shared/tunables.ts',
    ];
    for (const file of graph.files) {
      const rel = file.replace(/\\/g, '/');
      assert.ok(
        allowed.some((a) => rel.includes(a)),
        `unexpected module in the feed graph: ${rel}`
      );
    }
  });
});

/**
 * Reads the built card rather than guessing from source. Skipped only when
 * there is no build to read, and it says so loudly rather than passing quietly.
 */
describe('the feed bundle stays under budget', () => {
  const splash = join(DIST, 'splash.html');

  it('loads less than 60 KB gzip, font included', (t) => {
    if (!existsSync(splash)) {
      t.diagnostic('no dist/client — run `npm run build` to check the budget');
      return;
    }

    const html = readFileSync(splash, 'utf8');
    const assets = [...html.matchAll(/(?:src|href)="\/([^"]+)"/g)].map(
      (m) => m[1]!
    );
    assert.ok(assets.length > 0, 'splash.html loads nothing at all');

    const sizes = assets.map((asset) => {
      const file = join(DIST, asset);
      return {
        asset,
        gz: existsSync(file) ? gzipSync(readFileSync(file)).length : 0,
      };
    });

    // The font is not referenced from the HTML but is fetched by the CSS, and
    // it is the single largest thing the card downloads. Counting the payload
    // without it would be measuring the wrong number.
    const fonts = join(DIST, 'fonts');
    const fontBytes = existsSync(fonts)
      ? readdirSync(fonts)
          .filter((f) => f.endsWith('.woff2'))
          .reduce((sum, f) => sum + statSync(join(fonts, f)).size, 0)
      : 0;

    const total = sizes.reduce((sum, s) => sum + s.gz, 0) + fontBytes;
    const detail = sizes
      .map((s) => `${s.asset} ${s.gz}`)
      .concat(`fonts ${fontBytes}`)
      .join(', ');

    assert.ok(
      total <= BUDGET_BYTES,
      `feed payload ${total} bytes exceeds ${BUDGET_BYTES} (${detail})`
    );
  });
});
