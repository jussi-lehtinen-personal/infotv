// U9 — faithful reband sim over the restored beta. Ports production EXACTLY:
//   cumForm      = per-card cumulative avg of pts over the rounds it APPEARS in Results
//   bandPricesFrom = snap(form/poolMax × ladder[0]) — SEPARATE team & player pools
//   settle apply = price += clamp(target−old, ±priceStepCap); no-form cards keep old
// Starts from Cards.seedPrice and VALIDATES option D against the real CardHistory prices.
// Then compares reband options for the "0-round price drop" (U9) problem.
//   node tools/sim-u9.js
process.env.TABLES_CONNECTION_STRING = "UseDevelopmentStorage=true";
if (!globalThis.crypto) globalThis.crypto = require("crypto").webcrypto;
const { ensureTables, listEntities } = require("../api/src/lib/tables");
const r1 = (n) => Math.round(n * 10) / 10;
const pad = (s, n) => String(s).padStart(n);

const ECON = { band: [50, 40, 30, 20, 10], playerBand: [75, 60, 45, 35, 25, 15, 10], priceStepCap: 15 };

// EXACT copy of production bandPricesFrom (ahmaliiga.js:536).
function bandPricesFrom(pool, form, prices) {
  const vals = pool.map((c) => form[c.id]).filter((v) => v != null);
  const max = vals.length ? Math.max(...vals) : 0;
  const mid = prices[Math.floor(prices.length / 2)];
  const snap = (t) => { let best = prices[0]; for (const p of prices) if (Math.abs(p - t) < Math.abs(best - t)) best = p; return best; };
  const out = {};
  for (const c of pool) { const v = form[c.id]; out[c.id] = v == null ? mid : (max > 0 ? snap((v / max) * prices[0]) : mid); }
  return out;
}

