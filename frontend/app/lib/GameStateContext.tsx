// /lib/GameStateContext.tsx
"use client";

import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
  useCallback,
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
  normalizeProgressMilestones,
  resolveInitialRuneChoice,
} from "./gameStateProgress";
import { LS_KEYS, parseJSON } from "./gameStateStorage";
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
  const setGlobal = useCallback((key: string, value: any) => {
    if (!key) return;
    setGlobals((prev) => {
      const next = { ...prev, [key]: value };
      try {
        localStorage.setItem(LS_KEYS.globals, JSON.stringify(next));
      } catch {}
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

      try {
        localStorage.setItem(LS_KEYS.page, p);
      } catch {}
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
        const fontsAny = (document as any).fonts;
        if (fontsAny?.ready) await fontsAny.ready;
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
        const svgImages = Array.from(el.querySelectorAll("image")) as any[];
        await Promise.all(
          svgImages.map((node) => {
            const href =
              node?.getAttribute?.("href") ||
              node?.getAttribute?.("xlink:href") ||
              node?.href?.baseVal ||
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

  const startId = getStartPageId(globals);
  if (!startId) return runId;

  // csak akkor csinál újat, ha épp a start oldalon vagyunk
  if ((currentPageId || null) !== startId) return runId;

  // StrictMode / gyors dupla hívás védelem
  const now = Date.now();
  if (now - (lastStartRunAtRef.current || 0) < 250) return runId;
  lastStartRunAtRef.current = now;

  const scopeKey = getScopeKey(globals);
  const rid = startNewRunId(storyId, scopeKey);
  console.log("[GameState] ensureRunOnStart → new runId", { storyId, scopeKey, rid });
  setRunId(rid);
  return rid;
}, [storyId, globals, currentPageId, runId]);
  
 /** 🔹 Analytics: storyId + sessionId előkészítés */
useEffect(() => {
  if (!hydrated) return;

  const sid = deriveStoryId(globals);
  setStoryId(sid);

  if (!sid) {
    setSessionId(undefined);
    setRunId(undefined);
    return;
  }

  try {
    initAnalyticsForStory(sid);
    const { scopeKey, runKey, sessionId: nextSessionId, runId: nextRunId } =
      initAnalyticsSessionState(sid, globals);
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
      title: getStringGlobal(globals, "storyTitle"),
      src: getStringGlobal(globals, "storySrc"),
      userId: uid,
      domain: typeof window !== "undefined" ? window.location.hostname : undefined
    });
  } catch (e) {
    console.warn("[analytics] init/session error", e);
  }
},  [
  hydrated,
  globals?.storySrc,
  globals?.storyTitle,
  globals?.storyId,
  (globals as any)?.runKey,
  (globals as any)?.accountId,
  (globals as any)?.tenantId,
  (globals as any)?.embedKey,
]);

/** 🔹 Analytics: ha start oldalra érkezünk → új RUN (mindig) */
useEffect(() => {
  if (!hydrated) return;
  if (!storyId) return;

  // runKey-s restart külön logika esetén skip (ha akarod)
  if (getRunKey(globals)) {
    prevPageIdRef.current = currentPageId || null;
    return;
  }

  const startId = getStartPageId(globals);
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

      const scopeKey = getScopeKey(globals);
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
  (globals as any)?.startPageId,
  (globals as any)?.accountId,
  (globals as any)?.tenantId,
  (globals as any)?.embedKey,
  (globals as any)?.runKey,
]);

  const addFragment = useCallback((id: string, data: FragmentData) => {
    if (!id) return;
    setFragments((prev) => {
      const next = {
        ...prev,
        [id]: {
          ...(prev[id] ?? {}),
          ...data,
          createdAt: prev[id]?.createdAt ?? Date.now(),
        },
      };
      try {
        localStorage.setItem(LS_KEYS.fragments, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const setVoiceApiKey = useCallback((key: string) => {
    setVoiceApiKeyState(key);
    try {
      localStorage.setItem(LS_KEYS.voice, key);
    } catch {}
  }, []);

  const setImageApiKey = useCallback((key: string) => {
    setImageApiKeyState(key);
    try {
      localStorage.setItem(LS_KEYS.image, key);
    } catch {}
  }, []);

  const setUnlockedFragments = useCallback((tags: string[]) => {
    const arr = Array.isArray(tags) ? tags.filter(Boolean) : [];
    setUnlockedFragmentsState(arr);
    try {
      localStorage.setItem(LS_KEYS.unlocked, JSON.stringify(arr));
    } catch {}
  }, []);

  
  /** UNLOCK + write-through bank update */
  const unlockFragment = useCallback((idOrIds: string | string[]) => {
    const ids = (Array.isArray(idOrIds) ? idOrIds : [idOrIds]).filter(Boolean);
    if (!ids.length) return;

    setUnlockedFragmentsState((prev) => {
      const next = Array.from(new Set([...(prev ?? []), ...ids]));
      try {
        localStorage.setItem(LS_KEYS.unlocked, JSON.stringify(next));
      } catch {}
      return next;
    });

    setGlobalFragments((prev) => {
      const merged: FragmentBank = { ...prev };
      ids.forEach((id) => {
        if (!id) return;
        if (!merged[id]) {
          merged[id] = { createdAt: Date.now() };
        }
      });
      try {
        localStorage.setItem(LS_KEYS.globalBank, JSON.stringify(merged));
      } catch {}
      return merged;
    });
  }, []);

  const hasUnlocked = useCallback(
    (id: string) => !!id && Array.isArray(unlockedFragments) && unlockedFragments.includes(id),
    [unlockedFragments]
  );

  /** FLAGS API */
  const persistFlags = useCallback((s: Set<string>) => {
    try {
      localStorage.setItem(LS_KEYS.flags, JSON.stringify(Array.from(s)));
    } catch {}
  }, []);

  const setFlag = useCallback(
    (id: string) => {
      if (!id) return;
      setFlagsState((prev) => {
        const next = new Set(prev);
        next.add(id);
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
        const next = new Set(prev);
        next.delete(id);
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
      try { localStorage.setItem(LS_KEYS.storySrc, src); } catch {}
      setGlobal("storySrc", src);

      // ✅ Meta-prefetch
      try {
       const baseUrl = src.startsWith("http") ? src : `${(process.env.NEXT_PUBLIC_API_BASE || "")}${src}`;
        const cacheBust = baseUrl.includes("?") ? `&v=${Date.now()}` : `?v=${Date.now()}`;
        const metaUrl = `${baseUrl}${cacheBust}`;

        fetch(metaUrl, { cache: "no-store" })
          .then(r => r.json())
          .then(story => {
            if (story?.meta) {
              setGlobal("meta", story.meta);
              if (story.meta?.ctaPresets) setGlobal("ctaPresets", story.meta.ctaPresets);
              if (story.meta?.endDefaultCta) setGlobal("endDefaultCta", story.meta.endDefaultCta);
              if (story.meta?.title) setGlobal("storyTitle", story.meta.title);
              if (story.meta?.id) setGlobal("storyId", story.meta.id);
              try { localStorage.setItem("storyMetaCache", JSON.stringify(story.meta)); } catch {}

              // progress milestones a meta-ból (ha van)
              const metaMilestones = normalizeProgressMilestones(
                story.meta?.progress?.milestones
              );
              setProgressDisplay({ value: 0, milestones: metaMilestones });

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
      const newGlobals = { ...globals, storySrc: src };
      const newStoryId = deriveStoryId(newGlobals);
      setStoryId(newStoryId);

      if (newStoryId) {
        try {
          initAnalyticsForStory(newStoryId);
          const { sessionId: nextSessionId, runId: nextRunId } =
            initAnalyticsSessionState(newStoryId, globals);

          setSessionId(nextSessionId);
          setRunId(nextRunId);

          setStoryMeta(newStoryId, {
            title: localStorage.getItem(LS_KEYS.storyTitle) || getStringGlobal(globals, "storyTitle"),
            src,
            campaign: getStringGlobal(globals, "campaign") || localStorage.getItem("campaign") || undefined,
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
    [setGlobal, globals]
  );

   /** 🔹 Runes: query → globals.runePack (elsőbbség) */
  useEffect(() => {
    if (!hydrated) return;
    // ha már van runePack a globals-ban, nem írjuk felül
    if (typeof globals.runePack !== "undefined") return;

    // ha nincs query, jöhet LS per-kampány
    const sid = deriveStoryId(globals);
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
  }, [hydrated, globals?.storySrc, globals?.storyTitle, globals?.storyId, setGlobal, globals]);

  /** Helpers */
  const registerAbort = useCallback((ac: AbortController) => {
    abortControllers.current.push(ac);
  }, []);

  const registerTimeout = useCallback((id: number) => {
    timeouts.current.push(id);
  }, []);

  const clearAllTimeouts = useCallback(() => {
    timeouts.current.forEach((id) => {
      try {
        clearTimeout(id);
      } catch {}
    });
    timeouts.current = [];
  }, []);

  const registerAudio = useCallback((el: HTMLAudioElement) => {
    if (!audioEls.current.includes(el)) audioEls.current.push(el);
  }, []);

  /** 🔹 Rúna képek API */
  const setRuneImage = useCallback((flagId: string, url: string) => {
    if (!flagId || !url) return;
    setImagesByFlag((prev) => {
      const next = { ...prev, [flagId]: url };
      try {
        localStorage.setItem(LS_KEYS.runeImgs, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const clearRuneImage = useCallback((flagId: string) => {
    if (!flagId) return;
    setImagesByFlag((prev) => {
      if (!prev || !prev[flagId]) return prev;
      const { [flagId]: _, ...rest } = prev;
      try {
        localStorage.setItem(LS_KEYS.runeImgs, JSON.stringify(rest));
      } catch {}
      return rest;
    });
  }, []);

  /** Page ID setter */
  const setCurrentPageId = useCallback((id: string) => {
    const safe = sanitizePageId(id);
    setCurrentPageIdState((prev) => {
      if (prev === safe) return prev;
      try {
        localStorage.setItem(LS_KEYS.page, safe);
      } catch {}
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
    const prevScore = Number(globals?.score ?? 0) || 0;
    const newScore = res.correct ? prevScore + 1 : prevScore;

    setGlobal("correct", res.correct);
    setGlobal("choiceIdx", res.choiceIdx);
    setGlobal("elapsedMs", res.elapsedMs);
    setGlobal("score", newScore);

    // 2) onAnswer.nextSwitch feloldása
    let nextId: string | null = null;
    const ns = page?.onAnswer?.nextSwitch;
    if (ns && typeof ns === "object") {
      const key = ns.switch;
      const probe =
        key === "score"   ? String(newScore) :
        key === "correct" ? String(res.correct) :
        String((globals as any)?.[key] ?? "");

      nextId =
        (ns.cases && (ns.cases as any)[probe]) ??
        (ns.cases && (ns.cases as any).__default) ??
        ns.default ??
        (page as any)?.next ??
        null;
    } else {
      nextId = (page as any)?.next ?? null;
    }

    // 3) Navigáció
    if (nextId) {
      goToNextPage(nextId);
    }
  }, [globals, setGlobal, goToNextPage]);

  const setIsMuted = useCallback((value: boolean) => {
    setMuted(value);
    try {
      localStorage.setItem(LS_KEYS.muted, String(value));
    } catch {}
  }, []);

  const triggerAudioRestart = useCallback(() => {
    setAudioRestartToken((t) => t + 1);
  }, []);

  /** Reset */
  const resetGame = useCallback(() => {
    abortControllers.current.forEach((ac) => {
      try {
        ac.abort();
      } catch {}
    });
    abortControllers.current = [];

    clearAllTimeouts();

    audioEls.current.forEach((el) => {
      try {
        el.pause();
        el.currentTime = 0;
      } catch {}
    });
    audioEls.current = [];

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

    try {
      localStorage.removeItem(LS_KEYS.unlocked);
      localStorage.removeItem(LS_KEYS.fragments);
      localStorage.removeItem(LS_KEYS.globalBank);
      localStorage.removeItem(LS_KEYS.flags);
      localStorage.removeItem(LS_KEYS.globals);
      localStorage.removeItem(LS_KEYS.runeImgs);
      localStorage.setItem(LS_KEYS.page, "landing");
    } catch {}
  }, [clearAllTimeouts]);

  /** Oldal betöltése backendről + normalizálás */
  useEffect(() => {
    if (!hydrated) return;
    if (!currentPageId) return;

    // ⛔ Sentinel oldalak → landing
    if (currentPageId === "feedback" || currentPageId === "__END__") {
      const safe = "landing";
      setCurrentPageIdState(safe);
      try {
        localStorage.setItem(LS_KEYS.page, safe);
      } catch {}
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
    const storySrcFromGlobals = getStringGlobal(globals, "storySrc");
    const storySrcFromLS =
      typeof window !== "undefined" ? localStorage.getItem(LS_KEYS.storySrc) : null;
    const storySrc = storySrcFromGlobals || storySrcFromLS || "";

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

        const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || "").replace(/\/+$/,"");
        const base = API_BASE || ""; // üres = same-origin

        const url = `${base}/page/${encodeURIComponent(currentPageId)}?src=${encodeURIComponent(storySrc)}`;

        const response = await fetch(url, { signal: ac.signal });
        if (!response.ok) {
          setGlobalError(`Nem sikerült lekérni az oldalt (${currentPageId}).`);
          setCurrentPageData(null);
          return;
        }

        const raw = await response.json();

        
 // 🔹 LOGIC + FRAGMENT feltételek kezelése (redirect még normalizálás előtt)

// 1) belépéskori logic.ifHasFragment / elseGoTo
const conds = Array.isArray(raw?.logic?.ifHasFragment)
  ? (raw.logic.ifHasFragment as { fragment: string; goTo: string }[])
  : [];

if (conds.length || raw?.logic?.elseGoTo) {
  for (const cond of conds) {
    if (
      cond?.fragment &&
      cond?.goTo &&
      Array.isArray(unlockedFragments) &&
      unlockedFragments.includes(cond.fragment)
    ) {
      console.log(`[Logic] ${raw.id} → ${cond.goTo} (ifHasFragment hit)`);
      setCurrentPageId(cond.goTo);
      return;
    }
  }

  if (raw?.logic?.elseGoTo) {
    console.log(`[Logic] ${raw.id} → ${raw.logic.elseGoTo} (elseGoTo)`);
    setCurrentPageId(raw.logic.elseGoTo);
    return;
  }
}

// 2) oldal-elérhetőség: needsFragment / needsFragmentAny
const needsAll: string[] = Array.isArray(raw?.needsFragment)
  ? (raw.needsFragment as string[]).filter(Boolean)
  : [];
const needsAny: string[] = Array.isArray(raw?.needsFragmentAny)
  ? (raw.needsFragmentAny as string[]).filter(Boolean)
  : [];

let blocked = false;

if (needsAll.length) {
  const missing = needsAll.filter((f) => !unlockedFragments.includes(f));
  if (missing.length) {
    console.warn(`[Logic] Page ${raw.id} blocked, missing all-of:`, missing);
    blocked = true;
  }
}

if (!blocked && needsAny.length) {
  const hasAny = needsAny.some((f) => unlockedFragments.includes(f));
  if (!hasAny) {
    console.warn(`[Logic] Page ${raw.id} blocked, needs any-of:`, needsAny);
    blocked = true;
  }
}

if (blocked) {
  // ide később tehetsz okosabb fallbacket
  setCurrentPageId("landing");
  return;
}

// Forrás kiválasztás és laposítás
const srcBank: any =
  (raw && typeof raw === "object" && raw.fragmentsGlobal) ??
  (raw && typeof raw === "object" && raw.fragments) ??
  undefined;

const flatFragments: Record<string, any> =
  srcBank && typeof srcBank === "object"
    ? srcBank.recall || srcBank.saved || srcBank.fragments
      ? {
          ...(srcBank.recall ?? {}),
          ...(srcBank.saved ?? {}),
          ...(srcBank.fragments ?? {}),
          ...(srcBank ?? {}),
        }
      : srcBank
    : {};


const normalized: PageData = {
  ...raw,
  audio: {
    ...raw?.audio,
    text: typeof raw?.text === "string" ? raw.text : "",
    background: raw?.audio?.background ?? raw?.audio?.bg ?? null,
    mainNarration: raw?.audio?.mainNarration ?? raw?.audio?.main ?? null,
    sidePreloadPages: raw?.audio?.sidePreloadPages ?? [],
  },
  voicePrompt: raw?.voicePrompt ?? raw?.tts ?? null,
  fragmentsGlobal:
    flatFragments && Object.keys(flatFragments).length ? flatFragments : undefined,
};

setCurrentPageData(normalized);

        // Meta refresh (mindig)
        try {
          const metaSrc = (getStringGlobal(globals, "storySrc") || localStorage.getItem(LS_KEYS.storySrc) || "")
            .replace(/^\/?stories\//, "/stories/");
          if (metaSrc) {
            const base = metaSrc.startsWith("http") ? metaSrc : `${(process.env.NEXT_PUBLIC_API_BASE || "")}${metaSrc}`;
            const bust = base.includes("?") ? `&v=${Date.now()}` : `?v=${Date.now()}`;
            const full = `${base}${bust}`;

            fetch(full, { cache: "no-store" })
              .then(r => r.json())
              .then(story => {
                if (story?.meta) {
                  setGlobal("meta", story.meta);
                  if (story.meta?.ctaPresets) setGlobal("ctaPresets", story.meta.ctaPresets);
                  if (story.meta?.endDefaultCta) setGlobal("endDefaultCta", story.meta.endDefaultCta);
                  if (story.meta?.title) setGlobal("storyTitle", story.meta.title);
                  if (story.meta?.id) setGlobal("storyId", story.meta.id);
                  try { localStorage.setItem("storyMetaCache", JSON.stringify(story.meta)); } catch {}
                  console.log("[GameState] Meta refreshed:", story.meta);
                }
              })
              .catch(err => console.warn("[GameState] meta refresh error", err));
          }
        } catch {}

        setGlobalError(null);
      } catch (err: any) {
        if (err?.name !== "AbortError") {
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
    globals?.storySrc,
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
    const bank = (currentPageData as any)?.fragmentsGlobal;
    if (bank && typeof bank === "object") {
      const casted: FragmentBank = {};
      Object.keys(bank).forEach((k) => {
        const o = bank[k] || {};
        casted[k] = {
          text: typeof o.text === "string" ? o.text : undefined,
          replayImageId: typeof o.replayImageId === "string" ? o.replayImageId : undefined,
        };
      });
      setGlobalFragments((prev) => {
        const merged = { ...prev, ...casted };
        try {
          localStorage.setItem(LS_KEYS.globalBank, JSON.stringify(merged));
        } catch {}
        return merged;
      });
    }
  }, [hydrated, currentPageData?.fragmentsGlobal]);

  /** Rehidratálás: oldalszintű fragmentek visszatöltése */
  useEffect(() => {
    if (!hydrated) return;
    if (!unlockedFragments?.length) return;
    unlockedFragments.forEach((id) => {
      if (!fragments[id] && globalFragments[id]) {
        addFragment(id, {
          text: globalFragments[id].text,
          replayImageId: globalFragments[id].replayImageId,
        });
      }
    });
  }, [hydrated, unlockedFragments, fragments, globalFragments, addFragment, currentPageId]);

  /** Oldal-szintű unlockFragments auto */
  useEffect(() => {
    if (!hydrated) return;
    const ids = (currentPageData as any)?.unlockEnterFragments;
    if (Array.isArray(ids) && ids.length) {
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

export const useGameState = () => useContext(GameStateContext);
