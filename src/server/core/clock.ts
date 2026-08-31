import { LAUNCH_DAY, ROLLOVER_GRACE_S } from '../../shared/tunables.ts';

/**
 * The day is a UTC day, identical for the whole planet (GDD M10).
 *
 * Only the server's clock decides which day it is. A client's clock can be
 * wrong, deliberately or otherwise, and it never gets a vote.
 */

const MS_PER_DAY = 86400000;

export const dayNumberAt = (epochMs: number): number =>
  Math.floor(epochMs / MS_PER_DAY);

/** The number shown to players: the game opens on DAYSHOT #1. */
export const displayDayFor = (dayNumber: number): number =>
  dayNumber - LAUNCH_DAY + 1;

/** Milliseconds until the next UTC midnight, for the result-screen countdown. */
export const msUntilRollover = (epochMs: number): number =>
  (dayNumberAt(epochMs) + 1) * MS_PER_DAY - epochMs;

/** Seconds elapsed since the current UTC day began. */
export const secondsIntoDay = (epochMs: number): number =>
  (epochMs - dayNumberAt(epochMs) * MS_PER_DAY) / 1000;

/**
 * Decides which day a submission belongs to.
 *
 * The client sends the day it was playing. Normally that is today. Just after
 * midnight a shot aimed at yesterday is still honoured for `ROLLOVER_GRACE_S`,
 * which is what lets a shot queued during a network failure land on the day the
 * player actually took it (GDD 31). Anything else is a rollover: the player had
 * not fired yet, so nothing is lost by reloading (GDD 30).
 */
export const resolveSubmissionDay = (
  claimedDay: number,
  epochMs: number
): { readonly accepted: boolean; readonly dayNumber: number } => {
  const serverDay = dayNumberAt(epochMs);
  if (claimedDay === serverDay) return { accepted: true, dayNumber: serverDay };

  const withinGrace =
    claimedDay === serverDay - 1 &&
    secondsIntoDay(epochMs) <= ROLLOVER_GRACE_S;

  return withinGrace
    ? { accepted: true, dayNumber: claimedDay }
    : { accepted: false, dayNumber: serverDay };
};