(async () => {
  await ensureTables();
  // Cards: id → {kind, seed}
  const cards = (await listEntities("AhmaliigaCards")).map((c) => ({ id: c.rowKey, kind: c.kind, seed: Number(c.seedPrice != null ? c.seedPrice : c.price) }));
  const teamPool = cards.filter((c) => c.kind === "team"), playerPool = cards.filter((c) => c.kind !== "team");

  // Results per round: round → {id: pts} (ground truth for cumForm counts + the appeared set)
  const res = {};
  for (const r of await listEntities("AhmaliigaResults")) { const round = Number((r.partitionKey || "").split("|")[1]); (res[round] = res[round] || {})[r.rowKey] = Number(r.pts) || 0; }
  const rounds = Object.keys(res).map(Number).sort((a, b) => a - b);
  const nR = rounds.length ? Math.max(...rounds) + 1 : 0;

  // Actual CardHistory prices (for validation) + pts (for the 0-round metric).
  const hist = {}; // id → {round: {price, pts}}
  for (const h of await listEntities("AhmaliigaCardHistory")) { const id = (h.partitionKey || "").replace(/^[^|]*\|/, ""); (hist[id] = hist[id] || {})[Number(h.rowKey)] = { price: Number(h.price), pts: Number(h.pts) }; }
  const histPts = (id, j) => (hist[id] && hist[id][j] ? hist[id][j].pts : 0); // = resJ[id]||0 (matches production CardHistory)

  // opt: {form:'cumAvg'|'roll'|'total', N, capUp, capDown, freezeZero}
  function replay(opt) {
    const price = {}; for (const c of cards) price[c.id] = c.seed;
    const appeared = {}; // id → [pts...] in appeared order
    let zeroDrops = 0, zeroCoins = 0, allDrops = 0, allCoins = 0; const moves = []; const aff = new Set(); let validMatch = 0, validTot = 0;
    for (let j = 0; j < nR; j++) {
      const rj = res[j] || {};
      for (const [id, pts] of Object.entries(rj)) (appeared[id] = appeared[id] || []).push(pts);
      const form = {};
      for (const c of cards) {
        const a = appeared[c.id]; if (!a || !a.length) { form[c.id] = null; continue; }
        if (opt.form === "total") form[c.id] = a.reduce((x, y) => x + y, 0);
        else if (opt.form === "roll") { const w = a.slice(-opt.N); form[c.id] = w.reduce((x, y) => x + y, 0) / w.length; }
        else form[c.id] = a.reduce((x, y) => x + y, 0) / a.length; // cumAvg (production)
      }
      const target = { ...bandPricesFrom(teamPool, form, ECON.band), ...bandPricesFrom(playerPool, form, ECON.playerBand) };
      for (const c of cards) {
        if (form[c.id] == null) continue; // no form → keep old (production)
        const old = price[c.id]; const t = target[c.id];
        const noGame = !(c.id in rj), playedZero = (c.id in rj) && rj[c.id] === 0;
        const freeze = opt.freeze === "all" ? (noGame || playedZero) : opt.freeze === "nogame" ? noGame : false;
        let np;
        if (freeze && t < old) np = old; // E/E′: don't drop when the card earned nothing this round
        else { const cu = t - old >= 0 ? opt.capUp : opt.capDown; np = old + Math.max(-cu, Math.min(cu, t - old)); }
        if (np < old) { allDrops++; allCoins += old - np; if (histPts(c.id, j) === 0) { zeroDrops++; zeroCoins += old - np; aff.add(c.id); } }
        if (np !== old) moves.push(Math.abs(np - old));
        price[c.id] = np;
        // validate: production stores the PRE-reband (during-round) price in CardHistory[j],
        // so this settle's new price (from round j's results) equals the real CardHistory[j+1].
        if (opt.validate && hist[c.id] && hist[c.id][j + 1] != null) { validTot++; if (Math.round(np) === Math.round(hist[c.id][j + 1].price)) validMatch++; }
      }
    }
    const tf = teamPool.map((c) => price[c.id]).sort((a, b) => b - a), pf = playerPool.map((c) => price[c.id]).sort((a, b) => b - a);
    return { zeroDrops, zeroCoins, allDrops, allCoins, aff: aff.size, mv: moves.length ? moves.reduce((a, b) => a + b, 0) / moves.length : 0,
      tSpread: `${tf[0]}…${tf[tf.length - 1]}`, pSpread: `${pf[0]}…${pf[pf.length - 1]}`, validMatch, validTot };
  }

  console.log(`════════ U9 · reband-simulaatio (faithful port) — ${cards.length} korttia × ${nR} jaksoa ════════`);
  const vD = replay({ form: "cumAvg", capUp: 15, capDown: 15, validate: true });
  console.log(`  VALIDOINTI (optio D vs oikeat CardHistory-hinnat): ${vD.validMatch}/${vD.validTot} täsmää (${r1(100 * vD.validMatch / vD.validTot)} %)`);
  console.log(`  optio                                   0p-laskut  (Σc)  %laskuista  kortteja  ka-liike  joukkue-haitari  pelaaja-haitari`);
  const opts = [
    ["D  nykyinen (kum.ka, ±15)", { form: "cumAvg", capUp: 15, capDown: 15 }],
    ["E  ei laskua 0-jaksolla (pelasi 0 TAI ei peliä)", { form: "cumAvg", capUp: 15, capDown: 15, freeze: "all" }],
    ["E′ ei laskua kun EI PELIÄ (pelasi 0 → laskee)", { form: "cumAvg", capUp: 15, capDown: 15, freeze: "nogame" }],
    ["B  epäsymmetrinen cap (+15/−7)", { form: "cumAvg", capUp: 15, capDown: 7 }],
    ["A  rullaava form (3 jaksoa, ±15)", { form: "roll", N: 3, capUp: 15, capDown: 15 }],
    ["C  absoluuttinen (Σpisteet, ±15)", { form: "total", capUp: 15, capDown: 15 }],
  ];
  for (const [name, o] of opts) {
    const s = replay(o);
    console.log(`  ${name.padEnd(36)} ${pad(s.zeroDrops, 5)} ${pad(s.zeroCoins, 5)}c  ${pad(r1(100 * s.zeroDrops / (s.allDrops || 1)), 6)}%   ${pad(s.aff, 5)}   ${pad(r1(s.mv), 6)}   ${pad(s.tSpread, 12)}     ${s.pSpread}`);
  }
  console.log(`  → tavoite: vähemmän 0p-laskuja (Jani: "rankaistiin tyhjästä") mutta säilytä ka-liike (pörssimeta) + hintahaitari (dream-deck vaikea).`);
  process.exit(0);
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
