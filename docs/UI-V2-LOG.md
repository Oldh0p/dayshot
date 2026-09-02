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

---

## Phase 3 — Game scene (part 2 of 2: atmospheres, glyphs, hold feel)

- **Done.** §11's seven atmospheres exist as data — the exact skies, plus an
  `Atmosphere` record for air style, particle density, Pip's tic and the
  pennant — and the ambient budget now follows it instead of a flat 26 streaks
  on every day. Every emoji is out of the UI: seven modifier glyphs, a flame and
  a distance mark, as path data shared by the React screens and the React-free
  feed bundle. The wind arrow is proportional to strength (§5) and carries a
  spoken label, because §11 forbids the wind being legible only through
  particles. Hold adds the 12% vignette and slows the air to 0.6x; Pip has a
  screen-space size floor.
- **Verified.** 272 tests, 21 captures, zero scroll, zero clipping. **4x CPU:
  aiming 0 dropped frames, flight 4** (baseline 1 and 17). 6x: aiming 0, flight
  18. The hold state is captured for the first time — rAF *does* run under
  headless Chrome; it is the preview pane that pauses it, which is what had
  blocked this since phase 0.
- **The measurement caught my own regression.** After the atmospheres and the
  vignette, flight went from 4 back to 14 dropped frames. Reproduced three times
  before believing it, then traced to the vignette: a full-screen radial
  gradient rasterised every frame — the exact mistake the sky cache existed to
  fix. Rasterised once and composited with `globalAlpha`, it is back to 4.
- **A palette decision, argued from the spec.** The seven themes carried six
  saturated accents, which put the palette past §13's nine colours and gave five
  different colours the job §13 reserves for coral. §11 marks `accent` optional
  and names it for no modifier: recognition there is sky, particles and tic. So
  the gauge, trail and middle ring are coral on every day. A test pins it.
- **Left, deliberately, and not for lack of time:** Pip's tics (lean, squint,
  slow) and the decor treatments (pennant, spotlight cone, distance ticks) are
  described in `ATMOSPHERE` but not drawn — phase 7 rewrites Pip's rig into
  twelve expressions, and half-implementing three of them now is work that phase
  throws away. The opening sequence is partial: the condition cards already
  stagger in, the sky settle and Pip's spring do not.

---

## Phase 4 — Result V2

- **Done.** Verdicts, standing and impact direction (§10.2–10.4) in `copy.ts`;
  `ResultV2` answering §6's seven questions in order behind `UI_V2`; the
  `resultFraming` camera, which drops GDD 28's full-width rule once no shot is
  possible and frames the impact and the mat instead, with the mat never under
  24px and never zoomed past 2.4x the aiming view.
- **Verified.** 289 tests, 25 captures, zero scroll, zero clipping. The scene
  now stays behind the panel: Pip where he stopped, the marker, the dotted line
  to the centre. `FIRST SHOT TODAY` is gone, and so is the second filled coral
  block — the percentile is coral *text*, which is what §13 allows.
- **§10.2's numbers were stale, and the spec says so itself.** Its bands are
  score ranges explained as geometry — "87 = bord du tapis" — and the daily
  warm-up moved the mat edge to 76. Taken literally they would tell a player
  resting *on* the mat they had a `NEAR MISS`. The function reads dx against the
  mat radius instead, which survives the next recalibration and fixes Tiny
  Target days, where a fixed distance means two different things.
- **Three tooling truths, each found by a capture that lied.** The harness
  answered every shot with a fixed `dx: 6.4`, so every result read `SO CLOSE / 6
  over` whatever the ball did — it re-simulates from `holdMs` now, as the real
  server does. A restored result has no trajectory, so there was nothing to
  frame and the scene came out empty; the rig can play a real shot now. And the
  shoot step released after `0ms` because an escaping slip wrote `${'${step.
  shoot}'}` into the file, which `setTimeout` coerced to zero — the misfire
  guard then swallowed every shot, exactly as designed. Captures now print the
  screen they reached, because a capture of the wrong screen looks like evidence.
- **Left:** the direction label is in the panel but not yet drawn beside the
  line in the scene; the streak increment does not animate; Bullseye and Perfect
  have no celebration yet (phase 7); the tomorrow band is a thin strip and could
  read stronger.

---

## Phase 5 — Leaderboard V2

- **Done.** `LeaderboardV2` per §7 and wireframe H: header with the day's total,
  top three with gold/mist/coral medals, a `· · ·` separator, the window around
  the player, a YOU row with a coral bar, and columns for rank, name, score and
  distance. Both empty states, and a standing recap under the rows.
