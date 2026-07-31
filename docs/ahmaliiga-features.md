# Ahmaliiga — feature list (backend-speksin pohja)

Purettu roadmapeista (`project_ahmaliiga_plan` + `project_gamezone_feature_roadmap`).
Järjestys: **domain → feature → mitä backend vaatii**. Merkintä 🔗 = jaettu koko
roadmapin kanssa (tämä on se *viimeinen* backend, joten se rakennetaan kerran ja
palvelee muitakin featureita). Kaikki pelilukemat on jo kalibroitu (backtest) —
tässä ei enää lyödä lukkoon numeroita, vaan listataan toiminnallisuudet.

---

## 1. Identiteetti & manageri-tili  🔗 (pääosin OLEMASSA)
- **F1.1** Pelaajan identiteetti = `userId` (device-id + nimimerkki, valinnainen Google). *Backend: EXISTS (Users/Credentials).*
- **F1.2** Liittyminen Ahmaliigaan (opt-in) → luo manageri-profiili. *Uusi: `Managers` (PK=userId).*
- **F1.3** Nimimerkki näkyy rankingissa (johdetaan Users-profiilista).

## 2. Kausi & jaksot
- **F2.1** Aktiivinen kausi (season) + sen konfiguraatio.
- **F2.2** Jaksot (2 vk) — aikataulu, "nykyinen jakso", **lukitusaika** (esim. ma 18:00).
- **F2.6** (MEKANISMI RAKENNETTU + LEPOTILASSA 2026-07-18) **Jaksot generoidaan, ei seedata.** Replay-seed kirjoittaa jaksot `seed.rounds`-kentästä (määrä johdettu historiadatasta) — oikealle kaudelle mahdotonta: jaksojen määrää (playoffit) eikä rajoja (pelit siirtyvät) voi tietää seed-hetkellä; vain **aloituspäivä + 2 vk kadenssi** on tiedossa. **Rakennettu:** `buildRoundWindows(start, weeks, count)` (pure kadenssigeneraattori) + `seedSeason` uusi **`roundConfig {startDate, weeks, count}}`** -polku joka generoi jaksot ja merkitsee kauden **`roundGen`**-lipulla; **`ensureRoundsCover(seasonId, throughDay)`** jatkaa ikkunoita eteenpäin (idempotentti, ei kutista); `syncSeasonGames` kutsuu sen synkatun ohjelman viimeiseen peliin asti → **playoff-pelit luovat jaksot** eikä niitä pudoteta. **Lepotilassa:** running/replay-kaudella ei `roundGen`-lippua → seed.rounds-käytös ja `syncSeasonGames` **byte-for-byte ennallaan**. Testi `tools/test-rounds.js` (generaattori · roundConfig-seed · jatkaminen · idempotenssi · lepotila). **`gen-cards.js --round-config[=N]`** tuottaa nyt `roundConfig`in (johdettu aloitus + kadenssi; verifioitu end-to-end: 2026-datalla 17 jaksoa, jatkaminen 2026-06-01→21). **Käyttöönotto seuraavassa testipelissä:** aja gen-cards `--round-config` → seedaa → live-synkkaa (`syncSeasonGames` luo/jatkaa jaksot oikeista peleistä). **Jäljellä:** admin-UI jaksojen katseluun/säätöön (F11.1). **F2.5:n edellytys** — rakennuspalikat valmiina + testattu.
- **F2.3** KAKSI leaderboardia: jakso (nollautuu) + kausi (kumulatiivinen).
- **F2.4** Jakson lukitus — kokoonpano + kapteeni + veikkaus lukkiutuvat deadlineen. *Backend: `Season`/`Jaksot` config; settlement lukee tästä.*
- **F2.5** (MEKANISMI RAKENNETTU + LEPOTILASSA 2026-07-18) **Reaaliaikainen kausikello.** Sim-kello (`simDate`) on koko pelin "nyt" (alkanut/pelattu/pisteet/timeline/settlement). CF-worker-cron (`7,37 * * * *` = 30 min) bumppaa sitä +1 vrk kun `autoStep` on → **48× reaaliaika** (replay). **Rakennettu reaalikello-mekanismi:** season-lippu **`realClock`** → `stepSim` synkkaa `simDate = tänään` (monotoninen, ei kelaa taakse) +1-vrk-bumpin sijaan, jolloin jaksot ratkeavat oikean päivämäärän mukaan **30 min tarkkuudella** (sama CF-cron, ei worker-muutosta). **EI kytketty** running-testikauteen (kausella ei `realClock`-lippua → sim-käytös ennallaan, byte-for-byte). Kytkin: admin **"Vaihda reaalikelloon"** (confirm-gated) tai `manageAhmaliiga setClock {real}`; tila näkyy admin-Row "Kello". Kapteenilukko jo reaaliaikainen. Testi `tools/test-realclock.js` (sim-haara ennallaan · real synkkaa tähän päivään + ratkaisee erääntyneet · monotoninen). **Kytke vasta kun testipeli on ohi** (todennäk. tuoreelle kaudelle resetin kautta; kesken oleva kausi on ~puolivälissä). *Vaihtoehto B (sekuntitarkka `simMode:false` + tikittävä countdown) jätettiin — 2 vk jaksoille päivätarkka riittää.*

## 3. Kortit & kortisto (pool)
- **F3.1** Joukkuekortit (kaikki ikäluokat) — lähde tulospalvelu `teamKey` (age + peliryhmä-väri).
- **F3.2** Pelaajakortit + maalivahtikortit (VAIN aikuiset) — lähde box score -rosterit / pistepörssi.
- **F3.3** Korttien hinnat, bändit (joukkue 30/20/10, pelaaja 50/40/30).
- **F3.4** **Dynaaminen hinnoittelu** — uudelleenbändäys jakson vaihteessa rullaavan muodon mukaan.
- **F3.5** **Alkuhinnoittelu edellisen kauden statseista** (pre-season prior; uudet = Keski).
- **F3.6** **Omistus-%** — montako manageria omistaa kortin (markkina + kortin tiedot).
- **F3.7** **Kortin pistehistoria + hintakehitys** — vaatii **per-kortti-per-jakso snapshotin JO ensimmäisestä jaksosta** (muuten historiaa ei ole). *Backend: `Cards` (nykytila) + `CardHistory` (PK=cardId, RK=jakso: hinta, pisteet, omistus%).*

