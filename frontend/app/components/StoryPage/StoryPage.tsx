"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useLayoutEffect,
  useRef,
} from "react";
import { flushSync } from "react-dom";
import { useSearchParams } from "next/navigation";

import style from "./StoryPage.module.scss";
import {
  composeBlocks,
  explodeTextToBlocks,
  normalizeAssetUrl,
  resolvePromptFragments,
} from "./storyPageText";
import type { FragmentBank, FragmentData } from "./storyPageTypes";
import dockStyles from "../layout/InteractionDock/InteractionDock.module.scss";
import canvasStyles from "../layout/Canvas/Canvas.module.scss";

import LoadingOverlay from "../LoadingOverlay/LoadingOverlay";
import GeneratedImage_with_fadein from "../GeneratedImage/GeneratedImage";
import AudioPlayer from "../AudioPlayer";
import RewardOverlay from "../labs/RewardOverlay/RewardOverlay";
import FragmentReplayOverlay from "../labs/FragmentReplayOverlay/FragmentReplayOverlay";
import RestartButton from "../RestartButton/RestartButton";
import SmokeField from "../SmokeField/SmokeField";
import TransitionVideo from "../TransitionVideo/TransitionVideo";
import FeedbackOverlay from "../FeedbackOverlay/FeedbackOverlay";
import NineSlicePanel from "../NineSlicePanel/NineSlicePanel";
import DecorBackground from "../layout/DecorBackground/DecorBackground";
import ProgressStrip from "../layout/ProgressStrip/ProgressStrip";
import NarrativePanel from "../layout/NarrativePanel/NarrativePanel";
import RuneDockDisplay from "../runes/RuneDockDisplay";
import BrickBottomOverlay from "../labs/BrickBottomOverlay/BrickBottomOverlay";
import PuzzleRunes from "../labs/PuzzleRunes/PuzzleRunes";
import RiddleQuiz from "../labs/RiddleQuiz/RiddleQuiz";
import AnalyticsReport from "../AnalyticsReport/AnalyticsReport";
import AnalyticsSync from "../AnalyticsSync/AnalyticsSync";
import MediaFrame from "../layout/MediaFrame/MediaFrame";
import InteractionDock from "../layout/InteractionDock/InteractionDock";
import ActionBar from "../layout/ActionBar/ActionBar";
import Canvas from "../layout/Canvas/Canvas";
import HeaderBar from "../layout/HeaderBar/HeaderBar";
import CampaignCta from "../CampaignCta/CampaignCta";

import {
  useGameState,
  resolveNextFromPage, normalizeImagePrompt
} from "../../lib/GameStateContext";

import { preloadImage } from "../../lib/preloadImage";
import { preloadAudio, getLastAudioPerfLog } from "../../lib/audioCache";
import { useSfxScheduler } from "../../lib/useSfxScheduler";
import { setSfxMuted, stopAllSfx } from "../../lib/sfxBus";
import { getLastImagePerfLog } from "../../lib/useImageCache";
import { clearImageCache } from "../../lib/clearImageCache";
import { clearVoiceCache } from "../../lib/clearVoiceCache";

import {
  trackPageEnter,
  trackPageExit,
  trackChoice,
  trackRuneUnlock,
  trackUiClick,
  trackPuzzleTry,
  trackPuzzleResult,
  setTerminalPages,
  inferTerminalPagesFromStory,
  startNewRunSession ,
} from "../../lib/analytics";


import { fetchPageJsonCached } from "@/app/lib/story/fetchPageJson";
import { runSecuritySmokeTest } from "@/app/lib/security/securitySmokeTest";

import { resolveCta } from "../../core/cta/ctaResolver";
import type { CtaContext, CampaignConfig } from "../../core/cta/ctaTypes";

import { RUNE_ICON, isRuneId } from "../../lib/runeIcons";

import AdminQuickPanel from "../AdminQuickPanel/AdminQuickPanel";
import ProfileCardFrame from "../layout/ProfileCardFrame/ProfileCardFrame";




const DEBUG_RUNES = true;
// Globális narrációs / gépelési indulási késleltetés (ms).
// 3000ms helyett alacsonyabb érték, hogy hamarabb induljon a szöveg + hang.
const DELAY_MS = 1200;
const FADE_IN_MS = 600;
const API_BASE = (
  process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000"
).replace(/\/+$/, "");

/** ---------- Transition video típus ---------- */

type TransitionVideoData = {
  id: string;
  type: "transition";
  transition: {
    kind: "video";
    src: string;
    srcWebm?: string;
    poster?: string;
    autoplay?: boolean;
    muted?: boolean;
    loop?: boolean;
    fadeInMs?: number;
    fadeOutMs?: number;
    skipAfterMs?: number;
    nextPageId: string;
    duckToVol?: number;
    attackMs?: number;
    releaseMs?: number;
    preloadNext?: boolean;
  };
};

function isTransitionVideoPage(p: any): p is TransitionVideoData {
  return !!p && p.type === "transition" && p.transition?.kind === "video";
}

/** ---------- Puzzle típusok ---------- */

type PuzzleRiddle = {
  type: "puzzle";
  kind: "riddle";
  question: string;
  options: string[];
  correctIndex: number;
  onAnswer?: {
    setFlags?: string[] | Record<string, boolean>;
    setGlobals?: Record<string, string>;
    nextSwitch?: any;
  };
};

type PuzzleRunesPage = {
  type: "puzzle";
  kind: "runes";
  prompt?: string;
  options: string[];

  /** Klasszikus módhoz: helyes megoldáslista. Open módban elhagyható. */
  answer?: string[];

  maxAttempts?: number;

  /** Open módhoz: hány runát választhat a user (pl. 2) */
  maxPick?: number;

  /** Open módhoz: flag prefix, pl. "L2_opt_" → L2_opt_1, L2_opt_2, ... */
  optionFlagsBase?: string;

  /** PuzzleRunes működési módjai – ha nincs, a komponens defaultot használ */
  mode?: "ordered" | "set";
  feedback?: "keep" | "reset";

  onSuccess?: { goto: string; setFlags?: string[] | Record<string, boolean> };
  onFail?: { goto: string; setFlags?: string[] | Record<string, boolean> };
};


const isRiddle = (p: any): p is PuzzleRiddle =>
  p?.type === "puzzle" && p?.kind === "riddle";

const isRunes = (p: any): p is PuzzleRunesPage =>
  p?.type === "puzzle" && p?.kind === "runes";

/** ---------- Replay vizuál választó ---------- */

function pickReplayVisual(
  page: any,
  unlocked: string[] | Set<string>,
  bank: FragmentBank | undefined
): { imageId: string | null; durationMs: number } {
  const unlockedSet = Array.isArray(unlocked) ? new Set(unlocked) : unlocked;
  const list = Array.isArray(page?.replayOverlay) ? page.replayOverlay : [];

  for (const r of list) {
    const { fragmentId, imageId, durationMs } = r || {};
    if (!fragmentId) continue;
    if (!unlockedSet.has(fragmentId)) continue;
    const chosenImage =
      imageId || bank?.[fragmentId]?.replayImageId || null;
    if (chosenImage) {
      return {
        imageId: chosenImage,
        durationMs: Number(durationMs ?? 1800),
      };
    }
  }
  for (const id of unlockedSet) {
    const rid = bank?.[id as string]?.replayImageId;
    if (rid) return { imageId: rid, durationMs: 1800 };
  }
  return { imageId: null, durationMs: 1800 };
}

/** ---------- SFX path normalizáló ---------- */

