# Skin contract rendszer és skinek áttekintése

## 1. Skin contract (technikai)

### Betöltés
- **Fájl:** `frontend/app/lib/tokenLoader.ts`
- **Típus:** `TokensJson = { id?: string; title?: string; tokens: Record<string, string> }`
- A skin JSON **kötelezően** tartalmaz `tokens` objektumot. A kulcsok CSS custom property nevek (pl. `--contract-header-bg-color-top`), az értékek stringek (CSS értékek).
- A loader a `tokens` kulcsokat a **document.documentElement**-re írja: `root.style.setProperty(k, v)`.
- A skinek URL-je: `/skins/{skinId}.json` (pl. `contract_default`, `neon_fiesta`).

### Regiszter
- **Fájl:** `frontend/public/skins/registry.json`
- A listázott skinek jelennek meg a UI-ban (Adventures, Present stb.). Minden skin: `{ "id": "...", "title": "...", "preview": "/assets/skins/....png" }`.
- **Új skin:** 1) `public/skins/{id}.json` fájl, 2) bejegyzés a `registry.json` `skins` tömbjébe.

---

## 2. Skinek listája (public/skins/*.json)

| Fájl | Leírás / stílus |
|------|------------------|
| **contract_default.json** | Alapértelmezett contract: sötét overlay, fehér szöveg, rune dock, quiz, media, CTA overlay – **a legteljesebb token készlet**. |
| **contract_coffee_dark_roast.json** | Kávé barnák, világos háttér, teljes typography + media frame (--mf-*). |
| **contract_creative_light_breeze.json** | Világos kék/narancs, modern contract, teljes --mf-* és typography. |
| **contract_softdrink_fresh.json** | Zöld/türkiz „fresh” contract, sötét háttér, --mf-* és media SVG tokenek. |
| **kari.json** | Karácsonyi (id: contract_christmas_candy), v2, sok token. |
| **karacsony.json** | (Ha létezik és különbözik, szintén karácsonyi.) |
| **neon_fiesta.json** | Neon színek, kevesebb token (nincs --mf-*, nincs teljes typography skála). |
| **lux_gold.json** | Luxus arany stílus. |
| **aurora_pro.json** | Aurora stílus. |
| **forest_dark.json** | Sötét erdei. |
| **brand_chameleon.json** | Brand chameleon. |

---

## 3. Token kategóriák (amit a komponensek használnak)

A **legacy-contract-overlay.css** és a komponensek ezekre a prefixekre / csoportokra építenek:

- **--brand-accent** – központi akcentusz szín (focus, glow).
- **--contract-font-family**, **--contract-typography-a-*** (header/CTA), **--contract-typography-b-*** (tartalom).
- **--contract-header-*** – fejléc háttér, border, radius, logo, title, shadow.
- **--contract-actionbar-*** – action bar háttér, border, szöveg.
- **--contract-choice-*** – választék kártyák háttér, border, szöveg, shadow.
- **--contract-cta-*** – CTA gomb és overlay (bg, border, radius, overlay title stb.).
- **--contract-bg-*** – oldal háttér (color, image, overlay, blur).
- **--contract-rune-dock-***, **--contract-rune-slot-*** – rune dock és slotok (contract_default-ban van).
- **--contract-media-*** – MediaFrame SVG gradientek (svg-base-1/2/3, svg-inner-*, logo-bay-fill, overlay).
- **--mf-*** – MediaFrame belső keret (max-w, pad, radius, border, bg, shadow, svg-*, logo box).
- **--contract-quiz-*** – quiz success/error border és shadow (contract_default).
- **--contract-transition-***, **--contract-interactive-*** – hover/active scale, shadow, tint.
- **--icon-*** – ikon stroke/fill/opacity (contract_default).

Ha egy tokent nem adsz meg, a **legacy-contract-overlay.css** és a komponensek fallback értékeket használnak (pl. `var(--contract-choice-text-color, #fff)`).

---

## 4. Melyik skint vedd mintának az új skinhöz?

| Cél | Ajánlott minta | Indoklás |
|-----|----------------|----------|
| **Teljes, minden komponensre (header, choice, CTA, media, rune, quiz)** | **contract_default.json** | Legtöbb token egy helyen; rune dock, quiz, icon tokenek is megvannak. |
| **Új „contract” brand skin (világos/sötét, modern)** | **contract_creative_light_breeze.json** vagy **contract_coffee_dark_roast.json** | Tiszta, teljes contract (typography, --mf-*, header, actionbar, choice, cta, bg), nincs rune/quiz, de minden fontos UI elem lefedve. |
| **Egyszerűbb, gyors reskin (kevesebb token)** | **neon_fiesta.json** | Kevesebb token, nincs --mf-* és teljes typography – a többi fallbackre esik. |

**Gyakorlati javaslat:**  
- Ha **új, teljes értékű contract skint** csinálsz (pl. új ügyfél / kampány): **contract_creative_light_breeze.json** vagy **contract_coffee_dark_roast.json** másold ki alapnak, és cseréld a színeket, fontot, esetleg --mf-* értékeket.  
- Ha **minden kis részt** (rune, quiz, icon) is egy skinben akarsz kontrollálni: **contract_default.json** legyen a minta.

---

## 5. Új skin létrehozása (lépések)

1. Másold ki a választott mintát (pl. `contract_creative_light_breeze.json`).
2. Nevezd át fájlnak: `public/skins/{uj_skin_id}.json`.
3. A JSON-ban módosítsd: `"id": "uj_skin_id"`, `"title": "Új skin neve"`.
4. A `tokens` objektumban cseréld a színeket, gradienteket, fontot stb. (a kulcsok neveit ne változtasd).
5. Add hozzá a skin bejegyzést: `frontend/public/skins/registry.json` → `skins` tömb:  
   `{ "id": "uj_skin_id", "title": "Új skin neve", "preview": "/assets/skins/uj_skin_id.png" }`.
6. (Opcionális) Készíts preview képet: `public/assets/skins/uj_skin_id.png`.

Ezekkel az új skin fájl a contract rendszerrel kompatibilis, és a registry miatt megjelenik a skin választóban.
