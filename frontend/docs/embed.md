# Beágyazás — egy helyen minden

**Kód forrás (konstansok, URL-építők, snippetek):** `app/lib/embedSiteConfig.ts`  
**Külső loader:** `public/embed.js`  
**Belső demó (iframe):** `app/components/HomeEntry/HomeEntry.tsx`

---

## Mentális modell (fontos)

- **URL** és **beágyazás** két külön dolog.
- A `ghost=1` (és társai) csak egy **normál webcím** query része — önmagában **nem** ágyaz be semmit.
- **Beágyazás** = a böngészőben egy **`<iframe src="…">`**, ahol a `src` **pont ez az embed URL**.

Összehasonlítás: YouTube link vs YouTube beágyazott player — ugyanaz a tartalom, de az iframe **bent marad** a host oldalon.

---

## Mit csinál a `ghost=1`?

A player (StoryPage) ezt látja, és **kevesebb krómot** rajzol (pl. nincs header), **átlátszóbb** háttér — iframe-be való használatra.  
Attól még a cím **sima HTTPS URL** marad.

---

## Külső oldal: két módszer

### A) Iframe (legegyszerűbb)

```html
<iframe
  src="IDE_A_TELJES_EMBED_URL_queryvel"
  title="…"
  style="display:block;width:100%;border:0;min-height:400px;height:400px;"
  allow="fullscreen"
  sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"
></iframe>
```

A **teljes URL** formátuma:

`https://<PLAYER_ORIGIN>/embed/<kampány_id>?src=/stories/….json&start=…&skin=…&ghost=1&gmin=…`

A **`HOME_GHOST_EMBED`** objektum a kódban adja meg a demó kampányt és paramokat; ugyanezt más történetre átírva kapsz új linket.

### B) `embed.js`

```html
<script src="https://<PLAYER_ORIGIN>/embed.js"
  data-campaign="kampány_id"
  data-src="/stories/….json"
  data-start="…"
  data-skin="…"
  data-title="…"
  data-mode="ghost"
  data-gmin="440"
></script>
```

A script **létrehozza az iframe-et** és beállítja a `src`-t (és figyeli a `postMessage` magasságot).  
Opcionális: `data-gmax`, `data-runes`, `data-runemode`, `data-c`, `data-analytics="1"`.

---

## Query paraméterek (röviden)

| Param      | Jelentés |
|-----------|----------|
| `src`     | Story JSON útvonal a player originjén |
| `start`   | Kezdő oldal id |
| `skin`    | Skin id (`/skins/<id>.json`) |
| `ghost`   | `1` = ghost mód |
| `gmin`    | Min. küldött iframe-magasság (px), rövid tartalomnál |
| `gmax`    | Max magasság; felette belső görgetés (ghost) |
| `c`       | Kampány id (analytics / localStorage), ha kell |

---

## Player origin (fejlesztés / éles)

- **`NEXT_PUBLIC_EMBED_PLAYER_ORIGIN`** (pl. `http://localhost:3000`) — embed URL és `embed.js` ugyanerről az originről.
- Ha nincs beállítva: SSR-ben a kód **éles fallback** originre esik; lokálisan állíts env-et.

---

## Hol mi a kódban

| Rész | Fájl |
|------|------|
| Konfig + URL + snippet függvények | `app/lib/embedSiteConfig.ts` |
| postMessage magasság (belső) | `app/lib/embedParentMessaging.ts`, `useEmbedParentResize.ts`, `useEmbedParentIframeHeight.ts` |
| `gmin` / `gmax` olvasása | `app/components/StoryPage/StoryPage.tsx` |
| Ghost háttér / görgetés | `app/components/embed/EmbedGhostDocumentBg.tsx` |

---

## Visszafelé kompatibilis export nevek

Ugyanabban a modulban (`embedSiteConfig.ts`): `buildMarketingEmbedUrl`, `buildQuestellNodeGraphGhostEmbedUrl`, `EMBED_CAMPAIGN_ID`, `QUESTELL_NODE_GRAPH_CAMPAIGN_ID`, stb. — régi importok helyett minden innen: `@/app/lib/embedSiteConfig`.
