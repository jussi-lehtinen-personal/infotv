# Kiekko-Ahma InfoTV

React + Azure Functions -sovellus, joka nayttaa Kiekko-Ahman kotiottelut ja jaavuorot. Deployataan Azure Static Web Apps -palveluun. Toimii myos PWA-sovelluksena (asennettavissa puhelimeen).

## Arkkitehtuuri

```
src/pages/          React-sivut (this_week, schedule, ads, ...)
src/Util.js         Jaetut apufunktiot ja tyylit
api/src/functions/  Azure Functions (getGames, getImage, getTeams, schedule)
public/             Staattiset tiedostot, manifest.json, ikonit
```

**Dataflow:** React frontend -> Azure Functions -> tulospalvelu.leijonat.fi / tilamisu

## Kehitys

### Asenna riippuvuudet

```bash
npm install
cd api && npm install && cd ..
```

### Aja pelkka frontend (mock-datalla)

Aseta `src/Util.js` tiedostossa `dev = true`, sitten:

```bash
npm start
```

Avautuu osoitteeseen http://localhost:3000

### Aja koko stack (frontend + API)

Terminaali 1 - frontend:
```bash
npm start
```

Terminaali 2 - Azure SWA CLI yhdistaa frontendin ja API:n:
```bash
npx swa start http://localhost:3000 --api-location api
```

Koko sovellus osoitteessa http://localhost:4280

## Build

### Production build

```bash
npm run build
```

Tuottaa optimoidun buildin `build/`-kansioon. Sisaltaa service workerin (PWA).

### Testaa production build lokaalisti

```bash
npm run build
npx swa start build --api-location api
```

Avautuu osoitteeseen http://localhost:4280 - PWA-asennus ja service worker toimivat.

## Deployment

Sovellus deployataan Azure Static Web Apps -palveluun. SWA hoitaa automaattisesti:
- React-buildin servaamisen
- Azure Functions API:n
- `staticwebapp.config.json` reitityssaannot ja cache-headerit

## PWA

Sovellus on asennettavissa PWA:na (Progressive Web App):
- Mobilessa: "Lisaa aloitusnayttolle"
- Desktopissa: Selaimen asennusikoni osoiterivilta

Service worker cachettaa:
- Staattiset resurssit (JS/CSS) - precache
- Pelidata (`/api/getGames`) - NetworkFirst, 5min offline-fallback
- Joukkuelogot (`/api/getImage`) - CacheFirst, 7 paivaa
- Joukkuelista (`/api/getTeams`) - StaleWhileRevalidate, 1h
- Jaavuorot (`/api/schedule`) - NetworkFirst, 1h offline-fallback
