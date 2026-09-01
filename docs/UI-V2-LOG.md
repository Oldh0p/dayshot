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
