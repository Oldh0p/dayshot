import { PERFECT_RADIUS, TARGET_R } from './tunables.ts';
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
  title: 'ONE SHOT',
  /** GDD 9.9 */
  tagline: 'One attempt. Every day.',

  // -- Splash / feed card ---------------------------------------------------
  /** GDD 9.9 */
  splashCta: 'TAP TO SHOOT',

  // -- Onboarding -----------------------------------------------------------
  /** GDD 9.9 */
  warmupBanner: "WARM-UP — this one doesn't count",
  /** GDD 9.9 */
  warmupOver: 'That was practice. Now for real.',
  warmupOverSub: 'ONE SHOT — make it count.',
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

  // -- Result ---------------------------------------------------------------
  /** GDD 9.9 */
  offTheMap: 'OFF THE MAP',
  splat: 'SPLAT',
  bullseye: 'BULLSEYE',
  perfectStamp: '🎯 PERFECT SHOT',
  postMyShot: 'POST MY SHOT',
  practice: 'Practice',
  copyCard: 'Copy card',
  globalRankSuffix: 'Global',
  scoringPending: 'Confirming…',
  recalibrated: 'Recalibrated by the server',

  // -- Practice -------------------------------------------------------------
  practiceWatermark: 'PRACTICE',
  practiceLocked: 'Practice unlocks after your official shot.',

  // -- Help sheet -----------------------------------------------------------
  helpTitle: 'How it works',
  /** GDD 19 */
  helpBody:
    'Hold to charge, release to shoot. Closest to center wins. One official shot per day.',
  soundToggle: 'Sound',

  // -- System states --------------------------------------------------------
  /** GDD 31 */
  loggedOut: 'Log in to take your shot',
  loggedOutCta: 'Log in',
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
  shareConsentBody:
    'This posts your score card as a comment from your account, as a reply to the daily thread.',
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

export const betterThanLine = (percent: number): string =>
  `Better than ${formatPercent(100 - percent)}% of players today`;

export const fromCenterLine = (dx: number): string =>
  `${formatDx(dx)} from center`;

export const streakLine = (streak: number): string =>
  `🔥 ${streak} DAY STREAK`;

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
  `🎯 ONE SHOT #${displayDay} — ${MODIFIER_LABEL[modifier]}. One try. 24 hours.`;

export const splashDescription = (modifier: ModifierId): string =>
  `${MODIFIER_EMOJI[modifier]} ${MODIFIER_LABEL[modifier]} — one try, 24 hours.`;

/** Yesterday's headline, chosen by rule so nobody has to write one every day. */
export type YesterdayStats = {
  readonly perfects: number;
  readonly topScore: number;
  readonly shots: number;
};

const yesterdayHeadline = (stats: YesterdayStats): string => {
  if (stats.shots === 0) return '';
  if (stats.perfects === 0) {
    return ` Nobody hit a Perfect yesterday — best was ${formatScore(stats.topScore)}.`;
  }
  if (stats.perfects === 1) {
    return ' Only 1 Perfect yesterday.';
  }
  return ` ${formatCount(stats.perfects)} Perfects yesterday.`;
};

/**
 * The stickied comment the app posts and pins under the daily post (GDD 15).
 *
 * It is not an announcement, it is *the thread*: every score card is published
 * as a reply to it, because Reddit requires user-attributed score comments to
 * reply to a single stickied comment. So the first line has to read as an
 * invitation and the second has to explain what lands underneath — a reader who
 * sees only the collapsed header should still understand what this is.
 */
export const seedComment = (
  displayDay: number,
  modifier: ModifierId,
  windBase: number,
  yesterday: YesterdayStats | null
): string =>
  `🎯 **Drop your shot below**

` +
  `Day #${displayDay} — ${MODIFIER_LABEL[modifier]} ${formatWind(windBase)}. ` +
  `Tap POST MY SHOT on your result and your card replies here. ` +
  `One shot per player, per day — everyone resets at 00:00 UTC.` +
  (yesterday ? `

${yesterdayHeadline(yesterday).trim()}` : '');

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
 * `🎯 ONE SHOT #247 · 98.73 · Top 4.2% · 🔥 12`
 */
export const shareFormatA = (card: ShareCardInput): string =>
  `🎯 ONE SHOT #${card.displayDay} · ${formatScore(card.score)} · ` +
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
  const distance =
    Math.abs(row - GRID_CENTER) + Math.abs(col - GRID_CENTER);
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
 * Format B — the target grid, ONE SHOT's Wordle grid.
 *
 * ```
 * ONE SHOT #247 🌬️−380
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
    `ONE SHOT #${card.displayDay} ` +
    `${MODIFIER_EMOJI[card.modifier]}${formatWind(card.windBase)}`;
  const footer =
    `${formatScore(card.score)} · Top ${formatPercent(card.percentile)}% · ` +
    `🔥${card.streak}`;

  return [header, ...shareGrid(card.signedDx), footer].join('\n');
};
