// READ-ONLY: fetch a fresh backup from prod (admin-gated exportBackup) and report a
// manager's transfer-penalty situation — WITHOUT changing any game data. Shows their
// squad's stored transfer counter + every settled round's penalty, so we can tell
// whether a -5 was charged for transfers they didn't make (e.g. a stale counter).
//   AHMA_TOKEN=<admin token> node tools/inspect-penalty.js [nicknameSubstring=Lasse] [baseUrl]
// Token = localStorage "ahma.authToken" from the signed-in admin app.

const zlib = require("zlib");

const NEEDLE = (process.argv[2] || "Lasse").toLowerCase();
const base = process.argv[3] || "https://gamezone.kiekko-ahma.fi";
const token = process.env.AHMA_TOKEN;

(async () => {
  if (!token) { console.error('Set AHMA_TOKEN (localStorage "ahma.authToken" from the signed-in admin app).'); process.exit(1); }
  console.log(`Fetching backup from ${base} … (read-only; writes only a backup blob)`);
  const r = await fetch(`${base}/api/exportBackup?download=1`, { headers: { "X-Ahma-Auth": token } });
  if (!r.ok) { console.error(`exportBackup ${r.status}: ${await r.text()}`); process.exit(1); }
  const gz = Buffer.from(await r.arrayBuffer());
  const snap = JSON.parse(zlib.gunzipSync(gz).toString("utf8"));
  const T = snap.tables || {};

  const managers = (T.AhmaliigaManagers || []).filter((m) => (m.nickname || "").toLowerCase().includes(NEEDLE) || String(m.partitionKey).toLowerCase().includes(NEEDLE));
  if (!managers.length) { console.log(`No manager matching "${NEEDLE}".`); process.exit(0); }

  for (const m of managers) {
    const uid = m.partitionKey;
    console.log(`\n===== ${m.nickname || uid} ${m.isBot ? "(BOT)" : ""}  userId=${uid} =====`);

    // current squad row — the stored transfer counter that settlement reads
    const sq = (T.AhmaliigaSquads || []).find((s) => s.partitionKey === uid && s.rowKey === "current");
    if (sq) {
      let cards = []; try { cards = JSON.parse(sq.cards || "[]"); } catch {}
      console.log(`  squad(current): roundNo=${sq.roundNo}  transfersUsedThisRound=${sq.transfersUsedThisRound}  cards=${cards.length}  bank=${sq.bank}`);
      console.log(`    → penalty at settle = 5 × max(0, ${sq.transfersUsedThisRound} − 2) = ${5 * Math.max(0, (Number(sq.transfersUsedThisRound) || 0) - 2)} (ONLY applied to round ${sq.roundNo})`);
    } else console.log("  squad(current): none");

    // every settled Scores row for this manager
    const scores = (T.AhmaliigaScores || []).filter((s) => s.rowKey === uid)
      .map((s) => ({ round: Number(String(s.partitionKey).split("|")[1]), total: Number(s.total) || 0, penalty: Number(s.penalty) || 0, breakdown: s.breakdown }))
      .sort((a, b) => a.round - b.round);
    console.log(`  settled rounds: ${scores.length}`);
    for (const s of scores) {
      let bd = {}; try { bd = JSON.parse(s.breakdown || "{}"); } catch {}
      const tp = bd._transfers != null ? bd._transfers : 0;
      const flag = s.penalty ? `  ⚠ PENALTY -${s.penalty}` : "";
      console.log(`    jakso ${s.round + 1}: total ${s.total}  penalty ${s.penalty}  breakdown._transfers ${tp}${flag}`);
    }

    // Squad-edit audit log (AhmaliigaSquadLog, PK = seasonId|userId) — the exact edit
    // sequence, so a future transfer dispute is checkable (empty for edits before the
    // log existed). Shows added/removed cards + the running transfer counter per save.
    const log = (T.AhmaliigaSquadLog || []).filter((l) => String(l.partitionKey).endsWith(`|${uid}`))
      .sort((a, b) => String(a.rowKey).localeCompare(String(b.rowKey)));
    if (log.length) {
      console.log(`  squad edits logged: ${log.length}`);
      for (const l of log) {
        let add = [], rem = []; try { add = JSON.parse(l.added || "[]"); } catch {} try { rem = JSON.parse(l.removed || "[]"); } catch {}
        const parts = [];
        if (add.length) parts.push("+[" + add.map((x) => String(x).replace(/^[TP]:/, "")).join(", ") + "]");
        if (rem.length) parts.push("−[" + rem.map((x) => String(x).replace(/^[TP]:/, "")).join(", ") + "]");
        console.log(`    ${String(l.ts).slice(0, 19).replace("T", " ")}  jakso ${Number(l.round) + 1}  ${parts.join(" ") || "(kapteeni/tallenna)"}  used=${l.transfersUsedThisRound} sakko=${l.penaltyNow}`);
      }
    } else console.log("  squad edits logged: 0 (edits predate the audit log)");
  }
  console.log("\n(Read-only — no game data changed. A -5 on a round where the manager made no extra transfers = a stale transfersUsedThisRound counter.)");
  process.exit(0);
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
