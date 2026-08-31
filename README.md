# DAYSHOT

**One shot. Every day. No second chances.**

A daily skill game for Reddit. Every UTC day the whole planet gets the same
challenge, and every player gets exactly one attempt at it.

---

## What the app does

A post appears in the community at 00:00 UTC. Opening it shows a target across a
gap, and the day's conditions: a wind, a distance, a modifier such as *Moon
Gravity* or *Tiny Target*. You read them, decide how hard to throw, and then
hold the screen — a power gauge swings up and down, and you release when it
feels right.

The ball flies. Where it lands decides your score out of 100, to two decimals,
measured from the centre of the target. Then you find out how that compares:
your rank for the day, how many players you beat, and your streak of consecutive
days played.

**You only get one attempt.** There is no retry, no second chance, and nothing
in the game can be bought. That single attempt is the whole idea: it is what
makes a 98.73 worth talking about, and what makes everyone's result comparable,
because everyone played the same shot under the same conditions.

Afterwards you can practise the day's conditions as much as you like — clearly
marked, never ranked — and post your score card as a comment so the thread
becomes the day's conversation.

### Who it is for

Communities that want a daily reason to come back. It needs no moderation, no
content to write and no upkeep: the day's challenge is generated from the date
itself, the post creates itself, and there is nothing for anyone to approve.

### Critical operational notes

- **One post per UTC day**, created automatically at 00:00 UTC. The moderator
  menu can create it early if the scheduler is ever missed.
- **One shot per account per day.** Enforced server-side and unaffected by
  reloading, opening a second tab, or using another device.
- **Scores are computed on the server**, never accepted from the browser. The
  browser sends only how long the button was held.
- **Nothing leaves Reddit.** No external services, no fetch, no third parties,
  no tracking.
- **The day is the same for everyone on Earth**, and rolls over at 00:00 UTC
  rather than in local time.

---

## Installing and running it

The game is designed to live in **one home community**. Player data is stored
per installation, so each community that installs it gets its own separate
world; the intended shape is a single home subreddit where everyone plays
together.

### Setting it up

1. Install the app in the community.
2. That is all. Installing creates the first post immediately, and the scheduler
   takes over from the next midnight UTC.

### The moderator menu

| Action | What it does |
| --- | --- |
| Create today's post | Runs the daily routine now. Safe to press twice: if today's post already exists it takes you to it. |

That is the only moderator action, and it is a safety net rather than a chore —
the post normally creates itself.

---

## Playing

- **Hold anywhere** on the screen to charge, **release** to shoot. The whole
  screen is the button; there is nothing to aim at with a thumb.
- A press shorter than a tenth of a second is ignored the first time, so a
  mistap cannot spend your day.
- Holding as long as you like costs nothing. The gauge repeats, and waiting for
  the right moment is part of the game.
- **First time only:** a warm-up shot, clearly marked as not counting, so your
  first ranked score is a decision rather than an accident.
- **Not signed in?** You still get to shoot. That shot is a fixed demo level,
  not the day's, so it does not give away today's conditions.

---

## For developers

### Stack

TypeScript throughout. Devvit Web: a client served inside the post and a Node
server behind `/api/*` endpoints, configured by `devvit.json`.

- **Client** — Canvas 2D for the scene, React for the panels around it. No game
  engine, no physics library, no external assets. Sound is synthesised at run
  time, so the whole game is code.
- **Server** — Hono on Node, Redis for storage, a cron task for the daily post.
- **Shared** — the simulation, imported byte-identically by both sides.

### Layout

| Path | Contents |
| --- | --- |
| `src/shared/` | `sim.ts` (PRNG, level generation, physics, scoring), `tunables.ts`, `types.ts`, `copy.ts` |
| `src/server/` | Endpoints, Redis access, the daily post, anti-cheat |
| `src/client/` | Scene rendering, screens, audio, the state machine |
| `src/tests/` | Unit tests |
| `src/tools/` | `npm run tune`, `npm run launch-day` |

### Day numbering

The number in the title is anchored on the first day the installation ever
created a post, stored once in Redis. A compile-time constant cannot work: an
app is submitted for review and approved an unknown number of days later, so any
date baked in beforehand is a guess, and a wrong guess means either a post
titled `#0` or a second review cycle to fix a constant. Anchoring gives the
property the constant was for — the first post reads `#1` — without predicting
anything.

Levels are unaffected either way. They come from the absolute day number; the
anchor only decides what the title calls it.

### How the daily challenge works

The day number is `floor(epochMilliseconds / 86400000)` — an absolute UTC day,
identical everywhere. Hashing it seeds a small PRNG, which draws the modifier,
the distance, the plateau height, the wind, the launch angle and a gust table,
in an order that is frozen for life.

Nothing about a level is ever stored or transmitted: the client and the server
generate it independently from the day number, which is what lets the server
re-verify any shot from any past day, and what makes cheating uninteresting
rather than merely difficult. The browser sends only `holdMs`, an integer; the
server re-runs the same simulation and its answer is the one that counts.

Before a day's post goes up, the server sweeps the whole gauge to confirm some
release can score at least 99. If none can, it re-rolls the seed with a salt and
records which variant everyone plays. It almost never fires — but "the level
nobody could win" is not a bug anyone should ever meet.

### Commands

```bash
npm run test         # types, lint and unit tests — the gate before any commit
npm run dev          # devvit playtest
npm run build        # vite build into dist/
npm run tune         # Monte-Carlo calibration report
npm run launch-day   # inspect day numbering
npm run harness      # serve the client locally against a stubbed API
```

`npm run tune` is worth knowing about: the scoring curve is a product decision
about the distribution of results, and the only way to see that distribution is
to simulate a population of players. `CALIBRATION.md` records what it found,
including two of the design's original targets that turned out to be
unreachable, and why.

### Documents

| File | Contents |
| --- | --- |
| `ONE-SHOT-GDD.md` | The design document, written under the game's working title. Part IX is the specification this implements. |
| `CALIBRATION.md` | What `npm run tune` established, and which constants moved |
| `PLAYTEST.md` | How to run a playtest, and what to verify by hand |
| `RELEASE.md` | Everything between here and publishing |
| `AGENTS.md` | Working conventions, and platform facts that shaped the design |
| `BACKLOG.md` | Deliberately out of scope |

---

## Privacy

The app stores, in Reddit's own managed storage and nowhere else:

- a Reddit account id and, for each day played, the length of the button press
  and the resulting score;
- a streak, a personal best, and a handful of counters;
- for the leaderboard, the usernames of that day's players, kept 90 days;
- aggregate counts per day, belonging to nobody in particular.

Everything tied to a specific day expires after 90 days. There is no external
service, no analytics provider, no fetch off Reddit, and nothing is ever sold,
shared or used to profile anyone. The app comments on your behalf only when you
press the button that says so, after showing you the exact text it will publish.

---

## Where it lives

The game's home community is
[r/DayShot](https://www.reddit.com/r/DayShot/).

## Credits

Built on [Devvit](https://developers.reddit.com), Reddit's developer platform.
Pip, the ball with a face, is original to this game.
