// Drive the Ahmaliiga "replay a past season" from the command line against the
// live backend (env-admin only). Prereq: the season is seeded (tools/seed-upload.js).
//
//   AHMA_TOKEN=<token> node tools/sim.js setup       # load results + seed bots (once)
//   AHMA_TOKEN=<token> node tools/sim.js settle       # settle the current jakso, advance 1
//   AHMA_TOKEN=<token> node tools/sim.js settle-all    # settle through to the last jakso
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
    const results = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', `results-${season}.json`), 'utf8')).results;
    await post('loadResults', { results });
    const games = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', `games-${season}.json`), 'utf8')).games;
    await post('loadGames', { games });
    await post('seedBots', {});
  } else if (cmd === 'settle') {
    await post('settleJakso', {});
  } else if (cmd === 'settle-all') {
    await post('settleAll', {});
  } else {
    console.error('Usage: node tools/sim.js setup|settle|settle-all');
    process.exit(1);
  }
})();