function normalizeSfxUrl(raw?: string): string | null {
  if (!raw) return null;
  let f = raw.trim();
  if (!f) return null;
  if (/^https?:\/\//i.test(f)) return f;
  if (f.startsWith("/")) return f;
  if (f.startsWith("assets/")) return "/" + f.replace(/^assets\//, "assets/");
  if (f.startsWith("sfx/")) return "/assets/" + f;
  return "/assets/sfx/" + f.replace(/^sfx\//, "");
}

/** ---------- Measure típus ---------- */

type Measure = {
  panel: { x: number; y: number; width: number; height: number };
  content: { x: number; y: number; width: number; height: number };
};

/** ---------- Komponens ---------- */

const StoryPage: React.FC = () => {
  /** --- state --- */
  const [skipAvailable, setSkipAvailable] = useState(false);
  const [showReward, setShowReward] = useState(false);
  const [showReplay, setShowReplay] = useState(false);
  const [skipRequested, setSkipRequested] = useState(false);
  const [replayKey, setReplayKey] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [showChoices, setShowChoices] = useState(false);
  const [animateNext, setAnimateNext] = useState(false);
  const [imagesByFlag, setImagesByFlag] = useState<Record<string, string>>({});
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [dockJustAppeared, setDockJustAppeared] = useState(false);
  const [choicePageId, setChoicePageId] = useState<string | null>(null);
  const [pageUnlockedForInteraction, setPageUnlockedForInteraction] =
    useState<string | null>(null);
  const [narrationT0, setNarrationT0] = useState<number | null>(null);
  const [devOpen, setDevOpen] = useState(false);
  const [devText, setDevText] = useState<string>("");
  const [typingDone, setTypingDone] = useState(false);
  const [measure, setMeasure] = useState<Measure | null>(null);
  const [lockedMeasure, setLockedMeasure] = useState<Measure | null>(null);
  const [localPageId, setLocalPageId] = useState<string | undefined>(undefined);
  
  const endTrackedRef = useRef(false);
  /** --- refs (layout + analitika) --- */
  const pageRootRef = useRef<HTMLDivElement>(null);

  // ezek mind kellenek a lock-hoz és az unlock-hoz
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const scrollFreezeRef = useRef<HTMLElement | null>(null);
  const narrFreezeRef = useRef<HTMLDivElement | null>(null);
  const dockFreezeRef = useRef<HTMLDivElement | null>(null);

  const anchorPortalRef = useRef<Measure["content"] | null>(null);

  const prevWasChoiceRef = useRef(false);
  const enterTsRef = useRef<number | null>(null);
  const lastPageRef = useRef<string | null>(null);
  const puzzleStartRef = useRef<number | null>(null);
  const firstLockTimer = useRef<number | null>(null);
  const processedRunesForPage = useRef<string | null>(null);
  const canvasRootRef = useRef<HTMLDivElement | null>(null);
  const [hideNarration, setHideNarration] = useState(false);

  /** --- helpers: lock/unlock layout a page váltás alatt --- */

  const lockHeightsForTransition = useCallback(() => {
    const scrollEl = scrollContainerRef.current;
    const narrEl = narrFreezeRef.current;
    const dockEl = dockFreezeRef.current;

    if (scrollEl) {
      const h = scrollEl.offsetHeight;
      scrollEl.style.height = h + "px";
      scrollEl.style.minHeight = h + "px";
      scrollFreezeRef.current = scrollEl;
    }
    if (narrEl) {
      const h = narrEl.offsetHeight;
      narrEl.style.height = h + "px";
      narrEl.style.overflow = "hidden";
    }
    if (dockEl) {
      const h = dockEl.offsetHeight;
      dockEl.style.height = h + "px";
      dockEl.style.overflow = "hidden";
    }
  }, []);

  const unlockHeightsAfterTransition = useCallback(() => {
    const scrollEl = scrollFreezeRef.current;
    const narrEl = narrFreezeRef.current;
    const dockEl = dockFreezeRef.current;

    if (scrollEl) {
      scrollEl.style.height = "";
      scrollEl.style.minHeight = "";
      scrollFreezeRef.current = null;
    }
    if (narrEl) {
      narrEl.style.height = "";
      narrEl.style.overflow = "";
    }
    if (dockEl) {
      dockEl.style.height = "";
      dockEl.style.overflow = "";
    }
  }, []);

  /** --- context --- */
  const {
    currentPageData: pageData,
    unlockedFragments,
    setUnlockedFragments,
    goToNextPage,
    isMuted,
    setIsMuted,
    triggerAudioRestart,
    registerAbort,
    registerTimeout,
    isLoading,
    currentPageId,
    globalError,
    fragments,
    addFragment,
    globalFragments,
    flags,
    setFlag,
    globals,
    setGlobal,
    setStorySrc,
    progressDisplay,
    storyId,
    sessionId,
    runId,
  } = useGameState() as any as {
    currentPageData: any;
    unlockedFragments: string[];
    setUnlockedFragments: (x: string[]) => void;
    goToNextPage: (id: string) => void;
    isMuted: boolean;
    setIsMuted: (m: boolean) => void;
    triggerAudioRestart: () => void;
    registerAbort: (ac: AbortController) => void;
    registerTimeout: (id: number) => void;
    isLoading: boolean;
    currentPageId?: string;
    globalError?: string | null;
    fragments: FragmentBank;
    addFragment: (id: string, data: FragmentData) => void;
    globalFragments: FragmentBank;
    flags: Set<string>;
    setFlag: (f: string) => void;
    globals: Record<string, any>;
    setGlobal: (k: string, v: string) => void;
    setStorySrc?: (src: string) => void;
    progressDisplay: { value?: number; milestones?: Array<{ x: number; label?: string }> };
    storyId?: string;
    sessionId?: string;
    runId?: string;
  };

  /** --- URL params / analytics --- */
  const params = useSearchParams();

  useEffect(() => {
  const skinParam = params.get("skin");
 
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);




const skin = useMemo(() => {
  return (globals as any)?.skin || params.get("skin") || "legacy-default";
}, [(globals as any)?.skin, params]);

  const showAnalytics = params.get("analytics") === "1";

  const derivedStoryId = useMemo(() => {
    const ctx = (storyId || "").trim();
    if (ctx && !/^global$/i.test(ctx)) return ctx;

    const src = globals?.storySrc || params.get("src") || undefined;
    if (src) {
      const base = (src.split("/").pop() || src).replace(/\.json$/i, "");
      if (base && !/^global$/i.test(base)) return base;
    }

    const t = globals?.storyTitle || params.get("title") || undefined;
    if (t) {
      const slug = t
        .trim()
        .toLowerCase()
        .replace(/[^\w]+/g, "_")
        .replace(/^_+|_+$/g, "");
      if (slug) return slug;
    }

    return "default_story";
  }, [storyId, globals?.storySrc, globals?.storyTitle, params]);

const derivedSessionId = sessionId; // ennyi
const derivedRunId = runId;


 const analyticsSync =
  derivedStoryId && derivedSessionId ? (
    <AnalyticsSync storyId={derivedStoryId} sessionId={derivedSessionId} intervalMs={30000} />
  ) : null;

    const runePackForDisplay = useMemo(() => {
    const rp: any = globals?.runePack;
    if (!rp || typeof rp !== "object") return undefined;

    if (rp.mode === "triple") {
      const icons: string[] = Array.isArray(rp.icons)
        ? rp.icons.filter((x: any) => typeof x === "string").slice(0, 3)
        : [];
      if (!icons.length) return undefined;
      return {
        mode: "triple" as const,
        icons,
        palette: rp.palette,
      };
    }

    const icon: string | undefined =
      typeof rp.icon === "string"
        ? rp.icon
        : Array.isArray(rp.icons) && typeof rp.icons?.[0] === "string"
        ? rp.icons[0]
        : undefined;
    if (!icon) return undefined;

    return {
      mode: "single" as const,
      icon,
      palette: rp.palette,
    };
  }, [globals?.runePack]);

  // 🔹 ITT LEGYEN
  const unlockedPlus = useMemo(
    () =>
      new Set<string>([
        ...unlockedFragments,
        ...Array.from(flags ?? new Set<string>()),
      ]),
    [unlockedFragments, flags]
  );

  // 🔹 LOGIC típusú oldalak automatikus futtatása (L3_route_switch, Route_E_result_logic, stb.)
  useEffect(() => {
    if (!pageData || pageData.type !== "logic") return;

    const rules = Array.isArray(pageData.logic) ? pageData.logic : [];
    if (!rules.length) return;

    const chosen = (() => {
      for (const rule of rules) {
        const conds = Array.isArray(rule?.if) ? rule.if : null;
        if (!conds || !rule?.goto) continue;

        const ok = conds.every((raw: string) => {
          const t = String(raw || "").trim();
          if (!t) return false;

          // frag:ID → fragment ID
          if (t.startsWith("frag:")) {
            const id = t.slice(5);
            return unlockedPlus.has(id);
          }

          // flag:ID → flag ID
          if (t.startsWith("flag:")) {
            const id = t.slice(5);
            return unlockedPlus.has(id);
          }

          // plain ID: lehet flag vagy fragment is – elég, ha bármelyikben benne van
          return unlockedPlus.has(t);
        });

        if (ok) {
          return String(rule.goto);
        }
      }

      // default ág (pl. { "default": "Route_E_intro" })
      const fallback = rules.find((r: any) => typeof r?.default === "string");
      return fallback ? String(fallback.default) : null;
    })();

    if (chosen && chosen !== pageData.id) {
      try {
        localStorage.setItem("currentPageId", chosen);
      } catch {}
      goToNextPage(chosen);
    }
  }, [pageData, unlockedPlus, goToNextPage]);

  /** --- setup effects --- */

  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      (window as any).runSecSmoke = () => {
        const result = runSecuritySmokeTest();
        console.log("[SMOKE][FINAL]", result);
        return result;
      };
      console.log("[SMOKE] runSecSmoke() is now available in console");
    }
  }, []);

  useLayoutEffect(() => {
    const root = pageRootRef.current;
    if (!root) return;
    const scrollEl =
      root.querySelector<HTMLElement>('[class*="canvasWrap"]');
    if (!scrollEl) return;
    scrollContainerRef.current = scrollEl;

    const setDocH = () => {
      requestAnimationFrame(() => {
        scrollEl.style.setProperty(
          "--doc-h",
          `${scrollEl.scrollHeight}px`
        );
      });
    };

    setDocH();

    const ro = new ResizeObserver(setDocH);
    ro.observe(scrollEl);

    const mo = new MutationObserver(setDocH);
    mo.observe(scrollEl, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    const onResize = () => setDocH();
    window.addEventListener("resize", onResize);

    return () => {
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, []);

  // runeImagesByFlag load/save
  useEffect(() => {
    try {
      const raw = localStorage.getItem("runeImagesByFlag");
      if (raw) setImagesByFlag(JSON.parse(raw));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(
        "runeImagesByFlag",
        JSON.stringify(imagesByFlag)
      );
    } catch {}
  }, [imagesByFlag]);

// storySrc, start, title param
useEffect(() => {
  const src = params.get("src");
  const start = params.get("start");
  const title = params.get("title");
  const rs = params.get("rs") || ""; // Restart / new-run marker

  if (src) {
    // ✅ fontos: használjuk a context helper-t, mert ez tölti be a meta-t és beállítja a storyId-t is
    setStorySrc?.(src);
  }

  if (title) {
    setGlobal?.("storyTitle", title);
    try {
      localStorage.setItem("storyTitle", title);
    } catch {}
  }

  // ✅ fontos: startPageId + runKey átadás a contextnek
  if (start) {
    setGlobal?.("startPageId", start);
    try {
      localStorage.setItem("startPageId", start);
    } catch {}
  }

  if (rs) {
    setGlobal?.("runKey", rs);
    try {
      localStorage.setItem("runKey", rs);
    } catch {}
  }

  if (start && start !== currentPageId) {
    try {
      localStorage.setItem("currentPageId", start);
    } catch {}
    goToNextPage(start);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);




  // page change reset
  useLayoutEffect(() => {
    if (pageData?.id !== localPageId) {
      setShowChoices(false);
      setChoicePageId(null);
      setAnimateNext(false);
      setSkipRequested(false);
      setSkipAvailable(false);
      setReplayKey((prev) => prev + 1);
      setIsFadingOut(false);
      setDockJustAppeared(false);
      setPageUnlockedForInteraction(null);
      setHideNarration(false); 
      setLocalPageId(pageData?.id);
    }
  }, [pageData?.id, localPageId]);

  // narration T0 reset + stop SFX cleanup
  useEffect(() => {
    setNarrationT0(null);
    return () => {
      try {
        stopAllSfx();
      } catch {}
    };
  }, [pageData?.id]);

  // sync mute -> sfxBus
  useEffect(() => {
    try {
      setSfxMuted(!!isMuted);
    } catch {}
  }, [isMuted]);

  // hide replay overlay on page change
  useEffect(() => {
    setShowReplay(false);
  }, [pageData?.id]);

  useEffect(() => {
    setLockedMeasure(null);
  }, [pageData?.id]);

  useEffect(() => {
    setTypingDone(false);
  }, [pageData?.id]);

  // puzzle stopwatch
  useEffect(() => {
    puzzleStartRef.current =
      isRiddle(pageData) || isRunes(pageData) ? Date.now() : null;
  }, [pageData?.id]);

// analytics: page enter/exit
useEffect(() => {
  if (!derivedStoryId || !derivedSessionId) return;

  const pageId = currentPageId || pageData?.id;
  if (!pageId) return;

  // --- END fallback: ha nincs pageData.type / endAlias, de az id "end_*"
  const fallbackEndAlias =
    typeof pageData?.id === "string" && pageData.id.startsWith("end_")
      ? pageData.id.slice(4) // "end_espresso" -> "espresso"
      : undefined;

  const normalizedPageType =
    pageData?.type || (fallbackEndAlias ? "end" : undefined);

  const normalizedEndAlias =
    (pageData as any)?.endAlias || fallbackEndAlias;

  if (lastPageRef.current && enterTsRef.current != null) {
    const dwell = Date.now() - enterTsRef.current;
    try {
      trackPageExit(
        derivedStoryId,
        derivedSessionId,
        lastPageRef.current,
        Math.max(0, dwell)
      );
    } catch {}
  }

  try {
    trackPageEnter(
      derivedStoryId,
      derivedSessionId,
      pageId,
      lastPageRef.current ?? undefined,
      {
        runId: derivedRunId || undefined,
        rawPageId: pageData?.id,          // a tényleges node id (ami nálad most "end_espresso" is lehet)
        pageType: normalizedPageType,     // <- "end" lesz, ha end_* oldal
        endAlias: normalizedEndAlias,     // <- "espresso" lesz, ha end_* oldal
      }
    );
  } catch {}

  enterTsRef.current = Date.now();
  lastPageRef.current = pageId;

  return () => {
    if (!lastPageRef.current || enterTsRef.current == null) return;
    const dwell = Date.now() - enterTsRef.current;
    try {
      trackPageExit(
        derivedStoryId,
        derivedSessionId,
        lastPageRef.current,
        Math.max(0, dwell)
      );
    } catch {}
    enterTsRef.current = null;
    lastPageRef.current = null;
  };
}, [
  derivedStoryId,
  derivedSessionId,
  currentPageId,
  derivedRunId,
  pageData?.id,
  pageData?.type,
]);


  // analytics: tab hide
  useEffect(() => {
    if (!derivedStoryId || !derivedSessionId) return;

    const onHide = () => {
      if (document.visibilityState !== "hidden") return;
      if (!lastPageRef.current || enterTsRef.current == null) return;
      const dwell = Date.now() - enterTsRef.current;
      try {
        trackPageExit(
          derivedStoryId,
          derivedSessionId,
          lastPageRef.current,
          Math.max(0, dwell)
        );
      } catch {}
      enterTsRef.current = Date.now();
    };

    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [derivedStoryId, derivedSessionId]);

  // unlockRunes on page enter
  useEffect(() => {
    if (!pageData?.id) return;
    if (processedRunesForPage.current === pageData.id) return;
    processedRunesForPage.current = pageData.id;

    const runeIds: string[] = Array.isArray(
      (pageData as any)?.unlockRunes
    )
      ? (pageData as any).unlockRunes
      : [];
    if (!runeIds.length) return;

    const already = new Set(
      Array.from(flags ?? new Set<string>()).filter(isRuneId)
    );
    const newRunes = runeIds
      .filter(isRuneId)
      .filter((id) => !already.has(id));
    if (!newRunes.length) return;

    const choiceRuneIds = new Set<string>();
    if (Array.isArray(pageData?.choices)) {
      for (const c of pageData.choices) {
        const locks = Array.isArray(c?.reward?.locks)
          ? c.reward.locks
          : typeof c?.reward?.locks === "string"
          ? [c.reward.locks]
          : [];
        locks.forEach((id: any) => {
          const s = String(id);
          if (isRuneId(s)) choiceRuneIds.add(s);
        });

        if (Array.isArray(c?.actions)) {
          c.actions.forEach((a: any) => {
            const id = a?.id ?? a?.unlockRune ?? a?.setFlag;
            if (id && isRuneId(String(id)))
              choiceRuneIds.add(String(id));
          });
        }
      }
    }

    const pageOnlyRunes = newRunes.filter(
      (rid) => !choiceRuneIds.has(rid)
    );
    if (!pageOnlyRunes.length) return;

    const wantOverlay = !!(pageData as any)?.overlayRunesOnEnter;

    if (wantOverlay) {
      flushSync(() => {
        pageOnlyRunes.forEach((rid) => setFlag(rid));
      });
      try {
        const pageId = pageData?.id || currentPageId || "unknown";
        if (derivedStoryId && derivedSessionId && pageId) {
          pageOnlyRunes.forEach((rid) => {
            if (!rid) return;
            trackRuneUnlock(
              derivedStoryId,
              derivedSessionId,
              pageId,
              rid,
              { source: "pageEnter", mode: "silent-nooverlay" }
            );
          });
        }
      } catch {}
    } else {
      Promise.resolve().then(() => {
        pageOnlyRunes.forEach((rid) => {
          setFlag(rid);
          try {
            const pageId =
              pageData?.id || currentPageId || "unknown";
            if (derivedStoryId && derivedSessionId && pageId && rid) {
              trackRuneUnlock(
                derivedStoryId,
                derivedSessionId,
                pageId,
                rid,
                { source: "pageEnter", mode: "silent" }
              );
            }
          } catch {}
        });
      });
    }
  }, [
    pageData?.id,
    pageData?.choices,
    flags,
    setFlag,
    derivedStoryId,
    derivedSessionId,
    currentPageId,
  ]);

  // cleanup firstLockTimer
  useEffect(() => {
    return () => {
      if (firstLockTimer.current != null) {
        clearTimeout(firstLockTimer.current);
        firstLockTimer.current = null;
      }
    };
  }, [pageData?.id]);

  // expanded anim
  useEffect(() => {
    setExpanded(false);
    const id = window.setTimeout(() => setExpanded(true), 50);
    registerTimeout(id);
    return () => clearTimeout(id);
  }, [pageData?.id, registerTimeout]);

  // HOTFIX: sync unlockFragments -> fragments bank
  useEffect(() => {
    const ids = (pageData as any)?.unlockFragments as
      | string[]
      | undefined;
    if (!ids?.length) return;
    if (!globalFragments) return;

    ids.forEach((id: string) => {
      if (!id) return;
      const src = (globalFragments as any)[id];
      if (!src) return;
      if (
        !fragments?.[id]?.text &&
        (src.text || src.replayImageId)
      ) {
        addFragment(id, {
          text: src.text,
          replayImageId: src.replayImageId,
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageData?.id, globalFragments]);

  // recall diag
  useEffect(() => {
    const raw = (pageData as any)?.fragmentRecall;
    const recalls = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const recallIds = recalls.map((r) => r?.id).filter(Boolean);

    const missingInFragments = recallIds.filter(
      (id) => !(fragments?.[id]?.text)
    );
    const availableInFragments = recallIds.filter((id) =>
      Boolean(fragments?.[id]?.text)
    );

    const globalKeys =
      globalFragments && typeof globalFragments === "object"
        ? Object.keys(globalFragments).slice(0, 50)
        : [];

    console.groupCollapsed("[RECALL DIAG]", pageData?.id);
    console.log("fragmentRecall(raw):", raw);
    console.log("recallIds:", recallIds);
    console.log("unlockedFragments:", unlockedFragments);
    console.log("fragments(keys):", Object.keys(fragments || {}));
    console.log(
      "globalFragments(keys top50):",
      globalKeys
    );
    console.log("availableInFragments:", availableInFragments);
    console.log("missingInFragments:", missingInFragments);

    if (recallIds.length && missingInFragments.length) {
      console.warn(
        "[RECALL ROOT-CAUSE] recall ID nincs fragments store-ban"
      );
    }
    console.groupEnd();
  }, [
    pageData?.id,
    pageData?.fragmentRecall,
    fragments,
    globalFragments,
    unlockedFragments,
  ]);

  useEffect(() => {
  if (!derivedStoryId) return;

  // próbáljuk megtalálni a betöltött sztori JSON-t a globals-ban
  const storyJson =
    (globals as any)?.loadedStory ??
    (globals as any)?.storyJson ??
    (globals as any)?.storyData ??
    (globals as any)?.story;

  if (!storyJson) return;

  const terminals = inferTerminalPagesFromStory(storyJson);
  if (terminals.length) {
    setTerminalPages(derivedStoryId, terminals);
  }
}, [derivedStoryId, globals]);


  // sidePreload voice/sfx/narration
  useEffect(() => {
    if (!globals?.storySrc) return;
    if (!pageData?.audio?.sidePreloadPages?.length) return;

    const controllers: AbortController[] = [];

    const normalizeNarrUrl = (raw?: string): string | null => {
      const s = String(raw ?? "").trim();
      if (!s) return null;
      if (/^https?:\/\//i.test(s) || s.startsWith("/")) return s;
      if (s.startsWith("assets/"))
        return "/" + s.replace(/^assets\//, "assets/");
      if (s.startsWith("audio/")) return `/assets/${s}`;
      return `/assets/audio/${s}`;
    };

    (pageData.audio.sidePreloadPages as string[]).forEach(
      (pid: string) => {
        const ac = new AbortController();
        controllers.push(ac);
        registerAbort(ac);

        fetchPageJsonCached<any>(
          `${API_BASE}/page/${pid}?src=${encodeURIComponent(
            globals.storySrc!
          )}`,
          {
            storyId: derivedStoryId,
            pageId: pid,
            ttlMs: 18 * 60_000,
            signal: ac.signal,
          }
        )
          .then((data) => {
            if (Array.isArray(data?.sfx)) {
              data.sfx.forEach((s: any) => {
                const url = normalizeSfxUrl(s?.file);
                if (!url) return;
                try {
                  preloadAudio(url);
                } catch {}
              });
            }

            if (data?.audio?.mainNarration) {
              const url = normalizeNarrUrl(
                data.audio.mainNarration
              );
              if (url) {
                try {
                  preloadAudio(url);
                } catch {}
              }
            }

            if (Array.isArray(data?.audio?.playlist)) {
              data.audio.playlist.forEach((it: any) => {
                const src =
                  it?.src ??
                  it?.path ??
                  it?.narration ??
                  it?.file;
                const url = normalizeNarrUrl(src);
                if (!url) return;
                try {
                  preloadAudio(url);
                } catch {}
              });
            }

            if (data?.audio?.background) {
              const url = normalizeNarrUrl(
                data.audio.background
              );
              if (url) {
                try {
                  preloadAudio(url);
                } catch {}
              }
            }
          })
          .catch((err) => {
            if (err?.name !== "AbortError") {
              console.error(
                `Side preload error for ${pid}`,
                err
              );
            }
          });
      }
    );

    return () => {
      controllers.forEach((c) => {
        try {
          c.abort();
        } catch {}
      });
    };
  }, [
    globals?.storySrc,
    pageData?.audio?.sidePreloadPages,
    registerAbort,
    derivedStoryId,
  ]);
  // preload images for preloadNextPages (FRAGMENT-RESOLVED)
  useEffect(() => {
    if (!globals?.storySrc) return;
    const ids = pageData?.imageTiming?.preloadNextPages;
    if (!ids?.length) return;

    const controllers: AbortController[] = [];

    ids.forEach(async (nextId: string) => {
      const ac = new AbortController();
      controllers.push(ac);
      registerAbort(ac);

      try {
        const nextPageData = await fetchPageJsonCached<any>(
          `${API_BASE}/page/${nextId}?src=${encodeURIComponent(
            globals.storySrc!
          )}`,
          {
            storyId: derivedStoryId,
            pageId: nextId,
            ttlMs: 18 * 60_000,
            signal: ac.signal,
          }
        );

        if (nextPageData?.imagePrompt) {
          // 1) normalizáljuk az imagePrompt-ot
          const raw = normalizeImagePrompt(
            nextPageData.imagePrompt as any
          );

          // 2) fragmentek feloldása a JELENLEGI állapot szerint
          const basePrompt = raw.prompt || "";
          const baseNegative = raw.negative || "";

          const resolvedPrompt = resolvePromptFragments(
            basePrompt,
            unlockedPlus,
            fragments,
            globalFragments
          );
          const resolvedNegative = resolvePromptFragments(
            baseNegative,
            unlockedPlus,
            fragments,
            globalFragments
          );

          // 3) paraméterek összeollózása (seed, negativePrompt stb.)
          const mergedParams: any = {
            ...(nextPageData.imageParams || {}),
            negativePrompt:
              resolvedNegative ||
              (nextPageData.imageParams as any)?.negativePrompt,
            seed:
              typeof raw.seed === "number"
                ? raw.seed
                : (nextPageData.imageParams as any)?.seed,
            styleProfile:
              raw.styleProfile ??
              (nextPageData.imageParams as any)?.styleProfile,
          };

          // 4) preload ugyanazzal a FELDOLGOZOTT prompttal, mint amit a render is használ
          await preloadImage(
            nextPageData.id,
            {
              // megtartjuk az objektum formát, csak a combinedPrompt/negativePrompt már feloldott
              ...(typeof nextPageData.imagePrompt === "object"
                ? nextPageData.imagePrompt
                : {}),
              combinedPrompt: resolvedPrompt,
              negativePrompt:
                resolvedNegative ??
                (nextPageData.imagePrompt as any)?.negativePrompt ??
                (nextPageData.imagePrompt as any)?.negative,
            } as any,
            mergedParams,
            nextPageData.styleProfile || {},
            "draft"
          );
        }
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          console.error(
            `Preload fetch error for ${nextId}`,
            err
          );
        }
      }
    });

    return () => {
      controllers.forEach((c) => {
        try {
          c.abort();
        } catch {}
      });
    };
  }, [
    globals?.storySrc,
    pageData?.imageTiming?.preloadNextPages,
    registerAbort,
    derivedStoryId,
    unlockedPlus,        // 🔹 fontos: függjön az unlocked-tól is
    fragments,
    globalFragments,
  ]);

  // animateNext flag after choices appear
  useEffect(() => {
    if (!showChoices) return;
    const id = window.setTimeout(() => setAnimateNext(true), 20);
    registerTimeout(id);
    return () => clearTimeout(id);
  }, [showChoices, registerTimeout]);

  /** --- derived view state --- */

  const hasChoices = Array.isArray(pageData?.choices)
    ? pageData.choices.length > 0
    : false;

  const isEndNode =
  pageData?.type === "end" ||
  (typeof pageData?.id === "string" && pageData.id.startsWith("end_"));

  const resolvedNext = useMemo(() => {
    return (
      resolveNextFromPage(pageData as any, globals) ||
      (typeof pageData?.next === "string" ? pageData.next : null)
    );
  }, [pageData, globals]);

  const mediaMode = pageData?.layout?.mediaMode || "image";
  const isProfileCardPage = mediaMode === "profile-card";


  const canInteractHere =
    !!pageData &&
    pageUnlockedForInteraction === pageData.id &&
    !isEndNode;

const dockChoicesForThisPage = useMemo(() => {
  if (!canInteractHere || !pageData) return [];

  const allChoices: any[] = Array.isArray(pageData.choices)
    ? pageData.choices
    : [];

  if (allChoices.length > 0) {
    const unlockedSet = new Set(unlockedFragments || []);

    const normalized = allChoices.map((c: any, idx: number) => {
      const choiceId = String(c?.id ?? idx);

      const showList: string[] = Array.isArray(c.showIfHasFragment)
        ? c.showIfHasFragment.map((x: any) => String(x))
        : [];
      const hideList: string[] = Array.isArray(c.hideIfHasFragment)
        ? c.hideIfHasFragment.map((x: any) => String(x))
        : [];

      let visible = true;

      // ha van showIfHasFragment, csak akkor látszik, ha legalább 1 fragment megvan
      if (showList.length > 0) {
        visible = showList.some((frag) => unlockedSet.has(frag));
      }

      // ha van hideIfHasFragment, és bármelyik megvan, akkor elrejtjük
      if (visible && hideList.length > 0) {
        const hasHide = hideList.some((frag) => unlockedSet.has(frag));
        if (hasHide) visible = false;
      }

      return {
        raw: c,
        id: choiceId,
        visible,
      };
    });

    const visibleChoices = normalized.filter((it) => it.visible);

    if (visibleChoices.length > 0) {
      return visibleChoices.map((it) => ({
        id: it.id,
        label: String(
          it.raw?.text ??
            it.raw?.label ??
            it.raw?.id ??
            `choice_${it.id}`
        ),
        disabled: !!it.raw?.disabled,
      }));
    }

    // ha minden choice eltűnt a szűrés miatt, de van resolvedNext → mutassunk egy sima "Next"-et
    if (resolvedNext && resolvedNext !== pageData.id) {
      return [
        {
          id: "__NEXT__",
          label: "Next",
          disabled: false,
        },
      ];
    }

    return [];
  }

  if (
    (!Array.isArray(pageData.choices) ||
      pageData.choices.length === 0) &&
    resolvedNext &&
    resolvedNext !== pageData.id
  ) {
    return [
      {
        id: "__NEXT__",
        label: "Next",
        disabled: false,
      },
    ];
  }

  return [];
}, [
  canInteractHere,
  pageData ? pageData.choices : undefined,
  resolvedNext,
  pageData ? pageData.id : undefined,
  unlockedFragments, // 🔹 ÚJ dependency
]);

useEffect(() => {
  if (!derivedStoryId || !derivedSessionId) return;

  const isEnd =
    pageData?.type === "end" ||
    (typeof pageData?.id === "string" && pageData.id.startsWith("end_"));

  if (!isEnd) {
    endTrackedRef.current = false;
    return;
  }

  if (endTrackedRef.current) return;
  endTrackedRef.current = true;

  // itt NEM kell külön trackGameComplete, ha a trackPageEnter már pageType:"end"-et kap
}, [derivedStoryId, derivedSessionId, pageData?.id, pageData?.type]);

  // CTA
  const endCtaContext: CtaContext = useMemo(
    () => ({
      campaignId: derivedStoryId || "unknown_campaign",
      nodeId: pageData?.id || currentPageId || "unknown_node",
      sessionId: derivedSessionId || undefined,
      endId: pageData?.id,
      endAlias: (pageData as any)?.endAlias,
      lang: (globals as any)?.lang ?? undefined,
      abVariant: (globals as any)?.abVariant ?? null,
      path:
        typeof window !== "undefined"
          ? window.location.pathname
          : undefined,
    }),
    [
      derivedStoryId,
      pageData?.id,
      currentPageId,
      derivedSessionId,
      (globals as any)?.lang,
      (globals as any)?.abVariant,
    ]
  );

  const nodeEndMeta = useMemo(() => {
    const em = (pageData as any)?.endMeta;
    if (em) return em;
    const legacy =
      (pageData as any)?.endCta || (pageData as any)?.cta;
    return legacy ? { cta: legacy } : undefined;
  }, [pageData]);

  const campaignCfg: CampaignConfig | undefined = useMemo(() => {
    const g: any = globals || {};

    const metaCandidates = [
      (pageData as any)?.meta,
      g.meta,
      g.campaign?.meta,
      g.story?.meta,
      (g as any).storyMeta,
      g.source?.meta,
      g.storyConfig?.meta,
      g.loadedStory?.meta,
      g.storyData?.meta,
      g.storyJson?.meta,
    ].filter(Boolean) as Array<Record<string, any>>;

    const metaWithPresets = metaCandidates.find(
      (m) => m?.ctaPresets
    );
    const metaFromSources =
      metaWithPresets ?? metaCandidates[0] ?? null;

    if (metaFromSources && !g.meta) {
      try {
        (globals as any).meta = metaFromSources;
      } catch {}
    }

    const presets =
      metaFromSources?.ctaPresets ??
      g.ctaPresets ??
      g.campaignCtaPresets ??
      g.story?.ctaPresets ??
      undefined;

    const endDefaultCta =
      metaFromSources?.endDefaultCta ??
      g.endDefaultCta ??
      g.campaignEndDefaultCta ??
      g.story?.endDefaultCta ??
      undefined;

    const campaignId =
      metaFromSources?.campaignId ??
      g.campaignId ??
      g.story?.campaignId ??
      derivedStoryId ??
      "unknown_campaign";

    if (!campaignId && !presets && !endDefaultCta) return undefined;

    if (!presets) {
      console.warn(
        "[CTA] No ctaPresets found. Using engine default."
      );
    }

    return { campaignId, ctaPresets: presets, endDefaultCta };
  }, [pageData, globals, derivedStoryId]);

  const engineDefaultEndCta = useMemo(
    () => ({ kind: "restart", label: "Play again" } as const),
    []
  );

  const resolvedEndCta = useMemo(
    () =>
      resolveCta(
        nodeEndMeta,
        campaignCfg,
        engineDefaultEndCta,
        endCtaContext
      ),
    [nodeEndMeta, campaignCfg, engineDefaultEndCta, endCtaContext]
  );

  // recall szövegek
  const recallTexts: string[] = useMemo(() => {
    const raw = (pageData as any)?.fragmentRecall;
    const toArr = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const getTxt = (id?: string, fb?: string) => {
      if (!id) return fb || "";
      const tLocal = fragments?.[id]?.text?.trim();
      if (tLocal) return tLocal;
      const tGlobal = (globalFragments as any)?.[id]?.text?.trim();
      if (tGlobal) return tGlobal;
      return fb || "";
    };
    return toArr
      .map((r: any) => getTxt(r?.id, r?.textFallback))
      .filter((s: string) => !!s);
  }, [pageData?.fragmentRecall, fragments, globalFragments]);

  const recallBlocks = useMemo(
    () => recallTexts.flatMap(explodeTextToBlocks),
    [recallTexts]
  );


  const composed = useMemo(
    () =>
      composeBlocks(
        pageData,
        unlockedPlus,
        fragments,
        globalFragments
      ),
    [pageData, unlockedPlus, fragments, globalFragments]
  );

  const blocks = useMemo(
    () => [...recallBlocks, ...composed],
    [recallBlocks, composed]
  );



  // puzzle page flags
  const isRiddlePage = useMemo(
    () => isRiddle(pageData),
    [pageData]
  );
  const isRunesPage = useMemo(() => isRunes(pageData), [pageData]);

  const riddleCorrectLabel = useMemo(() => {
    const fromPage =
      (pageData as any)?.correctLabel ||
      (pageData as any)?.riddle?.correctLabel;
    if (fromPage) return String(fromPage);

    const fromGlobals =
      (globals as any)?.riddleCorrectLabel ||
      (globals as any)?.quiz?.labels?.correct;
    if (fromGlobals) return String(fromGlobals);

    return "Helyes!";
  }, [pageData, globals]);

  // meta/title/logo
  const meta = useMemo(() => {
    return (
      (pageData as any)?.meta ??
      (globals as any)?.meta ??
      (globals as any)?.campaign?.meta ??
      null
    );
  }, [pageData, globals]);

  const titleText = useMemo(() => {
    return (
      meta?.title ??
      (globals as any)?.storyTitle ??
      (pageData as any)?.title ??
      derivedStoryId
    );
  }, [
    meta?.title,
    (globals as any)?.storyTitle,
    (pageData as any)?.title,
    derivedStoryId,
  ]);

  const logoUrl = useMemo(() => {
    const raw =
      (meta?.logo as string | undefined) ??
      ((globals as any)?.logo as string | undefined) ??
      null;
    const url = normalizeAssetUrl(raw);
    if (!url && process.env.NODE_ENV !== "production") {
      console.warn(
        "No logo in meta/globals. Using default_logo.png"
      );
    }
    return url ?? "/assets/default_logo.png";
  }, [meta?.logo, (globals as any)?.logo]);

  // debug logs
  useEffect(() => {
    try {
      console.groupCollapsed("[SETS DIAG]", pageData?.id);
      console.log("fragments", [...unlockedFragments]);
      console.log("flags", [...(flags ?? new Set<string>())]);
      console.log(
        "unlockedPlus",
        [...unlockedPlus]
      );
      console.groupEnd();
    } catch {}
  }, [pageData?.id, unlockedFragments, flags, unlockedPlus]);

  useEffect(() => {
    if (pageData?.id === "ch1_pg4") {
      const textType = Array.isArray(pageData?.text)
        ? "array"
        : typeof pageData?.text;
      const globalKeys = pageData?.fragmentsGlobal
        ? Object.keys(pageData.fragmentsGlobal).slice(0, 20)
        : [];
      const localKeys = fragments
        ? Object.keys(fragments).slice(0, 20)
        : [];
      console.log("[PG4 DEBUG]", {
        textType,
        unlockedFragments,
        blocksLen: blocks.length,
        blocks,
        globalFragKeysTop20: globalKeys,
        localFragKeysTop20: localKeys,
        rawTextArray: Array.isArray(pageData?.text)
          ? pageData.text
          : null,
      });
    }
  }, [
    pageData?.id,
    pageData?.text,
    unlockedFragments,
    fragments,
    blocks,
  ]);

  useEffect(() => {
    if (pageData?.id !== "ch1_pg4") return;
    const hasOrigin = unlockedFragments.includes(
      "tower_origin_fragment_ch1"
    );
    const hasSelf = unlockedFragments.includes(
      "tower_self_fragment_ch1"
    );
    console.log(
      "[PG4 CHECK] hasOrigin:",
      hasOrigin,
      "| hasSelf:",
      hasSelf
    );
    console.log(
      "[PG4 CHECK] unlockedFragments JSON:",
      JSON.stringify(unlockedFragments)
    );
  }, [pageData?.id, unlockedFragments]);

  useEffect(() => {
    if (pageData?.id !== "ch1_pg4") return;
    console.log("[PG4 BLOCKS]", blocks.length, "lines");
    blocks.forEach((b, i) => console.log(`[#${i}]`, b));
  }, [pageData?.id, blocks]);

  // handle "no text => show choices immediately"
  useEffect(() => {
    if (!pageData?.id) return;
    if (pageData.type === "logic") return;

    // 🔹 Puzzle oldalak (riddle + runes): ne blokkoljuk őket a prevWasChoice guarddal
    const isPuzzlePage = isRiddlePage || isRunesPage;

    if (blocks.length === 0) {
      if (prevWasChoiceRef.current && !isPuzzlePage) {
        // normál, szöveg nélküli next-eknél marad a régi viselkedés
        prevWasChoiceRef.current = false;
        return;
      }

      const id = window.setTimeout(() => {
        setSkipAvailable(true);
        setPageUnlockedForInteraction(pageData.id);
        requestAnimationFrame(() => {
          setDockJustAppeared(true);
          setShowChoices(true);
          setChoicePageId(pageData.id);
        });
      }, 200);

      registerTimeout(id);
      return () => clearTimeout(id);
    } else {
      prevWasChoiceRef.current = false;
    }
  }, [
    pageData?.id,
    pageData?.type, 
    blocks.length,
    hasChoices,
    registerTimeout,
    isRiddlePage,
    isRunesPage,
  ]);

  // image gen params
  const stableParams = useMemo(
    () => pageData?.imageParams || {},
    [pageData?.imageParams]
  );
  const stableImageTiming = useMemo(
    () => pageData?.imageTiming || {},
    [pageData?.imageTiming]
  );

    const imgPrompt = useMemo(
  () => normalizeImagePrompt(pageData?.imagePrompt as any),
  [pageData?.imagePrompt]
);

// 🔹 új: a combined prompt feloldása csak unlocked fragmentekre
const resolvedImgPrompt = useMemo(() => {
  const base = imgPrompt?.prompt || "";
  const neg  = imgPrompt?.negative || "";
  const promptResolved  = resolvePromptFragments(base, unlockedPlus, fragments, globalFragments);
  const negativeResolved = resolvePromptFragments(neg,  unlockedPlus, fragments, globalFragments);
  return { ...imgPrompt, prompt: promptResolved, negative: negativeResolved };
}, [imgPrompt, unlockedPlus, fragments, globalFragments]);

  const effectiveImageParams = useMemo(() => {
    const base: any = {
      ...stableParams,
      negativePrompt:
        resolvedImgPrompt.negative ??
        (stableParams as any)?.negativePrompt,
      seed:
        typeof resolvedImgPrompt.seed === "number"
          ? resolvedImgPrompt.seed
          : (stableParams as any)?.seed,
      styleProfile:
        resolvedImgPrompt.styleProfile ??
        (stableParams as any)?.styleProfile,
    };

    // 🔹 profilkártya eset: 1:1-es kép + négyzetes méret
    if (isProfileCardPage) {
      base.aspect_ratio = "1:1";

      if (!base.width && !base.height) {
        base.width = 1024;
        base.height = 1024;
      } else if (base.width && !base.height) {
        base.height = base.width;
      } else if (!base.width && base.height) {
        base.width = base.height;
      }
    }

    return base;
  }, [stableParams, resolvedImgPrompt, isProfileCardPage]);

useEffect(() => {
  console.log("[IMG PROMPT DEBUG]", {
    pageId: pageData?.id,
    rawPrompt: pageData?.imagePrompt,
    normalized: imgPrompt,
    resolved: resolvedImgPrompt,
    unlocked: Array.from(unlockedPlus),
  });
}, [pageData?.id, imgPrompt, resolvedImgPrompt, unlockedPlus]);

const shouldGenerate = useMemo(() => {
  if (!pageData?.imageTiming?.generate) return false;

  // 🔹 Csak akkor generálunk, ha a FRAGMENT-FELDOLGOZOTT prompt nem üres
  const resolved = (resolvedImgPrompt?.prompt || "").trim();
  if (!resolved) return false;

  return true;
}, [pageData?.imageTiming?.generate, resolvedImgPrompt]);

const showFrame = useMemo(() => {
  const timing = pageData?.imageTiming || {};

  // 🔹 Statikus / meglévő kép CSAK akkor számít, ha van konkrét ID / flag
  const hasStaticImage = Boolean(
    (timing as any).staticImage ||
      (timing as any).existingImageId ||
      (timing as any).imageId
  );

  // 🔹 Hero-oldal: csak ch4_pg1 marad, de ott se erőből – kell media
  const isHeroPage = pageData?.id === "ch4_pg1";

  // 🔹 Ha a layout explicit kikapcsolja a médiát, SOHA ne legyen frame
  if (pageData?.layout?.mediaMode === "none") {
    return false;
  }

  // 🔹 Hero-oldal: ugyanaz a feltétel, csak kommentben megjelölve
  if (isHeroPage) {
    return shouldGenerate || hasStaticImage;
  }

  // 🔹 Normál oldalak: csak akkor van keret, ha tényleg van valamilyen media
  return shouldGenerate || hasStaticImage;
}, [
  pageData?.id,
  pageData?.layout?.mediaMode,
  pageData?.imageTiming,
  shouldGenerate,
]);

const mediaNode = useMemo(() => {
  if (!showFrame) return null;
  if (!pageData?.id) return null; // extra védelem

  const pageId = pageData.id;

  if (isProfileCardPage) {
    return (
      <ProfileCardFrame
        pageId={pageId}
        pageIsFadingOut={isFadingOut}
        logoSrc={logoUrl}
      >
        <GeneratedImage_with_fadein
          pageId={pageId}
          prompt={shouldGenerate ? resolvedImgPrompt.prompt : undefined}
          params={effectiveImageParams}
          imageTiming={{
            ...stableImageTiming,
            generate: shouldGenerate,
          }}
          mode={pageData.imageTiming?.mode || "draft"}
          pageIsFadingOut={isFadingOut}
        />
      </ProfileCardFrame>
    );
  }

  return (
    <MediaFrame
      mode="image"
      pageId={pageId}
      pageIsFadingOut={isFadingOut}
      logoSrc={logoUrl}
    >
      <GeneratedImage_with_fadein
        pageId={pageId}
        prompt={shouldGenerate ? resolvedImgPrompt.prompt : undefined}
        params={effectiveImageParams}
        imageTiming={{
          ...stableImageTiming,
          generate: shouldGenerate,
        }}
        mode={pageData.imageTiming?.mode || "draft"}
        pageIsFadingOut={isFadingOut}
      />
    </MediaFrame>
  );
}, [
  showFrame,
  isProfileCardPage,
  pageData?.id,                  // 🔹 itt is optional chain
  isFadingOut,
  logoUrl,
  shouldGenerate,
  resolvedImgPrompt.prompt,
  effectiveImageParams,
  stableImageTiming,
  pageData?.imageTiming?.mode,   // 🔹 és itt is
]);

  // timeout scheduler for sfx hook
  const scheduleTimeout = useCallback(
    (cb: () => void, ms: number) => {
      const id = window.setTimeout(cb, ms);
      registerTimeout(id);
      return id;
    },
    [registerTimeout]
  );

  useSfxScheduler({
    pageId: pageData?.id || "unknown",
    sfx: Array.isArray(pageData?.sfx)
      ? pageData!.sfx
      : undefined,
    t0: narrationT0,
    registerTimeout: scheduleTimeout,
  });

  // dev cache HIT/MISS ticker
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const intervalId = window.setInterval(() => {
      const img =
        typeof getLastImagePerfLog === "function"
          ? getLastImagePerfLog()
          : null;
      const aud =
        typeof getLastAudioPerfLog === "function"
          ? getLastAudioPerfLog()
          : null;
      const imgStr = img
        ? `${img.hit ? "HIT" : "MISS"} ${img.ms}ms`
        : "—";
      const audStr = aud
        ? `${aud.hit ? "HIT" : "MISS"} ${aud.ms}ms`
        : "—";
      setDevText(
        `Cache: Image ${imgStr} | Voice ${audStr}`
      );
    }, 500);
    return () => clearInterval(intervalId);
  }, []);

  /** --- interaction handlers --- */

  const handleRiddleAnswer = useCallback(
    (choiceIdx: number) => {
      const p = pageData as any as PuzzleRiddle;
      const isCorrect = choiceIdx === p.correctIndex;

      const prevRaw = (globals as any)?.score;
      const prevScore =
        typeof prevRaw === "number"
          ? prevRaw
          : Number.parseInt(
              String(prevRaw ?? "0"),
              10
            ) || 0;
      const nextScore = prevScore + (isCorrect ? 1 : 0);

      flushSync(() => {
        setGlobal(
          "__isCorrect",
          isCorrect ? "true" : "false"
        );
        setGlobal("score", String(nextScore));
      });

      const setFlagsAny = p.onAnswer?.setFlags;
      if (Array.isArray(setFlagsAny))
        setFlagsAny.forEach((f) => setFlag(f));
      else if (
        setFlagsAny &&
        typeof setFlagsAny === "object"
      ) {
        Object.entries(setFlagsAny).forEach(
          ([k, v]) => v && setFlag(k)
        );
      }

      const next =
        typeof p.onAnswer?.nextSwitch === "string"
          ? p.onAnswer.nextSwitch
          : resolveNextFromPage(
              {
                next:
                  p.onAnswer?.nextSwitch ?? {
                    switch: "__isCorrect",
                    cases: { true: null, false: null },
                  },
              } as any,
              {
                __isCorrect: isCorrect
                  ? "true"
                  : "false",
                score: String(nextScore),
              }
            );

      if (next && next !== pageData?.id) {
        try {
          localStorage.setItem(
            "currentPageId",
            String(next)
          );
        } catch {}
        goToNextPage(String(next));
      }
    },
    [pageData, globals, setGlobal, setFlag, goToNextPage]
  );

  const normalizeIdList = (v: unknown): string[] => {
    if (Array.isArray(v)) {
      return v
        .flatMap((x) =>
          String(x).split(/[,\s]+/g)
        )
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (typeof v === "string") {
      return v
        .split(/[,\s]+/g)
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return [];
  };

  const handleChoice = useCallback(
    (next: string, reward?: any, choiceObj?: any) => {
      // simple double-click guard
      if (isFadingOut) {
        return;
      }

      try {
        const pageId =
          pageData?.id || currentPageId || "unknown";
        const label =
          choiceObj?.text ??
          choiceObj?.label ??
          choiceObj?.id ??
          "unknown";
        const latencyMs =
          typeof enterTsRef.current === "number"
            ? Date.now() -
              enterTsRef.current
            : undefined;

            const choiceId = String(choiceObj?.id ?? (next ? `to:${next}` : "unknown_choice"));
                 if (derivedStoryId && derivedSessionId && pageId) {
          trackChoice(
            derivedStoryId,
            derivedSessionId,
            pageId,
            choiceId,
            String(label),
            typeof latencyMs === "number" ? latencyMs : undefined,
            {
              runId: derivedRunId || undefined,
              nextPageId: next || undefined,
            }
          );

          if (
            typeof latencyMs === "number" &&
            latencyMs >= 0
          ) {
            trackUiClick(
              derivedStoryId,
              derivedSessionId,
              pageId,
              `choice:${choiceId}`,
              {
                runId: derivedRunId || undefined,
                label: String(label),
                latencyMs,
                nextPageId: next || undefined,
              }
            );
          }
        }
      } catch {}

      // reward.setGlobal
      if (
        reward?.setGlobal &&
        typeof reward.setGlobal === "object"
      ) {
        flushSync(() => {
          Object.entries(
            reward.setGlobal
          ).forEach(([k, v]) => {
            setGlobal(k, String(v));
          });
        });
      }

      // reward unlocks
      let unlocks: string[] = [];
      if (Array.isArray(reward?.unlocks)) {
        unlocks = reward.unlocks.filter(Boolean);
      } else if (
        typeof reward?.unlocks === "string"
      ) {
        unlocks = [reward.unlocks];
      }

      const rewardLocks = normalizeIdList(
        reward?.locks
      );

      // reward.unlockFragments
      let rewardExtra: string[] = [];
      if (
        Array.isArray(reward?.unlockFragments)
      ) {
        rewardExtra =
          reward.unlockFragments.filter(Boolean);
      }

      // saveFragment(s)
      const toSave: string[] = [];
      if (typeof reward?.saveFragment === "string")
        toSave.push(reward.saveFragment);
      if (Array.isArray(reward?.saveFragments))
        toSave.push(...reward.saveFragments);

      const savedAndFound: string[] = [];
      if (toSave.length) {
        toSave.forEach((id) => {
          const src =
            (globalFragments as any)?.[id] ||
            (pageData as any)
              ?.fragmentsGlobal?.[id] ||
            (pageData as any)?.fragments?.[id] ||
            (fragments as any)?.[id];
          if (
            src &&
            (src.text || src.replayImageId)
          ) {
            addFragment(id, {
              text: src.text,
              replayImageId: src.replayImageId,
            });
            savedAndFound.push(id);
          }
        });
      }

      const autoUnlockSaved = false;
      if (autoUnlockSaved && savedAndFound.length) {
        rewardExtra = [
          ...rewardExtra,
          ...savedAndFound.filter(
            (id) => !isFlagId(id)
          ),
        ];
      }

      // choice.actions
      let actionExtra: string[] = [];
      let actionFlags: string[] = [...rewardLocks];
      if (Array.isArray(choiceObj?.actions)) {
        choiceObj.actions.forEach((a: any) => {
          if (a?.unlockFragment)
            actionExtra.push(a.unlockFragment);
          if (
            a?.type === "unlockFragment" &&
            a?.id
          )
            actionExtra.push(a.id);

          if (
            a?.type === "setFlag" &&
            a?.id
          )
            actionFlags.push(a.id);
          if (
            a?.type === "unlockRune" &&
            a?.id
          )
            actionFlags.push(a.id);
        });
      }

      // choice.fragmentId
      const choiceFragId: string | undefined =
        choiceObj?.fragmentId;
      let choiceExtra: string[] = [];
      if (choiceFragId) {
        choiceExtra = [choiceFragId];
      }

      // merge fragment unlocks
      const toUnlockFragments = Array.from(
        new Set([
          ...unlocks,
          ...rewardExtra,
          ...actionExtra,
          ...choiceExtra,
        ])
      ).filter((id) => !isFlagId(id));

      if (toUnlockFragments.length > 0) {
        flushSync(() => {
          const merged = Array.from(
            new Set([
              ...unlockedFragments,
              ...toUnlockFragments,
            ])
          );
          setUnlockedFragments(merged);

          // add unlocked frags to bank
          toUnlockFragments.forEach((id) => {
            const src =
              (globalFragments as any)?.[id] ||
              (pageData as any)
                ?.fragmentsGlobal?.[id] ||
              (pageData as any)?.fragments?.[id] ||
              (fragments as any)?.[id];
            if (
              src &&
              (src.text || src.replayImageId)
            ) {
              addFragment(id, {
                text: src.text,
                replayImageId: src.replayImageId,
              });
            }
          });

         /* setShowReward(true); */
        });

       /* const tid = window.setTimeout(
          () => setShowReward(false),
          2000
        );
        registerTimeout(tid); */
      }

      // flags incl rune_*
      if (actionFlags.length > 0) {
        const uniqueFlags = Array.from(
          new Set(actionFlags)
        );

        const prevRunes = new Set(
          Array.from(
            flags ?? new Set<string>()
          ).filter(isRuneId)
        );
        const newRunes = uniqueFlags.filter(
          (f) => isRuneId(f) && !prevRunes.has(f)
        );

        flushSync(() => {
          uniqueFlags.forEach((f) => setFlag(f));
        });

        // rune tracking
        if (newRunes.length) {
          try {
            const pageId =
              pageData?.id ||
              currentPageId ||
              "unknown";
            if (
              derivedStoryId &&
              derivedSessionId &&
              pageId
            ) {
              newRunes.forEach((rid) => {
                if (!rid) return;
                trackRuneUnlock(
                  derivedStoryId,
                  derivedSessionId,
                  pageId,
                  rid,
                  {
                    source: "choice",
                    mode: "inline-nooverlay",
                    hasCustomImage: !!(
                      reward?.runeImageUrl ||
                      choiceObj?.runeImageUrl
                    ),
                  }
                );
              });
            }
          } catch {}
        }
      }

      prevWasChoiceRef.current = true;

      // page transition
      if (next && next !== pageData?.id) {
        // lock layout first
        lockHeightsForTransition();

        setIsFadingOut(true);

        const FADE_MS = 600;
        const SCROLL_MS = FADE_MS * 2;

        let fadeDone = false;
        let scrollDone = false;

        const tryProceed = () => {
          if (!(fadeDone && scrollDone)) return;

          const nx = next;
          if (!nx || nx === pageData?.id) return;

          try {
            localStorage.setItem(
              "currentPageId",
              nx
            );
          } catch {}

          flushSync(() => {
            setShowChoices(false);
            setChoicePageId(null);
            setPageUnlockedForInteraction(null);
            setSkipRequested(false);
          });

          goToNextPage(nx);

          requestAnimationFrame(() => {
            unlockHeightsAfterTransition();

            flushSync(() => {
              setIsFadingOut(false);
              setDockJustAppeared(false);
            });
          });
        };

     // fade timer
window.setTimeout(() => {
  fadeDone = true;

  // 🔹 Amint a kifelé animáció LEFUTOTT, szedd ki a narrációt a DOM-ból
  flushSync(() => {
    setHideNarration(true);
  });

  tryProceed();
}, FADE_MS);

        // scroll anim
        const el = scrollContainerRef.current;
        if (el) {
          requestAnimationFrame(() => {
            const startTop = el.scrollTop;
            const startTime = performance.now();

            const step = (now: number) => {
              const t = Math.min(
                1,
                (now - startTime) / SCROLL_MS
              );
              const eased =
                1 - (1 - t) * (1 - t);
              el.scrollTop =
                startTop * (1 - eased);

              if (t < 1) {
                requestAnimationFrame(step);
              } else {
                scrollDone = true;
                tryProceed();
              }
            };

            requestAnimationFrame(step);
          });
        } else {
          scrollDone = true;
          tryProceed();
        }
      }
    },
    [
      isFadingOut,
      unlockedFragments,
      setUnlockedFragments,
      pageData?.id,
      goToNextPage,
      registerTimeout,
      addFragment,
      globalFragments,
      setFlag,
      flags,
      derivedStoryId,
      derivedSessionId,
      currentPageId,
      globals,
      setGlobal,
      fragments,
      lockHeightsForTransition,
      unlockHeightsAfterTransition,
    ]
  );

  /** --- audio derived props --- */

  const toLinearFromDb = (db?: number) =>
    typeof db === "number"
      ? Math.pow(10, db / 20)
      : undefined;

  const narrationPlaylistMemo = useMemo(() => {
    const raw = Array.isArray(
      pageData?.audio?.playlist
    )
      ? pageData.audio.playlist
      : [];
    const passes = (it: any) => {
      const cond =
        it?.when?.unlocked ??
        it?.unlocked ??
        it?.ifUnlocked;
      if (!cond) return true;
      if (Array.isArray(cond))
        return cond.every((c: any) =>
          unlockedPlus.has(String(c))
        );
      return unlockedPlus.has(String(cond));
    };
    const pickSrc = (it: any) =>
      it?.src ?? it?.path ?? it?.narration ?? it?.file;

    return raw
      .filter(passes)
      .map((it: any) => ({
        src: pickSrc(it),
        gapAfterMs:
          typeof it?.gapAfterMs === "number"
            ? it.gapAfterMs
            : typeof it?.gapMs === "number"
            ? it.gapMs
            : 0,
        label: it?.label,
      }))
      .filter((it: any) => !!it.src);
  }, [pageData?.audio?.playlist, unlockedPlus]);

  const playModeMemo = useMemo<"single" | "playlist">(() => {
    const pm = pageData?.audio?.playMode;
    if (
      pm === "playlist" &&
      narrationPlaylistMemo.length > 0
    )
        return "playlist";
    return "single";
  }, [
    pageData?.audio?.playMode,
    narrationPlaylistMemo.length,
  ]);

  const duckingMemo = useMemo(() => {
    const d = pageData?.audio?.ducking || {};
    const duckTo =
      typeof d.duckTo === "number"
        ? Math.min(1, Math.max(0, d.duckTo))
        : toLinearFromDb(d.db);
    const attackMs = d.attackMs ?? d.fadeMs;
    const releaseMs = d.releaseMs ?? d.fadeMs;
    return { duckTo, attackMs, releaseMs };
  }, [pageData?.audio?.ducking]);

  // replay vizuál
  const selectedReplay = useMemo(
    () =>
      pickReplayVisual(
        pageData,
        unlockedFragments,
        fragments
      ),
    [pageData, unlockedFragments, fragments]
  );

  // rune dock
  const unlockedRunes = useMemo(
    () =>
      Array.from(flags ?? new Set<string>()).filter(isRuneId),
    [flags]
  );

  // Rune dock csak akkor jelenjen meg, ha
  // - van legalább egy aktuálisan feloldott rúna, ÉS
  // - az adott kampányhoz tartozik runePack konfiguráció (runePackForDisplay)
  const showRuneDock = useMemo(
    () =>
      !!runePackForDisplay &&
      (unlockedRunes?.length ?? 0) > 0,
    [runePackForDisplay, unlockedRunes]
  );

  // prefetch sound toggle icons
  useEffect(() => {
    const on = new Image();
    const off = new Image();
    on.src =
      "/icons/rune_sound_on_128_transparent.png";
    off.src =
      "/icons/rune_sound_off_128_transparent.png";
  }, []);

  // anchorPortal
  const anchorPortal = useMemo(
    () => measure?.content ?? null,
    [measure]
  );
  useEffect(() => {
    anchorPortalRef.current =
      measure?.content ?? null;
  }, [measure]);

  if (!globals?.storySrc) {
    return (
      <div className={style.storyPage}>
        <DecorBackground />
        <div
          style={{
            position: "relative",
            zIndex: 5,
            padding: "8vh 4vw",
            color: "#fff",
          }}
        >
          <h2>No story loaded</h2>
          <p>
            Go back to the landing page and
            choose a campaign.
          </p>
          <button
            onClick={() =>
              (window.location.href = "/")
            }
          >
            Back to landing
          </button>
        </div>
      </div>
    );
  }

  if (!pageData || !pageData.id) {
    console.warn("[StoryPage] Missing pageData", {
      currentPageId,
      hasPageData: !!pageData,
      globalError,
    });
    return (
      <div
        className={style.storyPage}
        data-testid="fallback"
      >
        <LoadingOverlay />
      </div>
    );
  }

  console.groupCollapsed(
    `[StoryPage] Render ${pageData.id}`
  );
  console.log({
    isLoading,
    isMuted,
    hasChoices,
    blocksLen: blocks.length,
  });
  console.groupEnd();

  const _mustBeFn = (n: string, v: any) => {
    const t = typeof v;
    if (t !== "function") {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          `[WARN] ${n} is not a function (got: ${t}). Rendering continues.`,
          v
        );
      }
    }
  };
  _mustBeFn("BrickBottomOverlay", BrickBottomOverlay);
  _mustBeFn("RuneDockDisplay", RuneDockDisplay);
  _mustBeFn("NineSlicePanel", NineSlicePanel);
  _mustBeFn(
    "GeneratedImage_with_fadein",
    GeneratedImage_with_fadein
  );
  _mustBeFn("AudioPlayer", AudioPlayer);
  _mustBeFn("TransitionVideo", TransitionVideo);
  _mustBeFn("FeedbackOverlay", FeedbackOverlay);
  _mustBeFn("RestartButton", RestartButton);
  _mustBeFn(
    "FragmentReplayOverlay",
    FragmentReplayOverlay
  );
  _mustBeFn("SmokeField", SmokeField);

  // transition/video page
  if (isTransitionVideoPage(pageData)) {
    const t = pageData.transition;
    return (
      <div className={style.storyPage}>
         <AdminQuickPanel />
        {analyticsSync}

        <DecorBackground />
        {showAnalytics && (
          <AnalyticsReport
            storyId={derivedStoryId}
          />
        )}

        <div
          style={{
            position: "relative",
            zIndex: 5,
            display: "flex",
            justifyContent: "center",
            padding: "6vh 2vw",
          }}
        >
          <TransitionVideo
            pageId={pageData.id}
            src={t.src}
            srcWebm={t.srcWebm}
            poster={t.poster}
            autoplay={
              t.autoplay ?? true
            }
            muted={t.muted ?? true}
            loop={t.loop ?? false}
            fadeInMs={t.fadeInMs ?? 300}
            fadeOutMs={
              t.fadeOutMs ?? 300
            }
            skipAfterMs={
              t.skipAfterMs ?? 1200
            }
            nextPageId={t.nextPageId}
            duckToVol={
              t.duckToVol ?? 0.2
            }
            attackMs={
              t.attackMs ?? 240
            }
            releaseMs={
              t.releaseMs ?? 600
            }
            preloadNext={
              t.preloadNext ?? true
            }
          />
        </div>
      </div>
    );
  }

  // legacy tower_reveal_video
  if (pageData.id === "tower_reveal_video") {
    const nextAfter =
      resolveNextFromPage(
        pageData as any,
        globals
      ) ||
      ((pageData as any)
        ?.next as string) ||
      "ch4_pg1";
    return (
      <div className={style.storyPage}>
        <AdminQuickPanel />
        {analyticsSync}
        <div
          className={style.storyBackground}
        >
          <DecorBackground preset="subtle" />
        </div>

      
        {showAnalytics && (
          <AnalyticsReport
            storyId={derivedStoryId}
          />
        )}

        <div
          style={{
            position: "relative",
            zIndex: 5,
            display: "flex",
            justifyContent: "center",
            padding: "6vh 2vw",
          }}
        >
          <TransitionVideo
            pageId={pageData.id}
            src="/assets/video/tower_reveal.mp4"
            poster="/assets/video/tower_reveal_poster.png"
            autoplay
            muted
            loop={false}
            fadeInMs={300}
            fadeOutMs={300}
            skipAfterMs={999999}
            nextPageId={nextAfter}
            duckToVol={0.2}
            attackMs={240}
            releaseMs={600}
            preloadNext
          />
        </div>
      </div>
    );
  }



  // normal page
  return (
    <div
      ref={pageRootRef}
      className={style.storyPage}
      data-skin={skin}
    >
      <AdminQuickPanel />
      {analyticsSync}
      {showAnalytics && (
        <AnalyticsReport
          storyId={derivedStoryId}
        />
      )}

      {isLoading && <LoadingOverlay />}

      <Canvas
        background={
          <DecorBackground preset="subtle" />
        }
        /* szélesebb tartalmi sáv a runtime-ban */
        style={{
          // narrációs panel max szélesség
          ["--np-maxw" as any]: "1400px",
          // MediaFrame max szélesség (szinkron a narrációval)
          ["--mf-max-w" as any]: "1400px",
          // InteractionDock wrapper max szélesség
          ["--wrapper-maxw" as any]: "1400px",
        }}
        topbar={
          <>
            <HeaderBar
              data-skin={skin}
              variant="transparent"
              elevated
              left={
                <img
                  src={logoUrl}
                  alt={meta?.title || titleText || "Logo"}
                  data-logo
                />
              }
              center={
                <span data-header-title>
                  {titleText}
                </span>
              }
              right={
                showRuneDock ? (
                  <div
                    className={
                      canvasStyles.showOnlyDesktop
                    }
                  >
                    <RuneDockDisplay
                      flagIds={unlockedRunes}
                      imagesByFlag={
                        imagesByFlag
                      }
                      runePack={
                        runePackForDisplay
                      }
                      delayMs={0}
                    />
                  </div>
                ) : null
              }
            />

            {showRuneDock && (
              <div
                className={`${canvasStyles.runeDockTopRight} ${canvasStyles.showOnlyMobile} ${
                  showRuneDock
                    ? canvasStyles.isVisible
                    : ""
                }`}
              >
                <RuneDockDisplay
                  flagIds={unlockedRunes}
                  imagesByFlag={
                    imagesByFlag
                  }
                  runePack={
                    runePackForDisplay
                  }
                  delayMs={0}
                />
              </div>
            )}
          </>
        }
        progress={
          <ProgressStrip
            value={progressDisplay.value ?? 0}
            milestones={progressDisplay.milestones}
          />
        }
                media={mediaNode}


       narr={
  !hideNarration && (                       // 🔹 ha már kifade-elt, ne is legyen DOM-ban
    <div
      ref={narrFreezeRef}
      className={`${style["textbox-container"]} ${
        expanded ? style.expanded : ""
      }`}
      role="region"
      aria-label="Narration box"
    >
      <NarrativePanel
        key={pageData.id}                  // ha még nincs bent, érdemes meghagyni
        lines={blocks}
        skipRequested={skipRequested}
        replayTrigger={replayKey}
        delayMs={DELAY_MS}
        onReady={() => setSkipAvailable(true)}
        onComplete={() => {
          setTypingDone(true);
          setPageUnlockedForInteraction(pageData.id);

          requestAnimationFrame(() => {
            setDockJustAppeared(true);
            setShowChoices(true);
            setChoicePageId(pageData.id);
          });
        }}
        onMeasure={(m: Measure) => {
          setMeasure(m);
        }}
        typingDone={typingDone}
        lockedMeasure={lockedMeasure}
        setLockedMeasure={(m: Measure) => setLockedMeasure(m)}
        firstLockTimerRef={firstLockTimer}
        pageId={pageData.id}
        title={(pageData as any)?.title}
        exiting={isFadingOut}              // ha már bekötötted, maradjon
        exitMs={600}
        backdrop={
          anchorPortal ? (
            <>
              <BrickBottomOverlay
                usePortal
                anchor={anchorPortal as any}
                position="bottom"
              />
              <BrickBottomOverlay
                usePortal
                anchor={anchorPortal as any}
                src="/ui/brick.png"
                position="top"
              />
            </>
          ) : null
        }
      />
    </div>
  )
}

        dock={
          showChoices &&
          choicePageId ===
            pageData.id &&
          pageUnlockedForInteraction ===
            pageData.id ? (
            <div
              ref={dockFreezeRef}
              className={[
                dockStyles.fadeWrapper,
                dockJustAppeared
                  ? dockStyles.appearing
                  : "",
                isFadingOut
                  ? dockStyles.fadingOut
                  : "",
              ].join(" ")}
            >
              {isEndNode ? (
                resolvedEndCta ? (
                  <div
                    className={
                      dockStyles.grid
                    }
                  >
                    <div
                      className={
                        style.endCtaCard
                      }
                    >
                      <div
                        className={
                          style.endCtaTitle
                        }
                      >
                        Köszönjük,
                        végigjátszottad
                        a kampányt!
                      </div>
                      <div
                        className={
                          style.endCtaActions
                        }
                      >
                        <CampaignCta
                          cta={
                            resolvedEndCta
                          }
                          context={
                            endCtaContext
                          }
                        />
                      </div>
                    </div>
                  </div>
                ) : null
              ) : (
                <>
                  {isRiddlePage && (() => {
                    const r =
                      pageData as unknown as PuzzleRiddle;
                    return (
                      <div
                        className={
                          dockStyles.grid
                        }
                      >
                        <RiddleQuiz
                          page={pageData}
                          question={
                            r.question
                          }
                          options={
                            r.options
                          }
                          correctIndex={
                            r.correctIndex
                          }
                          correctLabel={
                            riddleCorrectLabel
                          }
                          showCorrectLabel="above"
                          onPlaySfx={() => {
                            // opcionális SFX trigger
                          }}
                          onResult={(result) => {
                            const pageId = pageData?.id;
                            const puzzleId = (r as any)?.id ?? pageId ?? "riddle";
                            if (derivedStoryId && derivedSessionId && pageId) {
                              try {
                                trackPuzzleTry(
                                  derivedStoryId,
                                  derivedSessionId,
                                  pageId,
                                  puzzleId,
                                  1,
                                  { kind: "riddle" }
                                );
                                trackPuzzleResult(
                                  derivedStoryId,
                                  derivedSessionId,
                                  pageId,
                                  puzzleId,
                                  result.correct,
                                  1,
                                  result.elapsedMs ?? 0,
                                  { kind: "riddle" }
                                );
                              } catch (_) {}
                            }
                            handleRiddleAnswer(result.choiceIdx);
                          }}
                        />
                      </div>
                    );
                  })()}

                  {!isRiddlePage &&
  isRunesPage &&
  (() => {
    const p = pageData as any as PuzzleRunesPage;
    const answer = Array.isArray(p.answer) ? p.answer : [];

    return (
      <PuzzleRunes
        options={p.options}
        answer={answer}                         // opcionális, open módban üres lehet
        maxAttempts={p.maxAttempts ?? 3}
        maxPick={p.maxPick}                    // L2_care_puzzle: 2
        mode={p.mode ?? "ordered"}
        feedback={p.feedback ?? "reset"}
        className={dockStyles.grid}
        buttonClassName={dockStyles.choice}
        storyId={derivedStoryId || "default_story"}
        sessionId={derivedSessionId || "sess_unknown"}
        pageId={pageData.id}
        puzzleId={(p as any).id ?? `runes-${pageData.id}`}
        onResult={(ok, pickedIds) => {
          // 🔹 OPEN mód (nincs answer): választásokból flag-ek generálása
          const isOpenPuzzle = !answer.length;

          if (
            isOpenPuzzle &&
            typeof p.optionFlagsBase === "string" &&
            Array.isArray(p.options)
          ) {
            pickedIds.forEach((label) => {
              const idx = p.options.indexOf(label);
              if (idx >= 0) {
                const flagId = `${p.optionFlagsBase}${idx + 1}`;
                setFlag(flagId);
              }
            });
          }

          const branch = ok ? p.onSuccess : p.onFail;
          if (!branch) return;

          const fl = branch.setFlags;
          if (Array.isArray(fl)) {
            fl.forEach((f) => setFlag(f));
          } else if (fl && typeof fl === "object") {
            Object.entries(fl).forEach(([k, v]) => {
              if (v) setFlag(k);
            });
          }

          const nx = branch.goto;
          if (nx && nx !== pageData?.id) {
            try {
              localStorage.setItem("currentPageId", nx);
            } catch {}
            goToNextPage(nx);
          }
        }}
      />
    );
  })()}

                  {!isRiddlePage &&
                    !isRunesPage &&
                    dockChoicesForThisPage.length >
                      0 && (
                      <InteractionDock
                        mode="default"
                        choices={
                          dockChoicesForThisPage
                        }
                        onSelect={(
                          choiceId: string
                        ) => {
                          const realChoice =
                            Array.isArray(
                              pageData.choices
                            )
                              ? (
                                  pageData.choices as any[]
                                ).find(
                                  (
                                    c: any,
                                    i: number
                                  ) =>
                                    String(
                                      c?.id ??
                                        i
                                    ) ===
                                    String(
                                      choiceId
                                    )
                                )
                              : null;

                          if (realChoice) {
                            handleChoice(
                              String(
                                realChoice.next ??
                                  ""
                              ),
                              (realChoice as any)
                                .reward,
                              realChoice as any
                            );
                            return;
                          }

                          if (
                            choiceId ===
                              "__NEXT__" &&
                            resolvedNext &&
                            resolvedNext !==
                              pageData.id
                          ) {
                            handleChoice(
                              String(
                                resolvedNext
                              ),
                              undefined,
                              {
                                id: "__NEXT__",
                                text: "Next",
                                next: String(
                                  resolvedNext
                                ),
                              } as any
                            );
                          }
                        }}
                      />
                    )}
                </>
              )}
            </div>
          ) : null
        }

        action={
          <ActionBar
            canSkip={
              skipAvailable &&
              !isEndNode
            }
            onSkip={() => {
              setSkipRequested(
                true
              );
              setPageUnlockedForInteraction(
                pageData.id
              );
              setTimeout(
                () =>
                  setSkipRequested(
                    false
                  ),
                0
              );
            }}
            canReplay={!isEndNode}
            onReplay={() => {
              setSkipRequested(
                false
              );
              setReplayKey(
                (prev) =>
                  prev + 1
              );
              triggerAudioRestart();
            }}
            muted={!!isMuted}
            onToggleMute={() => {
              const newMuted = !isMuted;
              setIsMuted(
                newMuted
              );
              try {
                setSfxMuted(
                  newMuted
                );
              } catch {}
            }}
          />
        }
      />

      {/* audio + overlayk */}
      <AudioPlayer
        pageId={pageData.id}
        autoPlay
        audioPath={
          pageData.audio
            ?.background
        }
        narrationPath={
          pageData.audio
            ?.mainNarration
        }
        voicePrompt={
          pageData.voicePrompt ??
          undefined
        }
        playMode={
          playModeMemo
        }
        narrationPlaylist={
          narrationPlaylistMemo
        }
        ducking={
          duckingMemo
        }
        delayMs={
          DELAY_MS
        }
        fadeInMs={
          FADE_IN_MS
        }
        volume={1}
        bgmVolume={
          0.6
        }
        onNarrationStart={(
          t0: number
        ) =>
          setNarrationT0(
            t0
          )
        }
      />
{/* 
      {showReward && (
        <RewardOverlay
          message="Memory unlocked!"
          onComplete={() =>
            setShowReward(
              false
            )
          } 
        />
      )}
        */}

      {showReplay &&
        selectedReplay.imageId && (
          <FragmentReplayOverlay
            imageSrc={`/assets/generated/${selectedReplay.imageId}.png`}
            durationMs={
              selectedReplay.durationMs
            }
            onComplete={() =>
              setShowReplay(
                false
              )
            }
          />
        )}


    </div>
  );
};

function isFlagId(id: string) {
  return /^block_|^flag_|^rune_/.test(id);
}

export default StoryPage;
