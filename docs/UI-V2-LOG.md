# UI V2 — phase log

Five lines per phase: done, verified, left. Newest at the bottom.

---

## Phase 0 — Baseline

- **Done.** Baseline measured green (240 tests / 51 suites, type-check, lint,
  build). Wrote `docs/ARCHITECTURE-UI.md` from the tree, not from the spec.
  Built `tools/qa/capture.mjs`, a dependency-free CDP screenshot driver, and
  captured 14 "before" states into `docs/qa/before/`.
- **Verified.** Every capture reports its measured viewport and whether the
  document scrolls; all 14 came back at the exact requested size with no
  `SCROLLS-X` / `SCROLLS-Y`, which independently re-confirms the in-line scroll
  fix at 360×640 and 390×720.
- **Found, and it changes the plan.** The inline view already costs **≈70.5 KB
  gzip** because `splash.tsx` is React and pulls the shared runtime chunk
  (65 KB on its own). The spec's budget is 60 KB, so the inline bundle has to be
  **React-free** — plain DOM plus canvas. Decided now rather than discovered in
  phase 2.
- **Found, smaller.** The `splash`/`game` entrypoint pair and
  `requestExpandedMode` that §4.1 proposes adding **already exist**; `camera.ts`,
  `particles.ts` and `pip.ts` that §18 calls new **already exist**; and no font
  is bundled at all, so phase 1's typography is a visible change, not the
  invisible one the spec expects. All four are recorded as §18 deviations.
- **Left.** Two states cannot be captured yet: `hold` and `flight` need a
  running `requestAnimationFrame`, which is paused whenever the preview pane is
  hidden. Phase 3 should add a deterministic replay hook rather than fight it.

---

## Phase 1 — Foundations

- **Done.** `src/client/ui/tokens.ts` holds §13 exactly — nine colours, six type
  roles, spacing, radii, control heights, strokes, durations, easings, particle
  budgets, breakpoints — mirrored into `index.css` for Tailwind and the canvas.
  Space Grotesk ships from `public/fonts/` (22.3 KB, OFL, licence included).
  `theme.ts`, `pip.ts` and `particles.ts` now read colours from tokens; no hex
  literal survives outside `tokens.ts` and the per-modifier palette table.
- **Verified.** 247 tests (240 + 7 new), build and lint clean, and all 14 QA
  captures re-taken with zero `SCROLLS-X` / `SCROLLS-Y`. `tokens.test.ts`
  asserts the CSS mirror against the TypeScript source so the two cannot drift.
- **Measured rather than assumed.** `node tools/qa/font-check.mjs` loads the
  real bundle: the face applies, `tabular-nums` collapses the digit spread from
  19.61px to **0px per 100px em**, and a digit advances **0.62em** — the exact
  figure §13 guessed for its fallback. **No fixed-box fallback is needed.**
- **Two deliberate pixel changes**, both spec-mandated and both sub-perceptual:
  text on coral moved from `#141A26` to the `bg` token per §13, and Pip's pupils
  moved to `ground` for the same reason. One fewer almost-black in the palette.
- **One regression found and contained.** Space Grotesk is wider than the system
  font this shipped with, so `Practice · Copy card · Leaderboard` wrapped at
  390px — the §1.2 layout bug, surfaced by the font. §6 removes those words
  entirely in phase 4; until then the row is `nowrap` with a tighter gap, which
  fits at 360px. **Left:** the contrast audit table (phase 9) can now be
  generated from `tokens.test.ts` rather than written by hand.

---

## Phase 2 — The in-line feed view

- **Done.** `src/client/inline/` replaces the empty gradient with the game's own
  scene: theme sky, drifting particles (capped at 24), two ground bands, the
  launcher, the plateau, the mat with its halo, a decorative dotted arc, and the
  game's real `drawPip` — so the card and the game are the same picture. States
  A/B/C from §4.4 come from one `/api/state` call, the social proof follows
  §4.3, the CTA is `TAKE YOUR ONE SHOT`, and the 6-second ambient loop runs at
  30fps and stops on `IntersectionObserver` **and** `visibilitychange`.
