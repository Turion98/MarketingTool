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
import { usePathname, useSearchParams } from "next/navigation";

import style from "./StoryPage.module.scss";
import {
  composeBlocks,
  explodeTextToBlocks,
  resolvePromptFragments,
} from "./storyPageText";
import {
  buildDockChoices,
} from "./storyPageChoices";
import { buildChoiceMutationPlan } from "./storyPageChoiceMutations";
import { runChoiceTransition } from "./storyPageChoiceTransition";
import { StoryPageDock } from "./StoryPageDock";
import type {
  FragmentBank,
  FragmentData,
  PuzzleRiddle,
  PuzzleRunesPage,
  StoryPageData,
  StoryPageGlobals,
  TransitionVideoData,
} from "./storyPageTypes";
import { useStoryPageBootstrap } from "./useStoryPageBootstrap";
import { useStoryPageAnalytics } from "./useStoryPageAnalytics";
import { useStoryPageEndState } from "./useStoryPageEndState";
import { useStoryPageMediaAudio } from "./useStoryPageMediaAudio";
import { useStoryPagePreloads } from "./useStoryPagePreloads";
import { useEmbedParentResize } from "./useEmbedParentResize";
import EmbedGhostDocumentBg from "../embed/EmbedGhostDocumentBg";
import canvasStyles from "../layout/Canvas/Canvas.module.scss";

import LoadingOverlay from "../LoadingOverlay/LoadingOverlay";
import AudioPlayer from "../AudioPlayer";
import RewardOverlay from "../labs/RewardOverlay/RewardOverlay";
import FragmentReplayOverlay from "../labs/FragmentReplayOverlay/FragmentReplayOverlay";
import RestartButton from "../RestartButton/RestartButton";
import TransitionVideo from "../TransitionVideo/TransitionVideo";
import FeedbackOverlay from "../FeedbackOverlay/FeedbackOverlay";
import NineSlicePanel from "../NineSlicePanel/NineSlicePanel";
import DecorBackground from "../layout/DecorBackground/DecorBackground";
import ProgressStrip from "../layout/ProgressStrip/ProgressStrip";
import NarrativePanel from "../layout/NarrativePanel/NarrativePanel";
import AnalyticsReport from "../AnalyticsReport/AnalyticsReport";
import AnalyticsSync from "../AnalyticsSync/AnalyticsSync";
import ActionBar from "../layout/ActionBar/ActionBar";
import Canvas from "../layout/Canvas/Canvas";
import HeaderBar from "../layout/HeaderBar/HeaderBar";

import {
  useGameState,
  resolveNextFromPage, normalizeImagePrompt
} from "../../lib/GameStateContext";
import type { GameStateContextType } from "../../lib/gameStateTypes";

import { getLastAudioPerfLog } from "../../lib/audioCache";
import { useSfxScheduler } from "../../lib/useSfxScheduler";
import { setSfxMuted, stopAllSfx } from "../../lib/sfxBus";
import { getLastImagePerfLog } from "../../lib/useImageCache";
import { clearImageCache } from "../../lib/clearImageCache";
import { clearVoiceCache } from "../../lib/clearVoiceCache";

import {
  trackChoice,
  trackRuneUnlock,
  trackUiClick,
  startNewRunSession ,
} from "../../lib/analytics";


import { runSecuritySmokeTest } from "@/app/lib/security/securitySmokeTest";
import { loadTokens } from "@/app/lib/tokenLoader";

import AdminQuickPanel from "../AdminQuickPanel/AdminQuickPanel";




const DEBUG_RUNES = true;
// Globális narrációs / gépelési indulási késleltetés (ms).
// 3000ms helyett alacsonyabb érték, hogy hamarabb induljon a szöveg + hang.
const DELAY_MS = 0;

/** Vége CTA takeover: narráció után, külön a narráció DELAY_MS-től (0 narrációnál is várhat). */
const END_CTA_REVEAL_DELAY_MS = 2800;
const FADE_IN_MS = 600;
const API_BASE = (
  process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000"
).replace(/\/+$/, "");

function isRuneFlagId(id: string): boolean {
  return id.startsWith("rune_");
}

type StoryPageContext = Omit<
  GameStateContextType,
  "currentPageData" | "globals" | "setGlobal"
