import {
  BULLSEYE_SCORE,
  PERCENTILE_MIN_PLAYERS,
  PERFECT_RADIUS,
  TARGET_R,
} from './tunables.ts';
import type { ImpactKind, ModifierId } from './types.ts';

/**
 * Every string a player can read, in English (GDD 35: no localisation at MVP).
 *
 * Nothing outside this file may hard-code player-visible text. Wordings marked
 * "GDD 9.9" are contractual and must not be improved on.
 *
 * Dependency-free, like `sim.ts`: the server builds share cards, post titles
 * and seed comments from here too, so the card a player copies and the card the
 * server publishes are produced by the same code.
 */

// ---------------------------------------------------------------------------
// Modifiers
// ---------------------------------------------------------------------------

export const MODIFIER_LABEL: Record<ModifierId, string> = {
  CLEAR: 'Clear Skies',
  CROSSWIND: 'Crosswind',
  TAILWIND: 'Tailwind',
  GUSTY: 'Gusty',
  MOON: 'Moon Gravity',
  TINY: 'Tiny Target',
  LONG: 'Long Shot',
};

/** One glyph per modifier. Moon, Tiny and Crosswind are named in GDD M8/15. */
export const MODIFIER_EMOJI: Record<ModifierId, string> = {
  CLEAR: '✨',
  CROSSWIND: '🌬️',
  TAILWIND: '💨',
  GUSTY: '🌪️',
  MOON: '🌙',
  TINY: '😬',
  LONG: '🔭',
};

// ---------------------------------------------------------------------------
// Number formatting
// ---------------------------------------------------------------------------

/** Scores always carry two decimals: 98.73, 100.00, 0.00. */
export const formatScore = (score: number): string => score.toFixed(2);

/** Percentiles carry one: "Top 4.2%". */
export const formatPercent = (percent: number): string => percent.toFixed(1);

/** Miss distance carries one, as in "6.4 from center". */
export const formatDx = (dx: number): string => dx.toFixed(1);

/**
 * Signed wind, using a real minus sign rather than a hyphen so the number reads
 * as a quantity: "+280", "−380".
 */
export const formatWind = (windBase: number): string => {
  const rounded = Math.round(windBase);
  return rounded < 0 ? `−${Math.abs(rounded)}` : `+${rounded}`;
};

/**
 * Direction the wind pushes the ball. GDD 49 requires wind to be readable
 * without colour, as an arrow *and* a number, so the arrow has to carry the
 * sign — the two examples in the document both draw a right arrow, which would
 * make it decorative and mislead on a headwind day.
 */
export const windArrow = (windBase: number): string =>
  Math.round(windBase) < 0 ? '←' : '→';

/**
 * The wind in words, for the arrow's accessible name.
 *
 * The arrow carries direction as a rotation and strength as a length; neither
 * survives a screen reader, and §11 forbids the wind being legible only one
 * way. Bands rather than a raw number, because "a strong headwind" is what the
 * arrow actually communicates.
 */
export const windDirectionLabel = (windBase: number): string => {
  const wind = Math.round(windBase);
  if (wind === 0) return 'No wind';
  const strength =
    Math.abs(wind) >= 300 ? 'Strong' : Math.abs(wind) >= 120 ? 'Moderate' : 'Light';
  return `${strength} ${wind < 0 ? 'headwind' : 'tailwind'}, ${Math.abs(wind)}`;
};

export const formatCountdown = (msRemaining: number): string => {
  const total = Math.max(0, Math.floor(msRemaining / 1000));
  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  const pad = (v: number): string => String(v).padStart(2, '0');
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
};

export const formatCount = (value: number): string =>
  value.toLocaleString('en-US');

// ---------------------------------------------------------------------------
// Static copy
// ---------------------------------------------------------------------------

