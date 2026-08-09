#!/usr/bin/env node
/**
 * Smoke test for the Microsoft 365 (Graph) office-room integration. Run this the
 * FIRST time the M365 side is wired up (secret in place + admin consent granted) to
 * confirm the token works and the app can read/write the Wareena room calendar —
 * before touching the UI.
 *
 * It loads the four GRAPH_* / TOIMISTO_ROOM_UPN settings from api/local.settings.json
 * (gitignored) into process.env, then exercises api/src/lib/graph.js.
 *
 *   node tools/graph-probe.js              # token + list the room's next 14 days
 *   node tools/graph-probe.js --roundtrip  # also create a throwaway event, then delete it
 *
 * Node 18+ (global fetch). Read-only unless --roundtrip is passed.
 */
const fs = require('fs');
const path = require('path');

// Pull Graph settings from api/local.settings.json into the environment.
try {
  const p = path.join(__dirname, '..', 'api', 'local.settings.json');
  const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
  for (const [k, v] of Object.entries(cfg.Values || {})) {
    if (/^GRAPH_|^TOIMISTO_ROOM_UPN$/.test(k) && !process.env[k]) process.env[k] = v;
  }
} catch (e) {
  console.error('Could not read api/local.settings.json:', e.message);
}

const graph = require('../api/src/lib/graph');

const MAILBOX = process.env.TOIMISTO_ROOM_UPN || '';
const pad = (n) => String(n).padStart(2, '0');
const dstr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

async function main() {
  const roundtrip = process.argv.includes('--roundtrip');
  console.log('Config present:', graph.graphConfigured() ? 'yes' : 'NO — missing GRAPH_* / TOIMISTO_ROOM_UPN');
  console.log('Room mailbox:', MAILBOX || '(none)');
  if (!graph.graphConfigured()) process.exit(1);

  console.log('\n1) Requesting app-only token…');
  await graph.getToken();
  console.log('   ✓ token acquired');

  const from = dstr(new Date());
  const to = dstr(new Date(Date.now() + 14 * 24 * 3600 * 1000));
  console.log(`\n2) Reading calendar ${from} … ${to}`);
  const events = await graph.listCalendarView(MAILBOX, `${from}T00:00:00`, `${to}T23:59:59`);
  console.log(`   ✓ ${events.length} event(s):`);
  for (const ev of events) {
    const meta = graph.readMeta(ev);
    console.log(`   - ${ev.start && ev.start.dateTime} → ${ev.end && ev.end.dateTime}  "${ev.subject}"${meta ? '  [gamezone]' : ''}`);
  }

  if (roundtrip) {
    console.log('\n3) Round-trip: creating a throwaway event tomorrow 12:00–12:15…');
    const d = dstr(new Date(Date.now() + 24 * 3600 * 1000));
    const created = await graph.createEvent(MAILBOX, {
      subject: 'GameZone probe (delete me)',
      start: { dateTime: `${d}T12:00:00`, timeZone: 'Europe/Helsinki' },
      end: { dateTime: `${d}T12:15:00`, timeZone: 'Europe/Helsinki' },
      singleValueExtendedProperties: [graph.metaProperty({ ownerUserId: 'probe', ownerName: 'Probe' })],
    });
    console.log('   ✓ created id:', created.id);
    await graph.deleteEvent(MAILBOX, created.id);
    console.log('   ✓ deleted — write access confirmed');
  }

  console.log('\nDone. ✓');
}

main().catch((e) => { console.error('\n✗ FAILED:', e.message); process.exit(1); });
