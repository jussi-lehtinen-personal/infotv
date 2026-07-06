# Kiekko-Ahma Gamezone / InfoTV

Valkeakosken Kiekko-Ahman React-sovellus. Yksi koodikanta palvelee kahta käyttötapausta:

- **Gamezone** — asennettava mobiili-PWA seuran jäsenille/faneille: ottelut, tulokset, box score, jäävuorot, joukkuesivut, henkilökohtainen "Minä"-feed, tilit (passkey/Google), admin.
- **InfoTV** — jäähallin näytön kioskisivu (`/this_week`, fullscreen-landscape). Näyttää kotiottelut ja jäävuorot. **Ei saa muuttaa graafisesti** (landscape-invariantti).

Hostataan **Azure Static Web Apps** -palvelussa. Domainit: `gamezone.kiekko-ahma.fi` (PWA) ja `info.kiekko-ahma.fi` (InfoTV) — sama build, jaettu Hostin perusteella.

## Arkkitehtuuri

```
Frontend (CRA/React 18 SPA)
  src/pages/            sivut (gamezone, feed, teams, game=box score, admin, this_week=InfoTV, ...)
  src/components/ui/    jaettu komponenttikirjasto (Surface, PageHeader, Buttons, NavDrawer, ...)
  src/lib/              seasonGamesCache, agenda, teamMatch, subGroups
  src/auth/             authClient (passkey/Google, favourites-synkka)
  src/theme.js + index.css   tokenit (--color-primary-rgb johtaa värit)

Backend
  api/                  Azure Functions (SWA managed) — auth, me, admin, box score, feed-proxy, backups
  worker/               Cloudflare Worker — tulospalvelu-client (WAF estää Azuren → worker hakee)
  swa-db-connections/   (ei aktiivisessa käytössä)
```

**Dataflow:** React → Azure Functions → (Cloudflare Worker →) tulospalvelu.leijonat.fi · Jopox (kiekko-ahma.fi) · Tilamisu · Azure Table/Blob Storage.

### Tietolähteet — mistä mikäkin tulee

| Tarve | Lähde | Missä |
|---|---|---|
| Seuran joukkuelista (Edustus, U20…U9) | **Jopox** (staattinen) | `src/data/jopoxTeams.js` (toimii ympäri vuoden; EI tulospalvelun getTeams joka on tyhjä kesällä) |
| Pelit / tulokset / sarjataulukot | **tulospalvelu** Cloudflare Workerin kautta | `api/getGames`, `getSeasonGames`; `worker/src/index.js` (WAF estää Azuren suorat) |
| Box score / ottelupöytäkirja | **tulospalvelu** workerin kautta | `api/getGameReport` |
| Kokoonpanot / toimihenkilöt / joukkueuutiset / kuvat | **Jopox** (kiekko-ahma.fi) | `api/getTeamEvents`, `getOrganisation`, `getPartners` |
| Jäähallivaraukset / jäävuorot | **Tilamisu** | `api/getReservations` (location 836) |
| Tilit / roolit / asetukset / passkeyt | **Azure Table Storage** (`gamezonestore`) | `api/src/lib/tables.js` (`Users`, `Credentials`, `GoogleIndex`, `Usernames`) |
| Profiilikuvat | **Azure Blob** (`gamezonestore`) | `avatars`-container |
| Uutiset / kannattajat | repo-JSON | `public/gamezone-news.json`, `public/supporters.json` |

## Repo-rakenne

```
src/            React-frontend
api/            Azure Functions (SWA managed API)  — myös api/scripts/restore-backup.mjs
worker/         Cloudflare Worker (tulospalvelu-proxy)
public/         staattiset tiedostot, manifest, ikonit, sisältö-JSONit
.github/workflows/
  azure-static-web-apps-*.yml   frontend + api deploy (SWA)
  deploy-worker.yml             worker deploy (wrangler)
  backup.yml                    päivittäinen datan varmuuskopio (cron)
```

## Kehitys

```bash
npm install
cd api && npm install && cd ..
```

**Pelkkä frontend** (mock-data): aseta `src/Util.js` → `var dev = true`, sitten `npm start` → http://localhost:3000

**Koko stack** (frontend + API SWA CLI:llä):
```bash
npm start                                   # terminaali 1
npx swa start http://localhost:3000 --api-location api   # terminaali 2 → http://localhost:4280
```

**Worker** (paikallinen): `cd worker && npx wrangler dev`

> Huom: CRA-pilvibuild ajaa `CI=true` → **ESLint-varoitukset ovat virheitä**. Tarkista ennen pushia: `CI=true npx --no-install eslint <tiedosto>`.

## Build & deploy

```bash
npm run build        # → build/ (sisältää service workerin / PWA)
```

- **Frontend + API** deployautuvat automaattisesti mainiin pushatessa (SWA GitHub Action). Molemmat samaan SWA-resurssiin.
- **Worker** deployautuu erikseen kun `worker/`-kansio muuttuu (`deploy-worker.yml`, wrangler). `wrangler.toml`:n `name = "gamezone"` pitää säilyä. Worker on totuuden lähde tulospalvelulle; **sitä ei lintata**.
- **SWA varaa `/api/admin*`-prefiksin** → managed-funktion reitti ei saa alkaa "admin" (404). Käytä esim. `manageUsers`.

## Ympäristömuuttujat (SWA App settings)