- **The distance column needed no backend change.** `/api/leaderboard` sends no
  distance and this redesign may add only `yesterdayShots`, but the score *is* a
  monotonic function of the distance, so it is recoverable. Recovered by
  bisecting `scoreForDx` rather than inverting it algebraically: the closed form
  would restate five constants that have already moved once, and a search over
  the real function cannot drift from it.
- **Verified.** 298 tests, 26 captures, zero scroll, zero clipping. The
  round-trip is exact to under half a unit across the whole range, across the
  seam between mat and ground, and on a Tiny Target day. The two empty states
  are decided by a pure function, because they are the hardest boards to reach
  by hand and the easiest to leave untested.
- **Client-side on purpose.** `copy.ts` is in the feed bundle's import graph, so
  the inverse lives in `client/screens/` — putting it in `copy.ts` would have
  pulled `sim.ts` onto the feed card and failed the phase 2 import test.
- **Left:** §4.4's deep link from the feed is in `BACKLOG.md` with its reason —
  the documented query-string route does not build, and the workable version
  adds two entrypoints to an app awaiting review for a path that is already one
  tap away. P2's streak column in the window is untouched.

---

## Phase 6 — Atmospheres everywhere

- **Done.** Four decorations that make a day nameable without reading the chip:
  Clear Skies' seeded constellation, Long Shot's distance ticks every 100 units,
  Tiny Target's spotlight cone, and the Crosswind/Gusty pennant — which is the
  only decoration carrying information, and reads the wind from `windAt`, the
  same function the ball obeys. The feed gained Moon Gravity's moon and §11's
  per-atmosphere particle density under §13's ceiling.
- **Verified.** 40 captures, zero scroll, zero clipping, 298 tests. Frame time
  held: 4x CPU gives 0 dropped frames aiming and 6 in flight, with the new decor
  in. All seven modifiers captured in the feed and in the game.
- **The harness serves a real day, not a claimed modifier.** `?mod=MOON` searches
  forward for a day whose seed genuinely draws it — because the client
  regenerates the level from the day number, so overriding the field would put
  the day bar and the scene back in the disagreement this harness already had
  once. Every modifier turns up within about fifty days.
- **The gate is subjective and it passes.** Tiny Target is a spotlight on a
  visibly halved mat in near-still air; Crosswind is a sky full of streaks with a
  coral pennant leaning the same way as the wind arrow; Moon Gravity is an
  indigo sky and a moon behind the mat. Clear Skies and Tiny Target still share
  a gradient, exactly as §11 specifies, and are not confusable.
- **Left:** Tailwind's low speed lines and Gusty's periodic bursts are described
  in `ATMOSPHERE` and not yet drawn — both are motion, and phase 7 owns motion.
  Tailwind currently reads as "warm sky, wind arrow right", which is thinner than
  the others.

---

## Phase 7 — Pip, flight, impact, rewards

- **Done.** `pip.ts` rewritten to §8's anatomy: seven shapes and twelve
  expressions, all of them transformation — eyelid coverage, pupil offset and
  size, one star pupil, one pair of closed happy arcs. The mouth is gone,
  because §8 does not have one and the eyes carry every state. Pip's reaction is
  derived from the verdict, Tiny Target squints, Crosswind leans 1.5° into the
  wind, Tailwind's low speed lines and Gusty's pulse are drawn at last, and
  Bullseye lifts the mat's halo while Perfect adds a 600ms shockwave.
- **Verified.** 303 tests, 43 captures, zero scroll, zero clipping, 0/4 dropped
  frames at 4x CPU. Twelve expressions asserted distinct; the mapping from
  verdict to face pinned against §8's table row by row.
- **The face had drifted from the word, and by a whole band.** Pip's landing
  mood read `score >= 87` — the mat edge under the *previous* scoring curve, and
  now well inside the miss bands — so he did his pleased landing under `NEAR
  MISS`. One source now: the verdict decides both, and a test states the rule
  rather than the number.
- **Bullseye and Perfect cannot be captured by playing.** Measured on the day
  they were found: 314ms and 318ms. **Four milliseconds.** A dispatched
  `pointerup` does not separate that, so those panels are captured from
  genuinely simulated results restored through the harness — the score, verdict
  and distance are real, they were simply not thrown live. The scene-side
  celebration needs a live shot and is a playtest item.
- **Left:** the streak's `7 → 8` flip is not animated; the flight camera has its
  apex zoom but no parallax; and the ≤20s session budget has not been timed.

