import './inline.css';

import { context, requestExpandedMode } from '@devvit/web/client';

import { COPY, formatCountdown, MODIFIER_LABEL } from '../../shared/copy.ts';
import type { ModifierId, StateResponse } from '../../shared/types.ts';
import { InlineScene, type SceneMode } from './scene-lite.ts';
import { anonymousCard, cardFor, msToRollover, type FeedCard } from './states.ts';

/**
 * The feed card (§4).
 *
 * **No React, and that is a budget decision, not a taste one.** Measured in
 * phase 0: the React runtime chunk is 65 KB gzip on its own, against a 60 KB
 * ceiling for everything the feed loads — and the font already spends 22 KB of
 * it. This file is a canvas, four text nodes and a button; JSX buys nothing
 * here worth 65 KB.
 *
 * **What must never appear in this module or anything it imports:** the
 * simulation, the game's state machine, the audio engine, or a hold handler. No
 * shot can be thrown from the feed — the only interactive elements are buttons,
 * and every one of them opens expanded mode. `src/tests/inline-bundle.test.ts`
 * enforces that by reading the built file rather than trusting this comment.
 */

// -- modifier glyphs ---------------------------------------------------------

/**
 * Seven monochrome glyphs, because §3 refuses system emoji in the UI: they
 * render differently on every OS, and the modifier is the one thing a stranger
 * should be able to read at a glance. Phase 6 gives them their full treatment
 * alongside the atmospheres; these are the shapes.
 */
const GLYPH: Record<ModifierId, string> = {
  CLEAR: '<path d="M8 2v3M8 11v3M2 8h3M11 8h3M4.5 4.5l2 2M11.5 4.5l-2 2M4.5 11.5l2-2M11.5 11.5l-2-2"/>',
  CROSSWIND: '<path d="M2 5h9M2 8h12M2 11h7"/><path d="M9 2.5 11.5 5 9 7.5"/>',
  TAILWIND: '<path d="M2 8h11"/><path d="M9.5 4.5 13 8l-3.5 3.5"/>',
  GUSTY: '<path d="M2 5h6l2 2-2 2h4M2 11h5"/>',
  MOON: '<path d="M11 3a5.5 5.5 0 1 0 2 6 4.5 4.5 0 0 1-2-6z"/>',
  TINY: '<circle cx="7" cy="7" r="4"/><path d="M10 10l4 4"/>',
  LONG: '<path d="M2 8h10"/><path d="M6 4.5 9.5 8 6 11.5M9.5 4.5 13 8l-3.5 3.5"/>',
};

const glyph = (modifier: ModifierId): string =>
  `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GLYPH[modifier]}</svg>`;

// -- metrics -----------------------------------------------------------------

/**
 * Fire-and-forget, and never allowed to matter: a card that fails to draw
 * because a counter did not send would be a worse trade than a missing number.
 */
const track = (name: string): void => {
  void fetch('/api/analytics', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  }).catch(() => undefined);
};

/**
 * One impression per session per post. A feed card mounts every time it scrolls
 * back into view; counting those would measure scrolling, not reading, and the
 * launch rate §17 is built on would be meaningless.
 */
const trackImpressionOnce = (): void => {
  /*
   * `context?.` and not `context.`: outside Devvit the import is undefined, and
   * an unguarded read throws *before* the state fetch, leaving the anonymous
   * card on screen forever. That is exactly how this was found -- the harness
   * card rendered a scene and no proof line, and the fetch had never run. In
   * production it would work; locally it made the card unverifiable, which is
   * worse than a missing counter.
   */
  const key = `dayshot:seen:${context?.postId ?? 'unknown'}`;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
  } catch {
    // Private mode or blocked storage: count it rather than lose it entirely.
  }
  track('inline_view');
};

// -- DOM ---------------------------------------------------------------------

/*
 * A declaration, not an arrow. `const el = <K extends ...>` parses as JSX in
 * this toolchain and fails the build; the function form is unambiguous.
 */
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const expand = (event: MouseEvent, entry: string, metric: string): void => {
  track(metric);
  requestExpandedMode(event, entry);
};

