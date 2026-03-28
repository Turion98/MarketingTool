# Tervezési lista (backlog)

Rövid, belső jegyzetek — prioritás és sprint nélkül.

## Beágyazás (embed) más weboldalra

- [x] **Külső `<iframe>`:** `frontend/middleware.ts` + `frontend/lib/cspMiddleware.ts` — `/embed` és `/embed/*`: **nincs** `X-Frame-Options`, CSP `frame-ancestors` = `*` vagy `EMBED_FRAME_ANCESTORS` / `NEXT_PUBLIC_EMBED_FRAME_ANCESTORS`. A `next.config.js` **nem** használ `headers()`-t (catch-all ütközés elkerülése). **Fontos:** ha a 3000-as porton régi `next start` fut, előtte állítsd le, különben a curl teszt rossz binárisra megy.
- [ ] **Dokumentáció:** README vagy ügyfél-docs: iframe példa (`src`, `width`/`height`, opcionális sandbox), + „link új lapon” alternatíva.
- [ ] **White-label domainek:** Ha az embed WL hoston fut, állítsd az `EMBED_FRAME_ANCESTORS`-t az **ügyfél landing** domainjeire is (build időben / deploy env).

## Megjegyzés

Más útvonalak továbbra is `frame-ancestors 'none'` + `X-Frame-Options: DENY`.