export const COPY = {
  // -- Identity -------------------------------------------------------------
  title: 'DAYSHOT',
  /** GDD 9.9 */
  tagline: 'One shot that counts. Every day.',

  // -- Splash / feed card ---------------------------------------------------
  /** GDD 9.9 */
  splashCta: 'TAP TO SHOOT',

  // -- Onboarding -----------------------------------------------------------
  /** GDD 9.9 */
  warmupBanner: "WARM-UP — this one doesn't count",
  /** GDD 9.9 */
  warmupOver: 'That was practice. Now for real.',
  warmupOverSub: 'DAYSHOT — make it count.',
  warmupResultLead: 'Warm-up shot',

  // -- Aiming ---------------------------------------------------------------
  /** GDD 9.9 */
  holdToAim: 'HOLD TO AIM',
  /** GDD 9.9 — shown once, after a first press shorter than MISFIRE_MS. */
  misfireHint: 'Hold… then release',
  releaseToShoot: 'RELEASE TO SHOOT',

  // -- Conditions -----------------------------------------------------------
  windLabel: 'WIND',
  distanceLabel: 'DIST',

  // -- Feed card (redesign spec §4) -----------------------------------------
  /**
   * §10.1 weighed five CTAs and kept this one. `TAP TO SHOOT` was a lie: the
   * tap opens the app, it does not throw. The wording has to carry possession
   * and scarcity without promising a shot that is not about to happen.
   */
  feedCta: 'TAKE YOUR ONE SHOT',
  feedMicro: 'One try. No retries.',
  feedFirstEver: "Today's the first shot ever. Take yours.",
  feedWaiting: 'Your shot is waiting',
  feedTodayOpened: 'today just opened',
  feedStreakSuffix: 'DAY STREAK',

  /**
   * Under the aim pill, once, before the first hold (§5, §10.5).
   *
   * The rule the whole game rests on, stated calmly and exactly once. §2 is
   * explicit that the tension is shown rather than shouted: no red, no
   * countdown, no repetition.
   */
  stakes: 'One official shot. No retries.',

  /**
   * The accessible name of the play area.
   *
   * The whole screen is the button, which leaves nothing for a keyboard or a
   * screen reader to find: the accessibility pass measured this screen at one
   * reachable control, the help button. This says what the gesture is and that
   * a key does the same thing.
   */
  playAreaLabel:
    'Aiming area. Hold anywhere to charge the shot and release to fire. Space or Enter does the same.',

  // -- Result ---------------------------------------------------------------
  /** GDD 9.9 */
  offTheMap: 'OFF THE MAP',
  splat: 'SPLAT',
  bullseye: 'BULLSEYE',
  perfectStamp: '🎯 PERFECT SHOT',
  postMyShot: 'POST MY SHOT',
  practice: 'Practice',
  copyCard: 'Copy card',
  viewBoard: 'Leaderboard',
  boardTitle: 'TODAY',
  boardYou: 'YOU',
  boardBack: 'Back to my shot',
  boardNotPlayed: "Take your shot to enter today's board.",
  practiceAgain: 'Again',
  practiceLeave: 'Back to my shot',
  globalRankSuffix: 'Global',
  scoringPending: 'Confirming…',
  recalibrated: 'Recalibrated by the server',

  // -- Practice -------------------------------------------------------------
  practiceWatermark: 'PRACTICE',
  practiceLocked: 'Practice unlocks after your official shot.',

  // -- Help sheet -----------------------------------------------------------
  helpTitle: 'How it works',
  /** Screen-reader name for the streak flame, which is a glyph and not text. */
  streakLabel: 'day streak',
  /** GDD 19 */
  helpBody:
    'Hold to charge, release to shoot. Closest to center wins. Every day starts with a warm-up that does not count, then one official shot.',
  soundToggle: 'Sound',

  // -- Logged out -----------------------------------------------------------
  /** Shown in the day bar in place of a day and a modifier the visitor has
   *  not earned the right to see yet. */
  demoLabel: 'DEMO',
  demoBanner: "DEMO SHOT — the real one needs an account",
  /** Offered after the demo shot lands, where the rank would have been. */
  loggedOut: "Log in to take today's real shot",
  loggedOutCta: 'Log in',
  loggedOutSub: 'One ranked shot, every day, against everyone.',
  offline: 'You are offline. Your shot is safe.',
  retry: 'Retry',
  submitQueued: 'Saving your shot…',
  submitFailed: 'Could not reach the server. Retrying…',
  /** GDD 30 */
  dayRolledTitle: 'New day just dropped',
  dayRolledBody: 'A fresh challenge is up. Loading it now.',
  alreadyPlayed: 'You have already taken your shot today.',
  genericError: 'Something went wrong. Try again.',

  // -- Sharing --------------------------------------------------------------
  shareConsentTitle: 'Post as a comment?',
  shareConsentConfirm: 'Post my shot',
  shareConsentCancel: 'Not now',
  shareCopied: 'Card copied',
  sharePosted: 'Posted',
  shareAlreadyPosted: 'Already posted today',
} as const;