> & {
  currentPageData?: StoryPageData | null;
  currentPageId?: string;
  globalError?: string | null;
  globals: StoryPageGlobals;
  setGlobal: (key: string, value: unknown) => void;
};

function isTransitionVideoPage(p: unknown): p is TransitionVideoData {
  return !!p && typeof p === "object" && (p as TransitionVideoData).type === "transition" && (p as TransitionVideoData).transition?.kind === "video";
}

const isRiddle = (p: unknown): p is PuzzleRiddle =>
  !!p && typeof p === "object" && (p as PuzzleRiddle).type === "puzzle" && (p as PuzzleRiddle).kind === "riddle";

const isRunes = (p: unknown): p is PuzzleRunesPage =>
  !!p && typeof p === "object" && (p as PuzzleRunesPage).type === "puzzle" && (p as PuzzleRunesPage).kind === "runes";

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

type StoryLogicRule = {
  if?: string[];
  goto?: string;
  default?: string;
};

type StoryChoiceAction = {
  id?: unknown;
  unlockRune?: unknown;
  setFlag?: unknown;
};

type StoryChoiceRecord = {
  id?: unknown;
  text?: unknown;
  label?: unknown;
  reward?: {
    locks?: string[] | string;
  };
  actions?: StoryChoiceAction[];
};

type StoryPageStyleVars = React.CSSProperties & {
  "--np-maxw"?: string;
  "--mf-max-w"?: string;
  "--wrapper-maxw"?: string;
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
    isEditorDraftPreview,
    progressDisplay,
    storyId,
    sessionId,
    runId,
    visitedPages,
  } = useGameState() as StoryPageContext;

  /** --- URL params / analytics --- */
  const params = useSearchParams();
  const pathname = usePathname();
  const isEmbedPath = (pathname ?? "").startsWith("/embed/");
  const isGhostEmbed = isEmbedPath && params.get("ghost") === "1";

