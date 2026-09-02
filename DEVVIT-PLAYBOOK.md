# Building a Reddit app — the DAYSHOT playbook

Everything learned building, reviewing, rejecting, fixing and shipping DAYSHOT,
written so the next Reddit app does not have to learn it again.

DAYSHOT is a daily one-shot skill game on Devvit Web 0.14.2: a feed card, an
expandable game, a server on Redis, a daily puzzle from a seed, a leaderboard
and a streak. It went through Reddit's app review, was rejected once, and
shipped. **326 tests, 63 automated QA captures, zero scroll, zero clipping.**

Almost none of this document is about throwing a ball at a target. It is about
the platform, the review, the rig, and the traps.

---

---

## Contents

| | |
| --- | --- |
| §0 | How to use this |
| §1 | The ten-minute version — README, re-review, user actions, deletions, IP |
| §2 | What Reddit actually requires — the inline-mode checklist |
| §3 | Shipping: the CLI, versions, and review |
| §4 | The skeleton: `devvit.json`, the build, and TypeScript |
| §5 | The server, Redis, and determinism |
| §6 | The client: state, rendering, design system |
| §7 | Copy, content, and writing things down |
| §8 | Testing and the QA rig |
| §9 | Your tooling will lie to you, and it will lie flatteringly |
| §10 | What only a real device told us |
| §11 | What makes a Reddit app work — Reddit's own guidance |
| §12 | How to run a project like this with an assistant |

Sections 4 to 8 were extracted from the codebase and fact-checked against it;
every path in them was opened. Sections 1 to 3 and 9 to 12 are the parts that
are not in the code — the review, the CLI, and what went wrong.

---

## 0. How to use this

**If you are starting a new app**, read §1 (the ten-minute version), then §2
(what Reddit requires) *before designing any screen* — two of its rules are
layout decisions you cannot retrofit cheaply. Then copy the skeleton in §4 and
the tooling in §7.

**If you are stuck**, the traps are collected in §9. Nine ways this project's
own tools reported success while being wrong.

**What to lift wholesale**, in rough order of value:

| From DAYSHOT | Into your app | Why |
| --- | --- | --- |
| `tools/qa/` | verbatim, minus the app-specific capture list | A dependency-free headless-Chrome rig that measures viewports, scrolling, clipping, contrast, focus rings and frame times |
| `tools/devharness/` | adapt the routes | Lets the whole app run in a plain browser with no Devvit, which is what makes the rig possible |
| the guard-test pattern | verbatim | Tests that read source files to enforce a *platform rule*. Review rules do not fail visibly; they fail in review, days later |
| `src/client/ui/tokens.ts` + its CSS mirror | copy and repaint | One place for colour, type and duration, with a test that keeps the TS and CSS copies honest |
| `src/shared/copy.ts` | the shape, not the strings | Every player-facing word in one module |
| `src/client/machine.ts` | the shape, not the phases | A reducer where transient states sit *beside* the phase instead of replacing it |
| `AGENTS.md` | adapt | So an AI assistant works to your conventions instead of its defaults |
| `devvit.json` | adapt | §4 has the minimum viable version |

**What NOT to copy:** `src/shared/sim.ts`, the scoring, the verdict bands and
anything under `src/client/scene/` — that is one game's physics and art, and it
will fight you.

## 1. The ten-minute version

Read `docs/devvit_rules.md` in `reddit/devvit-docs` — the binding rules page —
plus the "Inline mode requirements" checklist (§2). Between them they decide
whether your app is approved. Here is what actually catches people.

### 1.1 Your README is a rejection criterion

> Apps submitted with a missing, empty, default template README, or vague
> README will be rejected.

It must be written **for a non-developer**, with an overview of 1000 words or
fewer at the top saying what the app does, who it is for, and critical
operational notes — then how to configure, deploy and use the whole feature set.
Put the developer material in a clearly separate section further down.

This is free marks and people lose them. Write it before you submit, not after.

### 1.2 Every publish is re-reviewed

> You are required to resubmit your app for Reddit app review every time you
> publish changes to it.

Updates that do not change functionality get a "streamlined review". Review
takes **about a week**, longer for premium features. Plan releases accordingly:
batching several changes into one submission is not laziness, it is the
economical shape.

Outcomes are: approved; approved with non-blocking feedback; rejected with
feedback; or rejected for a rules violation. Reddit says it may use third-party
LLMs to help conduct the review.

### 1.3 Posting or commenting as the user has its own rulebook

If your app posts or comments on a user's behalf — any score sharing does — the
rules are explicit and "apps that do not meet them will be rejected":

- Score comments must be submitted **as the user**, never as the app account.
- The action must be **explicit and manual**, and the user must understand what
  will appear on Reddit *before* confirming.
- **Generic score comments must reply to a sticky comment.** Only a score with
  meaningful user commentary may be top-level.
- Never gate progress on posting, commenting or subscribing, and never merge a
  gameplay action with a share — they stay separate choices.

The DAYSHOT implementation is worth copying whole: when the daily post is
created the app posts its own comment and stickies it
(`src/server/core/post.ts`, `runAs: 'APP'` then `comment.distinguish(true)`),
and every score card is a reply to that comment with `runAs: 'USER'`
(`src/server/core/share.ts`), falling back to the post only if the sticky is
missing. The consent sheet renders **the exact text that will be published**
before the user confirms — a description of a card is not the card.

### 1.4 Deletions are your job, not Reddit's

You must honour deletions in your own datastore:

- On `PostDelete` / `CommentDelete` triggers, remove the content — including
  from Redis and from any external service. Identifiers and timestamps may be
  kept for context.
- On account deletion, the `t2_*` user id and every author-identifying field
  must be **completely removed** from your stores.
- Reddit recommends deleting stored user data within 30 days; use Redis key
  expiry to make it automatic rather than remembered.

DAYSHOT keeps a reverse index from comment id to `userId|dayNumber` precisely
so a delete trigger can find what to forget — the trigger does not reliably
carry a user id. That indirection is the pattern; copy it.

### 1.5 Reddit's IP is not yours

No Reddit trademarks, no brand assets, and explicitly **no Snoo as a character
in your game**. Your app needs an original name and branding that does not
suggest partnership or endorsement.

DAYSHOT shipped `public/snoo.png` for two versions — unused by any code, but
copied into the bundle because everything in `public/` is (§3.4). Audit that
directory.

### 1.6 Terms and privacy, if you use premium features

Payments, `http-fetch`, and LLMs are premium features: they need prior app
approval *and* your own terms of service and privacy policy. If you are not
using them, you still need to be accurate about your data practices.

## 2. What Reddit actually requires

Devvit's app review is not a taste test. It is a checklist, it is published, and
the reviewer works from it. Read it before you write a line of UI, because two
of its items are structural and expensive to retrofit.

The list lives at `docs/capabilities/server/launch_screen_and_entry_points/view_modes_entry_points.md`
in `reddit/devvit-docs`, under the heading **"Inline mode requirements —
Apps must meet these requirements for approval and featuring"**. There are five
items. DAYSHOT was rejected on one and was quietly failing two more.

### 2.1 No scrolling inside the in-line web view

Reddit's rejection of DAYSHOT 0.4, in full:

> **In-line Scroll Trap:** Scrolling within in-line web views is not allowed.
> This can interfere with Reddit-native interactions and gestures. Consider
> using buttons to navigate or taking the user to Expanded Mode.

The reasoning is the feed: a scroll inside your post eats the swipe Reddit was
waiting for. What made this expensive is that it is not a styling bug, it is a
layout budget. The result screen stacked a verdict (~400px) and a ten-row
leaderboard (~260px) into a 512px viewport. No amount of CSS fixes that; the
board had to become a separate page reached by a button.

**Design for it from the start.** Decide the worst-case height of every screen
at 320×568 before you build it, and give anything that does not fit its own
page. Then lock the document so no future screen can reintroduce it:

```css
html, body, #root { overflow: hidden; height: 100%; }
```

...and add a test that fails on any scrollable container (§ the guard-test
pattern). Reasoning about which entrypoint a panel "belongs to" is exactly the
mistake that produced the rejection: the rule is about the web view, not about
which entrypoint opened it.

### 2.2 Safe use of sound — three bullets, not one

> - Audio should not play unless there is a user interaction
> - Include a button to mute in your game
> - Use the visibilityChange handler to mute any sounds if a user scrolls away

Almost everyone satisfies the first by accident (browsers enforce it anyway) and
then fails the other two. A mute control inside a help sheet is not "a button to
mute in your game". Budget a 48px control on the main screen and a
`visibilitychange` listener, from day one.

### 2.3 User-initiated expanded mode

> Apps cannot auto-launch into expanded mode or auto-close without a user
> action. Must have explicit user interaction (clearly labeled button or
> action). Default view should respect standard post boundaries.

Your feed card needs an honest CTA. DAYSHOT's first one said `TAP TO SHOOT`,
which promised a throw the tap did not take — a label that lies is both a review
risk and the fastest way to lose a first-time player.

### 2.4 What "review" actually means

Review is triggered by *capability*, not suspicion. The CLI tells you which:

```
Apps that meet the following criteria must be reviewed before they can be published:
 - Creates custom posts
```

If your app creates custom posts — which any game or interactive post does —
you are in the queue. It is not personal and there is nothing to appeal.

## 3. Shipping: the CLI, versions, and review

### 3.1 The two commands that are not the same

This is the single most common waste of a day.

| Command | What it does |
| --- | --- |
| `npx devvit upload` | Uploads a new version **visible only to you**. Installable only on a test subreddit with fewer than 200 subscribers. Nothing changes for anyone else. |
| `npx devvit publish` | Creates a version, uploads it **together with your source code** for review, and files the publish request. |

`publish` includes the upload. You never need to run both. If you have run
`upload` and are wondering why the subreddit shows the old game, this is why.

Useful flags:

```bash
npx devvit publish --bump minor    # 0.0.11 -> 0.1.0; patch is the default
npx devvit publish --version 1.0.0 # explicit; no prerelease versions allowed
npx devvit publish --public        # submit for PUBLIC listing; unlisted otherwise
npx devvit publish --withdraw      # pull back a pending publish request
```

**Unlisted is the default and is usually what you want.** It does not mean
private: once approved you can install it on any subreddit you moderate. It only
means it does not appear in the public app directory.

Publishing uploads your **source code** to Reddit, honouring your root
`.gitignore`. Know that before you put anything in the tree you would not send.

### 3.2 Know which app you are publishing to

Devvit apps have a display name and a URL slug and they can differ. DAYSHOT's
`devvit.json` says `dayshot-game`, `devvit view` answers `App name: dayshot`,
and the upload prints a link to `developers.reddit.com/apps/dayshot-game`. One
app, two names. Meanwhile an abandoned earlier app, `daily-one-shot`, still sat
in the account at the exact version number that had been rejected — an easy way
to fix the wrong app.

Before your first publish of a session:

```bash
npx devvit whoami      # which Reddit account is the CLI acting as
npx devvit list apps   # every app that account owns, and its install count
npx devvit view        # resolves THIS project: name, owner, latest version
```

If the CLI once told you your preferred name was taken and renamed the app for
you, write the final name down. `devvit.json`'s `name` is the identity; nothing
else is.

### 3.3 Versions are the server's, not your package.json

`package.json` version stays at whatever you set it to and is irrelevant.
Devvit's server keeps the app version and the CLI bumps it on every upload —
which means `devvit playtest` burns versions fast (DAYSHOT reached 254 of them).
Do not try to keep the two in sync; you will only confuse yourself.

### 3.4 The two traps that bite after upload

**`public/` ships wholesale.** Everything in that directory is copied into the
bundle whether or not any code imports it. DAYSHOT shipped 110 KB of Reddit's
own Snoo mascot for two versions while the release notes claimed no Reddit IP
was used. Audit that directory before every submission.

**`localStorage` is wiped by every release.** Devvit changes the web view's
iframe URL on each app version, which is a new origin. Anything you keep there
is gone the next time you ship. Only put conveniences there — a mute
preference, a draft, a retry queue. Everything that matters (locks, streaks,
scores, consent) belongs server-side in Redis.

### 3.5 After approval

```bash
npx devvit install <subreddit>
```

You will get an email when the app is approved. Until then, nothing is
installed on your public subreddit and there is nothing to watch.

### 3.6 Answering a rejection

Reply in the **modmail thread the rejection came from** — that is where the
reviewer and the history are; a fresh email starts cold. Lead with the version
number and the fix, in that order, then list anything else that changed since
the rejected version so the reviewer does not discover it by surprise. Keep it
under a screen: a reviewer working a queue reads the first paragraph and then
goes and checks.

## 4. The skeleton: devvit.json, the build, and TypeScript

Project root for every path below: `C:/Dev/daily-one-shot`.

A Devvit Web app is three artifacts glued by one file. `devvit.json` is the manifest Reddit reads: it names the app, declares which platform plugins the app may touch (`permissions`), lists the HTML entrypoints a post can render (`post.entrypoints`), points at a single bundled CommonJS server file (`server`), and registers every server route that the platform itself will call — menu items, event triggers, cron tasks, form submits, payment hooks. Nothing is registered in code; if a route is not in `devvit.json`, the platform can never reach it. The build is a single `vite build` driven by the `devvit()` plugin from `@devvit/start/vite` (`vite.config.ts` is eight lines). That plugin reads `devvit.json` itself, uses Vite's Environment API to run a `client` and a `server` build in parallel, and hardcodes both output directories: client → `dist/client`, server → `dist/server/index.cjs`. It also enforces the client/server split at resolve time — importing anything under `src/server/` or `src/api/` from client code is a build error with a red banner, not a runtime surprise.

The routing between `devvit.json` and the filesystem is convention-driven and mostly undocumented in the schema. If `src/client/` exists, the plugin silently makes it the Vite root, so `"entry": "splash.html"` in devvit.json means `src/client/splash.html` and emits `dist/client/splash.html`. The *key* of the entrypoint (`default`, `game`) names the emitted JS and CSS, not the HTML: `default` + `splash.html` produced `dist/client/{splash.html, default.js, default.css}`. The server entry is not configurable at all — `getServerEntry()` probes `src/api/index.ts`, then `src/server/index.ts`, then `src/index.ts`, and throws if none exists; `server.entry` in devvit.json names the *output* filename that Reddit will run, and it must be `index.cjs` even though the schema's default says `index.js`.

TypeScript is set up as five composite projects under `tools/` (`tsconfig.client|server|shared|node|vite.json`, all extending `tools/tsconfig.base.json`), with the root `tsconfig.json` holding nothing but references, so `tsc --build` type-checks the whole tree in one pass and each half gets its own `lib`, `types` and module-resolution conditions. The base is close to maximally strict — `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`, `noUncheckedSideEffectImports`, `types: []` — plus `allowImportingTsExtensions` + `emitDeclarationOnly` so that every relative import carries an explicit `.ts`/`.tsx` extension and the Node test runner can execute the same source with `--experimental-strip-types` and no bundler. That one decision (real `.ts` extensions everywhere) is what lets 326 tests run with zero test framework: `node --test "src/tests/**/*.test.ts"`. There is no Vitest, no Jest, no ts-node.

### 4.1 What to lift

