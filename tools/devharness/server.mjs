// Local harness: serves the built client with a stubbed Devvit API so the scene
// can be exercised in a plain browser. Never shipped; `devvit playtest` is the
// real thing.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

/*
 * The real modifier for the day, not a hardcoded one.
 *
 * The stub used to claim CROSSWIND while the client regenerated the day's level
 * from the seed and drew CLEAR SKIES -- the day bar and the conditions pill
 * disagreed in every screenshot. In production they cannot: both sides derive
 * the modifier from the same day number. The harness now does too.
 */
const { generateLevel, simulateLevel } = await import('../../src/shared/sim.ts');

const ROOT = new URL('../../dist/client/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const PORT = Number(process.env.PORT ?? 5599);
const TODAY = Math.floor(Date.now() / 86400000);

/*
 * `?mod=MOON` serves a real day that actually draws that modifier, rather than
 * overriding the field.
 *
 * The client regenerates the level from the day number, so claiming a modifier
 * the seed does not produce puts the day bar and the scene back in
 * disagreement -- the bug this harness already had once. Searching forward for
 * a day that genuinely has it keeps both sides honest, and every modifier turns
 * up within a couple of weeks.
 */
const dayWithModifier = (wanted) => {
  for (let offset = 0; offset < 400; offset++) {
    if (generateLevel(TODAY + offset).modifier === wanted) return TODAY + offset;
  }
  return TODAY;
};

let DAY = TODAY;
let LEVEL = generateLevel(DAY);

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };

let played = false;
let warmupPending = process.env.WARMUP_PENDING === '1';
let anon = false;
let streak = 3;
/*
 * The hold a restored result was thrown with.
 *
 * Bullseye and Perfect cannot be captured by timing a real gesture: on the day
 * this was measured they are 314ms and 318ms, four milliseconds apart, and a
 * dispatched `pointerup` does not land that precisely. Restoring a genuinely
 * simulated result is the honest way to see those panels -- the score, the
 * verdict and the distance are all real, they were simply not thrown live.
 */
let restoredHold = 640;

// The result a played-today session restores into. Having it here means the
// result screen can be loaded directly -- which is how its layout gets checked
// against a post-sized viewport without playing a shot first.

const myResult = () => {
  const shot = simulateLevel(LEVEL, restoredHold);
  return {
    score: shot.score, dx: shot.dx,
    signedDx: shot.impactX < LEVEL.distance ? -shot.dx : shot.dx,
    impact: shot.impact, cliffDrop: shot.cliffDrop, holdMs: restoredHold,
    rank: 184, total: 41203, percentile: 4.2,
    isBullseye: shot.isBullseye, isPerfect: shot.isPerfect,
  };
};

const state = () => ({
  dayNumber: DAY, displayDay: DAY - 20697 + 1, rerollK: 0, serverNow: Date.now(),
  modifier: LEVEL.modifier, playedToday: played, myResult: played ? myResult() : null,
  streak: { current: streak, longest: 12, justReset: false },
  warmupPending, shotsToday: 41203, yesterdayShots: 38217, topScore: 99.94, perfectsToday: 38,
  tomorrowModifier: generateLevel(DAY + 1).modifier, sharedToday: false, shareConsent: false, username: anon ? null : 'tester',
});

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const send = (code, body, type = 'application/json') => {
    res.writeHead(code, { 'content-type': type }); res.end(body);
  };

  if (url.pathname === '/api/reset') {
    played = url.searchParams.get('played') === '1';
    warmupPending = url.searchParams.get('warmup') === '1';
    // Feed state A needs a viewer with no account; B needs a streak worth showing.
    anon = url.searchParams.get('anon') === '1';
    streak = Number(url.searchParams.get('streak') ?? 3);
    const wanted = url.searchParams.get('mod');
    restoredHold = Number(url.searchParams.get('hold') ?? 640);
    DAY = wanted ? dayWithModifier(wanted) : TODAY;
    LEVEL = generateLevel(DAY);
    return send(200, '{"ok":true}');
  }
  if (url.pathname === '/api/state') return send(200, JSON.stringify(state()));
  if (url.pathname === '/api/leaderboard') {
    return send(200, JSON.stringify({
      top: [
        { rank: 1, username: 'ace', score: 99.94, isMe: false },
        { rank: 2, username: 'bo', score: 99.71, isMe: false },
        { rank: 3, username: 'cy', score: 99.4, isMe: false },
      ],
      // The real window is radius 3 around the player (ranking.ts), so ten rows
      // is the worst case the layout has to survive without scrolling.
      around: [
        { rank: 181, username: 'longest_name_here', score: 98.91, isMe: false },
        { rank: 182, username: 'dee', score: 98.86, isMe: false },
        { rank: 183, username: 'flo', score: 98.8, isMe: false },
        { rank: 184, username: 'tester', score: 98.73, isMe: true },
        { rank: 185, username: 'eve', score: 98.7, isMe: false },
        { rank: 186, username: 'gus', score: 98.62, isMe: false },
        { rank: 187, username: 'hal', score: 98.55, isMe: false },
      ],
      total: 41203,
    }));
  }
  if (url.pathname === '/api/shot') {
    played = true;
    let body = ''; for await (const chunk of req) body += chunk;
    const { holdMs } = JSON.parse(body || '{}');
    /*
     * Simulated, not stubbed.
     *
     * This used to answer with a fixed `dx: 6.4` and echo back whatever score
     * the client claimed, which made every captured result read `SO CLOSE / 6
     * over` no matter where the ball actually went -- so a verdict function
     * keyed on distance could never be checked against a real shot. The server
     * re-simulates from holdMs in production; so does this.
     */
    const shot = simulateLevel(LEVEL, Number(holdMs) || 0);
    return send(200, JSON.stringify({
      score: shot.score, dx: shot.dx, signedDx: shot.dx * Math.sign(shot.impactX - LEVEL.distance || 1),
      impact: shot.impact, cliffDrop: shot.cliffDrop, holdMs: Number(holdMs) || 0,
      rank: 184, total: 41203, percentile: 4.2,
      isBullseye: shot.isBullseye, isPerfect: shot.isPerfect,
      perfectCountToday: 38, streak: { current: 4, longest: 12, justReset: false },
      simMismatch: false,
    }));
  }
  if (url.pathname === '/api/warmup-done') { warmupPending = false; return send(200, '{"ok":true}'); }
  if (url.pathname.startsWith('/api/')) return send(200, '{"ok":true}');

  const file = url.pathname === '/' ? '/game.html' : url.pathname;
  try {
    const data = await readFile(join(ROOT, file));
    return send(200, data, TYPES[extname(file)] ?? 'application/octet-stream');
  } catch { return send(404, 'not found', 'text/plain'); }
}).listen(PORT, () => console.log(`harness on http://localhost:${PORT}`));
