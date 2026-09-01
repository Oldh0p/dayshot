// Local harness: serves the built client with a stubbed Devvit API so the scene
// can be exercised in a plain browser. Never shipped; `devvit playtest` is the
// real thing.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const ROOT = new URL('../../dist/client/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const PORT = Number(process.env.PORT ?? 5599);
const DAY = Math.floor(Date.now() / 86400000);

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };

let played = false;
let warmupPending = process.env.WARMUP_PENDING === '1';

// The result a played-today session restores into. Having it here means the
// result screen can be loaded directly -- which is how its layout gets checked
// against a post-sized viewport without playing a shot first.
const MY_RESULT = {
  score: 98.73, dx: 6.4, signedDx: 6.4, impact: 'MAT', holdMs: 640,
  rank: 184, total: 41203, percentile: 4.2, isBullseye: false, isPerfect: false,
};

const state = () => ({
  dayNumber: DAY, displayDay: DAY - 20697 + 1, rerollK: 0, serverNow: Date.now(),
  modifier: 'CROSSWIND', playedToday: played, myResult: played ? MY_RESULT : null,
  streak: { current: 3, longest: 12, justReset: false },
  warmupPending, shotsToday: 41203, topScore: 99.94, perfectsToday: 38,
  tomorrowModifier: 'MOON', sharedToday: false, shareConsent: false, username: 'tester',
});

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const send = (code, body, type = 'application/json') => {
    res.writeHead(code, { 'content-type': type }); res.end(body);
  };

  if (url.pathname === '/api/reset') {
    played = url.searchParams.get('played') === '1';
    warmupPending = url.searchParams.get('warmup') === '1';
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
    const { clientScore } = JSON.parse(body || '{}');
    return send(200, JSON.stringify({
      score: clientScore, dx: 6.4, signedDx: 6.4, impact: 'MAT', holdMs: 640,
      rank: 184, total: 41203, percentile: 4.2, isBullseye: false, isPerfect: false,
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
