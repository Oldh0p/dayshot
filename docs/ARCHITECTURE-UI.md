# DAYSHOT — UI architecture, as it actually is

Written in phase 0 of the UI redesign (`DAYSHOT-UI-REDESIGN.md`), before any
change, so that later phases argue with the repository rather than with a
guess. Every line here was read out of the tree or measured, not assumed.

Baseline at the time of writing: **240 tests, 51 suites, all green**; type-check,
lint and build clean.

---

## 1. Entry points and what actually ships

`devvit.json` already declares the two entrypoints the spec's §4.1 proposes
adding:

```jsonc
"post": {
  "dir": "dist/client",
  "entrypoints": {
    "default": { "entry": "splash.html", "height": "tall" },  // inline, in the feed
    "game":    { "entry": "game.html",   "height": "tall" }   // expanded
  }
}
```

and `src/client/splash.tsx` already calls
`requestExpandedMode(event.nativeEvent, 'game')`. **So phase 2 is not "add the
inline entrypoint" — it is "replace an empty gradient with a scene".** That is
the first deviation from §18 and it makes phase 2 cheaper than the spec assumes.

### Measured bundle sizes (the phase 2 gate depends on these)

| File | raw | gzip |
| --- | ---: | ---: |
| `default.js` (the splash's own code) | 1 529 | **835** |
| `game.js` | 44 430 | 14 285 |
| `jsx-runtime.js` (React, shared chunk) | 204 542 | **65 068** |
| `jsx-runtime.css` (Tailwind) | 19 769 | 4 570 |
| server `index.cjs` | 1 533 205 | 233 509 |

**The inline view currently costs ≈ 70.5 KB gzip** (835 + 65 068 + 4 570),
because `splash.tsx` is a React component and pulls the shared runtime chunk.
The spec's budget is 60 KB gzip. **React alone is 65 KB: the budget is
unreachable while the inline entry renders through React.**

Consequence, decided here and carried into phase 2: the inline bundle is
rewritten **without React** — plain DOM plus a canvas. The inline view is one
canvas, four text nodes and one button; JSX buys nothing there. Expected
outcome is 8–12 KB gzip, well inside budget, and it makes the "no game code in
the feed" rule enforceable by inspecting a single small entry.

---

## 2. The client tree

| Path | Lines | Role |
| --- | ---: | --- |
| `App.tsx` | 645 | The expanded game. Owns the reducer, the API calls, the scene options, and every screen's props. |
| `machine.ts` | 320 | `Phase` union, `GameState`, `reduce`. Pure, tested, no DOM. |
| `api.ts` | 100 | `fetch` wrappers over `/api/*`. |
| `queue.ts` | 141 | Offline-tolerant submission queue. |
| `result-view.ts` | 50 | Which result the screen shows (official vs practice). Pure. |
| `splash.tsx` | 80 | **The inline feed card.** React. Reads `context?.postData`. |
| `splash-data.ts` | 52 | Pure parser for `postData`. |
| `theme.ts` | 163 | Per-modifier palette, `applyPalette` writes CSS variables. |
| `motion.ts` | 74 | `prefersReducedMotion`, easings, `clamp01`. |
| `audio.ts` | 262 | Synthesised sound. Expanded only. |
| `storage.ts` | 138 | `localStorage` conveniences. |
| `index.css` | 119 | Tailwind import, `@theme` tokens, base rules, keyframes. |

### Scene (canvas)

| Path | Lines | Role |
| --- | ---: | --- |
| `scene/render.ts` | 526 | `drawScene` — the whole frame, drawn top to bottom every tick. |
| `scene/useScene.ts` | 346 | rAF loop, pointer handlers, hold timing, `onFire` / `onImpact`. |
| `scene/camera.ts` | 72 | `buildCamera`, `toScreenX/Y`, `apexOf`, `flightZoom`. |
| `scene/particles.ts` | 150 | `ParticleField`, wind streaks. |
| `scene/pip.ts` | 232 | `drawPip`, `PipMood`, `aimSquash`. |

**§18 calls `camera.ts`, `particles.ts` and `pip.ts` "nouveau". All three
exist.** So does a palette module, under `theme.ts` rather than the proposed
`themes.ts`. Second deviation from §18.

### Screens (React, overlaid on the canvas)

| Path | Lines | Role |
| --- | ---: | --- |
| `screens/Result.tsx` | 291 | Score, standing, streak, CTAs, tomorrow, practice panel. |
| `screens/Overlays.tsx` | 154 | `Sheet`, help, share consent, day-rolled, logged-out. |
| `screens/Leaderboard.tsx` | 78 | Top 3 + window, its own page since the scroll-trap fix. |
| `screens/Conditions.tsx` | 57 | Wind arrow + value, distance. |
| `screens/DayBar.tsx` | 42 | Day, modifier, streak, help. |

§18 expects `screens/result.ts` and `screens/leaderboard.ts`; they are `.tsx`
React components. Third deviation.

---

## 3. The state machine

`machine.ts` owns a twelve-value `Phase` union:

```
boot → ready → aiming → in_flight → impact → scoring_pending → result
       warmup_aim → warmup_flight → warmup_result → interstitial
       practice_aim → practice_flight → practice_result
       logged_out
```

- `openingPhase(server, warmupDone)` decides the entry screen: no account →
  `warmup_aim` on a demo level; `playedToday` → `result`; `warmupPending` →
  `warmup_aim`; else `ready`.
- `charging` is separate state, not derived from the phase — the phase says
  which kind of shot, `charging` says whether the finger is down.
- **Phase 4 inserts `result_framing` between `impact` and `result`.** That is
  the only phase addition the redesign needs; everything else is presentation.

`App.tsx` derives the screen flags: `aiming`, `charging`, `showResult`, `board`,
`boardOpen`.

---

## 4. Rendering pipeline, as it is today

`useScene` runs one rAF loop and calls `drawScene(ctx, view)` every frame.
`drawScene` redraws **everything** each tick: sky gradient, ground bands,
launcher, plateau, target rings and halo, particles, Pip, trajectory, gauge.

There is no layer caching and no offscreen canvas. Phase 3's refactor
(static sky/ground cached per theme, dynamic layer only) is therefore a real
change, not a tidy-up.

`camera.ts` already models a camera with `flightZoom` and `apexOf`, so phase 4's
result framing extends an existing abstraction rather than inventing one.

DPR handling lives in `useScene`; phase 9's `min(dpr, 2)` budget must be checked
there.

---

## 5. Copy, tokens and the current colour situation

- **All player-visible text is in `src/shared/copy.ts`** (a hard rule in
  `AGENTS.md`, with a test asserting the GDD wordings). The redesign's verdicts,
  context lines and direction labels go there.
- **There is no token module.** Colours live in three places:

| File | hex literals |
| --- | ---: |
| `theme.ts` | 33 |
| `index.css` | 10 |
| `scene/pip.ts` | 5 |
| `scene/particles.ts` | 5 |
| `screens/Overlays.tsx` | 4 |
| `screens/Result.tsx` | 3 |
| `splash.tsx` / `App.tsx` | 2 |

Sizes are Tailwind arbitrary values (`text-[15px]`, `rounded-[14px]`) —
**67 occurrences across seven files**. Phase 1's job is to funnel all of this
through `ui/tokens.ts` and a CSS mirror.

---

## 6. What the UI reads from the server

`GET /api/state` returns `StateResponse` (`src/shared/types.ts`): `dayNumber`,
`displayDay`, `rerollK`, `serverNow`, `modifier`, `playedToday`, `myResult`,
`streak`, `warmupPending`, `shotsToday`, `topScore`, `perfectsToday`,
`tomorrowModifier`, `sharedToday`, `shareConsent`, `username`.

Everything the feed's social proof needs is already there **except
`yesterdayShots`**, which is the one backend addition the mission allows
(reading `day:{n-1}:meta`).

`GET /api/leaderboard` returns `top` (3) and `around` (radius 3 → up to 7 rows).

The level is never transmitted: both sides call `generateLevel(dayNumber,
rerollK)`. **The inline bundle must not do that** — it would import `sim.ts`.
The feed's ghost arc is therefore decorative and generic, exactly as §4.2 says.

---

## 7. Harness and QA tooling

`npm run harness` builds and serves `dist/client` with a stubbed API
(`tools/devharness/server.mjs`): `/api/state`, `/api/leaderboard`, `/api/shot`,
and `/api/reset?played=&warmup=` to jump straight to a state.

`tools/qa/capture.mjs` (added in phase 0) drives headless Chrome over the
DevTools Protocol and writes PNGs to `docs/qa/<set>/`.

**Two measured facts that shape QA for every later phase:**

1. **`chrome --window-size` cannot do mobile on Windows.** It clamps to a 500px
   minimum: asking for 360 reports `innerWidth === 500`. The first phase-0
   captures were rendered at 500px and looked clipped — a bug in the tool, not
   in the page. `Emulation.setDeviceMetricsOverride` sets the viewport exactly,
   and the tool now prints the measured viewport beside every shot so a wrong
   one is visible immediately.
2. **`requestAnimationFrame` is paused when the preview pane is hidden**, so the
   ball never lands and `hold` / `flight` / `impact` cannot be reached by
   driving the app interactively. Those states need either a visible pane or a
   deterministic replay hook. Phase 3 should add one rather than fighting it.

The capture tool also reports `SCROLLS-X` / `SCROLLS-Y` per shot, which makes it
a standing regression check on the in-line scroll rule Reddit rejected 0.4 for.

---

## 8. Files this redesign will touch, against §18

| §18 says | Reality | Plan |
| --- | --- | --- |
| `devvit.json` — add inline entrypoint | **Already there**, with `requestExpandedMode` | No change beyond `height` review |
| `src/client/inline/` (new) | — | New, **and React-free** (see §1) |
| `ui/tokens.ts` (new) + CSS mirror | — | New, phase 1 |
| `scene/renderer.ts` (layers, DPR, cache) | `scene/render.ts`, single pass, no cache | Refactor in place, phase 3 |
| `scene/pip.ts` (new) | **Exists**, 232 lines, moods already modelled | Extend to 12 expressions |
| `scene/particles.ts` (new) | **Exists**, 150 lines | Extend per theme |
| `scene/camera.ts` (new) | **Exists**, has `flightZoom` | Add result framing |
| `scene/themes.ts` (new) | `theme.ts` exists with per-modifier palettes | Extend, keep the name |
| `scene/target.ts` (halo, flag, rings) | Inside `render.ts` | Extract only if it pays |
| `screens/result.ts` | `screens/Result.tsx` (React) | Rewrite behind `UI_V2` |
| `screens/leaderboard.ts` | `screens/Leaderboard.tsx` (React) | Rewrite, phase 5 |
| `screens/game.ts` / machine | `App.tsx` + `machine.ts` | Add `result_framing` only |
| `audio/` | `audio.ts`, single file | Untouched |
| `shared/copy.ts` | As described | Verdicts, context, directions |
| `shared/types.ts` | As described | `yesterdayShots` |
| `server/` — `yesterdayShots` | Allowed addition | `state.ts` only |
| `public/fonts/` | Does not exist; no font is bundled today | New, phase 1 |
| `tests/` | 240 tests | Add, never edit |
| `tools/harness` captures | Existed without capture | **Done in phase 0** |

### Deviations to keep in view

1. The inline entrypoint exists; phase 2 is a rewrite of its contents.
2. `camera.ts`, `particles.ts`, `pip.ts` are not new.
3. Screens are React `.tsx`, not plain `.ts` modules.
4. **The 60 KB inline budget forces React out of the inline bundle.** This is
   the only deviation that changes the shape of the work rather than its
   accounting.
5. No font is bundled at all today — `index.css` names Space Grotesk in a
   `font-family` stack but nothing ships it, so the game currently renders in
   the platform's UI font. Phase 1 fixes that, and it is a visible change, not
   the "no visual change but the font" the spec expects.