| Muuttuja | Selitys |
|---|---|
| `TABLES_CONNECTION_STRING` | Azure Storage (`gamezonestore`) — taulut + blobit |
| `JWT_SECRET` | sovelluksen app-JWT allekirjoitus |
| `RP_ID`, `RP_ORIGIN` | WebAuthn (passkey) relying party |
| `GOOGLE_CLIENT_ID` | Google-kirjautuminen |
| `ADMIN_USER_IDS` | pilkulla eroteltu admin-allowlist (bootstrap) |
| `BACKUP_KEY` | varmuuskopio-endpointin jaettu salaisuus (myös GitHub repo -secretiksi) |
| `TP_PROXY_URL`, `TP_PROXY_KEY` | Cloudflare Worker -osoite + valinnainen jaettu avain |

Worker: KV-binding `GAME_IDS` (id-resolvoinnin cache) + `PROXY_KEY` (secret).

## Käyttäjät & tunnistautuminen

- Tilit: **passkey-first** (WebAuthn) + valinnainen **Google-linkitys** monilaitekäyttöön. App-JWT + Azure Table Storage. Ei ulkoista auth-palvelua.
- Suosikkijoukkueet ovat **tilikohtaisia** (synkkaavat tiliin), näkyvät vain kirjautuneille.

## Admin

`/admin` (näkyy NavDrawerissa vain admineille; gate = `ADMIN_USER_IDS` **tai** datarooli `admin`):
- **Käyttäjät & roolit** (`/admin/users`) — merkitse käyttäjiä: pelaaja/valmentaja/toimihenkilö (joukkuesidotut) · media · admin.
- **Tilastot** (`/stats`) — rekisteröityneiden käyttäjien metriikat.
- **Varmuuskopiot** (`/admin/backups`) — ks. alla.

## Varmuuskopiot & palautus

Kriittinen data on Azure **Table Storagessa** (`Users`, `Credentials`, `GoogleIndex`, `Usernames`) ja **Blobissa** (`avatars`). **Table Storagessa ei ole natiivia point-in-time-restorea eikä soft-deletea**, joten varmuuskopiot otetaan itse.

### Miten se toimii

- **`POST /api/exportBackup`** dumppaa kaikki taulut → gzip-JSON → `backups`-Blob-container (`gamezonestore`). Auth: `x-backup-key`-header (= `BACKUP_KEY`) **tai** kirjautunut admin. `?download=1` palauttaa tiedoston.
- **Päivittäinen cron** (`.github/workflows/backup.yml`, 02:00 UTC) kutsuu endpointtia ja tallentaa gzipin myös **GitHub-artefaktiksi** (90 pv, tilin ulkopuolinen kopio).
- **GFS-retentio** (`api/src/lib/backup.js`): 14 päivittäistä + 8 viikoittaista + 6 kuukausittaista, loput siivotaan.
- **Admin-näkymä** `/admin/backups`: viimeisin varmuuskopio, määrä, lista + "Luo nyt".
- Kaikki taulusarakkeet ovat merkkijonoja/lukuja (passkey-avaimet base64url) → **JSON round-trippaa häviöttä** (testattu: 35/35 riviä identtisinä).

### Kertaluontoinen setup

1. **`BACKUP_KEY`** — vahva satunnaisarvo (esim. `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`), lisää **sekä** Azure SWA App settings **että** GitHub repo → Settings → Secrets → Actions.
2. **Blob soft-delete + versiointi** päälle `gamezonestore`-tilille:
   ```bash
   az storage account blob-service-properties update --account-name gamezonestore \
     --enable-delete-retention true --delete-retention-days 30 --enable-versioning true
   ```

### Palautus (restore)

1. **Hae backup-tiedosto** (`.json.gz`) jommastakummasta:
   - `backups`-Blob-container (Azure Portal Storage browser tai `az storage blob download`), **tai**
   - GitHub Actions → *Daily data backup* -ajo → lataa `ahma-backup-*`-artefakti.
2. **Kuivaharjoitus** (ei kirjoita mitään) — tulostaa rivimäärät:
   ```bash
   cd api
   TABLES_CONNECTION_STRING="<tilin-connection-string>" node scripts/restore-backup.mjs backup.json.gz
   ```
3. **Aja oikeasti** — upsert (luo/ylikirjoittaa) kaikki rivit takaisin:
   ```bash
   TABLES_CONNECTION_STRING="<tilin-connection-string>" node scripts/restore-backup.mjs backup.json.gz --apply
   ```

Huomioita:
- `upsert` **ei poista** rivejä jotka ovat kohteessa mutta puuttuvat backupista (palauttaa backupin päälle, ei peilaa).
- **Testaa aina ensin scratch-tiliin** (esim. paikallinen Azurite: `azurite-table`) ennen tuotantoa.
- **Koko tilin katastrofi:** luo uusi storage-tili → restore siihen → päivitä SWA:n `TABLES_CONNECTION_STRING` osoittamaan uuteen.
- `connection string` = sama arvo kuin SWA:n `TABLES_CONNECTION_STRING`.

## PWA

Asennettavissa ("Lisää aloitusnäytölle" / selaimen asennusikoni). Service worker: NetworkFirst-navigaatio + `skipWaiting` (deploy ei jätä appia mustaksi). OS-splash tulee manifestista (ei omaa in-app-splashia); ikonit `public/ahma_logo.png`.
