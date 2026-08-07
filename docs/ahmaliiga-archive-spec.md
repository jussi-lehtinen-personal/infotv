# Ahmaliiga — Season Archive & History (spec)

**Status:** DRAFT for review (2026-08-07). Decided model: *single active season in the DB;
completed seasons are exported to a file and purged from the hot store; history is read
from those archive files on demand.*

## 1. Principle & why

The DB holds **exactly one active season** at a time. When a season ends it is **archived**
(exported to a single blob) and **purged** from Table Storage. History pages read the archive
blobs — cold data, off the hot path.

Why this over "keep every season in the DB, season-scope everything":
- **Runtime stays trivial.** Code always means "the one season". No season-id threaded through
  every read/write; the *global* managers/squads model (`PK = userId`) becomes *correct*,
  because there is only ever one season live and it's cleared at rollover.
- **History is genuinely cold** (looked at rarely) → files are ideal: cheap, no hot-store bloat.
- **Reuses existing infra.** `api/src/lib/backup.js` already snapshots every table → gzipped
  blob (+ `blob.js` container helpers). The archive is the same pattern, scoped to one season.

Non-goals: live cross-season queries; re-activating an archived season in place; editing history.

## 2. What is season-scoped vs global (today)

Season-scoped (`PK = seasonId` or `seasonId|…`) — archived by filtering on the id:
`AhmaliigaCards, AhmaliigaRounds, AhmaliigaCardHistory, AhmaliigaScores, AhmaliigaSeasonScores,
AhmaliigaResults, AhmaliigaGames, AhmaliigaPredictions, AhmaliigaLineups, AhmaliigaRosters`
+ the `AhmaliigaSeason` rows (`PK='season'` rowKey=id, and `PK='seasonMeta'` rowKey=id).

Global (`PK = userId`) — a snapshot of the *participants* is copied into the archive, then
cleared at purge: `AhmaliigaManagers, AhmaliigaSquads`.

Transient/global (cleared at rollover, not archived): `AhmaliigaVouchers, AhmaliigaMessages,
AhmaliigaNotifyLog, AhmaliigaPushSubs` (push subs may be kept — see open questions).

## 3. Archive format

One **gzipped JSON blob per season**: container `ahmaliiga-archives`, name `<seasonId>.json.gz`.

```jsonc
{
  "seasonId": "2027-preseason",
  "name": "Pre-season 2026-27",
  "archivedAt": "<ISO>",              // stamped by the caller, not in-script
  "season": { /* the AhmaliigaSeason row */ },
  "seasonMeta": { /* priorIndex etc., if any */ },
  "tables": {                          // raw rows, keyed by table name
    "AhmaliigaCards": [ ... ],
    "AhmaliigaSeasonScores": [ ... ],
    "AhmaliigaManagers": [ ... ],      // only participants (see §5)
    "AhmaliigaSquads": [ ... ],
    ...
  },
  "summary": {                         // DENORMALIZED for cheap history reads
    "champion": { "userId", "nickname", "points" },
    "finalTop": [ { "rank", "userId", "nickname", "points" } ],   // full final ranking
    "topCards": [ { "cardId", "name", "kind", "seasonPts" } ],    // best cards
    "rounds": <n>, "managers": <n>, "startDate", "endDate"
  }
}
```

The **`summary`** block is the key idea: history views render from it WITHOUT parsing the raw
tables (raw tables are kept for completeness / career-stat aggregation). Denormalize nicknames
into `finalTop`/`champion` so a purged global-managers table doesn't lose the names.

## 4. Actions (admin, env-gated in `manageAhmaliiga`)

