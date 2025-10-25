# 🧱 SECURITY_OFFLINE.md  
### Offline biztonsági baseline — aktuális állapot  
**Cél:** szerver- és domain-nélküli biztonsági réteg ellenőrzőlista  
**Verzió:** v1.1 (2025-10-26)

---

## ✅ 1. Rate-limit véglegesítése
- Kulcs: `sessionId` (→ `sessionId.ts`)  
- Bucket méret: 100 / 60s (SMOKE tesztben 5 / 1s)  
- Burst-védelem: bucket-alapú  
- UI-visszajelzés: *Too many actions* (HTTP nélkül)  
- Teszt: `[SMOKE][RATE] ok: true`  
- Forrás: `rateLimiter.ts`

---

## ✅ 2. Cache-policy lezárása
- TTL: **5 perc**  
- Max entries: **1000**  
- Eviction: **LRU**  
- “no-disk” garancia  
- Cache-key formátum: `storyId|pageId|skin|runes`  
- Futtatás kizárólag memóriában  
- Teszt: `[SMOKE][CACHE] ok: true`  
- Forrás: `cachePolicy.ts`, `cacheKey.ts`

---

## ✅ 3. Token / paraméter integritás
- Fagyasztás: `Object.freeze(config)` a runtime-ban  
- Aláírás: `HMAC(localSalt, { campaignId, storyId, skin, runes })`  
- Fallback skin: `contract_default` manipuláció esetén  
- Teszt: `[SMOKE][CFG] ok: true`  
- Forrás: `configGuard.ts`

---

## ✅ 4. Robusztus hiba- és eseménylog
- Formátum: `[SEC]<ts><lvl><code><msg><ctxJson>`  
- PII-szűrés: `sessionId` → maszkolt formátum (`sx_d2j...`)  
- Egységes logger: `secLog.ts`  
- Minden kritikus út try/catch alatt  
- Tesztelve: smoke log output (`[SEC]`, `[SMOKE][FINAL]`)  
- Nincs uncaught exception  

---

## ✅ 5. Sandbox-lint és type-check pipeline
- Külön lint config: `eslint.security.config.cjs`  
  - Flat config, csak `app/lib/security/**/*.ts`  
  - Browser globálok engedélyezve (`window`, `process`, `console`)  
  - `no-explicit-any` csak lokálisan feloldva  
- Külön TypeScript config: `tsconfig.security.json`  
- Parancsok:
  ```bash
  npm run lint:security
  npm run check:security
  ```
- Futási feltétel: `--max-warnings=0`  
- Állapot: mindkettő **tiszta** (`0 errors, 0 warnings`)  

---

## ✅ 6. Build / dependency higiénia

- 2025-10-25-én lefuttatott dependency audit (`npm audit`, `npm outdated`) mentve: `frontend/security-audit.txt`.  
- A frontend Next.js runtime jelenleg `next@15.4.2`, React `19.1.0`.  
- Az audit 1 db közepes súlyosságú (moderate) sérülékenységet jelzett a Next.js csomagban (Image Optimization / cache key confusion, middleware redirect → SSRF, content injection).  
  - Javítás elérhető a `next@15.5.6` vagy újabb verzióban, de ez már a deklarált verziótartományon kívüli főverzióváltás.  
  - A frissítés most **tudatosan halasztva**: a jelenlegi build nem publikusan elérhető, csak fejlesztői környezetben fut.  
  - Publikus staging vagy éles domainre telepítés előtt kötelező frissítés `next@>=15.5.6` vagy aktuális stabil verzióra.
- Magas / kritikus (high / critical) sérülékenység: **0**.
- Verziókövetés státusz:
  - `next` 15.4.2 → latest 16.0.0  
  - `react` / `react-dom` 19.1.0 → latest 19.2.0  
  - `tailwindcss` 4.1.11 → 4.1.16  
  - `sass` 1.89.2 → 1.93.2  
  - `typescript` 5.8.3 → 5.9.3  
  - `@sentry/nextjs`, `framer-motion`, `@types/*` stb. elérhetők frissebb patch/minor szinten.  

**Dev-only garanciák:**  
- `LOCAL_SALT` a `frontend/app/lib/security/configGuard.ts` fájlban auditáltan dokumentálva, kizárólag fejlesztői só; nem használunk production titkot.  
- A biztonsági smoke (`window.runSecSmoke`) és mély diagnosztikai logok (`[PG4 DEBUG]`, `[RECALL DIAG]`) kizárólag `NODE_ENV !== "production"` esetén aktívak.  
- Production buildben ezek a kódblokkok nem regisztrálódnak és nem logolnak belső állapotot a böngésző konzolra.

---

### Összegzés
Az **offline biztonsági réteg** teljes egészében működik fejlesztői környezetben,  
szerver és domain nélkül.  

A következő modulok **implementálva és tesztelve**:  
`rateLimiter`, `cachePolicy`, `configGuard`, `secLog`, `securitySmokeTest`  
és a dedikált lint + typecheck pipeline.  

**Állapot:** ✅ Offline baseline lezárva (v1.1)
