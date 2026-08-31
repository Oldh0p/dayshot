# Playtest guide

How to run ONE SHOT on a real subreddit, and what to check by hand once it is
there. The automated suite covers everything it can (`npm run test`, 182 tests);
this document covers what only a human on a real device can judge.

---

## 1. Setup, once

```bash
npm install
npm run login
```

Pick the playtest subreddit. It must have **fewer than 200 subscribers** and you
must be a moderator of it. Either create one, or let Devvit create one for you
on first upload.

Set it as the default so every command targets it, by adding this to
`devvit.json` (the field is read by `devvit playtest`):

```json
{
  "dev": { "subreddit": "YOUR_TEST_SUB" }
}
```

Or export it per shell instead of editing the file:

```bash
export DEVVIT_SUBREDDIT=YOUR_TEST_SUB
```

## 2. First upload

```bash
npm run test && npm run build && npx devvit upload
```

`upload` runs the type check, the linter and the unit tests first, registers the
app, and creates the playtest subreddit if you did not name one.

## 3. Start the playtest

```bash
npm run dev
```

The CLI prints two links: the subreddit, and the same URL with
`?playtest=daily-one-shot` appended. **Use the second one** — it streams the
browser console into the terminal and live-reloads on save.

Installing the app fires `onAppInstall`, which creates today's post immediately.
You should not have to wait for midnight.

## 4. Create a post on demand

The scheduler runs at `0 0 * * *` UTC. To test without waiting:

> Subreddit → moderation menu → **`[DEV] Create today's post`**

It runs the same handler as the cron, including its idempotency: if today's post
already exists it navigates to it and says so, because that is exactly what the
scheduler would do. To get a genuinely new post, wait for the next UTC day or
run the action on a fresh install.

## 5. Walk the loop

1. Find the post in the feed. The card shows `ONE SHOT`, the day number, the
   modifier and `TAP TO SHOOT`.
2. Tap it. The game opens expanded.
3. A brand new account gets the warm-up first.
4. Hold anywhere, release, watch the shot, read the result.
5. Press `POST MY SHOT`, accept the consent sheet, and check the comment landed
   as a reply to the stickied seed comment.

### What will look wrong during a playtest, and is not

- **The score comment comes from the app account, not from you.** `runAs: 'USER'`
  only acts as the user on an approved, published version. During playtest it
  posts as the app account *unless you are the app owner*, in which case it is
  attributed to you. Both are expected.
- **Your streak may already be above 1** if you tested on previous days with the
  same account. `user:{id}` survives app updates.
- **`localStorage` is wiped on every code change**, because the iframe URL
  carries the version. The sound toggle and the practice tally reset; the shot,
  the streak and the consent do not, because they live in Redis.

### Resetting your own account between runs

There is no reset endpoint by design — a way to clear the daily lock would be a
way to shoot twice. Use a second Reddit account, or wait for the UTC rollover.

## 6. Reading the logs

`devvit playtest` streams server logs. Worth grepping for:

- `[daily]` — the post handler, once per day and once per menu press.
- `SIM_MISMATCH` — the client and the server disagreed by more than 0.01. This
  should never appear. If it does, the shared simulation has diverged and that
  is a release blocker.
- `[api] … failed` — any endpoint that threw.

---

# Manual verification checklist

The GDD 9.11 criteria that cannot be asserted from a test runner. Everything
else is covered by `npm run test`.

## 9.11.1 — Two devices, same level *(partly automated)*

The determinism contract is unit-tested, but the two-device half is not.

- [ ] Open the post on a phone and on a desktop browser at the same time.
- [ ] The wind value, the distance and the modifier match exactly.
- [ ] The target sits at the same place relative to the launcher.
- [ ] Hold for roughly the same time on both; the two scores should be close,
      and the *conditions* identical.

## 9.11.4 — UTC rollover mid-session

Best run a few minutes before 00:00 UTC.

- [ ] Open the game before midnight and leave it on `HOLD TO AIM` without
      firing.
- [ ] After midnight, fire. A `New day just dropped` modal appears and reloads
      the challenge; **no shot is spent**.
- [ ] Reload: the new day's number, modifier and conditions are showing.
- [ ] Repeat, but fire *just before* midnight with the network off, then restore
      it after midnight but within 90 seconds. The shot should be counted for
      **yesterday** (the grace window).

## 9.11.5 — The warm-up, once and only once

Needs a Reddit account that has never opened the game.

- [ ] First open shows `WARM-UP — this one doesn't count` above the scene.
- [ ] The warm-up shot shows a score and a distance, and **no rank, no
      percentile, no streak**.
- [ ] `That was practice. Now for real.` appears, then the normal aim screen.
- [ ] Fire the official shot. The result screen is complete.
- [ ] Close and reopen the post: the warm-up never appears again.
- [ ] Reopen the next day: still no warm-up.

## 9.11.3 — A shot survives a dropped connection

- [ ] Turn on airplane mode (or DevTools → Network → Offline).
- [ ] Fire. The score appears immediately, with `Saving your shot…` at the top
      and `· · ·` where the rank goes.
- [ ] Restore the connection. The rank and percentile fill in within a second.
- [ ] Reload the post: the same score, now confirmed.
- [ ] Repeat but **close the tab entirely** while offline, then reopen online.
      The shot should still be counted, exactly once.

## 9.11.2 — One shot a day *(partly automated)*

The concurrency is unit-tested; the multi-device half is not.

