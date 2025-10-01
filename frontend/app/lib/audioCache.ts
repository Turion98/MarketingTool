// lib/audioCache.ts
// Egyszerű in-memory audio cache voice, narráció és SFX számára – playlist/ducking-ready

type CacheEntry = {
  el: HTMLAudioElement;
  createdAt: number;
  lastTouch: number;
  state: "loading" | "ready" | "error";
  ready: Promise<void>;
  _resolve?: () => void;
  _reject?: (e: any) => void;
};

const audioCache = new Map<string, CacheEntry>();

// Dev módban mérési log (StoryPage dev-sor használja)
let lastAudioPerfLog: { url: string; hit: boolean; ms: number } | null = null;
export function getLastAudioPerfLog() {
  return lastAudioPerfLog;
}

/** Belső helper: egyszeri eseményvárás (Safari fallback-kel). */
function waitUntilReady(el: HTMLAudioElement, timeoutMs = 8000) {
  return new Promise<void>((resolve, reject) => {
    let done = false;
    const ok = () => {
      if (done) return;
      done = true;
      cleanup();
      resolve();
    };
    const err = (e?: any) => {
      if (done) return;
      done = true;
      cleanup();
      reject(e);
    };
    const cleanup = () => {
      ["canplaythrough", "canplay", "loadeddata"].forEach((ev) =>
        el.removeEventListener(ev, ok)
      );
      el.removeEventListener("error", err);
      el.removeEventListener("abort", err);
      if (tid) clearTimeout(tid);
    };

    ["canplaythrough", "canplay", "loadeddata"].forEach((ev) =>
      el.addEventListener(ev, ok, { once: true })
    );
    el.addEventListener("error", err, { once: true });
    el.addEventListener("abort", err, { once: true });

    const tid = timeoutMs
      ? window.setTimeout(() => ok(), timeoutMs) // időzített fallback: ne blokkoljon
      : 0;
  });
}

/**
 * Előtölt egy URL-t és beteszi a gyorsítótárba.
 * Visszaadja az Audio elemet AZONNAL (nem blokkol Promise-on).
 * Ha szükséged van a tényleges ready-re, használd a preloadAudioAsync()-t.
 */
export function preloadAudio(url: string): HTMLAudioElement {
  const t0 = performance.now();

  const hit = audioCache.get(url);
  if (hit) {
    hit.lastTouch = Date.now();
    const ms = Math.round(performance.now() - t0);
    lastAudioPerfLog = { url, hit: true, ms };
    if (process.env.NODE_ENV === "development") {
      console.debug(`[AUDIO CACHE] HIT ${url} (${ms}ms)`);
    }
    return hit.el;
  }

  // ÚJ: crossOrigin + playsinline a robusztusabb előtöltéshez
  const el = new Audio();
  try { el.crossOrigin = "anonymous"; } catch {}
  el.preload = "auto";
  el.setAttribute("playsinline", "true");
  el.src = url;

  // Belső entry + ready promise
  let _resolve!: () => void;
  let _reject!: (e: any) => void;
  const ready = new Promise<void>((res, rej) => {
    _resolve = res;
    _reject = rej;
  });

  const entry: CacheEntry = {
    el,
    createdAt: Date.now(),
    lastTouch: Date.now(),
    state: "loading",
    ready,
    _resolve,
    _reject,
  };

  audioCache.set(url, entry);

  // Események bekötése – amikor "ready", állapotfrissítés + perf log
  waitUntilReady(el).then(
    () => {
      entry.state = "ready";
      entry._resolve?.();
      const ms = Math.round(performance.now() - t0);
      // A dev log továbbra is MISS-ként jelenjen meg (első híváskor),
      // de ha fontos az éles ready-idő, itt felülírhatod:
      if (process.env.NODE_ENV === "development") {
        console.debug(`[AUDIO CACHE] READY ${url} (${ms}ms)`);
      }
    },
    (e) => {
      entry.state = "error";
      entry._reject?.(e);
      if (process.env.NODE_ENV === "development") {
        console.warn(`[AUDIO CACHE] ERROR ${url}`, e);
      }
    }
  );

  const ms = Math.round(performance.now() - t0);
  lastAudioPerfLog = { url, hit: false, ms };
  if (process.env.NODE_ENV === "development") {
    console.debug(`[AUDIO CACHE] MISS ${url} (${ms}ms)`);
  }

  return el;
}

/** Ugyanaz, mint preloadAudio, de megvárja a ready-t. */
export async function preloadAudioAsync(url: string): Promise<HTMLAudioElement> {
  const el = preloadAudio(url);
  const entry = audioCache.get(url)!;
  try {
    await entry.ready;
  } catch {
    // hiba esetén is visszaadjuk az elemet – a hívó dönt, mit tesz
  }
  return el;
}

/** Visszaadja az elotöltött Audio elemet (ha van). */
export function getAudioFromCache(url: string): HTMLAudioElement | null {
  const entry = audioCache.get(url);
  if (!entry) return null;
  entry.lastTouch = Date.now();
  return entry.el;
}

/** Soft-evict: töröld a cache-ből a megadott URL-t. */
export function evictAudio(url: string) {
  const entry = audioCache.get(url);
  if (!entry) return;
  try {
    entry.el.pause();
    entry.el.src = "";
  } catch {}
  audioCache.delete(url);
}

/** Teljes törlés (dev/debug). */
export function clearAudioCacheAll() {
  for (const [url, entry] of audioCache) {
    try {
      entry.el.pause();
      entry.el.src = "";
    } catch {}
    audioCache.delete(url);
  }
}

/** Diagnosztika / statisztika (dev tooling). */
export function getAudioCacheStats() {
  return {
    size: audioCache.size,
    items: Array.from(audioCache.keys()),
  };
}
