// Upload a generated live-season seed to PRODUCTION (manageAhmaliiga seedSeason). This is
// the ONE JSON-upload step of going live — everything after it (reconcile pool / sync games
// / set launch time / real clock / autostep) is a button in the Ahmaliiga admin panel.
//
// Auth: manageAhmaliiga is env-admin gated and reads the header `X-Ahma-Auth: <token>`.
// Get YOUR token while logged in as admin on gamezone.kiekko-ahma.fi — browser console:
//     localStorage.getItem('ahma.authToken')
//
//   AHMA_TOKEN=<token> node tools/upload-live-seed.js [tools/data/live-seed-2027.json]
//
// ⚠️ Seeds a NEW seasonId → the current active season goes INACTIVE but is RETAINED (its
// rows are NOT wiped; verified in tools/test-live-pool + the transition test). Do NOT run
// resetAll on the old season if you want to keep it as history.

const fs = require("fs");
const path = require("path");

const API = process.env.AHMA_API || "https://gamezone.kiekko-ahma.fi/api/manageAhmaliiga";
const token = process.env.AHMA_TOKEN || "";
const seedPath = process.argv[2] || path.join(__dirname, "data", "live-seed-2027.json");

(async () => {
  if (!token) { console.error("Missing AHMA_TOKEN (localStorage 'ahma.authToken' while logged in as admin)."); process.exit(1); }
  let seed;
  try { seed = JSON.parse(fs.readFileSync(seedPath, "utf8")); }
  catch (e) { console.error(`Cannot read seed ${seedPath}: ${e.message}`); process.exit(1); }
  if (!Array.isArray(seed.cards)) { console.error("seed.cards must be an array (a live seed uses []). Wrong file?"); process.exit(1); }

  console.log(`Seeding season "${seed.season}" → ${API}`);
  console.log(`  rounds: ${seed.roundConfig ? `${seed.roundConfig.count}× ${seed.roundConfig.weeks}wk from ${seed.roundConfig.startDate}` : "(seed.rounds)"} · startAt ${seed.startAt || "(none)"}`);
  console.log(`  livePool ${!!seed.livePool} · includeFriendlies ${!!seed.includeFriendlies} · u15Flat ${seed.u15Flat} · priorIndex ${Object.keys(seed.priorIndex || {}).length} players`);

  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Ahma-Auth": token },
    body: JSON.stringify({ action: "seedSeason", seed }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) { console.error(`\n❌ HTTP ${res.status}: ${body.error || JSON.stringify(body)}`); process.exit(1); }
  console.log(`\n✅ seeded: ${JSON.stringify(body)}`);
  console.log(`\nNext (Ahmaliiga admin panel): Täydennä kortisto → Synkkaa pelit → Aseta avautumisaika → Reaalikello → Automaatti.`);
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
