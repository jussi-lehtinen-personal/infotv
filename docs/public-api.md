# Kiekko-Ahma GameZone — julkinen API

Julkiset, autentikoimattomat data-endpointit joita GameZone-sovellus käyttää. Sopivat
esim. valmennustiimin omaan pikkusovellukseen (ohjelma, kokoonpanot, sarjataulukot,
jäävuorot, seuratiedot).

- **Perus-URL:** `https://gamezone.kiekko-ahma.fi/api`
- **Kaikki yhden domainin takana:** sovellus tarvitsee **vain** tätä osoitetta. Azure-
  funktiot proxyttää taustalla: pelit/joukkueet/sarjat/box scoret → Cloudflare Worker →
  tulospalvelu; kokoonpanot/tapahtumat/kumppanit/organisaatio/uutiset → kiekko-ahma.fi
  (Jopox); jäävuorot → tilamisu. **Älä kutsu tulospalvelua/workeria/Jopoxia suoraan** —
  Azure-kerroksessa on cache + WAF-turvallinen egress.
- **Auth:** ei tarvita (nämä ovat `anonymous`). API-avainta ei ole.
- **Formaatti:** JSON. Metodi `GET` (ellei toisin mainita).
- **Kausi (`season`):** kevätvuosi. Kausi 2026–27 = **`2027`**. Useimmat kausiparametrit
  ovat valinnaisia → jätä pois niin palautuu kuluva kausi.

> ⚠️ **Käytä säästeliäästi / cachea.** Nämä välittävät kolmannen osapuolen dataa
> (tulospalvelu, Jopox, jäävuorojärjestelmä) ja ovat palvelinpuolella cachattuja juuri
> siksi ettei alkuperäisiä lähteitä ylikuormiteta (tulospalvelun ban-riski koskisi koko
> seuran näkymiä). Cachea asiakaspäässä, älä pollaa tiheämmin kuin ~30 s edes livepeleissä.

> ℹ️ **CORS:** endpointit palvelevat `gamezone.kiekko-ahma.fi`-originia. Jos sovellus on
> selaimessa eri domainissa, cross-origin-kutsu voi estyä → pyydä ylläpitoa lisäämään
> originisi sallittujen listaan (palvelinpuolen kutsuille ei ongelmaa).

> 🔒 **Ei mukana:** `/api/ahmaliiga/*` (fantasialiiga), `/api/me*`, `/api/auth*`,
> `/api/admin*`, `/api/reservation*` (luonti/muokkaus), backup/restore — nämä vaativat
> käyttäjä- tai admin-authin eivätkä ole julkisia.

---

## Joukkueiden Jopox-tunnisteet (`subsiteId`)

Roster- ja tapahtuma-endpointit tarvitsevat joukkueen `subsiteId`:n:

| subsiteId | Joukkue | Ikäluokka |
|---|---|---|
| 9947 | Edustus | Miehet |
| 9974 | Edustus naiset | Naiset |
| 9948 | U20 | 2006 |
| 9949 | U18 | 2009 |
| 9951 | U15 | 2012 |
| 9952 | U14 | 2013 |
| 9953 | U13 | 2014 |
| 9955 | U11 | 2016 |
| 9972 | U10 | 2017 |
| 9973 | U9 | 2018 |
| 10272 | Leijona-Kiekkokoulu | 2019 ja nuoremmat |

---

## Pelit & tulokset (tulospalvelu)

### `GET /getSeasonGames`
Koko kauden Kiekko-Ahma-pelit yhdellä kutsulla (suositelluin lähtökohta).

| Param | Pakko | Kuvaus |
|---|---|---|
| `season` | ei | Kevätvuosi (esim. `2027`). Oletus = kuluva kausi. |

**Vastaus:** JSON-taulukko peliobjekteja. Kentät:
`id`, `date` (`"YYYY-MM-DD HH:MM"`), `home`, `away`, `homeTeamId`, `awayTeamId`,
`level` (esim. `"U15"`, `"II-Div"`), `levelId`, `league`, `ahmaHome` (bool),
`isHomeGame`, `finished` (0 = ei pelattu, >0 = lopputulos), `period`, `periods` (maalit).

```bash
curl "https://gamezone.kiekko-ahma.fi/api/getSeasonGames?season=2027"
```

### `GET /getGames`
Yhden viikon pelit (kevyempi kuin koko kausi).

| Param | Pakko | Kuvaus |
|---|---|---|
| `date` | ei | Mikä tahansa päivä kohdeviikolla, `YYYY-MM-DD`. Oletus = kuluva viikko. |
| `includeAway` | ei | `1`/`true` = myös vieraspelit. Oletus vain kotipelit. |

**Vastaus:** sama peliobjekti kuin yllä.

```bash
curl "https://gamezone.kiekko-ahma.fi/api/getGames?date=2026-09-05&includeAway=1"
```

### `GET /getTeams`
Kiekko-Ahman joukkueet tulospalvelussa (kaudelle).

| Param | Pakko | Kuvaus |
|---|---|---|
| `season` | ei | Kevätvuosi. Oletus = kuluva kausi. |

### `GET /getGameReport`
Yhden pelin box score (maalit, syötöt, maalivahdit, kokoonpanot). Tunnisteet saat
`getSeasonGames`-pelistä.

