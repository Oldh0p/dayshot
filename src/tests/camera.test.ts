import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCamera,
  lerpCamera,
  PANEL_SHARE,
  resultFraming,
} from '../client/scene/camera.ts';
import { TARGET_R } from '../shared/tunables.ts';

/**
 * A single shot used to produce three different framings in about a second:
 * one while aiming, another the instant the thumb lifted, a third when the ball
 * stopped. The player reported it as "trop vite, on n'arrive pas à comprendre",
 * and they were right — none of the three was a *move*, they were cuts.
 *
 * Two of them were bugs rather than design. The ground line jumped because the
 * aiming panel's reservation was conditional on `canAim`, which goes false at
 * release; and the result framing swapped cameras on a single frame instead of
 * easing over the 400ms §6 specifies.
 *
 * These tests state the rule that came out of it: **the camera moves once per
 * shot, and it moves rather than cuts.**
 */

const W = 390;
const H = 720;

/** The framing while aiming, and the one during flight, must be identical. */
const aiming = (): ReturnType<typeof buildCamera> =>
  buildCamera(W, H, 700, 1, H * PANEL_SHARE);

describe('the camera moves once per shot', () => {
  it('does not shift when the thumb lifts', () => {
    // The flight camera differs from the aiming one only by the apex it has to
    // contain and the gentle zoom — never by the band reserved underneath.
    const before = aiming();
    const during = buildCamera(W, H, 700, 1, H * PANEL_SHARE);
    assert.equal(during.originY, before.originY, 'the ground line moved');
    assert.equal(during.originX, before.originX);
    assert.equal(during.scale, before.scale);
  });

  it('keeps the ground line put across the whole flight zoom range', () => {
    const before = aiming();
    for (const zoom of [1, 1.04, 1.08]) {
      const during = buildCamera(W, H, 700, zoom, H * PANEL_SHARE);
      assert.equal(
        during.originY,
        before.originY,
        `the ground line moved at zoom ${zoom}`
      );
    }
  });

  it('eases into the result framing instead of cutting to it', () => {
    const base = aiming();
    const framed = resultFraming(W, H, TARGET_R, H * 0.5, base);

    // At t=0 it is exactly where the shot was watched from.
    const start = lerpCamera(base, framed, 0);
    assert.equal(start.scale, base.scale);
    assert.equal(start.originY, base.originY);

    // At t=1 it is exactly the framing that answers "how close was that".
    const end = lerpCamera(base, framed, 1);
    assert.ok(Math.abs(end.scale - framed.scale) < 1e-9);
    assert.ok(Math.abs(end.originY - framed.originY) < 1e-9);

    // And in between it is neither, which is what makes it a move.
    const mid = lerpCamera(base, framed, 0.5);
    assert.ok(mid.originY !== base.originY && mid.originY !== framed.originY);
  });

  it('never advances backwards, however long the clock runs', () => {
    const base = aiming();
    const framed = resultFraming(W, H, TARGET_R, H * 0.5, base);
    let previous = base.scale;
    for (const t of [0, 0.25, 0.5, 0.75, 1, 1.5, 4]) {
      const at = lerpCamera(base, framed, t).scale;
      assert.ok(at >= previous - 1e-9, `scale went backwards at t=${t}`);
      previous = at;
    }
    assert.ok(Math.abs(lerpCamera(base, framed, 9).scale - framed.scale) < 1e-9);
  });

  it('pushes in rather than teleporting, and never crops the launcher', () => {
    /*
     * The framing does not depend on where the ball landed at all, which is
     * the fix: recentring on impact-and-mat cropped the launcher out of frame
     * on a real phone, and a close-up of a ball on a mat is not this game.
     * The world's horizontal framing stays the shot's own; only the ground
     * line moves, and only far enough to clear the taller panel.
     */
    const base = aiming();
    const framed = resultFraming(W, H, TARGET_R, H * 0.5, base);
    assert.ok(framed.scale >= base.scale, 'zoomed out below the aiming view');
    assert.ok(framed.scale <= base.scale * 1.5 + 1e-9, 'zoomed too far in');

    // The same world point stays under the middle of the screen.
    const centreOf = (c: typeof base): number => (c.width / 2 - c.originX) / c.scale;
    assert.ok(Math.abs(centreOf(framed) - centreOf(base)) < 1e-6, 'the view panned');
  });

  it('still keeps the mat big enough to be a verdict', () => {
    // The floor the push-in exists for: a mat too small to see is not an answer
    // to "how close was that".
    const base = aiming();
    const framed = resultFraming(W, H, TARGET_R, H * 0.5, base);
    assert.ok(TARGET_R * framed.scale >= 24, 'the mat fell under 24px');
  });
});
