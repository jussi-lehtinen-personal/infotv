// Drive the Ahmaliiga "replay a past season" from the command line against the
// live backend (env-admin only). Prereq: the season is seeded (tools/seed-upload.js).
//
//   AHMA_TOKEN=<token> node tools/sim.js setup       # load results + seed bots (once)
//   AHMA_TOKEN=<token> node tools/sim.js settle       # settle the current round, advance 1
//   AHMA_TOKEN=<token> node tools/sim.js settle-all    # settle through to the last round
//   AHMA_TOKEN=<token> node tools/sim.js photos        # match player photos from Jopox rosters
//   AHMA_TOKEN=<token> node tools/sim.js resettle       # re-settle already-settled rounds in order
//                                                       # (idempotent — refreshes trend/seasonPts, standings unchanged)
//
// Optional: pass a base URL as the 2nd arg (default production), season via SEASON.

const fs = require('fs');
const path = require('path');

const cmd = process.argv[2];
const base = process.argv[3] || 'https://gamezone.kiekko-ahma.fi';
const season = process.env.SEASON || '2026';
const token = process.env.AHMA_TOKEN;

async function post(action, extra) {
  const r = await fetch(`${base}/api/manageAhmaliiga`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Ahma-Auth': token },
    body: JSON.stringify({ action, ...extra }),
  });
  const t = await r.text();
  console.log(`${action}: ${r.status} ${t}`);
  if (!r.ok) process.exit(1);
}

(async () => {
  if (!token) { console.error('Set AHMA_TOKEN.'); process.exit(1); }
  if (cmd === 'setup') {
    const rd = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', `results-${season}.json`), 'utf8'));
    await post('loadResults', { results: rd.results, reasons: rd.reasons });
    const games = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', `games-${season}.json`), 'utf8')).games;
    await post('loadGames', { games });
    await post('seedBots', {});
  } else if (cmd === 'settle') {
    await post('settleRound', {});
  } else if (cmd === 'settle-all') {
    await post('settleAll', {});
  } else if (cmd === 'photos') {
    await post('enrichPhotos', {});
  } else if (cmd === 'resettle') {
    // Re-settle the already-settled rounds (0..currentJakso-1) in order. Idempotent:
    // seasonPts is recomputed from results and trend = new price vs the price going
    // into that settle, so settling 0 then 1 leaves the standings/prices/pointer as-is
    // but refreshes trend + fills seasonPts for every card.
    const r = await fetch(`${base}/api/manageAhmaliiga`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Ahma-Auth': token },
      body: JSON.stringify({ action: 'status' }),
    });
    const st = await r.json();
    const cur = Number(st.currentJakso);
    if (!Number.isFinite(cur) || cur < 1) { console.error('Nothing settled yet (currentJakso=' + st.currentJakso + ').'); process.exit(1); }
    console.log(`Re-settling rounds 0..${cur - 1} in order…`);
    for (let j = 0; j < cur; j++) await post('settleRound', { round: j });
  } else {
    console.error('Usage: node tools/sim.js setup|settle|settle-all|photos|resettle');
    process.exit(1);
  }
})();
