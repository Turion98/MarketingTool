// frontend/lib/clearVoiceCache.ts

import { evictAudio } from "./audioCache";

type VoiceLsItem = {
  ok?: boolean;
  url?: string;
  durationMs?: number;
  cached?: boolean;
  backend?: string;
  message?: string;
  error?: string;
};

/** Belső: backend bázis feloldása (LocalStorage vagy ENV alapján) */
function getBackendBase(): string {
  if (typeof window === "undefined") return "";
  const fromLs = localStorage.getItem("voiceBackendUrl") || "";
  // NEXT_PUBLIC_* csak böngészőben érhető el
  const fromEnv =
    (typeof process !== "undefined" &&
      (process as any).env?.NEXT_PUBLIC_VOICE_BACKEND) ||
    "";
  return (fromLs || fromEnv || "").replace(/\/+$/, "");
}

/** Belső: abszolút URL normalizálása a későbbi evict-hez */
function toAbsoluteUrl(u?: string | null): string | null {
  const s = String(u ?? "").trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  const base = getBackendBase();
  if (s.startsWith("/")) return base ? `${base}${s}` : s;
  return base ? `${base}/${s.replace(/^\/+/, "")}` : s;
}

/**
 * Törli az összes `voice_` prefixű LocalStorage bejegyzést.
 * Opcionálisan a hozzájuk tartozó előmelegített audio-elemeket is kiüríti az in-memory cache-ből.
 */
export function clearVoiceCache(opts: { evictPreloaded?: boolean } = { evictPreloaded: true }) {
  if (typeof window === "undefined") return;

  const evict = !!opts.evictPreloaded;
  const urlsToEvict: string[] = [];
  const keysToRemove: string[] = [];

  try {
    // Kulcsok összegyűjtése külön (iterálás közben ne módosítsuk a storage-ot)
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("voice_")) {
        keysToRemove.push(key);
        if (evict) {
          // URL kinyerése a JSON-ból, ha van
          try {
            const raw = localStorage.getItem(key);
            if (raw) {
              const parsed = JSON.parse(raw) as VoiceLsItem;
              const abs = toAbsoluteUrl(parsed?.url);
              if (abs) urlsToEvict.push(abs);
            }
          } catch {
            // ignore parse error
          }
        }
      }
    }

    // Törlés LS-ből
    keysToRemove.forEach((k) => localStorage.removeItem(k));

    // In-memory audio cache takarítása (opcionális)
    if (evict && urlsToEvict.length) {
      const unique = Array.from(new Set(urlsToEvict));
      unique.forEach((u) => {
        try { evictAudio(u); } catch {}
      });
      console.log(
        `[clearVoiceCache] Removed ${keysToRemove.length} LS items and evicted ${unique.length} preloaded audio URL(s).`
      );
    } else {
      console.log(`[clearVoiceCache] Removed ${keysToRemove.length} voice cache items.`);
    }
  } catch (err) {
    console.error("[clearVoiceCache] Failed to clear voice cache:", err);
  }
}

/** Visszafelé kompatibilis alias (régi hívásokhoz), alapértelmezett: evict = true */
export const clearVoiceCacheAll = () => clearVoiceCache({ evictPreloaded: true });
