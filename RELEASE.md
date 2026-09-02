# Release checklist — DAYSHOT

Everything between the current state of the tree and `npx devvit publish`.

Current state: **0.0.11 submitted for review on 2026-09-02**, carrying the fix
for the 0.4 in-line scroll trap plus the UI rebuild, the audio compliance work
and the practice loop. 326 tests green, 63 QA captures clean, Devvit 0.14.2, `[DEV]`
surface removed, Terms and Privacy live.

> **App identity, resolved.** `devvit view` reports the app's name as `dayshot`
> while `devvit.json` says `dayshot-game`; these are the same app — the upload
> output links to `developers.reddit.com/apps/dayshot-game`. The separate
> `daily-one-shot` (0.0.4, 14 versions) is an abandoned earlier shell and is not
> what this project publishes to.

| | |
| --- | --- |
| App | `dayshot-game` -- <https://developers.reddit.com/apps/dayshot-game> |
| Last submitted | **0.0.11** -- awaiting review (0.4 was rejected; section 7) |
| Publishes to | `dayshot` / `dayshot-game` -- one app, two names |
| Home subreddit | r/DayShot -- **nothing installed there until approval** |
| Test subreddit | r/dayshot_game_dev (CLI auto-created it, set to Public by hand) |
| Terms | <https://oldh0p.github.io/dayshot/terms> |
| Privacy | <https://oldh0p.github.io/dayshot/privacy> |
| Repository | <https://github.com/Oldh0p/dayshot> (public -- Pages needs it) |
| Modmail to r/Devvit | sent, in parallel with submission |

Review is required because the app *creates custom posts*, which is what the
game is; it is not a flag against this app in particular.

**On approval:** `npx devvit install DayShot`. The first post it creates reads
`#1` on its own -- the anchor handles it, there is no date to set.

The one known difference between the repo and version 0.4: the unused
`public/snoo.png`, removed after submission. See section 6.

---

## 1. What would fail review today

Only two things, and one of them is not mine to do.

### 1.1 The app has never been uploaded under its new name — **blocking**