const skin = useMemo(() => {
  return globals?.skin || params.get("skin") || "legacy-default";
}, [globals?.skin, params]);

  useEffect(() => {
    if (!skin || skin === "legacy-default") return;
    loadTokens(`/skins/${skin}.json`).catch(() => {});
  }, [skin]);

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
const stringGlobals = useMemo<Record<string, string>>(
  () =>
    Object.fromEntries(
      Object.entries(globals ?? {}).map(([key, value]) => [key, String(value ?? "")])
    ),
  [globals]
);

  useStoryPageBootstrap({
    params,
    goToNextPage,
    setGlobal,
    setStorySrc,
  });

  useEmbedParentResize(
    pageRootRef,
    isEmbedPath,
    `${isLoading}:${currentPageId ?? ""}:${globals?.storySrc ?? ""}`
  );

  useStoryPageAnalytics({
    derivedStoryId,
    derivedSessionId,
    derivedRunId,
    currentPageId,
    pageData,
    lastPageRef,
    enterTsRef,
    globals,
  });

 const analyticsSync =
  derivedStoryId && derivedSessionId ? (
    <AnalyticsSync storyId={derivedStoryId} sessionId={derivedSessionId} intervalMs={30000} />
  ) : null;

  // 🔹 ITT LEGYEN
  const unlockedPlus = useMemo(
    () =>
      new Set<string>([
        ...unlockedFragments,
        ...Array.from(flags ?? new Set<string>()),
      ]),
    [unlockedFragments, flags]
  );

  useStoryPagePreloads({
    apiBase: API_BASE,
    storySrc:
      typeof globals?.storySrc === "string" ? globals.storySrc : undefined,
    derivedStoryId,
    sidePreloadPages: pageData?.audio?.sidePreloadPages,
    preloadNextPages: pageData?.imageTiming?.preloadNextPages,
    registerAbort,
    normalizeSfxUrl,
    unlockedPlus,
    fragments,
    globalFragments,
  });

  const {
    endCtaContext,
    resolvedEndCta,
    meta,
    titleText,
    logoUrl,
  } = useStoryPageEndState({
    derivedStoryId,
    derivedSessionId,
    currentPageId,
    pageData,
    globals,
    endTrackedRef,
  });

  // 🔹 LOGIC típusú oldalak automatikus futtatása (L3_route_switch, Route_E_result_logic, stb.)
  useEffect(() => {
    if (isEditorDraftPreview) return;
    if (!pageData || pageData.type !== "logic") return;

    const rules: StoryLogicRule[] = Array.isArray(pageData.logic)
      ? (pageData.logic as StoryLogicRule[])
      : [];
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
      const fallback = rules.find((r) => typeof r?.default === "string");
      return fallback ? String(fallback.default) : null;
    })();

    if (chosen && chosen !== pageData.id) {
      try {
        localStorage.setItem("currentPageId", chosen);
      } catch {}
      goToNextPage(chosen);
    }
  }, [pageData, unlockedPlus, goToNextPage, isEditorDraftPreview]);

  /** --- setup effects --- */

  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      (window as Window & { runSecSmoke?: () => unknown }).runSecSmoke = () => {
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

  // unlockRunes on page enter
  useEffect(() => {
    if (!pageData?.id) return;
    if (processedRunesForPage.current === pageData.id) return;
    processedRunesForPage.current = pageData.id;

    const runeIds = Array.isArray(pageData?.unlockRunes)
      ? pageData.unlockRunes
      : [];
    if (!runeIds.length) return;

    const already = new Set(
      Array.from(flags ?? new Set<string>()).filter(isRuneFlagId)
    );
    const newRunes = runeIds
      .filter(isRuneFlagId)
      .filter((id) => !already.has(id));
    if (!newRunes.length) return;

    const choiceRuneIds = new Set<string>();
    if (Array.isArray(pageData?.choices)) {
      for (const c of pageData.choices as StoryChoiceRecord[]) {
        const locks = Array.isArray(c?.reward?.locks)
          ? c.reward.locks
          : typeof c?.reward?.locks === "string"
          ? [c.reward.locks]
          : [];
        locks.forEach((id) => {
          const s = String(id);
          if (isRuneFlagId(s)) choiceRuneIds.add(s);
        });

        if (Array.isArray(c?.actions)) {
          c.actions.forEach((a) => {
            const id = a?.id ?? a?.unlockRune ?? a?.setFlag;
            if (id && isRuneFlagId(String(id)))
              choiceRuneIds.add(String(id));
          });
        }
      }
    }

    const pageOnlyRunes = newRunes.filter(
      (rid) => !choiceRuneIds.has(rid)
    );
    if (!pageOnlyRunes.length) return;

    const wantOverlay = !!pageData?.overlayRunesOnEnter;

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
    const ids = pageData?.unlockFragments;
    if (!ids?.length) return;
    if (!globalFragments) return;

    ids.forEach((id: string) => {
      if (!id) return;
      const src = globalFragments?.[id];
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
    const raw = pageData?.fragmentRecall;
    const recalls = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const recallIds = recalls
      .map((r) => r?.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);

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
      resolveNextFromPage(pageData, stringGlobals) ||
      (typeof pageData?.next === "string" ? pageData.next : null)
    );
  }, [pageData, stringGlobals]);

  const mediaMode = pageData?.layout?.mediaMode || "image";
  const isProfileCardPage = mediaMode === "profile-card";


  const canInteractHere =
    !!pageData &&
    pageUnlockedForInteraction === pageData.id &&
    !isEndNode;

const dockChoicesForThisPage = useMemo(() => {
  return buildDockChoices({
    canInteractHere,
    pageId: pageData?.id,
    choices: pageData?.choices,
    resolvedNext,
    unlockedFragments,
    pageType:
      typeof pageData?.type === "string" ? pageData.type : undefined,
    visitedPages,
  });
}, [
  canInteractHere,
  pageData ? pageData.choices : undefined,
  resolvedNext,
  pageData ? pageData.id : undefined,
  unlockedFragments,
  visitedPages,
  pageData?.type,
]);

  // recall szövegek
  const recallTexts: string[] = useMemo(() => {
    const raw = pageData?.fragmentRecall;
    const toArr = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const getTxt = (id?: string, fb?: string) => {
      if (!id) return fb || "";
      const tLocal = fragments?.[id]?.text?.trim();
      if (tLocal) return tLocal;
      const tGlobal = globalFragments?.[id]?.text?.trim();
      if (tGlobal) return tGlobal;
      return fb || "";
    };
    return toArr
      .map((r) => getTxt(r?.id, r?.textFallback))
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
      pageData?.correctLabel ||
      pageData?.riddle?.correctLabel;
    if (fromPage) return String(fromPage);

    const fromGlobals =
      globals?.riddleCorrectLabel ||
      globals?.quiz?.labels?.correct;
    if (fromGlobals) return String(fromGlobals);

    return "Helyes!";
  }, [pageData, globals]);

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
  () => normalizeImagePrompt(pageData?.imagePrompt),
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
    const base: Record<string, unknown> = {
      ...stableParams,
      negativePrompt:
        resolvedImgPrompt.negative ??
        stableParams?.negativePrompt,
      seed:
        typeof resolvedImgPrompt.seed === "number"
          ? resolvedImgPrompt.seed
          : stableParams?.seed,
      styleProfile:
        resolvedImgPrompt.styleProfile ??
        stableParams?.styleProfile,
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
    timing.staticImage ||
      timing.existingImageId ||
      timing.imageId
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

  // timeout scheduler for sfx hook
  const scheduleTimeout = useCallback(
    (cb: () => void, ms: number) => {
      const id = window.setTimeout(cb, ms);
      registerTimeout(id);
      return id;
    },
    [registerTimeout]
  );

  const onNarrativeMeasure = useCallback((m: Measure) => {
    setMeasure((prev) => {
      if (
        prev &&
        prev.panel.x === m.panel.x &&
        prev.panel.y === m.panel.y &&
        prev.panel.width === m.panel.width &&
        prev.panel.height === m.panel.height &&
        prev.content.x === m.content.x &&
        prev.content.y === m.content.y &&
        prev.content.width === m.content.width &&
        prev.content.height === m.content.height
      ) {
        return prev;
      }
      return m;
    });
  }, []);

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
      if (!isRiddle(pageData)) return;
      const p = pageData;
      const isCorrect = choiceIdx === p.correctIndex;

      const prevRaw = globals?.score;
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
                id: pageData?.id ?? "riddle",
                next:
                  p.onAnswer?.nextSwitch ?? {
                    switch: "__isCorrect",
                    cases: { true: "", false: "" },
                  },
              },
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

  const handleChoice = useCallback(
    (next: string, reward?: unknown, choiceObj?: unknown) => {
      // simple double-click guard
      if (isFadingOut) {
        return;
      }

      const choice =
        choiceObj && typeof choiceObj === "object"
          ? (choiceObj as StoryChoiceRecord)
          : undefined;

      try {
        const pageId =
          pageData?.id || currentPageId || "unknown";
        const label =
          choice?.text ??
          choice?.label ??
          choice?.id ??
          "unknown";
        const latencyMs =
          typeof enterTsRef.current === "number"
            ? Date.now() -
              enterTsRef.current
            : undefined;

            const choiceId = String(choice?.id ?? (next ? `to:${next}` : "unknown_choice"));
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

      const mutationPlan = buildChoiceMutationPlan({
        reward: reward as Parameters<typeof buildChoiceMutationPlan>[0]["reward"],
        choiceObj: choice as Parameters<typeof buildChoiceMutationPlan>[0]["choiceObj"],
        pageData,
        unlockedFragments,
        flags,
        globalFragments,
        fragments,
      });

      if (mutationPlan.globalUpdates.length > 0) {
        flushSync(() => {
          mutationPlan.globalUpdates.forEach(({ key, value }) => {
            setGlobal(key, value);
          });
        });
      }

      if (mutationPlan.savedFragments.length > 0) {
        flushSync(() => {
          mutationPlan.savedFragments.forEach(({ id, data }) => {
            addFragment(id, data);
          });
        });
      }

      if (mutationPlan.mergedUnlockedFragments.length > 0) {
        flushSync(() => {
          setUnlockedFragments(mutationPlan.mergedUnlockedFragments);
          mutationPlan.unlockedFragmentWrites.forEach(({ id, data }) => {
            addFragment(id, data);
          });

         /* setShowReward(true); */
        });

       /* const tid = window.setTimeout(
          () => setShowReward(false),
          2000
        );
        registerTimeout(tid); */
      }

      if (mutationPlan.flagsToSet.length > 0) {
        flushSync(() => {
          mutationPlan.flagsToSet.forEach((flagId) => setFlag(flagId));
        });

        if (mutationPlan.newRunes.length > 0) {
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
              mutationPlan.newRunes.forEach((rid) => {
                if (!rid) return;
                trackRuneUnlock(
                  derivedStoryId,
                  derivedSessionId,
                  pageId,
                  rid,
                  {
                    source: "choice",
                    mode: "inline-nooverlay",
                    hasCustomImage: mutationPlan.hasCustomImage,
                  }
                );
              });
            }
          } catch {}
        }
      }

      prevWasChoiceRef.current = true;

      if (next && next !== pageData?.id) {
        runChoiceTransition({
          next,
          currentPageId: pageData?.id,
          scrollContainer: scrollContainerRef.current,
          lockHeightsForTransition,
          unlockHeightsAfterTransition,
          setIsFadingOut,
          setShowChoices,
          setChoicePageId,
          setPageUnlockedForInteraction,
          setSkipRequested,
          setDockJustAppeared,
          setHideNarration,
          goToNextPage,
        });
      }
    },
    [
      isFadingOut,
      unlockedFragments,
      setUnlockedFragments,
      pageData?.id,
      goToNextPage,
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

  const endCtaUiActive =
    isEndNode &&
    showChoices &&
    Boolean(resolvedEndCta) &&
    !isGhostEmbed;

  const {
    mediaNode,
    narrationPlaylistMemo,
    playModeMemo,
    duckingMemo,
    selectedReplay,
  } = useStoryPageMediaAudio({
    pageData,
    showFrame,
    isProfileCardPage,
    isFadingOut,
    logoUrl,
    shouldGenerate,
    resolvedPrompt: resolvedImgPrompt.prompt,
    effectiveImageParams,
    stableImageTiming,
    unlockedPlus,
    unlockedFragments,
    fragments,
    ctaDockMediaActive: endCtaUiActive,
  });

  /** CTA takeover: média egy példányban a dockban jelenik meg, a Canvas slot üres */
  const canvasMediaForLayout =
    endCtaUiActive && mediaNode != null ? undefined : mediaNode;

  // prefetch sound toggle icons
  useEffect(() => {
    const on = new Image();
    const off = new Image();
    on.src =
      "/icons/rune_sound_on_128_transparent.png";
    off.src =
      "/icons/rune_sound_off_128_transparent.png";
  }, []);

  if (!globals?.storySrc) {
    return (
      <div
        ref={isEmbedPath ? pageRootRef : undefined}
        className={style.storyPage}
        data-embed-ghost={isGhostEmbed ? "1" : undefined}
      >
        {isGhostEmbed && <EmbedGhostDocumentBg />}
        {!isGhostEmbed && <DecorBackground />}
        <div
          style={{
            position: "relative",
            zIndex: 5,
            padding: "8vh 4vw",
            color: isGhostEmbed ? "inherit" : "#fff",
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
        ref={isEmbedPath ? pageRootRef : undefined}
        className={style.storyPage}
        data-testid="fallback"
        data-embed-ghost={isGhostEmbed ? "1" : undefined}
      >
        {isGhostEmbed && <EmbedGhostDocumentBg />}
        <LoadingOverlay variant={isGhostEmbed ? "minimal" : "default"} />
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

  const _mustBeFn = (n: string, v: unknown) => {
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
  _mustBeFn("NineSlicePanel", NineSlicePanel);
  _mustBeFn("AudioPlayer", AudioPlayer);
  _mustBeFn("TransitionVideo", TransitionVideo);
  _mustBeFn("FeedbackOverlay", FeedbackOverlay);
  _mustBeFn("RestartButton", RestartButton);
  _mustBeFn(
    "FragmentReplayOverlay",
    FragmentReplayOverlay
  );
  // transition/video page
  if (isTransitionVideoPage(pageData)) {
    const t = pageData.transition;
    return (
      <div
        ref={isEmbedPath ? pageRootRef : undefined}
        className={style.storyPage}
        data-embed-ghost={isGhostEmbed ? "1" : undefined}
      >
        {isGhostEmbed && <EmbedGhostDocumentBg />}
         <AdminQuickPanel />
        {analyticsSync}

        {!isGhostEmbed && <DecorBackground />}
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
        pageData,
        stringGlobals
      ) ||
      (typeof pageData?.next === "string"
        ? pageData.next
        : null) ||
      "ch4_pg1";
    return (
      <div
        ref={isEmbedPath ? pageRootRef : undefined}
        className={style.storyPage}
        data-embed-ghost={isGhostEmbed ? "1" : undefined}
      >
        {isGhostEmbed && <EmbedGhostDocumentBg />}
        <AdminQuickPanel />
        {analyticsSync}
        {!isGhostEmbed && (
          <div
            className={style.storyBackground}
          >
            <DecorBackground preset="subtle" />
          </div>
        )}

      
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

  const canvasStyleVars: StoryPageStyleVars = {
    "--np-maxw": "1400px",
    "--wrapper-maxw": "1400px",
  };



  // normal page
  return (
    <div
      ref={pageRootRef}
      className={style.storyPage}
      data-skin={skin}
      data-embed-ghost={isGhostEmbed ? "1" : undefined}
    >
      {isGhostEmbed && <EmbedGhostDocumentBg />}
      <AdminQuickPanel />
      {analyticsSync}
      {showAnalytics && (
        <AnalyticsReport
          storyId={derivedStoryId}
        />
      )}

      {isLoading && (
        <LoadingOverlay variant={isGhostEmbed ? "minimal" : "default"} />
      )}

      <Canvas
        embedGhost={isGhostEmbed}
        ctaMode={endCtaUiActive}
        background={
          isGhostEmbed ? undefined : (
            <DecorBackground preset="subtle" />
          )
        }
        /* szélesebb tartalmi sáv a runtime-ban */
        style={canvasStyleVars}
        topbar={
          isGhostEmbed ? null : (
            <>
              <HeaderBar
                data-skin={skin}
                variant="transparent"
                elevated
                left={
                  <img
                    src={logoUrl}
                    alt={
                      typeof meta?.title === "string"
                        ? meta.title
                        : titleText || "Logo"
                    }
                    data-logo
                  />
                }
                center={
                  <span data-header-title>
                    {titleText}
                  </span>
                }
                right={null}
              />
            </>
          )
        }
        progress={
          isGhostEmbed ? null : (
            <ProgressStrip
              value={progressDisplay.value ?? 0}
              milestones={progressDisplay.milestones}
            />
          )
        }
        media={canvasMediaForLayout}


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

          const endPage =
            pageData?.type === "end" ||
            (typeof pageData?.id === "string" &&
              pageData.id.startsWith("end_"));

          const revealDock = () => {
            requestAnimationFrame(() => {
              setDockJustAppeared(true);
              setShowChoices(true);
              setChoicePageId(pageData.id);
            });
          };

          if (endPage && END_CTA_REVEAL_DELAY_MS > 0) {
            const tid = window.setTimeout(revealDock, END_CTA_REVEAL_DELAY_MS);
            registerTimeout(tid);
          } else {
            revealDock();
          }
        }}
        onMeasure={onNarrativeMeasure}
        typingDone={typingDone}
        lockedMeasure={lockedMeasure}
        setLockedMeasure={(m: Measure) => setLockedMeasure(m)}
        firstLockTimerRef={firstLockTimer}
        pageId={pageData.id}
        title={pageData?.title}
        exiting={isFadingOut}              // ha már bekötötted, maradjon
        exitMs={600}
        embedGhost={isGhostEmbed}
      />
    </div>
  )
}

        dock={
          <StoryPageDock
            embedGhost={isGhostEmbed}
            endCtaMedia={endCtaUiActive ? mediaNode : undefined}
            showChoices={showChoices}
            choicePageId={choicePageId}
            pageUnlockedForInteraction={pageUnlockedForInteraction}
            dockRef={dockFreezeRef}
            dockJustAppeared={dockJustAppeared}
            isFadingOut={isFadingOut}
            isEndNode={isEndNode}
            resolvedEndCta={resolvedEndCta}
            endCtaContext={endCtaContext}
            isRiddlePage={isRiddlePage}
            isRunesPage={isRunesPage}
            pageData={pageData}
            riddleCorrectLabel={riddleCorrectLabel}
            derivedStoryId={derivedStoryId}
            derivedSessionId={derivedSessionId}
            dockChoicesForThisPage={dockChoicesForThisPage}
            resolvedNext={resolvedNext}
            handleRiddleAnswer={handleRiddleAnswer}
            handleChoice={handleChoice}
            setFlag={setFlag}
            goToNextPage={goToNextPage}
            setGlobal={setGlobal}
          />
        }

        action={
          isGhostEmbed ? null : (
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
          )
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

export default StoryPage;
