# ONE SHOT — working conventions

A daily one-attempt skill game for Reddit, built on Devvit Web.
`ONE-SHOT-GDD.md` is the design document; **Part IX is the contract**. Anything
not in Part IX is out of scope — new ideas go to `BACKLOG.md`, never into the
code (GDD 9.12).

## Tech stack (verified against the installed packages, not the docs)

- **Client**: TypeScript, Canvas 2D for the scene, React 19 + Tailwind 4 for
  panels outside the scene. No game engine, no physics library.
- **Server**: Hono on Node, bundled to CommonJS by the `@devvit/start` Vite
  plugin. Serverless: an endpoint runs just long enough to answer.
  **There is no tRPC in this project** despite what the stock template README
  says — plain `fetch` against `/api/*`.
- **Platform**: `@devvit/web` 0.14.1. Import `context`, `redis`, `reddit`,
  `scheduler` from `@devvit/web/server`; `context`, `navigateTo`, `showToast`,
  `showLoginPrompt`, `requestExpandedMode` from `@devvit/web/client`.

## Layout

| Path | Contents |
| --- | --- |
| `src/shared/` | `sim.ts`, `tunables.ts`, `types.ts`, `copy.ts`. Imported verbatim by both sides. |
| `src/server/` | Endpoints, Redis access, scheduler handlers, anti-cheat. |
| `src/client/` | Scene rendering, screens, audio, state machine. |
| `src/tests/` | Node test-runner unit tests. |
| `src/tools/` | Developer scripts (`npm run tune`). |

## Hard rules

1. **`sim.ts` has zero dependencies.** Pure arithmetic (`+ - * /`, comparisons,
   bit operations in the PRNG). The only trigonometry runs once at level
   initialisation and its results are rounded to 6 decimals immediately. The
   `shared` TypeScript project deliberately has `"types": []` so Node globals
   cannot leak in.
2. **The server never trusts the client.** `/api/shot` receives `holdMs` only
   and re-simulates. `clientScore` exists solely to detect divergence.
3. **All player-visible text lives in `copy.ts`**, in English, using the exact
   wording of GDD 9.9.
4. **Code, comments and commit messages are in English.**
5. **Relative imports carry explicit `.ts` / `.tsx` extensions.** The Node test
   runner resolves modules without a bundler and will not guess extensions;
   `allowImportingTsExtensions` + `emitDeclarationOnly` in
   `tools/tsconfig.base.json` keep `tsc` happy with that.
   For the same reason, anything reachable from a test must avoid TypeScript
   syntax that erasure cannot handle: **no `enum`, no `namespace`, and no
   constructor parameter properties** (`constructor(private x) {}`). Node's
   strip-only mode rejects them outright.
6. **Redis is reached through the `RedisLike` port** in
   `src/server/core/redis-port.ts`, never imported directly outside the route
   layer. That keeps the core testable against `src/tests/fake-redis.ts`, which
   reproduces the real `SET NX` and ascending-`zRank` semantics.
7. **Never mutate the PRNG draw order** in `generateLevel`. Every draw happens
   on every day, whatever the modifier — the order is frozen for life because
   changing it would rewrite the game's entire history (GDD 9.3).

## Platform facts that shape the design

- **Redis has no `zRevRank`.** Ranking uses a composite sorted-set score,
  `round(score * 100) * 1e8 + (1e8 - 1 - seq)`, where `seq` comes from
  `INCR day:{n}:seq`. Every member is then unique, so
  `rank = zCard - zRank(member)` is exact and earlier submissions win ties for
  free (GDD 8: ties broken by submission timestamp).
- **`set(k, v, { nx: true })` has an undocumented return value.** The daily lock
  is therefore a hash claimed with `hSetNX`, which returns 1 or 0, *and* the
  written payload is read back and compared against a per-attempt nonce. Either
  check alone would do; together they stay correct if one ever misbehaves. GDD
  9.7 calls the key a string — only the Redis type differs.
- **Comments on behalf of a user must reply to a single stickied comment.**
  That is a review requirement, not a preference. `POST MY SHOT` replies to the
  day's seed comment, whose id lives in `day:{n}:meta`.
- **`runAs: 'USER'` posts from the app account during playtest** unless the app
  owner performs the action. Only approved published versions act as the user.
- **Scheduler cron strings are UTC**, declared in `devvit.json`.
- **`localStorage` is wiped by every app update.** It may hold conveniences
  (sound toggle, practice best, pending re-submission) but never the source of
  truth; Redis holds anything that must survive.
- **Limits**: 30 s per server request, 4 MB request / 10 MB response, 2 KB of
  `postData`, 5 GB Redis per installation, 40k Redis commands/s.
- Redis is namespaced per installation, which is why the game lives in one home
  subreddit (GDD M4).

## Commands

```
npm run test         # types + lint + unit, the gate before any commit
npm run test:types   # tsc --build across all five projects
npm run test:unit    # node --test over src/tests
npm run lint
npm run build        # vite build into dist/
npm run tune         # Monte-Carlo calibration report (GDD 9.5)
npm run dev          # devvit playtest
```

## Code style

- Type aliases over interfaces; named exports over default exports.
- Never cast types; model the data so the cast is unnecessary.
- `noUncheckedIndexedAccess` is on — indexing an array yields `T | undefined`.
- Whenever an endpoint is added, register it in `devvit.json`.

Docs: <https://developers.reddit.com/docs/llms.txt>
