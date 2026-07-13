# Ahmaliiga — toteutussuunnitelma (backend + frontend)

Master-plan koko pelistä. Pohjana `ahmaliiga-features.md` (feature-lista),
`project_ahmaliiga_plan` (kalibroidut design-päätökset), lopullinen 12+6 näytön
lista + konseptikuvat (`ahmaliiga_konseptit.png`, `joukkue_layout.png`).
Pelilukemat on jo lukittu backtestillä → tässä ei kalibroida, vaan rakennetaan.

---

## 0. Lähtökohdat (LUKITTU)
- **Genre:** fantasy "kortisto" -manageri. Joukkuekortit (kaikki ikäluokat) = ydin,
  **U18+ pelaaja-/maalivahtikortit** = mauste (mukana v1:ssä). Ei positioita.
- **Talous:** budjetti **120 Ahma-coinia** 🪙, **5 korttia**, **max 2 pelaajakorttia**,
  joukkuebändit 30/20/10, pelaajabändit 50/40/30, **kapteeni 2×**.
- **Rakenne:** **2 vk jaksot** + **kausi kumulatiivinen** → 2 leaderboardia. **Rullaava
  lukitus (per-peli, EI yhtä jakso-deadlinea)** — pakkaa saa muokata koska tahansa, ja
  jokainen peli pisteytyy sillä pakalla+kapteenilla joka oli voimassa sen pelin alkaessa
  (ks. §4a). ≤2 siirtoa/jakso. **FPL lock-in** (osto lukitsee hinnan). **Dynaaminen
  hinnoittelu** = uudelleenbändäys jakson vaihteessa rullaavan muodon mukaan (diskreetit
  bändit → arvonnousu tarkoituksella rajattu). **Alkuhinnat edellisen kauden statseista.**
- **Pisteytys:** joukkue voitto 3/tasa 1/tappio 0/nollapeli +2/maaliero +0.5 cap 2;
  pelaaja maali 3/syöttö 2; mv voitto 3/nollapeli +2/torj% ≥92 +2/≥95 +3 (aikaperustainen
  GA). Veikkausbonus voittaja +1/maaliero +2/tarkka +3.
- **Backend = Azure Table Storage** (viimeinen backend; varmuuskopiot kattavat uudet
  taulut automaattisesti). **Identiteetti = userId** (device-id + optio Google, OLEMASSA).
- **UI-proto rakennettu** (gated `isEnvAdmin`): AhmaliigaLayout + 5 näyttöä + stubit.
- **Julkaisu:** pre-season-hinnoittelu → **beta harjoituspeleissä** (kaikki koneisto,
  matala panos) → lopullinen kalibrointi → oikea käynnistys runkosarjan alussa.

## 1. Arkkitehtuuri
```
React SPA  ──/api/*──►  Azure SWA Functions  ──►  Azure Table Storage
(AhmaliigaLayout)       (CRUD, JWT userId)         (Ahmaliiga-taulut + jaetut)
      │                        ▲
      │                        │ settlement lukee
      ▼                        │
 (näyttää tilan)     Cloudflare Worker ──► tulospalvelu (durable KV-cache)
                     (getSeasonGames, getGameReport — EI uusia skannauksia)

Settlement = key-gated /api/runSettlement, laukaisu GitHub Actions cronilla
(sama malli kuin backups; SWA managed functions = vain HTTP, ei timer-triggeriä).
```
- **Kirjoitukset** (squad/veikkaus) validoidaan palvelimella (budjetti, slotit, lukitusaika).
- **Settlement** on ainoa "raskas" osa: lukee jo-cachetun tulospalvelun → laskee pisteet →
  kirjoittaa Scores + CardHistory-snapshotit + emittoi notifikaatiot. Yksi jaettu poller
  palvelee myös #23 pistepörssiä / #28 liveä / #1-pushia.

## 2. Datamalli (Table Storage)
Avaimet valittu niin että kaikki kuumat polut ovat point- tai partition-scan-hakuja.