- **`archiveSeason` `{ seasonId }`** → build the blob above, upload, return `{ ok, blob, summary }`.
  Idempotent (overwrites the season's blob). Does NOT purge. Safe to run anytime (read-only on DB).
- **`purgeSeason` `{ seasonId, clearGlobals?: bool }`** → delete every season-scoped partition
  for `seasonId` + the season/seasonMeta rows. If `clearGlobals`, also delete `AhmaliigaManagers`
  + `AhmaliigaSquads` (rollover). **Guards:** refuse unless an archive blob for `seasonId` exists;
  refuse if `seasonId` is the ACTIVE season unless `force`; return a dry-run count first.
- **`listArchives`** → list blobs + their `summary` (for the history index).
- **`rolloverSeason` `{ toSeed }`** (convenience) = `archiveSeason(active)` → `purgeSeason(active,
  clearGlobals:true)` → `seedSeason(toSeed)`. One button for "end this season, start the next".

## 5. Global managers/squads at rollover

`archiveSeason` snapshots the CURRENT global `AhmaliigaManagers` + `AhmaliigaSquads` into the
archive (they belong to the ending season, since only one is live). `purgeSeason(clearGlobals)`
then deletes them → the next season starts with **0 managers / 0 squads**. This is what makes
"each season a fresh set of managers" true — and it subsumes the old `resetAll` question.

Users/accounts (`Users`, `Credentials`) are never touched — only the fantasy participation rows.

## 6. History read-path

- **`getArchivedSeasons`** (public GET) → `listArchives` summaries → the "menneet kaudet" index.
- **`getArchivedSeason` `{ seasonId }`** (public GET) → one archive's `summary` (+ optionally raw
  on demand) → a read-only season page (final ranking, champion, best cards). Cache hard (cold).
- **Career stats** (`getManagerCareer` / `getCardCareer`): aggregate across archive `summary`
  blocks (a manager's seasons played, titles, best/avg rank, total points; a card's history).
  Small N of archives → compute on read, or maintain a rolled-up `careers.json` index updated on
  each `archiveSeason`.

## 7. History views (UI, later phase)

- **Menneet kaudet** — list of archived seasons (name, champion, #managers) → tap → season page.
- **Season page** — final Top-N ranking, **Mestari** highlight, best cards. From `summary`.
- **Mestarit-galleria** — champions across seasons (one row per archive).
- **Ura** — a manager's career card (seasons, titles, best rank). From career aggregation.

## 8. Phasing

- **Phase A (MVP, the mechanism):** `archiveSeason` + `purgeSeason` (+ guards) + `listArchives`.
  Verify by archiving 2026 (+ the orphan `2027`) and purging → DB left with one clean season.
- **Phase B (read):** `getArchivedSeasons` / `getArchivedSeason` + the menneet-kaudet + season
  page (renders `summary`).
- **Phase C (career/champions):** cross-archive aggregation + Mestarit-galleria + Ura view.
- **Phase D (nice-to-have):** `rolloverSeason` one-button + admin UI for it.

## 9. Launch sequencing (pre-season 12.8)

Archive is **NOT a launch blocker.** The pre-season opens 12.8 on the interim rule — *a manager
counts only once it has a valid squad (≥2 team cards) that has played a game* — so the 46 stale
2026 managers never show. Build the archive deliberately (Phase A→B) for the real season rollover;
it's the tool that will cleanly retire the pre-season into the real 2026-27 season.

## 10. Open questions

1. **Blob store:** reuse the existing backups container (new prefix) or a dedicated
   `ahmaliiga-archives` container? (Lean: dedicated container, clearer lifecycle.)
2. **Push subs** (`AhmaliigaPushSubs`): keep across seasons (a device stays subscribed) or clear?
   (Lean: keep — subscription is device-level, not season participation.)
3. **Raw tables in the archive:** store all raw rows (full fidelity, bigger blob) or only what
   career stats need? (Lean: store raw — blobs are cheap, and it future-proofs new history views.)
4. **Restore:** do we ever need to re-import an archive into the DB (debug/dispute), or is
   read-from-blob enough? (Lean: add a read-only `getArchivedSeason`; a full restore is a later
   admin tool if ever needed — `backup.js restore()` already exists as a pattern.)
