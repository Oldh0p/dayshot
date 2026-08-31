# Release checklist — DAYSHOT

Everything between the current state of the tree and `npx devvit publish`.

Current state: **223 tests green**, Devvit **0.14.2**, app renamed to `dayshot-game`,
`[DEV]` surface removed, Terms and Privacy written.

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