| Taulu | PK | RK | Keskeiset sarakkeet | Feature |
|---|---|---|---|---|
| `Managers` | userId | `profile` | nickname(cache), joinedSeason, seasonsPlayed, titles, bestRank, avgRank | F1.2, F7.4 |
| `Season` | `season` | `<seasonId>` | active, name, startDate, endDate, currentJakso | F2.1 |
| `Jaksot` | `<seasonId>` | `<jaksoNo>` | lockAt, startDate, endDate, predictGameId, status(open/locked/settled) | F2.2, F5 |
| `Cards` | `<seasonId>` | `<cardId>` | kind(team/player/goalie), name, sub, teamKey/personRef, band, price, ownerCount, lastPts, form | F3.1–3.6 |
| `CardHistory` | `<seasonId>\|<cardId>` | `<jaksoNo>` | price, band, pts, ownerCount, ownerPct | F3.7 |
| `Squads` | userId | `current` | **NYKYPAKKA, ylikirjoitetaan joka muutoksella** (10 siirtoa → 1 rivi): seasonId, jaksoNo, cards[5]{cardId,buyPrice}, captainId, transfersUsedThisJakso, updatedAt | F4, §4a |
| `Lineups` | userId | `<alkuaikaISO>` | **JÄÄDYTETTY snapshot pelin alkuhetkellä:** cards[5], captainId. Avain per manageri+alkuaika → samaan aikaan alkavat pelit jakavat yhden rivin; settlement lukee managerin kaikki lineupit yhdellä haulla. Peli(alku T) → (userId, T) | §4a |
| `Predictions` | `<seasonId>\|<jaksoNo>` | userId | gameId(jakson tuleva peli), homeGoals, awayGoals, lockedAt(=pelin alku) | F5 |
| `Scores` | `<seasonId>\|<jaksoNo>` | userId | total, breakdown{cardId→pts, captainBonus, predictBonus}, rank | F6, F7 |
| `SeasonScores` | `<seasonId>` | userId | total, jaksot[], rank | F7.1 (kausi) |
| (opt) `Achievements` | userId | `<code>` | earnedAt, season | F7.5 |

Jaetut (rakennetaan kerran) 🔗:
| `Messages` | userId | `<ts>` | type, title, body, read, link | #1 / F8 |
| `PushSubs` | userId | `<endpointHash>` | subscription | #1 |
| `Votes` | `<targetId>` | userId | choice | #9/#10/#11/#33 / F9 |
| `Vouchers` | userId | `<voucherId>` | prize, status, ETag-atominen | #12 / F10 |

Identiteetti (`Users`/`Credentials`) ja varmuuskopiot = OLEMASSA.

## 3. Backend-endpointit (API-pinta)
SWA-sääntö: route EI ala "admin" (varattu) → admin-toiminnot esim. `manageAhmaliiga`.

**Luku / config**
- `GET /api/ahmaliiga/state` — nykyinen kausi+jakso, deadline, oma sijoitus+pisteet (dashboard).
- `GET /api/ahmaliiga/cards?filter=` — kortisto (hinta, viime pisteet, omistus-%, muoto).
- `GET /api/ahmaliiga/card/:id` — kortin tiedot (historia, tulevat pelit, hintakehitys).
- `GET /api/ahmaliiga/ranking?scope=jakso|kausi` — leaderboard.
- `GET /api/ahmaliiga/summary/:jakso` — jakson yhteenveto (breakdown).
- `GET /api/ahmaliiga/profile/:userId?` — profiili-statsit + saavutukset.

**Kirjoitus (auth, palvelinvalidointi)**
- `POST /api/ahmaliiga/join` — liity (luo Manager).
- `PUT  /api/ahmaliiga/squad` — tallenna kokoonpano (validointi: budjetti/slotit/lukitus).
- `POST /api/ahmaliiga/transfer` — siirto (≤2/jakso, myynti nykyhintaan).
- `PUT  /api/ahmaliiga/captain` — aseta kapteeni.
- `PUT  /api/ahmaliiga/prediction` — tallenna veikkaus (lukittuu deadlineen).

**Admin (key/rooli-gated)** — F11: jaksot, hinnat, uudelleenlaskenta, veikkausotelu, resetointi.
**Sisäinen** — `POST /api/runSettlement` (BACKUP_KEY-tyylinen avain, GitHub cron).

## 4. Settlement, hinnoittelu & snapshotit (jobit)
**Settlement (pelien valmistuttua; ajetaan jaksoittain, voi ajaa myös kesken jakson valmiille peleille):**
1. Lue jakson Ahma-pelit worker-cachesta (getSeasonGames + tarvittavat getGameReport — jo cachetut). Jokaisella pelillä on alkuaika T.
2. Laske jokaisen kortin pisteet per peli (F6.1/6.2), tallenna per kortti.
3. Jokaiselle managerille (lue kaikki `Lineups` yhdellä haulla): per jakson peli poimi (userId, pelin alku T) -snapshot (§4a) → summaa sen kortit + snapshotin kapteeni 2×; lisää jakson veikkausbonus → `Scores`.
4. Päivitä `SeasonScores` (kumulatiivinen) + sijoitukset.
5. Kirjoita `CardHistory`-snapshot (hinta+pisteet+omistus-% tästä jaksosta).
6. Emittoi notifikaatiot (`Messages`): kapteeni teki maalin, joukkue voitti, veikkaus osui.
7. **Reband hinnat** seuraavalle jaksolle rullaavan muodon mukaan → `Cards.price/band`.
8. Merkitse jakso `settled`, avaa seuraava jakso.