---

## Phase 8 — Responsive

- **Done.** §12's full ladder is in the capture rig: 320×568 compact, 360×640,
  390×720, 430×860, plus feed at 320×350 and 430×512 and expanded desktop.
  Safe-area padding on every surface that sits against the bottom edge — the
  result panel, the board, the aiming panel and the feed's CTA — and expanded
  desktop is a centred 480px portrait panel rather than a game stretched across
  a monitor.
- **Verified.** 307 tests, **52 captures, zero scroll, zero clipping**.
- **One real break, found by the ladder and fixed by the spec.** The leaderboard
  was clipped at 320×568: eleven rows plus a header, a standing line and a
  button do not fit 568px. The endpoint sends a window of radius three, and §7
  asks for radius two — so the fix and the spec conformance were the same edit,
  and it needed no backend change.
- **And a second bug inside the fix.** The first version shrank the window at
  the edges instead of sliding it, so a player in last place saw three
  neighbours instead of five — fewer rows for exactly the player who most needs
  to see someone ahead of them. Caught by a test written before the capture.
- **Left:** §12's compact tweaks (score at 40px, condition cards on one line)
  are not implemented; nothing is cut without them, so they are polish rather
  than a fix.

---

## Phase 9 — Accessibility and performance

- **Done.** `tools/qa/a11y.mjs` generates `docs/qa/contrast.md` from the tokens
  and from a real 390×720 layout. A focus ring the game did not have — the feed
  card had one and the game did not, which is the wrong way round. A keyboard
  can now take the shot with Space or Enter, through the identical path, so
  `holdMs` is measured the same way. The play area carries an accessible name.
- **Verified.** 307 tests, 52 captures, zero scroll, zero clipping. **All nine
  text/background pairs pass AA**, from 5.58:1 up to 16.69:1. Every control is
  at least 48px. The focus ring measures 2px on the first Tab target of all
  three screens. The keyboard shot was driven end to end and reaches a result.
- **The frame-time budget needed the right number first.** §9's gate asks for a
  median under 10ms, which is below what a 60Hz display can even produce — the
  interval between frames is capped at 16.7ms and says nothing about cost. What
  it has to mean is the time the page spends inside its own callback:
  **0.80ms median, 1.50ms p95 at 4× CPU throttle.**
- **Two measurements lied before they told the truth.** The frame recorder timed
  its own callback, which does nothing, and halved the reported median. And the
  focus check asked for `getComputedStyle(el, ':focus-visible')`, which browsers
  do not resolve: it returned an empty string, and the report printed a blank
  column that looked like "no ring" and meant "no measurement". Fixed by
  dispatching a real Tab through CDP, which sets the keyboard modality a
  programmatic `.focus()` cannot.
- **The gap the audit found is the one worth naming.** The aiming screen
  measured **one** reachable control — the help button — because the whole
  screen is a hold target. Right for a thumb, and it silently excluded anyone
  playing with a keyboard.

---

## Phase 10 — Visual QA, tests, cleanup

- **Done.** `UI_V2` and the five files it guarded are gone — the old result
  panel, the old board, the old React splash, its data parser and the flag
  itself, plus the test whose subject no longer exists. The greps are clean: no
  emoji in the UI outside comments explaining what they replaced, no hex outside
  `tokens.ts` and the palette table, no `UI_V2`. `docs/qa/REPORT.md` puts before
  and after side by side.
- **Verified.** 303 tests across 64 suites, type-check, lint and build green.
  **56 final captures, zero scroll, zero clipping**, each printing the screen it
  reached. Nine of nine contrast pairs pass AA. Frame work 0.80ms median at 4×
  CPU throttle against a 10ms budget.
- **The last stray colour was the Perfect confetti**: sixty particles in four
  colours, one of them a cyan that existed nowhere else — a tenth colour §13
  does not have, spent on the rarest event in the game. It is §9's twenty-four
  gold now, which is the colour a Perfect already owns.
- **Three captures the gate names were still missing**, and getting them honest
  took a detour each: the flight only exists in motion, so the rig learnt to
  screenshot mid-air; and the ~45 and ~90 bands needed exact holds, which my
  first search found on the wrong day — the harness serves day 20698 and I had
  searched 20697.
- **Left, and named in the report:** the streak's `7 → 8` flip is not animated,
  the flight camera has no parallax, §12's compact type tweaks are unbuilt, and
  six things cannot be verified outside a real device — the report says which,
  and how to test each at playtest.

---

## Post-playtest — the camera moved three times

