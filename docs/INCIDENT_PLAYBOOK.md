# Incident Response Playbook (Skeleton)

## 1) Felismerés
- Forrás: Sentry riasztás, CI scan, felhasználói bejelentés.
- Gyors osztályozás: SEV-1 (adatvesztés/szivárgás), SEV-2 (szolgáltatás-degradáció), SEV-3 (kis hatás).

## 2) Első lépések
- Incident Commander kijelölése.
- Kommunikációs csatorna: #incident-current (privát).
- Érintett komponensek leírása, naplógyűjtés (Sentry event, CI log).

## 3) Elhárítás (Containment)
- Érintett kulcsok/secrets rotációja.
- Ideiglenes leállítás vagy feature flag off, ha kell.
- Hotfix branch létrehozása, PR review kötelező.

## 4) Megszüntetés & helyreállítás
- Root cause elemzés (RCA) vázlat.
- Patch kiadása, ellenőrzés.
- Monitorozás (Sentry, metrikák) 24–72h.

## 5) Utólagos teendők
- RCA dokumentum, tanulságok (runbooks frissítése).
- Teszt/scan bővítése, szabályok szigorítása.