`devvit.json` now says `name: "dayshot-game"` — `dayshot` was already taken on
the platform. There is no rename command in the CLI
(`devvit --help` lists none, and the name field *is* the app's identity), so
uploading registers a **new app**. Nothing has been uploaded yet, so the version
under review would not exist.

Consequence, and it is a feature: a new app means a **new Redis namespace**. On
the test subreddit every streak, warm-up flag and lock starts empty, which
re-tests the brand-new-account path for free — this time with the cliff
gradient, the streak fix and the demo mode that the installed build predates.

### 1.2 A dedicated non-test subreddit — **your call, low risk**

The [launch guide](https://developers.reddit.com/docs/guides/launch/launch-guide)
lists, for games: "Has a dedicated, non-test subreddit (e.g. r/Pixelary)."

The home subreddit is **r/DayShot**. You have decided not to install there
before approval. That is defensible — published apps are unlisted by default and are
installed after approval — but note the reviewer will only see the app running
on r/dayshot_game_dev. If review comes back asking to see it on the home
community, installing takes a minute and is not a code change.

### 1.3 Account deletion — **not blocking. Submit.**

My ruling, with the reasoning, because you asked for a decision rather than a
hedge:

- The requirement is real: the rules say a deleted account's `t2_*` must be
  removed from the app's datastores.
- **No account-deletion trigger exists.** Verified against the `devvit.json`
  trigger schema: post, comment, mod-action, mod-mail and app-lifecycle events
  only. So no Devvit app holding per-user state can satisfy it reactively, and
  a daily streak is per-user state by definition.
- The exposure is already minimal: the only author-identifying data is a
  username cache that expires in 90 days; everything else is keyed by an opaque
  id and every per-day key expires.
- Reddit reviews with knowledge of its own platform's capabilities. Blocking a
  submission on a requirement the platform provides no mechanism for would mean
  never submitting.

Send the modmail (`docs/modmail-account-deletion.md`) **in parallel with**
submitting, not before it. If review raises it, you have already asked and can
point at the thread.

### Everything else is at the required level

| Requirement | Where it stands |
| --- | --- |
| `README.md` present, non-vague, non-developer audience | ✅ rewritten; overview, install, how to play, privacy in plain words |
| Score comments as the user, replying to a sticky | ✅ replies to the day's stickied thread |
| Player knows what will be published before confirming | ✅ the consent sheet renders the exact card and names `u/<username>` |
| Explicit manual action, no automation | ✅ one button, one confirmation |
| Actions never merged, nothing gated behind sharing | ✅ `POST MY SHOT`, `Practice`, `Copy card` are three controls |
| Honours comment deletion | ✅ `onCommentDelete` drops the app's record |
| Custom launch screen | ✅ the splash entrypoint |
| Immediately understandable | ✅ warm-up, one instruction, one input |
| Core experience not behind a login wall | ✅ logged-out visitors shoot a demo level |
| No inline scrolling | ✅ the splash does not scroll; the scrolling panel is expanded-only |
| No external fetch, LLM or payments | ✅ `devvit.json` declares only `redis` and `reddit` |
| Data minimisation and TTLs | ✅ 90 days on everything but the streak record |
| Terms and privacy policy | ✅ written, though not required — see below |
| No Reddit or third-party IP | ✅ Pip is original. `public/snoo.png` shipped unused in 0.0.4 -- a starter-template leftover, removed after submission; see below |

---

## 2. Terms and Privacy

**Not required**, and written anyway. The
[quality rules](https://developers.reddit.com/docs/devvit_rules#build-for-a-quality-experience)
require them only if the app uses payments, `fetch` or an LLM — this app
declares none — "or if requested by Reddit". Having them costs nothing and
removes a round trip if review asks.

`docs/privacy.md` and `docs/terms.md`. They are short because the honest answer
is short: an opaque account id, the day's shot, a streak, a 90-day username
cache, and nothing that leaves Reddit.

**Simplest hosting, no infrastructure: GitHub Pages.** The files already sit in
`docs/`, one of the two folders Pages serves natively, and its default renderer
turns Markdown into HTML with no build step.

---

## 3. Day numbering — solved, not deferred

The problem: approval lands on an unknown date, so a compile-time `LAUNCH_DAY`
is a guess, and a wrong guess means a post titled `#0` or a second review cycle
to fix a constant.

**The number is now anchored on the first day the installation ever creates a
post**, claimed with `SET NX` and never moved. That gives exactly what the
constant was for — the first public post reads `#1` — without predicting
anything. Whenever approval lands, whenever the home community installs, its
first day is its day one.

Levels are unaffected: they come from the absolute day number, and the anchor
only decides what the title calls it. Redis is per installation, so a community
that joins later counts from its own first day, which is what a community would
expect.

Three tests cover it: the first day is `#1`, six racing cold requests agree, and
a fresh installation gets its own `#1`.

`LAUNCH_DAY` survives only as a constant for pure unit tests, and
`npm run launch-day` as an inspection tool. Neither is on the runtime path.

---

## 4. What the rename changed

- `devvit.json` and `package.json` name → `dayshot-game`. The CLI claimed the
  name at upload time and rewrote both files itself; `dayshot` was taken.
- Brand strings in `copy.ts`: the splash title, the warm-up interstitial, the
  daily post title, and both share formats.
- **The seed string `oneshot:` is deliberately unchanged.** It is not a brand
  string: it is the input to the hash that decides every level, and renaming it
  would silently regenerate every day the game has ever had. A test and a
  comment both say so.
- `PREFIX = 'oneshot:'` in `storage.ts` is likewise left alone. It only names
  browser-local conveniences, and churning it would orphan them for no gain.
- CSS keyframe names (`one-shot-rise`) are internal and not worth the churn.

---

## 5. What is still unverified

None of these blocks submitting. They are what a careful playtest on the renamed
app should confirm.

- [ ] The rollover: `[daily] task="daily-post"` at 00:00 UTC, and the title
      advancing by one.
- [ ] Two accounts on the same wall, with the gradient in place — the two 67.80s
      should now differ.
- [ ] Mobile, logged in, the whole loop.
- [ ] Logged out, on web and the mobile app, in feed and expanded.
- [ ] `prefers-reduced-motion`, contrast, 48 px targets.
- [ ] Whether `setPostData` reaches a card already in the feed. The probe that
      would have answered this went with the rest of the `[DEV]` surface; it is
      a V1 question (the dynamic splash of GDD 12), not an MVP one.

---

## 6. Snoo shipped in 0.0.4

`public/snoo.png` arrived with the official Devvit Web template and was never
referenced by a single line of the game, but Vite copies `public/` verbatim, so
110 KB of Reddit's mascot went into every build -- including the one submitted
for review, under a checklist line that claimed the opposite.

Removed here. **Not worth a re-publish on its own**: the asset is Reddit's own
template art, unused and unreferenced, so it misleads nobody about endorsement,
and re-uploading to fix it would resubmit the app for the sake of a file no
player ever sees. Fold it into the next version -- whether that is a fix review
asks for, or the first update after approval.

The general lesson, which is why this is written down: `public/` is copied
wholesale into the bundle. Anything dropped there ships, whether or not the code
imports it.

---

## 7. Review response: the in-line scroll trap (0.4 rejected)

Reddit's reply, in full:

> **In-line Scroll Trap:** Scrolling within in-line web views is not allowed.
> This can interfere with Reddit-native interactions and gestures. Consider
> using buttons to navigate or taking the user to Expanded Mode.

One issue, and a fair one. Section 1's table claimed "No inline scrolling --
the splash does not scroll; the scrolling panel is expanded-only". The first
half was true. The second half was reasoning about which entrypoint the panel
belonged to instead of measuring it, and the rule is about the web view, not
about which entrypoint opened it.

**What actually scrolled.** The result screen stacked the verdict and the
leaderboard in one `overflow-y-auto` panel. Measured at a post-sized viewport,
the verdict alone is about 400 px and the board's worst case is ten rows -- top
three plus a radius-3 window -- for roughly 260 px more. Against 512 px, the
panel had to scroll. It was not an edge case; it was every ranked shot.

**The fix, which is the one Reddit suggested.** The board is now a page of its
own, reached with a `Leaderboard` button and leaving by `Back to my shot`.
Nothing scrolls, nothing is clipped, and no content was dropped.

Three further changes close the rule rather than this one instance:

- `index.css` locks `html, body, #root` with `overflow: hidden`, so no
  entrypoint can scroll whatever a future screen does.
- The consent sheet's card was capped at `max-h-40` with `overflow-y-auto` and
  measured **149 px against that 160 px cap** -- eleven pixels from turning the
  one dialog the player must read into a scrolling box. The cap is gone.
- `src/tests/no-inline-scroll.test.ts` fails on any scrollable container
  reintroduced anywhere in the client, and on `index.css` losing the lock. It
  was confirmed to fail when a scroller is put back.

**Verified by measurement, not by reading.** Every screen was driven in a real
browser at 400x512 and 320x400, checking `scrollHeight - clientHeight`, any
element with a scrolling overflow, and any element crossing the viewport edge:

| Screen | Scrolls by | Scrollable elements | Outside viewport |
| --- | --- | --- | --- |
| Splash (the in-line card) | 0 | none | none |
| Aiming | 0 | none | none |
| Result | 0 | none | none |
| Leaderboard, worst case 10 rows | 0 | none | none |
| Share consent | 0 | none | none |
| Help sheet | 0 | none | none |

Two things made that measurement possible and are worth keeping. The harness
served a three-row board, which would have passed while the real ten-row one
failed; it now serves the worst case, and can restore a played result directly
so the result screen is reachable without playing a shot. And the splash threw
on `context.postData` outside Devvit, so the in-line card -- the exact surface
under review -- could not be rendered locally at all. It now reads `context?.`
and degrades to a card without a day number, which is also the better
production failure: a blank feed card is the worst outcome for the one surface
whose job is to be recognised at a glance.

**Not fixed here, deliberately:** `public/snoo.png` (section 6) goes out in this
same version, since a re-upload is happening anyway.

---

## 8. What the UI redesign changes for review

The interface was rebuilt against `DAYSHOT-UI-REDESIGN.md`. Four of those
changes touch things a reviewer looks at, and one of them is the rejection.

- **The in-line scroll trap is gone, and cannot come back quietly.** Every
  screen is laid out to fit and `tools/qa/capture.mjs` reports scrolling and
  clipping on all 63 captured states across six viewports. All clean.
- **The feed card is a real scene, and it costs less than the old one.** Plain
  DOM and canvas instead of React: **35 284 bytes gzip including the font**,
  down from about 70 500. It cannot reach the simulation, the state machine, the
  audio engine or a hold handler — four tests read the built files to prove it,
  because "no shot can be thrown from the feed" is a claim that should not rest
  on a comment.
- **No audio in the feed**, and no audio anywhere before a user gesture.
- **The CTA stopped lying.** `TAP TO SHOOT` promised a throw that the tap did
  not take; it is `TAKE YOUR ONE SHOT`, which opens the game. Every number on
  the card is real and comes from the day: `src/tests/feed-copy.test.ts`
  asserts that no figure appears that is not in the day's facts.
- **Accessibility.** Nine of nine text pairs pass AA (`docs/qa/contrast.md`,
  generated); every control is at least 48px; a focus ring is measured on the
  first Tab target of every screen; and Space or Enter takes the shot, because
  the whole screen being a hold target left a keyboard user with one reachable
  control.

Nothing in the simulation, the scoring, the seed, the locks, the Redis keys, the
scheduler, the sharing or the anti-cheat was touched. The only backend addition
is `yesterdayShots` in `GET /api/state`, read from `day:{n-1}:meta`, for the feed
card's social proof.

---

## 9. What changed since the rejected 0.4

Paste-ready for the submission note. Everything here is either the rejection
itself or a change a reviewer's checklist asks about.

- **The in-line scroll trap, which was the rejection.** The result screen
  stacked a verdict and a ten-row leaderboard into a post-sized viewport, so the
  panel scrolled and ate the swipe the feed was waiting for. The board is a
  separate page reached with a button, `index.css` locks the document, and
  `src/tests/no-inline-scroll.test.ts` fails on any scrollable container
  anywhere in the client. 63 captures across six viewports report zero scroll
  and zero clipping.
- **The interface was rebuilt** against `DAYSHOT-UI-REDESIGN.md`. The feed card
  is plain DOM and canvas: **35 284 bytes gzip including the font**, down from
  ~70 500, and four tests read the built files to prove it cannot reach the
  simulation, the state machine, the audio engine or a hold handler. No shot can
  be thrown from the feed.
- **Safe use of sound — all three bullets.** Audio is created only inside a user
  gesture (and the feed bundle cannot import the engine at all); there is a mute
  button in the day bar, 48px, `aria-pressed`; and a `visibilitychange` handler
  suspends the audio context when the view is hidden.
  `src/tests/devvit-audio-rules.test.ts` holds all three.
- **Accessibility.** Nine of nine text pairs pass WCAG AA
  (`docs/qa/contrast.md`, generated, not hand-typed); every control is at least
  48px; a focus ring is measured on the first Tab target of each screen; Space
  or Enter takes the shot.
- **No Reddit IP ships.** `public/snoo.png` was removed (section 6).
- **Nothing in the simulation, scoring, seed, locks, Redis keys, scheduler,
  sharing or anti-cheat was touched.** The only backend addition is
  `yesterdayShots` in `GET /api/state`, read from `day:{n-1}:meta`.
