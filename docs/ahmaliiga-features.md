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
- **F4.5** Siirrot ≤2/jakso, myynti nykyhintaan (arvonnousu realisoituu myydessä).
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

## Rakennusjärjestys (ehdotus)
1. **Kausi/jakso + kortisto + snapshot-malli** (F2, F3, historia alusta).
2. **Squad + validointi + lukitus** (F4).
3. **Settlement-poller + pisteytys + leaderboardit + snapshotit** (F6, F7.1–7.3).
4. **Veikkaus** (F5).
5. **Dashboard/profiili/saavutukset** (F7.2/7.4/7.5) — johdettua dataa.
6. **Ilmoitukset** (F8) 🔗 kun #1 inbox rakennetaan.
7. **Tähtiäänestys + palkinnot** (F9, F10) 🔗 viimeisenä.
8. **Admin-työkalut** (F11) rinnalla tarpeen mukaan.