// ---------------------------------------------------------------------------
// Templated copy (GDD 9.9 wordings)
// ---------------------------------------------------------------------------

export const topPercentLine = (percent: number): string =>
  `TOP ${formatPercent(percent)}% TODAY`;

export const rankTodayLine = (rank: number): string =>
  `#${formatCount(rank)} TODAY`;

/** GDD 9.9 */
export const firstShotLine = (): string => 'FIRST SHOT TODAY';

/**
 * The headline of the result screen: the one line GDD 18 puts above everything
 * else.
 *
 * Normally the percentile, because a mid-table player needs to hear "top 8.4%"
 * rather than "#4,102". But a percentile of a tiny field is a rank wearing a
 * disguise — and on the very first shot of a day it is worse than that, because
 * "TOP 100.0% TODAY" reads as sarcasm. So:
 *
 *   - alone so far, the player is genuinely the first in the world today;
 *   - in a small field, the rank is more accurate *and* more flattering;
 *   - past `PERCENTILE_MIN_PLAYERS`, the percentile earns its place.
 */
export const standingHeadline = (rank: number, total: number): string => {
  if (total <= 1) return firstShotLine();
  if (total < PERCENTILE_MIN_PLAYERS) return rankTodayLine(rank);
  return topPercentLine(percentFor(rank, total));
};

/** Share of the field at or above this rank, to one decimal. */
export const percentFor = (rank: number, total: number): number =>
  total <= 0 ? 100 : Math.round((rank / total) * 1000) / 10;

/**
 * Whether the separate "#184 Global" line is worth showing.
 *
 * When the headline is already a rank, repeating it underneath is noise.
 */
export const showsGlobalRank = (total: number): boolean =>
  total >= PERCENTILE_MIN_PLAYERS;

export const betterThanLine = (percent: number): string =>
  `Better than ${formatPercent(100 - percent)}% of players today`;

export const fromCenterLine = (dx: number): string =>
  `${formatDx(dx)} from center`;

/**
 * What a wall impact says instead.
 *
 * Two players who hit the cliff are the same distance from the centre and did
 * not play the same shot, so "140.0 from center" next to two different scores
 * would read as a bug. The height missed is the thing that separates them, and
 * it is what the score is actually made of.
 */
export const cliffLine = (drop: number): string =>
  `Into the wall, ${formatDx(drop)} below the top`;

export const streakLine = (streak: number): string => `🔥 ${streak} DAY STREAK`;

/*
 * The same two lines without their emoji, for the UI.
 *
 * `streakLine` and `tomorrowLine` are contractual GDD 9.9 wordings and go into
 * Reddit comments, where an emoji is exactly right. §3 refuses them *in the
 * app*, where they render differently on every OS and fight a nine-colour
 * palette — and the app draws its own flame and modifier glyphs beside these
 * strings, so leaving the emoji in produced two flames side by side.
 */
export const streakTextLine = (streak: number): string =>
  `${formatCount(streak)} DAY STREAK`;

export const tomorrowTextLine = (modifier: ModifierId): string =>
  `Tomorrow: ${MODIFIER_LABEL[modifier].toUpperCase()}`;

export const tomorrowLine = (modifier: ModifierId): string =>
  `Tomorrow: ${MODIFIER_LABEL[modifier].toUpperCase()} ${MODIFIER_EMOJI[modifier]}`;

export const nextShotLine = (msRemaining: number): string =>
  `Next shot in ${formatCountdown(msRemaining)}`;

export const streakResetLine = (longest: number): string =>
  `Streak reset. Longest: ${longest} 🔥 — Day 1 starts now.`;

export const perfectRarityLine = (perfects: number, total: number): string =>
  `Only ${formatCount(perfects)} of ${formatCount(total)} players hit a Perfect today.`;