- **Reported from a real device**, not from a capture: a single shot produced
  three framings in about a second, and the player could not follow it. Two of
  the three were bugs rather than design.
- **The ground line jumped at release.** The aiming panel's reservation was
  `canAim ? PANEL_SHARE : 0`, so the instant the thumb lifted the world dropped
  a quarter of the screen — a hard cut at the exact moment the player is
  watching the ball. The band is constant now: §5's wireframe F keeps the
  condition cards on screen during the flight anyway.
- **§6's result framing had never been interpolated.** The camera swapped on the
  single frame the ball landed. It eases over the 400ms the spec asked for,
  borrowing the `landedAt` clock Pip's reactions already use.
- **And the push-in was too far.** 2.4× made the result a different world from
  the one the shot was taken in; 1.5× is a push-in, and the mat still clears its
  24px floor.
- **Six tests** state the rule that came out of it: the camera moves once per
  shot, and it moves rather than cuts. 309 tests, 56 captures, all clean.

---

## Post-playtest 2 — the result framing lost the game, and desktop lost its width

- **"On ne voit pas à quel jeu on a à faire."** §6 says to frame the impact and
  the mat with a 12% margin, and taken literally that is what it did — and on a
  483×896 phone it cropped the launcher out of frame. DAYSHOT is a throw *across
  a gap*; a close-up of a ball resting on a mat is a different picture, and it
  removes the only scale reference on screen, so "16 short" stops meaning
  anything. The result keeps the shot's own horizontal framing now, and pushes
  in only when the mat would otherwise fall under 24px.
- **A band of empty ground under the scene.** The reserved band was
  `height × 0.5`, but the panel's content is fixed so its height is roughly
  constant in *pixels*: on an 896px screen half the height is 448 against a
  panel of about 340. Capped at 370px, the ground line sits just above the panel
  on any screen.
- **"Une sorte de format mobile" in full screen.** Phase 8 capped `#root` at
  480px on wide screens, reading §12's "panneau portrait 480×760" as the whole
  app. It is the *panel*: the world is landscape and should use the width it is
  given. The cap moved to a `.panel-column` class, and a real desktop shot now
  shows launcher, arc, Pip and mat with the panel as a centred column.
- **Verified.** 309 tests, 58 captures, zero scroll, zero clipping — including
  the two viewports this report added, which are in the standing set now.

---

## Post-playtest 3 — the scene was missing on every visit but the first

- **"On ne voit toujours pas la surface de tir derrière."** The previous fix was
  right about the framing and wrong about when it applied: `resultFraming` was
  gated on `landed`, i.e. on there being a trajectory in flight. That gate made
  sense when the framing centred on the impact point — there was no impact to
  centre on — but the framing had since been rewritten to do nothing except
  raise the ground line for the taller panel. So *coming back* to your result,
  where the score is restored from the server and no trajectory exists, kept the
  **aiming** reservation and drew the whole world behind the panel. That is the
  common case: every visit after the one where you played, which is exactly
  where the player was when they reported it.
- **And the reservation was still a share.** 370px capped a *share*, so a 647px
  screen got `min(323, 370) = 323` against a panel measuring 347 — the mat sat
  behind the panel edge. It is a pixel figure now, `clamp(380px, 42%–62%)`,
  because the panel's content is fixed and so is its height. The clamps are for
  the extremes: a 480px screen cannot hold both, and there the panel overlaps
  the bottom of the scene rather than taking all of it.
- **Four tests** now hold the reservation, including the two viewports that
  failed. `settle` still requires a landing, so a restored result arrives
  already framed instead of easing from a camera it was never at.
- **The `PRACTICE` watermark took a third of the screen.** `camera.width × 0.16`
  is 307px of diagonal type on a full-screen desktop, and §5 wants practice
  marked, not announced. It is a badge now: a 22px rounded pill under the day
  bar, 12px label, hand-tracked with thin spaces, panel fill and a 35% air
  stroke. Same job, one line of the screen.
- **Verified.** 313 tests, 60 captures, zero scroll, zero clipping. The result
  captures gained about 30% in file size, which is the scene being drawn again.

---

## Post-playtest 4 — the sound nobody could reach

- **The question was "can the sound start on its own".** It cannot, and no
  amount of code changes that: this game runs in a cross-origin iframe, where
  the browser grants only *transient* activation — five seconds, not sticky —
  and activation does not descend from the parent Reddit page. On WebKit
  nothing Reddit could do would unlock it. So the honest version of the request
  is "on by default, first heard on the first tap", which is what shipped.
