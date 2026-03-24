// /lib/GameStateContext.tsx
"use client";

import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";

import {
  initAnalyticsForStory,
  setStoryMeta,
  getOrCreateUserId,
} from "./analytics";
import {
  getRunKey,
  getScopeKey,
  getStartPageId,
  getStringGlobal,
  initAnalyticsSessionState,
  startNewRunId,
} from "./gameStateAnalytics";
import {
  DEFAULT_RUNE_SINGLE,
  deriveStoryId,
  normalizeRuneChoice,
  parseRuneChoiceFromQuery,
  sanitizePageId,
} from "./gameStateHelpers";
import {
  calculateProgressState,
  createEmptyProgressDisplay,
  resolveInitialRuneChoice,
} from "./gameStateProgress";
import { applyStoryMetaToState, buildStoryMetaUrl } from "./gameStateMeta";
import {
  collectRehydrationFragments,
  getUnlockEnterFragmentIds,
  mergeFragmentBanks,
} from "./gameStateFragments";
import {
  nextFlagsState,
  nextFragmentsState,
  nextGlobalFragmentBankForUnlock,
  nextRuneImagesState,
  nextUnlockedFragmentsState,
  resolveAnswerNextPage,
} from "./gameStateMutators";
import {
  clearAbortControllers,
  clearRegisteredAudioElements,
  clearRegisteredTimeouts,
  resetPersistedGameState,
} from "./gameStateResources";
import {
  buildPageRequestUrl,
  normalizeFetchedPage,
  resolvePageRuntimeDecision,
} from "./gameStatePageRuntime";
import { LS_KEYS, parseJSON, writeStorageJSON, writeStorageValue } from "./gameStateStorage";
import type {
  FragmentBank,
  FragmentData,
  GameStateGlobals,
  GameStateContextType,
  PageData,
  ProgressDisplay,
  RuneChoice,
} from "./gameStateTypes";

export { normalizeImagePrompt, resolveNextFromPage } from "./gameStateHelpers";
export type { FragmentData } from "./gameStateTypes";

const GameStateContext = createContext<GameStateContextType>({} as GameStateContextType);