export const globalRankLine = (rank: number): string =>
  `#${formatCount(rank)} ${COPY.globalRankSuffix}`;

export const shotsSoFarLine = (shots: number): string =>
  `${formatCount(shots)} shots so far`;

export const dayLabel = (displayDay: number): string => `Day #${displayDay}`;

/**
 * Names the account the comment will come from.
 *
 * Devvit's user-action rules require the player to know they are commenting as
 * themselves, "including what will appear on Reddit and when their username is
 * shown to others" — so the username is spelled out rather than implied by
 * "your account".
 */
export const shareConsentBody = (username: string): string =>
  `This publishes the card below as a comment from u/${username}, ` +
  `as a reply to today's thread. Anyone can see it, and you can delete it ` +
  `from Reddit at any time.`;

/**
 * The running tally under a practice attempt. The attempt's own score is the
 * big number above it; this is the context, not the headline. It existed here
 * unused while `Result.tsx` inlined its own copy of the same sentence.
 */
export const practiceBestLine = (best: number, tries: number): string =>
  `Practice best today: ${formatScore(best)} (in ${formatCount(tries)} ${
    tries === 1 ? 'try' : 'tries'
  })`;

export const windLine = (windBase: number): string =>
  `${COPY.windLabel} ${formatWind(windBase)} ${windArrow(windBase)}`;

export const distanceLine = (distance: number): string =>
  `${COPY.distanceLabel} ${Math.round(distance)}`;

export const impactBadge = (impact: ImpactKind): string | null => {
  if (impact === 'CLIFF') return COPY.splat;
  if (impact === 'OFF_THE_MAP') return COPY.offTheMap;
  return null;
};

// ---------------------------------------------------------------------------
// Reddit-side copy
// ---------------------------------------------------------------------------

/** GDD 9.6 — the daily post title, formulaic so the feed learns to recognise it. */
export const dailyPostTitle = (
  displayDay: number,
  modifier: ModifierId
): string =>
  `🎯 DAYSHOT #${displayDay} — ${MODIFIER_LABEL[modifier]}. One shot that counts. 24 hours.`;

export const splashDescription = (modifier: ModifierId): string =>
  `${MODIFIER_EMOJI[modifier]} ${MODIFIER_LABEL[modifier]} — one shot that counts, 24 hours.`;

/** Yesterday's headline, chosen by rule so nobody has to write one every day. */
export type YesterdayStats = {
  readonly perfects: number;
  readonly topScore: number;
  readonly shots: number;
};

/**
 * Yesterday's headline, chosen by rule so nobody has to write one every day.
 *
 * Only ever mentions Perfects when there were some. "Nobody hit a Perfect
 * yesterday" reads as a scoreboard of failure on a quiet day, and on day one
 * there is no yesterday at all -- an empty line is better than a zero.
 */
const yesterdayHeadline = (stats: YesterdayStats): string => {
  if (stats.shots === 0 || stats.perfects === 0) return '';
  if (stats.perfects === 1) return 'Only 1 Perfect yesterday.';
  return `${formatCount(stats.perfects)} Perfects yesterday.`;
};

/**
 * The stickied comment the app posts and pins under the daily post (GDD 15).
 *
 * It is not an announcement, it is *the thread*: every score card is published
 * as a reply to it, because Reddit requires user-attributed score comments to
 * reply to a single stickied comment. So the first line has to read as an
 * invitation and the second has to explain what lands underneath — a reader who
 * sees only the collapsed header should still understand what this is.
 *
 * It names the modifier and nothing else. The wind and the distance are not
 * public information: reading them is the planning beat of the game (GDD 5),
 * and a player who meets them in a comment has had that beat taken away. The
 * function does not receive the wind at all, which is the only way to be sure.
 */
export const seedComment = (
  displayDay: number,
  modifier: ModifierId,
  yesterday: YesterdayStats | null
): string => {
  const tail = yesterday ? yesterdayHeadline(yesterday) : '';
  return (
    `🎯 **Drop your shot below**

` +
    `Day #${displayDay} — ${MODIFIER_LABEL[modifier]}. ` +
    `Tap POST MY SHOT on your result and your card replies here. ` +
    `One shot per player, per day — everyone resets at 00:00 UTC.` +
    (tail
      ? `

${tail}`
      : '')
  );
};