## 4. Joukkueen kokoaminen (squad)
- **F4.1** Budjetti 120 Ahma-coinia 🪙.
- **F4.2** 5 korttia, max 2 pelaajakorttia, ei positioita.
- **F4.3** Kapteeni = 2× pisteet, vaihdettavissa viikoittain.
- **F4.4** Osto **lukitsee hinnan** (FPL lock-in) — pidetyn kortin arvonnousu ei riko kokoonpanoa.
- **F4.5** Siirrot ≤5/jakso (2026-07-29: 2→5, palkitsee aktiivisemman managerin), ylimenevät −5 p/siirto; myynti nykyhintaan (arvonnousu realisoituu myydessä).
- **F4.6** Kokoonpanon validointi palvelimella (budjetti, slotit, lukitusaika). *Backend: `Squads` (PK=userId, RK=jakso: 5 korttia + kapteeni + ostohinnat). Historia per jakso = luonnostaan snapshot.*

## 5. Veikkaus (prediction)
- **F5.1** Yksi ottelu / jakso, ennusta **tarkka tulos**.
- **F5.2** Bonuspisteet: oikea voittaja +1 / +maaliero +2 / tarkka tulos +3.
- **F5.3** Veikkaus lukittuu ennen ottelua; **tie-breaker**: piilotetut valinnat deadlineen asti + aikaisimmin lukittu voittaa tasatilanteessa. *Backend: `Predictions` (PK=jakso, RK=userId), + jakson "pääottelu" konffi.*

## 6. Pisteytys & selvitys (settlement) — AUTOMAATTINEN  🔗 poller
- **F6.1** Joukkuekortin pisteet/peli (voitto 3 / tasa 1 / tappio 0 / nollapeli +2 / maaliero +0.5 cap 2).
- **F6.2** Pelaajakortin pisteet (kenttä: maali 3 / syöttö 2; mv: voitto 3 / nollapeli +2 / torj-% ≥92 +2 / ≥95 +3, aikaperustainen GA-attribuutio).
- **F6.3** Kapteeni 2×. **F6.4** Veikkausbonus.
- **F6.5** **Settlement-job**: jakson päätyttyä lukee tulospalvelun (durable KV-cache, EI uusia skannauksia) → laskee pisteet → päivittää leaderboardit + kortti-snapshotit + notifikaatiot. *Sama ajastettu poller kuin 🔗 #1-push / #23 pistepörssi / #28 live.*
- **F6.6** Uudelleenlaskenta (admin-override virheisiin).
- **F6.7** Per-jakso snapshot: pisteet + sijoitus → syöttää Jakson yhteenvedon + historian. *Backend: `Scores` (PK=season\|jakso, RK=userId: pisteet+breakdown), leaderboard = partition-scan.*

## 7. Ranking, yhteenvedot & profiili
- **F7.1** Jakson + kauden leaderboard (Sinä korostettuna).
- **F7.2** Dashboard: oma sijoitus, pisteet, aika jäljellä, Top 5, viimeisimmät pistepäivitykset.
- **F7.3** **Jakson yhteenveto** (retention-kriittinen) — laukeaa automaattisesti settlementin jälkeen; pisteiden erittely + paras kortti.
- **F7.4** Profiili-statsit: liittynyt, mestaruudet, paras + keskimääräinen sijoitus, pelatut jaksot.
- **F7.5** **Saavutukset** (ansiomerkit: 1. voitto, jakson voittaja, 100 p, 10 oikeaa veikkausta). *Backend: johdettu Scores-historiasta; `Achievements` (PK=userId) jos halutaan pysyvät.*

