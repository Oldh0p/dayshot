/**
 * The slice of the Devvit Redis client this game actually uses.
 *
 * Declaring it as a port rather than importing `redis` everywhere buys two
 * things: the core logic is unit-testable against an in-memory fake that
 * reproduces the real NX and rank semantics, and the exact set of commands the
 * app depends on is visible in one place when the platform's Redis surface
 * changes.
 *
 * `@devvit/web/server`'s `redis` satisfies this structurally; nothing here may
 * widen beyond what that client offers. In particular there is **no
 * `zRevRank`** — see `ranking.ts` for how descending rank is derived instead.
 */
export type ZEntry = { readonly member: string; readonly score: number };

export type RedisSetOptions = {
  readonly nx?: boolean;
  readonly expiration?: Date;
};

export type RedisZRangeOptions = {
  readonly by: 'rank' | 'score' | 'lex';
  readonly reverse?: boolean;
  readonly limit?: { readonly offset: number; readonly count: number };
};

export type RedisLike = {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string, options?: RedisSetOptions): Promise<unknown>;
  del(...keys: string[]): Promise<void>;
  expire(key: string, seconds: number): Promise<void>;
  incrBy(key: string, value: number): Promise<number>;

  hGet(key: string, field: string): Promise<string | undefined>;
  hGetAll(key: string): Promise<Record<string, string>>;
  hSet(key: string, fieldValues: { [field: string]: string }): Promise<number>;
  hSetNX(key: string, field: string, value: string): Promise<number>;
  hIncrBy(key: string, field: string, value: number): Promise<number>;

  zAdd(key: string, ...members: ZEntry[]): Promise<number>;
  zCard(key: string): Promise<number>;
  zRank(key: string, member: string): Promise<number | undefined>;
  zScore(key: string, member: string): Promise<number | undefined>;
  zRange(
    key: string,
    start: number | string,
    stop: number | string,
    options: RedisZRangeOptions
  ): Promise<{ member: string; score: number }[]>;
};
