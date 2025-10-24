// frontend/app/lib/security/sessionId.ts
//
// Offline, domainfüggetlen "user azonosító", amit a rate limiter kulcsként használ.
// Nem küldjük sehova, csak lokális használatra van.
// Nem tartalmaz PII-t, random generált string.
//
// Használat:
//   import { getSessionId } from "@/app/lib/security/sessionId";
//   const sid = getSessionId();

const STORAGE_KEY = "qz_session_id_v1";

function randomId(): string {
  // pl. "sx_83k2f1h2h1s0f9sdf" formátum
  return (
    "sx_" +
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2)
  );
}

export function getSessionId(): string {
  if (typeof window === "undefined") {
    // SSR alatt nincs localStorage, de SSR alatt nem is limitálunk.
    return "ssr";
  }

  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing && existing.length > 0) {
      return existing;
    }
  } catch {
    // ha localStorage dob (pl. disabled), fallback memóriára
  }

  const fresh = randomId();

  try {
    window.localStorage.setItem(STORAGE_KEY, fresh);
  } catch {
    // ha nem tudjuk menteni, akkor is visszaadjuk a frisset
  }

  return fresh;
}
