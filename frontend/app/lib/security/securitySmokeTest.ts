// frontend/app/lib/security/securitySmokeTest.ts
//
// Offline security smoke test (no server, no domain).
// Ha ez lefut és mindhárom blokk true, akkor kész az offline security baseline.

import { getSessionId } from "./sessionId";
import {
  checkAndConsumeRateLimit,
  getRetryAfterMs,
} from "./rateLimiter";
import {
  createGuardedConfig,
  validateGuardedConfig,
} from "./configGuard";
import {
  setCacheEntry,
  getCacheEntry,
  clearCache,
  getCacheStats,
} from "./cachePolicy";
import { makeCacheKey } from "./cacheKey";

export type SmokeResult = {
  rateLimiterOk: boolean;
  rateLimiterDetail: string;

  configGuardOk: boolean;
  configGuardDetail: string;

  cacheOk: boolean;
  cacheDetail: string;
};

// ---- RATE LIMIT TEST -------------------------------------------------

function testRateLimiter(): { ok: boolean; detail: string } {
  const ACTION = "SMOKE_RATE_TEST";
  const MAX = 5;
  const WINDOW_MS = 1000; // 1s

  // első 5 próbálkozásnak mennie kell
  let allAllowed = true;
  for (let i = 0; i < 5; i++) {
    const res = checkAndConsumeRateLimit(ACTION, MAX, WINDOW_MS);
    if (!res.ok) {
      allAllowed = false;
      break;
    }
  }

  // 6. próbálkozásnak blokkolnia kell
  const res6 = checkAndConsumeRateLimit(ACTION, MAX, WINDOW_MS);
  const blockedAsExpected = !res6.ok;

  const retryHint = getRetryAfterMs(ACTION, MAX, WINDOW_MS);
  const retryLooksValid = blockedAsExpected ? retryHint >= 0 : true;

  const ok = allAllowed && blockedAsExpected && retryLooksValid;
  const detail = `allowedFirst5=${allAllowed} blocked6=${blockedAsExpected} retryMs=${retryHint}`;

  return { ok, detail };
}

// ---- CONFIG GUARD TEST -----------------------------------------------

function testConfigGuard(): { ok: boolean; detail: string } {
  const guarded = createGuardedConfig({
    campaignId: "global_story",
    storyId: "start",
    skin: "contract_default",
    runes: "ring,arc,dot",
  });

  // próbáljuk meg átírni a lefagyasztott objektumot
  let freezeWorked = false;
  try {
    // @ts-expect-error szándékos illegális írás
    guarded.data.skin = "hacked_skin";
  } catch {
    // ha ide jutunk, az jó: tényleg readonly lett
    freezeWorked = true;
  }

  // eredeti guardnak validnak kell lennie
  const checkOriginal = validateGuardedConfig(guarded);
  const originalStillOk = checkOriginal.ok === true;

  // kreáljunk egy "meghackelt" clone-t: ugyanaz a hash, de más skin
  const hackedClone = {
    data: {
      ...guarded.data,
      skin: "totally_evil_skin",
    },
    hash: guarded.hash,
  };

  const checkHacked = validateGuardedConfig(hackedClone as any);

  // hackelt példányt el kell utasítania, és vissza kell esnie safe fallback-re
  const hackedRejected =
    checkHacked.ok === false &&
    checkHacked.safeConfig.skin === "contract_default";

  const ok = freezeWorked && originalStillOk && hackedRejected;
  const detail = `freezeWorked=${freezeWorked} originalOk=${originalStillOk} hackedRejected=${hackedRejected}`;

  return { ok, detail };
}

// ---- CACHE TEST ------------------------------------------------------

function testCache(): { ok: boolean; detail: string } {
  // tiszta indulás
  clearCache();

  // 1) tegyünk be valamit
  const key1 = makeCacheKey({
    storyId: "global_story",
    pageId: "start",
    skin: "contract_default",
    runes: "ring,arc,dot",
  });

  setCacheEntry(key1, { pageTitle: "Intro scene" });

  // 2) olvassuk vissza
  const hit: any = getCacheEntry(key1);
  const gotInitial =
    !!hit && hit.data && hit.data.pageTitle === "Intro scene";

  // 3) töltsük túl a cache-t, hogy LRU eviction életbe lépjen
  for (let i = 0; i < 1010; i++) {
    const k = makeCacheKey({
      storyId: "stress_story",
      pageId: "p" + i.toString(),
      skin: "contract_default",
      runes: "",
    });
    setCacheEntry(k, { idx: i });
  }

  const stats = getCacheStats();
  const underCap = stats.entries <= stats.maxEntries;

  const ok = gotInitial && underCap;
  const detail = `gotInitial=${gotInitial} entries=${stats.entries} cap=${stats.maxEntries}`;

  return { ok, detail };
}

// ---- PUBLIC ENTRY ----------------------------------------------------

export function runSecuritySmokeTest(): SmokeResult {
  const sid = getSessionId();

  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console
    console.log(
      "[SMOKE] sessionId (masked):",
      typeof sid === "string" ? sid.slice(0, 6) + "..." : sid
    );
  }

  const rate = testRateLimiter();
  const cfg = testConfigGuard();
  const cache = testCache();

  const result: SmokeResult = {
    rateLimiterOk: rate.ok,
    rateLimiterDetail: rate.detail,

    configGuardOk: cfg.ok,
    configGuardDetail: cfg.detail,

    cacheOk: cache.ok,
    cacheDetail: cache.detail,
  };

  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console
    console.log("[SMOKE][RATE]", rate);
    // eslint-disable-next-line no-console
    console.log("[SMOKE][CFG]", cfg);
    // eslint-disable-next-line no-console
    console.log("[SMOKE][CACHE]", cache);
    // eslint-disable-next-line no-console
    console.log("[SMOKE][FINAL]", result);
  }

  return result;
}
