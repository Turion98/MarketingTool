# 🧱 SECURITY_OFFLINE.md  
### Offline biztonsági baseline — aktuális állapot  
**Cél:** szerver- és domain-nélküli biztonsági réteg ellenőrzőlista  
**Verzió:** v1.0 (2025-10-24)

---

## ✅ 1. Rate-limit véglegesítése
- Kulcs: `sessionId` (→ `sessionId.ts`)  
- Bucket méret: 100/60s (SMOKE tesztben 5/1s)  
- Burst-védelem: bucket-alapú  
- UI-visszajelzés: *Too many actions* (HTTP nélkül)  
- Teszt: `[SMOKE][RATE] ok: true`

---

## ✅ 2. Cache-policy lezárása
- TTL: 5 perc  
- Max entries: 1000  
- Eviction: LRU  
- “no-disk” garancia  
- Cache-key formátum: `storyId|pageId|skin|runes`  
- Teszt: `[SMOKE][CACHE] ok: true`

---

## ✅ 3. Token / paraméter integritás
- `Object.freeze(config)` a runtime-ban  
- Aláírás: `HMAC(localSalt, { campaignId, storyId, skin, runes })`  
- Fallback skin: `contract_default` manipuláció esetén  
- Teszt: `[SMOKE][CFG] ok: true`

---

## ✅ 4. Robusztus hiba- és eseménylog
- Formátum: `[SEC]<ts><lvl><code><msg><ctxJson>`  
- PII maszkolás (pl. `sessionId → sx_d2j...`)  
- Egységes logger (`secLog.ts`)  
- Nincs uncaught exception

---

*(A további pontok majd csak akkor kerülnek be, ha ténylegesen implementáltuk őket.)*
