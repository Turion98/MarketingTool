
"use client";

import React, { useState, useEffect, useCallback, useMemo, useLayoutEffect, useRef } from "react";
import LoadingOverlay from "../LoadingOverlay/LoadingOverlay";
import TypingText from "../TypingText/TypingText";
import GeneratedImage_with_fadein from "../GeneratedImage/GeneratedImage";
import AudioPlayer from "../AudioPlayer";
import ChoiceButtons, { Choice } from "../ChoiceButtons/ChoiceButtons";
import RewardOverlay from "../labs/RewardOverlay/RewardOverlay";
import FragmentReplayOverlay from "../labs/FragmentReplayOverlay/FragmentReplayOverlay";
import { useGameState } from "../../lib/GameStateContext";
import style from "./StoryPage.module.scss";
import RestartButton from "../RestartButton/RestartButton";
import SmokeField from "../SmokeField/SmokeField";
import { preloadImage } from "../../lib/preloadImage";
import { preloadAudio, getLastAudioPerfLog } from "../../lib/audioCache";

// ⬇️ SFX ütemező + busz
import { useSfxScheduler } from "../../lib/useSfxScheduler";
import { setSfxMuted, stopAllSfx } from "../../lib/sfxBus";

// ⬇️ Dev HIT/MISS kijelzéshez – a hook írja ezt
import { getLastImagePerfLog } from "../../lib/useImageCache";

// ⬇️ Célzott törlés
import { clearImageCache } from "../../lib/clearImageCache";
import { clearVoiceCache } from "../../lib/clearVoiceCache";

// ⬇️ videós átvezető komponens
import TransitionVideo from "../TransitionVideo/TransitionVideo";

// ⬇️ Feedback overlay
import FeedbackOverlay from "../FeedbackOverlay/FeedbackOverlay";

// ⬇️ 9-slice keret komponens
import NineSlicePanel from "../NineSlicePanel/NineSlicePanel";
import DecorBackground from "../layout/DecorBackground/DecorBackground";
import ProgressStrip from "../layout/ProgressStrip/ProgressStrip";
import NarrativePanel from "../layout/NarrativePanel/NarrativePanel";


// ⬇️ típus egységesítés a contexttel
import type { FragmentData } from "../../lib/GameStateContext";
import RuneDockDisplay from "../runes/RuneDockDisplay"
import BrickBottomOverlay from "../labs/BrickBottomOverlay/BrickBottomOverlay";
import { flushSync } from "react-dom";
import { resolveNextFromPage } from "../../lib/GameStateContext";
import RuneSaveOverlay from "../labs/RuneSaveOverlay/RuneSaveOverlay";
import { RUNE_ICON, isRuneId } from "../../lib/runeIcons";
import PuzzleRunes from "../labs/PuzzleRunes/PuzzleRunes";
import RiddleQuiz from "../labs/RiddleQuiz/RiddleQuiz";

import { useSearchParams } from "next/navigation";
import {
   trackPageEnter, trackPageExit,
   trackChoice, trackPuzzleTry, trackPuzzleResult, trackRuneUnlock, trackUiClick
 } from "../../lib/analytics";
 import AnalyticsReport from "../AnalyticsReport/AnalyticsReport";
 import AnalyticsSync from "../AnalyticsSync/AnalyticsSync";


import MediaFrame from "../layout/MediaFrame/MediaFrame";
import InteractionDock from "../layout/InteractionDock/InteractionDock";
import ActionBar from "../layout/ActionBar/ActionBar";

import Canvas from "../layout/Canvas/Canvas";
import HeaderBar from "../layout/HeaderBar/HeaderBar";

import CampaignCta from "../CampaignCta/CampaignCta";
import { resolveCta } from "../../core/cta/ctaResolver"; // ha nálad 'lib/cta', írd át
import type { CtaContext, CampaignConfig } from "../../core/cta/ctaTypes";
import dockStyles from "../layout/InteractionDock/InteractionDock.module.scss";
import canvasStyles from "../layout/Canvas/Canvas.module.scss"; 
import { loadTokens } from "../../lib/tokenLoader";


const DEBUG_RUNES = true; // ideiglenes debug kapcsoló
const DELAY_MS = 3000;
const FADE_IN_MS = 600;
const RUNE = { slot: 72, gap: 0, slots: 3, offsetX: 176, offsetY: 25 };
const SKIN_LS_KEY = "skinByCampaignId";

/** ---------- Fragment-kompozíció ---------- */
type FragmentBank = Record<
  string,
  FragmentData & {
    /** opcionális extra – ha a bankban tároltok ilyet a replay overlayhez */
    replayImageId?: string;
    [k: string]: any;
  }
>;

type FragmentRef = { id: string; prefix?: string; suffix?: string };

function explodeTextToBlocks(s?: string | null): string[] {
  if (!s) return [];
  return s
    .split(/\n{2,}/g)
    .map((p) => p.trim())
    .filter(Boolean);
}

// KÉP/ASSET útvonal normalizáló (logo-hoz)
function normalizeAssetUrl(raw?: string | null): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;       // abszolút URL
  if (s.startsWith("/")) return s;              // /assets/...
  if (s.startsWith("assets/")) return "/" + s;  // assets/... -> /assets/...
  // egyébként tételezzük fel, hogy az assets alatt van
  return "/assets/" + s.replace(/^assets\//, "");
}


/** Egységes tokenfeloldás a {fragment:ID} mintákhoz, ref prefix/suffix támogatással + globál fallback */
function resolveFragmentTokens(
  raw: string,
  bankA: FragmentBank | undefined,
  refMeta: Map<string, { prefix?: string; suffix?: string }>,
  bankB?: FragmentBank
): string {
  return String(raw ?? "").replace(/\{fragment:([\w\-]+)\}/g, (_, id: string) => {
    const fragTxt =
      (bankA && bankA[id]?.text) ??
      (bankB && bankB[id]?.text) ??
      "";
    const meta = refMeta.get(id) || {};
    const decorated = `${meta?.prefix ?? ""}${fragTxt}${meta?.suffix ?? ""}`;
    return decorated.trim();
  });
}

function composeBlocks(
  pageData: any,
  unlocked: string[] | Set<string>,
  bank: FragmentBank | undefined,
  globalBank?: FragmentBank
): string[] {
  const unlockedSet = Array.isArray(unlocked) ? new Set(unlocked) : unlocked;
  const out: string[] = [];

  const refs: FragmentRef[] = Array.isArray(pageData?.fragmentRefs) ? pageData.fragmentRefs : [];
  const refMeta = new Map<string, { prefix?: string; suffix?: string }>(
    refs.map((r) => [r.id, { prefix: r.prefix, suffix: r.suffix }])
  );

  const pushOrAppend = (resolved: string, mode?: string, sep?: string) => {
    const text = (resolved ?? "").trim();
    if (!text) return;
    if (mode === "append_after" && out.length > 0) {
      out[out.length - 1] = `${out[out.length - 1]}${sep ?? "\n\n"}${text}`.trim();
    } else {
      out.push(...explodeTextToBlocks(text));
    }
  };

  // ——— LOKÁLIS CSOPORT ÁLLAPOT ———
  let groupHasDefault = false;
  let groupDefault: string | null = null;
  let groupMatched = false;

  const startGroupWithDefault = (defStr: string) => {
    groupHasDefault = true;
    groupDefault = defStr;
    groupMatched = false;
  };
  const flushGroupIfPending = () => {
    if (groupHasDefault && !groupMatched && groupDefault) {
      pushOrAppend(groupDefault);
    }
    groupHasDefault = false;
    groupDefault = null;
    groupMatched = false;
  };

  if (Array.isArray(pageData?.text)) {
    for (const item of pageData.text) {
      const mode: string | undefined = item?.mode;
      const sep: string | undefined = item?.separator;

      // 1) default → új csoport kezdete
      if (item?.default != null) {
        flushGroupIfPending();
        const resolved = resolveFragmentTokens(String(item.default), bank, refMeta, globalBank);
        startGroupWithDefault(resolved);
        continue;
      }
// 2) feltételes (ifUnlocked) – kezeld MINDIG és ne folyjon tovább
const condId: string | undefined = item?.ifUnlocked;
if (typeof condId === "string") {
  const looksLikeFlag = /^block_|^flag_|^rune_/i.test(condId);
  const hit = unlockedSet.has(condId);

  if (hit) {
    // DIAG
    console.log("[composeBlocks.ifUnlocked HIT]", {
      pageId: pageData?.id,
      condId,
      looksLikeFlag,
      mode,
      sep,
      textPreview: String(item?.text ?? "").slice(0, 80),
    });

    let resolved = resolveFragmentTokens(
      String(item.text ?? ""),
      bank,
      refMeta,
      globalBank
    ).trim();

    if (!resolved) {
      const fb =
        (bank?.[condId]?.text?.trim() ||
          globalBank?.[condId]?.text?.trim() ||
          "");
      if (fb) {
        resolved = resolveFragmentTokens(fb, bank, refMeta, globalBank).trim();
      }
    }

    if (resolved) {
      if (groupHasDefault) {
        if (mode === "append_after") {
          // default + hozzáfűzés
          pushOrAppend(groupDefault || "");
          pushOrAppend(resolved, "append_after", sep);
        } else {
          // override: csak a feltételes szöveg megy ki (default NEM)
          pushOrAppend(resolved);
        }
        groupMatched = true;
        flushGroupIfPending();
      } else {
        // nincs aktív default csoport → önálló feltételes sor
        pushOrAppend(resolved);
      }
    }
  }

  // 🔴 Nagyon fontos: akár talált, akár nem, ezt az elemet lezárjuk
  // hogy ne folyjon tovább a "plain text" ágba.
  continue;
}


      // 3) közvetlen fragment-beemelés CSAK ha expliciten kérted (when===true)
      const ifFragment: string | undefined = (item as any)?.ifFragment;
      const when: boolean | undefined = (item as any)?.when;
      if (ifFragment && when === true) {
        const src = bank?.[ifFragment]?.text ?? globalBank?.[ifFragment]?.text ?? "";
        if (src) {
          const resolved = resolveFragmentTokens(String(src), bank, refMeta, globalBank);
          if (groupHasDefault) flushGroupIfPending();
          pushOrAppend(resolved);
        }
        continue;
      }

      // 4) plain text elem
      if (typeof item?.text === "string") {
        const resolved = resolveFragmentTokens(item.text, bank, refMeta, globalBank);
        if (groupHasDefault) flushGroupIfPending();
        pushOrAppend(resolved);
      }
    }

    // ciklus vége → maradt függőben default?
    flushGroupIfPending();
  } else if (typeof pageData?.text === "string") {
    const baseResolved = resolveFragmentTokens(pageData.text, bank, refMeta, globalBank);
    out.push(...explodeTextToBlocks(baseResolved));
  }

  return out;
}