export const GameStateProvider = ({ children }: { children: ReactNode }) => {
  /** HYDRATION-GATE */
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  
  // SAFE DEFAULT state
  const [voiceApiKey, setVoiceApiKeyState] = useState<string | undefined>(undefined);
  const [imageApiKey, setImageApiKeyState] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);

  const [unlockedFragments, setUnlockedFragmentsState] = useState<string[]>([]);
  const [fragments, setFragments] = useState<Record<string, FragmentData>>({});
  const [globalFragments, setGlobalFragments] = useState<FragmentBank>({});
  const [globals, setGlobals] = useState<GameStateGlobals>({});
    /** GLOBALS API — HOISTED (a használatok elé helyezve) */
  const setGlobal = useCallback((key: string, value: unknown) => {
    if (!key) return;
    setGlobals((prev) => {
      const next = { ...prev, [key]: value };
      writeStorageJSON(LS_KEYS.globals, next);
      return next;
    });
  }, []);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [isMuted, setMuted] = useState<boolean>(false);
  const [currentPageId, setCurrentPageIdState] = useState<string>("landing");

  const [currentPageData, setCurrentPageData] = useState<PageData | null>(null);
  const [audioRestartToken, setAudioRestartToken] = useState<number>(0);

  const [flagsState, setFlagsState] = useState<Set<string>>(new Set());

  /** ⬅️ Rúna képek map (flagId → png src) */
  const [imagesByFlag, setImagesByFlag] = useState<Record<string, string>>({});

  const globalStorySrc = getStringGlobal(globals, "storySrc");
  const globalStoryTitle = getStringGlobal(globals, "storyTitle");
  const globalStoryId = getStringGlobal(globals, "storyId");
  const globalRunKey = getRunKey(globals);
  const globalAccountId = getStringGlobal(globals, "accountId");
  const globalTenantId = getStringGlobal(globals, "tenantId");
  const globalEmbedKey = getStringGlobal(globals, "embedKey");
  const globalStartPageId = getStartPageId(globals);
  const globalCampaign = getStringGlobal(globals, "campaign");
  const globalRunePack = globals.runePack;
  const analyticsGlobals = useMemo<GameStateGlobals>(
    () => ({
      storySrc: globalStorySrc,
      storyTitle: globalStoryTitle,
      storyId: globalStoryId,
      runKey: globalRunKey,
      accountId: globalAccountId,
      tenantId: globalTenantId,
      embedKey: globalEmbedKey,
      startPageId: globalStartPageId,
      campaign: globalCampaign,
    }),
    [
      globalStorySrc,
      globalStoryTitle,
      globalStoryId,
      globalRunKey,
      globalAccountId,
      globalTenantId,
      globalEmbedKey,
      globalStartPageId,
      globalCampaign,
    ]
  );

  // I/O erőforrások
  const abortControllers = useRef<AbortController[]>([]);
  const timeouts = useRef<number[]>([]);
  const audioEls = useRef<HTMLAudioElement[]>([]);

  const prevPageIdRef = useRef<string | null>(null);

  const [storyId, setStoryId] = useState<string | undefined>(undefined);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [runId, setRunId] = useState<string | undefined>(undefined);
  const lastStartRunAtRef = useRef<number>(0);
  /** 🔹 PROGRESS state */
  const [visitedPages, setVisitedPages] = useState<Set<string>>(new Set());
  const [progressValue, setProgressValue] = useState<number>(0);
  const [progressDisplay, setProgressDisplay] = useState<ProgressDisplay>(createEmptyProgressDisplay());

  
  /** HYDRATION utáni visszatöltés */
  useEffect(() => {
    if (!hydrated) return;
    try {
      const v = localStorage.getItem(LS_KEYS.voice) ?? undefined;
      const i = localStorage.getItem(LS_KEYS.image) ?? undefined;

      const u = parseJSON<string[]>(localStorage.getItem(LS_KEYS.unlocked), []);
      const f = parseJSON<Record<string, FragmentData>>(localStorage.getItem(LS_KEYS.fragments), {});
      const g = parseJSON<FragmentBank>(localStorage.getItem(LS_KEYS.globalBank), {});
      const fl = parseJSON<string[]>(localStorage.getItem(LS_KEYS.flags), []);
      const gl = parseJSON<GameStateGlobals>(localStorage.getItem(LS_KEYS.globals), {});
      const rb = parseJSON<Record<string, string>>(localStorage.getItem(LS_KEYS.runeImgs), {});
      const stSrc = localStorage.getItem(LS_KEYS.storySrc) ?? undefined;
      const stTitle = localStorage.getItem(LS_KEYS.storyTitle) ?? undefined;

      const m = localStorage.getItem(LS_KEYS.muted) === "true";
      const rawP = localStorage.getItem(LS_KEYS.page) || "landing";
      const p = sanitizePageId(rawP);

      setVoiceApiKeyState(v);
      setImageApiKeyState(i);
      setUnlockedFragmentsState(Array.isArray(u) ? u.filter(Boolean) : []);
      setFragments(f && typeof f === "object" ? f : {});
      setGlobalFragments(g && typeof g === "object" ? g : {});
      setGlobals(() => {
        const base = (gl && typeof gl === "object") ? gl : {};
        return {
          ...base,
          ...(stSrc ? { storySrc: stSrc } : {}),
          ...(stTitle ? { storyTitle: stTitle } : {}),
        };
      });

      setImagesByFlag(rb && typeof rb === "object" ? rb : {});
      setMuted(!!m);
      setCurrentPageIdState(p);
      setFlagsState(new Set(Array.isArray(fl) ? fl.filter(Boolean) : []));

      writeStorageValue(LS_KEYS.page, p);
    } catch {
      // swallow
    }
  }, [hydrated]);

    const [rewardImageReady, setRewardImageReady] = useState(false);
  const rewardFrameRef = useRef<HTMLDivElement | null>(null);

  const registerRewardFrame = useCallback((el: HTMLDivElement | null) => {
   if (el) {
    rewardFrameRef.current = el;
   }
  }, []);

  const downloadRewardImage = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (!rewardFrameRef.current) {
      console.warn("[RewardExport] nincs frame elem regisztrálva");
      return;
    }

    try {
      const { toPng } = await import("html-to-image");
      const el = rewardFrameRef.current;

      // --- Stabilizálás: várjunk a layoutra / fontokra / képekre ---
      const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

      // 1) Layout settle (különösen animációk/transitions után)
      await raf();
      await raf();

      // 2) Fontok (ha vannak tokenes/remote fontok)
      try {
        const fonts = document.fonts;
        if (fonts?.ready) await fonts.ready;
      } catch {}

      // 3) Img elemek betöltése a frame-en belül
      const imgs = Array.from(el.querySelectorAll("img")) as HTMLImageElement[];
      await Promise.all(
        imgs.map(
          (img) =>
            new Promise<void>((resolve) => {
              if (img.complete && img.naturalWidth > 0) return resolve();
              const done = () => {
                img.removeEventListener("load", done);
                img.removeEventListener("error", done);
                resolve();
              };
              img.addEventListener("load", done);
              img.addEventListener("error", done);
            })
        )
      );

      // 4) SVG <image href="...">: best-effort prefetch
      try {
        const svgImages = Array.from(el.querySelectorAll("image")) as SVGImageElement[];
        await Promise.all(
          svgImages.map((node) => {
            const href =
              node.getAttribute("href") ||
              node.getAttribute("xlink:href") ||
              node.href?.baseVal ||
              "";
            const url = String(href || "").trim();
            if (!url) return Promise.resolve();
            return new Promise<void>((resolve) => {
              const im = new Image();
              im.crossOrigin = "anonymous";
              im.onload = () => resolve();
              im.onerror = () => resolve();
              im.src = url;
            });
          })
        );
      } catch {}

      // 5) Méretezés védelem: zero-size esetén ne exportáljunk
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        console.warn("[RewardExport] export skip: frame méret 0", rect);
        return;
      }

      const dataUrl = await toPng(rewardFrameRef.current, {
        quality: 0.95,
        pixelRatio: window.devicePixelRatio || 2,
        cacheBust: true,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });

      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = "questell_reward.png";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("[RewardExport] export hiba", err);
    }
  }, []);


  const ensureRunOnStart = useCallback(() => {
  if (!storyId) return undefined;

  const startId = globalStartPageId;
  if (!startId) return runId;

  // csak akkor csinál újat, ha épp a start oldalon vagyunk
  if ((currentPageId || null) !== startId) return runId;

  // StrictMode / gyors dupla hívás védelem
  const now = Date.now();
  if (now - (lastStartRunAtRef.current || 0) < 250) return runId;
  lastStartRunAtRef.current = now;

  const scopeKey = getScopeKey(analyticsGlobals);
  const rid = startNewRunId(storyId, scopeKey);
  console.log("[GameState] ensureRunOnStart → new runId", { storyId, scopeKey, rid });
  setRunId(rid);
  return rid;
}, [storyId, globalStartPageId, analyticsGlobals, currentPageId, runId]);
  
 /** 🔹 Analytics: storyId + sessionId előkészítés */
