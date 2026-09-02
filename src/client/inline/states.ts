import {
  feedPlayedLine,
  feedStreakChip,
  feedWaitingLine,
  socialProofLine,
  standingFor,
  type FeedFacts,
} from '../../shared/copy.ts';
import type { ModifierId, StateResponse } from '../../shared/types.ts';

/**
 * Which of §4.4's three cards this viewer gets, and what it says.
 *
 * Pure on purpose: the feed card's whole job is to be right in a fraction of a
 * second on a stranger's screen, and the interesting failures are in the
 * choosing, not the drawing. Kept out of `main.ts` so it can be tested without
 * a DOM, a canvas or a network.
 *
 * **This module may never import `sim.ts`.** The feed does not know the day's
 * level and must not: a decorative arc and a marker placed from `signedDx` are
 * enough to show a stranger what happened, and importing the simulation would
 * both blow the bundle budget and put the day's answer in the feed.
 */

export type FeedState =
  /** New, unknown, logged out, or the state call failed. */
  | { readonly kind: 'A'; readonly proof: string }
  /** Known player, has not shot today. */
  | { readonly kind: 'B'; readonly proof: string; readonly streakChip: string | null }
  /** Already played. Shows their own shot. */
  | {
      readonly kind: 'C';
      readonly summary: string;
      readonly countdownFrom: number;
      /** Signed miss in world units: negative short, positive long. */
      readonly signedDx: number;
      readonly streakChip: string | null;
    };

export type FeedCard = {
  readonly state: FeedState;
  readonly modifier: ModifierId;
  readonly displayDay: number | null;
};

const factsOf = (server: StateResponse): FeedFacts => ({
  shotsToday: server.shotsToday,
  yesterdayShots: server.yesterdayShots,
  topScore: server.topScore,
  perfectsToday: server.perfectsToday,
  displayDay: server.displayDay,
});

/**
 * The card for a viewer we know nothing about.
 *
 * Also the answer whenever `/api/state` fails. A feed card that renders a
 * plausible scene and an honest CTA is a better failure than a spinner or an
 * error, and it cannot mislead: state A claims nothing about the viewer.
 */
export const anonymousCard = (): FeedCard => ({
  state: { kind: 'A', proof: '' },
  modifier: 'CLEAR',
  displayDay: null,
});

export const cardFor = (server: StateResponse): FeedCard => {
  const facts = factsOf(server);
  const streakChip = feedStreakChip(server.streak.current);
  const base = { modifier: server.modifier, displayDay: server.displayDay };

  // No account is state A whatever else is true: the streak and the played
  // flag belong to nobody, and the card must not imply otherwise.
  if (!server.username) {
    return { ...base, state: { kind: 'A', proof: socialProofLine(facts) } };
  }

  if (server.playedToday && server.myResult) {
    const { score, rank, total, signedDx } = server.myResult;
    return {
      ...base,
      state: {
        kind: 'C',
        /*
         * `standingFor`, not the old `standingHeadline`.
         *
         * The result panel moved to §10.3's wordings in phase 4 and the feed
         * did not, so a first player saw `You opened the day.` in the game and
         * `FIRST SHOT TODAY` on the card -- two phrasings of one rank, and the
         * longer of them truncated on the card. §15 asked for that line to go.
         */
        summary: feedPlayedLine(score, standingFor(rank, total).line),
        countdownFrom: server.serverNow,
        signedDx,
        streakChip,
      },
    };
  }

  // A returning player is one with something to lose: a streak, or a day
  // already played before. Without that, "Your shot is waiting" is a stranger
  // being told they have an appointment they never made.
  const returning = streakChip !== null;
  return returning
    ? { ...base, state: { kind: 'B', proof: feedWaitingLine(facts), streakChip } }
    : { ...base, state: { kind: 'A', proof: socialProofLine(facts) } };
};

/** Milliseconds until the next UTC midnight, from the server's clock. */
export const msToRollover = (serverNow: number): number => {
  const dayMs = 86400000;
  return dayMs - (((serverNow % dayMs) + dayMs) % dayMs);
};
