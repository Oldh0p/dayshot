# Backlog

Ideas raised while building the MVP that are **out of scope** per GDD 9.12.
Nothing here may be implemented until the MVP ships and is validated.

## Deferred by the GDD itself

- V1: teams / Rep Your Sub, Community Cup league, subreddit leaderboard,
  weekly recap post.
- V1: Locker and cosmetics, streak rewards, Streak Shield.
- V1: automatic user flairs, image share card (Format C), global ghost,
  My Shots calendar page.
- V1: cost-M modifiers (High Perch, Heavy Ball, Golden Day) and Extreme Friday.
- V2: league seasons, cosmetic payments, satellite multi-subreddit mode,
  archives, random practice, GIF export, i18n.

## Raised during the build

- **Self-host Space Grotesk.** GDD 49 names it as the display face. It is not
  part of the Part IX contract, and a web font costs bundle weight against the
  < 300 KB target, so the MVP ships a system geometric stack with tabular
  numerals. Revisit once the bundle budget is measured on device.
- **Dynamic splash refresh.** `post.setPostData()` can update the feed card
  after creation (world shot counter, "3h left" urgency state from GDD 12), but
  post-data updates do not re-render on their own and the card is cached. The
  MVP writes the snapshot once at post creation, as 9.9 permits.
- **Reroll guard-rail sweep granularity.** 9.3 specifies sweeping `power` from
  0 to 1 in steps of 0.001. A player's reachable set is actually quantised by
  integer `holdMs`, i.e. `2 / GAUGE_PERIOD_MS ≈ 0.00143` per millisecond. The
  spec's sweep is finer than the player's reach, so it can in principle certify
  a day whose 99 is a fraction of a millisecond wide. Consider sweeping integer
  `holdMs` over one full gauge period instead.
- **CLIFF score is constant per day.** Because the impact is recorded on the
  wall plane at `x = D - 140`, every cliff shot scores identically
  (`dx = 140`). That is what 9.4 asks for and it keeps the outcome verifiable,
  but it means "how badly you cliffed" is invisible. A future variant could
  measure `dx` from where the ball comes to rest at the foot of the wall.
- **Server-side audit of `SIM_MISMATCH`.** The MVP logs and counts mismatches.
  A dashboard or mod-visible report would make the anti-cheat monitoring of
  GDD 32.4 actionable.
- **Streak reset copy is shown from a derived flag.** The reset is only
  persisted on the next submission, so a player who never comes back keeps a
  stale `streak` value in Redis. Harmless today; worth a nightly sweep if the
  value is ever used for anything other than display.