// ---------------------------------------------------------------------------
// Share cards (GDD IV.17, exact formats)
// ---------------------------------------------------------------------------

export type ShareCardInput = {
  readonly displayDay: number;
  readonly modifier: ModifierId;
  readonly windBase: number;
  readonly score: number;
  readonly percentile: number;
  readonly streak: number;
  /** Signed miss: positive is an overshoot, negative an undershoot. */
  readonly signedDx: number;
  /** The day's mat radius. Halved on Tiny Target, and the grid follows it. */
  readonly targetR: number;
};

/**
 * Format A — one line, for comments and for pasting anywhere.
 *
 * `🎯 DAYSHOT #247 · 98.73 · Top 4.2% · 🔥 12`
 */
export const shareFormatA = (card: ShareCardInput): string =>
  `🎯 DAYSHOT #${card.displayDay} · ${formatScore(card.score)} · ` +
  `Top ${formatPercent(card.percentile)}% · 🔥 ${card.streak}`;

/**
 * Where the impact rings change, as fractions of the mat beyond the Perfect
 * radius.
 *
 * GDD 9.9 gives the buckets as the absolute distances {4, 12, 35, 60}, which
 * are correct at the default mat radius and *wrong everywhere else*: on a Tiny
 * Target day the mat is 30 units across, so a shot 35 units out is well off the
 * mat and would still draw at ring 2 as though it had landed on it. The
 * boundaries have to follow `targetR` for the same reason the scoring zones do.
 *
 * These fractions reproduce 4 / 12 / 35 / 60 exactly at `TARGET_R = 60`.
 */
const RING_FRACTIONS = [8 / 56, 31 / 56, 1] as const;

/** Bucket boundaries for a mat radius, innermost first. */
export const ringBoundaries = (targetR: number): number[] => {
  const span = targetR - PERFECT_RADIUS;
  return [
    PERFECT_RADIUS,
    ...RING_FRACTIONS.map((fraction) => PERFECT_RADIUS + span * fraction),
  ];
};

const GLYPH_CENTER = '🎯';
const GLYPH_RING_1 = '🟨';
const GLYPH_RING_2 = '🟥';
const GLYPH_OUTER = '🟦';
const GLYPH_MARKER = '⚫';

const GRID_SIZE = 5;
const GRID_CENTER = 2;

/** Ring index 0-4 for a miss distance on a mat of radius `targetR`. */
export const ringForDx = (dx: number, targetR: number = TARGET_R): number => {
  const bounds = ringBoundaries(targetR);
  for (let i = 0; i < bounds.length; i++) {
    const bound = bounds[i];
    if (bound !== undefined && dx <= bound) return i;
  }
  return bounds.length;
};

/**
 * Cell holding the impact marker.
 *
 * GDD 9.9 gives five distance buckets and a 5x5 grid, but the middle row only
 * offers three offsets from the centre. The reading that uses all five buckets
 * *and* reproduces the document's worked example (dx 6.4, overshoot, marker one
 * cell right of the bullseye) is: the bucket picks a Manhattan ring around the
 * centre, the sign of the miss picks the side, and within a ring the cell
 * furthest from the centre horizontally wins, breaking ties towards the top.
 *
 * Rings then read outward as centre, adjacent, row edge, diagonal edge, corner.
 */
export const markerCell = (
  ring: number,
  side: number
): readonly [number, number] => {
  if (ring === 0) return [GRID_CENTER, GRID_CENTER];

  let best: readonly [number, number] | null = null;
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      if (Math.abs(row - GRID_CENTER) + Math.abs(col - GRID_CENTER) !== ring) {
        continue;
      }
      if (side >= 0 && col <= GRID_CENTER) continue;
      if (side < 0 && col >= GRID_CENTER) continue;
      if (best === null) {
        best = [row, col];
        continue;
      }
      const spread = Math.abs(col - GRID_CENTER);
      const bestSpread = Math.abs(best[1] - GRID_CENTER);
      if (spread > bestSpread || (spread === bestSpread && row < best[0])) {
        best = [row, col];
      }
    }
  }
  return best ?? [GRID_CENTER, GRID_CENTER];
};

