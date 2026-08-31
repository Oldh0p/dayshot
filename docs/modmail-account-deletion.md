# Draft: modmail to r/Devvit

Send from your own account to
<https://www.reddit.com/message/compose/?to=r/Devvit>.

Everything below the line is the message. It asks one question, gives the
context needed to answer it, and proposes what we would do absent an answer —
so a reviewer can reply "option B is fine" in one line rather than having to
write the design for us.

---

**Subject:** Honouring account deletion without an account-deletion trigger

Hello,

I am building a daily game on Devvit Web and I would like to get the account
deletion requirement right before submitting it for review, because I do not
think I can currently meet it as written.

**The requirement.** Devvit Rules, *Enable and respect user deletions*:

> When a user account is deleted, the related user ID (t2_*) must be completely
> removed from your hosted datastores (e.g., Redis) and any external systems.

**The problem.** There does not appear to be an account-deletion trigger. The
trigger list in the `devvit.json` schema covers post, comment, mod-action,
mod-mail and app-lifecycle events, but nothing for a deleted account. So an app
has no way to learn that a deletion happened, and cannot react to one.

That is a general problem for any app holding per-user state. Mine holds a daily
streak, which is per-user by definition — the game is built on coming back.

**What the app stores.** Deliberately very little, all in Devvit's Redis, none
of it leaving Reddit:

| Key | Contents | Retention |
| --- | --- | --- |
| `user:{t2_id}` | streak, longest streak, best score, a few counters, two flags. No username, no profile data. | none — a streak has no natural expiry |
| `user:{t2_id}:played:{day}` | that day's button-press duration and score, kept for anti-cheat review | 90 days |
| `user:{t2_id}:shared:{day}` | a permalink to a comment the player chose to post | 90 days, and deleted on the comment-delete trigger |
| `day:{n}:names` | user id to username, so the leaderboard can show names | 90 days |
| `day:{n}:scores` | user id to score | 90 days |

The only author-identifying data is that username cache, and it expires. All
other keys are opaque account ids.

**My question.** How should an app with long-lived per-user state satisfy the
requirement today? Specifically:

1. Is an account-deletion trigger planned, or is there an existing mechanism I
   have missed?
2. Absent one, is a retention policy an acceptable substitute? I would apply a
   rolling TTL to `user:{t2_id}` — say 90 days, refreshed each time the player
   returns — so a deleted account's record disappears within a quarter, at the
   cost of a very long-absent player losing a streak they had already broken.
3. Would you prefer I stop caching usernames entirely and resolve them at read
   time with `reddit.getUserById()`? It is about ten calls per result screen at
   my leaderboard size, which is affordable. It removes the only
   author-identifying field the app holds, at the price of a slower screen.

I would rather implement whichever of these you consider correct before
submitting than guess and be rejected for it. Happy to share the code.

Thank you,