const render = (card: FeedCard): void => {
  const root = document.getElementById('root');
  if (!root) return;
  root.replaceChildren();

  const wrap = el('div', 'card');
  const canvas = el('canvas', 'scene');
  const layer = el('div', 'layer');

  // -- top row
  const top = el('div', 'top');
  const brand = el('div', 'wordmark');
  brand.textContent = COPY.title;
  if (card.displayDay !== null) {
    const stamp = el('span', 'stamp', ` #${card.displayDay}`);
    brand.appendChild(stamp);
  }
  const chips = el('div', 'chips');
  const modChip = el('span', 'chip');
  modChip.innerHTML = glyph(card.modifier);
  modChip.appendChild(document.createTextNode(MODIFIER_LABEL[card.modifier]));
  chips.appendChild(modChip);

  const streakChip =
    card.state.kind === 'A' ? null : card.state.streakChip;
  if (streakChip) chips.appendChild(el('span', 'chip streak', streakChip));

  top.append(brand, chips);

  // -- bottom stack
  const bottom = el('div', 'bottom');
  const stack = el('div', 'stack');

  if (card.state.kind === 'C') {
    stack.appendChild(el('p', 'proof', card.state.summary));

    const ghosts = el('div', 'ghosts');
    const practice = el('button', 'ghost', COPY.practice);
    practice.type = 'button';
    /*
     * Both open `game`, not a deep link.
     *
     * The schema allows a query string in an entrypoint's `entry`, so
     * `game.html?screen=board` looked like the documented route. It is not
     * buildable: the Devvit vite plugin feeds every entrypoint's `entry` to
     * rolldown as an input path verbatim, query string included, and the build
     * fails looking for a file called `game.html?screen=board`. Measured, not
     * assumed -- it is what the parse error names.
     *
     * A player in state C has already shot, so the game opens on their result,
     * one tap from both screens. Phase 5 is where screen routing gets touched
     * anyway; a separate HTML entry per screen belongs there, not here, and not
     * while the app is waiting on review.
     */
    practice.addEventListener('click', (e) => expand(e, 'game', 'expand_click'));
    const board = el('button', 'ghost', COPY.viewBoard);
    board.type = 'button';
    board.addEventListener('click', (e) => expand(e, 'game', 'leaderboard_open'));
    ghosts.append(practice, board);

    const countdown = el('p', 'micro');
    const tick = (): void => {
      const left = msToRollover(card.state.kind === 'C' ? card.state.countdownFrom : 0);
      countdown.textContent = `Next shot in ${formatCountdown(left)}`;
    };
    tick();
    // The clock the card was built with, advanced locally. One tick a second on
    // a static card is the cheapest honest countdown there is.
    const started = Date.now();
    const base = card.state.countdownFrom;
    window.setInterval(() => {
      const left = msToRollover(base + (Date.now() - started));
      countdown.textContent = `Next shot in ${formatCountdown(left)}`;
    }, 1000);

    bottom.append(stack, ghosts, countdown);
  } else {
    if (card.state.proof) stack.appendChild(el('p', 'proof', card.state.proof));
    stack.appendChild(el('p', 'micro', COPY.feedMicro));

    const cta = el('button', 'cta', COPY.feedCta);
    cta.type = 'button';
    cta.addEventListener('click', (e) => expand(e, 'game', 'expand_click'));

    bottom.append(stack, cta);
  }

  layer.append(top, bottom);
  wrap.append(canvas, layer);
  root.appendChild(wrap);

  const mode: SceneMode =
    card.state.kind === 'C'
      ? { kind: 'landed', signedDx: card.state.signedDx }
      : { kind: 'idle' };

  const scene = new InlineScene({
    canvas,
    modifier: card.modifier,
    mode,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  });
  scene.start();
  window.addEventListener('resize', () => scene.resize());
};

// -- boot --------------------------------------------------------------------

/**
 * One call, and a card either way.
 *
 * A feed card that shows a spinner or an error has failed at its only job. If
 * the state call does not answer, the anonymous card is still true: a scene, a
 * modifier we do not yet know, and an honest CTA that claims nothing about the
 * viewer.
 */
const boot = async (): Promise<void> => {
  render(anonymousCard());
  trackImpressionOnce();

  try {
    const response = await fetch('/api/state');
    if (!response.ok) return;
    render(cardFor((await response.json()) as StateResponse));
  } catch {
    // Keep the anonymous card already on screen.
  }
};

void boot();