useEffect(() => {
  if (!hydrated) return;

  const sid = deriveStoryId(analyticsGlobals);
  setStoryId(sid);

  if (!sid) {
    setSessionId(undefined);
    setRunId(undefined);
    return;
  }

  try {
    initAnalyticsForStory(sid);
    const { scopeKey, runKey, sessionId: nextSessionId, runId: nextRunId } =
      initAnalyticsSessionState(sid, analyticsGlobals);
    setSessionId(nextSessionId);
    setRunId(nextRunId);
    console.log("[GameState] initAnalyticsForStory/useEffect runId", {
      storyId: sid,
      scopeKey,
      hasRunKey: !!runKey,
      runId: nextRunId,
    });

    
    // opcionális: hogy a "startPageId-re visszajöttünk" logika ne duplázzon
    if (runKey) prevPageIdRef.current = null;

    const uid = getOrCreateUserId();
    setStoryMeta(sid, {
      title: globalStoryTitle,
      src: globalStorySrc,
      userId: uid,
      domain: typeof window !== "undefined" ? window.location.hostname : undefined
    });
  } catch (e) {
    console.warn("[analytics] init/session error", e);
  }
},  [
  hydrated,
  analyticsGlobals,
  globalStorySrc,
  globalStoryTitle,
]);

/** 🔹 Analytics: ha start oldalra érkezünk → új RUN (mindig) */
useEffect(() => {
  if (!hydrated) return;
  if (!storyId) return;

  // runKey-s restart külön logika esetén skip (ha akarod)
  if (globalRunKey) {
    prevPageIdRef.current = currentPageId || null;
    return;
  }

  const startId = globalStartPageId;
  if (!startId) {
    prevPageIdRef.current = currentPageId || null;
    return;
  }

  const prev = prevPageIdRef.current; // lehet null
  const curr = currentPageId || null;

  const arrivedToStart = curr === startId && prev !== startId;

  if (arrivedToStart) {
    const now = Date.now();
    if (now - (lastStartRunAtRef.current || 0) > 250) {
      lastStartRunAtRef.current = now;

      const scopeKey = getScopeKey(analyticsGlobals);
      // ✅ csak RUN-t váltunk (session maradhat)
      const newRun = startNewRunId(storyId, scopeKey);
      setRunId(newRun);
    }
  }

  prevPageIdRef.current = curr;
}, [
  hydrated,
  storyId,
  currentPageId,
  globalStartPageId,
  analyticsGlobals,
  globalRunKey,
]);

  const addFragment = useCallback((id: string, data: FragmentData) => {
    if (!id) return;
    setFragments((prev) => {
      const next = nextFragmentsState(prev, id, data);
      writeStorageJSON(LS_KEYS.fragments, next);
      return next;
    });
  }, []);

  const setVoiceApiKey = useCallback((key: string) => {
    setVoiceApiKeyState(key);
    writeStorageValue(LS_KEYS.voice, key);
  }, []);

  const setImageApiKey = useCallback((key: string) => {
    setImageApiKeyState(key);
    writeStorageValue(LS_KEYS.image, key);
  }, []);

  const setUnlockedFragments = useCallback((tags: string[]) => {
    const arr = Array.isArray(tags) ? tags.filter(Boolean) : [];
    setUnlockedFragmentsState(arr);
    writeStorageJSON(LS_KEYS.unlocked, arr);
  }, []);

  
  /** UNLOCK + write-through bank update */
  const unlockFragment = useCallback((idOrIds: string | string[]) => {
    const ids = (Array.isArray(idOrIds) ? idOrIds : [idOrIds]).filter(Boolean);
    if (!ids.length) return;

    setUnlockedFragmentsState((prev) => {
      const next = nextUnlockedFragmentsState(prev, ids);
      writeStorageJSON(LS_KEYS.unlocked, next);
      return next;
    });

    setGlobalFragments((prev) => {
      const merged = nextGlobalFragmentBankForUnlock(prev, ids);
      writeStorageJSON(LS_KEYS.globalBank, merged);
      return merged;
    });
  }, []);

  const hasUnlocked = useCallback(
    (id: string) => !!id && Array.isArray(unlockedFragments) && unlockedFragments.includes(id),
    [unlockedFragments]
  );

  /** FLAGS API */
  const persistFlags = useCallback((s: Set<string>) => {
    writeStorageJSON(LS_KEYS.flags, Array.from(s));
  }, []);

  const setFlag = useCallback(
    (id: string) => {
      if (!id) return;
      setFlagsState((prev) => {
        const next = nextFlagsState(prev, id, "set");
        persistFlags(next);
        return next;
      });
    },
    [persistFlags]
  );

  const clearFlag = useCallback(
    (id: string) => {
      if (!id) return;
      setFlagsState((prev) => {
        const next = nextFlagsState(prev, id, "clear");
        persistFlags(next);
        return next;
      });
    },
    [persistFlags]
  );

  const hasFlag = useCallback((id: string) => flagsState.has(id), [flagsState]);



  /** Convenience: storySrc setter */
  const setStorySrc = useCallback(
    (src: string) => {
      if (!src) return;

      // forrás elmentése
      writeStorageValue(LS_KEYS.storySrc, src);
      setGlobal("storySrc", src);

      // ✅ Meta-prefetch
      try {
        const metaUrl = buildStoryMetaUrl(src);

        fetch(metaUrl, { cache: "no-store" })
          .then(r => r.json())
          .then(story => {
            if (applyStoryMetaToState({
              meta: story?.meta,
              setGlobal,
              setProgressDisplay,
            })) {
              console.log("[GameState] Meta loaded:", story.meta);
            }
          })
          .catch(err => console.warn("[GameState] meta load error", err));
      } catch (err) {
        console.warn("[GameState] meta prefetch failed", err);
      }

      // 🔄 új sztori: progress reset (milestones a meta betöltésekor kerülnek be)
      setVisitedPages(new Set());
      setProgressValue(0);
      setProgressDisplay(createEmptyProgressDisplay());

      // 🔹 Analytics re-init
      const newGlobals = { ...analyticsGlobals, storySrc: src };
      const newStoryId = deriveStoryId(newGlobals);
      setStoryId(newStoryId);

      if (newStoryId) {
        try {
          initAnalyticsForStory(newStoryId);
          const { sessionId: nextSessionId, runId: nextRunId } =
            initAnalyticsSessionState(newStoryId, newGlobals);

          setSessionId(nextSessionId);
          setRunId(nextRunId);

          setStoryMeta(newStoryId, {
            title: localStorage.getItem(LS_KEYS.storyTitle) || globalStoryTitle,
            src,
            campaign: globalCampaign || localStorage.getItem("campaign") || undefined,
            userId: getOrCreateUserId(),
          });
        } catch (e) {
          console.warn("[analytics] re-init/session error", e);
        }
      }

      // ⬇️ ÚJ: runePack azonnali visszaállítás (query → LS → default)
      try {
        const map = parseJSON<Record<string, RuneChoice>>(localStorage.getItem(LS_KEYS.runePackMap), {});
        const storyKey = newStoryId || deriveStoryId({ storySrc: src }) || undefined;
        const runeChoice = resolveInitialRuneChoice({
          storyId: storyKey,
          queryChoice: parseRuneChoiceFromQuery(),
          savedChoices: map,
        });
        setGlobal("runePack", runeChoice);
      } catch {
        setGlobal("runePack", normalizeRuneChoice({ mode: "single", icons: DEFAULT_RUNE_SINGLE }));
      }
    },
    [setGlobal, analyticsGlobals, globalStoryTitle, globalCampaign]
  );

   /** 🔹 Runes: query → globals.runePack (elsőbbség) */
  useEffect(() => {
    if (!hydrated) return;
    // ha már van runePack a globals-ban, nem írjuk felül
    if (typeof globalRunePack !== "undefined") return;

    // ha nincs query, jöhet LS per-kampány
    const sid = deriveStoryId(analyticsGlobals);
    try {
      const map = parseJSON<Record<string, RuneChoice>>(localStorage.getItem(LS_KEYS.runePackMap), {});
      const runeChoice = resolveInitialRuneChoice({
        storyId: sid,
        queryChoice: parseRuneChoiceFromQuery(),
        savedChoices: map,
      });
      setGlobal("runePack", runeChoice);
    } catch {
      setGlobal("runePack", normalizeRuneChoice({ mode: "single", icons: DEFAULT_RUNE_SINGLE }));
    }
  }, [hydrated, analyticsGlobals, globalRunePack, setGlobal]);

  /** Helpers */
  const registerAbort = useCallback((ac: AbortController) => {
    abortControllers.current.push(ac);
  }, []);

  const registerTimeout = useCallback((id: number) => {
    timeouts.current.push(id);
  }, []);

  const clearAllTimeouts = useCallback(() => {
    clearRegisteredTimeouts(timeouts);
  }, []);

  const registerAudio = useCallback((el: HTMLAudioElement) => {
    if (!audioEls.current.includes(el)) audioEls.current.push(el);
  }, []);

  /** 🔹 Rúna képek API */
  const setRuneImage = useCallback((flagId: string, url: string) => {
    if (!flagId || !url) return;
    setImagesByFlag((prev) => {
      const next = nextRuneImagesState(prev, { flagId, url, mode: "set" });
      writeStorageJSON(LS_KEYS.runeImgs, next);
      return next;
    });
  }, []);

  const clearRuneImage = useCallback((flagId: string) => {
    if (!flagId) return;
    setImagesByFlag((prev) => {
      const next = nextRuneImagesState(prev, { flagId, mode: "clear" });
      if (next === prev) return prev;
      writeStorageJSON(LS_KEYS.runeImgs, next);
      return next;
    });
  }, []);

  /** Page ID setter */
  const setCurrentPageId = useCallback((id: string) => {
    const safe = sanitizePageId(id);
    setCurrentPageIdState((prev) => {
      if (prev === safe) return prev;
      writeStorageValue(LS_KEYS.page, safe);
      return safe;
    });
  }, []);

  const goToNextPage = useCallback(
    (nextPageId: string) => {
      setCurrentPageId(nextPageId);
    },
    [setCurrentPageId]
  );

  const handleAnswer = useCallback((page: PageData, res: { correct: boolean; choiceIdx: number; elapsedMs: number }) => {
    if (!page) return;

    // 1) Globálok frissítése
    const prevScore = Number(globals.score ?? 0) || 0;
    const newScore = res.correct ? prevScore + 1 : prevScore;

    setGlobal("correct", res.correct);
    setGlobal("choiceIdx", res.choiceIdx);
    setGlobal("elapsedMs", res.elapsedMs);
    setGlobal("score", newScore);

    // 2) onAnswer.nextSwitch feloldása
    const nextId = resolveAnswerNextPage(page, res, globals, newScore);

    // 3) Navigáció
    if (nextId) {
      goToNextPage(nextId);
    }
  }, [globals, setGlobal, goToNextPage]);

  const setIsMuted = useCallback((value: boolean) => {
    setMuted(value);
    writeStorageValue(LS_KEYS.muted, String(value));
  }, []);

  const triggerAudioRestart = useCallback(() => {
    setAudioRestartToken((t) => t + 1);
  }, []);

  /** Reset */
  const resetGame = useCallback(() => {
    clearAbortControllers(abortControllers);
    clearAllTimeouts();
    clearRegisteredAudioElements(audioEls);

    setUnlockedFragmentsState([]);
    setFragments({});
    setGlobalFragments({});
    setGlobals({});
    setFlagsState(new Set());
    setImagesByFlag({});

    setIsLoading(false);
    setGlobalError(null);
    setAudioRestartToken(0);
    setCurrentPageData(null);
    setCurrentPageIdState("landing");

    // 🔄 progress reset
    setVisitedPages(new Set());
    setProgressValue(0);
    setProgressDisplay(createEmptyProgressDisplay());

    resetPersistedGameState();
  }, [clearAllTimeouts]);

  /** Oldal betöltése backendről + normalizálás */
  useEffect(() => {
    if (!hydrated) return;
    if (!currentPageId) return;

    // ⛔ Sentinel oldalak → landing
    if (currentPageId === "feedback" || currentPageId === "__END__") {
      const safe = "landing";
      setCurrentPageIdState(safe);
      writeStorageValue(LS_KEYS.page, safe);
      return;
    }

    // ⛔ Landingnál nincs fetch
    if (currentPageId === "landing") {
      setCurrentPageData(null);
      setGlobalError(null);
      setIsLoading(false);

      setVisitedPages(new Set());
      setProgressValue(0);
      setProgressDisplay(createEmptyProgressDisplay());
      return;
    }

    // Story forrás
    const storySrcFromLS =
      typeof window !== "undefined" ? localStorage.getItem(LS_KEYS.storySrc) : null;
    const storySrc = globalStorySrc || storySrcFromLS || "";

    // ⛔ Ha nincs storySrc, ne fetch-eljünk
    if (!storySrc) {
      setCurrentPageData(null);
      setGlobalError(null);
      setIsLoading(false);
      return;
    }

    clearAllTimeouts();
    const ac = new AbortController();
    registerAbort(ac);

    (async () => {
      try {
        setIsLoading(true);
        const url = buildPageRequestUrl(currentPageId, storySrc);

        const response = await fetch(url, { signal: ac.signal });
        if (!response.ok) {
          setGlobalError(`Nem sikerült lekérni az oldalt (${currentPageId}).`);
          setCurrentPageData(null);
          return;
        }

        const raw = await response.json();
        const runtimeDecision = resolvePageRuntimeDecision(raw, unlockedFragments);
        if (runtimeDecision.kind === "redirect") {
          setCurrentPageId(runtimeDecision.pageId);
          return;
        }
        if (runtimeDecision.kind === "blocked") {
          setCurrentPageId("landing");
          return;
        }

        const normalized = normalizeFetchedPage(raw);
        setCurrentPageData(normalized);

        // Meta refresh (mindig)
        try {
          const metaSource = globalStorySrc || localStorage.getItem(LS_KEYS.storySrc) || "";
          const metaSrc = metaSource.replace(/^\/?stories\//, "/stories/");
          if (metaSrc) {
            const full = buildStoryMetaUrl(metaSrc);

            fetch(full, { cache: "no-store" })
              .then(r => r.json())
              .then(story => {
                if (applyStoryMetaToState({ meta: story?.meta, setGlobal })) {
                  console.log("[GameState] Meta refreshed:", story.meta);
                }
              })
              .catch(err => console.warn("[GameState] meta refresh error", err));
          }
        } catch {}

        setGlobalError(null);
      } catch (err: unknown) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          console.error("Page fetch error:", err);
          setGlobalError("Nem sikerült lekérni az oldalt a backendről.");
          setCurrentPageData(null);
        }
      } finally {
        setIsLoading(false);
      }
    })();

    return () => {
      try {
        ac.abort();
      } catch {}
    };
  }, [
    hydrated,
    currentPageId,
    globalStorySrc,
    unlockedFragments,
    setCurrentPageId,
    setGlobal,
    registerAbort,
    clearAllTimeouts,
  ]);

    useEffect(() => {
    // új oldal → jutalom reset
    setRewardImageReady(false);
  }, [currentPageId]);

  /** Merge a globál bankba + persist (additív) */
  useEffect(() => {
    if (!hydrated) return;
    const bank = currentPageData?.fragmentsGlobal;
    if (bank && typeof bank === "object") {
      setGlobalFragments((prev) => {
        const merged = mergeFragmentBanks(prev, bank);
        writeStorageJSON(LS_KEYS.globalBank, merged);
        return merged;
      });
    }
  }, [hydrated, currentPageData?.fragmentsGlobal]);

  /** Rehidratálás: oldalszintű fragmentek visszatöltése */
  useEffect(() => {
    if (!hydrated) return;
    const pendingFragments = collectRehydrationFragments({
      unlockedFragments,
      fragments,
      globalFragments,
    });
    pendingFragments.forEach(({ id, data }) => {
      addFragment(id, data);
    });
  }, [hydrated, unlockedFragments, fragments, globalFragments, addFragment, currentPageId]);

  /** Oldal-szintű unlockFragments auto */
  useEffect(() => {
    if (!hydrated) return;
    const ids = getUnlockEnterFragmentIds(currentPageData);
    if (ids.length) {
      unlockFragment(ids);
    }
  }, [hydrated, currentPageId, currentPageData, unlockFragment]);

  /** 🔹 PROGRESS: meglátogatott oldalak naplózása */
  useEffect(() => {
    if (!hydrated) return;
    const id = currentPageId;
    if (!id || id === "landing" || id === "feedback" || id === "__END__") return;
    setVisitedPages((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, [hydrated, currentPageId]);

  /** 🔹 PROGRESS: érték és display frissítése (JSON nélküli becslés) */
  useEffect(() => {
    if (!hydrated) return;
    const nextProgress = calculateProgressState({
      visitedPages,
      currentPageData,
      globals,
    });
    setProgressValue(nextProgress.value);
    setProgressDisplay(nextProgress.display);
  }, [hydrated, visitedPages, currentPageData, globals]);

  return (
    <GameStateContext.Provider
      value={{
        voiceApiKey,
        setVoiceApiKey,
        imageApiKey,
        setImageApiKey,
        isLoading,
        setIsLoading,

        ensureRunOnStart,

        unlockedFragments,
        setUnlockedFragments,
        unlockFragment,
        hasUnlocked,

        fragments,
        addFragment,

        globalFragments,

        flags: flagsState,
        setFlag,
        clearFlag,
        hasFlag,

        globals,
        setGlobal,
        setStorySrc,

        /** 🔹 Rúna képek */
        imagesByFlag,
        setRuneImage,
        clearRuneImage,

        currentPageId,
        setCurrentPageId,
        currentPageData,
        goToNextPage,
        handleAnswer,

        globalError,
        setGlobalError,

        isMuted,
        setIsMuted,

        audioRestartToken,
        triggerAudioRestart,

        resetGame,
        registerAbort,

        registerTimeout,
        clearAllTimeouts,

        registerAudio,

        /** 🔹 PROGRESS export */
        visitedPages,
        progressValue,
        progressDisplay,

        storyId,
        sessionId,
        runId,
        

        rewardImageReady,
        setRewardImageReady,
        registerRewardFrame,
        downloadRewardImage,
      }}
    >
      {children}
    </GameStateContext.Provider>
  );
};

export const useGameState = (): GameStateContextType => useContext(GameStateContext);