/** -------------------------------------------------------------- */

/** ---- TÍPUS + TYPE GUARD a transition/video oldalakhoz ---- */
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
    duckToVol?: number; // 0..1
    attackMs?: number; // ms
    releaseMs?: number; // ms
    preloadNext?: boolean;
  };
}

function isTransitionVideoPage(p: any): p is TransitionVideoData {
  return !!p && p.type === "transition" && p.transition?.kind === "video";
}
/** ---------------------------------------------------------------- */
/** ---- Puzzles: riddle / runes ---- */
type PuzzleRiddle = {
  type: "puzzle"; kind: "riddle";
  question: string; options: string[]; correctIndex: number;
  onAnswer?: {
    setFlags?: string[] | Record<string, boolean>;
    setGlobals?: Record<string, string>;
    nextSwitch?: any; // string | NextSwitch – __isCorrect-re építünk
  };
};

type PuzzleRunesPage = {
  type: "puzzle"; kind: "runes";
  prompt?: string;
  options: string[];         // választható elemek
  answer: string[];          // helyes sorrend
  maxAttempts?: number;
  onSuccess: { goto: string; setFlags?: string[] | Record<string,boolean> };
  onFail:    { goto: string; setFlags?: string[] | Record<string,boolean> };
};

const isRiddle = (p:any): p is PuzzleRiddle =>
  p?.type === "puzzle" && p?.kind === "riddle";

const isRunes = (p:any): p is PuzzleRunesPage =>
  p?.type === "puzzle" && p?.kind === "runes";


/** ---- ÚJ: fragmentRecall hint típus a pageData-hoz ---- */
type FragmentRecallHint = {
  id?: string;
  textFallback?: string;
};

/** ---- ÚJ: Replay vizuál kiválasztó a feloldott fragmensek alapján ---- */
function pickReplayVisual(
  page: any,
  unlocked: string[] | Set<string>,
  bank: FragmentBank | undefined
): { imageId: string | null; durationMs: number } {
  const unlockedSet = Array.isArray(unlocked) ? new Set(unlocked) : unlocked;
  const list = Array.isArray(page?.replayOverlay) ? page.replayOverlay : [];
  // Ha a page-nek van replayOverlay listája, preferáljuk azt
  for (const r of list) {
    const { fragmentId, imageId, durationMs } = r || {};
    if (!fragmentId) continue;
    if (!unlockedSet.has(fragmentId)) continue;
    const chosenImage = imageId || bank?.[fragmentId]?.replayImageId || null;
    if (chosenImage) {
      return { imageId: chosenImage, durationMs: Number(durationMs ?? 1800) };
    }
  }
  // Fallback: bármelyik unlocked fragment bank szerinti képe
  for (const id of unlockedSet) {
    const rid = bank?.[id as string]?.replayImageId;
    if (rid) return { imageId: rid, durationMs: 1800 };
  }
  return { imageId: null, durationMs: 1800 };
}

