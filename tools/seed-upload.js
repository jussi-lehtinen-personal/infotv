// Upload a generated card seed to the live backend via POST /api/manageAhmaliiga
// (env-admin gated). One-time per season / after regenerating the pool.
//
//   node tools/gen-cards.js 2026 2025          # produce tools/data/cards-seed-2026.json
//   AHMA_TOKEN=<token> node tools/seed-upload.js [baseUrl] [season]
//
// AHMA_TOKEN = your auth token: open the app signed in, DevTools console →
//   localStorage.getItem("ahma.authToken")
// baseUrl defaults to production; use http://localhost:4280 for a local SWA run.

const fs = require("fs");
const path = require("path");

const base = process.argv[2] || "https://gamezone.kiekko-ahma.fi";
const season = process.argv[3] || "2026";
const token = process.env.AHMA_TOKEN;

(async () => {
  if (!token) {
    console.error('Set AHMA_TOKEN (localStorage "ahma.authToken" from the signed-in app).');
    process.exit(1);
  }
  const file = path.join(__dirname, "data", `cards-seed-${season}.json`);
  if (!fs.existsSync(file)) {
    console.error(`Missing ${file} — run: node tools/gen-cards.js ${season}`);
    process.exit(1);
  }
  const seed = JSON.parse(fs.readFileSync(file, "utf8"));
  console.log(`Uploading ${seed.cards.length} cards + ${(seed.jaksot || []).length} jaksot to ${base} …`);
  const r = await fetch(`${base}/api/manageAhmaliiga`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Ahma-Auth": token },
    body: JSON.stringify({ action: "seedSeason", seed }),
  });
  console.log(r.status, await r.text());
  process.exit(r.ok ? 0 : 1);
})();
