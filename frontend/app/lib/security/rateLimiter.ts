// frontend/app/lib/security/rateLimiter.ts
//
// Kliens oldali rate limiter szerver és domain nélkül.
// Cél: ne tudjuk saját UI-nkat szétspammelni (click flood, loop).
// Nem hálózati security, hanem önvédelem.
//
// Alapelv:
//   - minden "actionKey"-hez (pl. "pageFetch", "choiceSelect", "analyticsPing")
//     percenként max N esemény engedélyezett
//   - az eseményeket memóriában tároljuk timestampként (ms)
//   - kulcs: sessionId + actionKey
//
// Használat:
//   import { checkAndConsumeRateLimit } from "@/app/lib/security/rateLimiter";
//   const { ok, retryAfterMs } = checkAndConsumeRateLimit("choiceSelect");
//   if (!ok) { ...mutasd ErrorNotice-t... }

import { getSessionId } from "./sessionId";

type HitTimestamps = number[];

// belső memória (nem kerül ki a hálózatra)
const buckets: Record<string, HitTimestamps> = Object.create(null);

// alap limit profil
const DEFAULT_MAX_EVENTS = 100; // ennyi engedélyezett
const DEFAULT_WINDOW_MS = 60_000; // ennyi időn belül (60s)

export type RateLimitResult = {
  ok: boolean;
  retryAfterMs: number;
};

// egységes security log (PII nélkül)
function secLog(
  level: "WARN" | "INFO",
  code: string,
  msg: string,
  ctx: Record<string, string | number | boolean> = {}
): void {
  // PII-szűrés: sessionId nem teljes, csak első 6 char
  const safeCtx = { ...ctx };
  if ("sessionId" in safeCtx && typeof safeCtx.sessionId === "string") {
    const raw = String(safeCtx.sessionId);
    safeCtx.sessionId = raw.slice(0, 6) + "...";
  }

  // formátum: [SEC]<ts><lvl><code><msg><ctxJson>
  const ts = Date.now();
  // eslint-disable-next-line no-console
  console.warn(
    `[SEC] ${ts} ${level} ${code} ${msg} ${JSON.stringify(safeCtx)}`
  );
}

function makeBucketKey(actionKey: string, sessionId: string): string {
  return `${actionKey}::${sessionId}`;
}

// kitakarítja a régi eseményeket és visszaadja a frissített listát
function pruneOld(
  hits: HitTimestamps,
  nowMs: number,
  windowMs: number
): HitTimestamps {
  const cutoff = nowMs - windowMs;
  // csak azokat tartjuk meg, amik cutoff után vannak
  return hits.filter((t) => t >= cutoff);
}

/**
 * Ellenőrzi és "elfogyasztja" az engedélyt egy adott akcióhoz.
 * Ha túlléptük a limitet, ok=false és megkapjuk, mennyit kell várni.
 *
 * @param actionKey Egy rövid string, pl. "fetchPage", "selectChoice"
 * @param maxEvents Engedélyezett eseményszám az ablakban
 * @param windowMs Ablak hossza ms-ben
 */
export function checkAndConsumeRateLimit(
  actionKey: string,
  maxEvents: number = DEFAULT_MAX_EVENTS,
  windowMs: number = DEFAULT_WINDOW_MS
): RateLimitResult {
  const sid = getSessionId();
  const nowMs = Date.now();
  const bucketKey = makeBucketKey(actionKey, sid);

  // vedd ki a meglévő bucketet
  const prevHits = buckets[bucketKey] ?? [];
  // takarítsd ki az ablakon túli találatokat
  const freshHits = pruneOld(prevHits, nowMs, windowMs);

  if (freshHits.length >= maxEvents) {
    // megtelt a limit
    const oldestRelevant = freshHits[0]; // legrégebbi még bent lévő timestamp
    const retryAfterMs = windowMs - (nowMs - oldestRelevant);

    secLog("WARN", "RATE_LIMIT_BLOCK", "local rate limit triggered", {
      actionKey,
      sessionId: sid,
      retryAfterMs,
    });

    // ne írjunk vissza új hitet, mert blokkoltuk
    buckets[bucketKey] = freshHits;
    return {
      ok: false,
      retryAfterMs: retryAfterMs < 0 ? 0 : retryAfterMs,
    };
  }

  // engedélyezett, felvesszük a mostani hitet
  freshHits.push(nowMs);
  buckets[bucketKey] = freshHits;

  return {
    ok: true,
    retryAfterMs: 0,
  };
}

/**
 * Lekérdezi (fogyasztás nélkül), mennyi idő múlva próbálkozhat újra az adott akció.
 * UI-nak hasznos lehet tooltiphez.
 */
export function getRetryAfterMs(
  actionKey: string,
  maxEvents: number = DEFAULT_MAX_EVENTS,
  windowMs: number = DEFAULT_WINDOW_MS
): number {
  const sid = getSessionId();
  const nowMs = Date.now();
  const bucketKey = makeBucketKey(actionKey, sid);

  const prevHits = buckets[bucketKey] ?? [];
  const freshHits = pruneOld(prevHits, nowMs, windowMs);

  if (freshHits.length < maxEvents) {
    return 0;
  }

  const oldestRelevant = freshHits[0];
  const retryAfterMs = windowMs - (nowMs - oldestRelevant);
  return retryAfterMs < 0 ? 0 : retryAfterMs;
}