## 8. Ilmoitukset  🔗 (#1 inbox + #18 asetukset)
- **F8.1** Fantasy-notifikaatiot (kapteenisi teki maalin / joukkueesi voitti / veikkauksesi osui) → **#1:n inbox**, settlement/poller tuottaa tapahtumat.
- **F8.2** Ilmoitusasetukset (#18) — mitkä tapahtumat notifioivat.

## 9. Tähtiäänestys  🔗 (#33/#11, AIKUISET)
- **F9.1** Aikuisottelun tähtipelaaja-äänestys/-veikkaus → **bonuspisteet** kortin omistajille. *Backend: 🔗 `Votes` (PK=target, RK=userId) — sama vote/tally-kuvio kuin #10/#9.*

## 10. Palkinnot  🔗 (#12)
- **F10.1** (BUILT 2026-07-18) Jakso top-3 + kausi top-3, sponsorirahoitteinen, **QR-lunastus** kentällä. Toteutus: `AhmaliigaVouchers` (PK=userId, RK=`scope|round|rank` → deterministinen/idempotentti; ETag-atominen `issued→redeemed` = 1 lunastus). Managerilla pysyvä `qrCode` = **identiteetti** (QR koodaa `/ahmaliiga/kiosk?c=CODE`); lunastusvalta on **`kioski`-roolilla TAI adminilla** (`canRedeem`), ei QR:ssä → itselunastus estetty. Admin generoi top-3:t leaderboardista (`generateVouchers`, oletustekstit "Jakso N — sija R"). Sivut: `/ahmaliiga/rewards` (oma QR + lista) + `/ahmaliiga/kiosk` (skannaa → merkitse saaduksi). Notifikaatio voittajille (kind `reward`). Skannaus = natiivikamera (ei skanneri-deppiä); QR-piirto `qrcode.react`. Testi: `tools/test-vouchers.js`.
  - **Kioski-kamera (TEHTY 2026-07-19):** kioskisivulla (`/ahmaliiga/kiosk` ilman `?c=`) **in-page kameraskanneri** (`html5-qrcode`) — avaa takakameran, lukee managerin QR:n, poimii `c`-koodin ja lataa palkinnot. "Skannaa toinen" -nappi palaa skanneriin. Kameravirhe → ohje + natiivikamera-fallback.
  - **Sanamuoto (tehty 2026-07-19):** pääsivun banneri "Voitit N palkintoa" → "Sinulla on N lunastamatonta palkintoa" (laskee lunastamattomia, ei voitettuja → ei vähene oudosti lunastuksen jälkeen).

## 11. Admin (myöhemmin)
- **F11.1** Jaksojen hallinta (luo/muokkaa, deadlinet).
- **F11.2** Korttien hintojen päivitys (manuaalinen override / käynnistä reband).
- **F11.3** Pisteiden uudelleenlaskenta (F6.6).
- **F11.4** Veikkausten hallinta (aseta jakson pääottelu, varmista tulos).
- **F11.5** Push-viestit (broadcast) 🔗 #1.
- **F11.6** Kauden resetointi (arkistoi kausi, aloita uusi; historia säilyy).

---

## Backendin entiteetit (Table Storage) — mihin featuret mappaavat
Ahmaliiga-omat:
- `Managers` — PK=userId (liittyminen, profiili-aggregaatit). [F1.2, F7.4]
- `Season` / `Jaksot` — kausi + jaksojen aikataulu/deadlinet/pääottelu. [F2, F5]
- `Cards` — kortiston nykytila (hinta, bändi, omistus-count). [F3.1–3.6]
- `CardHistory` — PK=cardId, RK=jakso (hinta+pisteet+omistus% snapshot). [F3.7]
- `Squads` — PK=userId, RK=jakso (5 korttia + kapteeni + ostohinnat). [F4]
- `Predictions` — PK=jakso, RK=userId. [F5]
- `Scores` — PK=season\|jakso, RK=userId (pisteet + breakdown). [F6, F7]
- (valinn.) `Achievements` — PK=userId. [F7.5]

Jaetut (rakennetaan kerran, palvelevat myös muita roadmap-featureita) 🔗:
- `Messages` + `PushSubs` (#1 inbox/push) — F8.
- `Votes` (#9/#10/#11/#33) — F9.
- `Vouchers` (#12 QR-palkinnot) — F10.
- **Yksi ajastettu SETTLEMENT-poller** (lukee durable-cachetun tulospalvelun) palvelee F6 + #23 pistepörssi + #28 live + #1-push.
- Identiteetti `userId` (device-id + optio Google) — EXISTS.
- Varmuuskopiot: `exportBackup` kattaa uudet taulut automaattisesti (0 lisätyötä).

## Kehitys & laatu (roadmap)
- **T1** (ROADMAP 2026-07-18) **Automatisoitu testausjärjestelmä KOKO Ahmaliigalle.** Nyt on vain kolme kertakäyttöistä, kapea-alaista hermeettistä testiä — `tools/test-lineups.js` (rolling-lock + kapteenilukko), `tools/test-vouchers.js` (F10), `tools/test-realclock.js` (F2.5) — ja nekin vaativat **Azuriten käsin käynnistyksen + portin 10002 vapautuksen + datan tyhjennyksen joka ajolla** (Windowsilla kipeä; bash `pkill` ei tapa Windows-nodea → PowerShell `Get-NetTCPConnection`/`Stop-Process`). Iso osa logiikasta on **kokonaan testaamatta**. TODO: kattava suite joka verifioi koko domainin:
  - **Seedaus & hinnoittelu:** bändit/skew/quintiilit, alkuhinnat priorista, no-prior→mid.
  - **Squad-validointi:** budjetti, slotit, `maxPlayers`, lock-in (buyPrice pysyy), ≤`transfersPerRound` + penalty, kapteeni squadissa.
  - **Settlement & pisteytys:** joukkue (voitto/tasa/tappio/nollapeli/maaliero-cap), kenttäpelaaja (maali/syöttö), maalivahti (torjunta-% kynnykset), kapteeni ×2, veikkausbonus (voittaja/maaliero/tarkka).
  - **Rebanding:** ±10/jakso price cap, trendit, kausipisteiden kumulatiivi + idempotentti re-settle.
  - **Rolling lock + kapteenilukko** (on jo), **veikkauksen lukitus**, **leaderboardit** (jakso/kausi, ranktrendit).
  - **Palkinnot** (F10, on jo) + **kellotilat** (F2.5, on jo).
  - **Infra:** yksi `npm test` -ajuri joka bootaa Azuriten tuoreeseen temp-hakemistoon, ajaa kaikki testit eristettyinä (oma kausi/partitio per testi tai wipe välissä), sammuttaa Azuriten, raportoi yhteenvedon; **jaettu test-harness** (seed + Azurite-boot + assert-helpurit) jonka testit importtaavat; **CI-workflow** (GitHub Actions). Ilman tätä regressiot jäävät kiinni vain manuaalisella muistilla — ja domain on jo iso.
- **T2** (1. ERÄ TEHTY 2026-07-18) **Sivujen / latauksen optimointi.** Oire oli: **"Oma joukkue"** (`/ahmaliiga/squad`) latautui monta kertaa ja kesti. Pullonkaula profiloitu: **`roundProgress` hakee box scoret workerista** per pelaaja-eligible peli (verkko-RTT). **Tehty:** (1) `edit.js` **irrottaa `roundProgress`in renderöinnistä** → sivu piirtyy heti cards+squad+state:sta, pisteet täyttyvät jälkeen ("—" siihen asti); (2) **client-cache + in-flight-dedupe** (`ahmaliigaApi.cachedGet`) state (15 s) / cards (60 s) / roundProgress (20 s) → sivujen välillä ei refetchiä, tyhjennetään squad-tallennuksessa; (3) **palvelin ohittaa box scoret** kun squadissa ei ole pelaajakortteja (team-korttien pisteet tulevat pelituloksesta) → all-team-squad = 0 worker-kutsua. **Jäljellä:** laajempi sivuauditointi tarvittaessa (dashboard/market), skeleton-render, per-kortti-pistelähde ilman koko roundProgressia jos tarvetta.

## Balanssi v2 — ✅ Phase 1–3 RAKENNETTU 2026-07-19 (commit 329bdd7); B8/B10 kesken

Johdettu **ensimmäisen kokonaisen testikauden analyysistä** (palautettu backup → lokaali Azurite; `tools/analyze-*.js` + `simulate-*.js`), **backtestattu** (`tools/backtest-v2.js`) ja **toteutettu Phase 1–3** (B1–B7 + squad-sääntö; roadmap+backtestit 4871339). Täysi "miksi" + evidenssi + poikkeamat: **`project_ahmaliiga_balance`** (muisti). Nämä **päivittivät** yllä olevia F-lukemia. Käyttöönotto: juokseva testikausi hylätty (ei enää tarpeen) → v2-vakiot globaalisti, seuraava testi tuoreesta reset-seedistä. Havaittu ydin: joukkueet olivat liian halpoja + tasahintaisia (arvo tuli HINNASTA, ei volyymista — `analyze-teamgames.js` kumosi volyymiteorian: Naiset pelasi VÄHITEN 22 peliä mutta korkein 3.9 p/peli); voittaja voitti seura-tietämyksellä (draft-edge), ei exploitilla.

**Toteutuksen poikkeamat sovitusta (käyttäjän kanssa kesken buildin):** **B4** = 1 peli × 3/5/8 (EI 3 peliä — backtest: 3-peliä×3/5/8 = 26 % pisteistä, dominoi; 1-peli ≈ 9 %). **B2b** = yksi sääntö `minTeams:2` (käyttäjä: "minTeams ja maxPlayers on sama asia") — pudotettiin erillinen maxPlayers-heitto; client näyttää **dynaamiset "Joukkue"-kilpi-slotit** (ilmestyvät kun joukkue vielä pakko) + "Joukkuekortteja X/2" -vihjeen, EI literaaleja aina-näkyviä alarivin slotteja (vaatisi kapteeni-heron purun → mahd. jatkokehitys).

- **B1** (F2.2/F2.5) **Jaksot = 2 viikkoa, linjattu ma→su** (ma-alku, päättyy toiseen sunnuntaihin, 14 pv). ✅ RAKENNETTU (`gen-cards --round-config` weeks:2; 2026-replay 17 jaksoa 2025-08-11 alkaen). *(Alun perin sovittiin weekly ma–su, mutta käyttäjä valitsi 2 vk 2026-07-19.)* Lukitus = oman squadin **ensimmäinen peli** → "päivitä ennen omaa peliäsi" (julkiset kokoonpanot tulevat ennen pelejä).
- **B2** (F3.3) **Joukkuekortit: nosta + LEVITÄ bändi laadun mukaan.** Lattia **10** (heikoin joukkue aina ostettavissa), huippu ~50, bändi ÷5 **`[50,40,30,20,10]`**. **Hinnoittele oikean vahvuuden mukaan** (viime kauden pisteet/PELI tai sarjataso), EI pelkän prior-formin (joka litisti kaiken ~20c:iin, Edustus 10c). **EI per-jakso-cappia** (volyymiteoria oli väärä). ✅ **Backtest-vahvistettu** (`backtest-v2.js`, 2026 pts/PELI-hinnoittelu): Naiset 3.9→50c · U20/Edustus→50c · heikot juniorit→10c; lattia 10 (aina ostettavissa), halvin 5 = 90 ≤120, 2 kalleinta+3 halvinta = 140 > 120 (**dream deck pysyy vaikeana**). pts/PELI hinnoittelee Naiset oikein premiumiksi (pelasi vähiten mutta paras). Oikeassa pelissä hinta = **viime kauden** pts/peli/sarjataso.
- **B2b** (F4.2) **Squad-rakenne: 2 pakollista JOUKKUE-slottia + 3 vapaata (joukkue TAI pelaaja).** Kaksi alinta korttipaikkaa = joukkue-only (PAKKO valita joukkue); loput kolme vapaita. Takaa ≥2 joukkuetta AINA — rakenteellisesti vahvempi kuin pelkkä `maxPlayers=3`. **UI:n tehtävä selväksi** joukkue-only-slotit (Joukkue-placeholder + kilpi-ikoni; pelaajakortit ei valittavissa niihin).
- **B3** (F6.2) **Maalivahtiboosti (säilytä 2 torjunta-%-porrasta):** voitto 3 · ≥88 % **+2** · ≥92 % **+3** · **nollapeli +4** (oli +2 — nyt arvokkain yksittäinen komponentti). Katto ~10 (oli ~8). Ei cappeja, ei lisäportaita. ✅ **Backtest-vahvistettu** (`backtest-v2.js`, 154 mv-peliä): katto 8→10 (= hattutemppu ~9–11 → mv voi olla kapteerinkin arvoinen), keskiarvo tuskin liikkuu (3.4→3.5) koska nollapelejä vain **5 %** → +4 = harvinainen jackpot, ei inflatoi.
- **B4** (F5.2) **Veikkaus: 1 peli/jakso (ennallaan), buffaa BONUS `{winner:3, margin:5, exact:8}`** (oli 1/2/3, päätetty 2026-07-19 backtestin jälkeen). Evidenssi (`analyze-predictions.js`): 35 veikkausta, **69 % osui** mutta vain 34 p (~1 % pisteistä) koska +1 dominoi → liian pieni. **⚠️ Backtest (`backtest-v2.js`) tappoi aiemman "3 peliä × 3/5/8":** hyvän managerin (≈500 p) kausiosuus = 1p·1/2/3 3 % · **1p·3/5/8 9 %** ✓ · 3p·1/2/3 9 % · 3p·2/3/5 17 % · **3p·3/5/8 26 % ⚠ dominoi** (eclipsaisi kortiston — kortinvalinnan skill-etu oli vain ~55 p/kausi). Ei molempia vahvistimia. **Valittu: 1 peli × 3/5/8** — osuma tuntuu isolta (tarkka=8 ei 3) muttei dominoi.
- **B5** (F3.3) **Hintatikkaat jyrkemmät + useampi kallis tähti** (ei vain yhtä 75c:n tähteä → draft ei ratkea yhteen korttiin), **EI max-hintaa kauden alussa** (huippu = porras katon alla; katto vain arvonnousulla), **kaikki luvut ÷5** (pelaajatikkaat [75,60,45,35,25,15,10] jo ÷5).
- **B6** (F3.4/F4.5) **Nopeampi hintadynamiikka ("pörssimeta"):** hinnat liikkuvat enemmän/jakso tuoreen formin mukaan → osta halvalla / myy kalliilla kannattaa → syy treidata viikoittain. Varmista että myyntivoitto rahoittaa päivityksiä. Pelaajaviesti: *"kortit ovat kuin pörssiosakkeet — hinta nousee kun pelaa hyvin; ostohintasi lukittuu."*
- **B7** (F10.1) **Palkinnot: jakso top-1 + kausi top-3** (oli auto top-3/jakso ≈ 54/kausi → sponsoriraskas). `generateVouchers` ottaa jo `top` → jakson `top:1`.
- **B8** (F8) **Sitoutuminen: notifikaatiot** (muistuta ennen lukitusta) + "päivitä ennen peliäsi" -luuppi + (myöh.) pörssimeta. ÄLÄ pakota asettamaan muuttumatonta kapteenia uudelleen (turhaa työtä). Testissä siirrot jäi käyttämättä (Lasse 9, useimmat 0–4/16) + botit (0 muutosta, 100 % joukkueita) coastasi keskikastiin → "set-and-forget" oli liian toimiva.
- **B9** **Säilytä:** kapteeni ×2 (×1.5-sim ei juuri muuttanut kärkeä), budjetti 120, squadSize 5, uudet pelaajat → keskihinta.
- **B10** (F3.2) ✅ **RAKENNETTU 2026-07-19 (4904c73) — Pelaajapooliin viime kauden U15 (2010-syntyneet).** 2010-syntyneet (U15→U18 nousseet) hinnoitellaan oikeasta U15-kaudesta mid-tierin sijaan. **Ei syntymävuotta Jopoxissa EIKÄ tulospalvelussa** → **nimimätsäys**: tulevan kauden U18 Jopox-rosteri ↔ viime kauden U15 box-score-maalintekijät (2011-syntyneet jäävät rosterin ulkopuolelle → karsiutuvat). **VAIN seed-aikaan** — ajonaikana call-up on jo U18/eligible → `roundResults.js`/api ennallaan (`PLAYER_AGES` `[Edustus,Naiset,U20,U18]`). Toteutus: `model.js normName` + `buildPlayerCards`/`buildPrevPrior` `{callupAges,callupNames}`; `roster.js fetchJopoxRosterNames(subsiteId)`; `gen-cards --u15-callups=<U18-subsiteId>`. Testi `test-callups.js` (6/6). Live: U18 (9949) 23 nimeä, **12/21 2026-U15 osui**. ⚠️ Odottaa live-2027-poolin roster-seedausta (ei-callup-pelaajat) — call-upit plugautuvat siihen.

## Live-UX — beta-palaute (2026-07-25)
Ensimmäisen avoimen betan (v2.1, live-synkattu jakso) käyttäjähavaintoja. Kaikki koskevat **käynnissä olevan jakson** kokemusta (kortteja vaihdellaan kesken jakson). Ei prioriteettijärjestyksessä.

- **U1** (F7.1) ✅ **BUILT 2026-07-25.** **Nykyinen (live) jakso ranking-sivulle.** Uusi **"Nyt"-välilehti** (oletus) `ranking.js`iin → kuluvan jakson **alustava** järjestys, laskettu lennossa pelatuista otteluista. Backend `getLiveLeaderboard(seasonId, round)` käyttää settlementin PRIMITIIVEJÄ (`computeRoundResults`/`effectiveSquad`/`roundCaptainOf`/`predictionBonus` + siirtorangaistus), suodattaa pelatut pelit (date ≤ simDate), ei tallenna mitään → **live == lopullinen** (hermeettinen `tools/test-live-ranking.js` todistaa: settlaa jakson, vertaa). Cache 30 s per sim-päivä (raskas osa = box-score-haku jaettu). Endpoint `scope=live` (jos jakso jo ratkaistu → sen lopullinen, `live:false`). UI: "alustava — päivittyy otteluiden myötä" + tyhjätila kun ei pelattuja. **Jäljellä:** rank-trendi live-jaksolle (nyt "—"); ei riskiä settlementille (uusi read-only funktio, ei refaktoroitu settleRoundia).

- **U2** (F3.1) ✅ **BUILT 2026-07-25.** **Peliryhmä (Musta/Oranssi) ikäryhmän lisäksi ottelunäkymiin.** Ahman peliryhmä pudotettiin usealla pinnalla — korjattu molemmat kohteet (näyttö-only): **(A)** `events.js gameTitle` käyttää nyt `gameTeamKey`iä ("U15 Musta vs X") → korjasi timeline + dashboard; **(B)** `predict.js` `ahmaGroup(level)` (ikä+väri levelistä) → dropdown + iso ottelunäkymä. Väri näkyy vain monijoukkueisilla ikäluokilla. ⚠️ **Data on jo saatavilla** — lähde on **tulospalvelun pelidata** (ei Jopox): väri on `level`issä ("U13 Oranssi") tai joukkueen nimessä, ja **`gameTeamKey(g)`** (`events.js`, peilaa backendin **`teamKey`**iä — se jaettu ikäluokka+väri-funktio) laskee jo esim. "U15 Musta". Fix = **pelkkä näyttö**, kaksi korjauskohdetta:
    - **(A) `events.js gameTitle`/`AHMA_AGE`** → kattaa **timeline (`round.js`) + dashboardin "Seuraavat tapahtumat" (`home.js`)** yhdellä muutoksella (jaettu `EventRow`). Nyt "U15 vs Pelicans" → halutaan "U15 Musta vs Pelicans" tai ryhmä-chip.
    - **(B) `predict.js`** — OMA logiikka (`splitTeam`/`ageOf`/`gameLabel`), pudottaa värin dropdown-labelista JA isosta ottelunäkymästä → erillinen korjaus.
    - **Jo kunnossa:** joukkuekortit (kortin nimi sisältää värin kun ikäluokalla on alaryhmiä: "U13 Oranssi"; yhden joukkueen ikäluokat = pelkkä ikä, oikein). ⚠️ Näytä väri VAIN kun se on (monijoukkueiset ikäluokat), älä pakota. Ei privacy-kysymystä (vain ryhmälabel pelidatasta).

- **U3** (bugi · HARD RULE) ✅ **BUILT 2026-07-25.** **Timelinen oranssit pallot eivät keskity korttiin.** `round.js` `TimelineTab`: pallo keskitetään nyt `EventRow`n optiselle keskilinjalle **millä tahansa korttikorkeudella** (`calc((100% − gap)/2)`, ei kova `mt`), viiva yhtenäinen rivien yli (korjattu myös kun "Lopputulos"-rivi kasvatti kortteja). ([[feedback_icon_text_centered]])

- **U4** (F7.2 · F7.3) ✅ **BUILT 2026-07-25.** **Jakson kokonaiskuva + live per-kortti-pisteet.** `round.js` = `SwipeableTabs` [Aikajana | Tulokset] (pill-tabit → MUI-tabit + swipe, ratkaisee "isot+pienet chipit allekkain"). EI sivujen yhdistämistä. Kaksi taskia:
  - **U4a** ✅ **Jakson KAIKKI ottelut.** Aikajanaan **Omat/Kaikki-chipit** (`buildEvents(state, null, {ownKeys})` → koko ohjelma, omat merkitty "Omasi"-chipillä). **Pelattu** → klikkaus box scoreen; **pelaamaton** → klikkaus box scoreen `spoilerFree`-lipulla (U6). Ei inline-tuloksia (ei spoileria). Sisäänkäynti: `edit.js` "Katso jakson otteluohjelma →" (`/timeline?ottelut=kaikki`).
  - **U4b** ✅ **Pisteet per kortti LIVENÄ.** `roundProgress` palauttaa nyt `cards`-erittelyn (nimi+kuva+pisteet+kapteeni); **Tulokset**-välilehti näyttää sen livenä ("Alustava — päivittyy") kesken jakson + lopullisen ratkettua. **Rivit klikattavissa → kortin tiedot** (`/ahmaliiga/card/:id`).

- **U5** (F3.4 · F3.7 · B6) ✅ **BUILT 2026-07-29 (c505178 + jatkot).** **Kortin hinta päivittyy heti pelatun pelin jälkeen.** Reband tapahtui vain jakson vaihteessa; nyt hinta reagoi kesken jaksonkin → pörssimeta ([[B6]]) elää. **Ankkuroitu live-reband** (`livePrice = price + clamp(target − price, ±cap)`, form sisältää kuluvan jakson pelatut pelit; live == settled kun jakso pelattu). Erillinen `livePrice`/`liveTrend` (settled `price` koskematon → talous ei rikkoudu); **ei lippua, suoraan päällä**. Näyttö + kauppa + trend live-hinnalla; "Nyt"-piste hintahistoriaan. **On-demand** (`liveRoundCardPoints`, memo 30 s) → ei tikkiriippuvuutta. Lisäksi: **markkinalistan "Jakso"-sarake + kortin "Jakso N ·nyt" -palkki** näyttävät kuluvan jakson live-pisteet (seuraa sovelluksen current-jaksoa). Testi `tools/test-live-reprice.js` (liike katossa · idempotentti · live==settled). Jäljellä (roadmap): suhteellisen hinnoittelun UX-hienosäätö jos ei-pelaavien korttien ajautuminen tuntuu oudolta.
  - **Malli = "ankkuroitu live-reband" (idempotentti, live==settled).** `livePrice = price + clamp(target_live − price, ±priceStepCap)`, missä `target_live = bandPricesFrom(pool, liveForm)` ja `liveForm[card] = (settledSum + liveRoundPts)/(nSettled+1)` (liveRoundPts = `computeRoundResults` pelatuista peleistä, jo memoisoitu). Kun jakson kaikki pelit pelattu → `liveForm==cumForm` → `livePrice==uusi settled price`. **Settlementin nykyhintamatikka EI muutu** — `price` (settled) on jäädytetty koko jakson → se toimii live-clampin ANKKURINA (ei tarvita erillistä roundStartPrice-kenttää).
  - **Turvallisuus = erillinen kenttä (EI lippua — feature suoraan päällä, päätös 2026-07-29).** Uusi additiivinen `livePrice` (+ `liveTrend`); `price` pysyy settled/autoritatiivisena (bank, buyPrice, standings, CardHistory ennallaan). Table Storage skeematon → ei migraatiota. Turva tulee RAKENTEESTA: settled-hintaa ei kosketa, liveReband idempotentti + ankkuroitu (±cap) → pahin bugi = väärä näyttöluku joka korjautuu settlementissä. Menee deployssa heti päälle myös nykyiselle betalle (kertaluontoinen catch-up-liike ±cap kuluvan jakson pelatuista peleistä).
  - **livePrice näyttöön JA kauppaan** (päätös 2026-07-29): `saveSquad` osto/myynti käyttää `livePrice ?? price`. Lock-in (buyPrice) säilyy — vain "nykyhinta" on live. `liveTrend = livePrice>price?'up':<?'down':''` → **nousu/lasku-nuolet kytketään live-liikkeeseen** (UI: `liveTrend ?? trend`).
  - **UI:** kortin nykyhinta = `livePrice ?? price`; hintahistoriaan viimeinen piste **"Nyt" = livePrice** kun jakso kesken; trend-nuoli live.
  - **Kytkentä:** `liveReband(seasonId, round)` ajetaan `stepSim`-tikissä (best-effort) aina kun aktiivinen (alkanut, ei-ratkaistu) jakso on käynnissä — ei lippua. Per-jakso `CardHistory` ennallaan; intra-jakso-snapshotit = erillinen myöhempi lisä.
  - **Testi:** `tools/test-live-reprice.js` — pelaa 1 peli→hinta liikkui katon rajoissa · pelaa loppuun+settlaa→**livePrice==settled price** · aja liveReband 2× → idempotentti.

- **U6** (box score) ✅ **BUILT 2026-07-25.** **Spoiler-suoja pelaamattomille otteluille (beta = live UX).** Replay-betassa pelaamattoman ottelun box score näyttäisi historiallisen tuloksen+tilastot → spoiler. Ratkaisu: Ahmaliigasta box scoreen navigoidessa **router-state-lippu `spoilerFree`** pelaamattomille peleille → `game.js` piilottaa tuloksen (header näyttää kellonajan) + Tilastot + Tapahtumat + Pisteet, näyttää **VAIN Kokoonpanot** (hyödyllinen, ei tulosta). Ei sim-date-hakua game.js:ään — Ahmaliiga-puoli (round.js Kaikki-näkymä) päättää lipun pelin `played`-tilasta. → **Kaikki ottelut klikattavia myös betassa = sama UX kuin livessä.** (Reaali-livessä oikea peli näyttää kokoonpanot ilman lopputulosta luonnostaan.)

- **U7** (T2) ✅ **BUILT 2026-07-25.** **Dashboard + Oma joukkue latautuvat välillä hitaasti — skeleton/progress.** (Palaute 2026-07-25.)
  - **✅ Dashboard (`home.js`) TEHTY 2026-07-25.** Profiloitu → **ISOIN syy oli 1,4 MB PNG-logo** (`ahmaliiga_logo.png`, 1024², ei webp!) — muunnettu **webp 512px = 57 KB** (25× pienempi; sharp @0.32, `--no-save`; UI-viittaukset → `.webp`, SW-notifikaatioikoni jää pieneksi 192px PNG:ksi 15 KB). (2) **Skeleton** — kun `state===null` (ensilataus ilman cachea) piirretään korttimuotoiset placeholderit (`DashboardSkeleton`) tyhjän sijaan. (3) **sessionStorage-peili** — `getAhmaliigaState` + aktiivin `roundProgress` tallennetaan (`peekCached`), `home.js` initoi statet niistä → **instant paint reloadissa/revisitissä**, data päivittyy taustalla. `clearAhmaliigaCache` tyhjentää myös peilin.
  - **✅ Oma joukkue (`edit.js`) TEHTY 2026-07-25.** Sama kuvio: **`getAhmaliigaCards` (pool) + `getMySquad` mirroroidaan sessionStorageen**; `useSquad` initoi `all`/ids/captain/bank/round/minTeams `peekCached`ista → **ei enää täysruudun spinneriä** revisitissä. Ensilatauksella `all===null` → **`SquadSkeleton`** (stat-boxit + 5 korttikehystä pulssilla) `<Loading>`in tilalle. Squadin peili tyhjentyy tallennuksessa (`clearAhmaliigaCache`) → ei stale.

- **U8** (F7.3) ✅ **BUILT 2026-07-28 (rajattu versio).** **Per-kortti "mistä pisteet tulivat" myös kesken jakson.** Käyttäjä rajasi: EI accordionia/per-peli-expandia — riittää että **Tulokset-välilehti näyttää saman per-kortti reason-tekstin livenä kuin ratkaistussa jaksossa** ("Voitto 3–1 (nollapeli) · Tappio 0–2", "2 maalia, 1 syöttö", "Voitto, 93 % torjunta, nollapeli"). **Data oli jo saatavilla** — `computeRoundPoints` tuottaa `reasons` samasta box scoresta jonka `roundProgress` jo hakee pelatuille peleille; se vain **heitti reasonit menemään** (destrukturoi vain `{ results }`). Toteutus: `roundProgress` tekee yhden ylimääräisen PUHTAAN `computeRoundPoints({games: playedGames, reports, extraAges})`-kutsun (0 uutta verkkohaku) → `reason` per kortti `cards`-erittelyyn (pelatuista peleistä tähän mennessä, sama muoto kuin settled). Client `round.js` ResultsTab subtitle näyttää nyt `c.reason` sekä live- että settled-haarassa. **Iso alkuperäinen U8 (per-peli-accordion)** jää roadmapille jos halutaan myöhemmin drill-down per ottelu.
  - **Sivuhuomio:** korjattu UI-typo `nolapeli`→`nollapeli` (`_shared.js gameResult`).

- **U9** (F3.4 · B6 · U5-jatko) **Kortin arvon lasku tuntuu epäreilulta 0-pisteen jaksosta — PÄÄTÖS VAATII SIMULAATION (2026-07-31).** Palaute **Jani Rautakorpi 2026-07-30:** joukkuearvo **320 → 265** (−55) jakson vaihtuessa vaikka viimeisen pelin pisteet eivät sitä selittäneet. **Tarkistettu backupista** (`C:\Users\zapmi\AppData\Local\Temp\ahma-now.json.gz`, 2026-07-23, edellisen kauden 4088 CardHistory-riviä 18 jaksoa): **EI BUGI** — jokainen hintaliike ±15/jakso-catossa (0 yliajoa), ja ilmiö on **systemaattinen** (10–20 korttia/jakso putoaa vaikka teki 0 p; esim. jakso 11→12: 19 korttia). Esimerkki BLOMBERG Niklas: form 8,3→3,6 hiljaisen kauden aikana → hinta 60→45. **Kaksi syytä:** (1) **suhteellinen arvo** — hinta = form / poolin maxForm → kun MUUT skooraa, oma kortti tippuu tason vaikka omat pisteet ennallaan (= Janin havainto); (2) **0-jakso laskee keskiarvoa** (summa sama, jakolaskuri +1). Loogista pörssinä, mutta pelaajasta "rankaistiin tyhjästä".
  - **Optiot:** **A** rullaava/vaimeneva form (viime N jaksoa) · **B** epäsymmetrinen cap (nousee nopeasti −7 alas) · **C** absoluuttinen pohja (kokonaispisteet, 0-jakso ~neutraali) · **D** jätetään + selitetään säännöissä. **Alustava suositus B** (ankkuroitu-malli tekee eri ylös/alas-capista helpon).
  - ⚠️ **Ei implementoida ennen simulaatiota** (käyttäjä: "en uskalla tehdä päätöstä ilman simulaatiota"). Tarvitaan **backtest joka vertaa A/B/C/D:tä** samalla kausidatalla: hintavakaus, "rankaistiin tyhjästä" -tapausten määrä, dream-deckin vaikeus, treidauskannustin (B6). Työkalut valmiina (`tools/backtest-v2.js`, `analyze-*.js`, restore-backup + CardHistory). Suunnittele sim ensin → sitten päätös → sitten build.

- **U11** (F6.1 · B-balanssi · community) **Joukkueen menestys enemmän pisteitä — "pelaa joukkueen voiton eteen" + promo seuran näytöillä.** (Palaute 2026-07-31.) Ison kuvan huomio: peli korostaa nyt **yksilöitä** (pelaajakortti maali 3 / syöttö 2, hattutemppu + kapteeni 2× = iso potti), kun **joukkuekortti** antaa maltillisesti (voitto 3 · tasa 1 · tappio 0 · nollapeli +2 · iso voitto +1). Toive: **nostaa joukkuevoittojen painoa** niin että menestyvä joukkue on aidosti arvokas fantasiassa → kannustaa "pelaamaan joukkueen voiton eteen" (kollektiivi, seuran henki) eikä vain tähtipelaajien poimintaan. **Kaksi osaa:**
  - **U11a (balanssi):** korota joukkuekortin pisteitä (esim. voitto 3→4/5, iso voitto +1→+2, putki­bonus voittoputkesta?) TAI laske pelaajakortin dominanssia. ⚠️ **Vaatii balanssi-simin** (kuten U9) — joukkue/pelaaja-pistetasapaino kalibroitiin tarkkaan v2:ssa (`analyze-teamgames`, `backtest-v2`); muutos voi rikkoa dream-deckin/meta → aja backtest ensin. Voi yhdistää U9-simiin (sama työkalupohja).
  - **U11b (community/promo):** promota Ahmaliigan tuloksia/sarjataulukkoa **Wareenan näytöillä + Gamezonessa** → tekee fantasian ja oikean joukkuemenestyksen näkyväksi koko seuralle → sitoutuminen + "voiton eteen pelaaminen" näkyy. Erillinen näyttö-/kioskinäkymä (kuten `ads.js`/`next_home_game.js` canvas-sivut). Ei balanssiriippuvuutta — voi tehdä itsenäisesti.

- **U12** (F6.2 · B-balanssi) **Hyökkääjä-vinouma — puolustus/kollektiivi palkittava, mutta EI positiodataa.** (Palaute 2026-07-31, Jussi + Jani.) Havainto: **yksilöpoiminta = avain voittoon**, ja pisteytys **suosii hyökkääjiä** (maali 3 / syöttö 2), koska ei ole +/- -tilastoa eikä puolustuksen krediittiä kenttäpelaajille. Janin idea: **puolustaja saisi pisteitä joukkueen vähäisistä päästetyistä maaleista** (esim. 0–2). **⚠️ Ongelma vahvistettu (2026-07-31 probe):** *kuka on puolustaja* ei ole missään datassa — **Jopox ryhmittelee vain maalivahdit** (loput `null`-ryhmä, ei P/H-jakoa), box-score-rooli vain **MV/KP** (mv vs kenttä), leijonat.fi pelaajakortti CF-estetty/tauolla. → **positiopohjaista puolustajabonusta ei voi tehdä.**
  - **Data-toteuttavat vaihtoehdot ILMAN positioita:** **(a) esiintymis- + tulosbonus:** jokainen pelaajakortti joka **pelasi** (box-score-roster kertoo ketkä pukeutui) joukkueessa joka **voitti / piti nollan / päästi ≤2** saa pienen bonuksen (+1?) → palkitsee puolustajat & nelosketjun joukkuemenestyksestä ilman positiota. **(b) joukkuepuolustusbonus** jaettuna kaikille kentän pelaajakorteille vähä­maalisessa pelissä. Kumpikin vähentää "vain hyökkääjät skooraa" -vinoumaa. (Maalivahti saa jo nollapeli +4 / torj-% — kentän puolustus on se aukko.)
  - **Sim:** kvantifioi hyökkääjä-vinouma (montako % pisteistä maali/syöttö vs. joukkue/tulos), testaa (a)/(b) vaikutus. **Jussi ajaa simin** — **yhdistä U9 + U11a + U12 = YKSI balanssi-sim** (sama työkalupohja: restore-backup + `analyze-teamgames`/`backtest-v2`, CardHistory + box-score-rosterit).

- **U10** (F2.2 · F7.2) **Tulevat jaksot + tulevat pelit näkyviin (squad-suunnittelu).** (Idea 2026-07-31.) Nyt näkee vain kuluvan jakson (dashboard "Seuraavat tapahtumat" = omat + jakson päättyminen; `round.js` aikajana = kuluva jakso). Toive: **selata TULEVIA jaksoja ja niiden otteluita** jotta näkee mitkä kortit pelaavat milloin → osaa suunnitella kokoonpanon/kapteenin/vaihdot etukäteen. **Palikat pääosin valmiina:** `round.js` osaa renderöidä minkä tahansa jakson (`getAhmaliigaRoundProgress(round)` + `buildEvents`), `getRoundGames` toimii kaikille jaksoille, U4a:n "Kaikki ottelut" näyttää jo jakson koko ohjelman. **Puuttuu lähinnä NAVIGOINTI + spoiler-suoja:** (1) jakso­valitsin / edellinen–seuraava-nuolet round/timeline-sivulle (tai kausi­näkymä koko ohjelmasta); (2) tulevat pelit **spoiler-suojattuina** (ajat + vastustajat, EI tuloksia — replay-betassa tulos on historiadataa; sama `spoilerFree`-kuvio kuin U6, ja `getCardDetail` jo suodattaa pelaamattomat). Suunnittele UX: erillinen "Ohjelma"-näkymä vs. jakso­selailu nykyiseen round-sivuun. Sidos: kortin "Ottelut" voisi näyttää myös TULEVAT pelit spoiler-suojattuina (nyt vain pelatut — käyttäjän toive 2026-07-31 oli pelatut-only, mutta tuleva-selailu on eri feature).

## Rakennusjärjestys (ehdotus)
1. **Kausi/jakso + kortisto + snapshot-malli** (F2, F3, historia alusta).
2. **Squad + validointi + lukitus** (F4).
3. **Settlement-poller + pisteytys + leaderboardit + snapshotit** (F6, F7.1–7.3).
4. **Veikkaus** (F5).
5. **Dashboard/profiili/saavutukset** (F7.2/7.4/7.5) — johdettua dataa.
6. **Ilmoitukset** (F8) 🔗 kun #1 inbox rakennetaan.
7. **Tähtiäänestys + palkinnot** (F9, F10) 🔗 viimeisenä.
8. **Admin-työkalut** (F11) rinnalla tarpeen mukaan.
