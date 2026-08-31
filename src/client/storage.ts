/**
 * Browser storage, used only for conveniences.
 *
 * Devvit changes the iframe URL on every app version, so `localStorage` is
 * wiped by each release. Nothing that matters may live here: the daily lock,
 * the streak and the share consent are all server-side. What is kept here is
 * what is cheap to lose — a sound toggle, today's practice tally, and a shot
 * still waiting to reach the server.
 *
 * Every access is wrapped: a browser with storage disabled must still play.
 */

const PREFIX = 'oneshot:';

const read = (key: string): string | null => {
  try {
    return window.localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
};

const write = (key: string, value: string): void => {
  try {
    window.localStorage.setItem(PREFIX + key, value);
  } catch {
    // Storage is a convenience. Losing it is not an error.
  }
};

const drop = (key: string): void => {
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
};

// -- Sound -------------------------------------------------------------------

/**
 * Off until the player turns it on. The game lives in a feed, where sound is
 * an ambush; GDD 27 asks for the toggle to be visible in the first session.
 */
export const soundEnabled = (): boolean => read('sound') === 'on';

export const setSoundEnabled = (on: boolean): void =>
  write('sound', on ? 'on' : 'off');

export const soundChoiceMade = (): boolean => read('sound') !== null;

// -- Practice ----------------------------------------------------------------

export type PracticeTally = {
  readonly dayNumber: number;
  readonly best: number;
  readonly tries: number;
};

export const readPractice = (dayNumber: number): PracticeTally => {
  const raw = read('practice');
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'dayNumber' in parsed &&
        (parsed as PracticeTally).dayNumber === dayNumber
      ) {
        return parsed as PracticeTally;
      }
    } catch {
      /* fall through to a fresh tally */
    }
  }
  return { dayNumber, best: 0, tries: 0 };
};

export const recordPractice = (
  dayNumber: number,
  score: number
): PracticeTally => {
  const current = readPractice(dayNumber);
  const next: PracticeTally = {
    dayNumber,
    best: Math.max(current.best, score),
    tries: current.tries + 1,
  };
  write('practice', JSON.stringify(next));
  return next;
};

// -- Pending shot ------------------------------------------------------------

/**
 * A shot that has been taken but not yet acknowledged by the server.
 *
 * This is the local half of the promise in GDD 30: a player can never lose
 * their shot of the day to a dropped connection. The durable half is the
 * server's daily lock, which makes the retry idempotent.
 */
export type PendingShot = {
  readonly dayNumber: number;
  readonly holdMs: number;
  readonly clientScore: number;
  /** When the player actually fired, for the rollover grace window. */
  readonly takenAt: number;
};

export const readPendingShot = (): PendingShot | null => {
  const raw = read('pending');
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as PendingShot).holdMs === 'number' &&
      typeof (parsed as PendingShot).dayNumber === 'number'
    ) {
      return parsed as PendingShot;
    }
  } catch {
    /* ignore */
  }
  return null;
};

export const writePendingShot = (shot: PendingShot): void =>
  write('pending', JSON.stringify(shot));

export const clearPendingShot = (): void => drop('pending');

// -- Help sheet --------------------------------------------------------------

export const helpSeen = (): boolean => read('help') === '1';
export const markHelpSeen = (): void => write('help', '1');