const ringGlyph = (row: number, col: number): string => {
  const distance = Math.abs(row - GRID_CENTER) + Math.abs(col - GRID_CENTER);
  if (distance === 0) return GLYPH_CENTER;
  if (distance === 1) return GLYPH_RING_1;
  if (distance === 2) return GLYPH_RING_2;
  return GLYPH_OUTER;
};

/**
 * The 5x5 emoji target of Format B.
 *
 * Overshoot lands right of the bullseye, undershoot left, so the grid is
 * unique per player and still gives nothing away: the power that produced it
 * appears nowhere (GDD IV.17).
 *
 * A shot inside the innermost ring keeps the bullseye glyph rather than
 * covering it with the marker — the ball and the centre coincide, and a Perfect
 * card should read as a hit, not as a missing target.
 */
export const shareGrid = (
  signedDx: number,
  targetR: number = TARGET_R
): readonly string[] => {
  const ring = ringForDx(Math.abs(signedDx), targetR);
  const side = signedDx < 0 ? -1 : 1;
  const [markerRow, markerCol] = markerCell(ring, side);

  const rows: string[] = [];
  for (let row = 0; row < GRID_SIZE; row++) {
    let line = '';
    for (let col = 0; col < GRID_SIZE; col++) {
      const isMarker = ring > 0 && row === markerRow && col === markerCol;
      line += isMarker ? GLYPH_MARKER : ringGlyph(row, col);
    }
    rows.push(line);
  }
  return rows;
};

/**
 * Format B — the target grid, DAYSHOT's Wordle grid.
 *
 * ```
 * DAYSHOT #247 🌬️−380
 * 🟦🟦🟥🟦🟦
 * 🟦🟥🟨🟥🟦
 * 🟥🟨🎯⚫🟥
 * 🟦🟥🟨🟥🟦
 * 🟦🟦🟥🟦🟦
 * 98.73 · Top 4.2% · 🔥12
 * ```
 */
export const shareFormatB = (card: ShareCardInput): string => {
  const header =
    `DAYSHOT #${card.displayDay} ` +
    `${MODIFIER_EMOJI[card.modifier]}${formatWind(card.windBase)}`;
  const footer =
    `${formatScore(card.score)} · Top ${formatPercent(card.percentile)}% · ` +
    `🔥${card.streak}`;

  return [header, ...shareGrid(card.signedDx), footer].join('\n');
};

// ---------------------------------------------------------------------------
// The feed card (redesign spec §4.3, §4.4, §10.5)
// ---------------------------------------------------------------------------

/**
 * What the day's numbers travel as. Named rather than positional because four
 * numbers in a row is how the wrong one ends up in the wrong slot.
 */
export type FeedFacts = {
  readonly shotsToday: number;
  readonly yesterdayShots: number;
  readonly topScore: number;
  readonly perfectsToday: number;
  readonly displayDay: number;
};

/** Below this, today's own count is not yet worth quoting (§4.3). */
const FEED_TODAY_MIN = 100;

/** Perfects replace the day's best only once the field is large (§4.3). */
const FEED_PERFECT_MIN_SHOTS = 1000;

/**
 * The one line of social proof under the scene.
 *
 * **Every number here is real.** §4.3 allows two figures and no more, and the
 * game has no licence to invent either: a fabricated counter on a feed card is
 * the kind of thing app review rejects, and rightly. When there is nothing true
 * to say, the line says the true small thing instead.
 */
export const socialProofLine = (facts: FeedFacts): string => {
  const { shotsToday, yesterdayShots, topScore, perfectsToday, displayDay } =
    facts;

  if (shotsToday >= FEED_TODAY_MIN) {
    const shots = `${formatCount(shotsToday)} shots today`;
    if (shotsToday >= FEED_PERFECT_MIN_SHOTS && perfectsToday >= 1) {
      return `${shots} · ${formatCount(perfectsToday)} ${
        perfectsToday === 1 ? 'Perfect' : 'Perfects'
      } today`;
    }
    return topScore > 0 ? `${shots} · best ${formatScore(topScore)}` : shots;
  }

  if (yesterdayShots > 0) {
    return `${formatCount(yesterdayShots)} shots yesterday · ${COPY.feedTodayOpened}`;
  }

  // No yesterday and barely a today. On day one that is literally true; later
  // it means a quiet community, and quoting three shots is still honest.
  if (displayDay <= 1) return COPY.feedFirstEver;
  return shotsToday === 1
    ? '1 shot today'
    : `${formatCount(shotsToday)} shots today`;
};