- [ ] Open the post on two devices with the same account, both on `HOLD TO AIM`.
- [ ] Fire on both within a second of each other.
- [ ] Exactly one score is recorded, and **both** devices end up showing that
      same score and rank.

## Juice (GDD 9.9, 26)

Watch a shot at normal speed, then again in slow motion by recording your
screen.

- [ ] **Anticipation** — Pip squashes wider and lower as the gauge climbs; the
      gauge arc fills in the accent colour.
- [ ] **Release** — a brief freeze, then the shot leaves with a short shake.
      It should feel like a punch, not a fade.
- [ ] **Flight** — Pip stretches along the direction of travel; the trail fades
      behind the head of the arc; the camera zooms very slightly.
- [ ] **Slow motion** — take a shot that lands within 30 units of centre. The
      last stretch of the flight slows to a quarter speed for a beat. It must
      **not** fire on a wild miss.
- [ ] **Impact** — dust bursts in proportion to the speed; a marker drops on the
      exact landing point; a dotted line runs back to the centre.
- [ ] **Count-up** — the score climbs from 0 over about 600 ms.
- [ ] **Cascade** — `TOP x%`, the rank, the streak, the CTA and the teaser
      arrive in that order, roughly 300 ms apart.
- [ ] **Bullseye** — a shot at 99 or above shows the `BULLSEYE` stamp *before*
      the score, plus a three-note rise.
- [ ] **Perfect** — a shot at 100.00 freezes, flashes white, throws confetti,
      stamps `🎯 PERFECT SHOT`, and plays the only fanfare in the game. Pip
      wears sunglasses. Use practice mode to find one.
- [ ] Nothing else in the game uses confetti or a fanfare.

## `prefers-reduced-motion` (GDD 9.11.12, 31)

Turn it on: iOS *Settings → Accessibility → Motion → Reduce Motion*; Android
*Settings → Accessibility → Remove animations*; desktop Chrome DevTools →
Rendering → *Emulate prefers-reduced-motion*.

- [ ] No screen shake at release.
- [ ] No slow motion on a close approach.
- [ ] No confetti on a Perfect — the stamp and the sound remain.
- [ ] Result lines appear without sliding.
- [ ] **The gauge still oscillates.** It is the gameplay, not decoration, and
      removing it would remove the game.
- [ ] The game is still fully playable and every score is still reachable.

## Accessibility and layout (GDD 9.11.12, 28, 49)

- [ ] The wind is always an **arrow and a number**. Cover the screen's colour
      (grayscale mode) — the wind is still readable, and the arrow points the
      way the wind pushes.
- [ ] The target's rings are distinguishable in grayscale.
- [ ] Every tappable control is at least 48 px: `POST MY SHOT`, `Practice`,
      `Copy card`, the `?` button, the consent buttons.
- [ ] On a 360 px-wide device nothing is clipped and no text falls below 12 px.
- [ ] The whole arc is visible without scrolling or panning, on both the
      shortest and the tallest phone you have.
- [ ] Nothing but the trigger is interactive while charging — dragging across
      the screen mid-hold must not select text or scroll the page.

## Practice (GDD 9.11.11)

- [ ] Before the official shot there is **no** `Practice` control anywhere.
- [ ] After it, `Practice` appears next to `Copy card`.
- [ ] In practice: a large `PRACTICE` watermark, a visibly desaturated palette,
      the score in italics.
- [ ] The official shot is drawn as a faint dotted ghost.
- [ ] There is no share button of any kind.
- [ ] `Practice best today: … (in N tries)` counts up as you play.
- [ ] Leaving practice restores the official result unchanged.
- [ ] A screenshot of a practice shot could not be passed off as an official one.

## Sharing (GDD 9.11.7)

- [ ] The first `POST MY SHOT` asks for consent, in its own sheet, separate from
      every other action.
- [ ] Declining posts nothing.
- [ ] Accepting posts the Format B grid as a **reply to the stickied seed
      comment**, not as a top-level comment.
- [ ] The grid's ⚫ is right of the bullseye on an overshoot and left on an
      undershoot.
- [ ] The card contains the score, the percentile and the streak, and **nothing
      about the power or the hold**.
- [ ] Pressing the button again says `Already posted today` and does not post a
      second comment.
- [ ] `Copy card` puts Format A and Format B on the clipboard.
- [ ] The consent sheet does not appear again the next day.

## The daily post (GDD 9.11.8)

- [ ] The title reads `🎯 ONE SHOT #N — <Modifier>. One try. 24 hours.`
- [ ] The seed comment is stickied and distinguished.
- [ ] On the second day the seed comment quotes yesterday's numbers.
- [ ] Running `[DEV] Create today's post` twice produces one post.

## Performance (GDD 9.11.10)

On a mid-range phone from around 2022, or Chrome DevTools with 4× CPU throttling:

- [ ] The gauge oscillates smoothly; no stutter during the hold.
- [ ] The flight animation does not drop frames.
- [ ] The Perfect confetti burst stays smooth.
- [ ] The gauge takes the same time to go up and down on a fast and a slow
      device. It is driven by the clock, not by frames, so this should hold.

## Logged out (GDD 31)

- [ ] Open the post in a private window with no Reddit session.
- [ ] The day's scene is visible behind the prompt — the reason to want in comes
      before the ask.
- [ ] `Log in to take your shot` and a working login button.
- [ ] Holding the screen does nothing.