**Pre-season prior:** aja `buildPrevPrior`-logiikka (edellisen kauden statsit) → alkuhinnat.
**Uudelleenlaskenta:** sama flow admin-triggerinä (idempotentti — ylikirjoittaa jakson).

## 4a. Lukitusmalli — rullaava per-peli, snapshot-per-peli (TÄRKEÄ)
Ei yhtä jakso-deadlinea. **Kunkin pelin "deadline" = sen alkamisaika.** Malli = *nykypakka
(ylikirjoitettava) + peli jäädyttää snapshotin alkaessaan* — helpompi lukea kuin
muutosloki (ei aikajana-laskentaa) ja monta peräkkäistä siirtoa tiivistyy yhteen kuvaan.
- **Nykypakka** (5 korttia + kapteeni) = **yksi `Squads`-rivi joka ylikirjoitetaan** joka
  muutoksella. 10 siirtoa peräkkäin → silti 1 rivi (viimeisin tila).
- **Kun peli alkaa, jäädytetään `Lineups`-snapshot** avaimella (userId, pelin alkuaika) —
  managerin sen hetken pakka + kapteeni. **Samaan aikaan alkavat pelit jakavat saman rivin**
  (ei duplikaattia). Settlement lukee snapshotin **suoraan** (peli alku T → (userId, T)) →
  ei tarvitse arpoa mikä pakka oli, ja managerin kaikki lineupit tulevat yhdellä haulla.
- Näin tiistain peli säilyttää tiistain pakan; keskiviikon muutos näkyy vain viikonlopun
  peleissä (ne jäädyttävät uuden tilan). Kapteeni jäädytetään samassa snapshotissa.
- **Jäädytys:** poller jäädyttää pelin alkaessa; **lazy-freeze varmistuksena** — jos manageri
  muokkaa pakkaa juuri alkaneen mutta vielä jäädyttämättömän pelin jälkeen, API jäädyttää
  sen pelin vanhalla pakalla ENNEN muutoksen tallennusta. → snapshot vastaa aina pelin alkuhetkeä.
- **Osto** = maksat sen hetken bändihinnan (lock-in). Peli ei pisteytä kortille jota ei ollut
  snapshotissa (esim. ostettu pelin alun jälkeen).
- **Siirtoraja ≤2/jakso** (`transfersUsedThisJakso`); budjetti + slotit + max 2 pelaajakorttia
  validoidaan joka muutoksella.
- **Veikkaus** noudattaa samaa: vain **tulevaan** (ei-alkaneeseen) jakson peliin, lukittuu
  pelin alkaessa. Yksi veikkaus/jakso.

**Limittäiset / samanaikaiset pelien alut (invariantti):** snapshot = pakka *pelin
alkuhetkellä*. Tämä pitää kun: **(1) jäädytys pelin OMALLA alkuajalla, (2) insert-once**
(jos `Lineups`-rivi (userId, T) on jo, EI ylikirjoiteta), **(3) lazy-freeze joka
muokkauksella** jäädyttää kaikki managerin jo alkaneiden mutta jäädyttämättömien pelien
alkuajat *muutosta edeltävällä* pakalla. Näin peli A (14:00) säilyttää 14:00-pakan vaikka B
(14:15) alkaisi limittäin ja polleri olisi karkea (jäädyttäisi molemmat vasta 14:30). Eri
alkuaika = eri rivi; sama alkuaika = jaettu rivi. Sama kortti = yksi joukkue/henkilö → yksi
peli kerrallaan, joten limittäisistä peleistä EI tuplalaskentaa (manageri voi silti omistaa
kortteja useassa yhtaikaisessa pelissä; kukin pisteytyy omillaan samasta snapshotista).

**Kauppa:** `Lineups`-rivi/manageri per distinct alkuaika → O(managerit × alkuajat) pientä
riviä/kausi, Table Storagelle mitätön. Jäädytetään liittyneille managerille (tai vain kortin
kyseisessä pelissä omistaville, jos lisätään omistus-indeksi myöhemmin).