/**
 * The streak chip, or nothing.
 *
 * A streak of one is not a streak -- it says "you played today", which the
 * screen already says. §4.4 starts it at two.
 */
export const feedStreakChip = (streak: number): string | null =>
  streak >= 2 ? `${formatCount(streak)} ${COPY.feedStreakSuffix}` : null;

/**
 * State B's line: the day is waiting, and it is not empty (§4.4).
 *
 * Deliberately one figure, not the full proof line. "Your shot is waiting" is
 * already half the sentence, and appending a two-figure proof gave three
 * segments that truncate at 360px — §4.3's two-figure ceiling counts the whole
 * line, not the proof alone.
 */
export const feedWaitingLine = (facts: FeedFacts): string => {
  const shots =
    facts.shotsToday >= FEED_TODAY_MIN
      ? `${formatCount(facts.shotsToday)} shots today`
      : facts.yesterdayShots > 0
        ? `${formatCount(facts.yesterdayShots)} shots yesterday`
        : null;
  return shots ? `${COPY.feedWaiting} · ${shots}` : COPY.feedWaiting;
};

/**
 * State C: what you already did today, in one line (§4.4).
 *
 * The standing is whatever the result screen would say, so a player never sees
 * two different phrasings of the same rank.
 */
export const feedPlayedLine = (score: number, standing: string): string =>
  `TODAY ${formatScore(score)} · ${standing}`;

// ---------------------------------------------------------------------------
// The verdict (redesign spec §10.2, §10.3, §10.4)
// ---------------------------------------------------------------------------

export type Verdict =
  | 'PERFECT'
  | 'BULLSEYE'
  | 'SO CLOSE'
  | 'ON THE MAT'
  | 'NEAR MISS'
  | 'NOT BAD'
  | 'ROUGH LANDING'
  | 'SCENIC ROUTE'
  | 'OFF THE MAP'
  | 'INTO THE WALL';

/**
 * How far out each band reaches, in mat radii.
 *
 * **Anchored on geometry, not on score.** §10.2 gives its bands as score ranges
 * and says why in the same breath: "calés sur la géométrie : 87 = bord du tapis,
 * 99 = 12 u du centre". Those numbers were the geometry when the spec was
 * written. The daily warm-up moved the scoring curve -- the mat edge is 76 now,
 * not 87 -- so the score ranges would put a ball resting *on* the mat into
 * `NEAR MISS`, which is the opposite of what the spec asks for.
 *
 * Reading the intent instead of the digits also fixes something the digits
 * never handled: Tiny Target halves `targetR`, so a fixed `dx <= 32` means
 * "inner ring" on a normal day and "well outside the mat" on a small one. In
 * radii it means the same thing on both.
 *
 * The multipliers are §10.2's own distances divided by the default radius of
 * 60: 32 (inner ring), 60 (the edge), 128 ("two mat widths"), 251, 444.
 */
const VERDICT_RADII = {
  soClose: 32 / 60,
  onTheMat: 1,
  nearMiss: 128 / 60,
  notBad: 251 / 60,
  roughLanding: 444 / 60,
} as const;

/**
 * The word that goes above the number (§10.2).
 *
 * Never red, never "bottom", never "fail" — a bad shot is funny, not a
 * punishment, and the player has to want to come back tomorrow.
 */
