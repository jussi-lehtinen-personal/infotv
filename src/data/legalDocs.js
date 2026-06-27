// Basic starter privacy policy + terms for Ahma Gamezone. This is a plain-
// language template describing what the app actually does — the club should
// review/finalise it (esp. contact details and any legal specifics).

const UPDATED = "27.6.2026";
const ORG = "Valkeakosken Kiekko-Ahma ry";

export const LEGAL_DOCS = {
  privacy: {
    title: "Tietosuojaseloste",
    updated: UPDATED,
    intro:
      "Tämä seloste kuvaa, mitä tietoja Ahma Gamezone -sovellus kerää sinusta ja miten niitä käsitellään. Pyrimme keräämään vain sen, mikä on tarpeen palvelun toimintaan.",
    sections: [
      {
        h: "Rekisterinpitäjä",
        p: `${ORG}. Tietosuojaa koskevissa asioissa voit ottaa yhteyttä seuraan seuran verkkosivujen kautta (kiekko-ahma.fi).`,
      },
      {
        h: "Mitä tietoja keräämme",
        p: [
          "Nimimerkki, jonka itse valitset",
          "Valitsemasi profiilikuva (jos lisäät sellaisen)",
          "Sähköpostiosoite ja Google-tilin tunniste, jos kirjaudut Google-tilillä",
          "Passkey-tunnistautumisen julkiset avaimet (emme näe sormenjälkeäsi, kasvojasi emmekä salasanoja)",
        ],
      },
      {
        h: "Mihin tietoja käytetään",
        p: "Tietoja käytetään kirjautumiseen, tilisi tunnistamiseen ja profiilisi näyttämiseen. Emme käytä tietojasi mainontaan emmekä myy tai luovuta niitä ulkopuolisille markkinointitarkoituksiin.",
      },
      {
        h: "Tietojen säilytys",
        p: "Tiedot tallennetaan Microsoft Azuren palvelimille EU-alueella (Länsi-Eurooppa). Tiedot säilytetään niin kauan kuin tilisi on olemassa.",
      },
      {
        h: "Kolmannet osapuolet",
        p: [
          "Google — kirjautuminen Google-tilillä (vapaaehtoinen)",
          "Microsoft Azure — palvelininfrastruktuuri ja tietojen tallennus",
          "Otteludata tulee Jääkiekkoliiton tulospalvelusta ja joukkuetiedot seuran Jopox-sivuilta",
        ],
      },
      {
        h: "Sinun oikeutesi",
        p: "Voit tarkastella ja muokata tietojasi sovelluksessa. Voit poistaa tilisi milloin tahansa kohdasta Tietosuoja → Poista tili, jolloin kaikki sinua koskevat tiedot (nimimerkki, profiilikuva, kirjautumistiedot) poistetaan pysyvästi. Sinulla on tietosuojalainsäädännön (GDPR) mukaiset oikeudet tietoihisi.",
      },
      {
        h: "Alaikäiset",
        p: "Palvelu on suunnattu seuran jäsenille ja faneille. Alaikäisen käyttäjän osalta huoltaja vastaa tilin käytöstä ja antaa tarvittaessa suostumuksen.",
      },
      {
        h: "Muutokset",
        p: "Voimme päivittää tätä selostetta palvelun kehittyessä. Merkittävistä muutoksista pyrimme tiedottamaan sovelluksessa.",
      },
    ],
  },

  terms: {
    title: "Käyttöehdot",
    updated: UPDATED,
    intro:
      "Käyttämällä Ahma Gamezone -sovellusta hyväksyt nämä käyttöehdot. Palvelu on Valkeakosken Kiekko-Ahma ry:n ylläpitämä fanisovellus.",
    sections: [
      {
        h: "Palvelu",
        p: "Ahma Gamezone tarjoaa tietoa seuran otteluista, joukkueista, jäävuoroista ja uutisista sekä mahdollisuuden luoda oma käyttäjä. Palvelu on tarkoitettu seuran kannattajille ja jäsenille.",
      },
      {
        h: "Käyttäjätili",
        p: "Vastaat omasta tilistäsi ja sen käytöstä. Älä esiinny toisena henkilönä äläkä luovuta kirjautumistietojasi muille.",
      },
      {
        h: "Sallittu käyttö",
        p: "Älä käytä palvelua laittomaan, loukkaavaan tai häiritsevään tarkoitukseen. Pidätämme oikeuden rajoittaa tai estää väärinkäyttö.",
      },
      {
        h: "Sisältö ja tietojen oikeellisuus",
        p: "Otteludata ja joukkuetiedot tulevat kolmansilta osapuolilta (Jääkiekkoliiton tulospalvelu, Jopox). Emme takaa tietojen virheettömyyttä tai ajantasaisuutta.",
      },
      {
        h: "Palvelun saatavuus",
        p: 'Palvelu tarjotaan "sellaisena kuin se on". Emme takaa, että palvelu on jatkuvasti käytettävissä tai virheetön.',
      },
      {
        h: "Muutokset",
        p: "Voimme muuttaa palvelua, näitä ehtoja tai lopettaa palvelun tarjoamisen.",
      },
      {
        h: "Sovellettava laki",
        p: "Näihin ehtoihin sovelletaan Suomen lakia.",
      },
    ],
  },
};