- **The real defect was worse than the one reported.** `soundEnabled()` was
  `read('sound') === 'on'` and `ensure()` no-ops while sound is off, so the
  engine was inert for anyone who had not found a checkbox two taps deep inside
  the help sheet. And the two `ensure()` call sites both sit behind `canAim`,
  which is false on a restored result — the screen most visits open to. Twelve
  synthesised cues, and almost nobody had heard one.
- **Reddit publishes three audio rules and this app met one.** From the Devvit
  docs' "Inline mode requirements", item 5 *Safe use of sound*: audio must not
  play without interaction (already true, twice over — the feed bundle cannot
  even import the engine); **include a button to mute in your game**; **use the
  visibilityChange handler to mute if a user scrolls away**. The last two did
  not exist. That list is the same one whose other items rejected 0.4, so it is
  demonstrably the page the reviewer reads.
- **What was built.** The default flipped to `!== 'off'`. A mute button in the
  day bar beside the `?`, 48px, `aria-pressed`, its own glyph pair sharing one
  speaker body. A `visibilitychange` handler that stops the hold and flight
  oscillators, ducks the master gain and *suspends* the context — suspending
  matters, because a suspended clock stops, and cues scheduled while hidden
  would otherwise all come due at once on return. A document-level unlock on
  the first qualifying gesture (`pointerup`, `touchend`, `mousedown`,
  `keydown`, `click` — never `pointerdown`, which does not grant activation for
  touch). And `ensure()` now resumes a suspended context instead of returning
  blind, which is what a backgrounded webview hands back.
- **Five tests** guard the three rules the way `no-inline-scroll.test.ts` guards
  the last rejection, because none of this fails visibly — it fails in review.
- **`Day #2` stopped wrapping at 320px**, which the extra button had caused; the
  modifier truncates instead, as it already did.
- **318 tests, 60 captures, zero scroll, zero clipping.** The aiming screen went
  from 2 keyboard-reachable controls to 3, still none under 48px.

---

## Post-playtest 5 — practice stopped asking permission to continue

- **"On est obligé d'appuyer sur Again à chaque fois."** Practice ended every
  attempt on the full result panel — the same slab the official shot gets, with
  a verdict word and a rank row it has no rank for — and required a tap to
  reopen aiming. Ten shots meant ten taps. It also meant **twenty camera moves**:
  `practice_result` was in `resultFraming`, so every landing eased the ground
  line up over 400ms and every `Again` snapped it back down.
- **The phase is gone.** `practice_result` is deleted from the `Phase` union and
  `impact` returns `practice_flight` straight to `practice_aim`. That is the
  whole mechanism: `canAim` already listed `practice_aim`, `guardMisfire` is
  already false there, `fired` already routes it — the loop closes without a new
  branch. Hold anywhere, or Space, and the next shot charges.
- **A readout, not a result.** `PracticeStrip` is three fixed-height rows inside
  the 25% band aiming already reserves (130px of 142 at 320×568): the attempt's
  score at 44px italic, `NEW BEST` or the delta from the previous attempt, where
  it landed, the day's best, then a breathing `HOLD TO AIM` beside the one way
  out. Fixed heights are the point — nothing moves between attempts, so a
  chaining player never re-finds the number they are reading.
- **`practiceLast` is not `state.shot`.** The scene's trajectory is replaced the
  instant the next throw begins, and the number being read must not blink out
  with it. Written only at impact, it survives the whole next charge and flight.
- **A live bug found on the way.** `unranked()` hard-coded `signedDx: 0`, and
  `impactDirection` reads `signedDx < 0 ? 'short' : 'over'` — so every practice
  attempt was announced as long, including the ones that fell short, and so was
  the official shot for the second between impact and the server's answer. The
  one thing practice exists to tell you is which way to correct. Given the day's
  distance it is just the miss, signed; four tests hold the sign now.
- **Two collisions closed.** The screen is a hold target the whole time in
  practice, so `Back to my shot` and both day-bar buttons stop their pointer
  events — without that, tapping mute charges a shot and letting go throws it.
  The official shot was covered by the misfire guard; practice deliberately is
  not, which is exactly where it would have bitten.
- **Dead weight removed.** `ResultV2` lost its `practice`, `practiceBest`,
  `practiceTries` and `onLeavePractice` props and the whole `PracticeActions`
  block: practice never reaches that component again.
- **326 tests, 63 captures, zero scroll, zero clipping.** Two of the captures are
  new and are the state the loop actually lives in — a shot landed, the screen
  already armed — which nothing had ever photographed.