## 5. Frontend-näytöt (12 + admin 6)
Proto (mock) = ✅ rakennettu; "wire" = kytke endpointtiin.
1. **Dashboard** ✅ proto → wire `state` + `ranking(top5)` + viime-`Messages`.
2. **Oma joukkue** ✅ proto → wire `squad` + `cards`.
3. **Muokkaa joukkuetta** — uusi näyttö: vaihda/poista kortti, valitse kapteeni; `PUT squad`/`transfer`/`captain`.
4. **Korttimarkkina** ✅ proto → wire `cards?filter=`.
5. **Kortin tiedot** — uusi: `card/:id` (historia/tulevat/hintakehitys).
6. **Veikkaa ottelu** ✅ proto → wire `state.predictGame` + `PUT prediction`.
7. **Ranking** ✅ proto → wire `ranking?scope=`.
8. **Jakson yhteenveto** — uusi: `summary/:jakso`; laukeaa automaattisesti settlementin jälkeen (modaali dashboardilla).
9. **Profiili** — uusi: `profile`.
10. **Saavutukset** — uusi: johdettu/`Achievements`.
11. **Säännöt** ✅ olemassa (`/ahmaliiga/saannot`).
12. **Ilmoitukset** — uusi: `Messages` (🔗 #1 inbox).
**Admin (6):** jaksojen hallinta, hintojen päivitys, uudelleenlaskenta, veikkausten hallinta,
push-viestit, kauden resetointi — MUI-lomakkeita `manageAhmaliiga`-endpointteihin.

## 6. Jaettu / cross-cutting 🔗
- **#1 Inbox/push** — Messages/PushSubs; Ahmaliiga tuottaa tapahtumat, inbox näyttää.
- **#9/#33 Tähtiäänestys** — Votes; voitettu tähti → bonus kortin omistajille.
- **#12 QR-palkinnot** — Vouchers (ETag-atominen); jakso/kausi top-3.
- **Identiteetti** — userId (device-id + optio Google), OLEMASSA.
- **Varmuuskopiot** — exportBackup kattaa uudet taulut automaattisesti.

## 7. Vaiheistus (milestonet)
- **M0 — Perusta:** Season/Jaksot/Cards/CardHistory + `state`/`cards`-luku + pre-season prior.
  Cardit generoidaan tulospalvelu-poolista. Snapshot-malli heti alusta.
- **M1 — Kokoaminen:** Squads + validointi + lukitus + `squad`/`captain`/`transfer` + wire näytöt 2/3.
- **M2 — Settlement:** poller + pisteytys + Scores/SeasonScores + Ranking + snapshotit + reband. Näytöt 7/8.
- **M3 — Veikkaus:** Predictions + bonus settlementiin. Näyttö 6.
- **M4 — Dashboard/profiili/saavutukset:** johdettua dataa. Näytöt 1/9/10.
- **M5 — Beta harjoituspeleissä:** koko koneisto oikeilla peleillä, gated laajemmalle betaryhmälle. Kerää käyttödataa.
- **M6 — Ilmoitukset 🔗 #1** kun inbox rakennetaan. **M7 — Tähtiäänestys + palkinnot 🔗.**
- **M8 — Admin-työkalut** rinnalla. **→ Lopullinen kalibrointi → gate pois → runkosarjan alku.**

## 8. Päätökset
LUKITTU (2026-07-13):
1. **v1 scope = pelaajakortit MUKAAN heti** (ei team-only-vaihetta). Beta harjoituspeleissä tukee (box scoret). → Cards-pooli sisältää joukkue+pelaaja+mv M0:sta.
2. **Veikkaus = mikä tahansa jakson Ahma-peli** (pelaaja valitsee; nuortenkin pelin TULOS on minors-turvallista veikata). → `Predictions.gameId` = mikä tahansa jakson peli, ei sidottu kapteeniin/pääotteluun.
3. **Pelaajakortin ikäraja = U18 ja vanhemmat** (Edustus + Naiset + U20 + U18). → Cards-generointi suodattaa pelaajakortit U18+ joukkueista. ⚠️ Sisältää alaikäisiä (16–17v U18/U20) — käyttäjän päätös; poikkeaa aiemmasta "vain aikuiset" -linjasta.

Vielä auki (ei estä M0:aa):
4. **Siirrot:** ≤2/jakso lukittu — ilmaisia vai kustannus (esim. −pisteet ylimenevistä)?
5. **Saavutukset v1:** mikä lista (1. voitto, jakson voittaja, 100 p, 10 oikeaa veikkausta…).
6. **Palkinnot:** vahvista jakso+kausi top-3 + sponsorimalli + QR (#12).
7. **Tie-breaker:** piilotetut veikkaukset + aikaisin lukittu voittaa — lisätäänkö sääntösivulle.