export const verdictFor = (result: {
  readonly score: number;
  readonly dx: number;
  readonly impact: ImpactKind;
  readonly targetR: number;
}): Verdict => {
  // The wall replaces the band entirely: it is a different kind of miss, and
  // the sub-line says how far below the top it caught.
  if (result.impact === 'CLIFF') return 'INTO THE WALL';
  if (result.impact === 'OFF_THE_MAP' || result.score <= 0) return 'OFF THE MAP';

  if (result.score >= 100) return 'PERFECT';
  if (result.score >= BULLSEYE_SCORE) return 'BULLSEYE';

  const radii = result.dx / Math.max(1, result.targetR);
  if (radii <= VERDICT_RADII.soClose) return 'SO CLOSE';
  if (radii <= VERDICT_RADII.onTheMat) return 'ON THE MAT';
  if (radii <= VERDICT_RADII.nearMiss) return 'NEAR MISS';
  if (radii <= VERDICT_RADII.notBad) return 'NOT BAD';
  if (radii <= VERDICT_RADII.roughLanding) return 'ROUGH LANDING';
  return 'SCENIC ROUTE';
};

/** Which token colours the verdict (§10.2). */
export type VerdictTone = 'gold' | 'coral' | 'ink' | 'mist';

export const verdictTone = (verdict: Verdict): VerdictTone => {
  if (verdict === 'PERFECT' || verdict === 'BULLSEYE') return 'gold';
  if (verdict === 'SO CLOSE') return 'coral';
  if (verdict === 'ON THE MAT' || verdict === 'NEAR MISS' || verdict === 'NOT BAD') {
    return 'ink';
  }
  return 'mist';
};

/**
 * Where it landed, in words (§10.4).
 *
 * Whole units only. The decimal belongs to the score, and "251.4 short" invites
 * a precision the player cannot act on.
 */
export const impactDirection = (result: {
  readonly signedDx: number;
  readonly dx: number;
  readonly impact: ImpactKind;
  readonly cliffDrop: number;
  readonly targetR: number;
}): string => {
  if (result.impact === 'OFF_THE_MAP') return 'off the map';
  if (result.impact === 'CLIFF') {
    return `into the wall, ${Math.round(result.cliffDrop)} below the top`;
  }

  const distance = Math.round(result.dx);
  if (distance === 0) return 'dead centre';

  const side = result.signedDx < 0 ? 'short' : 'over';
  // On the mat the player wants to know they were on it, not just how far out.
  return result.dx <= result.targetR
    ? `${distance} ${side} — inner ring`
    : `${distance} ${side}`;
};

/**
 * How the day compares (§10.3).
 *
 * Never "bottom", and never a percentile that reads as an insult: below the
 * halfway mark it says what you beat rather than what beat you.
 */
export type Standing = {
  readonly line: string;
  /** A chip is a filled pill; a plain line is not. */
  readonly chip: 'gold' | 'coral' | null;
  /** `#1,204 / 8,421`, or null while the field is too small to mean anything. */
  readonly rankLine: string | null;
};

/** §6: the Perfect line on the result panel, when there is one to report. */
/**
 * §7's two empty states.
 *
 * Neither apologises. A day with three players is early, not broken, and a
 * player who has not shot yet is being invited rather than excluded.
 */
export const boardEarly = (shots: number): string =>
  `Only ${formatCount(shots)} ${shots === 1 ? 'shot' : 'shots'} so far — you're early.`;


/** §6: the Perfect line on the result panel, when there is one to report. */
export const perfectsTodayLine = (perfects: number): string =>
  `Only ${formatCount(perfects)} ${perfects === 1 ? 'Perfect' : 'Perfects'} today.`;

export const standingFor = (rank: number, total: number): Standing => {
  if (total <= 1) {
    return { line: 'You opened the day.', chip: null, rankLine: null };
  }
  if (total < PERCENTILE_MIN_PLAYERS) {
    return {
      line: `#${formatCount(rank)} of ${formatCount(total)} today`,
      chip: null,
      rankLine: null,
    };
  }

  const rankLine = `#${formatCount(rank)} / ${formatCount(total)}`;
  if (rank <= 3) {
    return { line: `#${rank} TODAY`, chip: 'gold', rankLine };
  }

  const beat = ((total - rank) / total) * 100;
  if (beat >= 50) {
    const top = percentFor(rank, total);
    const shown = top < 10 ? top.toFixed(1) : String(Math.round(top));
    return { line: `TOP ${shown}% TODAY`, chip: 'coral', rankLine };
  }
  return { line: `You beat ${Math.round(beat)}% today`, chip: null, rankLine };
};
