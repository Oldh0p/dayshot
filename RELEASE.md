# Release checklist

Everything between the current state of the tree and `npx devvit publish`.
Nothing here is done. Work top to bottom; the blockers gate the rest.

Current state: **206 tests green**, Devvit **0.14.2**, one playtest run on
r/daily_one_shot_dev with a single player.

---

## 0. Blockers — the app cannot be submitted without these

### 0.1 Write `README.md`

**This is a hard rejection criterion, not a nicety.** Devvit Rules,
[App README requirements](https://developers.reddit.com/docs/devvit_rules#app-readme-requirements):

> Apps submitted with a missing, empty, default template README, or vague
> README will be rejected.

The repository still carries the template's README. It must be replaced with:

- an overview of 1000 words or fewer, **written for a non-developer**, saying
  what the app does, who it is for, and any critical operational notes;
- instructions to configure, deploy and interact with the full feature set.

Note that reviewers read it — and may run an LLM over it — as part of deciding
whether the app is approved.

- [ ] `README.md` rewritten and reviewed by someone who is not the author.

### 0.2 Decide the logged-out experience

**The build currently walls it, and Reddit's guidance says not to.**

`src/client/machine.ts` sends a visitor with no account straight to a
`logged_out` phase where holding the screen does nothing. That follows GDD 31
("Log in to take your shot"). It does not follow
[Building for Logged Out Players](https://developers.reddit.com/docs/guides/logged-out-users):

> Make your game playable for logged out users: don't gate the core experience
> behind a login wall. […] Don't require login to start gameplay. Reserve
> advanced features (saved progress, leaderboards, social) for logged-in users.

This is a product decision, not an implementation detail, and it is the largest
open question on this list. The consequences of each choice:

| | Keep the wall (GDD 31) | Open the shot (Reddit's guide) |
| --- | --- | --- |
| Review | Not a stated rejection criterion, but it is guidance in the launch path | Aligned |
| Reach | Every logged-out arrival bounces | Search and shared-link traffic can play |
| Complexity | None, already built | Moderate |

If you open it, the cheap path already exists: a logged-out visitor gets the
**warm-up** — a real shot, a real score, clearly marked as not counting — and
`showLoginPrompt()` at the moment the result screen would have shown a rank.
Nothing new has to be built; the warm-up phase is reused with a different exit.

Note that logged-out traffic does **not** count toward Reddit Developer Funds
qualified engagement, so this is a reach-and-conversion argument, not a revenue
one.

- [ ] Decision recorded, with reasoning, in `BACKLOG.md` or the GDD.
- [ ] If opening: implemented and tested from a private window.

### 0.3 Set `LAUNCH_DAY`

```bash
npm run launch-day <first public date, YYYY-MM-DD>
```

Paste the number into `src/shared/tunables.ts`. The first public post must read
**ONE SHOT #1**. This constant cannot be corrected after launch without
renumbering every day anyone has already played.

- [ ] Set, and the next post verified to read `#1`.

### 0.4 Move to a real home subreddit

The [launch guide](https://developers.reddit.com/docs/guides/launch/launch-guide)
requires a game to have "a dedicated, **non-test** subreddit (e.g. r/Pixelary)".
r/daily_one_shot_dev is a test subreddit and cannot be the home.

Per GDD M4 the game lives in a single home subreddit — Redis is namespaced per
installation, so the home subreddit *is* the world. Create it, install there,
and keep r/daily_one_shot_dev for playtests.

- [ ] Home subreddit created, named, and the app installed in it.

### 0.5 Strip the `[DEV]` surface

Remove from `devvit.json`:

- [ ] all five `[DEV]` menu items;
- [ ] the `daily-post-once` scheduler task;
- [ ] `dev.subreddit` (or leave it — it only affects `devvit playtest`).

And from the client:

- [ ] the `devProbe` line in `splash.tsx`, once question C below is answered.

`src/server/routes/dev.ts` may stay in the tree; nothing routes to it once the
menu entries are gone. Re-validate `devvit.json` against
<https://developers.reddit.com/schema/config-file.v1.json> afterwards.

---

## 1. Done

- [x] **Devvit 0.14.2.** Bumped from 0.14.1, exact-pinned, 206 tests green,
      build clean, no API surface change. The
      [changelog](https://developers.reddit.com/docs/changelog) describes 0.14.2
      as documentation-only: clarified Markdown support for comment text and
      character limits for post and removal notes. Zero functional risk.

      Beware: npm shows a `devvit@1.0.0`. It was published in **February 2022**
      and is a stale artefact, not a newer release. `latest` is `0.14.2`.

- [x] **Score comments reply to a stickied comment.** Required twice over —
      [Devvit Rules, user action requirements](https://developers.reddit.com/docs/devvit_rules#user-action-requirements)
      ("For generic score comments, reply to a sticky comment") and the
      [user actions guide](https://developers.reddit.com/docs/capabilities/server/userActions).

- [x] **The consent sheet shows the card itself**, and names the account it will
      come from. The rules require the player to understand "what will appear on
      Reddit and when their username is shown to others" before confirming; a
      description of a card is not the card.

- [x] **Comment deletion is honoured.** An `onCommentDelete` trigger drops the
      app's record of a published card, which is all the app holds about it, and
      hands the player their share back.

- [x] **Actions are never merged.** `POST MY SHOT`, `Practice` and `Copy card`
      are three separate controls, and nothing in the game is gated behind
      posting or subscribing.

---

## 2. Terms of Service and Privacy Policy

**Probably not required, and worth a deliberate decision rather than an
assumption.** The
[quality rules](https://developers.reddit.com/docs/devvit_rules#build-for-a-quality-experience)
say you must:

> Include your own terms of service and privacy policy if your app uses premium
> features (for example, payments, fetching, or using LLMs) **or if requested by
> Reddit**

This app uses none of the three: `devvit.json` declares only `redis` and
`reddit`, with no `http`, no `payments`, no LLM. So no URLs are required today.

Two caveats:

- The MVP's own roadmap adds payments in V2 (GDD 38), which would make both
  documents mandatory.
- Reddit may request them anyway during review.

- [ ] Decide: publish without them, and be ready to produce them within a day
      if review asks. Or write them now — a short privacy policy is easy here,
      because the honest answer is short: the app stores a Reddit user id, the
      day's shot, a streak, and aggregate counters; nothing leaves Reddit; there
      is no third party, no tracking, and no external fetch.
- [ ] If written, host them and add the URLs to the app's Developer Portal
      listing.

---

## 3. Data and deletion — one open question for Reddit

The rules require that on **account deletion**, "the related user ID (`t2_*`)
must be completely removed from your hosted datastores".

There is **no account-deletion trigger** in Devvit. The available triggers are
post and comment events only — verified against the `devvit.json` schema. So the
requirement cannot be met reactively by any app that keeps per-user state, and a
daily streak is per-user state by definition.

What the app already does to minimise the exposure:

| Key | Contents | Retention |
| --- | --- | --- |
| `user:{id}` | streak, longest, best, counters, flags. **No username, no profile data.** | No TTL — a streak is the point of the game |
| `user:{id}:played:{n}` | the day's shot, for audit | 90 days |
| `user:{id}:shared:{n}` | a permalink | 90 days, and dropped on comment delete |
| `day:{n}:names` | userId → username, for the leaderboard | 90 days |
| `day:{n}:scores` | userId → score | 90 days |

The only author-identifying data is the username cache, and it expires in 90
days. Everything else is keyed by an opaque id.

- [ ] Raise it with Reddit via r/Devvit modmail before or during review, and
      record the answer. Two candidate resolutions: shorten `user:{id}` to a
      rolling TTL that a returning player refreshes, or resolve usernames at
      read time via `reddit.getUserById()` and stop caching them at all — ten
      calls per result screen, which is affordable at this leaderboard size.

---

## 4. Finish PLAYTEST.md

The playtest is one player, one shot, one day. These remain.

### Tonight, at 00:00 UTC

- [ ] **B, second half — is the cron read as UTC?** `npm run dev` must be
      running. Look for `[daily] task="daily-post" …` and confirm its timestamp
      is UTC midnight. This is the only proof; the docs say UTC and a 0.11
      example says "12:00 UTC", but neither is evidence.
- [ ] **9.11.4 — the rollover.** Sit on `HOLD TO AIM` before midnight, fire
      after: `New day just dropped`, no shot spent.
- [ ] Then the grace window: fire offline just before midnight, restore the
      connection within 90 s, confirm the shot counts for **yesterday**.

### Multi-player — the solo run could not test these

- [ ] **9.11.2 — one shot a day across devices.** Two devices, same account,
      both on `HOLD TO AIM`, fire within a second. Exactly one score; both
      devices show it.
- [ ] **The leaderboard with a real field.** Get three or more accounts to
      shoot. Confirm the podium, the ±3 window, and that the headline switches
      from `#N TODAY` to `TOP x%` once the day passes 50 players — which will
      not happen on a dev sub, so verify the boundary another way or accept it
      on the unit tests.
- [ ] **Tie-breaking.** Two accounts on the same score: the earlier submission
      must rank higher.
- [ ] **9.11.5 — the warm-up**, on an account that has never opened the game.
- [ ] **E — who is credited by `runAs: 'USER'`**, as owner and as a non-owner.

### Surfaces

- [ ] **C — does `setPostData` reach a card already in the feed?** Run
      `[DEV] Refresh splash data`, then check the feed without reloading, after
      a pull-to-refresh, and in the mobile app.
- [ ] **D — logged out**, on web and mobile app, in feed and expanded. Blocked
      on 0.2 above: test whichever behaviour you decide on.
- [ ] **Mobile, logged in**, the whole loop. The launch guide requires testing
      "across mobile and web" and "from multiple accounts (developer,
      moderator, regular user), since permissions differ".
- [ ] **9.11.10 — 60 fps** on a mid-range phone.
- [ ] **9.11.12 — reduced motion, contrast, 48 px targets.**

### One rule to re-read against the build

> Avoids inline scrolling (scrolling inside inline webviews is prohibited).

The splash does not scroll. The result panel does — but it lives in `game.html`,
which is only ever reached through `requestExpandedMode`, never rendered inline.

- [ ] Confirm on a real device that the inline card never scrolls, and that the
      expanded view's scrolling is not read as a violation.

---

## 5. Publish

- [ ] `npm run test` green, `npm run tune` re-run if any tunable moved.
- [ ] Cross-post to r/Devvit with the **Feedback Friday** flair, and to
      r/GamesOnReddit with the **Feedback** flair. The launch guide recommends
      both before submitting.
- [ ] `npx devvit publish` — **not** `--public`. The default is unlisted, which
      is what a single-home-subreddit game wants; the guide explicitly advises
      against listing apps built for one subreddit.
- [ ] Expect **1–2 business days** for a version update, longer for a first
      submission. Reviews pause during some holiday periods; check r/Devvit.
- [ ] Every subsequent publish is re-reviewed, so batch changes weekly or less
      often.

---

## What Reddit's review actually checks

Drawn from [Devvit Rules](https://developers.reddit.com/docs/devvit_rules) and
the [launch guide](https://developers.reddit.com/docs/guides/launch/launch-guide).
Reviewers read the code, the README and example posts, test the app, and may use
third-party LLMs to assist.

**Where this app stands:**

| Area | Status |
| --- | --- |
| README present and non-vague | ❌ **blocker**, see 0.1 |
| Dedicated non-test subreddit | ❌ **blocker**, see 0.4 |
| Custom launch screen | ✅ the splash entrypoint |
| Immediately understandable to a new user | ✅ warm-up, one instruction, one input |
| Responsive, mobile and web | ⚠️ untested on mobile |
| No inline scrolling | ✅ believed, unverified on device |
| Score comments as the user, replying to a sticky | ✅ |
| Explicit manual action, no automation | ✅ |
| Player knows what will be published | ✅ the consent sheet shows the card |
| Actions not merged, nothing gated behind sharing | ✅ |
| `userGeneratedContent` set | n/a — required for `submitCustomPost` as user; this app only comments |
| Honours comment deletion | ✅ trigger added |
| Honours account deletion | ⚠️ no trigger exists, see 3 |
| Data minimisation, TTLs | ✅ 90 days on everything but the streak record |
| No external fetch, no LLM, no payments | ✅ none declared |
| ToS / privacy policy | ⚠️ not required today, see 2 |
| No Reddit or third-party IP | ✅ Pip is original; nothing borrows from Snoo |
| Accurate app description | ⚠️ written at publish time |
