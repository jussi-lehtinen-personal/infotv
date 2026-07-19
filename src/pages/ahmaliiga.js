import React from "react";
import { Box, Typography, Card, Stack } from "@mui/material";
import { MuiHeader } from "../components/ui/MuiHeader";
import { useGoBack } from "../hooks/useGoBack";

// Ahmaliiga rules — a simple, kid-friendly explainer of the fantasy game.
// Built as a real page (route /ahmaliiga) but NOT linked from any nav yet
// (reachable only by URL, like /report and /stats). Same MUI theme as the rest.
// Content mirrors docs/ahmaliiga.md. See memory: project_ahmaliiga_plan.

const Section = ({ emoji, title, children }) => (
  <Card variant="outlined" sx={{ bgcolor: "background.paper", borderColor: "divider", borderRadius: "var(--radius-card)", p: 2 }}>
    <Typography
      component="h2"
      sx={{ fontFamily: "var(--font-family-display)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "var(--font-display-tracking)", fontSize: 18, lineHeight: 1.2, mb: 1.25, color: "text.primary" }}
    >
      <Box component="span" sx={{ mr: 1 }}>{emoji}</Box>
      {title}
    </Typography>
    {children}
  </Card>
);

const Rule = ({ label, value, dim }) => (
  <Stack
    direction="row"
    alignItems="center"
    spacing={1.5}
    sx={{ py: 0.9, borderBottom: "1px solid var(--color-surface-divider)", "&:last-of-type": { borderBottom: 0 } }}
  >
    <Typography variant="body2" sx={{ color: "text.secondary", flex: 1, minWidth: 0 }}>{label}</Typography>
    <Box
      sx={{
        flexShrink: 0, minWidth: 62, textAlign: "right",
        fontFamily: "var(--font-family-display)", letterSpacing: "var(--font-display-tracking)",
        fontSize: 22, lineHeight: 1,
        color: dim ? "text.disabled" : "primary.main",
      }}
    >
      {value}
    </Box>
  </Stack>
);

const Lead = ({ children }) => (
  <Typography variant="body2" sx={{ color: "text.secondary", lineHeight: 1.55, mb: 1 }}>{children}</Typography>
);

// One worked example squad: rows (pick → points) + a total + a takeaway note.
const Example = ({ badge, title, rows, total, note }) => (
  <Box sx={{ borderRadius: "var(--radius-item)", border: "1px solid var(--color-surface-border)", bgcolor: "var(--color-surface)", p: 1.5 }}>
    <Typography sx={{ fontWeight: 800, color: "text.primary", mb: 0.85 }}>{badge} {title}</Typography>
    <Stack spacing={0.6}>
      {rows.map((r, i) => (
        <Stack key={i} direction="row" alignItems="center" spacing={1}>
          <Typography variant="body2" sx={{ color: "text.secondary", flex: 1, minWidth: 0 }}>{r.label}</Typography>
          <Box sx={{ flexShrink: 0, minWidth: 40, textAlign: "right", fontFamily: "var(--font-family-display)", fontSize: 18, lineHeight: 1, color: "primary.main" }}>{r.pts}</Box>
        </Stack>
      ))}
    </Stack>
    <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 0.85, pt: 0.85, borderTop: "1px solid var(--color-surface-divider)" }}>
      <Typography variant="body2" sx={{ flex: 1, fontWeight: 800, color: "text.primary" }}>Yhteensä</Typography>
      <Box sx={{ flexShrink: 0, fontFamily: "var(--font-family-display)", fontSize: 22, lineHeight: 1, color: "primary.main" }}>{total}</Box>
    </Stack>
    <Typography variant="caption" sx={{ display: "block", color: "text.secondary", mt: 0.75, lineHeight: 1.45 }}>{note}</Typography>
  </Box>
);

