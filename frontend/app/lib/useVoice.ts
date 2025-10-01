// lib/useVoice.ts
import { useState, useCallback, useRef } from "react";
import { preloadAudio } from "./audioCache";

export interface VoiceRequest {
  pageId: string;
  promptOverride?: string;
  voice?: string;
  style?: string;
  format?: string; // mp3 / wav / ogg
  reuseExisting?: boolean;
}

export interface VoiceResponse {
  ok: boolean;
  url?: string;          // a backend által visszaadott URL (relatív vagy abszolút is lehet)
  durationMs?: number;
  cached?: boolean;      // lokális (LS) cache találat
  backend?: string;      // diagnosztika
  message?: string;
  error?: string;
}

const LS_PREFIX = "voice_"; // maradjon változatlan, hogy a clearVoiceCache működjön

/** Cache kulcs generálás a pageId + paraméterek alapján */
function makeCacheKey(req: VoiceRequest): string {
  const base = [
    req.pageId,
    req.promptOverride || "",
    req.voice || "",
    req.style || "",
    req.format || "mp3",
  ].join("::");
  return LS_PREFIX + btoa(base);
}

/** LocalStorage beolvasás */
function getFromCache(key: string): VoiceResponse | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as VoiceResponse;
  } catch {
    return null;
  }
}

/** LocalStorage mentés */
function saveToCache(key: string, data: VoiceResponse) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {}
}

/** Backend bázis URL feloldása (LS → ENV → üres/relatív) */
function getBackendBase(): string {
  if (typeof window === "undefined") return "";
  const fromLs = localStorage.getItem("voiceBackendUrl") || "";
  // NEXT_PUBLIC_ csak böngészőben érhető el
  const fromEnv =
    (typeof process !== "undefined" &&
      (process as any).env?.NEXT_PUBLIC_VOICE_BACKEND) ||
    "";
  return (fromLs || fromEnv || "").replace(/\/+$/, ""); // trail slash le
}

/** API kulcs (ha szükséges a backendhez) */
function getApiKey(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const key = localStorage.getItem("voiceApiKey") || "";
  return key || undefined;
}

/** Abszolút URL előállítása preloadhoz (cache-be ABSZOLÚT cím a stabilitásért) */
function resolveAbsoluteUrl(u?: string, base?: string): string | null {
  const s = String(u ?? "").trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;            // már abszolút
  if (s.startsWith("/")) {                          // relatív a backend gyökeréhez
    const b = (base || getBackendBase()).replace(/\/+$/, "");
    return b ? `${b}${s}` : s;
  }
  // tisztán relatív (ritka) → illesszük a base-hez, különben hagyjuk
  const b = (base || getBackendBase()).replace(/\/+$/, "");
  return b ? `${b}/${s.replace(/^\/+/, "")}` : s;
}

/** Egyszerű in-flight dedupe: ugyanarra a cacheKey-re fusson 1 kérés */
const inFlight = new Map<string, Promise<VoiceResponse>>();

export function useVoice() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<VoiceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastAbortRef = useRef<AbortController | null>(null);

  const generateVoice = useCallback(async (req: VoiceRequest) => {
    const cacheKey = makeCacheKey(req);

    // 📦 Először cache ellenőrzés
    const cachedData = getFromCache(cacheKey);
    if (cachedData && cachedData.url) {
      // prewarm audio cache abszolút URL-lel
      try {
        const abs = resolveAbsoluteUrl(cachedData.url);
        if (abs) preloadAudio(abs);
      } catch {}
      setData({ ...cachedData, cached: true });
      return { ...cachedData, cached: true };
    }

    // In-flight dedupe
    if (inFlight.has(cacheKey)) {
      const same = inFlight.get(cacheKey)!;
      const res = await same;
      setData(res);
      if (!res.ok) setError(res.error || "Unknown error");
      return res;
    }

    // 🌐 API hívás
    setLoading(true);
    setError(null);

    // korábbi kérés megszakítása
    try { lastAbortRef.current?.abort(); } catch {}
    const ac = new AbortController();
    lastAbortRef.current = ac;

    const promise = (async (): Promise<VoiceResponse> => {
      const base = getBackendBase(); // pl. http://127.0.0.1:8000 vagy üres → relatív
      const endpoint = base ? `${base}/voice` : "/voice";

      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pageId: req.pageId,
            promptOverride: req.promptOverride,
            voice: req.voice,
            style: req.style,
            format: req.format || "mp3",
            reuseExisting: req.reuseExisting ?? true,
            apiKey: getApiKey(), // opcionális
          }),
          signal: ac.signal,
        });

        if (!res.ok) {
          return { ok: false, error: `HTTP ${res.status}` };
        }

        const json = (await res.json()) as VoiceResponse;

        // Preload: abszolút címmel melegítsünk
        if (json?.url) {
          const abs = resolveAbsoluteUrl(json.url, base);
          try { if (abs) preloadAudio(abs); } catch {}
        }

        const payload: VoiceResponse = {
          ...json,
          backend: base || "relative",
        };

        if (payload.ok && payload.url) {
          saveToCache(cacheKey, payload);
        }

        return payload;
      } catch (e: any) {
        if (e?.name === "AbortError") {
          return { ok: false, error: "aborted" };
        }
        return { ok: false, error: e?.message || "Unknown error" };
      }
    })();

    inFlight.set(cacheKey, promise);

    const out = await promise.finally(() => {
      inFlight.delete(cacheKey);
      setLoading(false);
    });

    setData(out);
    if (!out.ok) setError(out.error || "Unknown error");
    return out;
  }, []);

  return { loading, data, error, generateVoice };
}