| Param | Pakko | Kuvaus |
|---|---|---|
| `date` | kyllä | Pelin päivä `YYYY-MM-DD`. |
| `home` | kyllä | `homeTeamId` pelistä. |
| `away` | kyllä | `awayTeamId` pelistä. |
| `extId` | kyllä | pelin `id`. |

**Vastaus:** `{ goals[], goalies[], rosters:{home,away}, extras[], … }`.
Kokoonpanoissa `players[]` sisältää `{ number, last, first, role }` (role: `MV`=maalivahti,
`OP/VP`=puolustaja, `OL/VL/KH`=hyökkääjä). ⚠️ Vain pelatuista peleistä; esikauden
pelaamattomista ei ole raporttia.

```bash
curl "https://gamezone.kiekko-ahma.fi/api/getGameReport?date=2026-09-05&home=123&away=456&extId=724885"
```

### `GET /getTeamSeries`
Mitä sarjoja ikäluokka pelaa kaudella (palauttaa `subSerieId`:t taulukoita varten).

| Param | Pakko | Kuvaus |
|---|---|---|
| `age` | kyllä | Ikäluokka, esim. `U15`. |
| `season` | ei | Kevätvuosi. |

### `GET /getSeriesTable`
Yksi sarjataulukko (sarjatilanne / pistepörssi / maalivahdit).

| Param | Pakko | Kuvaus |
|---|---|---|
| `season` | kyllä | Kevätvuosi. |
| `subSerieId` | kyllä | Sarjan id (`getTeamSeries`:stä). |
| `levelId` | ei | Taso, jos sarjassa useita. |
| `tab` | ei | `standings` (oletus) \| `scorers` \| `goalies`. |

```bash
curl "https://gamezone.kiekko-ahma.fi/api/getSeriesTable?season=2027&subSerieId=12345&tab=standings"
```

---

## Joukkuesivut (Jopox / seuran sivut)

### `GET /getTeamRoster`
Joukkueen kokoonpano + toimihenkilöt seuran sivuilta.

| Param | Pakko | Kuvaus |
|---|---|---|
| `subsiteId` | kyllä | Joukkueen Jopox-id (ks. taulukko yllä). |

**Vastaus:** `{ players:[{ name, number, role, position, photo }], officials:[…] }`.

```bash
curl "https://gamezone.kiekko-ahma.fi/api/getTeamRoster?subsiteId=9951"
```

### `GET /getTeamEvents`
Joukkueen tulevat tapahtumat (harjoitukset + pelit) seuran julkisesta kalenterista,
tästä päivästä eteenpäin.

| Param | Pakko | Kuvaus |
|---|---|---|
| `subsiteId` | kyllä | Joukkueen Jopox-id. |

**Vastaus:** taulukko `{ date, time?, title, type, place }`.

### `GET /getEventDetail`
Yksittäisen tapahtuman lisätiedot (vapaa kuvausteksti).

| Param | Pakko | Kuvaus |
|---|---|---|
| `eventId` | kyllä | Tapahtuman id (`getTeamEvents`:stä). |
| `type` | ei | `training` \| `game`. |
| `subsiteId` | tarv. treeneille | Joukkueen id (harjoitustapahtumille). |

---

## Seuratiedot

### `GET /getPartners`
Yhteistyökumppanit / sponsorit. **Vastaus:** taulukko `{ name, image (URL), www }`.

### `GET /getOrganisation`
Seuran organisaation yhteystiedot (johtokunta ym.). **Vastaus:** `officials`-taulukko
(nimi, rooli, yhteystiedot).

### `GET /getNews`
Seuran uutiset. **Vastaus:** taulukko `{ id, date, title, ingress, text (HTML), imageId }`.

---

## Jäävuorot (jäähallin varaukset)

### `GET /schedule`
Yhden viikon jäävuorot raakana (sis. värikoodin).

| Param | Pakko | Kuvaus |
|---|---|---|
| `date` | ei | Päivä kohdeviikolla `YYYY-MM-DD`. Oletus = kuluva viikko. |

> ℹ️ Kesällä halli on kiinni → tyhjä. Sesongin testipäiviä: `?date=2026-08-11`.

### `GET /getReservations`
Jäävuorot vapaalta aikaväliltä yhdellä kutsulla (normalisoitu).

| Param | Pakko | Kuvaus |
|---|---|---|
| `from` | kyllä | Alkupäivä `YYYY-MM-DD`. |
| `to` | kyllä | Loppupäivä `YYYY-MM-DD` (max ~1 vuosi). |

**Vastaus:** taulukko `{ id, start, end, durationMinutes, text }` (`text` = varauksen nimi;
"Tilapäisvaraus" ≈ ottelu).

```bash
curl "https://gamezone.kiekko-ahma.fi/api/getReservations?from=2026-09-01&to=2026-09-30"
```

---

## Tyypillinen kulku valmennussovellukselle

1. `getSeasonGames?season=2027` → oman ikäluokan pelit (suodata `level` / `home`/`away`).
2. Peliä klikatessa `getGameReport?date=&home=&away=&extId=` → box score + kokoonpanot.
3. `getTeamSeries?age=U15` → `subSerieId` → `getSeriesTable?...&tab=standings|scorers` → sarjatilanne.
4. `getTeamRoster?subsiteId=9951` → kokoonpano; `getTeamEvents?subsiteId=9951` → harjoitukset/pelit.
5. `getReservations?from=&to=` → jäävuorot.

Kysymykset / CORS-originin lisäys / uudet kentät → ota yhteyttä ylläpitoon.
