import type {
  RedisLike,
  RedisSetOptions,
  RedisZRangeOptions,
  ZEntry,
} from '../server/core/redis-port.ts';

/**
 * In-memory stand-in for Devvit's Redis, faithful on the two behaviours the
 * game's correctness depends on:
 *
 *   - `SET NX` writes only when the key is absent, whatever it returns;
 *   - `zRank` is the ascending index, and there is no `zRevRank`.
 *
 * `latency` inserts an await point in every command so that two "concurrent"
 * submissions genuinely interleave, which is what makes the daily-lock race
 * test worth running.
 */
export class FakeRedis implements RedisLike {
  readonly strings = new Map<string, string>();
  readonly hashes = new Map<string, Map<string, string>>();
  readonly zsets = new Map<string, Map<string, number>>();
  readonly expiries = new Map<string, number>();

  /** Every command that reached the store, for assertions on call patterns. */
  readonly log: string[] = [];

  readonly latency: number;

  constructor(latency = 0) {
    this.latency = latency;
  }

  private async tick(command: string): Promise<void> {
    this.log.push(command);
    // A resolved promise is enough to yield; the timer is only for tests that
    // want a wider interleaving window.
    if (this.latency > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.latency));
    } else {
      await Promise.resolve();
    }
  }

  private hash(key: string): Map<string, string> {
    let h = this.hashes.get(key);
    if (!h) {
      h = new Map();
      this.hashes.set(key, h);
    }
    return h;
  }

  private zset(key: string): Map<string, number> {
    let z = this.zsets.get(key);
    if (!z) {
      z = new Map();
      this.zsets.set(key, z);
    }
    return z;
  }

  /** Members ordered by score ascending, ties broken by member name. */
  private sorted(key: string): { member: string; score: number }[] {
    return [...this.zset(key).entries()]
      .map(([member, score]) => ({ member, score }))
      .sort((a, b) =>
        a.score === b.score ? a.member.localeCompare(b.member) : a.score - b.score
      );
  }

  async get(key: string): Promise<string | undefined> {
    await this.tick(`get ${key}`);
    return this.strings.get(key);
  }

  async set(
    key: string,
    value: string,
    options?: RedisSetOptions
  ): Promise<unknown> {
    await this.tick(`set ${key}`);
    if (options?.nx && this.strings.has(key)) {
      // Real Redis returns nil here. The production code never reads this
      // value, and neither should anything else.
      return null;
    }
    this.strings.set(key, value);
    return 'OK';
  }

  async del(...keys: string[]): Promise<void> {
    await this.tick(`del ${keys.join(',')}`);
    for (const key of keys) {
      this.strings.delete(key);
      this.hashes.delete(key);
      this.zsets.delete(key);
    }
  }

  async expire(key: string, seconds: number): Promise<void> {
    await this.tick(`expire ${key}`);
    this.expiries.set(key, seconds);
  }

  async incrBy(key: string, value: number): Promise<number> {
    await this.tick(`incrBy ${key}`);
    const next = Number(this.strings.get(key) ?? '0') + value;
    this.strings.set(key, String(next));
    return next;
  }

  async hGet(key: string, field: string): Promise<string | undefined> {
    await this.tick(`hGet ${key} ${field}`);
    return this.hash(key).get(field);
  }

  async hGetAll(key: string): Promise<Record<string, string>> {
    await this.tick(`hGetAll ${key}`);
    return Object.fromEntries(this.hash(key));
  }

  async hSet(
    key: string,
    fieldValues: { [field: string]: string }
  ): Promise<number> {
    await this.tick(`hSet ${key}`);
    const h = this.hash(key);
    let added = 0;
    for (const [field, value] of Object.entries(fieldValues)) {
      if (!h.has(field)) added++;
      h.set(field, value);
    }
    return added;
  }

  async hSetNX(key: string, field: string, value: string): Promise<number> {
    await this.tick(`hSetNX ${key} ${field}`);
    const h = this.hash(key);
    if (h.has(field)) return 0;
    h.set(field, value);
    return 1;
  }

  async hIncrBy(key: string, field: string, value: number): Promise<number> {
    await this.tick(`hIncrBy ${key} ${field}`);
    const h = this.hash(key);
    const next = Number(h.get(field) ?? '0') + value;
    h.set(field, String(next));
    return next;
  }

  async zAdd(key: string, ...members: ZEntry[]): Promise<number> {
    await this.tick(`zAdd ${key}`);
    const z = this.zset(key);
    let added = 0;
    for (const entry of members) {
      if (!z.has(entry.member)) added++;
      z.set(entry.member, entry.score);
    }
    return added;
  }

  async zCard(key: string): Promise<number> {
    await this.tick(`zCard ${key}`);
    return this.zset(key).size;
  }

  async zRank(key: string, member: string): Promise<number | undefined> {
    await this.tick(`zRank ${key}`);
    const index = this.sorted(key).findIndex((row) => row.member === member);
    return index === -1 ? undefined : index;
  }

  async zScore(key: string, member: string): Promise<number | undefined> {
    await this.tick(`zScore ${key}`);
    return this.zset(key).get(member);
  }

  async zRange(
    key: string,
    start: number | string,
    stop: number | string,
    options: RedisZRangeOptions
  ): Promise<{ member: string; score: number }[]> {
    await this.tick(`zRange ${key}`);
    if (options.by !== 'rank') {
      throw new Error(`FakeRedis only implements zRange by rank, got ${options.by}`);
    }
    const rows = this.sorted(key);
    const ordered = options.reverse ? [...rows].reverse() : rows;
    return ordered.slice(Number(start), Number(stop) + 1);
  }
}