- **Verified.** 266 tests. **Feed payload 35 284 bytes against a 61 440 budget**
  — down from ~70 500 — with four tests reading the built file rather than the
  source: no `sim.ts`, no state machine, no audio, no hold handler, no React,
  and a whitelist so a new dependency cannot arrive unnoticed. 20 captures, zero
  scroll, verified at 360×350, 360×512, 700×512 and 390×720.
- **The spec's route parameter is not buildable, and that is measured.** The
  schema allows a query string in an entrypoint's `entry`, so
  `game.html?screen=board` looked documented. The Devvit vite plugin feeds every
  `entry` to rolldown as an input path verbatim, and the build fails looking for
  a file of that name. State C's buttons open `game` — a player there has
  already shot, so it opens on their result, one tap from both screens. Routing
  moves to phase 5, which touches screens anyway.
- **Two platform answers from the installed schema, not the guide.**
  `inline: true` is deprecated and has no effect ("inline is always implied"),
  so §18's instruction is obsolete; and **no static splash fallback exists** —
  there is no `splash`, `preview`, `fallback` or `thumbnail` field anywhere in
  the config schema, so that Phase 2 task is answered in the negative.
- **Three bugs found by looking rather than by reasoning**, all invisible in
  source: `#root` had no height (the card collapsed to 115px, because
  `splash.html` carried Tailwind classes into a bundle that does not load
  Tailwind); `context.postId` threw outside Devvit and killed the state fetch
  before it started, exactly as `context.postData` did in phase 0; and a stale
  harness process kept port 5599, so captures were taken against code from
  before the flag they were testing. The capture rig now refuses to run against
  a server it did not start. **Left:** the plateau still reads as a dark block
  and Pip's face is the game's old rig — phases 6 and 7.

---

## Phase 3 — Game scene (part 1 of 2: performance and framing)

- **Done.** Sky bitmap cached at device resolution; the trail batched from forty
  stroke calls into five bands and its per-frame `slice()` removed; the camera
  now reserves §5's bottom band so the conditions and the aim pill stop being
  drawn over the mat; `One official shot. No retries.` added under the pill,
  shown once and only for the shot it is true of. The harness derives the day's
  modifier from the seed instead of hardcoding one.
- **Verified by measurement, and the measurement led.** `tools/qa/perf.mjs` and
  `tools/qa/profile.mjs` were built before any refactor, because the gate is a
  frame-time number. **4x CPU: aiming 1 → 0 dropped frames, flight 17 → 2. 6x
  CPU: aiming 88 → 3, flight 78 → 13, and the game moves from 30fps to a held
  60.** Idle time in a throttled flight frame went from 0.4% to 37.6%.
- **The profile overruled the plan twice.** The trail *looked* like the cost and
  batching it bought three frames of seventeen; the profile then showed **88% of
  the frame in `(program)`** — the compositor — against ~8% for all JavaScript,
  which is what pointed at the sky. And the first cache made things *worse*
  (53 dropped frames against 1) by storing CSS pixels that the DPR transform
  resampled on every blit.
- **Two answers already in the tree.** DPR is already clamped to 2 in
  `useScene`, so that Phase 3 item was done before it was asked for; and the
  capture rig gained clipping detection, which immediately corrected a visual
  read of mine — `HOLD TO AIM` looked cut off in a screenshot and measures as
  fully inside the frame. Twenty captures, zero scroll, zero clipping.
- **Left, and it is the other half of phase 3:** `themes.ts` with §11's seven
  atmospheres and the vector modifier glyphs that replace the emoji still in the
  day bar and the pill; the 1.2s opening sequence; and the hold/release feel
  (squash, vignette, particles at 0.6x, shrinking pupils, freeze-and-stretch).
