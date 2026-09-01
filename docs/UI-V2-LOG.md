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