| Thing | Where | Verdict | Why |
| --- | --- | --- | --- |
| The five-project TypeScript setup | `tools/tsconfig.base.json (+ tsconfig.client.json, tsconfig.server.json, tsconfig.shared.json, tsconfig.node.json, tsconfig.vite.json, and the reference-only root tsconfig.json)` | copy as-is | This is the single highest-value artifact. It encodes three non-obvious things a new Devvit app gets wrong: `customConditions: ["browser"]` on the client project (without it `@devvit/web/client` resolves to a stub that prints "Can't import client code in th... |
| vite.config.ts | `vite.config.ts` | copy as-is | The whole build config. The devvit() plugin derives outputs, roots, entrypoints and the server bundle from devvit.json — there is nothing app-specific to change. Drop `tailwind()` if you are not using Tailwind, drop `react()` if you are not using React. |
| devvit.json skeleton | `devvit.json` | copy + adapt | Correct shape for a two-entrypoint web-view app with redis, a cron, a moderator menu item and two triggers. Change `name` (permanent — see traps), the entrypoint names, the endpoints and the cron. Keep `post.dir`, `server.dir`, `server.entry` and the `scrip... |
| package.json scripts + engines block | `package.json` | copy as-is | Encodes the whole workflow: `test` is a three-part gate (types, lint, unit) wired into `deploy` so you cannot upload a broken build; `test:unit` runs raw .ts through node's own test runner with no framework; `dev`/`launch` map onto the Devvit CLI. Requires ... |
| Server entry: Hono mounted on Devvit's createServer | `src/server/index.ts` | copy as-is | 23 lines, zero app-specific logic. This is the only shape the platform accepts: a Hono app whose `/api/*` routes serve the web view and whose `/internal/*` routes serve menu/trigger/scheduler callbacks, handed to `serve()` with Devvit's `createServer` and `... |
| The platform seam — one file that imports @devvit/web/server, everything else written against ports | `src/server/platform.ts` | copy + adapt | `export const store: RedisLike = redis;` is a structural assignment that fails at compile time if Devvit's Redis surface drifts. Everything under src/server/core/ takes `RedisLike`/`RedditLike` as a parameter, which is what makes 326 tests runnable with no ... |
| Entry HTML + its module script | `src/client/game.html and src/client/game.tsx (and src/client/splash.html + src/client/inline/main.ts)` | copy as-is | Exact shape a Devvit entrypoint HTML must have: plain relative `<script type="module" src="...">` pointing at a sibling source file, a `#root` div, and the `maximum-scale=1.0, user-scalable=no` viewport that stops pinch-zoom fighting the feed. Vite rewrites... |
| Ambient module declarations for non-JS imports | `src/client/global.ts and src/client/module.d.ts` | copy as-is | `noUncheckedSideEffectImports: true` in the base tsconfig makes `import './index.css'` a type error without these. Two tiny files, and their absence produces an error message that does not mention CSS. |
| Per-directory ESLint flat config bound to the matching tsconfig project | `eslint.config.js` | copy + adapt | Four blocks — server/shared/tests+tools/client — each pointing `parserOptions.project` at its own tools/tsconfig.*.json, which is what makes type-aware rules work across a multi-project repo. The one globally-enabled rule that matters is `@typescript-eslint... |
| Local dev harness: static server + stubbed Devvit API | `tools/devharness/server.mjs` | keep the shape | `vite dev` does not work with the Devvit plugin (it throws), and `devvit playtest` needs a subreddit and a network round trip per save. This 153-line node:http server serves `dist/client` and answers `/api/*` from in-memory state, with a `/api/reset?played=... |
| Source-level guard test for the in-line scroll ban | `src/tests/no-inline-scroll.test.ts` | copy as-is | This app was rejected by Reddit review for an "In-line Scroll Trap". The test greps every .ts/.tsx/.css/.html file under src/client for `overflow: auto|scroll` (comments stripped first, so the explanatory comment does not trip it) and separately asserts ind... |
| Source-level guard test for Reddit's "Safe use of sound" checklist | `src/tests/devvit-audio-rules.test.ts` | copy + adapt | Same technique against a different review rule: no AudioContext outside a gesture path, a real mute button in the game (with aria-pressed and a >=48px hit target), and visibilitychange -> suspend. The assertions name DAYSHOT files (client/audio.ts, screens/... |
| Bundle-budget + import-graph test that reads the built output | `src/tests/inline-bundle.test.ts` | copy + adapt | Walks relative imports from an entry file to build a module graph, asserts a whitelist of reachable modules and a forbidden list of packages, then gzips every asset referenced by the built HTML plus the fonts dir and asserts a byte budget. The feed card get... |
| Typed client API wrapper returning a discriminated result instead of throwing | `src/client/api.ts` | copy + adapt | Every Devvit web view talks to its server by plain `fetch('/api/...')` — there is no tRPC or RPC layer despite what the stock template README says. This wraps it in `ApiResult<T> = {ok:true,data} | {ok:false,code}` with a 'NETWORK' code for the offline case... |
| Internal-endpoint response contracts for menu / trigger / scheduler routes | `src/server/routes/menu.ts, src/server/routes/triggers.ts, src/server/routes/scheduler.ts` | copy + adapt | The three response types are not guessable and are not in devvit.json's schema: menu items answer `UiResponse` ({showToast, navigateTo}) from '@devvit/web/shared'; triggers answer `TriggerResponse` ({status:'success'|'error', message}) with request types li... |
| The "Platform facts that shape the design" section of the working-conventions doc | `AGENTS.md` | copy + adapt | A hard-won list of Devvit runtime facts that are not in the schema: Redis has no zRevRank; `set(k,v,{nx:true})` has an undocumented return value so daily locks use hSetNX + read-back nonce; scheduler cron strings are UTC; localStorage is wiped by every app ... |
| Prettier + gitignore | `.prettierrc, .gitignore` | copy as-is | `{ singleQuote: true, trailingComma: 'es5', quoteProps: 'preserve' }`. .gitignore is `node_modules / .DS_Store / dist / .env / .claude/` — note `dist` is ignored even though devvit.json's post.dir and server.dir point inside it; the build runs at upload tim... |

### 4.2 Worth seeing in full

**The five-project TypeScript setup** — `tools/tsconfig.base.json (+ tsconfig.client.json, tsconfig.server.json, tsconfig.shared.json, tsconfig.node.json, tsconfig.vite.json, and the reference-only root tsconfig.json)`

```
// tools/tsconfig.base.json (excerpt)
"exactOptionalPropertyTypes": true,
"noUncheckedIndexedAccess": true,
"noUncheckedSideEffectImports": true,
"noUnusedLocals": true,
"noUnusedParameters": true,
"types": [],
"isolatedModules": true,
// Relative imports carry explicit .ts/.tsx extensions so that the Node test
// runner (--experimental-strip-types) can resolve them without a bundler.
"allowImportingTsExtensions": true,
"emitDeclarationOnly": true,
"module": "ESNext",
"moduleResolution": "Bundler",
"composite": true

// tools/tsconfig.client.json — the line that matters
"customConditions": ["browser"]
// tools/tsconfig.server.json / tsconfig.node.json
"customConditions": [], "types": ["node"], "exactOptionalPropertyTypes": false
```

**vite.config.ts** — `vite.config.ts`

```
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { devvit } from '@devvit/start/vite';

export default defineConfig({
  plugins: [react(), tailwind(), devvit()],
});
```

**devvit.json skeleton** — `devvit.json`

```
{
  "$schema": "https://developers.reddit.com/schema/config-file.v1.json",
  "name": "dayshot-game",
  "permissions": { "redis": true, "reddit": { "enable": true, "scope": "user", "asUser": ["SUBMIT_COMMENT"] } },
  "post": { "dir": "dist/client", "entrypoints": {
      "default": { "entry": "splash.html", "height": "tall" },
      "game":    { "entry": "game.html",   "height": "tall" } } },
  "server": { "dir": "dist/server", "entry": "index.cjs" },
  "menu": { "items": [{ "label": "...", "location": "subreddit", "forUserType": "moderator", "endpoint": "/internal/menu/create-today" }] },
  "triggers": {
    "onAppInstall": "/internal/triggers/on-app-install",
    "onCommentDelete": "/internal/triggers/on-comment-delete"
  },
  "scheduler": { "tasks": { "daily-post": { "endpoint": "/internal/scheduler/daily", "cron": "0 0 * * *" } } },
  "scripts": { "dev": "vite build --watch", "build": "vite build" },
  "dev": { "subreddit": "dayshot_game_dev" }
}
```

`onCommentDelete` is in the skeleton on purpose: §1.4 makes honouring deletions
your obligation, not Reddit's, and a trigger you add later is a trigger you add
after the data you should have deleted is already there.


### 4.3 Rules this codebase holds itself to

| Rule | Why | Enforced by |
| --- | --- | --- |
| Every relative import carries an explicit `.ts` / `.tsx` extension. | The unit tests run the TypeScript sources directly under `node --experimental-strip-types`, with no bundler and no path resolution. Node will not guess extensions. 186 relative imports acros | tools/tsconfig.base.json (`allowImportingTsExtensions: true` + `emitDeclarationOnly: true`), and `npm run test |
| No `enum`, no `namespace`, no constructor parameter properties (`constructor(private x) {}`) anywhere reachable from a test. | Node's `--experimental-strip-types` is erasure-only: it deletes type syntax, it does not compile. These three constructs emit runtime code and are rejected outright. | convention only (documented in AGENTS.md rule 5); the failure is a hard parse error at test time. |
| Every server route that the platform calls must be registered in `devvit.json` — menu items, triggers, scheduler tasks, forms, payment hooks, external endpoints. | There is no code-side registration API. An unregistered `/internal/...` route is unreachable, and it fails silently rather than 404-ing anywhere you would notice. | convention only (AGENTS.md, 'Whenever an endpoint is added, register it in devvit.json'). |
| Internal endpoints live under `/internal/`, external ones under `/external/`, and the web view only ever talks to `/api/`. | The manifest schema enforces the prefixes (`InternalEndpoint` pattern `^/internal/.+`, `ExternalEndpoint` pattern `^/external/.+`), and a web view is only allowed to fetch `/api/` paths when | the JSON schema at node_modules/@devvit/shared-types/schemas/config-file.v1.json |
| Client and server share code only through a third directory (`src/shared/`), never by importing across. | The devvit Vite plugin fails the build with a red 'Detected server code in the client!' banner on any client import that resolves inside `src/server/` or `src/api/`. The reverse direction is | node_modules/@devvit/start/vite/index.js — `checkViolation()` called from both the `resolveId` and `load` hook |
| `src/shared/` compiles with `types: []` and a WebWorker/ES2023 lib — no DOM, no Node. | Shared modules run in both a browser web view and a bundled Node server. Letting either environment's globals leak in makes it possible to write code that only works on one side and type-che | tools/tsconfig.base.json (`types: []`) + tools/tsconfig.shared.json (`lib: ["WebWorker", "ES2023"]`); each oth |
| Type aliases over interfaces; named exports over default exports; never cast — model the data so the cast is unnecessary. | House style, and the no-cast rule keeps `noUncheckedIndexedAccess` honest: the codebase reaches for `!` on a regex match group rather than casting an unknown response shape. | convention only (AGENTS.md 'Code style'). |
| Reddit review rules are guarded by tests that read source or built files, not by memory. | Every one of these failures is invisible during development and only surfaces in app review days later. Version 0.4 was rejected for an in-line scroll trap; the audio rules were the price of | src/tests/no-inline-scroll.test.ts, src/tests/devvit-audio-rules.test.ts, src/tests/inline-bundle.test.ts — al |
| `npm run deploy` = `npm run test && devvit upload`; `npm run launch` = deploy + `devvit publish`. Never upload without the gate. | `devvit upload` will happily ship a build that does not type-check. The gate is types + lint + 326 unit tests. | package.json scripts (the `&&` chain). |
| `@typescript-eslint/no-floating-promises` is an error everywhere except `src/tests/**/*.test.ts`. | Almost every Devvit API is async and most of them are fire-and-forget-shaped (analytics, toasts, scheduler bumps). An unawaited promise in a serverless handler is a request that ends before  | eslint.config.js |
| Static files the client fetches by URL live in `public/` at the repo root and are referenced with a leading slash (`/fonts/x.woff2`). | A Devvit web view may not fetch anything off Reddit's origin — no Google Fonts, no CDN. Vite's publicDir copies `public/` verbatim into `dist/client/`, so `/fonts/...` resolves at runtime. | node_modules/@devvit/start/vite/utils.js `resolvePublicDir()`, which also throws if both `public/` and `src/cl |
| `exactOptionalPropertyTypes` is on for client and shared, deliberately off for server and node/test projects. | Devvit's server-side types and the test/tooling code do not survive it; the strictness is kept where the project's own types live. | tools/tsconfig.base.json sets it true; tools/tsconfig.server.json and tools/tsconfig.node.json override it to  |

### 4.4 Traps

**The client tsconfig must set `customConditions: ["browser"]`, or `@devvit/web/client` resolves to a stub module.**

- *Symptom:* `import { context, requestExpandedMode } from '@devvit/web/client'` type-checks as an empty module — every named import is an error, or in a bad bundler setup it builds and the page logs "Can't import client code in the server!" and does nothing. Nothing in the error text mentions tsconfig.
- *Fix:* In the client project only: `"customConditions": ["browser"]`. In server/node projects set `"customConditions": []` explicitly so the `default` condition wins. `@devvit/web`'s exports map is `"./client": { "browser": "./client/index.js", "default": "./client/clientImportInServerCodePanic.js" }` — the panic file is the fallback, so the wrong condition is the silent path.
- *Evidence:* `node_modules/@devvit/web/package.json exports map; tools/tsconfig.client.json `"customConditions": ["browser"]`; node_modules/@devvit/web/client/clien`

**`server.entry` must be `"index.cjs"`, but the schema's documented default is `"index.js"`.**

- *Symptom:* Upload succeeds, the app installs, and every `/api/` call fails because Reddit runs a file that does not exist. The build emitted `dist/server/index.cjs`.
- *Fix:* Always write `"server": { "dir": "dist/server", "entry": "index.cjs" }` explicitly. The Vite plugin hardcodes the output filename and format (`format: 'cjs'`, `entryFileNames: 'index.cjs'`); the schema default was never updated.
- *Evidence:* `node_modules/@devvit/start/vite/index.js:258 `entryFileNames: 'index.cjs'` vs config-file.v1.json `server.entry` `"default": "index.js"``

**`post.dir` must be `"dist/client"`, but the schema's documented default is `"public"`.**

- *Symptom:* Nothing is uploaded for the web view, or your unbuilt `public/` folder is uploaded instead of the bundle.
- *Fix:* Always write `"post": { "dir": "dist/client", ... }`. The plugin hardcodes `const clientOutDir = path.resolve(repoRoot, 'dist/client')` and there is no option to change it.
- *Evidence:* `node_modules/@devvit/start/vite/index.js:192; config-file.v1.json `post.dir` `"default": "public"``

**The server source path is convention, not configuration. `server.entry` names the OUTPUT file; the INPUT is discovered by probing.**

- *Symptom:* `devvit plugin error: Could not find server entry point.` if you put your server anywhere else — or, worse, if both `src/api/index.ts` and `src/server/index.ts` exist, `src/api/index.ts` silently wins and your other server never builds.
- *Fix:* Put the server at exactly `src/server/index.ts` (the probe order is `src/api/index.ts`, then `src/server/index.ts`, then `src/index.ts`). Never keep two of them.
- *Evidence:* `node_modules/@devvit/start/vite/utils.js:95-113 `getServerEntry()``

**If `src/client/` exists, it silently becomes the Vite root — so entrypoint paths in devvit.json are relative to `src/client/`, not the repo root, and an entry outside it is a hard error.**

- *Symptom:* `"entry": "src/client/game.html"` and `"entry": "game.html"` both appear to work in different templates. Putting an HTML file anywhere but under `src/client/` fails with `Devvit client entry "x.html" must be inside <clientRoot>`.
- *Fix:* Create `src/client/`, put every entrypoint HTML directly in it, and write bare filenames in devvit.json (`"entry": "game.html"`). The plugin resolves against repoRoot first, then clientRoot, then rejects anything outside clientRoot.
- *Evidence:* `node_modules/@devvit/start/vite/utils.js `getClientInputs()` and line 82 `throw new Error('Devvit client entry ... must be inside ...')`; node_modules`

**A query string in an entrypoint's `entry` is allowed by the schema and documented in it, but breaks the build.**

- *Symptom:* `"entry": "game.html?screen=board"` — build fails with a parse error naming a file called `game.html?screen=board`.
- *Fix:* Don't route through the entrypoint. Give each screen its own HTML entrypoint, or route inside the client after load. The schema says entry "May include query parameters" and its pattern permits them, but `getClientInputs()` hands the string to rolldown as an input path verbatim.
- *Evidence:* `src/client/inline/main.ts:126-140 — "The schema allows a query string in an entrypoint's `entry` ... It is not buildable ... the build fails looking f`

**The entrypoint KEY names the emitted JS/CSS; the entry FILENAME names the emitted HTML. They are different, and there is no content hash on anything.**

- *Symptom:* You look in `dist/client/` for `splash.js` after building the `default` entrypoint whose entry is `splash.html`, and find `default.js` / `default.css` instead. Shared code lands in an unhashed chunk named after some arbitrary module — in this project `pip.js`, from `src/client/scene/pip.ts`.
- *Fix:* Expect `dist/client/<entryFilename>.html` + `dist/client/<entrypointKey>.js` + `dist/client/<entrypointKey>.css`. The output naming is `entryFileNames: '[name].js'`, `chunkFileNames: '[name].js'`, `assetFileNames: '[name][extname]'` — no hashes, so any test that reads built files must parse the HTML for asset names rather than assume them.
- *Evidence:* `node_modules/@devvit/start/vite/index.js:218-224; dist/client contains default.js, default.css, game.js, game.css, pip.js, splash.html, game.html`

**`vite dev` / `vite serve` does not work at all with the Devvit plugin.**

- *Symptom:* `devvit plugin error: This plugin only supports vite build.` No HMR, no dev server, ever.
- *Fix:* Use `vite build --watch` (that is what `devvit playtest` runs via devvit.json's `scripts.dev`), and for browser-only iteration build once and serve `dist/client` yourself — see tools/devharness/server.mjs.
- *Evidence:* `node_modules/@devvit/start/vite/index.js:70-74 — the `config()` hook throws when `env.command !== 'build'``

**`context` from `@devvit/web/client` is `undefined` outside Devvit, and an unguarded property read throws before your first fetch.**

- *Symptom:* Running the built client in a plain browser (or a harness), the page renders its initial state and then nothing — the state fetch never ran, because `context.postId` threw first. In production it works, which is how this survives review of the code.
- *Fix:* Always `context?.postId`, never `context.postId`, in any code path that can run outside the Devvit runtime.
- *Evidence:* `src/client/inline/main.ts:47-55 — "`context?.` and not `context.`: outside Devvit the import is undefined, and an unguarded read throws *before* the s`

**`devvit.json` `name` is the app's permanent identity. There is no rename command, and renaming resets your Redis namespace.**

- *Symptom:* You pick a name, later find it taken or want to change it, and discover the CLI has no rename. `devvit upload` claims the name and rewrites both `devvit.json` and `package.json` for you. A new name is a new app, hence a new per-installation Redis namespace — all stored state is gone.
- *Fix:* Choose the name before the first `devvit upload`. It must match `^[a-z][a-z0-9-]*$`, 3-20 chars, and it becomes both the app account name and the community URL slug.
- *Evidence:* `RELEASE.md:43-51 and :155 — "There is no rename command in the CLI ... the name field *is* the app's identity"; "a new app means a **new Redis namespa`

**`import './index.css'` is a type error under the strict base config.**

- *Symptom:* tsc reports an error on a CSS side-effect import that has nothing obviously to do with CSS, because `noUncheckedSideEffectImports: true` is on.
- *Fix:* Add `src/client/global.ts` containing exactly `declare module '*.css';` (and `module.d.ts` for image imports). One line each, and they must be inside the client project's `include`.
- *Evidence:* `tools/tsconfig.base.json `"noUncheckedSideEffectImports": true`; src/client/global.ts`

**`triggers` in devvit.json is invalid without a `server` block, and `post.entrypoints` is invalid without a `default` key.**

- *Symptom:* Schema validation failure at upload with a message about a missing dependency, on a config that looks complete.
- *Fix:* The manifest requires `name` plus at least one of `post` / `server` / `blocks`; `dependentRequired` forces `server` whenever `triggers` is present; `post.entrypoints` has `"required": ["default"]`. Also note the `patternProperties` branch `^[a-zA-Z0-9_-]+$` matches the literal key `default` too and marks `entry` required — so always give `default` an explicit `entry` even though it has a documented default of `index.html`.
- *Evidence:* `config-file.v1.json:405-407 (`required`, `anyOf`, `dependentRequired`) and :544-560 (`post.entrypoints` `required: ["default"]` + patternProperties `r`

**`public/` may exist at the repo root or at `src/client/public/`, but never both.**

- *Symptom:* `devvit plugin error: Found both public and src/client/public. Choose a single public directory and remove the other.`
- *Fix:* Pick one. This project uses repo-root `public/` (holding `fonts/space-grotesk-latin.woff2` and its OFL licence), which Vite copies verbatim into `dist/client/fonts/`.
- *Evidence:* `node_modules/@devvit/start/vite/utils.js `resolvePublicDir()` — throws when both exist`

**Reddit rejects any in-line web view that scrolls, and the failure is invisible on desktop.**

- *Symptom:* App review rejection titled "In-line Scroll Trap", days after submission. Version 0.0.x of this app was rejected for exactly this: a result screen that stacked a verdict plus a ten-row leaderboard, which does not fit a post-sized viewport.
- *Fix:* Lay every screen out to fit; reach overflow with a button that opens another entrypoint or another view. Lock the document in CSS (`html, body, #root { overflow: hidden }`) and add src/tests/no-inline-scroll.test.ts on day one — it greps the whole client tree for `overflow: auto|scroll`.
- *Evidence:* `src/tests/no-inline-scroll.test.ts:6-17 — "Version 0.4 was rejected for exactly this"`

**Sourcemaps are always emitted and are large; and `devvit publish` uploads your source tree for human review.**

- *Symptom:* `dist/server/index.cjs.map` is 6 MB and `dist/client/game.js.map` is 1 MB. Separately, anything in your repo (outside .gitignore) is packaged and read by a Reddit reviewer.
- *Fix:* `sourcemap: true` is set in the plugin's `baseBuildOptions` and is not something you turn off through devvit.json. Use the manifest's `sourceIgnores` (gitignore-style patterns, applied after your root .gitignore) to keep junk out of the review package, and `additionalSourceRoots` if any source lives outside the project root.
- *Evidence:* `node_modules/@devvit/start/vite/index.js `baseBuildOptions` (`sourcemap: true`); config-file.v1.json:913-931 (`additionalSourceRoots`, `sourceIgnores``

**`devvit.json` fields that exist but are easy to miss, and one that is deprecated.**

- *Symptom:* Reinventing settings, forms or marketing metadata in code, or copying a `blocks` block out of an old template.
- *Fix:* The full top-level surface is: `$schema`, `name`, `media` (static assets dir, default `assets`, separate from post.dir), `permissions` (http{enable,domains} / media / journeys / payments / realtime / blob / redis / chromeless / reddit{enable,scope,asUser}), `post` (dir, entrypoints{entry,height,styles{backgroundColor,backgroundColorDark,height 72-512,shareImageUrl}}), `server` (dir, entry, externalEndpoints), `triggers` (20 named events, all `/internal/...`), `blocks` (DEPRECATED — migration only), `menu` (items[label, description, forUserType, location comment|post|subreddit, endpoint, postFilter none|currentApp]), `payments` (endpoints.fulfillOrder/refundOrder + products or productsFile), `forms` (name -> `/internal/...` submit URL), `dev` (subreddit; overridable by `DEVVIT_SUBREDDIT`), `scripts` (dev, build — experimental, run by playtest/upload), `scheduler` (tasks: name -> {endpoint, cron?, data?} or a bare endpoint string), `settings` (global / subreddit; types string, paragraph, number, boolean, select, multiSelect, plus `group` for subreddit, each with an optional `validationEndpoint`; global string settings support `isSecret`, which forbids `defaultValue`), `marketingAssets` (icon: 1024x1024 PNG, <=500 KB), `additionalSourceRoots`, `sourceIgnores`. A scheduler task with no `cron` must be scheduled at runtime through `@devvit/web/server`.
- *Evidence:* `node_modules/@devvit/shared-types/schemas/config-file.v1.json:409-931`

## 5. The server, Redis, and determinism

DAYSHOT's server is a Hono app bundled to a single CommonJS file and handed to Devvit. `src/server/index.ts` is 23 lines: it mounts two Hono sub-routers (`/api` for the game client, `/internal` for platform callbacks) and calls `serve({ fetch: app.fetch, createServer, port: getServerPort() })` with `createServer`/`getServerPort` imported from `@devvit/web/server`. That is the whole platform binding on the HTTP side. `/api/*` needs no declaration anywhere — the webview reaches it with a plain same-origin `fetch('/api/state')` and the platform routes it. `/internal/*` endpoints exist only because `devvit.json` names them: a `menu.items[].endpoint`, a `triggers.onAppInstall`/`onCommentDelete`, and a `scheduler.tasks.daily-post` with `cron: "0 0 * * *"`. Adding an internal endpoint means editing two files or it is dead code.

The interesting architectural move is the port seam. `src/server/platform.ts` is the only file in the server that imports `context`, `redis` or `reddit` from Devvit. It re-exports them as two narrow structural types — `RedisLike` (`src/server/core/redis-port.ts`, 16 methods -- the slice this app uses, not all of Devvit's Redis; the omission of `watch`/`multi` is why the daily lock is `hSetNX`) and `RedditLike` (`src/server/core/reddit-port.ts`) — plus three injected capabilities: `now()`, `nonce()`, `currentSubreddit()`. Everything under `src/server/core/` takes a `RedisLike` as its first argument and never imports the platform. The payoff is real and not theoretical: `src/tests/fake-redis.ts` is a 200-line in-memory implementation with an optional per-command latency, and it lets `src/tests/shot-submission.test.ts` run eight genuinely interleaved concurrent submissions and assert that exactly one wins. `const store: RedisLike = redis;` in platform.ts is a compile-time assertion that the real client still satisfies the port, so a platform drift breaks the build rather than production.

The third pillar is `src/shared/` — `sim.ts`, `tunables.ts`, `types.ts`, `copy.ts` — compiled as its own TypeScript project with `"types": []` so Node and DOM globals cannot leak in, and imported *verbatim* by both client and server. `sim.ts` holds a seeded PRNG (xmur3 → mulberry32), the daily level generator, and a fixed-step physics integrator, and the contract is that `simulate(dayNumber, holdMs)` returns a bit-identical result on both sides. That is what lets the client render the truth instantly while the server stays the only authority: `/api/shot` receives `holdMs` (an integer) and nothing else that matters, re-runs the same simulation, and stores its own score. The level itself is never transmitted — `StateResponse` carries `dayNumber` and `rerollK`, and the client regenerates the level from those two numbers. The generic half of this (ports, keys file, lock, day arithmetic, identity, analytics allowlist, anchor day) transfers to any Reddit app; the specific half (ballistics, scoring curve, modifier table) is DAYSHOT and gets deleted.

### 5.1 What to lift

| Thing | Where | Verdict | Why |
| --- | --- | --- | --- |
| Server entrypoint: Hono mounted on Devvit's server | `C:/Dev/daily-one-shot/src/server/index.ts` | copy as-is | GENERIC INFRA. The entire platform HTTP binding. `/api` is reachable by same-origin fetch with no declaration; `/internal` mirrors what devvit.json names. Change only the sub-router names. |
| The platform seam — the only file that imports Devvit | `C:/Dev/daily-one-shot/src/server/platform.ts` | copy as-is | GENERIC INFRA. 60 lines. Structurally type-checks Devvit's clients against your ports, adapts the Reddit client, and injects now()/nonce()/currentSubreddit() so core logic is pure and testable. `nonce()` is module-level (not per-call) on purpose — a nonce t... |
| The Redis port — the exact command surface Devvit offers | `C:/Dev/daily-one-shot/src/server/core/redis-port.ts` | copy as-is | GENERIC INFRA, and it is a map of the platform. Devvit's Redis is a *subset* of Redis: no SCAN/KEYS, no zRevRank, `zRange` takes an options object `{ by: 'rank'|'score'|'lex', reverse?, limit? }`, `zRank` is ascending only. Widening this type past what @dev... |
| FakeRedis — in-memory RedisLike with interleaving latency | `C:/Dev/daily-one-shot/src/tests/fake-redis.ts` | copy as-is | GENERIC INFRA. The single highest-leverage file to steal. Faithful on the two behaviours correctness depends on (SET NX writes only when absent; zRank is ascending, no zRevRank), exposes `.strings/.hashes/.zsets` maps for key-namespace assertions and a `.lo... |
| One file holding every Redis key + the key table itself | `C:/Dev/daily-one-shot/src/server/core/keys.ts` | copy + adapt | GENERIC PATTERN, DAYSHOT names. Devvit Redis cannot list keys — no SCAN, no KEYS — so a key whose name is lost is unrecoverable data. Centralising the namespace in one module of pure string builders is the only defence. Copy the shape, rename the keys. Note... |
| A route: identity from context, discriminated outcome, typed error codes | `C:/Dev/daily-one-shot/src/server/routes/api.ts` | copy + adapt | GENERIC SHAPE, DAYSHOT payloads. Every endpoint pulls `context.userId` and never reads an id from the body. The core function returns a discriminated union of outcomes and the route maps each to a status code — no exceptions used for flow. Note `/shot` retu... |
| The client fetch layer — plain fetch, no tRPC, discriminated results | `C:/Dev/daily-one-shot/src/client/api.ts` | copy as-is | GENERIC INFRA. The stock Devvit template README mentions tRPC; this project uses none. `fetch('/api/state')` with a relative path is the whole client-server transport. Returning `{ok:false, code}` instead of throwing matters because each failure code has a ... |
| The one-action-per-day write lock | `C:/Dev/daily-one-shot/src/server/core/shot.ts` | copy + adapt | GENERIC MECHANISM (lines 109-253), DAYSHOT payload. The lock is a hash whose single `shot` field is claimed with `hSetNX`, and its existence *is* "this user has acted today". Two independent signals decide the winner: `hSetNX` returning 1, and reading the f... |
| Self-healing a lock whose follow-up write was lost | `C:/Dev/daily-one-shot/src/server/core/shot.ts` | copy + adapt | GENERIC PATTERN. The lock is written before the leaderboard entry, so a process that dies in between would leave a user locked out with no standing. Because the lock payload carries everything needed to redo the second write, the repair is exact and idempot... |
| Composite sorted-set score: descending rank + tiebreak without zRevRank | `C:/Dev/daily-one-shot/src/server/core/ranking.ts` | copy as-is | GENERIC INFRA, and non-obvious. Devvit's Redis has zRank but no zRevRank. Packing the value and an arrival counter into one score makes every member unique, so `rank = zCard - zRank(member)` is exact, and a lower seq (earlier action) sorts higher for free. ... |
| UTC day arithmetic and the submission-day resolver | `C:/Dev/daily-one-shot/src/server/core/clock.ts` | copy as-is | GENERIC INFRA, 50 lines, zero DAYSHOT content. The day number is `Math.floor(epochMs / 86400000)` on the *server's* clock. The client sends the day it believes it is playing; `resolveSubmissionDay` decides whether to honour it. Just after midnight a claim f... |
| The anchor day — never bake a launch date into a constant | `C:/Dev/daily-one-shot/src/server/core/day.ts` | copy as-is | GENERIC INFRA and hard-won. An app is submitted for review and approved an unknown number of days later, so any date compiled in before submitting is a guess, and getting it wrong means a post titled #0 or a second review cycle to fix a constant. The anchor... |
| Idempotent daily-content creation, run from three entry points | `C:/Dev/daily-one-shot/src/server/core/post.ts` | copy + adapt | GENERIC PATTERN, DAYSHOT copy. One `ensureDailyPost` is called by the cron (`/internal/scheduler/daily`), the app-install trigger (so installing mid-day does not mean waiting for midnight), and a moderator menu item (so a missed cron is a one-click fix). Sa... |
| Scheduler / trigger / menu route handlers | `C:/Dev/daily-one-shot/src/server/routes/scheduler.ts` | copy + adapt | GENERIC INFRA. Shows the real request/response types (`TaskRequest`/`TaskResponse` from `@devvit/web/server`; `OnAppInstallRequest`/`OnCommentDeleteRequest`/`TriggerResponse` and `UiResponse` from `@devvit/web/shared`) and, critically, that a scheduled task... |
| Deterministic seeding: xmur3 -> mulberry32, and the seed string | `C:/Dev/daily-one-shot/src/shared/sim.ts` | copy as-is | GENERIC INFRA (lines 65-128). Two standard 32-bit PRNGs using only Math.imul, XOR and shifts — exactly specified in the language spec, so client and server cannot disagree. The seed is a *string* built from the day number plus a reroll salt, which makes the... |
| Content validity guard-rail: sweep, reroll, persist the chosen salt | `C:/Dev/daily-one-shot/src/shared/sim.ts` | keep the shape | GENERIC SHAPE, DAYSHOT sweep. A seed can produce a day nobody can complete. `resolveRerollK` brute-forces the day (1000-step gauge sweep, up to 64 salts) until it finds a playable one, falling back to the least-bad rather than looping forever. The *shape* i... |
| ensureDayMeta — compute-once-per-day, shared by every client | `C:/Dev/daily-one-shot/src/server/core/day.ts` | copy + adapt | GENERIC PATTERN. The expensive per-day derivation (here the reroll sweep, ~1000 simulations) runs on the first request of the day and is persisted with hSetNX so a burst of cold requests at midnight converges on one value instead of racing to different answ... |
| buildState — the single boot endpoint, and serverNow | `C:/Dev/daily-one-shot/src/server/core/state.ts` | copy + adapt | GENERIC SHAPE. One GET returns everything the client needs to open, including `serverNow` (epoch ms). The client stores `clockOffset = data.serverNow - Date.now()` (src/client/App.tsx:167) and every countdown and every submitted day number is drawn from tha... |
| Analytics: aggregated counters with an event allowlist | `C:/Dev/daily-one-shot/src/server/core/analytics.ts` | copy as-is | GENERIC INFRA. 88 lines. One hash per day, one field per event, hIncrBy to move it, nothing per-user. The security property that makes it safe to expose unauthenticated: client-supplied strings become Redis *hash field names*, so they are checked against a ... |
| Comment-on-behalf-of-user + the delete-trigger reverse index | `C:/Dev/daily-one-shot/src/server/core/share.ts` | copy + adapt | GENERIC INFRA for any app that posts as the user. Three transferable pieces: (1) the comment text is rebuilt from the server's own record, never from the client — a share is a claim, so it has to be the server's claim; (2) claim-before-post with hSetNX and ... |
| Client offline queue with idempotent retry | `C:/Dev/daily-one-shot/src/client/queue.ts` | copy as-is | GENERIC INFRA. The client-side half of the lock. The action is written to localStorage the instant it happens, then retried with backoff [400…30000] until acknowledged; an `online` event cuts the wait short. Retrying is only safe *because* the server lock m... |
| The user-isolation test suite | `C:/Dev/daily-one-shot/src/tests/user-isolation.test.ts` | copy + adapt | GENERIC PATTERN. The last test is the one to steal wholesale: after acting as one user it enumerates every key the fake store touched and asserts none of them belong to another account. That converts "identity looks correctly scoped" from an argument-from-i... |
| Determinism-primitive pinning tests | `C:/Dev/daily-one-shot/src/tests/determinism-primitives.test.ts` | copy as-is | GENERIC INFRA, 55 lines. Pins the exact JavaScript behaviours the client/server agreement rests on — Math.imul as exact 32-bit multiply, `>>> 0` as uint32 normalisation, Math.round breaking ties upward, round-to-6-decimals being idempotent, integer arithmet... |
| devvit.json — the manifest that makes /internal/* reachable | `C:/Dev/daily-one-shot/devvit.json` | copy + adapt | GENERIC INFRA. Shows the real schema: `permissions.redis`, `permissions.reddit.{enable,scope,asUser}`, two `post.entrypoints` mapping names to built HTML files (the name is what `submitCustomPost({ entry })` takes), `server.entry` pointing at the bundled CJ... |
| Five-project TypeScript build (client / server / shared / node / vite) | `C:/Dev/daily-one-shot/tools/tsconfig.base.json` | copy as-is | GENERIC INFRA. `"types": []` in the base plus a shared project that never opts back in is what physically prevents Node or DOM globals from leaking into the code both sides import. `allowImportingTsExtensions` + `emitDeclarationOnly` is what makes explicit ... |
| The ballistic simulation, scoring curve, modifier table, tunables | `C:/Dev/daily-one-shot/src/shared/sim.ts` | keep the shape | DAYSHOT GAME LOGIC — delete all of it. `generateLevel`, `simulateWithPower`, `scoreForDx`, `powerForHold`, `windAt`, and the whole of `src/shared/tunables.ts` (physics constants, modifier weights, scoring zones) are this game and nothing else. What survives... |

### 5.2 Worth seeing in full

**Server entrypoint: Hono mounted on Devvit's server** — `C:/Dev/daily-one-shot/src/server/index.ts`

```
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createServer, getServerPort } from '@devvit/web/server';

const app = new Hono();
const internal = new Hono();
internal.route('/menu', menu);
internal.route('/scheduler', schedulerRoutes);
internal.route('/triggers', triggers);
app.route('/api', api);
app.route('/internal', internal);

serve({ fetch: app.fetch, createServer, port: getServerPort() });
```

**The platform seam — the only file that imports Devvit** — `C:/Dev/daily-one-shot/src/server/platform.ts`

```
/** Structural check: the platform client must still satisfy the port. */
export const store: RedisLike = redis;

let nonceCounter = 0;
export const nonce = (): string =>
  `${Date.now().toString(36)}-${(nonceCounter++).toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const now = (): number => Date.now();
export const currentSubreddit = (): string | null => context.subredditName ?? null;
```

**The Redis port — the exact command surface Devvit offers** — `C:/Dev/daily-one-shot/src/server/core/redis-port.ts`

```
export type RedisLike = {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string, options?: RedisSetOptions): Promise<unknown>;
  del(...keys: string[]): Promise<void>;
  expire(key: string, seconds: number): Promise<void>;
  incrBy(key: string, value: number): Promise<number>;
  hGet / hGetAll / hSet / hSetNX / hIncrBy / hDel
  zAdd / zCard / zRank / zScore / zRange   // no zRevRank
};
```


### 5.3 Rules this codebase holds itself to

| Rule | Why | Enforced by |
| --- | --- | --- |
| Nothing under `src/server/core/` imports Devvit. Core functions take a `RedisLike` (and where needed a `RedditLike`, `now()`, `nonce()`) as arguments; only `src/server/platform.ts` and the r | Makes every piece of real logic — the lock, the ranking, the day resolution, the share flow — unit-testable against `FakeRedis` with no live subreddit, and turns a platform API drift into a  | Type: `export const store: RedisLike = redis;` in platform.ts is a structural assertion. Tests: every core mod |
| Every Redis key name is built by a function in `src/server/core/keys.ts`. No string literal key anywhere else. | Devvit's Redis has no SCAN and no KEYS — you cannot enumerate what you wrote. A key whose name is lost is data that is gone. The file also becomes the schema document. | Convention only (the file's own header states the reason). Worth adding a lint rule in a new project. |
| Per-user identity comes from `context.userId` inside the request handler and is never read from the request body, a query parameter, or a header. | `context` is populated by the platform from the authenticated session (`userId: T2 | undefined` in @devvit/shared-types/shared/baseContext.d.ts). Any id in the payload is attacker-controlled | Test: src/tests/user-isolation.test.ts, including a test that enumerates every key written while acting as one |
| The server never trusts a client-computed result. `/api/shot` accepts only `holdMs` (validated as an integer in [0, 600000]) and re-derives everything. `clientScore` exists solely to be comp | The client runs the same simulation so it can render the outcome instantly, not so it can be believed. Whatever the client claims, the number that reaches Redis came from the server's own ru | Test: src/tests/shot-submission.test.ts — 'scores from holdMs, ignoring whatever the client claims' submits cl |
| `src/shared/` has zero imports outside itself and compiles with `"types": []`. Only `+ - * /`, comparisons, and 32-bit integer ops in the PRNG; the only trigonometry runs once per level and  | It is imported verbatim by both sides, so anything environment-specific breaks the client/server agreement. Engine `cos`/`sin` implementations are allowed to differ in the last bits; quantis | Build: tools/tsconfig.shared.json extends a base with `"types": []` and only opts into WebWorker/ES2023 libs.  |
| The PRNG draw order in the day generator is frozen for life. Every draw happens on every day, whatever the variant — a modifier changes the *range* a value is drawn from, never the number of | Reordering, adding, or conditionally skipping a draw rewrites every day the game has ever had. The gust table is drawn on days that never use it, purely to keep the sequence stable. | Test: src/tests/level-generation.test.ts asserts the exact seed strings ('oneshot:247', 'oneshot:247:r1'); the |
| Relative imports carry explicit `.ts` / `.tsx` extensions, and no `enum`, no `namespace`, no constructor parameter properties anywhere reachable from a test. | Unit tests run under `node --experimental-strip-types` with no bundler: it resolves specifiers literally and its strip-only mode rejects any TypeScript syntax that needs code generation. | Build: `allowImportingTsExtensions` + `emitDeclarationOnly` in tools/tsconfig.base.json. Runtime: the test com |
| Every `/internal/*` endpoint is registered in `devvit.json` (menu item, trigger, or scheduler task) the moment it is added. | The platform only ever calls a path it has been told about. An unregistered internal route is unreachable dead code that looks like it works because the Hono route exists. | Convention only. `/api/*` needs no registration and is reached by same-origin fetch. |
| Core operations return a discriminated union of outcomes; the route layer maps each variant to a status code. Exceptions are for genuine failures only, and every route wraps its body in try/ | Expected conditions (already acted today, day rolled over, not logged in, nothing to share) are answers, not errors — and the client has a distinct screen behind each one. `ALREADY_PLAYED` e | Type: `ErrorCode` union in src/shared/types.ts is shared by both sides, so a code the client cannot handle fai |
| localStorage may hold conveniences (sound toggle, a pending re-submission, practice best) but never a source of truth. Anything that must survive lives in Redis. | Devvit wipes localStorage on every app update. Share consent moved server-side onto the user hash for exactly this reason — asking again after every deploy is a worse bug than an extra Redis | Convention only (stated at AGENTS.md:106); StateResponse.shareConsent is the concrete instance. |
| Type aliases over interfaces, named exports over default exports, never cast — model the data so the cast is unnecessary. | Casting is where a malformed value read out of Redis becomes a runtime failure somewhere else. `asThingId()` in reddit-port.ts is the pattern: a validated guard that fails where it can be re | Lint (eslint + typescript-eslint) and `noUncheckedIndexedAccess`, run as part of `npm run test` which gates ev |

### 5.4 Traps

**Devvit's Redis has no `zRevRank`. There is no way to ask for descending rank.**

- *Symptom:* You write a leaderboard against normal Redis docs and it does not compile — or worse, you reach for `zRange` and paginate manually, and every tie silently orders by whatever the store feels like.
- *Fix:* Pack value and arrival order into one sorted-set score so every member is unique: `composite = round(value * 100) * 1e8 + (1e8 - 1 - seq)` where `seq` comes from `incrBy` on a per-day counter. Then `rank = zCard - zRank(member)` is exact and earlier actions win ties for free. Decode with `decodeScore` before showing anything — leaking the composite would put a 12-digit number on screen.
- *Evidence:* `src/server/core/redis-port.ts:12 ('there is **no `zRevRank`**'); src/server/core/ranking.ts:21-42`

**`redis.set(key, value, { nx: true })` is typed `Promise<string>` on Devvit with no documented value for the not-written case, so you cannot tell whether you won the race.**

- *Symptom:* You write a mutual-exclusion lock with SET NX, it looks right, and under concurrency two callers both believe they won. The failure only appears under real interleaving, which local single-request testing never produces.
- *Fix:* Use `hSetNX(key, field, value)` — it returns 1 or 0 and leaves nothing to infer. DAYSHOT belt-and-braces it by also reading the field back and comparing it byte-for-byte against the payload just built, with a per-attempt nonce inside so the comparison is exact even for two identical requests. If you must use SET NX (as `resolveAnchorDay` does), never assume you won — read the key back and use whatever value is actually there.
- *Evidence:* `src/server/core/shot.ts:109-118 and 240-244; src/server/core/day.ts:157-163; AGENTS.md:95`

**Calling an `ensureX`-style get-or-create function on a read path creates rows for days that never existed.**

- *Symptom:* Reading 'yesterday' with `ensureDayMeta(redis, dayNumber - 1)` silently materialises a meta hash for yesterday — and, in this codebase, runs a thousand-simulation reroll sweep to do it. You get phantom days in the store and a request that mysteriously takes far longer than the others.
- *Fix:* Read historical data with a raw `hGet`/`hGetAll` and treat a missing hash as 'no such day'. `buildState` does this explicitly and says why in a comment.
- *Evidence:* `src/server/core/state.ts:41-45 — 'Read raw, never `ensureDayMeta`: that function *creates* a day, and yesterday is over.'`

**The lock is written before the follow-up writes (leaderboard entry, counters, user record). Those are not atomic together.**

- *Symptom:* A process that dies between the two leaves the user permanently locked out of the day with no rank at all — the worst possible outcome for a one-action-per-day app, and completely invisible until a player complains.
- *Fix:* Put everything needed to redo the second write inside the lock payload, then write an idempotent repair function and call it on every path that observes the lock — including the plain page-load path, so the repair happens before anyone is ever *shown* a rank of zero.
- *Evidence:* `src/server/core/shot.ts:166-189 (`reconcileMissingScore`), called from shot.ts:247 and src/server/core/state.ts:85-89`

**`day:{n}:seq` is created with `incrBy` and no `expire` is ever called on it. Same class of bug for `stats:daily:{n}`, whose TTL is set by `analytics.record` but not by `analytics.bump`.**

- *Symptom:* Per-day keys that were supposed to expire after 90 days accumulate forever, one per day per installation. Nothing breaks; the Redis footprint just grows without bound and you cannot list keys to find them.
- *Fix:* Set the TTL in the same function that creates the key, not in a caller that might not run. Audit with `grep -rn 'expire(' src/server/` against `src/server/core/keys.ts` — every key builder should appear on the left of an expire, or be a deliberate permanent key (`user:{id}`, `shared:by-comment`, `game:anchor-day`).
- *Evidence:* `src/server/core/keys.ts:16 and src/server/core/shot.ts:256 (incrBy, no expire); src/server/core/analytics.ts:48-55 (`bump` has no expire) vs :86 (`rec`

**Baking the launch date into a compile-time constant.**

- *Symptom:* You submit for review guessing an approval date, get approved a week later, and the first public post is titled '#0' or '#-4'. Fixing a constant means another full review cycle. Clamping it is worse — two different days both call themselves #1.
- *Fix:* Anchor the display numbering on the first day the *installation* actually created content: `SET NX` a `game:anchor-day` key, read it back, and compute `displayDay = dayNumber - anchor + 1`. Keep the absolute UTC day number as the content seed so the anchor affects only the label. Because Devvit's Redis is namespaced per installation, each community that installs the app gets its own #1, which is what a community expects anyway.
- *Evidence:* `src/server/core/day.ts:129-168; src/shared/tunables.ts:238-251 documents the constant this replaced; src/tests/state.test.ts:281-330`

**Trusting the device clock for 'what day is it'.**

- *Symptom:* A user changes their system clock and plays tomorrow's content, or plays today's twice. Or a legitimate user just past midnight loses the action they took thirty seconds ago because their retry now claims a day the server has left.
- *Fix:* The server's `dayNumberAt(Date.now())` is the only authority. Send `serverNow` in the boot response, have the client keep `clockOffset = serverNow - Date.now()` and drive every countdown and submitted day number from it. Then let the client *claim* a day and have the server adjudicate: accept today, accept yesterday within a short grace window (90s here) so a queued retry lands on the day it was actually taken, and reject anything else as DAY_ROLLED rather than silently reassigning it.
- *Evidence:* `src/server/core/clock.ts:27-50 (`resolveSubmissionDay`); src/client/App.tsx:167 (`clockOffset: data.serverNow - Date.now()`) and App.tsx:247`

**Throwing an exception out of a scheduled-task handler.**

- *Symptom:* The platform retries blindly. A handler that half-completed and then threw runs again, and if it left a claim behind it can never succeed — the day stays broken until someone notices.
- *Fix:* Catch everything inside the scheduler route and always return `c.json<TaskResponse>({}, 200)`. Separately, release any creation claim in a `catch` before rethrowing from the inner function, so the next run can retry. And bump a counter (`scheduler_fired`) as well as logging, because during a playtest 'did the cron actually fire?' has to be answerable from inside the app.
- *Evidence:* `src/server/routes/scheduler.ts:44-50; src/server/core/post.ts:163-168 (`hDel ... ['postClaim']` before rethrow)`

**Relying on the cron alone to create the day's content.**

- *Symptom:* You install the app at 2pm and there is nothing to play until midnight. Or one cron run is missed and a whole day has no post, with no way to fix it short of a redeploy.
- *Fix:* Write one idempotent `ensureTodayExists` and call it from three places: the cron, the `onAppInstall` trigger, and a moderator menu item. All three take the same code path including the idempotency check, so what a moderator triggers by hand is exactly what runs at midnight, not a parallel implementation that drifts.
- *Evidence:* `src/server/core/post.ts:24-32; called from routes/scheduler.ts:32, routes/triggers.ts:31, routes/menu.ts:27`

**Putting anything derivable into `postData`.**

- *Symptom:* `postData` is capped at 2 KB and is sent to every client that sees the card in the feed, logged in or not. Put a level parameter, an answer, or any pre-computed state in there and it travels with the post where anyone can read it.
- *Fix:* Send only what is already public — the day number, the label, the seed index. DAYSHOT sends `dayNumber`, `displayDay`, `rerollK`, `modifier` and its label/emoji, and carries an explicit comment saying nothing about the level's parameters may go in. Same rule for the app's public seed comment: it names the day's modifier and deliberately does not receive the wind or the distance as arguments, so it cannot leak them.
- *Evidence:* `src/server/core/post.ts:130-139 ('nothing about the level's parameters may go in here or the day's answer travels with the card'); src/shared/copy.ts:`

**Letting client-supplied strings become Redis hash field names.**

- *Symptom:* An analytics endpoint that does `hIncrBy(statsKey, event.name, 1)` lets any visitor write unbounded arbitrary fields into your hash. The endpoint is unauthenticated by design (logged-out visitors should count), so there is no user to rate-limit.
- *Fix:* Hard-code an `ALLOWED_EVENTS` allowlist and drop anything not on it; cap props at 4; require both key and value to match a tight regex (`/^[a-z0-9_.:+-]{1,24}$/`); bucket every numeric value before storing it. Then the worst a hostile client can do is inflate a counter you already expected to exist.
- *Evidence:* `src/server/core/analytics.ts:15-45 and 70-87; the endpoint at src/server/routes/api.ts:128-137 has no auth check and swallows all errors ('Analytics m`

**Reassociating or 'tidying' arithmetic in a loop whose output must match across two machines.**

- *Symptom:* IEEE-754 addition is not associative. A refactor that groups terms differently, or hoists a multiply, produces trajectories that differ in the last bits — which usually rounds away, and occasionally does not, giving one user a different number from the server for reasons nobody can reproduce.
- *Fix:* Write the update longhand, one operation per statement, and leave a comment saying why. Evaluate transcendental functions once at setup and quantise their results immediately (`Math.round(v * 1e6) / 1e6`) so no engine's `cos`/`sin` can differ. Pin the primitives with a test whose only job is to fail loudly if a toolchain change breaks them.
- *Evidence:* `src/shared/sim.ts:348-355 ('Do not reassociate the arithmetic in this loop'), sim.ts:117-118 (round6); src/tests/determinism-primitives.test.ts:27-31 `

**Shipping the solver to the client. The function that computes the day's optimum is in the same shared module the client imports.**

- *Symptom:* Nothing fails. The whole anti-cheat posture just quietly stops existing, because the optimal answer is sitting in a bundle anyone can read.
- *Fix:* Keep the solver in the shared module (the server and the tuning tooling both need it), and rely on tree-shaking — but verify it, do not assume it. `sweepLevel`/`resolveRerollK` are exported from `src/shared/sim.ts` and nothing under `src/client/` imports them, so Vite drops them. DAYSHOT goes further for its feed bundle and asserts forbidden content against the *built* files in `src/tests/inline-bundle.test.ts`; do the same for anything that must not ship.
- *Evidence:* `src/shared/sim.ts:468-476 ('The client bundle must never import this ... as long as nothing under `src/client` reaches for it'); verified: `grep -rn '`

**`runAs: 'USER'` does not act as the user during a playtest.**

- *Symptom:* You build the comment-as-the-user flow, test it under `devvit playtest`, and every comment appears from the app account. You conclude the flow is broken and start debugging code that is correct.
- *Fix:* Only approved published versions act as the user; during playtest it works only when the app owner performs the action. Also note the review requirement it exists to satisfy: user-attributed score comments must reply to a single stickied comment, not to the post — so create and pin a seed comment, store its id in the day's meta hash, and reply to that.
- *Evidence:* `AGENTS.md:100-105; src/server/core/post.ts:145-157 (`comment.distinguish(true)` then `attachSeedComment`); src/server/core/share.ts:51-53 falls back t`

**`hGetAll` on a missing key returns `{}`, not `undefined`.**

- *Symptom:* `if (!hash)` never fires and you treat a nonexistent record as an existing empty one — creating a user with a streak of 0 that was never there, or skipping a first-time initialisation.
- *Fix:* Test presence on a specific field (`existing['rerollK'] !== undefined`) or on `Object.keys(hash).length === 0`. Both idioms appear in this codebase and both are deliberate. Similarly, `hGet`/`get`/`zScore`/`zRank` return `undefined` (not null) when absent, so use `=== undefined` and never a truthiness check — a stored `"0"` is falsy.
- *Evidence:* `src/server/core/day.ts:71 (`existing['rerollK'] !== undefined`); src/server/core/user.ts:41 (`Object.keys(hash).length === 0`); src/server/core/redis-`

**Retrying a client request without an idempotent server, or making the server idempotent without telling the client what happened.**

- *Symptom:* Either a flaky connection silently costs the user their one action of the day, or the retry succeeds twice. The half-fix — a server lock that returns a bare 409 — leaves the client showing an error for a request that actually succeeded.
- *Fix:* Make the two halves one design. The server's duplicate response carries the record that counted (`{ error: 'ALREADY_PLAYED', result }`), and the client's retry loop treats that as a success: `clearPendingShot()` then report the existing record. Write the pending action to localStorage before the first attempt so a crash or a closed tab resumes it on next boot, and branch retry behaviour per error code — drop on DAY_ROLLED and BAD_REQUEST, keep on LOGGED_OUT so a later login still counts it.
- *Evidence:* `src/server/routes/api.ts:81-85; src/client/queue.ts:103-134; src/client/App.tsx:172-178 (resume on boot)`

## 6. The client: state, rendering, design system

DAYSHOT's client is three layers that barely touch each other, and that separation is the transferable idea. (1) **One reducer owns the session.** `src/client/App.tsx` holds a single `useReducer(reduce, INITIAL_STATE)` over `src/client/machine.ts`; everything the game knows about the day lives in one frozen `GameState` object. React `useState` is used only for things that are genuinely view-local (which page of the result is open, whether the help sheet is up, a 1 Hz `nowMs` tick so render never calls `Date.now()`). (2) **A canvas that React never re-renders.** `src/client/scene/useScene.ts` opens one `requestAnimationFrame` loop keyed only on the canvas element; all per-frame mutable state lives in a `useRef<Runtime>` and the hook's props are read through an `optionsRef` synced after commit, so a changed callback never tears down the loop. React is told about phase changes; it is never in the frame path. (3) **A design system as data.** `src/client/ui/tokens.ts` is a zero-dependency module of plain constants (COLOR, TYPE, RADIUS, SIZE, DURATION, EASE, PARTICLES, MAX_DPR, BREAKPOINT) that the canvas imports directly, mirrored by hand into a Tailwind v4 `@theme` block in `src/client/index.css` for the DOM — and `src/tests/tokens.test.ts` reads the CSS file and asserts the two agree, so drift fails the build.

The shape most worth stealing is how *transient* conditions are modelled. `Phase` is a 14-member union describing what the player is doing (`boot | logged_out | warmup_aim | ... | result | practice_aim | practice_flight`), and `Transient` (`offline | submitting | day_rolled | error`) is a **separate field on the same state object**, never a phase. The stated reason, in the file header: "none of them should erase what the player was looking at." A dropped connection renders a banner over the result; it does not become a screen. The same discipline appears again with `charging`, which is deliberately not derived from the phase because "the phase says which kind of shot this is; whether the button is held is a different axis entirely" — three different shot types (official, warm-up, practice) share one hold flag while only the official shot has separate `ready`/`aiming` phases.

There are two client bundles because Reddit's feed card and the expanded game are separate entrypoints in `devvit.json` (`splash.html` → `inline/main.ts`, `game.html` → `game.tsx`), and the feed one has a 60 KB gzip budget that the React runtime chunk (65 KB) blows on its own. So `src/client/inline/` is plain DOM + canvas, sharing only pure modules with the game: glyph path data, tokens, `theme.ts`, `motion.ts`, `scene/pip.ts`, and `shared/`. `src/tests/inline-bundle.test.ts` walks the relative-import graph from `inline/main.ts` and fails if it can reach `shared/sim.ts`, `client/machine.ts`, `client/audio.ts`, `client/scene/useScene.ts`, `client/App.tsx`, `client/queue.ts`, or any React package — then gzips the built assets and asserts the total is under 60 KB. That test is the single most reusable artefact in the repo for any two-surface Devvit app.

### 6.1 What to lift

| Thing | Where | Verdict | Why |
| --- | --- | --- | --- |
| The phase/transient state machine: a Phase union, a separate Transient field, a pure `reduce`, and boolean predicates over the phase | `C:/Dev/daily-one-shot/src/client/machine.ts` | copy + adapt | The phase names are DAYSHOT's, but the architecture is not: one readonly GameState, transient conditions held alongside the phase rather than replacing it, orthogonal axes (`charging`) kept as their own flags, and helper predicates (`isAiming`, `isFlying`, ... |
| Typed fetch wrappers returning a discriminated `ApiResult<T>` instead of throwing | `C:/Dev/daily-one-shot/src/client/api.ts` | copy as-is | 101 lines, no dependencies but your own shared `ErrorCode` type. `request()` catches network failure into `{ok:false, code:'NETWORK'}` and otherwise pulls `body.error` out of the JSON, so every call site can switch on a code rather than parse an exception. ... |
| The feed-bundle firewall test: a relative-import-graph walker plus a gzip budget check on the built output | `C:/Dev/daily-one-shot/src/tests/inline-bundle.test.ts` | copy + adapt | This is what makes the two-bundle split real rather than aspirational. It BFS-walks `from|import '...'` specifiers from the inline entry, asserts none of the forbidden files is reachable (matched on resolved path so a re-export cannot smuggle one in), asser... |
| The design token module and its CSS mirror test | `C:/Dev/daily-one-shot/src/client/ui/tokens.ts + C:/Dev/daily-one-shot/src/tests/tokens.test.ts` | keep the shape | The values are DAYSHOT's palette; the structure is the reusable part. Tokens are plain `as const` objects with ZERO imports (the React-free feed bundle imports this module, so anything reachable from it ships in the feed). The test reads `index.css` as text... |
| The requestAnimationFrame scene hook: callback ref, options ref, mutable Runtime ref, one effect | `C:/Dev/daily-one-shot/src/client/scene/useScene.ts` | keep the shape | Four load-bearing decisions that are painful to rediscover. (a) `const [canvas, setCanvas] = useState<HTMLCanvasElement|null>(null)` returned as `canvasRef` — a callback ref, because the canvas mounts only after the day loads and an object ref would leave t... |
| Offscreen layer caching at device resolution (sky gradient, vignette) | `C:/Dev/daily-one-shot/src/client/scene/render.ts` | copy + adapt | Two module-level caches (`skyCache`, `vignetteCache`), each a `{canvas, key}` pair where the key encodes size, DPR and the colours. The expensive full-viewport gradients are rasterised once and blitted. Critically the offscreen canvas is sized in DEVICE pix... |
| Reduced-motion policy read once at module load and exposed as pure helpers | `C:/Dev/daily-one-shot/src/client/motion.ts` | copy as-is | 77 lines, no imports. A module-level `let reduced` is set from `matchMedia` at import time with a `change` listener keeping it live; consumers call `prefersReducedMotion()`, `shakeAmplitude(base)`, `slowMotionScale(base)`, `allowParticles()`. No React conte... |
| Guarded localStorage wrappers with a namespace prefix | `C:/Dev/daily-one-shot/src/client/storage.ts` | copy + adapt | The three private helpers (`read`/`write`/`drop`, each try/catch, each prefixing `'oneshot:'`) plus the parse-with-shape-check pattern are directly reusable; the practice tally and pending-shot payloads are DAYSHOT's. The header states the rule the whole fi... |
| The offline submission queue: write-then-retry with backoff and idempotent server semantics | `C:/Dev/daily-one-shot/src/client/queue.ts` | copy + adapt | 141 lines. `ShotQueue.enqueue()` writes the payload to localStorage first, then loops `submitShot` with a `BACKOFF_MS` ladder, aborting via `AbortController` and short-circuiting the wait on the window `online` event. Every error code maps to a terminal out... |
| Icon set as path data with two renderers (React component + SVG string builder) | `C:/Dev/daily-one-shot/src/client/ui/glyphs.ts + C:/Dev/daily-one-shot/src/client/ui/Glyph.tsx` | copy + adapt | The exact pattern a two-bundle app needs: `glyphs.ts` exports only `readonly string[]` path data on a 16x16 grid plus `glyphSvg(paths, size, label)` which builds a string for the React-free feed; `Glyph.tsx` renders the same arrays as JSX. Both stroke `curr... |
| The no-scroll guard test | `C:/Dev/daily-one-shot/src/tests/no-inline-scroll.test.ts` | copy as-is | DAYSHOT was rejected by Reddit review for an in-line scroll trap. This test recursively reads every .ts/.tsx/.css/.html under src/client, strips comments so the explanatory prose does not self-trip, and fails on any `overflow-[xy]-(auto|scroll)` Tailwind cl... |
| The React-free feed card: pure state selection separated from DOM building, anonymous-first render | `C:/Dev/daily-one-shot/src/client/inline/main.ts + states.ts` | keep the shape | `states.ts` is pure — it maps a `StateResponse` to one of three card variants (`A` unknown/logged-out, `B` returning, `C` already acted) with no DOM, canvas or network, so the interesting logic is unit-testable. `main.ts` renders the anonymous card IMMEDIAT... |
| The CSS foundation: Tailwind v4 @theme mirror, self-hosted font, document lock, safe-area helper, focus ring | `C:/Dev/daily-one-shot/src/client/index.css` | copy + adapt | A Devvit web view cannot fetch anything off Reddit, so the woff2 ships in `public/fonts/` with a `font-weight: 500 700` variable range (one file, two weights, one download). The `@theme` block is the Tailwind side of the token mirror; durations and control ... |
| Runtime-swappable palette: TS palette objects pushed onto three CSS custom properties | `C:/Dev/daily-one-shot/src/client/theme.ts` | copy + adapt | Canvas cannot read a CSS variable per frame and DOM cannot read a TS object, so the palette is a plain object handed to `drawScene` AND written to `document.documentElement.style` by `applyPalette` in a single effect in App.tsx. Only three variables cross t... |
| Timer-driven reveal cascade and count-up hooks (not CSS animation-delay) | `C:/Dev/daily-one-shot/src/client/screens/ResultV2.tsx` | copy + adapt | `useCascade(active)` and `useCountUp(target, active)` both compute `const animate = active && !prefersReducedMotion()` and seed their initial state to the FINISHED value when animation is off, so reduced motion needs no second code path. The reason they are... |
| Two entrypoints wired in devvit.json, each with its own HTML shell and its own CSS | `C:/Dev/daily-one-shot/devvit.json + src/client/splash.html + src/client/game.html + src/client/inline/inline.css` | copy + adapt | `post.entrypoints.default` → `splash.html` (feed) and `post.entrypoints.game` → `game.html`, both `"height": "tall"`, both under `dist/client`. Vite discovers both because the Devvit plugin feeds each `entry` to the bundler as an input path. Both HTML shell... |
| Camera abstraction for a fixed logical world mapped onto any canvas size, with lerpable framings | `C:/Dev/daily-one-shot/src/client/scene/camera.ts` | copy + adapt | A `Camera` is five numbers (`scale`, `originX`, `originY`, `width`, `height`) and everything drawn goes through `toScreenX`/`toScreenY`. Because a camera is plain data, two framings can be produced independently and blended by `lerpCamera(from, to, t)` with... |
| Particle field with a hard cap and a projection callback | `C:/Dev/daily-one-shot/src/client/scene/particles.ts` | copy as-is | 159 lines. `ParticleField` keeps a flat array capped at MAX_PARTICLES=140, `spawn` silently drops over the cap, `update(dt)` walks backwards splicing dead entries, and `draw(ctx, project, scale)` takes the world→screen projection as a callback so the field ... |
| Strict TS + per-directory project references and the ESLint layering | `C:/Dev/daily-one-shot/tools/tsconfig.base.json + C:/Dev/daily-one-shot/eslint.config.js` | copy as-is | `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `isolatedModules`, `allowImportingTsExtensions`, `emitDeclarationOnly` — the last two are what let `node --experimental-strip-types --test` run the source directly with no build ste... |

### 6.2 Worth seeing in full

**The phase/transient state machine: a Phase union, a separate Transient field, a pure `reduce`, and boolean predicates over the phase** — `C:/Dev/daily-one-shot/src/client/machine.ts`

```
export type Transient = 'offline' | 'submitting' | 'day_rolled' | 'error';

export type GameState = {
  readonly phase: Phase;
  readonly transient: Transient | null;
  readonly charging: boolean;
  ...
};

case 'transient':
  return { ...state, transient: action.value };
```

**Typed fetch wrappers returning a discriminated `ApiResult<T>` instead of throwing** — `C:/Dev/daily-one-shot/src/client/api.ts`

```
export type ApiResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly code: ErrorCode | 'NETWORK'; readonly data?: unknown };
```

**The feed-bundle firewall test: a relative-import-graph walker plus a gzip budget check on the built output** — `C:/Dev/daily-one-shot/src/tests/inline-bundle.test.ts`

```
const FORBIDDEN: ReadonlyArray<readonly [string, string]> = [
  ['shared/sim.ts', 'the simulation: the feed would know the day’s answer'],
  ['client/machine.ts', 'the game state machine: nothing in the feed may hold a phase'],
  ['client/audio.ts', 'the audio engine: §4.5 forbids sound in the feed outright'],
  ...
];
```


### 6.3 Rules this codebase holds itself to

| Rule | Why | Enforced by |
| --- | --- | --- |
| Relative imports carry an explicit `.ts` / `.tsx` extension, always. | The unit tests run under `node --experimental-strip-types` with no bundler, so Node itself must resolve every specifier. It also makes the import-graph walker in the bundle test a trivial re | `allowImportingTsExtensions: true` in tools/tsconfig.base.json plus `npm run test:types` (tsc --build) |
| `src/client/ui/tokens.ts` has ZERO imports and must stay that way. | The React-free feed bundle imports it, and anything reachable from that module ships inside the 60 KB feed budget. One accidental import of a React component from the token file would put th | src/tests/inline-bundle.test.ts (whitelist of allowed modules in the feed graph) |
| Nothing in the client may scroll — not the game, not a sheet, not the feed card. Content that does not fit becomes a page reached by a button. | Reddit rejects an in-line web view that scrolls, because the scroll steals the swipe the feed was waiting for. DAYSHOT was rejected once for exactly this; the fix was structural (the leaderb | src/tests/no-inline-scroll.test.ts — scans every client source file for overflow:auto/scroll and asserts the d |
| The feed bundle may not import the simulation, the state machine, the audio engine, the input hook, the App, the submission queue, or React. | Two independent reasons. Correctness: the feed must not know the day's answer, and no shot may be throwable from a card. Budget: the React runtime chunk alone is 65 KB gzip against a 60 KB t | src/tests/inline-bundle.test.ts |
| Every colour, radius, duration, easing and control height exists once in tokens.ts and is mirrored by hand into index.css. | Canvas needs raw numbers (it cannot read a CSS variable per frame); Tailwind needs custom properties. Two representations are unavoidable, so the test makes drift a build failure instead of  | src/tests/tokens.test.ts |
| Transient conditions (offline, submitting, day rolled, error) are a field beside the phase, never a phase. | None of them should erase what the player was looking at. An offline banner over a result is correct; an offline *screen* throws away the result. | convention only (documented in the machine.ts header; src/tests/machine.test.ts covers the reducer) |
| Render is a pure function of state — no `Date.now()`, no ref reads, no setState-in-effect to decide what renders. | App.tsx keeps a `nowMs` state ticked once a second by an interval purely so the countdown does not call `Date.now()` during render, and derives `firstReveal` from two already-known facts rat | eslint-plugin-react-hooks (recommended rules, client block of eslint.config.js) |
| Orthogonal state axes get their own field even when a phase could imply them. | `charging` is the worked example: three shot types share a hold gesture but only the official shot has separate `ready`/`aiming` phases, so deriving "is the finger down" from the phase produ | convention only (documented at machine.ts:117-129) |
| No system emoji anywhere in the UI. Icons are stroked path data on a 16x16 grid inheriting `currentColor`. | Emoji render differently on every OS, at sizes nobody controls, in colours that fight the palette — and an icon that carries its own colour becomes a tenth palette entry. | convention only (documented in ui/glyphs.ts; emoji remain allowed in share text, which is a Reddit comment, no |
| localStorage holds only what is cheap to lose. Anything that matters is server-side. | Devvit changes the iframe URL on every app version, so localStorage is wiped by each release. The daily lock, the streak and the share consent are all server-authoritative; storage keeps a s | convention only (documented in storage.ts:1-11); every access is individually try/catch-wrapped so a browser w |
| API calls return a discriminated result; they never throw. | Every failure on this client has a specific screen behind it — a rollover reloads the day, a network error queues the shot, an ALREADY_PLAYED response carries the shot that counted and is re | convention only (the `ApiResult<T>` type in api.ts makes `.ok` narrowing the only way to reach `.data`) |
| React owns the DOM panels; the rAF loop owns everything inside the canvas. They meet only at phase changes. | A re-render per frame costs the 60 fps target on a mid-range phone. The loop reads its inputs through a ref so a changed callback identity never restarts it. | convention only (the rAF effect in useScene.ts depends on `[canvas]` alone) |
| One filled coral (accent) block per screen, and it is the CTA; text on coral is `bg`, never white. | White on coral is 2.5:1 and fails AA outright; bg on coral is 6.4:1. Accent as *text* (chips, verdicts) is allowed because those are not blocks competing for the same eye. | src/tests/tokens.test.ts asserts the contrast ratios the palette claims about itself; the one-block rule is co |
| Any control drawn over the play surface must call `event.stopPropagation()` on pointer events. | The whole root element is the hold target whenever the player can aim. Without swallowing, tapping the mute or help button charges a shot and releasing throws it — and practice deliberately  | convention only (`const swallow = (event: PointerEvent) => event.stopPropagation()` in screens/DayBar.tsx) |

### 6.4 Traps

**`src/client/inline/inline.css` is a THIRD hand-written copy of the design tokens, and no test covers it — despite its own header comment claiming `tokens.test.ts` asserts it.**

- *Symptom:* You change `COLOR.coral` in tokens.ts, the tokens test forces you to update index.css, the build passes, and the feed card keeps rendering the old accent forever. Nobody notices because the two surfaces are never on screen together.
- *Fix:* Extend the `pairs` table in src/tests/tokens.test.ts to read both stylesheets, or parameterise `cssVar` over a file list. In a new project, generate inline.css's `:root` block from tokens.ts at build time instead of hand-copying it.
- *Evidence:* `src/client/inline/inline.css:1-27 claims "`tokens.test.ts` asserts they match `tokens.ts`", but src/tests/tokens.test.ts:28 reads only `../client/inde`

**Caching a canvas layer at CSS resolution and letting the context's DPR transform scale it up is SLOWER than not caching at all.**

- *Symptom:* You add a bitmap cache to kill a per-frame gradient, and the frame time gets worse. Measured here: 53 dropped frames with the CSS-pixel cache against 1 with the device-pixel one.
- *Fix:* Size the offscreen canvas in device pixels (`Math.ceil(width * dpr)`), and blit with an explicit destination rect so the source is device pixels and the destination is CSS pixels. Recover the DPR from the live context with `ctx.getTransform().a` — `translate()` for screen shake does not touch it — rather than re-reading `window.devicePixelRatio`.
- *Evidence:* `src/client/scene/render.ts:216-219 ("At device resolution, not CSS resolution... resampling a 470x800 bitmap each frame cost *more* than the gradient `

**A Devvit entrypoint's `entry` cannot carry a query string, even though the config schema appears to allow one.**

- *Symptom:* `"entry": "game.html?screen=board"` fails the build: the Devvit vite plugin passes the string to rolldown as an input path verbatim, so it looks for a file literally named `game.html?screen=board`.
- *Fix:* Give each screen its own HTML entrypoint, or open one entrypoint and route inside the app. DAYSHOT does the latter — both feed buttons call `requestExpandedMode(event, 'game')` and the game opens on the right screen because state already determines it.
- *Evidence:* `src/client/inline/main.ts:126-140`

**Devvit client imports are `undefined` outside a Devvit host, and an unguarded property read throws before your boot fetch runs.**

- *Symptom:* In local harness the feed card renders its anonymous fallback and never updates — the `/api/state` fetch had never fired, because reading `context.postId` threw first. Works fine in production, so it looks like a harness bug.
- *Fix:* Optional-chain every Devvit client import at the top level: `context?.postId ?? 'unknown'`. More generally, put analytics and other non-essential calls after the render they could break.
- *Evidence:* `src/client/inline/main.ts:47-63 — "`context?.` and not `context.`: outside Devvit the import is undefined, and an unguarded read throws *before* the s`

**A confirmation action that can be re-dispatched with less data will silently overwrite the richer first payload with `null`.**

- *Symptom:* A brand-new player's streak displayed as the pre-shot value. The server answer arrived mid-flight with a full `ShotResponse`, was stashed in a ref, and re-dispatched at impact without the response — blanking the streak the first dispatch had delivered.
- *Fix:* Never regress a field to null in a reducer: `submission: action.response ?? state.submission`. Treat any action that can fire twice as monotonic.
- *Evidence:* `src/client/machine.ts:294-309 — "Never regress to null... letting the second overwrite the first cost a brand new player their streak"`

**A server response arriving mid-animation will cut the animation short if the reducer advances the phase unconditionally.**

- *Symptom:* On a fast connection the ball vanishes mid-flight and the result panel appears, because `confirmed` fired while `phase === 'in_flight'`.
- *Fix:* Record the data but let the animation own the phase transition: `phase: isFlying(state.phase) ? state.phase : 'result'`, and have the impact handler re-dispatch the stashed confirmation.
- *Evidence:* `src/client/machine.ts:298-300`

**A server-side flag re-read after a local transition can send the user back through a step they just finished, permanently.**

- *Symptom:* `warmupPending` is written by a POST, then the client reloads 1.6 s later. If the POST is still in flight or failed offline, the reload sees stale `warmupPending: true` and routes back into the warm-up — forever, on every load.
- *Fix:* Keep a client-side latch that the opening-phase selector also consults: `openingPhase(server, state.warmupDone)`, with `warmupDone` set at transition time and never cleared.
- *Evidence:* `src/client/machine.ts:107-115 and machine.ts:198-209`

**`useRef` on a canvas that mounts conditionally leaves the animation effect running against `null` forever.**

- *Symptom:* The canvas renders in the DOM but nothing is ever drawn — the effect ran once at mount, saw a null ref, and had no dependency that would ever change.
- *Fix:* Use a callback ref backed by state: `const [canvas, setCanvas] = useState<HTMLCanvasElement|null>(null)`, return `setCanvas` as the ref, and key the rAF effect on `[canvas]`.
- *Evidence:* `src/client/scene/useScene.ts:126-131`

**Writing to a ref during render is illegal under the React compiler rules, so a hook that syncs its props into a ref must do it after commit — and is then one frame stale.**

- *Symptom:* Lint error if you write `optionsRef.current = options` in the body; a subtly stale value if you forget the effect is a frame behind.
- *Fix:* `useEffect(() => { optionsRef.current = options; })` with no dependency array. Only do this when the loop is insensitive to one frame of lag — DAYSHOT states that explicitly.
- *Evidence:* `src/client/scene/useScene.ts:132-139`

**`const el = <K extends keyof HTMLElementTagNameMap>(...)` is parsed as JSX and fails the build in a .ts file in this toolchain.**

- *Symptom:* A parse error on a generic arrow function that looks perfectly valid.
- *Fix:* Use a function declaration: `function el<K extends ...>(...) {}`. (Or `<K,>`, but the declaration form is unambiguous everywhere.)
- *Evidence:* `src/client/inline/main.ts:67-71`

**A CSS `animation-delay` reveal cascade freezes when the tab loses focus, leaving buttons at `opacity: 0` and unclickable.**

- *Symptom:* The user scrolls away during the result animation, comes back, and the CTA is invisible and unpressable — the document timeline stalled mid-cascade.
- *Fix:* Drive staged reveals with `window.setTimeout` / `requestAnimationFrame` and React state, seeding the state to the finished value when reduced motion is on. The worst failure mode becomes "everything appears at once".
- *Evidence:* `src/client/screens/ResultV2.tsx:51-57`

**Audio built lazily inside a gameplay gesture is never built at all for users who never make that gesture — and `await` before `resume()` loses the gesture window.**

- *Symptom:* Sound is on by default, but a returning player who opens straight to their result hears nothing ever: the only `audio.ensure()` calls sit behind the aiming handler, which is disabled on that screen.
- *Fix:* Install a one-shot capture-phase listener on `document` for the first gesture of any kind (`unlockAudioOnFirstGesture()` in App.tsx), and keep the unlock body synchronous — WebKit only honours the gesture for five seconds and an `await` can land outside it. Separately, mute on `visibilitychange`, which Reddit's inline rules require.
- *Evidence:* `src/client/App.tsx:328-344 and src/client/audio.ts:320-338`

**Full-screen controls make the whole surface a hold target, so any button drawn on top fires a shot.**

- *Symptom:* Tapping mute or the help icon charges the gauge, and releasing throws the day's only shot. The misfire guard hides it for the official shot; practice has no guard, so that is where it bites.
- *Fix:* `onPointerDown={swallow}` / `onPointerUp={swallow}` with `event.stopPropagation()` on every overlaid control.
- *Evidence:* `src/client/screens/DayBar.tsx:22-28`

**`MAX_DPR` is exported from tokens.ts but the game's own loop hard-codes the same number, and `FONT_FAMILY` is duplicated as a local `FONT_STACK` literal in render.ts.**

- *Symptom:* Silent divergence between the two canvas surfaces: `inline/scene-lite.ts` honours `MAX_DPR`, `scene/useScene.ts` does not. Changing the token moves the feed card and leaves the game behind. Same for the font stack.
- *Fix:* Import the tokens at both call sites. Grep for every token that has no importer before trusting the token module: `FONT_FAMILY`, `TABULAR`, `SPACE`, `STROKE`, `TYPE`, `BREAKPOINT`, `VIEWPORT` currently have none, so the file is partly documentation rather than a single source.
- *Evidence:* `src/client/scene/useScene.ts:210 `const dpr = Math.min(2, window.devicePixelRatio || 1)` vs src/client/ui/tokens.ts:186 `export const MAX_DPR = 2`; re`

**Canvas has no `letter-spacing`, so a design system's tracked label style cannot be applied to canvas text.**

- *Symptom:* A label that is correctly tracked in the DOM renders visibly tighter on the canvas, and the two surfaces look like different products.
- *Fix:* Insert the spacing manually — `label.split('').join(' ')` — or draw the label as DOM over the canvas. Be aware `measureText` must then run on the spaced string.
- *Evidence:* `src/client/scene/render.ts:907-909`

**Reusing one field for "the thing being animated" and "the thing being displayed" blanks the readout the moment the next interaction starts.**

- *Symptom:* In practice, `state.shot` is the scene's trajectory and is replaced the instant the next charge begins — so the score a chaining player was reading vanished mid-glance.
- *Fix:* Keep display values in their own fields written only at the moment they become true (`practiceLast`, `practicePrevScore`, `practiceIsBest`) and never touched by the input path.
- *Evidence:* `src/client/machine.ts:94-105`

**A per-frame `slice()` or per-segment stroke inside the draw loop is invisible in a desktop profile and fatal on a throttled phone.**

- *Symptom:* Dropped frames only on mid-range devices. A CPU profile shows ~88% of time in `(program)` — the compositor — not in your JavaScript, which is the signal that the cost is pixels rather than code.
- *Fix:* Draw the trail in 5 alpha bands instead of 40 per-segment strokes (17 dropped frames → ~1), and index into the array instead of slicing it. Profile with 4x CPU throttling and believe the compositor number, not the JS number.
- *Evidence:* `src/client/scene/render.ts:106-109, render.ts:686-696, render.ts:189-197`

## 7. Copy, content, and writing things down

Repo root is `C:/Dev/daily-one-shot`; all paths below are relative to it.

**The content layer is one module.** `src/shared/copy.ts` (893 lines) holds every string a player can read, and both the client and the server import it — so the share card a player copies in the browser and the comment the server publishes on Reddit are produced by the same function. It has exactly three layers. (1) A frozen `COPY` object of static strings, `as const`, grouped by surface with `// ---- Identity / Splash / Onboarding / Aiming / Result / Practice / Help / Logged out / Sharing ----` banner comments; a JSDoc marker `/** GDD 9.9 */` above any string that is contractual. (2) Formatters, one per number kind: `formatScore` (always two decimals), `formatPercent` (one), `formatDx`, `formatWind` (real minus sign `−`, explicit `+`), `formatCountdown`, `formatCount` (`toLocaleString('en-US')`). Most numbers go through these six; three later additions (`practiceDelta`, `practiceBestChip`, `standingFor`) call `toFixed` directly, which is drift worth noticing rather than a rule. (3) Pure template functions that take data and return text — `streakLine(streak)`, `tomorrowLine(modifier)`, `dailyPostTitle(displayDay, modifier)`, `seedComment(day, modifier, yesterday)`, `shareConsentBody(username)`. What this buys, concretely: one place to audit before an app review, one place a translator would touch, a server that cannot drift from the client, and — because the functions are pure and dependency-free — the whole content layer is unit-testable without a DOM, a network or a Redis.

**Derived text is computed, never stored.** No row anywhere holds the string "TOP 4.2% TODAY" or "SO CLOSE". `verdictFor({score, dx, impact, targetR})` returns one of ten words from the shot's geometry; `standingFor(rank, total)` returns `{line, chip, rankLine}` from two integers; `impactDirection({signedDx, …})` returns `"48 over — inner ring"` from a signed number; `socialProofLine(facts)` picks one of five sentences from the day's real counters -- a ladder: today's count once it clears 100, Perfects once it clears 1,000, yesterday's count below that, then the first-ever and quiet-day fallbacks. Each one encodes a product judgement in code rather than in a database: `standingFor` refuses a percentile under 50 players because "a percentile of a tiny field is a rank wearing a disguise", gives ranks 1–3 a gold chip, and below the halfway mark says `You beat 41% today` rather than any word like *bottom*. Because they are functions, the boundaries are testable: `src/tests/verdict.test.ts` asserts each band flips at `edge` and `edge + 0.01`, and `src/tests/copy.test.ts` asserts the percentile ladder changes over exactly once, at `PERCENTILE_MIN_PLAYERS`.

**The documentation practice is four documents with four different jobs, plus a comment style.** A *contract* (`ONE-SHOT-GDD.md` Part IX for the game, `DAYSHOT-UI-REDESIGN.md` for the UI) — the spec, and anything not in it is out of scope. An *instruction file* (`AGENTS.md`, 138 lines) — how to work in this repo, written for an AI assistant, and mostly a list of platform facts that would otherwise be rediscovered the expensive way. A *decision log* (`docs/UI-V2-LOG.md`, five bullets per phase, newest at the bottom) — what was done, what was verified with numbers, what the measurement overruled, what is deliberately left. A *backlog* (`BACKLOG.md`) — every good idea that must not enter the code, each with the reason it is deferred. Comments in the code follow the same rule as the log: they explain *why* and record what went wrong, never what the line does. Two real examples are in the `reusable` list below.

### 7.1 What to lift

| Thing | Where | Verdict | Why |
| --- | --- | --- | --- |
| The single copy module — structure, not strings | `src/shared/copy.ts` | copy + adapt | Copy the three-layer shape verbatim (frozen COPY object → formatters → pure template functions), replace every string. Header comment states the rule and the dependency constraint: "Nothing outside this file may hard-code player-visible text… Dependency-fre... |
| Derived standing text: rank + total → a line, a chip and an optional rank row | `src/shared/copy.ts` | copy + adapt | The single best example of computing text from data. Every leaderboard app needs this exact ladder, and the thresholds are the product decision. Note the return type is a small record, not a string: the caller gets the wording AND how to style it, so the sc... |
| Verdict from geometry — a word derived from the shot, with the bands expressed as ratios | `src/shared/copy.ts` | keep the shape | The bands are DAYSHOT's, the technique is general: express thresholds as a ratio of the thing that can change (`dx / targetR`), never as an absolute derived value (`score >= 87`). The spec gave score ranges; the scoring curve later moved and the mat edge we... |
| Share cards: a one-line Format A and a Wordle-style emoji grid Format B | `src/shared/copy.ts` | keep the shape | The shareable-result pattern, decomposed into four testable pure functions: `ringBoundaries(targetR)` → bucket edges, `ringForDx(dx, targetR)` → 0-4, `markerCell(ring, side)` → a [row, col] in a 5x5, `shareGrid(signedDx, targetR)` → five strings, and `share... |
| Character-for-character copy tests against a reference card | `src/tests/copy.test.ts` | copy + adapt | The testing method for a content layer, in four moves. (1) One `REFERENCE_CARD` constant reproducing the spec's worked example, spread with `{...REFERENCE_CARD, score: 100}` for variants. (2) An exact equality per format. (3) A `const NEWLINE = String.fromC... |
| AGENTS.md — the repo instruction file | `AGENTS.md` | copy + adapt | 138 lines, and the section skeleton transfers whole to any Devvit app. Its sections: (1) one-paragraph identity + which document is the contract + where new ideas go instead of into the code; (2) **Tech stack "verified against the installed packages, not th... |
| The decision log — five bullets per phase, newest at the bottom | `docs/UI-V2-LOG.md` | keep the shape | 516 lines across 11 phases plus 5 post-playtest entries, and the entry template is the reusable part. A good entry is exactly five bullets: **Done** (what shipped, in nouns); **Verified** (numbers — test count, capture count, bytes, dropped frames — never "... |
| Comment style — two real examples of a comment that records a bug | `src/client/result-view.ts` | copy as-is | The house rule: a comment says why the code is shaped this way and what went wrong when it was shaped otherwise. Both examples name the wrong behaviour, the user-visible symptom, and the reason it matters — so a future reader cannot 'simplify' the fix away.... |
| The 'invents nothing' property test for social-proof copy | `src/tests/feed-copy.test.ts` | copy + adapt | Any Reddit app with a feed card will want counters on it, and a fabricated counter is an app-review rejection. `socialProofLine(facts)` (src/shared/copy.ts:649) picks between four true sentences by thresholds — quote today at ≥100 shots, swap the day's best... |
| A rule enforced by grepping the source, with the rejection quoted in the test | `src/tests/no-inline-scroll.test.ts` | copy as-is | Directly reusable in any Devvit app: Reddit rejects an in-line web view that scrolls, and this repo was rejected for exactly that in 0.4. The test walks `src/client/**` for `.ts/.tsx/.css/.html`, strips comments first (so a comment explaining the rule is no... |
| Feed-bundle firewall: forbidden imports + a gzip budget, checked against the build | `src/tests/inline-bundle.test.ts` | copy + adapt | Why the content layer must stay dependency-light. The test walks the real import graph from the inline entry and fails on `shared/sim.ts`, `client/machine.ts`, `client/audio.ts`, `client/scene/useScene.ts`, `client/App.tsx`, `client/queue.ts`, plus bare `re... |
| BACKLOG.md — deferred ideas, each with its reason | `BACKLOG.md` | copy + adapt | 85 lines, and it is what makes 'anything not in the contract is out of scope' survivable. Two sections: what the design document itself deferred, and what was raised during the build. Each entry states the idea, the constraint that blocks it, and the condit... |
| Phase-0 architecture map: describe the tree before changing it | `docs/ARCHITECTURE-UI.md` | copy + adapt | Written before any redesign work, "so that later phases argue with the repository rather than with a guess. Every line here was read out of the tree or measured, not assumed." It is a table of every file with its line count and role, the measured gzip size ... |
| README.md — the shape of a public README for a reviewed Reddit app | `README.md` | copy + adapt | Sections in this order: what the app does in plain prose, who it is for, **Critical operational notes** (the four claims a reviewer checks: one post per UTC day, one action per account per day enforced server-side, scores computed on the server, nothing lea... |

### 7.2 Worth seeing in full

**The single copy module — structure, not strings** — `src/shared/copy.ts`

```
export const COPY = {
  // -- Identity -----------------------------------------------------------
  title: 'DAYSHOT',
  /** GDD 9.9 */
  tagline: 'One shot that counts. Every day.',
  ...
} as const;

/** Scores always carry two decimals: 98.73, 100.00, 0.00. */
export const formatScore = (score: number): string => score.toFixed(2);
/** Percentiles carry one: "Top 4.2%". */
export const formatPercent = (percent: number): string => percent.toFixed(1);
```

**Derived standing text: rank + total → a line, a chip and an optional rank row** — `src/shared/copy.ts`

```
export const standingFor = (rank: number, total: number): Standing => {
  if (total <= 1) return { line: 'You opened the day.', chip: null, rankLine: null };
  if (total < PERCENTILE_MIN_PLAYERS) {
    return { line: `#${formatCount(rank)} of ${formatCount(total)} today`, chip: null, rankLine: null };
  }
  const rankLine = `#${formatCount(rank)} / ${formatCount(total)}`;
  if (rank <= 3) return { line: `#${rank} TODAY`, chip: 'gold', rankLine };
  const beat = ((total - rank) / total) * 100;
  if (beat >= 50) {
    const top = percentFor(rank, total);
    const shown = top < 10 ? top.toFixed(1) : String(Math.round(top));
    return { line: `TOP ${shown}% TODAY`, chip: 'coral', rankLine };
  }
  return { line: `You beat ${Math.round(beat)}% today`, chip: null, rankLine };
};
```

**Verdict from geometry — a word derived from the shot, with the bands expressed as ratios** — `src/shared/copy.ts`

```
const VERDICT_RADII = {
  soClose: 32 / 60, onTheMat: 1, nearMiss: 128 / 60, notBad: 251 / 60, roughLanding: 444 / 60,
} as const;

export const verdictFor = (result: {score, dx, impact, targetR}): Verdict => {
  if (result.impact === 'CLIFF') return 'INTO THE WALL';
  if (result.impact === 'OFF_THE_MAP' || result.score <= 0) return 'OFF THE MAP';
  if (result.score >= 100) return 'PERFECT';
  if (result.score >= BULLSEYE_SCORE) return 'BULLSEYE';
  const radii = result.dx / Math.max(1, result.targetR);
  if (radii <= VERDICT_RADII.soClose) return 'SO CLOSE';
  ...
```


### 7.3 Rules this codebase holds itself to

| Rule | Why | Enforced by |
| --- | --- | --- |
| Every player-visible string lives in `src/shared/copy.ts`. Nothing else may hard-code text a player reads. | One place to audit before an app review, one place to translate, and — because the server imports the same module — the card a player copies and the card the server publishes cannot drift ap | Convention only. `src/tests/copy.test.ts` pins the contractual wordings, but nothing greps the tree for stray  |
| `copy.ts` imports only `./tunables.ts` and `./types.ts`. Never `sim.ts`, never anything with a DOM or Node dependency. | The React-free feed bundle imports `copy.ts`, so anything `copy.ts` imports ships to the feed card. Pulling `sim.ts` in would both blow the 60 KB budget and put the day's answer in the feed. | `src/tests/inline-bundle.test.ts` — walks the real import graph from the inline entry and fails on forbidden m |
| Contractual wordings carry a `/** GDD 9.9 */` marker and are asserted character for character. | Distinguishes a string that may be improved from one that may not. A wording that changes silently is how a promise the product no longer keeps ends up in the post title a new player reads f | `src/tests/copy.test.ts` — `it('matches the document character for character')`. |
| A deliberate deviation from the contract gets its own test with its own explanation, rather than an edit in place. | So a future reader can tell a decision from a drift. When the warm-up became daily, "One attempt. Every day." stopped being true; the GDD-exact block stays visibly GDD-exact and the new word | `src/tests/copy.test.ts:83` — `it('promises one shot that counts, not one shot')`, ending in `assert.doesNotMa |
| Derived text is a pure function of data. Nothing stores a rendered sentence. | The wording of a rank, a verdict or a direction is a product decision that will change; a stored string freezes yesterday's decision into the database and makes the change a migration. | Type signatures plus boundary tests — `src/tests/verdict.test.ts` asserts every band flips at `edge` and `edge |
| One fact, one phrasing, across every surface. A second surface takes the first surface's string as an argument instead of recomputing it. | A player must never meet two wordings of the same standing in the same game. `feedPlayedLine(score, standing)` receives the standing rather than deriving it, so changing `standingFor` change | `src/tests/feed-copy.test.ts:173` — asserts the identity across four rank/total pairs and states in a comment  |
| Every figure shown to a player comes from real data. No fabricated counters, ever. | "A fabricated counter on a feed card is the kind of thing app review rejects, and rightly." When there is nothing impressive to say, the copy says the true small thing instead. | `src/tests/feed-copy.test.ts:103` — a property test asserting every number in the rendered line exists in the  |
| No system emoji in the UI. Emoji live only in strings destined for Reddit (comments, post titles). | They render differently on every OS and fight a fixed palette; the app draws its own vector glyphs (`src/client/ui/glyphs.ts`). Shared lines that need both get an emoji-free twin: `streakTex | `src/tests/feed-copy.test.ts` for the feed strings (`/\p{Extended_Pictographic}/u`); elsewhere a manual grep a |
| Numbers are formatted through exactly one helper per kind — `formatScore`, `formatPercent`, `formatDx`, `formatWind`, `formatCount`, `formatCountdown`. | Decimal places are a product decision, not a local choice: a score is always two decimals, a percentile one, an impact distance none. `formatWind` also fixes the typography — a real minus si | Convention only, but every template function in `copy.ts` calls them, so a new line written in the module inhe |
| Comments explain why, and record what went wrong. Never what the line does. | The expensive knowledge in this repo is not what the code does; it is which obvious alternative was tried and how it failed. A comment that names the bug is what stops the fix being 'simplif | Convention only. |
| New ideas go to `BACKLOG.md`, never into the code. The contract document is the scope. | An MVP under app review cannot absorb good ideas; and an idea with its blocking reason written down is worth more later than an idea half-implemented now. | Convention only — stated as rule 1 of `AGENTS.md` and honoured by 14 entries in `BACKLOG.md`, several of which |
| Every phase of work ends with a five-bullet log entry: done, verified with numbers, what the measurement overruled, the spec deviation argued, what is left and why. | The 'verified' bullet forces a number instead of an impression, and the 'overruled' bullet is where the reusable knowledge lives — it is a record of a plan meeting evidence and losing. | Convention only — `docs/UI-V2-LOG.md`, 17 entries, newest at the bottom. The five-bullet shape holds for the numbered phases; post-playtest entries run 4 to 8. |
| Relative imports carry explicit `.ts` / `.tsx` extensions, and anything reachable from a test avoids `enum`, `namespace` and constructor parameter properties. | The Node test runner resolves modules without a bundler and will not guess extensions; its strip-only TypeScript mode rejects syntax that type erasure cannot handle. | `allowImportingTsExtensions` + `emitDeclarationOnly` in `tools/tsconfig.base.json`, and `npm run test:unit` fa |

### 7.4 Traps

**Anchoring copy thresholds on a derived value instead of on the geometry it came from.**

- *Symptom:* The spec's verdict bands were score ranges explained as geometry ("87 = the edge of the mat"). A later change to the scoring curve moved the mat edge to 76, so a ball resting *on* the mat would have been told `NEAR MISS` — the exact failure the bands existed to prevent.
- *Fix:* Express every band as a ratio of the thing that can change: `const radii = result.dx / Math.max(1, result.targetR)`, with the multipliers written as the spec's own distances over the default radius (`128 / 60`) so the derivation stays readable. Test at `edge` and `edge + 0.01`.
- *Evidence:* `src/shared/copy.ts:727-780 (VERDICT_RADII and verdictFor); src/tests/verdict.test.ts:49-75`

**Absolute distance thresholds in copy, in a game where a modifier scales the world.**

- *Symptom:* The share grid bucketed misses at {4, 12, 35, 60}, correct at the default mat radius of 60. On a Tiny Target day the mat is 30 units across, so a shot 35 units out was well off the mat and still drew at ring 2 — as though it had landed on it.
- *Fix:* Store fractions of the span and rebuild the boundaries per call: `RING_FRACTIONS = [8/56, 31/56, 1]`, `ringBoundaries(targetR)` = `PERFECT_RADIUS + span * fraction`. Chosen so they reproduce 4/12/35/60 exactly at the default radius, which keeps the spec's worked example passing.
- *Evidence:* `src/shared/copy.ts:474-514; src/tests/copy.test.ts:212-255`

**A placeholder default that is a valid value. Here, `signedDx: 0` standing in for 'unknown'.**

- *Symptom:* `unranked()` hard-coded `signedDx: 0`, and `impactDirection` reads `signedDx < 0 ? 'short' : 'over'` — so every practice attempt was announced as *over*, including the ones that fell short, and so was the official shot for the second between impact and the server's answer. The one thing practice exists to tell you is which way to correct.
- *Fix:* Derive it from data that is actually present — `signedDx: shot && distance !== null ? shot.impactX - distance : 0` — and pass the day's distance into the view. Four tests hold the sign. Generally: never let a sentinel share a type with a meaningful value that a downstream sign test will read.
- *Evidence:* `src/client/result-view.ts:41-51; src/client/screens/PracticeStrip.tsx:50-56`

**The copy module is in the smallest bundle's import graph, so anything it imports ships to the feed card.**

- *Symptom:* The leaderboard needed a score→distance inverse. Putting it in `copy.ts` would have pulled `sim.ts` onto the feed card, blown the 60 KB gzip budget and put the day's answer in the feed — failing the import test written two phases earlier.
- *Fix:* Keep the copy module's imports to constants and types only; anything that needs the simulation lives in `src/client/screens/`. Write the import-graph test before the first violation, not after: `src/tests/inline-bundle.test.ts` checks the built files, not the source.
- *Evidence:* `docs/UI-V2-LOG.md:214-217 — "Client-side on purpose. `copy.ts` is in the feed bundle's import graph…"`

**One string serving two media. Emoji are right in a Reddit comment and wrong in the app.**

- *Symptom:* `streakLine` and `tomorrowLine` are contractual wordings carrying 🔥 and a modifier emoji. The app draws its own vector flame and modifier glyphs beside those strings, so reusing them in the UI produced two flames side by side — and emoji render differently on every OS against a fixed palette.
- *Fix:* Ship an emoji-free twin next to the contractual line (`streakTextLine`, `tomorrowTextLine`) with a comment saying which surface each is for, and test the UI-bound ones against `/\p{Extended_Pictographic}/u`.
- *Evidence:* `src/shared/copy.ts:309-325; src/tests/feed-copy.test.ts:123-141`

**The single-copy-file rule has no automated enforcement, and a duplicate sentence is invisible in review.**

- *Symptom:* `practiceBestLine` sat exported and unused in `copy.ts` while `Result.tsx` inlined its own copy of the same sentence — two wordings of one fact, free to drift, with the module still looking compliant.
- *Fix:* Either add a grep test (the `no-inline-scroll.test.ts` shape works: walk the client tree, strip comments, match a pattern, assert an empty offender list), or at minimum make every screen import named exports so an unused export is visible to the linter.
- *Evidence:* `src/shared/copy.ts:357-361 — "It existed here unused while `Result.tsx` inlined its own copy of the same sentence."`

**Percentiles and ranks computed without regard to how many people are in the field.**

- *Symptom:* The first player of the day is genuinely in the top 100%, and `TOP 100.0% TODAY` reads as sarcasm; a percentile of two players is a rank wearing a disguise, and "TOP 50.0%" says less than "#2 today" while sounding worse.
- *Fix:* A three-step ladder keyed on `total`: alone → a named first-shot line; under `PERCENTILE_MIN_PLAYERS` (50) → a rank; above → a percentile, with a paired `showsGlobalRank(total)` so the separate rank row is dropped when the headline is already a rank. Test the changeover at exactly the threshold and that it never reverts above it.
- *Evidence:* `src/shared/copy.ts:259-288; src/tests/copy.test.ts:406-458`

**Multi-line expected strings in tests get mangled by whatever writes the file.**

- *Symptom:* Escapes do not survive every layer between the author and the test file. In one phase an escaping slip wrote a literal `${'${step.shoot}'}` into a tool, which `setTimeout` coerced to zero — the misfire guard then swallowed every shot, exactly as designed, and the captures looked like evidence.
- *Fix:* Spell control characters out (`const NEWLINE = String.fromCharCode(10);`), build multi-line expectations as an array joined by it so the assertion reads like the rendered output, and use `\u{...}` escapes for the emoji glyphs being asserted.
- *Evidence:* `src/tests/copy.test.ts:42-43 — "Spelled out so the escape survives every layer of tooling in between"; docs/UI-V2-LOG.md:185-189`

**Copy that quotes the day's state can leak the day's answer.**

- *Symptom:* The post title, the seed comment and the splash description all name the day's modifier; naming the wind or the distance would remove the planning beat the game is built on, and no example-based test would catch a new line that added one.
- *Fix:* Give the function no access to the secret in the first place (`seedComment` never receives the wind), then assert the property over a long range: loop 200 real generated days and fail on any digit in the output that is not the day number, an allowed count, or part of "24 hours" / "00:00 UTC".
- *Evidence:* `src/tests/copy.test.ts:367-403; src/shared/copy.ts:413-446`

## 8. Testing and the QA rig

**How testing works here.** There is no test framework and no test dependency. `npm run test` is three gates chained: `tsc --build` across five project references, `eslint src`, then `node --experimental-strip-types --no-warnings=ExperimentalWarning --test "src/tests/**/*.test.ts"`. Every test file imports `{ describe, it }` from `node:test` and `assert from 'node:assert/strict'` — nothing else. 326 tests across 68 suites run in 1.5 seconds, which is the whole point: the suite is fast enough to be the pre-commit gate rather than a CI ritual. The `--experimental-strip-types` flag is load-bearing and constrains the *source under test*, not just the tests: Node's strip-only mode erases types without transforming syntax, so anything reachable from a test may not use `enum`, `namespace`, or constructor parameter properties, and every relative import must carry an explicit `.ts`/`.tsx` extension. `tools/tsconfig.base.json` sets `allowImportingTsExtensions: true` + `emitDeclarationOnly: true` so `tsc` accepts that. The glob is quoted in package.json so Node expands it, not the shell.

**Three genres of test.** (1) *Behaviour tests* over pure functions and a reducer — `machine.test.ts` drives `reduce(state, action)` through action sequences, `simulation.test.ts` pins boundary values, `copy.test.ts` asserts user-facing strings character-for-character against the design document. (2) *Fake-backed integration tests* — the server core reaches Redis and Reddit only through hand-written ports (`src/server/core/redis-port.ts`, `reddit-port.ts`), so `FakeRedis` and `FakeReddit` substitute for the platform entirely; `FakeRedis` takes a `latency` constructor argument that inserts a real `setTimeout` await into every command, which is what makes the eight-way concurrent-submission race in `shot-submission.test.ts` genuinely interleave. (3) **Guard tests** — the most transferable idea in the repo: tests that `readFileSync` the *source tree* and regex it to enforce a platform review rule that has no runtime symptom. `no-inline-scroll.test.ts` fails the build if any client file contains `overflow: auto|scroll`; `devvit-audio-rules.test.ts` asserts the AudioContext constructor appears exactly once and never at module scope; `inline-bundle.test.ts` walks the import graph from an entry file by regex and fails on forbidden modules, then gzips the *built* assets against a 60 KB budget; `tokens.test.ts` parses `index.css` for custom properties and asserts they equal the TypeScript token values.

**The QA rig.** `tools/devharness/server.mjs` is a ~150-line `node:http` server that serves `dist/client` and fakes the platform API, deriving its values from the real shared simulation rather than fixtures. `tools/qa/cdp.mjs` is a dependency-free Chrome DevTools Protocol client (Node 24's global `WebSocket`, ~130 lines) that spawns the harness plus headless Chrome, attaches to the page target, and tears both down in a `finally`. Four tools sit on it — `perf.mjs` (frame cost under CPU throttling), `profile.mjs` (CPU sampling profile), `a11y.mjs` (computed contrast plus measured focus rings and hit targets, writing `docs/qa/contrast.md`), `font-check.mjs` (does the webfont load, does it have tabular figures) — and `capture.mjs` drives a 63-entry shot list of viewport × app-state screenshots, reporting for each one whether the document scrolled, whether anything was clipped past the viewport edge, and which screen it actually reached. Everything is measured and exits non-zero; nothing is eyeballed.

### 8.1 What to lift

| Thing | Where | Verdict | Why |
| --- | --- | --- | --- |
| Dependency-free CDP client + browser/harness lifecycle. THE single most portable file in the repo. | `C:/Dev/daily-one-shot/tools/qa/cdp.mjs` | copy as-is | 130 lines, zero npm dependencies, works on Windows/Linux. Exports `Cdp` (a promise-multiplexing WebSocket client keyed on message id), `withBrowser(fn)` which spawns the harness + headless Chrome and kills both in a `finally`, and the constants `ROOT`/`BASE... |
| The guard-test pattern: a test that reads source files to enforce a platform review rule | `C:/Dev/daily-one-shot/src/tests/no-inline-scroll.test.ts` | copy + adapt | The whole file is 64 lines and is the template for the genre. Reddit rejected version 0.4 for an 'In-line Scroll Trap'; the rule is invisible in a desktop browser and surfaces days later in review. A behaviour test cannot catch it (a scrollable div is a per... |
| The dev harness: a plain-http fake of the platform server so the built client runs in any browser | `C:/Dev/daily-one-shot/tools/devharness/server.mjs` | copy + adapt | 153 lines of `node:http`. It serves `dist/client` as static files (`/` → `game.html`), answers every `/api/*` route the client calls, and adds one route the real server does not have: `GET /api/reset?...` which sets the whole session state from query params... |
| The capture rig: viewport × state screenshot matrix with scroll/clipping detection | `C:/Dev/daily-one-shot/tools/qa/capture.mjs` | copy + adapt | The `SHOTS` table is DAYSHOT-specific data; the driver around it is not. Each shot is `{ name, url, prep, w, h, steps? }` — `prep` is the harness reset query string, `steps` are `{ click: 'Label' }`, `{ hold: ms }`, `{ shoot: ms }`, `{ flight: ms }`. Run as... |
| The clipping + scroll + 'which screen did I actually reach' probe | `C:/Dev/daily-one-shot/tools/qa/capture.mjs` | copy as-is | This ~20-line `Runtime.evaluate` expression is the reason 63 captures are evidence rather than pictures. Because the app is laid out with `overflow: hidden`, it CANNOT scroll — so the way a too-tall layout fails instead is by silently cutting content off at... |
| Press-and-hold and full-gesture simulation over CDP | `C:/Dev/daily-one-shot/tools/qa/capture.mjs` | copy as-is | A charge-and-release game has states that exist only mid-gesture. `hold` presses and never releases, so the screenshot is taken with the gauge running; `shoot` presses, schedules a `pointerup` at N ms, then waits `shoot + 6000` for the projectile to land; `... |
| In-memory Redis fake implementing a hand-written port | `C:/Dev/daily-one-shot/src/tests/fake-redis.ts` | copy + adapt | 202 lines implementing `RedisLike` over three `Map`s. Two details make it worth copying rather than reinventing: it is faithful to the two semantics the app's correctness depends on (`SET NX` writes only when absent; `zRank` is the ASCENDING index and there... |
| The port pattern that makes the fakes possible — declare the slice of the platform SDK you use as a structural type | `C:/Dev/daily-one-shot/src/server/core/redis-port.ts` | copy + adapt | 51 lines of pure `type` declarations, no imports. The real `@devvit/web/server` `redis` satisfies `RedisLike` structurally, so the route layer passes it straight in and the core never imports the SDK. This is what makes 100+ server tests runnable with zero ... |
| Frame-cost measurement: wrapping requestAnimationFrame to time the app's own drawing | `C:/Dev/daily-one-shot/tools/qa/perf.mjs` | copy as-is | Answers a question most perf tooling gets wrong. `window.__frames` (interval between frames) is capped by the display — a median of 16.7ms means 60fps and says nothing about cost. `window.__work` (time inside the app's own rAF callback) is the number a '<10... |
| Accessibility tool: computed WCAG contrast + focus rings and hit targets measured in a real layout | `C:/Dev/daily-one-shot/tools/qa/a11y.mjs` | copy + adapt | Two halves, both worth lifting. Contrast is computed in Node from a `COLOR` map using WCAG 2.1 relative luminance (`c <= 0.03928 ? c/12.92 : ((c+0.055)/1.055)**2.4`, weights .2126/.7152/.0722, ratio `(hi+0.05)/(lo+0.05)`) against a `PAIRS` table naming ever... |
| Import-graph guard + gzip budget against the built output | `C:/Dev/daily-one-shot/src/tests/inline-bundle.test.ts` | copy + adapt | Two guards in one file. The first walks the module graph from an entry by regexing `(?:from|import)\s*\(?\s*['"]([^'"]+)['"]` and following relative specifiers, collecting bare specifiers separately as `packages` — then asserts a FORBIDDEN list of resolved-... |
| Guard test for the platform's audio rules (Reddit inline-mode requirement 5, 'Safe use of sound') | `C:/Dev/daily-one-shot/src/tests/devvit-audio-rules.test.ts` | copy + adapt | The rule text is quoted in the file header, then each of the three bullets becomes an assertion against source: an AudioContext may be constructed exactly once (`code.match(/new Ctor\(/g).length === 1`) and never at module scope; a mute button exists in the... |
| Design-token mirror guard: TypeScript tokens vs CSS custom properties | `C:/Dev/daily-one-shot/src/tests/tokens.test.ts` | copy + adapt | Whenever a design system has two representations (a TS object for canvas/JS, CSS variables for Tailwind), one of them is always the one somebody forgets, and a screen half in the new palette looks fine in each half. `cssVar(name)` regexes `--<name>:\s*([^;]... |
| package.json test scripts and the Node-runner setup | `C:/Dev/daily-one-shot/package.json` | copy as-is | The entire test infrastructure, in four lines and zero dependencies. `test` is the pre-commit gate; `test:types` runs `tsc --build` over the project graph; `test:unit` is the Node runner. Note the quoted glob (Node expands it, not the shell) and `--no-warni... |
| TypeScript config that lets the Node runner and tsc agree | `C:/Dev/daily-one-shot/tools/tsconfig.base.json` | copy as-is | The three settings that make `--experimental-strip-types` viable with a type-checked codebase: `allowImportingTsExtensions: true` (so relative imports can carry `.ts`, which Node needs since it will not guess extensions), `emitDeclarationOnly: true` (which ... |
| CPU sampling profiler over CDP — names the expensive function instead of nominating one | `C:/Dev/daily-one-shot/tools/qa/profile.mjs` | copy as-is | 78 lines. `Profiler.enable` / `Profiler.start` / sleep / `Profiler.stop`, then it folds `profile.samples` into self-time per node, keys by `functionName file:line`, and prints the top 18 as a percentage bar chart. Written after two rounds of optimising by i... |
| Webfont verification: does the @font-face actually apply, and does it have tabular figures | `C:/Dev/daily-one-shot/tools/qa/font-check.mjs` | copy + adapt | Turns a spec-sheet assumption into a build-time measurement, and the technique is generic: `await document.fonts.ready`, `document.fonts.check('700 44px "Family"')`, then render digits 0-9 at 100px into a hidden span with and without `font-variant-numeric: ... |
| Reducer test harness: an `run(start, ...actions)` fold plus overridable fixture builders | `C:/Dev/daily-one-shot/src/tests/machine.test.ts` | keep the shape | 559 lines, the largest test file, and the pattern is fully portable to any app whose UI state is a `reduce(state, action)`. Three helpers do all the work: `serverState(over)` / `shot(over)` fixture builders taking `Partial<T>` overrides, and `run()` which f... |
| Concurrency and idempotency tests using the fake's latency knob | `C:/Dev/daily-one-shot/src/tests/shot-submission.test.ts` | keep the shape | The template for testing a distributed-ish write path without a server. `new FakeRedis(1)` + `Promise.all` of eight submissions proves exactly one wins and the other seven get the winner's stored result back. Other cases worth stealing wholesale: crash-reco... |
| In-memory Reddit fake recording what the app tried to publish | `C:/Dev/daily-one-shot/src/tests/fake-reddit.ts` | copy + adapt | 68 lines implementing `RedditLike`. Records posts and comments into arrays so tests assert on the exact payload, and exposes `failNextPost` / `failNextComment` one-shot flags so failure paths (release the claim, let the player retry) are testable. The retur... |
| Contractual-copy tests: user-facing strings asserted character-for-character | `C:/Dev/daily-one-shot/src/tests/copy.test.ts` | keep the shape | 16 KB, the second-largest file. All player-visible text lives in one module (`src/shared/copy.ts`) and this asserts it against the design document verbatim, including a worked share-card example reproduced exactly. Worth stealing: `const NEWLINE = String.fr... |
| Statistical / property tests over generated content (is every day actually playable?) | `C:/Dev/daily-one-shot/src/tests/distribution.test.ts` | keep the shape | The genre to copy if your app generates content procedurally. It sweeps 220 generated days and asserts playability properties rather than exact numbers: fewer than 5% of days are unwinnable, every target can be both undershot and overshot, distance stays in... |
| Platform-primitive tests: pin the JS semantics a deterministic core depends on | `C:/Dev/daily-one-shot/src/tests/determinism-primitives.test.ts` | copy as-is | Only 2.3 KB and slightly unusual: it tests the language, not the app. Five assertions — `Math.imul` is exact 32-bit multiplication (the PRNG backbone), `>>> 0` normalises to uint32, IEEE-754 addition is order-dependent so the simulation must fix its summati... |
| The remaining 13 behaviour test files — app-specific content, reusable shapes | `C:/Dev/daily-one-shot/src/tests/` | keep the shape | Full inventory of what each guards. atmospheres.test.ts — the seven per-modifier palettes match the design doc's hex table and no theme out-glows the celebration. camera.test.ts — the camera moves once per shot and eases rather than cuts; plus `resultPanelI... |

### 8.2 Worth seeing in full

**Dependency-free CDP client + browser/harness lifecycle. THE single most portable file in the repo.** — `C:/Dev/daily-one-shot/tools/qa/cdp.mjs`

```
static async attach(wsUrl) {
  const client = new Cdp();
  client.#ws = new WebSocket(wsUrl);          // Node 24 global — no `ws` package
  client.#ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    const resolver = client.#pending.get(msg.id);
    if (!resolver) return;
    client.#pending.delete(msg.id);
    if (msg.error) resolver.reject(new Error(msg.error.message));
    else resolver.resolve(msg.result);
  });
  await new Promise((ok, no) => {
    client.#ws.addEventListener('open', ok, { once: true });
    client.#ws.addEventListener('error', no, { once: true });
  });
  return client;
}

send(method, params = {}) {
  const id = ++this.#id;
  return new Promise((resolve, reject) => {
    this.#pending.set(id, { resolve, reject });
    this.#ws.send(JSON.stringify({ id, method, params }));
  });
}
```

**The guard-test pattern: a test that reads source files to enforce a platform review rule** — `C:/Dev/daily-one-shot/src/tests/no-inline-scroll.test.ts`

```
const CLIENT = new URL('../client/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const sourceFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(tsx?|css|html)$/.test(entry.name) ? [full] : [];
  });

/** Comments explain the rule and must not be mistaken for breaking it. */
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const SCROLLERS = /overflow-(?:y-|x-)?(?:auto|scroll)|overflow\s*:\s*(?:auto|scroll)/;

it('has no scrollable container anywhere in the client', () => {
  const offenders = sourceFiles(CLIENT)
    .map((file) => ({ file, code: stripComments(readFileSync(file, 'utf8')) }))
    .filter(({ code }) => SCROLLERS.test(code))
    .map(({ file, code }) => `${file}: ${SCROLLERS.exec(code)?.[0]}`);
  assert.deepEqual(offenders, [], `Reddit rejects apps whose in-line web view scrolls...`);
});
```

**The dev harness: a plain-http fake of the platform server so the built client runs in any browser** — `C:/Dev/daily-one-shot/tools/devharness/server.mjs`

```
// The real modifier for the day, not a hardcoded one. The stub used to claim
// CROSSWIND while the client regenerated the level from the seed and drew CLEAR
// SKIES -- the day bar and the pill disagreed in every screenshot.
const { generateLevel, simulateLevel } = await import('../../src/shared/sim.ts');

if (url.pathname === '/api/reset') {
  played  = url.searchParams.get('played') === '1';
  anon    = url.searchParams.get('anon') === '1';
  streak  = Number(url.searchParams.get('streak') ?? 3);
  restoredHold = Number(url.searchParams.get('hold') ?? 640);
  DAY   = wanted ? dayWithModifier(wanted) : TODAY;
  LEVEL = generateLevel(DAY);
  return send(200, '{"ok":true}');
}

if (url.pathname === '/api/shot') {
  played = true;
  let body = ''; for await (const chunk of req) body += chunk;
  const { holdMs } = JSON.parse(body || '{}');
  // Simulated, not stubbed: the server re-simulates from holdMs in
  // production; so does this.
  const shot = simulateLevel(LEVEL, Number(holdMs) || 0);
  return send(200, JSON.stringify({ score: shot.score, dx: shot.dx, ... }));
}
```


### 8.3 Rules this codebase holds itself to

| Rule | Why | Enforced by |
| --- | --- | --- |
| Zero test dependencies: `node:test` + `node:assert/strict` only. No Jest, Vitest, Playwright, Puppeteer, `ws`, or axe. | The suite is the pre-commit gate, so it has to be instant and un-break-able by a dependency bump. 326 tests run in 1.5s. The CDP tooling reaches the same conclusion from the other side: Node | package.json has no test-framework dependency at all; `tools/qa/*.mjs` import only `node:*` builtins |
| Every relative import carries an explicit `.ts` / `.tsx` extension. | The Node test runner resolves modules without a bundler and will not guess extensions. | `allowImportingTsExtensions` + `emitDeclarationOnly` in tools/tsconfig.base.json; `tsc --build` fails otherwis |
| Nothing reachable from a test may use `enum`, `namespace`, or constructor parameter properties. | `--experimental-strip-types` is strip-only: it erases type annotations without transforming syntax, and rejects constructs that need real codegen. This constrains production source, not just | Node throws at load time; documented as hard rule 5 in AGENTS.md |
| Platform SDKs are reached through a hand-written structural port type, never imported into the core. | The real client satisfies the port structurally, so the route layer passes it straight through and every piece of core logic is testable against an in-memory fake. It also puts the exact set | convention only, plus `FakeRedis implements RedisLike` — widening the port breaks the fake's compile |
| A guard test strips comments before matching, and reports ALL offenders via `assert.deepEqual(offenders, [])`. | These tests document the rule they enforce in a long header comment, and would otherwise match their own explanation. Collecting offenders into an array means one run names every violation i | convention only — `stripComments` is copy-pasted into no-inline-scroll.test.ts, devvit-audio-rules.test.ts |
| Guard tests run against the BUILT output where the rule is about output (bundle size, asset weight), and against source where it is about authoring. | A gzip budget measured from source is a guess. inline-bundle.test.ts reads `dist/client/splash.html`, follows every `src=`/`href=`, and gzips the real files. | convention only; and see the trap about it skipping silently when dist is absent |
| Every test-file header states the bug or review rejection that caused the test to exist. | It converts the suite into an institutional memory. `no-inline-scroll.test.ts` names the 0.4 rejection; `camera.test.ts` quotes the playtester's complaint verbatim; `perf.mjs` explains why t | convention only |
| QA is measured and exits non-zero, never eyeballed. | A screenshot is not evidence unless something asserted what it contains. Each capture reports its measured viewport, whether the document scrolled, whether anything was clipped, and which sc | `process.exit(failures > 0 ? 1 : 0)` in capture.mjs and a11y.mjs; documented as UI convention 7 in AGENTS.md |
| Generated documentation is generated, not typed. `docs/qa/contrast.md` is written by `a11y.mjs`. | A hand-maintained contrast table stops being true the first time a colour moves, and it does so silently. | convention only — the doc's own first line says which script writes it |
| The harness derives its values from the real shared code; it never hardcodes what the client can recompute. | A fixture that disagrees with the client is worse than no fixture: it produces screenshots of a state that cannot exist. This harness has had that bug twice (a hardcoded modifier, and an ech | convention only — the top of server.mjs does `await import('../../src/shared/sim.ts')` |
| Fixture builders take `Partial<T>` overrides and spread defaults: `const shot = (over: Partial<ShotResult> = {}) => ({ ...defaults, ...over })`. | Keeps a 20-field fixture from appearing in every test, and makes each test name the one field it is actually about. | convention only; used in machine.test.ts, shot-submission.test.ts, state.test.ts |
| Tests get their own tsconfig project with `exactOptionalPropertyTypes: false` and `types: ["node"]`. | The shared simulation project deliberately sets `"types": []` so Node globals cannot leak into code that must run identically on both sides; tests need the opposite. Relaxing one strictness  | tools/tsconfig.node.json, referenced by eslint.config.js for `src/tests/**` |

### 8.4 Traps

**Headless Chrome on Windows silently clamps `--window-size` to a 500px minimum.**

- *Symptom:* You ask for a 360px or 390px mobile viewport with `chrome --headless --screenshot --window-size=360,640` and get a screenshot of a 500px layout. `innerWidth` reports 500. The image looks plausible and shows a layout that does not exist on any phone.
- *Fix:* Never use `--window-size`. Drive CDP and set the viewport with `Emulation.setDeviceMetricsOverride` ({ width, height, deviceScaleFactor: 2, mobile }), which sets it exactly. This is the entire reason the repo has a hand-rolled CDP client rather than a one-line screenshot command.
- *Evidence:* `tools/qa/capture.mjs:8-14 — "Measured, not assumed -- `--window-size=360` reports `innerWidth === 500`."`

**A stale harness process from an earlier run keeps port 5599; the new one fails to bind silently because its stdio is ignored.**

- *Symptom:* Every capture is taken against whatever code the OLD process was built from. The screenshots are of a previous build and look completely normal. Cost an afternoon: the feed's anonymous state kept rendering as a returning player because a harness from before the flag existed was still answering.
- *Fix:* Probe the port before spawning and refuse to run if anything answers. `capture.mjs` does this; **`cdp.mjs`'s `withBrowser()` does not**, so `perf.mjs`, `profile.mjs`, `a11y.mjs` and `font-check.mjs` are all exposed. Lift the guard into `withBrowser` when you copy the directory.
- *Evidence:* `tools/qa/capture.mjs:289-311 (`const stale = await fetch(BASE + '/api/state', { signal: AbortSignal.timeout(800) })`) vs tools/qa/cdp.mjs:93-128, whic`

**`new URL('../x', import.meta.url).pathname` returns `/C:/Dev/...` on Windows — a leading slash before the drive letter.**

- *Symptom:* `readFileSync` throws ENOENT on a path that looks correct in the error message. Only on Windows, so it passes in CI and fails on the developer's machine (or vice versa).
- *Fix:* The repo's idiom, repeated in every file that reads source: `.replace(/^\/([A-Za-z]:)/, '$1')`. Consider `fileURLToPath` from `node:url` instead, which handles this properly; the repo does not use it but every guard test would be shorter if it did.
- *Evidence:* `src/tests/no-inline-scroll.test.ts:19-22, tokens.test.ts:27-33, inline-bundle.test.ts:22-30, devvit-audio-rules.test.ts:23-27, tools/devharness/server`

**Timing rAF through your own rAF wrapper measures the wrapper.**

- *Symptom:* The reported median frame work halves. The number stops describing the game's drawing and starts describing the average of the drawing and an empty function, because the recorder itself is one more callback per frame.
- *Fix:* Save the original before wrapping (`window.__rawRaf = raf`) and have the recorder schedule itself through the unwrapped one.
- *Evidence:* `tools/qa/perf.mjs:59-73 — "Timed through the wrapper it added a callback per frame that does almost nothing, which halved the reported median."`

**A programmatic `element.focus()` does not make `:focus-visible` match.**

- *Symptom:* Your focus-ring audit reads an empty `outlineWidth` and prints a blank column that looks like 'this app has no focus rings' but actually means 'nothing was measured'. A false failure that sends you rewriting working CSS.
- *Fix:* Press a real Tab through the browser's input pipeline: `Input.dispatchKeyEvent` with `{ type: 'rawKeyDown'|'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 }`, wait ~120ms, then read `getComputedStyle(document.activeElement)`. CDP key events are indistinguishable from a real key.
- *Evidence:* `tools/qa/a11y.mjs:112-130 — "the first version of this check read an empty string and printed a blank column that looked like 'no ring' and meant 'no `

**Reporting the interval between frames as if it were frame cost.**

- *Symptom:* A median of 16.7ms is reported as the app's frame time and read as 'we are right at the 16.7ms budget'. In fact 16.7ms is the 60Hz display cap and says nothing about cost — a page doing almost nothing reports exactly the same number. A '<10ms median frame time' budget is unmeasurable this way, since 10ms is below the interval a 60Hz screen can produce.
- *Fix:* Report two series. `__frames` (interval, where the meaningful statistic is the count over 20ms — dropped frames) and `__work` (time spent inside the app's own rAF callback), and put the budget on the second.
- *Evidence:* `tools/qa/perf.mjs:28-40 and the closing note at :178-181`

**When the app is laid out with `overflow: hidden`, a too-tall screen cannot scroll — so it fails by clipping instead, and clipping is invisible in a screenshot.**

- *Symptom:* A label sitting half outside the frame reads as a rendering artefact. `document.scrollHeight > clientHeight` is false, so a scroll check passes and the layout bug ships.
- *Fix:* Measure both. After each capture, walk `#root *`, skip empty/zero-size/hidden elements, and flag any whose `getBoundingClientRect()` crosses the viewport edge (`r.bottom > h + 0.5 || r.top < -0.5 || r.right > w + 0.5 || r.left < -0.5`). Report scroll AND clipping, and fail the run on either.
- *Evidence:* `tools/qa/capture.mjs:430-462`

**`inline-bundle.test.ts`'s budget check passes silently when there is no build.**

- *Symptom:* `npm run test` is green, the 60 KB gzip budget was never checked, and the payload has doubled. The test calls `t.diagnostic(...)` and returns when `dist/client/splash.html` is missing — a diagnostic is not a failure and scrolls past in a 326-test run.
- *Fix:* Either run `npm run build` before `test:unit` in the gate, or make the missing-dist case a real failure in CI. The comment claims it 'says so loudly rather than passing quietly'; in practice it passes quietly.
- *Evidence:* `src/tests/inline-bundle.test.ts:137-141 — `if (!existsSync(splash)) { t.diagnostic('no dist/client — run `npm run build` to check the budget'); return`

**`capture.mjs` has its own private copy of the `Cdp` class instead of importing `cdp.mjs`.**

- *Symptom:* Two CDP clients drift. A fix to the shared one (the stale-port guard, a reconnect, a timeout) does not reach the tool that takes all 63 screenshots. `capture.mjs` was written first, in phase 0; `cdp.mjs` was extracted later and only the four newer tools use it.
- *Fix:* When lifting the directory, delete `capture.mjs`'s inline `Cdp` class (lines 229-278) and `import { Cdp, withBrowser, BASE, wait, ROOT } from './cdp.mjs'`, moving the stale-port guard into `withBrowser` at the same time. Also note `export const SHOTS` is exported but nothing imports it.
- *Evidence:* `tools/qa/capture.mjs:229-263 duplicates tools/qa/cdp.mjs:28-73; `grep "from './cdp.mjs'"` matches a11y, font-check, perf, profile — not capture`

**The QA tools synchronise on fixed sleeps, not on events.**

- *Symptom:* `await wait(2600)` after every navigation ('load + the result cascade, which is ~1.6s'), `shoot + 6000` after a shot. On a slower machine or a heavier build the screenshot is taken mid-animation; the failure looks like a visual regression. Under a CPU throttle of 4x or 6x the margins get thin.
- *Fix:* It works and it is simple, so keep it when you copy — but budget for raising the constants, and lean on the `reached` field of the measurement probe (the first lines of `body.innerText`) to catch a capture that landed on the wrong screen rather than trusting the sleep.
- *Evidence:* `tools/qa/capture.mjs:351 and :411-419; the `reached` guard at :452-453`

**A harness that stubs a value the client independently recomputes produces screenshots of an impossible state.**

- *Symptom:* The stub claimed the day's modifier was CROSSWIND while the client regenerated the level from the day seed and drew CLEAR SKIES. The day bar and the conditions pill disagreed in every screenshot, and it read as a UI bug. Separately, `/api/shot` returned a fixed `dx: 6.4` and echoed back whatever score the client claimed, so every captured result read the same verdict no matter where the ball went — making a distance-keyed verdict function untestable through the rig.
- *Fix:* Derive, do not stub. Import the real shared module into the harness. Where a specific state is wanted, SEARCH for real inputs that produce it rather than overriding the output — `dayWithModifier(wanted)` scans forward up to 400 days for a day that genuinely generates that modifier.
- *Evidence:* `tools/devharness/server.mjs:8-16 and :126-135; `dayWithModifier` at :32-37`

**Some states cannot be reached by simulating a gesture, because the input precision does not exist.**

- *Symptom:* On the measured day a Perfect is a 318ms hold and a Bullseye is 314ms — four milliseconds apart. A `setTimeout`-scheduled synthetic `pointerup` cannot land that precisely, so those two result panels can never be screenshotted by playing a shot.
- *Fix:* Give the harness a way to restore a genuinely-simulated result rather than fake one: `?played=1&hold=318` re-runs the real simulation at that hold and serves the result back. Score, verdict and distance are all real; they were simply not thrown live. Note in the shot list which captures are restored, and verify the live-only parts (celebration effects) at playtest.
- *Evidence:* `tools/qa/capture.mjs:108-117 and tools/devharness/server.mjs:48-72 (`restoredHold`, `myResult()`)`

**`requestAnimationFrame` does not run when a preview pane is hidden — but it does run in headless Chrome.**

- *Symptom:* Mid-gesture and mid-flight states appear uncapturable, because interactive attempts through a hidden preview pane produce frozen frames. The wrong conclusion is 'headless cannot capture animation'.
- *Fix:* Headless is a different animal: rAF runs. `perf.mjs` asserts this explicitly and bails with a clear message rather than reporting meaningless numbers (`if (report.early === 0) { console.error('requestAnimationFrame produced no frames. Nothing was measured.'); process.exit(1); }`). Keep that assertion when you port the rig to a new Chrome version.
- *Evidence:* `tools/qa/capture.mjs:355-359 and tools/qa/perf.mjs:12-16, :98-99, :131-134`

**`a11y.mjs` and `font-check.mjs` report problems they do not fail on.**

- *Symptom:* `a11y.mjs` exits on `failures.length + undersized.length` only — a focus ring measured as `NONE on <button>` prints in the table and exits 0. `font-check.mjs` exits 1 only when the font fails to load; a font with no tabular figures prints a VERDICT telling you to implement a fallback and exits 0. In a CI gate both read as green.
- *Fix:* Decide which findings are gates and add them to the exit code. At minimum, fail when `ring` starts with `NONE` on a screen that has focusable controls.
- *Evidence:* `tools/qa/a11y.mjs:264 `process.exit(failures.length + undersized.length > 0 ? 1 : 0)`; tools/qa/font-check.mjs:75-95`

**Chrome reuses a running browser profile and ignores your `--remote-debugging-port`.**

- *Symptom:* `/json/list` never answers, or answers from the developer's everyday browser window, and the rig attaches to the wrong page.
- *Fix:* Always pass a dedicated `--user-data-dir`. The repo puts it inside the project: `'--user-data-dir=' + join(ROOT, 'node_modules', '.qa-chrome')`, which keeps it gitignored for free. Also pass `--no-first-run --no-default-browser-check --hide-scrollbars --disable-gpu` and open `about:blank` so there is exactly one page target to find.
- *Evidence:* `tools/qa/cdp.mjs:101-114 and tools/qa/capture.mjs:318-331`

**`noUncheckedIndexedAccess: true` makes every array index and regex capture `T | undefined`, which bites hardest in test code.**

- *Symptom:* `SCROLLERS.exec(code)[0]` and `match[1].trim()` fail to compile, and `sorted[sorted.length - 1].toFixed(2)` does too. Test files are where you index most casually.
- *Fix:* The repo's house style is `?.[0]` where undefined is acceptable in a message, and a non-null `!` only after an `assert.ok(match, ...)` that has already proven it. `assert.ok` is a TypeScript assertion function, so it narrows.
- *Evidence:* `src/tests/no-inline-scroll.test.ts:43 `SCROLLERS.exec(code)?.[0]`; tokens.test.ts:36-39 `assert.ok(match, ...); return match[1]!.trim();``

## 9. Your tooling will lie to you, and it will lie flatteringly

This chapter is the most valuable thing in this document and the least
transferable as code, so it is written as a list of real incidents. In every one
of them a tool reported success. Not one failed loudly.

| What the tool said | What was true | Root cause |
| --- | --- | --- |
| "Captured at 390×720" | The window was 500px wide; the panel in the shot was clipped by the *screenshot*, not by the app | `chrome --window-size` clamps to a 500px minimum on Windows. Mobile viewports are unreachable that way — drive `Emulation.setDeviceMetricsOverride` over CDP instead |
| "Median frame work 0.4ms" | Double that | The recorder timed *its own* do-nothing callback instead of the app's frame. It now schedules through the unwrapped `requestAnimationFrame` |
| "Focus ring: (blank)" | Every control had a ring | `getComputedStyle(el, ':focus-visible')` returns nothing. Only a real Tab through `Input.dispatchKeyEvent` sets the browser's keyboard-interaction flag |
| "Leaderboard fits, no scroll" | The real ten-row board overflowed | The dev harness served three rows. A fixture kinder than production is worse than no fixture |
| "Wind: CROSSWIND" | The client drew CLEAR from the seed | The harness hard-coded conditions instead of deriving them from the same `sim.ts` the client uses |
| "SO CLOSE — 6 over", every single shot | Every shot was different | The harness answered every submission with a fixed `dx: 6.4` |
| "All captures clean after the fix" | They tested the build from before the fix | A stale harness process still held the port. The rig now refuses to run against a server it did not start itself |
| "Sky cache: 53 dropped frames" (after an optimisation) | The cache made it *worse* | The bitmap was stored in CSS pixels and the DPR transform resampled it every blit. Cache at device resolution and blit with an explicit destination size |
| "Day #2 wraps to two lines" | It did not | The capture on disk predated the build by 40 seconds. Check mtimes before believing a screenshot |
| (silence) | A tool had just overwritten three baseline captures | `capture.mjs` executes at module scope. Merely `import`ing it to inspect it spawned a browser and wrote into `docs/qa/before/`, destroying part of the before/after record. Scripts with side effects need an `import.meta.main` guard |

Three habits come out of this:

1. **Make the tool prove its own preconditions.** The capture rig now prints the
   measured viewport with every shot and refuses to run against a server it did
   not start. A tool that cannot say what it measured has not measured anything.
2. **Make fixtures the worst case, never the average.** Three rows instead of
   ten, one modifier instead of seven, a fixed score instead of a real
   simulation — each of those passed a test that production failed.
3. **Believe the third reproduction, not the first.** Two of the performance
   findings above reversed under repetition. If an optimisation's result
   surprises you, run it again before you keep it.

## 10. What only a real device told us

Six defects survived 300 tests and 60 automated captures and were found by one
person playing on a phone. They are worth studying because they share a cause.

| Reported as | Actually |
| --- | --- |
| "The view changes far too much and too fast" | Three camera framings per shot in about a second. Two of them were bugs: the aiming band was tied to `canAim` so the ground line jumped at release, and a 400ms eased move had never been interpolated and was a hard cut |
| "After you shoot you can't tell what game it is" | The result framing centred on the impact and cropped the launcher — a close-up of a ball on a mat, with no scale reference, so "16 short" meant nothing |
| "Full screen shows a sort of mobile format" | A 480px cap meant for the *panel* had been applied to the whole app |
| "The word PRACTICE takes far too much space" | 307px of diagonal type on a desktop, because the size was a share of the canvas width |
| "You have to press Again after every shot" | Practice ended each attempt on the full result panel; ten shots meant ten taps and twenty camera moves |
| (nobody reported it) | The sound was unreachable: off by default, and its only switch was two taps deep in a help sheet |

**The common cause: nothing had ever captured the state the player was in.**
There was no screenshot of "practice, shot landed", none of "returning to a
result you already took", and none of a desktop-width window. Every one of these
was invisible because the state itself was never photographed.

So: when a playtester reports something, do not only fix it — **add the capture
of the state they were in**, and it becomes impossible to lose again. Both new
captures added after the practice report (`practice-landed`,
`practice-landed-compact`) exist for exactly that reason.

A second, humbler lesson: the player was right six times out of six, including
about things I had argued for. When a report and a design document disagree, the
report wins.

## 11. What makes a Reddit app work — Reddit's own guidance

From `docs/guides/community_games.md` in `reddit/devvit-docs`. Worth reading in
full before choosing your next idea, because it tells you what Reddit optimises
for when it decides what to feature.

> Reddit prioritizes sustained engagement over short spikes.

Five principles, with the reasoning that matters:

| Principle | What it means in practice |
| --- | --- |
| **Keep it bite-sized** | Players engaged within seconds. Smaller scope also means faster development and easier maintenance — this is a constraint doing you a favour |
| **Design for the feed** | Your first screen competes with everything else someone is scrolling past. Eye-catching, with an immediate and *honest* call to action |
| **Build a content flywheel** | Reddit posts decay fast. Either **scheduled content** (a daily challenge, automated post creation) or **player-generated content** (play produces posts or comments) |
| **Embrace asynchronous play** | Anyone, any time zone, low commitment per session. Scales without matchmaking |
| **Scale from one to many** | Fun with one player, better with a thousand. Leaderboards and shared goals are how you get the second half without breaking the first |

DAYSHOT is Option A of the flywheel: a scheduler creates one post per UTC day,
so the community always has something current without anyone writing content.
That is a lot of value from one cron entry, and it is the cheapest retention
mechanism the platform offers.

**On the feed card specifically**, two things learned the hard way: the label
must not promise what the tap does not do (`TAP TO SHOOT` promised a throw the
tap did not take), and the card must render something real even when the state
call fails — a plausible scene with an honest CTA is a far better failure than a
spinner, and it cannot mislead.

### 11.1 Listed or unlisted?

> We do not recommend listing apps built for a single subreddit, as this may
> confuse moderators and clutter the directory.

So `npx devvit publish` (unlisted) is the *correct* choice for a game living in
its own community — not a lesser one. Use `--public` only if your app is a
general-purpose tool any moderator would install.

If you later want specific other communities to install it without going
public, ask r/Devvit modmail for **Public Limited mode**: an allowlist of up to
100 subreddits that can install unlisted versions from a direct link. It is
opt-in, and unlisted versions are still fully reviewed.

## 12. How to run a project like this with an assistant

DAYSHOT was built and rebuilt with an AI assistant. These are the practices that
made the difference, stated so you can reuse them rather than rediscover them.

### 12.1 Write the prohibitions down, not just the goal

The UI rebuild came with an explicit list of what must **not** change: the
simulation, the scoring, the seed, the locks, the Redis keys, the scheduler,
sharing, anti-cheat, the streak and leaderboard logic. Plus: no existing test
may be modified to make new code pass, and any idea outside the spec goes to
`BACKLOG.md` rather than into the code.

That list did more work than the goal did. A goal invites interpretation; a
prohibition is checkable. Ten phases of interface changes landed without a
single line of business logic moving.

### 12.2 Gate every phase on the same four things

Type-check, lint, tests, build — then visual QA — then one atomic commit and one
log entry. Every phase, no exceptions. The value is not the ceremony; it is that
when something breaks you know it broke in the last phase, and you have a commit
to bisect to.

### 12.3 Keep a decision log, and record what went wrong

`docs/UI-V2-LOG.md` has one entry per phase and per playtest. A good entry is
not "changed the camera". It is:

> The ground line jumped at release. The aiming panel's reservation was
> `canAim ? PANEL_SHARE : 0`, so the instant the thumb lifted the world dropped
> a quarter of the screen — a hard cut at the exact moment the player is
> watching the ball.

Symptom, cause, and the reasoning. Six months later that is the only artefact
that can stop you reintroducing it, and it is the raw material for a document
like this one.

The same applies to code comments. This codebase's convention is that comments
explain **why**, and preferentially record what went wrong:

```ts
// Never regress to null. The confirmation arrives once with a full response
// and may be re-dispatched at impact without one; letting the second
// overwrite the first cost a brand new player their streak.
```

That comment is worth more than any description of what the line does.

### 12.4 Turn every platform rule into a failing test

Review rules do not fail visibly. They fail in review, a week later, in a
message from a stranger. So each one becomes a test that reads the source:

- `no-inline-scroll.test.ts` — no scrollable container anywhere in the client
- `devvit-audio-rules.test.ts` — the three audio bullets
- `inline-bundle.test.ts` — the feed bundle's size and forbidden imports

Write the test **when you fix the rejection**, not later. And confirm the test
fails when you put the bad code back; a guard test that has never gone red is a
guess.

### 12.5 Capture the state the player is actually in

Every defect a real playtester found was in a state no screenshot existed for
(§10). When a report comes in, fix it *and* add the capture. The rig's screen
list is the real specification of what you have looked at.

### 12.6 Ask for the honest version of a request

"Can you turn the sound on before the user does?" had a true answer of "no, the
browser forbids it" — and a useful one underneath: the sound was unreachable for
almost every player, and turning it on required two compliance fixes first.
Answering only the literal question would have been correct and useless.
Answering only the useful part would have been presumptuous. Both, in that
order, is the shape.

### 12.7 Do not trust a green result you did not design to be able to fail

Restated from §9 because it is the whole lesson: nine separate times a tool in
this project reported success while being wrong, and every single one of those
failures flattered the code. Ask of any passing check: *what would this look
like if it were broken?* If the answer is "the same", the check is decoration.

---

## Where the rest of it lives

| Document | What it holds |
| --- | --- |
| `README.md` | The app for a non-developer. Also a review requirement (§1.1) |
| `RELEASE.md` | The submission record: what was rejected, what was fixed, what is claimed |
| `AGENTS.md` | The conventions an assistant must follow in this repo |
| `docs/ARCHITECTURE-UI.md` | How the client is put together |
| `docs/UI-V2-LOG.md` | One entry per phase and per playtest — the decision log (§12.3) |
| `docs/qa/REPORT.md` | The redesign's final report, with the deviations argued |
| `docs/qa/contrast.md` | Generated by `node tools/qa/a11y.mjs`, never hand-typed |
| `docs/qa/before/`, `docs/qa/after/` | 14 shots of the old build, 63 of the current one |
| `BACKLOG.md` | Everything deliberately not built, with the reason |

Written 2026-09-02, against Devvit 0.14.2, at version 0.0.11 — submitted for
review and awaiting a verdict.