/** ---- SFX útvonal normalizáló ---- */
function normalizeSfxUrl(raw?: string): string | null {
  if (!raw) return null;
  let f = raw.trim();
  if (!f) return null;

  // Teljes URL?
  if (/^https?:\/\//i.test(f)) return f;

  // Már /assets/... ?
  if (f.startsWith("/assets/")) return f;

  // assets/... → /assets/...
  if (f.startsWith("assets/")) return "/assets/" + f.replace(/^assets\//, "");

  // sfx/... → /assets/sfx/...
  if (f.startsWith("sfx/")) return "/assets/" + f;

  // bármi más: tedd /assets/sfx/ alá (dupla sfx/ levágásával)
  return "/assets/sfx/" + f.replace(/^sfx\//, "");
}

// ---- Fix: NineSlicePanel mérés típusa és state ----
type Measure = {
  panel: { x: number; y: number; width: number; height: number };
  content: { x: number; y: number; width: number; height: number };
};

const StoryPage: React.FC = () => {
  // ---- state hookok (feltétel nélkül) ----
  const [skipAvailable, setSkipAvailable] = useState(false);
  const [showReward, setShowReward] = useState(false);
  const [showReplay, setShowReplay] = useState(false);
  const [skipRequested, setSkipRequested] = useState(false);
  const [replayKey, setReplayKey] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [showChoices, setShowChoices] = useState(false);
  const [animateNext, setAnimateNext] = useState(false);
  const pageRootRef = useRef<HTMLDivElement>(null);
  // ⬇️ Egyedi rúna PNG-k: flagId -> pngUrl
const [imagesByFlag, setImagesByFlag] = useState<Record<string, string>>({});

useLayoutEffect(() => {
    const root = pageRootRef.current;
    if (!root) return;

    // Keressük meg a Canvas görgető konténerét (CSS Modules kompat: class*="canvasWrap")
    const scrollEl = root.querySelector<HTMLElement>('[class*="canvasWrap"]');
    if (!scrollEl) return;

    const setDocH = () => {
      // rAF: biztosan kész a layout
      requestAnimationFrame(() => {
        scrollEl.style.setProperty("--doc-h", `${scrollEl.scrollHeight}px`);
      });
    };

    setDocH();

    const ro = new ResizeObserver(setDocH);
    ro.observe(scrollEl);

    const mo = new MutationObserver(setDocH);
    mo.observe(scrollEl, { childList: true, subtree: true, characterData: true });

    const onResize = () => setDocH();
    window.addEventListener("resize", onResize);

    return () => {
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, []);

// (opcionális) betöltés/persist localStorage-ból
useEffect(() => {
  try {
    const raw = localStorage.getItem("runeImagesByFlag");
    if (raw) setImagesByFlag(JSON.parse(raw));
  } catch {}
}, []);

useEffect(() => {
  try {
    localStorage.setItem("runeImagesByFlag", JSON.stringify(imagesByFlag));
  } catch {}
}, [imagesByFlag]);


  // ⬇️ narráció T0 SFX-hez
  const [narrationT0, setNarrationT0] = useState<number | null>(null);

  // --- ID osztályozó: flag vs. fragment ---
const isFlagId = (id: string) => /^block_|^flag_|^rune_/.test(id);

// pl. "block_a, block_b" VAGY ["block_a", "block_b"] VAGY ["block_a, block_b"]
const normalizeIdList = (v: unknown): string[] => {
  if (Array.isArray(v)) {
    return v
      .flatMap(x => String(x).split(/[,\s]+/g))
      .map(s => s.trim())
      .filter(Boolean);
  }
  if (typeof v === "string") {
    return v.split(/[,\s]+/g).map(s => s.trim()).filter(Boolean);
  }
  return [];
};

  // ⬇️ Dev-sor állapot
  const [devOpen, setDevOpen] = useState(false);
  const [devText, setDevText] = useState<string>("");

  // ⬇️ gépelés állapota a lock oldásához
const [typingDone, setTypingDone] = useState(false);

  // új:
const [runeAnim, setRuneAnim] = useState<{
  src: string;
  key: number;
  pendingRunes: string[];        // pl. ["rune_ch1"]
  savedPngUrl?: string;          // ha jön backendtől egyedi PNG
} | null>(null);

  // ⬇️ ÚJ: a NineSlicePanel content dobozának mért adatai (STABIL – a keretből számolva)
  const [measure, setMeasure] = useState<Measure | null>(null);
  const [lockedMeasure, setLockedMeasure] = useState<Measure | null>(null);

  /* ⬇️ ADD: a NineSlicePanel content-keretének élő ref-je a handlerhez */
const anchorPortalRef = useRef<Measure["content"] | null>(null);
useEffect(() => {
  anchorPortalRef.current = measure?.content ?? null;
}, [measure]);

// ⬇️ ÚJ: analytics időzítés refek
const enterTsRef = useRef<number | null>(null);
const lastPageRef = useRef<string | null>(null);
const puzzleStartRef = useRef<number | null>(null);


  // ⬇️ Első lock késleltetéséhez  ⟵ IDE
const firstLockTimer = useRef<number | null>(null);

// ⬇️ Navigáció késleltetéséhez, amíg a rúna animáció tart
const pendingNextRef = useRef<string | null>(null);

  // ---- context (feltétel nélkül) ----
  const {
    currentPageData: pageData,
    unlockedFragments,
    setUnlockedFragments,
    goToNextPage,
    isMuted,
    setIsMuted,
    triggerAudioRestart,
    registerAbort,
    registerTimeout, // ID-t vár
    isLoading,
    currentPageId, // diag
    globalError, // diag
    fragments, // Globális fragments store a CH3→CH4 recallhoz
    addFragment,
    globalFragments,
    flags,
    setFlag,
    globals,
    setGlobal,
    progressDisplay,
    storyId,
    sessionId,
  } = useGameState() as ReturnType<typeof useGameState> & {
    currentPageId?: string;
    globalError?: string | null;
    fragments: FragmentBank;
    addFragment: (id: string, data: FragmentData) => void;
     globalFragments: FragmentBank; // ⬅️ típus kieg
  };
  // --- Query params (kell a story azonosítóhoz) ---
const params = useSearchParams();
const showAnalytics = params.get("analytics") === "1";

// --- Analytics ID-k (robosztus fallback) ---
const derivedStoryId = useMemo(() => {
  // 1) Kontextus: csak ha nem "global"
  const ctx = (storyId || "").trim();
  if (ctx && !/^global$/i.test(ctx)) return ctx;

  // 2) SRC-ből (globals.storySrc vagy ?src=...json)
  const src = globals?.storySrc || params.get("src") || undefined;
  if (src) {
    const base = (src.split("/").pop() || src).replace(/\.json$/i, "");
    if (base && !/^global$/i.test(base)) return base;
  }

  // 3) TITLE-ből (globals.storyTitle vagy ?title=...)
  const t = globals?.storyTitle || params.get("title") || undefined;
  if (t) {
    const slug = t.trim().toLowerCase().replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "");
    if (slug) return slug;
  }

  // 4) Fallback
  return "default_story";
}, [storyId, globals?.storySrc, globals?.storyTitle, params]);

// Kampány-szintű ikoncsomag egységesítése (Overlay-hez igazítva)
const runePackForDisplay = useMemo(() => {
  const rp: any = globals?.runePack;
  if (!rp || typeof rp !== "object") return undefined;

  // TRIPLE mód?
  const isTriple = rp.mode === "triple";

  if (!isTriple) {
    // SINGLE mód: elfogadjuk {icon}-t vagy {icons[0]}-t
    const icon: string | undefined =
      typeof rp.icon === "string"
        ? rp.icon
        : (Array.isArray(rp.icons) && typeof rp.icons?.[0] === "string")
        ? rp.icons[0]
        : undefined;

    if (!icon) return undefined;

    return {
      mode: "single" as const,
      icon,
      palette: rp.palette,
    };
  }

  // TRIPLE mód: első 3 érvényes string
  const icons: string[] = Array.isArray(rp.icons)
    ? rp.icons.filter((x: any) => typeof x === "string").slice(0, 3)
    : [];

  if (icons.length === 0) return undefined;

  return {
    mode: "triple" as const,
    icons,
    palette: rp.palette,
  };
}, [globals?.runePack]);


// --- Aktív skin alkalmazása: ?skin=... elsőbbség, különben LS mapping a derivedStoryId-hez ---
useEffect(() => {
  if (!derivedStoryId) return;

  // 1) query param elsőbbség
  const qSkin = params.get("skin");

  // 2) ha nincs query, nézzük a per-kampány mappingot LS-ben
  let mapped: string | undefined;
  try {
    const raw = localStorage.getItem(SKIN_LS_KEY);
    if (raw) {
      const map = JSON.parse(raw) as Record<string, string>;
      mapped = map[derivedStoryId];
    }
  } catch {
    /* no-op */
  }

  const skinId = qSkin || mapped;
  if (!skinId) return; // nincs explicit skin → maradnak az alap tokenek

  // 3) alkalmazás (cache-busting query parammal)
  loadTokens(`/skins/${skinId}.json?v=${Date.now()}`).catch(() => {});
}, [derivedStoryId, params]);


const derivedSessionId = useMemo(() => {
  if (sessionId) return sessionId;
  try {
    let s = localStorage.getItem("sessionId_v2");
    if (!s) {
      s = `sess_${Math.random().toString(36).slice(2)}_${Date.now()}`;
      localStorage.setItem("sessionId_v2", s);
    }
    return s;
  } catch {
    return undefined;
  }
}, [sessionId]);

useEffect(() => {
  console.log("[AnalyticsSync mount check]", {
    storyId: derivedStoryId,
    sessionId: derivedSessionId,
    willMount: !!(derivedStoryId && derivedSessionId),
  });
}, [derivedStoryId, derivedSessionId]);

// 🔄 Analytics auto-sync uploader (30s-enként + tab váltás/bezárás flush)
const analyticsSync = (derivedStoryId && derivedSessionId) ? (
  <AnalyticsSync storyId={derivedStoryId} sessionId={derivedSessionId} intervalMs={30000} />
) : null;
// ---- effects (feltétel nélkül) ----
  // ⬇️ Adventures → Story query paramok átvétele (mount-only)

useEffect(() => {
  const src   = params.get("src");    // pl. /stories/Erodv2_analytics.json
  const start = params.get("start");  // pl. ch1_pg1
  const title = params.get("title");  // opcionális

  if (src) {
    setGlobal?.("storySrc", src);
    try { localStorage.setItem("storySrc", src); } catch {}
  }
  if (title) {
    setGlobal?.("storyTitle", title);
    try { localStorage.setItem("storyTitle", title); } catch {}
  }
  if (start && start !== currentPageId) {
    try { localStorage.setItem("currentPageId", start); } catch {}
    // Induljunk rögtön a start oldalra
    goToNextPage(start);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

  useEffect(() => {
    setShowChoices(false);
    setAnimateNext(false);
    setSkipRequested(false);
    setSkipAvailable(false);
    setReplayKey((prev) => prev + 1);
  }, [pageData?.id]);

  // oldalváltáskor T0 reset + SFX takarítás
  useEffect(() => {
    setNarrationT0(null);
    return () => {
      try {
        stopAllSfx();
      } catch {}
    };
  }, [pageData?.id]);

  // mute szinkron a sfxBus felé
  useEffect(() => {
    try {
      setSfxMuted(!!isMuted);
    } catch {}
  }, [isMuted]);

  // Replay overlay láthatóság reset oldalváltáskor
  useEffect(() => {
    setShowReplay(false);
  }, [pageData?.id]);


  useEffect(() => {
  setLockedMeasure(null);
}, [pageData?.id]);

 useEffect(() => {
  setTypingDone(false);
}, [pageData?.id]);

// ⬇️ Puzzle stopwatch – TOP LEVEL (külön effekt!)
useEffect(() => {
  puzzleStartRef.current =
    isRiddle(pageData) || isRunes(pageData) ? Date.now() : null;
}, [pageData?.id]);

// ⬇️ Page enter/exit + dwell idő – KÜLÖN effekt
useEffect(() => {
  if (!derivedStoryId || !derivedSessionId) return;

  // prefer currentPageId, de ha valamiért nincs, ess vissza a pageData.id-re
  const pageId = currentPageId || pageData?.id;
  if (!pageId || pageId === "landing") return;

  // előző oldal lezárása (ha volt)
  if (lastPageRef.current && enterTsRef.current != null) {
    const dwell = Date.now() - enterTsRef.current;
    try { trackPageExit(derivedStoryId, derivedSessionId, lastPageRef.current, Math.max(0, dwell)); } catch {}
  }

  // aktuális oldal belépés
  try { trackPageEnter(derivedStoryId, derivedSessionId, pageId, lastPageRef.current ?? undefined); } catch {}
  enterTsRef.current = Date.now();
  lastPageRef.current = pageId;

  // unmount/oldalváltáskor zárjuk le
  return () => {
    if (!lastPageRef.current || enterTsRef.current == null) return;
    const dwell = Date.now() - enterTsRef.current;
    try {trackPageExit(derivedStoryId, derivedSessionId, lastPageRef.current, Math.max(0, dwell)); } catch {}
    enterTsRef.current = null;
    lastPageRef.current = null;
  };
}, [derivedStoryId, derivedSessionId, currentPageId, pageData?.id]);

// ⬇️ Tab elhagyásakor zárjuk a folyamatban lévő oldalt
useEffect(() => {
  if (!derivedStoryId || !derivedSessionId) return;

  const onHide = () => {
    if (document.visibilityState !== "hidden") return;
    if (!lastPageRef.current || enterTsRef.current == null) return;
    const dwell = Date.now() - enterTsRef.current;
    try { trackPageExit(derivedStoryId, derivedSessionId, lastPageRef.current, Math.max(0, dwell)); } catch {}
    // ha visszajön a tab, új belépésként számoljuk
    enterTsRef.current = Date.now();
  };

  document.addEventListener("visibilitychange", onHide);
  return () => document.removeEventListener("visibilitychange", onHide);
}, [derivedStoryId, derivedSessionId]);


// ⬇️ OLDALRA LÉPÉSKOR: unlockRunes kezelése (SILENT + choice-védő szűrés + opcionális overlay)
const processedRunesForPage = useRef<string | null>(null);

useEffect(() => {
  if (!pageData?.id) return;
  // ugyanarra az oldalra ne fusson újra
  if (processedRunesForPage.current === pageData.id) return;
  processedRunesForPage.current = pageData.id;

  const runeIds: string[] = Array.isArray((pageData as any)?.unlockRunes)
    ? (pageData as any).unlockRunes
    : [];
  if (!runeIds.length) return;

  // csak új rúnák (amik még nincsenek a flags-ben)
  const already = new Set(Array.from(flags ?? new Set<string>()).filter(isRuneId));
  const newRunes = runeIds.filter(isRuneId).filter((id) => !already.has(id));
  if (!newRunes.length) return;

  // 🔎 Gyűjtsük ki, mely rúnákat adhatnak a CHOICE-ok ezen az oldalon
  const choiceRuneIds = new Set<string>();
  if (Array.isArray(pageData?.choices)) {
    for (const c of pageData.choices) {
      const locks = Array.isArray(c?.reward?.locks)
        ? c.reward.locks
        : (typeof c?.reward?.locks === "string" ? [c.reward.locks] : []);
      locks.forEach((id: any) => { const s = String(id); if (isRuneId(s)) choiceRuneIds.add(s); });

      if (Array.isArray(c?.actions)) {
        c.actions.forEach((a: any) => {
          const id = a?.id ?? a?.unlockRune ?? a?.setFlag;
          if (id && isRuneId(String(id))) choiceRuneIds.add(String(id));
        });
      }
    }
  }

  // ❗ Csak azokat kezeljük page-enterkor, amiket NEM adnak a choice-ok
  const pageOnlyRunes = newRunes.filter((rid) => !choiceRuneIds.has(rid));
  if (!pageOnlyRunes.length) return;

  const wantOverlay = !!(pageData as any)?.overlayRunesOnEnter;

  if (wantOverlay) {
    // 🔔 Page-enter overlay (pl. ch3 *_pg3_wait)
    // forrás ikon: JSON override (pageData.runeOverlay.icon) vagy RUNE_ICON map
    const overrideIcon = (pageData as any)?.runeOverlay?.icon as string | undefined;
    const first = pageOnlyRunes.find((rid) => !!(overrideIcon || RUNE_ICON[rid]));
    if (!first) {
      console.warn("[RUNES] overlayOnEnter: ikon hiányzik", pageOnlyRunes);
      return;
    }
    const resolveRuneSrc = (raw?: string, fid?: string) => {
  if (!raw) return fid ? RUNE_ICON[fid] : undefined;

  // ha alias vagy flag-ID
  if (RUNE_ICON[raw]) return RUNE_ICON[raw];

  // ha abszolút vagy relatív asset útvonal
  if (/^https?:\/\//i.test(raw) || raw.startsWith("/")) return raw;
  if (raw.startsWith("assets/")) return "/" + raw; // “assets/…” → “/assets/…”

  return fid ? RUNE_ICON[fid] : undefined;
};
const rawOverride = (pageData as any)?.runeOverlay?.icon;
const src =
  resolveRuneSrc(rawOverride, first) // JSON override (alias/URL/flag)
  || RUNE_ICON[first]!;

console.log(
  "[RUNES] saveOverlay src=",
  src,
  "overrideIcon=",
  rawOverride,
  "first=",
  first
);

setRuneAnim({
  src,
  key: Date.now(),
  pendingRunes: pageOnlyRunes, // a flag-eket az overlay onComplete írja be
  // savedPngUrl opcionálisan jöhetne pageData-ból is, ha használnád
});

  } else {
    // 🔇 SILENT: flag-ek beírása microtaskban (nincs flushSync warning, nincs overlay)
    Promise.resolve().then(() => {
            pageOnlyRunes.forEach((rid) => {
        setFlag(rid);
        try {
          const pageId = pageData?.id || currentPageId || "unknown";
          if (derivedStoryId && derivedSessionId && pageId && rid) {
            trackRuneUnlock(derivedStoryId, derivedSessionId, pageId, rid, { source: "pageEnter", mode: "silent" });
          }
        } catch {}
      });
      // (opcionális) oldal-specifikus PNG mentés:
      // const png = (pageData as any)?.runeImageUrl;
      // if (png && pageOnlyRunes[0]) setImagesByFlag((prev) => ({ ...prev, [pageOnlyRunes[0]]: png }));
    });
  }
}, [pageData?.id, pageData?.choices, flags, setFlag, setRuneAnim]);


useEffect(() => {
  // oldalváltáskor: töröljük az esetleg futó első-lock timert
  return () => {
    if (firstLockTimer.current != null) {
      clearTimeout(firstLockTimer.current);
      firstLockTimer.current = null;
    }
  };
}, [pageData?.id]);

useEffect(() => {
  setExpanded(false);
  const id = window.setTimeout(() => setExpanded(true), 50);
  registerTimeout(id); // ← ID-t adunk át
  return () => clearTimeout(id);
}, [pageData?.id, registerTimeout]);

// 🧩 HOTFIX: ha van unlockFragments és globál bank, töltsük át a szöveget is a fragments store-ba
useEffect(() => {
  const ids = (pageData as any)?.unlockFragments as string[] | undefined;
  if (!ids?.length) return;
  if (!globalFragments) return;

  ids.forEach((id) => {
    if (!id) return;
    const src = (globalFragments as any)[id];
    if (!src) return;
    // csak akkor írjuk, ha még nincs text a fragments-ben
    if (!fragments?.[id]?.text && (src.text || src.replayImageId)) {
      addFragment(id, {
        text: src.text,
        replayImageId: src.replayImageId,
      });
    }
  });
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [pageData?.id, globalFragments]);

useEffect(() => {
  const raw = (pageData as any)?.fragmentRecall;
  const recalls = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  const recallIds = recalls.map(r => r?.id).filter(Boolean);

  const missingInFragments = recallIds.filter(id => !(fragments?.[id]?.text));
  const availableInFragments = recallIds.filter(id => !!(fragments?.[id]?.text));

  const globalKeys = (globalFragments && typeof globalFragments === "object")
    ? Object.keys(globalFragments).slice(0, 50) : [];

  console.groupCollapsed("[RECALL DIAG]", pageData?.id);
  console.log("fragmentRecall (raw):", raw);
  console.log("recallIds:", recallIds);
  console.log("unlockedFragments:", unlockedFragments);
  console.log("fragments(keys):", Object.keys(fragments || {}));
  console.log("globalFragments(keys top50):", globalKeys);
  console.log("availableInFragments:", availableInFragments);
  console.log("missingInFragments:", missingInFragments);

  if (recallIds.length && missingInFragments.length) {
    // magyarázat, miért hiányozhat:
    console.warn(
      "[RECALL ROOT-CAUSE] A keresett recall ID(k) nincsenek a fragments store-ban. " +
      "Ez akkor fordul elő, ha az adott ID unlock-olva lett, " +
      "de a szöveget (text) nem töltöttük át addFragment()-tel a global bankból. " +
      "Tipikus eset: unlockFragments oldal-szintű effekt, ami csak tag-et ad a set-be, " +
      "de nem tölti be a textet."
    );
  }
  console.groupEnd();
}, [pageData?.id, pageData?.fragmentRecall, fragments, globalFragments, unlockedFragments]);

  // ⬇️ Ha NINCS mit renderelni (sem base, sem fragment), ne várjunk TypingText-re → mutasd a Next-et
  useEffect(() => {
    if (!pageData?.id) return;
  }, [pageData?.id, pageData?.choices, registerTimeout]);
// Side preload (voice + SFX + narráció) – **PATH NORMALIZÁLÁSSAL**
useEffect(() => {
  if (!globals?.storySrc) return;
  if (!pageData?.audio?.sidePreloadPages?.length) return;

  const voiceApiKey = localStorage.getItem("voiceApiKey") || "";
  const controllers: AbortController[] = [];

  // narrációs útvonal normalizáló (single/playlist/BGM)
  const normalizeNarrUrl = (raw?: string): string | null => {
    const s = String(raw ?? "").trim();
    if (!s) return null;
    if (/^https?:\/\//i.test(s) || s.startsWith("/")) return s;
    if (s.startsWith("assets/")) return "/" + s.replace(/^assets\//, "assets/");
    if (s.startsWith("audio/")) return `/assets/${s}`;
    return `/assets/audio/${s}`;
  };

  (pageData.audio.sidePreloadPages as string[]).forEach((pid: string) => {
    const ac = new AbortController();
    controllers.push(ac);
    registerAbort(ac);

    // ⬅️ fontos: add src param!
    fetch(
      `http://127.0.0.1:8000/page/${pid}?src=${encodeURIComponent(globals.storySrc!)}`,
      { signal: ac.signal }
    )
      .then((res) => res.json())
      .then((data) => {
        // Voice előtöltés (ha van)
        if (data?.voicePrompt) {
          const ac2 = new AbortController();
          controllers.push(ac2);
          registerAbort(ac2);

          fetch("http://127.0.0.1:8000/voice", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              pageId: pid,
              promptOverride: data.voicePrompt.prompt,
              voice: data.voicePrompt.voice,
              style: data.voicePrompt.style,
              format: "mp3",
              reuseExisting: true,
              apiKey: voiceApiKey || undefined,
            }),
            signal: ac2.signal,
          })
            .then((res) => res.json())
            .then((json) => {
              if (json?.url) {
                const fullUrl = json.url.startsWith("http")
                  ? json.url
                  : `http://127.0.0.1:8000${json.url}`;
                try { preloadAudio(fullUrl); } catch {}
              }
            })
            .catch(() => {});
        }

        // SFX előtöltés – **robosztus útvonal**
        if (Array.isArray(data?.sfx)) {
          data.sfx.forEach((s: any) => {
            const url = normalizeSfxUrl(s?.file);
            if (!url) return;
            try { preloadAudio(url); } catch {}
          });
        }

        // ⬇️ fő narráció (single mód)
        if (data?.audio?.mainNarration) {
          const url = normalizeNarrUrl(data.audio.mainNarration);
          if (url) { try { preloadAudio(url); } catch {} }
        }

        // ⬇️ narrációs playlista
        if (Array.isArray(data?.audio?.playlist)) {
          data.audio.playlist.forEach((it: any) => {
            const src = it?.src ?? it?.path ?? it?.narration ?? it?.file;
            const url = normalizeNarrUrl(src);
            if (!url) return;
            try { preloadAudio(url); } catch {}
          });
        }

        // (opcionális) BGM
        if (data?.audio?.background) {
          const url = normalizeNarrUrl(data.audio.background);
          if (url) { try { preloadAudio(url); } catch {} }
        }
      })
      .catch((err) => {
        if (err?.name !== "AbortError") {
          console.error(`Side preload error for ${pid}`, err);
        }
      });
  });

  return () => {
    controllers.forEach((c) => {
      try { c.abort(); } catch {}
    });
  };
}, [globals?.storySrc, pageData?.audio?.sidePreloadPages, registerAbort]);


  // preloadNextPages képek
  useEffect(() => {
      // ⛔ Guard
  if (!globals?.storySrc) return;
    const ids = pageData?.imageTiming?.preloadNextPages;
    if (!ids?.length) return;



    const controllers: AbortController[] = [];

    ids.forEach(async (nextId: string) => {
      const ac = new AbortController();
      controllers.push(ac);
      registerAbort(ac);

      try {
        const res = await fetch(
        `http://127.0.0.1:8000/page/${nextId}?src=${encodeURIComponent(globals.storySrc!)}`,
        { signal: ac.signal }
      );
        if (!res.ok) throw new Error(await res.text());
        const nextPageData = await res.json();

        if (nextPageData?.imagePrompt) {
          await preloadImage(
            nextPageData.id,
            nextPageData.imagePrompt,
            nextPageData.imageParams || {},
            nextPageData.styleProfile || {},
            "draft"
          );
        }
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          console.error(`Preload fetch error for ${nextId}`, err);
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
  }, [globals?.storySrc, pageData?.imageTiming?.preloadNextPages, registerAbort]);

  useEffect(() => {
    if (showChoices) {
      const id = window.setTimeout(() => setAnimateNext(true), 20);
      registerTimeout(id);
      return () => clearTimeout(id);
    }
  }, [showChoices, registerTimeout]);


  // ---- DERIVED HOOKOK (feltétel nélkül!) ----
  const choices = useMemo(() => pageData?.choices ?? [], [pageData?.choices]);
  const hasChoices = choices.length > 0;


// ⬇️ END oldal jelző (egységes végpont)
// A story JSON-ban: { "id": "end", "type": "end", ... }
const isEndNode = useMemo(() => pageData?.type === "end", [pageData?.type]);

// --- END CTA context ---
const endCtaContext: CtaContext = useMemo(() => ({
  campaignId: derivedStoryId || "unknown_campaign",
  nodeId: pageData?.id || currentPageId || "unknown_node",
  sessionId: derivedSessionId || undefined,
  lang: (globals as any)?.lang ?? undefined,
  abVariant: (globals as any)?.abVariant ?? null,
  path: typeof window !== "undefined" ? window.location.pathname : undefined,
}), [derivedStoryId, pageData?.id, currentPageId, derivedSessionId, (globals as any)?.lang, (globals as any)?.abVariant]);

// --- Node → Campaign → Engine default sorrend ---
const nodeEndMeta = useMemo(() => {
  const em = (pageData as any)?.endMeta;
  if (em) return em;
  const legacy = (pageData as any)?.endCta ?? (pageData as any)?.cta;
  return legacy ? { cta: legacy } : undefined;
}, [pageData]);

const campaignCfg: CampaignConfig | undefined = useMemo(() => {
  const g: any = globals || {};

  // 🔎 1) Meta kandidátok – sok helyen megpróbáljuk megtalálni
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

  // 🔎 2) Először olyan meta kell, ahol van ctaPresets; ha nincs, akkor bármelyik meta jó
  const metaWithPresets = metaCandidates.find(m => m?.ctaPresets);
  const metaFromSources = metaWithPresets ?? metaCandidates[0] ?? null;

  // 🔁 3) Ha találtunk értelmezhető meta-t, írjuk vissza a globálba is (stabilizálás)
  if (metaFromSources && !g.meta) {
    try {
      (globals as any).meta = metaFromSources;
    } catch {}
  }

  // 🧩 4) Presetek és default kulcs több lehetséges helyről
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

  // 🏷️ 5) Campaign ID fallback lánc
  const campaignId =
    metaFromSources?.campaignId ??
    g.campaignId ??
    g.story?.campaignId ??
    derivedStoryId ??
    "unknown_campaign";

  // 🧯 6) Ha semmi releváns nincs, ne adjunk vissza üres configot
  if (!campaignId && !presets && !endDefaultCta) return undefined;

  // (Opcionális diagnosztika)
  if (!presets) {
    console.warn("[CTA] No ctaPresets found in any meta source. Falling back to engine default.");
  }

  return { campaignId, ctaPresets: presets, endDefaultCta };
}, [pageData, globals, derivedStoryId]);



const engineDefaultEndCta = useMemo(() => (
  { kind: "restart", label: "Play again" } as const
), []);


const resolvedEndCta = useMemo(
  () => resolveCta(nodeEndMeta, campaignCfg, engineDefaultEndCta, endCtaContext),
  [nodeEndMeta, campaignCfg, engineDefaultEndCta, endCtaContext]
);

console.log("nodeEndMeta =", nodeEndMeta);
console.log("campaignCfg =", campaignCfg);
console.log("resolvedEndCta =", resolvedEndCta);


/** ⬇️ ÚJ: többes fragmentRecall támogatás – visszatér: string[] (safe) */
const recallTexts: string[] = useMemo(() => {
  const raw = (pageData as any)?.fragmentRecall;
  const toArr = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  const getTxt = (id?: string, fb?: string) => {
    if (!id) return fb || "";
    const tLocal = fragments?.[id]?.text?.trim();
    if (tLocal) return tLocal;
    const tGlobal = (globalFragments as any)?.[id]?.text?.trim();
    if (tGlobal) return tGlobal;
    return fb || "";  };
 return toArr
    .map((r: any) => getTxt(r?.id, r?.textFallback))
    .filter((s: string) => !!s);
}, [pageData?.fragmentRecall, fragments, globalFragments]);
const recallBlocks = useMemo(
  () => recallTexts.flatMap(explodeTextToBlocks),
  [recallTexts]
);

// új:
const unlockedPlus = useMemo(
  () => new Set<string>([...unlockedFragments, ...Array.from(flags ?? new Set<string>())]),
  [unlockedFragments, flags]
);

const composed = useMemo(
  () => composeBlocks(pageData, unlockedPlus, fragments, globalFragments),
  [pageData, unlockedPlus, fragments, globalFragments]
);

/** ⬇️ VÉGEREDMÉNY: HYBRID */
const blocks = useMemo(
 () => [...recallBlocks, ...composed],
  [recallBlocks, composed]
);

// ---- Puzzle-oldal jelzők ----
const isRiddlePage = useMemo(() => isRiddle(pageData), [pageData]);
const isRunesPage  = useMemo(() => isRunes(pageData),  [pageData]);

const riddleCorrectLabel = useMemo(() => {
  // 1) page mezők (ha ilyet adsz a JSON-ban)
  const fromPage = (pageData as any)?.correctLabel || (pageData as any)?.riddle?.correctLabel;
  if (fromPage) return String(fromPage);

  // 2) globál (ha később ide rakod, míg nincs token-lib)
  const fromGlobals = (globals as any)?.riddleCorrectLabel || (globals as any)?.quiz?.labels?.correct;
  if (fromGlobals) return String(fromGlobals);

  // 3) alap
  return "Helyes!";
}, [pageData, globals]);

// ⬇️ Feltételes next feloldása (pageData.next lehet string vagy NextSwitch)
const resolvedNext = useMemo(() => {
  return (
    resolveNextFromPage(pageData as any, globals) ||
    (typeof pageData?.next === "string" ? pageData.next : null)
  );
}, [pageData, globals]);

// --- META (title, logo) forrás: pageData.meta -> globals.meta -> globals.campaign.meta
const meta = useMemo(() => {
  const m =
    (pageData as any)?.meta ??
    (globals as any)?.meta ??
    (globals as any)?.campaign?.meta ??
    null;
  return m;
}, [pageData, globals]);

// --- TITLE priorizálás: meta.title -> globals.storyTitle -> pageData.title -> derivedStoryId
const titleText = useMemo(() => {
  return (
    meta?.title ??
    (globals as any)?.storyTitle ??
    (pageData as any)?.title ??
    derivedStoryId
  );
}, [meta?.title, (globals as any)?.storyTitle, (pageData as any)?.title, derivedStoryId]);

// --- LOGO priorizálás: meta.logo -> globals.logo -> fallback
const logoUrl = useMemo(() => {
  const raw = (meta?.logo as string | undefined) ?? ((globals as any)?.logo as string | undefined) ?? null;
  const url = normalizeAssetUrl(raw);
  if (!url) {
    // opcionális: fejlesztői figyelmeztetés
    if (process.env.NODE_ENV !== "production") {
      console.warn("No logo in meta/globals; using default_logo.png");
    }
  }
  return url ?? "/assets/default_logo.png";
}, [meta?.logo, (globals as any)?.logo]);


useEffect(() => {
  try {
    console.groupCollapsed("[SETS DIAG]", pageData?.id);
    console.log("fragments", [...unlockedFragments]);
    console.log("flags", [...(flags ?? new Set<string>())]);
    console.log("unlockedPlus", [...unlockedPlus]);
    console.groupEnd();
  } catch {}
}, [pageData?.id, unlockedFragments, flags, unlockedPlus]);



// 🔎 Debug: PG4 állapot
useEffect(() => {
  if (pageData?.id === "ch1_pg4") {
    const textType = Array.isArray(pageData?.text) ? "array" : typeof pageData?.text;
    const globalKeys = pageData?.fragmentsGlobal ? Object.keys(pageData.fragmentsGlobal).slice(0, 20) : [];
    const localKeys = fragments ? Object.keys(fragments).slice(0, 20) : [];
    console.log("[PG4 DEBUG]", {
      textType,
      unlockedFragments,
      blocksLen: blocks.length,
      blocks,
      globalFragKeysTop20: globalKeys,
      localFragKeysTop20: localKeys,
      rawTextArray: Array.isArray(pageData?.text) ? pageData.text : null,
    });
  }
}, [pageData?.id, pageData?.text, unlockedFragments, fragments]);

// 🔎 Extra debug PG4 unlock állapot
useEffect(() => {
  if (pageData?.id !== "ch1_pg4") return;
  const hasOrigin = unlockedFragments.includes("tower_origin_fragment_ch1");
  const hasSelf   = unlockedFragments.includes("tower_self_fragment_ch1");
  console.log("[PG4 CHECK] hasOrigin:", hasOrigin, "| hasSelf:", hasSelf);
  console.log("[PG4 CHECK] unlockedFragments JSON:", JSON.stringify(unlockedFragments));
}, [pageData?.id, unlockedFragments]);

// 🔎 Mit rakott össze végül? (blocks tartalom soronként)
useEffect(() => {
  if (pageData?.id !== "ch1_pg4") return;
  console.log("[PG4 BLOCKS]", blocks.length, "lines");
  blocks.forEach((b, i) => console.log(`[#${i}]`, b));
}, [pageData?.id, blocks]);

/** ⬇️ Ha végül nincs mit írni (nincs base/recall és nem tudtunk fragmentet beemelni), engedjük a továbbot */
useEffect(() => {
  if (!pageData?.id) return;
  if (blocks.length === 0) {
    const id = window.setTimeout(() => {
      setSkipAvailable(true);
      setShowChoices(true);
    }, 200);
    registerTimeout(id);
    return () => clearTimeout(id);
  }
}, [pageData?.id, blocks.length, hasChoices, registerTimeout]);

// stabilizált props-ok a GeneratedImage-hez
const stableParams = useMemo(
  () => pageData?.imageParams || {},
  [pageData?.imageParams]
);
const stableImageTiming = useMemo(
  () => pageData?.imageTiming || {},
  [pageData?.imageTiming]
);

// ⬇️ ÚJ: KÉPKERET állandó renderelés – még ha nincs generálás se
const shouldGenerate = useMemo(
  () => Boolean(pageData?.imageTiming?.generate && pageData?.imagePrompt),
  [pageData?.imageTiming?.generate, pageData?.imagePrompt]
);
const showFrame = useMemo(() => {
  const forcePages = pageData?.id === "ch4_pg1" || pageData?.id === "ch1_pg1";
  const hasImageBox = !!(pageData as any)?.layout?.imageBox;
  return forcePages || hasImageBox || shouldGenerate;
}, [pageData?.id, (pageData as any)?.layout?.imageBox, shouldGenerate]);

// ⬇️ adapter: a hook (cb, ms) formát vár, nálad registerTimeout csak ID-t regisztrál
const scheduleTimeout = useCallback(
  (cb: () => void, ms: number) => {
    const id = window.setTimeout(cb, ms);
    registerTimeout(id);
    return id;
  },
  [registerTimeout]
);

// ⬇️ SFX ütemezés T0-hoz (ms) rögzítve
useSfxScheduler({
  pageId: pageData?.id || "unknown",
  sfx: Array.isArray(pageData?.sfx) ? pageData!.sfx : undefined,
  t0: narrationT0,
  registerTimeout: scheduleTimeout,
});

// ⬇️ Dev-sor szöveg frissítése (csak dev)
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
    const imgStr = img ? `${img.hit ? "HIT" : "MISS"} ${img.ms}ms` : "—";
    const audStr = aud ? `${aud.hit ? "HIT" : "MISS"} ${aud.ms}ms` : "—";
    setDevText(`Cache: Image ${imgStr} | Voice ${audStr}`);
  }, 500);
  return () => clearInterval(intervalId);
}, []);

const handleRiddleAnswer = useCallback((choiceIdx: number) => {
  const p = pageData as any as PuzzleRiddle;
  const isCorrect = choiceIdx === p.correctIndex;

  // 1) score → kézzel számoljuk (nem a {{ }} template-re hagyatkozunk)
  const prevRaw = (globals as any)?.score;
  const prevScore =
    typeof prevRaw === "number" ? prevRaw :
    Number.parseInt(String(prevRaw ?? "0"), 10) || 0;
  const nextScore = prevScore + (isCorrect ? 1 : 0);

  // 2) írd be a motor globáljaiba is, hogy a switch("score") lássa
  flushSync(() => {
    setGlobal("__isCorrect", isCorrect ? "true" : "false");
    setGlobal("score", String(nextScore));
  });

  // 3) opcionális: setFlags (ha van)
  const setFlags = p.onAnswer?.setFlags;
  if (Array.isArray(setFlags)) setFlags.forEach((f) => setFlag(f));
  else if (setFlags && typeof setFlags === "object") {
    Object.entries(setFlags).forEach(([k, v]) => v && setFlag(k));
  }

  // 4) következő oldal feloldása – add át a contextet __isCorrect + score
  const next =
    typeof p.onAnswer?.nextSwitch === "string"
      ? p.onAnswer.nextSwitch
      : resolveNextFromPage(
          { next: p.onAnswer?.nextSwitch ?? { switch: "__isCorrect", cases: { true: null, false: null } } } as any,
          { __isCorrect: isCorrect ? "true" : "false", score: String(nextScore) }
        );

  if (next && next !== pageData?.id) {
    try { localStorage.setItem("currentPageId", String(next)); } catch {}
    goToNextPage(String(next));
  }
}, [pageData, globals, setGlobal, setFlag, goToNextPage]);


// ⬇️ VÁLASZTÁS KEZELŐ – race fix-szel
const handleChoice = useCallback(
  (next: string, reward?: any, choiceObj?: Choice) => {
     try {
      const pageId = pageData?.id || currentPageId || "unknown";
      const label = (choiceObj as any)?.text ?? (choiceObj as any)?.label ?? choiceObj?.id ?? "unknown";
      const latencyMs = typeof enterTsRef.current === "number" ? Date.now() - enterTsRef.current : undefined;
     if (derivedStoryId && derivedSessionId && pageId && choiceObj?.id) {
  // 1) choice esemény – csak a támogatott 4–5 paraméter
  trackChoice(
    derivedStoryId, derivedSessionId,
    pageId,
    String(choiceObj.id),
    String(label)
  );

  // 2) opcionális kiegészítő meta külön eseményként
  if (typeof latencyMs === "number" && latencyMs >= 0) {
    trackUiClick(
      derivedStoryId, derivedSessionId,
      pageId,
      `choice:${String(choiceObj.id)}`,
      {
        label: String(label),
        latencyMs,
        nextPageId: next || undefined,
      }
    );
  }
}


   } catch {}
    console.log("[CHOICE]", {
      next,
      reward,
      choiceObj,
      fragmentId: choiceObj?.fragmentId,
    });

     // 🔑 ÚJ: reward.setGlobal támogatás
    if (reward?.setGlobal && typeof reward.setGlobal === "object") {
      flushSync(() => {
        Object.entries(reward.setGlobal).forEach(([k, v]) => {
          setGlobal(k, String(v));
        });
      });
    }


    // 1) Reward-unlocks (új JSON)
    let unlocks: string[] = [];
    if (Array.isArray(reward?.unlocks)) {
      unlocks = reward.unlocks.filter(Boolean);
    } else if (typeof reward?.unlocks === "string") {
      unlocks = [reward.unlocks];
    }

const rewardLocks = normalizeIdList(reward?.locks);

    // 3) ÚJ: reward.unlockFragments
    let rewardExtra: string[] = [];
    if (Array.isArray(reward?.unlockFragments)) {
      rewardExtra = reward.unlockFragments.filter(Boolean);
    }

// 3/b) saveFragment(s) – már benne van nálad; opcionális auto-unlock CSAK nem-flagre
const toSave: string[] = [];
if (typeof reward?.saveFragment === "string") toSave.push(reward.saveFragment);
if (Array.isArray(reward?.saveFragments)) toSave.push(...reward.saveFragments);

const savedAndFound: string[] = [];
if (toSave.length) {
  toSave.forEach((id) => {
    const src =
      (globalFragments as any)?.[id] ||
      (pageData as any)?.fragmentsGlobal?.[id] ||
      (pageData as any)?.fragments?.[id] ||
      (fragments as any)?.[id];
    if (src && (src.text || src.replayImageId)) {
      addFragment(id, { text: src.text, replayImageId: src.replayImageId });
      savedAndFound.push(id);
    }
  });
}
// ha azt akarod, hogy a köv. oldalon azonnal teljesüljön az ifUnlocked, ezt kapcsold true-ra
const autoUnlockSaved = false;
if (autoUnlockSaved && savedAndFound.length) {
  rewardExtra = [...rewardExtra, ...savedAndFound.filter((id) => !isFlagId(id))];
}


  // 4) ÚJ: choice.actions.unlockFragment
let actionExtra: string[] = [];
let actionFlags: string[] = [...rewardLocks];
if (Array.isArray(choiceObj?.actions)) {
  choiceObj!.actions.forEach((a: any) => {
    if (a?.unlockFragment) actionExtra.push(a.unlockFragment);
     // új forma: { type: "unlockFragment", id: "..." }
    if (a?.type === "unlockFragment" && a?.id) actionExtra.push(a.id);

    if (a?.type === "setFlag" && a?.id) actionFlags.push(a.id);

    // opcionális: rune-kezelés egységesítéshez kezeld flagként vagy külön state-ben
    if (a?.type === "unlockRune" && a?.id) actionFlags.push(a.id);
  });
}

    // 5) Choice-szintű fragmentId
    let choiceFragId: string | undefined = choiceObj?.fragmentId;
    let choiceExtra: string[] = [];
    if (choiceFragId) {
      choiceExtra = [choiceFragId];
    }

    // 6) Merge + dedup minden forrásból
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
    const merged = Array.from(new Set([...unlockedFragments, ...toUnlockFragments]));
    setUnlockedFragments(merged);

    // 🔑 Bank-feltöltés csak a FRAGMENSEKRE
  toUnlockFragments.forEach((id) => {
  const src =
    (globalFragments as any)?.[id] ||
    (pageData as any)?.fragmentsGlobal?.[id] ||
    (pageData as any)?.fragments?.[id] ||
    (fragments as any)?.[id];
  if (src && (src.text || src.replayImageId)) {
    addFragment(id, { text: src.text, replayImageId: src.replayImageId });
  }
});

setShowReward(true);
});
// 🔑 Rune animáció trigger — FLAGS (rune_*) ALAPJÁN, nem fragmenten!
{
  if (actionFlags.length > 0) {
    const uniqueFlags = Array.from(new Set(actionFlags));
    const prevRunes = new Set(
      Array.from(flags ?? new Set<string>()).filter(isRuneId)
    );
    const newRunes = uniqueFlags.filter((f) => isRuneId(f) && !prevRunes.has(f));

    if (DEBUG_RUNES) {
      console.log("[RUNES] new runes", { prevRunes: [...prevRunes], newRunes });
    }

  if (newRunes.length) {
  const first = newRunes.find((rid) => !!RUNE_ICON[rid]);
  if (first) {
    // 🔹 Ha van reward vagy choiceObj → döntésből jön → induljon overlay
    if (reward || choiceObj) {
      if (next && next !== pageData?.id) {
        pendingNextRef.current = next;
      }

      const savedPngUrl: string | undefined =
        reward?.runeImageUrl || reward?.imageUrl || (choiceObj as any)?.runeImageUrl;

      if (runeAnim) {
        setRuneAnim((prev) =>
          prev
            ? {
                ...prev,
                pendingRunes: Array.from(
                  new Set([...(prev.pendingRunes || []), ...newRunes])
                ),
                savedPngUrl: prev.savedPngUrl || savedPngUrl,
              }
            : prev
        );
      } else {
        setRuneAnim({
          src: RUNE_ICON[first]!,
          key: Date.now(),
          pendingRunes: newRunes, // pl. ["rune_ch1", "rune_ch2"]
          savedPngUrl,
        });
      }
    } else {
      // 🔹 Page-enter unlockRunes esetén → csak flag, overlay nélkül
      flushSync(() => {
        newRunes.forEach((rid) => setFlag(rid));
      });
    }
  } else {
    console.warn("[RUNES] missing icon for", newRunes);
  }
}

  }
}



const tid = window.setTimeout(() => setShowReward(false), 2000);
registerTimeout(tid);
}

if (actionFlags.length > 0) {
  const uniqueFlags = Array.from(new Set(actionFlags));
  console.log("[FLAGS APPLY]", { pageId: pageData?.id, uniqueFlags });
  flushSync(() => {
    uniqueFlags.forEach((f) => setFlag(f));
  });
}

// 7) Oldalváltás – CSAK ha nincs animáció miatti pending
if (!pendingNextRef.current && next && next !== pageData?.id) {
  try { localStorage.setItem("currentPageId", next); } catch {}
  goToNextPage(next);
}
},
[
  unlockedFragments,
  setUnlockedFragments,
  pageData?.id,
  goToNextPage,
  registerTimeout,
  setIsMuted,
  addFragment,
  globalFragments,
  setFlag,
  flags,
  derivedStoryId,
  derivedSessionId,
  currentPageId,
]
);



const handleNext = useCallback(() => {
  const resolved =
    resolveNextFromPage(pageData as any, globals) ||
    (typeof pageData?.next === "string" ? pageData.next : null);

  if (resolved && resolved !== pageData?.id) {
    try { localStorage.setItem("currentPageId", resolved); } catch {}
    goToNextPage(resolved);
  }
}, [pageData, pageData?.id, goToNextPage, globals]);

// --- AUDIO (playlist/ducking) derived props ---

const toLinearFromDb = (db?: number) =>
  typeof db === "number" ? Math.pow(10, db / 20) : undefined;

const narrationPlaylistMemo = useMemo(() => {
  const raw = Array.isArray(pageData?.audio?.playlist) ? pageData.audio.playlist : [];
  const passes = (it: any) => {
    const cond = it?.when?.unlocked ?? it?.unlocked ?? it?.ifUnlocked;
    if (!cond) return true;
    if (Array.isArray(cond)) return cond.every((c: any) => unlockedPlus.has(String(c)));
    return unlockedPlus.has(String(cond));
  };
  const pickSrc = (it: any) => it?.src ?? it?.path ?? it?.narration ?? it?.file;

  return raw
    .filter(passes)
    .map((it: any) => ({
      src: pickSrc(it),
      gapAfterMs: typeof it?.gapAfterMs === "number" ? it.gapAfterMs
                : typeof it?.gapMs === "number" ? it.gapMs
                : 0,
      label: it?.label,
    }))
    .filter((it: any) => !!it.src);
}, [pageData?.audio?.playlist, unlockedPlus]);

const playModeMemo = useMemo<"single" | "playlist">(() => {
  const pm = pageData?.audio?.playMode;
  if (pm === "playlist" && narrationPlaylistMemo.length > 0) return "playlist";
  return "single";
}, [pageData?.audio?.playMode, narrationPlaylistMemo.length]);

const duckingMemo = useMemo(() => {
  const d = pageData?.audio?.ducking || {};
  // Támogatott JSON formák: { duckTo } VAGY { db: -9, fadeMs: 1200 } VAGY külön { attackMs, releaseMs }
  const duckTo =
    typeof d.duckTo === "number" ? Math.min(1, Math.max(0, d.duckTo))
    : toLinearFromDb(d.db);
  const attackMs = d.attackMs ?? d.fadeMs;
  const releaseMs = d.releaseMs ?? d.fadeMs;
  return { duckTo, attackMs, releaseMs };
}, [pageData?.audio?.ducking]);



// ---- Replay vizuál kiválasztás ----
const selectedReplay = useMemo(
  () => pickReplayVisual(pageData, unlockedFragments, fragments),
  [pageData, unlockedFragments, fragments]
);

// ⬇️ ÚJ: a dock-hoz a flag-ek közül csak a rune_* kellenek
const unlockedRunes = useMemo(
  () => Array.from(flags ?? new Set<string>()).filter(isRuneId),
  [flags]
);
const showRuneDock = useMemo(
  () => (unlockedRunes?.length ?? 0) > 0,   // vagy később kampány-configból
  [unlockedRunes]
);

// ⬇️ ÚJ: ikonképek előtöltése a némítás gombhoz
useEffect(() => {
  const on = new Image();
  const off = new Image();
  on.src = "/icons/rune_sound_on_128_transparent.png";
  off.src = "/icons/rune_sound_off_128_transparent.png";
}, []);

// ⬇️ Anchor portál mérés naplózás – HOOKS RÉSZ, KORAI RETURNÖK ELŐTT
const anchorPortal = useMemo(() => measure?.content ?? null, [measure]);

useEffect(() => {
  if (!DEBUG_RUNES) return;
  console.log("[RUNES] anchorPortal =", anchorPortal);
}, [anchorPortal]);

// ⛔ Nincs storySrc → barátságos fallback
if (!globals?.storySrc) {
  return (
    <div className={style.storyPage}>
      <DecorBackground />
<div style={{ position: "relative", zIndex: 5, padding: "8vh 4vw", color: "#fff" }}>
        <h2>No story loaded</h2>
        <p>Go back to the landing page and choose a campaign.</p>
        <button onClick={() => (window.location.href = "/")}>Back to landing</button>
      </div>
    </div>
  );
}

// ---- KORAI RETURN CSAK A HOOKOK UTÁN! ----
if (!pageData || !pageData.id) {
  console.warn("[StoryPage] Missing pageData", {
    currentPageId,
    hasPageData: !!pageData,
    globalError,
  });
  return (
    <div className={style.storyPage} data-testid="fallback">
      <LoadingOverlay />
    </div>
  );
}

  // ---- Render előtti diag (nem hook) ----



  console.groupCollapsed(`[StoryPage] Render ${pageData.id}`);
  console.log({ isLoading, isMuted, hasChoices, blocksLen: blocks.length });
  console.groupEnd();

  /* ⬇️ GUARD IDE */
const _mustBeFn = (n: string, v: any) => {
  const t = typeof v;
  if (t !== "function") { console.error(`[BAD] ${n}:`, v); throw new Error(`${n} is ${t}`); }
};
_mustBeFn("BrickBottomOverlay", BrickBottomOverlay);
_mustBeFn("RuneDockDisplay", RuneDockDisplay);
_mustBeFn("NineSlicePanel", NineSlicePanel);
_mustBeFn("GeneratedImage_with_fadein", GeneratedImage_with_fadein);
_mustBeFn("AudioPlayer", AudioPlayer);
_mustBeFn("ChoiceButtons", ChoiceButtons);
_mustBeFn("TransitionVideo", TransitionVideo);
_mustBeFn("FeedbackOverlay", FeedbackOverlay);
_mustBeFn("RestartButton", RestartButton);
_mustBeFn("FragmentReplayOverlay", FragmentReplayOverlay);
_mustBeFn("SmokeField", SmokeField);
/* ⬆️ GUARD VÉGE */

  // ⬇️ Transition/video ág – HÁTTÉRREL
  if (isTransitionVideoPage(pageData)) {
    const t = pageData.transition;
    return (
      <div className={style.storyPage}>
          {analyticsSync}

        <DecorBackground />
{showAnalytics && <AnalyticsReport storyId={derivedStoryId} />}

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
            autoplay={t.autoplay ?? true}
            muted={t.muted ?? true}
            loop={t.loop ?? false}
            fadeInMs={t.fadeInMs ?? 300}
            fadeOutMs={t.fadeOutMs ?? 300}
            skipAfterMs={t.skipAfterMs ?? 1200}
            nextPageId={t.nextPageId}
            duckToVol={t.duckToVol ?? 0.2}
            attackMs={t.attackMs ?? 240}
            releaseMs={t.releaseMs ?? 600}
            preloadNext={t.preloadNext ?? true}
          />
        </div>
      </div>
    );
  }

  /** ------------------------------------------------------------
   *  FALLBACK ÁG (id: "tower_reveal_video") – HÁTTÉRREL
   * ----------------------------------------------------------- */
  if (pageData.id === "tower_reveal_video") {
   const nextAfter =
  resolveNextFromPage(pageData as any, globals) ||
  (typeof (pageData as any)?.next === "string" ? (pageData as any).next : "ch4_pg1") ||
  "ch4_pg1";
    return (
      <div className={style.storyPage}>
          {analyticsSync}
        <div className={style.storyBackground}>
          <DecorBackground preset="subtle" />
        </div>


     {showAnalytics && <AnalyticsReport storyId={derivedStoryId} />}


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
// ---- Normal render with Canvas + grid areas ----
return (
  <div ref={pageRootRef} className={style.storyPage}>
    {analyticsSync}
    {showAnalytics && <AnalyticsReport storyId={derivedStoryId} />}

    {/* háttér külön rétegben */}
   

    {isLoading && <LoadingOverlay />}

<Canvas
  background={<DecorBackground preset="subtle" />}
  /* ===== TOPBAR (fix header szekció) ===== */
 topbar={
  <>
    <HeaderBar
     data-skin="legacy-default"
      variant="transparent"
      elevated
      left={<img src="assets/my_logo.png" alt="Logo" data-logo />}
      center={<span data-header-title>{titleText}</span>}
      right={
        // Desktop: maradhat a Header jobb oldalán
        showRuneDock ? (
          <div className={canvasStyles.showOnlyDesktop}>
            <RuneDockDisplay
              flagIds={unlockedRunes}
              imagesByFlag={imagesByFlag}
              runePack={runePackForDisplay}
              delayMs={0}
            />
          </div>
        ) : null
      }
    />

    {/* Mobil overlay: bal felső sarok, NEM része a Header layoutjának */}
    {showRuneDock && (
       <div
    className={`${canvasStyles.runeDockTopRight} ${canvasStyles.showOnlyMobile} ${
      showRuneDock ? canvasStyles.isVisible : ""
    }`}
  >
        <RuneDockDisplay
          flagIds={unlockedRunes}
          imagesByFlag={imagesByFlag}
          runePack={runePackForDisplay}
          delayMs={0}
        />
      </div>
    )}
  </>
}

  /* ===== PROGRESS sáv a topbar alatt ===== */
  progress={<ProgressStrip value={progressDisplay.value ?? 0} />}

  /* ===== MEDIA-kocka (frame + generated image) ===== */
  media={
    showFrame ? (
      <MediaFrame mode="image">
        <GeneratedImage_with_fadein
          pageId={pageData.id}
          prompt={shouldGenerate ? pageData.imagePrompt : undefined}
          params={stableParams}
          imageTiming={{ ...stableImageTiming, generate: shouldGenerate }}
          mode={pageData.imageTiming?.mode || "draft"}
        />
      </MediaFrame>
    ) : null
  }

  /* ===== NARRÁCIÓS panel ===== */
  narr={
    <div
      className={`${style["textbox-container"]} ${
        expanded ? style.expanded : ""
      }`}
      role="region"
      aria-label="Narration box"
    >
      <NarrativePanel
        lines={blocks}
        skipRequested={skipRequested}
        replayTrigger={replayKey}
        delayMs={DELAY_MS}
        onReady={() => setSkipAvailable(true)}
        onComplete={() => {
          setTypingDone(true);
          setShowChoices(true);
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
        backdrop={
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
        }
      />
    </div>
  }

  /* ===== INTERAKCIÓS DOCK – puzzle/choices ===== */
  dock={
    showChoices &&  !isEndNode ? (
      <>
        {isRiddlePage &&
  (() => {
    const r = pageData as unknown as PuzzleRiddle;
    return (
      <div className={dockStyles.grid}>
        <RiddleQuiz
          page={pageData}   
          question={r.question /* ha inkább a narrációban van a kérdés, hagyd undefined */}
          options={r.options}
          correctIndex={r.correctIndex}

          /* vizuális visszacsatolás – háttér nélküli felirat (egyelőre SCSS-ből) */
          correctLabel={riddleCorrectLabel}
          showCorrectLabel="above"

          /* (elő)hang jelzés – most még opcionális; ha nincs lejátszó, ez kimaradhat */
          onPlaySfx={(id) => {
            try {
              // ha van saját SFX buszod, itt szólítsd meg (pl. sfxBus.play(id))
            } catch {}
          }}

          /* analitika + JSON onAnswer + navigáció: marad StoryPage-ben */
          onResult={({ choiceIdx }) => {
            handleRiddleAnswer(choiceIdx);
          }}
        />
      </div>
    );
  })()}


        {!isRiddlePage &&
          isRunesPage &&
          (() => {
            const p = pageData as any;
            return (
              <PuzzleRunes
  options={p.options}
  answer={p.answer}
  maxAttempts={p.maxAttempts ?? 3}
  mode={p.mode ?? "ordered"}              // ÚJ
  feedback={p.feedback ?? "reset"}
  className={dockStyles.grid}
  buttonClassName={dockStyles.choice}
  /* ⬇️ KÖTELEZŐ ANALYTICS AZONOSÍTÓK */
  storyId={derivedStoryId || "default_story"}
  sessionId={derivedSessionId || "sess_unknown"}
  pageId={pageData.id}
  puzzleId={p.id ?? `runes-${pageData.id}`}
  onResult={(ok) => {
    const branch = ok ? p.onSuccess : p.onFail;
    if (!branch) return;

    const fl = branch.setFlags;
    if (Array.isArray(fl)) {
      fl.forEach((f: string) => setFlag(f));
    } else if (fl && typeof fl === "object") {
      Object.entries(fl).forEach(([k, v]) => v && setFlag(k));
    }

    const nx = branch.goto;
    if (nx && nx !== pageData?.id) {
      try { localStorage.setItem("currentPageId", nx); } catch {}
      goToNextPage(nx);
    }
  }}
/>


            );
          })()}

        {!isRiddlePage &&
          !isRunesPage &&
          Array.isArray(pageData.choices) &&
          pageData.choices.length > 0 && (
            <InteractionDock
              mode="default"
              choices={pageData.choices.map((c: any, idx: number) => ({
                id: String(c?.id ?? idx),
                label: String(
                  c?.text ?? c?.label ?? c?.id ?? `choice_${idx}`
                ),
                disabled: !!c?.disabled,
              }))}
              onSelect={(choiceId: string) => {
                const choice = (pageData.choices ?? []).find(
                  (c: any, i: number) => String(c?.id ?? i) === String(choiceId)
                );
                if (!choice) return;
                handleChoice(
                  String(choice.next ?? ""),
                  (choice as any).reward,
                  choice as any
                );
              }}
            />
          )}
      </>
    ) : null
  }

  /* ===== ACTION BAR – Skip/Replay/Mute/Next ===== */
  action={
    <ActionBar
  canNext={!Array.isArray(pageData.choices) && !!resolvedNext && showChoices && !isEndNode}
  onNext={handleNext}
  canSkip={skipAvailable && !isEndNode}
  onSkip={() => {
    setSkipRequested(true);
    setTimeout(() => setSkipRequested(false), 0);
  }}
  canReplay={!isEndNode}
  onReplay={() => {
    setSkipRequested(false);
    setReplayKey((prev) => prev + 1);
    triggerAudioRestart();
  }}
  muted={!!isMuted}
  onToggleMute={() => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    try { setSfxMuted(newMuted); } catch {}
  }}
/>

  }
/>

    {/* AUDIO és overlayek a Canvas alatt maradnak */}
    <AudioPlayer
      pageId={pageData.id}
      autoPlay
      audioPath={pageData.audio?.background}
      narrationPath={pageData.audio?.mainNarration}
      voicePrompt={pageData.voicePrompt ?? undefined}
      playMode={playModeMemo}
      narrationPlaylist={narrationPlaylistMemo}
      ducking={duckingMemo}
      delayMs={DELAY_MS}
      fadeInMs={FADE_IN_MS}
      volume={1}
      bgmVolume={0.6}
      onNarrationStart={(t0: number) => setNarrationT0(t0)}
    />

    {showReward && (
      <RewardOverlay
        message="Memory unlocked!"
        onComplete={() => setShowReward(false)}
      />
    )}

    {showReplay && selectedReplay.imageId && (
      <FragmentReplayOverlay
        imageSrc={`/assets/generated/${selectedReplay.imageId}.png`}
        durationMs={selectedReplay.durationMs}
        onComplete={() => setShowReplay(false)}
      />
    )}


    {runeAnim && (
      <RuneSaveOverlay
        key={runeAnim.key}
        imageSrc={runeAnim.src}
        startSize={180}
        onComplete={() => {
          if (runeAnim?.pendingRunes?.length) {
            flushSync(() => {
              runeAnim.pendingRunes.forEach((rid) => setFlag(rid));
            });
            try {
              const pageId = pageData?.id || currentPageId || "unknown";
              if (derivedStoryId && derivedSessionId && pageId) {
                runeAnim.pendingRunes.forEach((rid) => {
                  if (!rid) return;
                  trackRuneUnlock(
                    derivedStoryId, derivedSessionId,
                    pageId,
                    rid,
                    { source: "choice", mode: "overlay", hasCustomImage: !!runeAnim.savedPngUrl }
                  );
                });
              }
            } catch {}
          }
          setRuneAnim(null);
          const nx = pendingNextRef.current;
          pendingNextRef.current = null;
          if (nx && nx !== pageData?.id) goToNextPage(nx);
        }}
      />
    )}
    {/* ==== END OLDAL CTA (átmeneti, nem inline stílus) ==== */}
{isEndNode && (
  <div className={style.endCtaOverlay}>
    <div className={style.endCtaCard}>
      <div className={style.endCtaTitle}>Köszönjük, végigjátszottad a kampányt!</div>
      <div className={style.endCtaActions}>
        <CampaignCta cta={resolvedEndCta} context={endCtaContext} />
      </div>
    </div>
  </div>
)}

  </div>
);
}
export default StoryPage