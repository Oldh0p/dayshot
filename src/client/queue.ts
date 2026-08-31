import type { ResultSummary, ShotResponse } from '../shared/types.ts';
import { alreadyPlayedResult, submitShot } from './api.ts';
import {
  clearPendingShot,
  readPendingShot,
  writePendingShot,
  type PendingShot,
} from './storage.ts';

/**
 * The promise that a player never loses their shot of the day (GDD 30, 9.8).
 *
 * The shot is written to local storage the instant it is fired, then retried
 * until the server acknowledges it. Retrying is safe because the server's daily
 * lock makes submission idempotent: a duplicate comes back as `ALREADY_PLAYED`
 * carrying the shot that counted, which is exactly the answer we want anyway.
 *
 * Retries back off, and the browser coming back online cuts the wait short.
 */

const BACKOFF_MS = [400, 900, 2000, 4000, 8000, 15000, 30000];

export type QueueOutcome =
  | { readonly status: 'confirmed'; readonly result: ResultSummary; readonly response?: ShotResponse }
  | { readonly status: 'day_rolled' }
  | { readonly status: 'logged_out' }
  | { readonly status: 'abandoned' };

export type QueueEvents = {
  /** Fired whenever a retry fails, so the UI can show the pending banner. */
  onPending?: (attempt: number) => void;
  onOutcome: (outcome: QueueOutcome) => void;
};

const wait = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    const cancel = (): void => {
      clearTimeout(timer);
      resolve();
    };
    signal.addEventListener('abort', cancel, { once: true });
    // Coming back online should not wait out the rest of the backoff.
    window.addEventListener('online', cancel, { once: true });
  });

export class ShotQueue {
  private controller: AbortController | null = null;

  /** Restores a shot left behind by a crash, a reload or a closed tab. */
  pending(): PendingShot | null {
    return readPendingShot();
  }

  /**
   * Records the shot locally, then delivers it. Returns immediately; the
   * outcome arrives through `events.onOutcome`.
   */
  enqueue(shot: PendingShot, events: QueueEvents): void {
    writePendingShot(shot);
    this.deliver(shot, events);
  }

  /** Resumes delivery of a shot found in storage at boot. */
  resume(shot: PendingShot, events: QueueEvents): void {
    this.deliver(shot, events);
  }

  stop(): void {
    this.controller?.abort();
    this.controller = null;
  }

  private deliver(shot: PendingShot, events: QueueEvents): void {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    void this.loop(shot, events, controller.signal);
  }

  private async loop(
    shot: PendingShot,
    events: QueueEvents,
    signal: AbortSignal
  ): Promise<void> {
    for (let attempt = 0; !signal.aborted; attempt++) {
      const response = await submitShot({
        dayNumber: shot.dayNumber,
        holdMs: shot.holdMs,
        clientScore: shot.clientScore,
      });

      if (response.ok) {
        clearPendingShot();
        events.onOutcome({
          status: 'confirmed',
          result: response.data,
          response: response.data,
        });
        return;
      }

      if (response.code === 'ALREADY_PLAYED') {
        // A retry that arrived twice, or a second device. Either way the day is
        // settled and the server just told us how.
        const existing = alreadyPlayedResult(response.data);
        clearPendingShot();
        if (existing) {
          events.onOutcome({ status: 'confirmed', result: existing });
        } else {
          events.onOutcome({ status: 'abandoned' });
        }
        return;
      }

      if (response.code === 'DAY_ROLLED') {
        // Past the grace window. The shot cannot be attributed to any day, so
        // holding on to it would only make it land on the wrong one.
        clearPendingShot();
        events.onOutcome({ status: 'day_rolled' });
        return;
      }

      if (response.code === 'LOGGED_OUT') {
        // Keep the shot: the player may log in and still have it counted.
        events.onOutcome({ status: 'logged_out' });
        return;
      }

      if (response.code === 'BAD_REQUEST') {
        clearPendingShot();
        events.onOutcome({ status: 'abandoned' });
        return;
      }

      events.onPending?.(attempt + 1);
      const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)] ?? 30000;
      await wait(delay, signal);
    }
  }
}
