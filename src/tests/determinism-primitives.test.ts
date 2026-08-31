import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * `sim.ts` promises a bit-identical result on the client and the server for the
 * same integer inputs (GDD 9.4). That promise rests on a handful of JavaScript
 * primitives being exactly specified rather than implementation-defined. These
 * tests pin those primitives so that a toolchain change that breaks them fails
 * loudly here instead of silently desyncing a player's score from the server's.
 *
 * They double as a smoke test for the Node type-stripping test runner.
 */
describe('determinism primitives', () => {
  it('Math.imul is exact 32-bit multiplication (PRNG backbone)', () => {
    // 0x7fffffff * 3 wraps to a negative int32 rather than losing precision the
    // way `a * b | 0` would for large operands.
    assert.equal(Math.imul(0x7fffffff, 3), 2147483645);
    assert.equal(Math.imul(0xffffffff, 5), -5);
    assert.equal(Math.imul(-5, -5), 25);
  });

  it('unsigned right shift normalises to a uint32', () => {
    assert.equal(-1 >>> 0, 4294967295);
    assert.equal((1779033703 ^ 9) >>> 0, 1779033710);
  });

  it('IEEE-754 addition is order-dependent, so the sim must fix its order', () => {
    // Documents *why* the integration loop writes its operations out longhand
    // instead of letting a refactor reassociate them.
    assert.notEqual(0.1 + 0.2 + 0.3, 0.3 + 0.2 + 0.1);
  });

  it('Math.round breaks ties upward, which is the half-up scoring rule', () => {
    assert.equal(Math.round(0.5), 1);
    assert.equal(Math.round(1.5), 2);
    assert.equal(Math.round(2.5), 3);
    assert.equal(Math.round(-0.5), -0);
  });

  it('rounding to six decimals is stable across repeated application', () => {
    const round6 = (v: number): number => Math.round(v * 1e6) / 1e6;
    const once = round6(Math.cos((45 * Math.PI) / 180));
    assert.equal(round6(once), once);
    assert.equal(once, 0.707107);
  });

  it('integer arithmetic below 2^53 is exact, which the zset ranking relies on', () => {
    // Composite leaderboard score: cents * 1e8 + tiebreaker.
    const composite = 9873 * 1e8 + (1e8 - 1 - 42);
    assert.equal(composite, 987399999957);
    assert.ok(composite < Number.MAX_SAFE_INTEGER);
    const tie = composite % 1e8;
    assert.equal((composite - tie) / 1e8, 9873);
  });
});
