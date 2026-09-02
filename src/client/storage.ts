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
 * On unless the player has turned it off.
 *
 * It was the other way round, and the toggle was a checkbox two taps deep
 * inside the help sheet -- so the twelve cues of GDD 27 were unreachable in
 * practice. `ensure()` no-ops while sound is off, and the only gesture that
 * could ever flip it lived in an overlay almost nobody opens; a player
 * returning to their result never even reaches a handler that would ask.
 *
 * "On" means *armed*, never *playing*. Nothing is audible until the player's
 * own first press builds the AudioContext, which is both the browser's rule --
 * a cross-origin iframe gets no audio without a gesture in its own document,
 * and this game is one -- and Reddit's: "Audio should not play unless there is
 * a user interaction". What makes this default honest is the mute button in
 * the day bar, which is Reddit's very next requirement, and the fact that
 * leaving the tab silences everything.
 */
export const soundEnabled = (): boolean => read('sound') !== 'off';

export const setSoundEnabled = (on: boolean): void =>
  write('sound', on ? 'on' : 'off');

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