const Ahmaliiga = () => {
  const goBack = useGoBack("/");

  return (
    <Box sx={{ minHeight: "100dvh", bgcolor: "background.default", color: "text.primary", pb: "var(--ui-bottom-nav-clearance, 80px)" }}>
      <MuiHeader title="Ahmaliiga" subtitle="Näin peli toimii" onBack={goBack} />

      <Box sx={{ maxWidth: 560, mx: "auto", px: 1.5, display: "flex", flexDirection: "column", gap: 1.25 }}>
        <Box
          component="img"
          src="/ahmaliiga_logo.png"
          alt="Ahmaliiga"
          sx={{ width: "min(82vw, 320px)", height: "auto", aspectRatio: "1 / 1", objectFit: "contain", alignSelf: "center", mt: 1, mb: 0.5, filter: "drop-shadow(0 10px 26px rgba(0,0,0,.5))" }}
        />

        <Lead>
          Kokoat oman <b>unelmajoukkueen</b> Kiekko-Ahman korteista. Kun oikeat
          Ahma-joukkueet ja pelaajat pelaavat oikeita pelejä, <b>sinä saat niistä
          pisteitä</b>. Se jolla on eniten pisteitä, voittaa! 🧡
        </Lead>

        <Section emoji="🃏" title="1. Kokoa kortisto">
          <Lead>
            <b>Joukkuekortit</b> = kaikki Ahma-joukkueet (U11, U12, U13, … Edustus,
            Naiset). <b>Tähtikortit</b> = muutama aikuispelaaja. Kokoat 5 kortin
            joukkueen, jossa on <b>vähintään 2 joukkuekorttia</b> — loput 3 paikkaa
            saavat olla joukkueita tai tähtiä.
          </Lead>
          <Lead>
            Sinulla on tietty määrä <b>Ahma-coineja</b> 🪙 (budjetti). Parhaat kortit
            maksavat enemmän, joten et voi ostaa pelkkiä parhaita — pitää valita fiksusti!
          </Lead>
          <Box sx={{ mt: 1, p: 1.25, borderRadius: "var(--radius-item)", bgcolor: "rgba(var(--color-primary-rgb),0.08)", border: "1px solid rgba(var(--color-primary-rgb),0.25)" }}>
            <Typography variant="body2" sx={{ color: "text.secondary", lineHeight: 1.5 }}>
              💡 <b>Vinkki:</b> hyvässä vireessä olevat joukkueet maksavat enemmän. Jos
              huomaat nousussa olevan mutta vielä halvan joukkueen — nappaa se ajoissa!
            </Typography>
          </Box>
        </Section>

        <Section emoji="🎯" title="2. Kerää pisteitä">
          <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".04em" }}>Joukkuekortti</Typography>
          <Box sx={{ mb: 1.5, mt: 0.5 }}>
            <Rule label="Voitto" value="3" />
            <Rule label="Tasapeli" value="1" />
            <Rule label="Tappio" value="0" dim />
            <Rule label="Nollapeli (ette päästä maalia)" value="+2" />
            <Rule label="Iso voitto (monta maalia enemmän)" value="+1–2" />
          </Box>
          <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".04em" }}>Tähtikortti — kenttäpelaaja</Typography>
          <Box sx={{ mb: 1.5, mt: 0.5 }}>
            <Rule label="Maali" value="3" />
            <Rule label="Syöttö" value="2" />
          </Box>
          <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".04em" }}>Tähtikortti — maalivahti</Typography>
          <Box sx={{ mt: 0.5 }}>
            <Rule label="Voitto" value="3" />
            <Rule label="Nollapeli (ei päästä maalia)" value="+4" />
            <Rule label="Torjunta-% ≥ 88 %" value="+2" />
            <Rule label="Torjunta-% ≥ 92 %" value="+3" />
          </Box>
        </Section>

        <Section emoji="⭐" title="3. Valitse kapteeni">
          <Lead>
            Valitse yksi korttisi <b>kapteeniksi</b> — se saa <b>tuplapisteet</b>
            (kaikki pisteet kerrotaan kahdella)!
          </Lead>
          <Lead>
            Valitse se joukkue tai pelaaja, jonka uskot pärjäävän parhaiten. Tämä on
            yksi pelin tärkeimmistä valinnoista.
          </Lead>
        </Section>

        <Section emoji="🔮" title="4. Veikkaa peli">
          <Lead>Joka kierros saat myös arvata yhden pelin lopputuloksen ja saada bonuspisteitä:</Lead>
          <Box>
            <Rule label="Oikea voittaja" value="+3" />
            <Rule label="Oikea voittaja ja maaliero" value="+5" />
            <Rule label="Ihan tarkka tulos" value="+8" />
          </Box>
        </Section>

        <Section emoji="🏆" title="5. Jaksot ja palkinnot">
          <Lead>
            Peli etenee <b>2 viikkoa kerrallaan</b> — sitä sanotaan <b>jaksoksi</b>.
            Joka jakson jälkeen parhaat palkitaan! Ja koko kauden pisteet lasketaan
            yhteen → kauden lopussa selviää <b>Ahmaliigan mestari</b>.
          </Lead>
        </Section>

        <Section emoji="🥇" title="Miten voitan?">
          <Lead>Joka kierros teet kolme tärkeää valintaa:</Lead>
          <Stack spacing={1.25} sx={{ mt: 0.5, mb: 1.25 }}>
            {[
              "Ketkä otat kortistoosi? (fiksusti budjetilla)",
              "Kenet valitset kapteeniksi? (tuplapisteet)",
              "Minkä pelin veikkaat? (bonuspisteet)",
            ].map((t, i) => (
              <Stack key={i} direction="row" alignItems="center" spacing={1.25}>
                <Box sx={{ flexShrink: 0, width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-family-display)", fontSize: 16, lineHeight: 1, color: "primary.main", bgcolor: "rgba(var(--color-primary-rgb),0.15)", border: "1px solid rgba(var(--color-primary-rgb),0.35)" }}>{i + 1}</Box>
                <Typography variant="body2" sx={{ color: "text.primary" }}>{t}</Typography>
              </Stack>
            ))}
          </Stack>
          <Typography variant="body2" sx={{ color: "text.secondary", lineHeight: 1.55 }}>
            Tee nämä hyvin, seuraa miten Ahma-joukkueet pärjäävät — ja kiipeä
            tulostaulun kärkeen! 🐾🧡
          </Typography>
        </Section>

        <Section emoji="🎮" title="Esimerkki: mitä voin valita?">
          <Lead>
            Sinulla on <b>budjetti</b> (esim. 10 <b>Ahma-coinia</b> 🪙) ja poimit esim.
            <b> 5 korttia</b>. Joukkueet ovat halvempia ja tasaisempia, tähtipelaajat kalliimpia ja boom/bust
            (vähintään 2 joukkuekorttia). Yksi kortti <b>kapteeniksi</b> (2×). Voit eri
            jaksoissa painottaa eri tavalla:
          </Lead>
          <Stack spacing={1.25} sx={{ mt: 0.5 }}>
            <Example
              badge="🅰️"
              title="Enemmän joukkueita (turvallinen)"
              rows={[
                { label: "⭐ U13 Valkoinen — voitti 5–1 (kapteeni)", pts: "10" },
                { label: "Naiset — voitti 3–0 (nollapeli)", pts: "5" },
                { label: "U12 Musta — tasapeli", pts: "1" },
                { label: "U14 — tappio", pts: "0" },
                { label: "🥅 Veskari (Edustus) — voitto + nollapeli", pts: "7" },
                { label: "Veikkaus — oikea voittaja", pts: "+3" },
              ]}
              total="≈ 26"
              note="Vähän riskiä, tasaista tuottoa monelta kortilta."
            />
            <Example
              badge="🅱️"
              title="Enemmän pelaajia (rohkea)"
              rows={[
                { label: "⭐ Olander (Naiset) — 2 maalia + syöttö (kapteeni)", pts: "16" },
                { label: "Mäkinen (U20) — 1 maali", pts: "3" },
                { label: "U12 Musta — voitti 2–0 (nollapeli)", pts: "5" },
                { label: "U13 Valkoinen — voitti 3–2", pts: "3" },
                { label: "Edustus — tappio", pts: "0" },
                { label: "Veikkaus — tarkka tulos", pts: "+8" },
              ]}
              total="≈ 35"
              note="Isompi katto, mutta iso riski: jos tähti-kapteeni on hiljainen jakso, jakso romahtaa."
            />
          </Stack>
          <Box sx={{ mt: 1.25, p: 1.25, borderRadius: "var(--radius-item)", bgcolor: "rgba(var(--color-primary-rgb),0.08)", border: "1px solid rgba(var(--color-primary-rgb),0.25)" }}>
            <Typography variant="body2" sx={{ color: "text.secondary", lineHeight: 1.5 }}>
              💡 <b>Nyrkkisääntö:</b> enemmän joukkueita = tasaista ja turvallista;
              enemmän pelaajia + tähti-kapteeni = korkea katto mutta boom/bust.
              <b> Kapteeni ratkaisee eniten</b> — nosta se, jonka uskot räjäyttävän jakson.
            </Typography>
          </Box>
        </Section>

        <Typography variant="caption" sx={{ color: "text.disabled", textAlign: "center", mt: 0.5, mb: 1 }}>
          Ahmaliiga on vielä suunnitteilla — säännöt voivat pikkuisen vielä muuttua.
        </Typography>
      </Box>
    </Box>
  );
};

export default Ahmaliiga;
