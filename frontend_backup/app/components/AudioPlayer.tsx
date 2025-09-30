"use client";
import React, { useEffect, useRef, useState, useMemo } from "react";
import { useGameState } from "../lib/GameStateContext";
import { useVoice } from "../lib/useVoice";
import { getAudioFromCache } from "../lib/audioCache";
import { audioDucking } from "../lib/audioDucking";
import { trackMediaStart, trackMediaStop } from "../lib/analytics";

interface SfxItem { file: string; time: number; }
interface VoicePrompt { prompt: string; voice?: string; style?: string; }
type NarrationItem = { src: string; gapAfterMs?: number; label?: string };

interface Props {
  pageId?: string;
  audioPath?: string;        // háttérzene (BGM)
  sfx?: SfxItem[];           // realtime effektek
  autoPlay?: boolean;
  voicePrompt?: VoicePrompt | null; // null engedélyezve
  narrationPath?: string;    // előre felvett narráció (single mód)
  delayMs?: number;
  fadeInMs?: number;
  volume?: number;           // globális (voice + sfx)
  bgmVolume?: number;        // csak BGM alap hangerő / ducking visszatérés
  onNarrationStart?: (t0: number) => void;

  /** ÚJ – playlist-alapú narráció */
  playMode?: "single" | "playlist";
  narrationPlaylist?: NarrationItem[];
  /** ÚJ – per-oldal ducking paraméterek (abszolút célhangerő + attack/release) */
  ducking?: { duckTo?: number; attackMs?: number; releaseMs?: number };
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
const setVolumeSafe = (el: HTMLMediaElement, v: number) => { el.volume = clamp01(v); };

// VOICE/SFX-hez használható. BGM-hez NEM.
const fadeVolume = (el: HTMLAudioElement, target: number, ms: number) => {
  if (!el) return;
  const start = el.volume;
  const steps = Math.max(1, Math.round(ms / 50));
  const step = (target - start) / steps;
  let current = start;
  const id = window.setInterval(() => {
    current += step;
    setVolumeSafe(el, current);
    if ((step > 0 && current >= target) || (step < 0 && current <= target)) {
      setVolumeSafe(el, target);
      clearInterval(id);
    }
  }, 50);
};

// csupasz fájlnév → /assets/audio/… (+ védés: "assets/..." → "/assets/...")
const normalizeAudioSrc = (p?: string) => {
  if (!p) return "";
  p = p.replace(/^assets\//, "/assets/");
  if (p.startsWith("http://") || p.startsWith("https://") || p.startsWith("/")) return p;
  if (p.startsWith("sfx/")) return `/assets/${p}`;
  return `/assets/audio/${p}`;
};

// várjunk lejátszhatóságra
const waitForCanPlay = (
  el: HTMLMediaElement,
  events = ["canplaythrough", "canplay", "loadeddata"]
) =>
  new Promise<void>((resolve, reject) => {
    let done = false;
    const onOk = () => { if (!done) { done = true; cleanup(); resolve(); } };
    const onErr = (e: any) => { if (!done) { done = true; cleanup(); reject(e); } };
    const cleanup = () => {
      events.forEach(ev => el.removeEventListener(ev, onOk));
      el.removeEventListener("error", onErr);
      el.removeEventListener("abort", onErr);
    };
    events.forEach(ev => el.addEventListener(ev, onOk, { once: true }));
    el.addEventListener("error", onErr, { once: true });
    el.addEventListener("abort", onErr, { once: true });
  });

// ===== DEBUG kapcsolók =====
const DEBUG_FORCE_NATIVE = false;
// ===== Hangerő konstansok =====
const SAFETY_BASE = 0.10;     // csak NATÍV boot alatt!
const NARR_DUCK_TO = 0.02;
// ==============================

// ===== BGM SINGLETON =====
type GlobalBgm = {
  el: HTMLAudioElement | null;
  srcUrl: string;
  ctx: AudioContext | null;
  gain: GainNode | null;
  connected: boolean;
};
const __globalBGM: GlobalBgm = (globalThis as any).__qzeraGlobalBGM || {
  el: null, srcUrl: "", ctx: null, gain: null, connected: false
};
(globalThis as any).__qzeraGlobalBGM = __globalBGM;
// ==========================================

const AudioPlayer: React.FC<Props> = ({
  pageId = "",
  audioPath = "",
  sfx = [],
  autoPlay = true,
  voicePrompt = null,
  narrationPath,
  delayMs = 2000,
  fadeInMs = 500,
  volume = 0.8,
  bgmVolume, // ⬅️ ÚJ
  onNarrationStart,

  // ÚJ playlist/ducking propok
  playMode = "single",
  narrationPlaylist,
  ducking,
}) => {
  const bgAudioRef = useRef<HTMLAudioElement>(null);
  const voiceAudioRef = useRef<HTMLAudioElement>(null);
  const sfxTimersRef = useRef<number[]>([]);
  const sfxActiveRef = useRef<HTMLAudioElement[]>([]);
  const startTimerRef = useRef<number | null>(null);
  const t0FiredRef = useRef<boolean>(false);

  // WebAudio a háttérzenéhez
  const ctxRef = useRef<AudioContext | null>(null);
  const bgGainRef = useRef<GainNode | null>(null);
  const bgSrcRef = useRef<MediaElementAudioSourceNode | null>(null);
  const bgNodeConnectedRef = useRef<boolean>(false);

  // Ducking id-k
  const narrationDuckIdRef = useRef<string | null>(null);
  const sfxDuckIdsRef = useRef<Set<string>>(new Set());

  // reentrancy guard
  const startRunRef = useRef(0);
  const bootingRef = useRef<boolean>(false);
  const dbgIntervalRef = useRef<number | null>(null);

  // playlist futás-azonosító + első t0
  const playlistRunIdRef = useRef(0);
  const firstT0Ref = useRef<number | null>(null);

  // utolsó BGM forrás
  const bgSrcUrlRef = useRef<string>("");

  // 🔎 ANALITIKA – kontextus
  const { storyId, sessionId, currentPageId, registerAudio, registerTimeout, isMuted, audioRestartToken } =
    useGameState() as any;
  const pageForAnalytics = useMemo(() => currentPageId || pageId || "unknown", [currentPageId, pageId]);

  // 🔎 ANALITIKA – duplikációt kerülő start/stop segédek
  const currentBgmIdRef = useRef<string | null>(null);
  const currentVoiceIdRef = useRef<string | null>(null);
  const activeSfxIdsRef = useRef<Set<string>>(new Set());

  const safeStart = (kind: "bgm" | "voice" | "sfx", mediaId: string) => {
    if (!storyId || !sessionId || !pageForAnalytics) return;
    try { trackMediaStart(storyId, sessionId, pageForAnalytics, mediaId, kind); } catch {}
  };
  const safeStop = (kind: "bgm" | "voice" | "sfx", mediaId: string) => {
    if (!storyId || !sessionId || !pageForAnalytics) return;
    try { trackMediaStop(storyId, sessionId, pageForAnalytics, mediaId, kind); } catch {}
  };

  const { generateVoice } = useVoice();

  const [narrationSource, setNarrationSource] = useState<string>("(none)");
  const [autoplayFailed, setAutoplayFailed] = useState(false);

  /** 🔧 Egységes „effektív” BGM-alapszint minden módban. */
  const getEffectiveBase = () => {
    const base = clamp01(bgmVolume ?? volume);
    const safety = bgNodeConnectedRef.current ? 1 : SAFETY_BASE; // natívban limitált, WebAudio-ban 1
    return (isMuted ? 0 : base * safety);
  };

  // natív safety keverés frissítése (csak NEM WebAudio módban!)
  const updateNativeSafety = (mult = 1) => {
    const el = bgAudioRef.current;
    if (!el) return;
    if (bgNodeConnectedRef.current) {
      // WebAudio bekötve → natív hangerő mindig 1.0
      el.muted = !!isMuted;
      el.volume = isMuted ? 0 : 1.0;
    } else {
      // natív fázisban effektív alapot használunk
      el.muted = !!isMuted;
      el.volume = clamp01(getEffectiveBase() * mult);
    }
  };

  // ===== Singleton adoptálás mountkor =====
  useEffect(() => {
    if (__globalBGM.el) {
      bgAudioRef.current = __globalBGM.el;
      bgSrcUrlRef.current = __globalBGM.srcUrl;
      ctxRef.current = __globalBGM.ctx;
      bgGainRef.current = __globalBGM.gain;
      bgNodeConnectedRef.current = __globalBGM.connected;

      registerAudio(__globalBGM.el);
      // Ha már szólt korábban, jelöljük START-ot erre az oldalra is (page-scope analytics)
      if (bgSrcUrlRef.current) {
        const id = `bgm:${bgSrcUrlRef.current}`;
        currentBgmIdRef.current = id;
        safeStart("bgm", id);
      }
    }
    if (voiceAudioRef.current) registerAudio(voiceAudioRef.current);

    return () => {
      if (dbgIntervalRef.current) clearInterval(dbgIntervalRef.current);
      // BGM globálisan él tovább – itt nem STOP-oljuk szándékosan
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // WebAudio wake-up (user gesture után)
  useEffect(() => {
    const wake = async () => {
      if (ctxRef.current && ctxRef.current.state !== "running") {
        try { await ctxRef.current.resume(); } catch {}
      }
      const el = bgAudioRef.current;
      if (el && el.paused) {
        try { await el.play(); } catch {}
      }
    };
    window.addEventListener("pointerdown", wake, { once: true });
    window.addEventListener("keydown", wake, { once: true });
    return () => {
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
    };
  }, []);

  // MUTE kezelés
  useEffect(() => {
    const bgEl = bgAudioRef.current;
    const voiceEl = voiceAudioRef.current;

    if (bgEl) {
      if (bgNodeConnectedRef.current) {
        bgEl.muted = !!isMuted;
        bgEl.volume = isMuted ? 0 : 1.0; // WebAudio használatakor natív 1.0
      } else {
        if (!bootingRef.current) {
          bgEl.muted = !!isMuted;
        }
      }
    }
    if (voiceEl) voiceEl.muted = isMuted;
    sfxActiveRef.current.forEach(a => { a.muted = isMuted; });

    audioDucking.setBaseVolume(getEffectiveBase());
    if (!isMuted) updateNativeSafety(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMuted, volume, bgmVolume]);

  // csak narráció és SFX leállítás
  const stopNarrationAndSfx = () => {
    // abortáld az aktuális playlist-futást
    playlistRunIdRef.current++;

    if (voiceAudioRef.current) {
      try {
        // ANALITIKA – voice STOP
        if (currentVoiceIdRef.current) {
          safeStop("voice", currentVoiceIdRef.current);
          currentVoiceIdRef.current = null;
        }
        voiceAudioRef.current.pause();
        voiceAudioRef.current.currentTime = 0;
      } catch {}
    }
    sfxTimersRef.current.forEach(id => clearTimeout(id));
    sfxTimersRef.current = [];
    sfxActiveRef.current.forEach(a => {
      try {
        const id = a.dataset.__id;
        if (id && activeSfxIdsRef.current.has(id)) {
          safeStop("sfx", id);
          activeSfxIdsRef.current.delete(id);
        }
        a.pause(); a.currentTime = 0;
      } catch {}
    });
    sfxActiveRef.current = [];
    t0FiredRef.current = false;
    firstT0Ref.current = null;

    if (narrationDuckIdRef.current) {
      audioDucking.endDuck(narrationDuckIdRef.current);
      narrationDuckIdRef.current = null;
    }
    sfxDuckIdsRef.current.forEach(id => audioDucking.endDuck(id));
    sfxDuckIdsRef.current.clear();

    updateNativeSafety(1);
  };

  // BGM indítás / upgrade
  const startBackgroundMusic = async () => {
    // adopt globális elem
    if (__globalBGM.el && bgAudioRef.current !== __globalBGM.el) {
      bgAudioRef.current = __globalBGM.el;
      bgSrcUrlRef.current = __globalBGM.srcUrl;
      ctxRef.current = __globalBGM.ctx;
      bgGainRef.current = __globalBGM.gain;
      bgNodeConnectedRef.current = __globalBGM.connected;
    }

    // ha nincs még <audio>, hozzunk létre EGY globális példányt
    if (!bgAudioRef.current) {
      const created = document.createElement("audio");
      created.preload = "auto";
      created.loop = true;
      created.setAttribute("playsinline", "true");
      created.style.display = "none";
      document.body.appendChild(created);
      bgAudioRef.current = created;
      __globalBGM.el = created;
    }

    const bgEl = bgAudioRef.current!;
    const srcIn = normalizeAudioSrc(audioPath);
    const cached = getAudioFromCache(srcIn);
    const nextUrl = cached ? cached.src : srcIn;

    // GUARD 1: ugyanaz a forrás és már szól → nincs restart
    if (__globalBGM.srcUrl === nextUrl && !bgEl.paused && bgEl.currentTime > 0) {
      try {
        if (!ctxRef.current) {
          ctxRef.current = new ((window as any).AudioContext || (window as any).webkitAudioContext)();
        }
        const ctx = ctxRef.current as AudioContext;
        const targetBgm = getEffectiveBase(); // 🔧 egységes alap

        if (ctx.state === "running") {
          if (!bgGainRef.current) {
            bgGainRef.current = ctx.createGain();
            bgGainRef.current.gain.value = targetBgm;
          }
          if (!bgNodeConnectedRef.current) {
            bgSrcRef.current = ctx.createMediaElementSource(bgEl);
            bgSrcRef.current.connect(bgGainRef.current).connect(ctx.destination);
            bgNodeConnectedRef.current = true;
          }
          // FONTOS: natív 1.0, Gain kezeli a hangerőt
          bgEl.muted = !!isMuted;
          bgEl.volume = isMuted ? 0 : 1.0;

          audioDucking.attach({ kind: "gain", node: bgGainRef.current! }, targetBgm);
          audioDucking.setBaseVolume(targetBgm);
        }

        // ANALITIKA – ha még nem jelöltük, jelöljük, hogy szól a BGM
        const id = `bgm:${nextUrl}`;
        if (currentBgmIdRef.current !== id) {
          currentBgmIdRef.current = id;
          safeStart("bgm", id);
        }
      } catch {}
      return;
    }

    // GUARD 2: forrás nem változott, de pausolt → folytatás
    if (__globalBGM.srcUrl === nextUrl && bgEl.paused && bgEl.currentTime > 0) {
      try { await bgEl.play(); } catch {}
      const id = `bgm:${nextUrl}`;
      if (currentBgmIdRef.current !== id) {
        currentBgmIdRef.current = id;
        safeStart("bgm", id);
      }
      return;
    }

    // ÚJ FORRÁS → előző STOP
    if (currentBgmIdRef.current) {
      safeStop("bgm", currentBgmIdRef.current);
      currentBgmIdRef.current = null;
    }

    __globalBGM.srcUrl = nextUrl;
    bgSrcUrlRef.current = nextUrl;
    bgEl.src = nextUrl;

    const runId = ++startRunRef.current;
    bootingRef.current = true;

    // natív boot
    bgEl.autoplay = false;
    bgEl.loop = true;
    bgEl.muted = true;
    bgEl.volume = 0;

    try { await waitForCanPlay(bgEl); } catch {}

    if (runId !== startRunRef.current) { bootingRef.current = false; return; }

    try { await bgEl.play(); }
    catch (err) { setAutoplayFailed(true); bootingRef.current = false; return; }

    if (runId !== startRunRef.current) { bootingRef.current = false; return; }

    // natív fade-in (csak amíg nincs WebAudio)
    bgEl.muted = false;
    const fadeMs = Math.max(150, fadeInMs || 300);
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / fadeMs);
      bgEl.volume = clamp01(getEffectiveBase() * p);
      if (p < 1 && runId === startRunRef.current) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);

    // WebAudio upgrade
    try {
      if (!DEBUG_FORCE_NATIVE) {
        if (!ctxRef.current) {
          ctxRef.current = new ((window as any).AudioContext || (window as any).webkitAudioContext)();
        }
        const ctx = ctxRef.current as AudioContext;
        if (ctx.state === "running") {
          const targetBgm = getEffectiveBase(); // 🔧 egységes alap
          if (!bgGainRef.current) {
            bgGainRef.current = ctx.createGain();
            bgGainRef.current.gain.value = targetBgm;
          }
          if (!bgNodeConnectedRef.current) {
            bgSrcRef.current = ctx.createMediaElementSource(bgEl);
            bgSrcRef.current.connect(bgGainRef.current).connect(ctx.destination);
            bgNodeConnectedRef.current = true;
          }

          // ↙️ Innentől natív 1.0 + unmute, Gain szabályoz
          bgEl.muted = !!isMuted;
          bgEl.volume = isMuted ? 0 : 1.0;

          audioDucking.attach({ kind: "gain", node: bgGainRef.current! }, targetBgm);
          audioDucking.setBaseVolume(targetBgm);
        }
      }
    } catch {}

    if (dbgIntervalRef.current) clearInterval(dbgIntervalRef.current);
    dbgIntervalRef.current = window.setInterval(() => {
      const t = bgAudioRef.current?.currentTime ?? -1;
      const muted = bgAudioRef.current?.muted ?? false;
      const vol = bgAudioRef.current?.volume ?? -1;
      const gain = bgGainRef.current?.gain?.value ?? -1;
      // console.log("[BGM/DBG]", { t, muted, vol, gain });
    }, 1000);

    setTimeout(() => { bootingRef.current = false; }, fadeMs + 80);

    // GLOBAL STATE frissítés + ANALITIKA START
    __globalBGM.el = bgEl;
    __globalBGM.srcUrl = nextUrl;
    __globalBGM.ctx = ctxRef.current;
    __globalBGM.gain = bgGainRef.current;
    __globalBGM.connected = bgNodeConnectedRef.current;

    const id = `bgm:${nextUrl}`;
    currentBgmIdRef.current = id;
    safeStart("bgm", id);
  };

  // ------- SEGÉD: egy VO klip lejátszása Promise-szal ------- (ANALITIKÁVAL)
  const playOne = (el: HTMLAudioElement, src: string) =>
    new Promise<void>((resolve, reject) => {
      try {
        const mediaId = `voice:${src}`;
        const onEnd = () => { cleanup(); resolve(); };
        const onPause = () => {
          // ha ténylegesen megállt vagy reset lett
          if (el.ended || el.currentTime === 0) { cleanup(); resolve(); }
        };
        const onErr = () => { cleanup(); reject(new Error("voice playback error")); };
        const cleanup = () => {
          // ANALITIKA – voice STOP
          if (currentVoiceIdRef.current === mediaId) {
            safeStop("voice", mediaId);
            currentVoiceIdRef.current = null;
          }
          el.onended = null;
          el.onpause = null;
          el.onerror = null;
        };

        el.onended = onEnd;
        el.onpause = onPause;
        el.onerror = onErr;

        el.src = src;
        el.currentTime = 0;
        el.muted = isMuted;

        // ANALITIKA – voice START
        currentVoiceIdRef.current = mediaId;
        safeStart("voice", mediaId);

        el.play().catch(onErr);
      } catch (e) { reject(e); }
    });

  // ------- PLAYLIST RUNNER ------- (ANALITIKA bent a playOne-ban)
  const startNarrationPlaylist = async () => {
    const voiceEl = voiceAudioRef.current;
    const list = narrationPlaylist ?? [];
    if (!voiceEl || !list.length) return;

    // duck paraméterek (fallback a jelenlegi konstansokra)
    const duckTo = clamp01(ducking?.duckTo ?? NARR_DUCK_TO);
    const attackMs = Math.max(0, ducking?.attackMs ?? 900);
    const releaseMs = Math.max(0, ducking?.releaseMs ?? 1400);

    // új futás-azonosító (abort őr)
    const runId = ++playlistRunIdRef.current;

    // start globális duck a teljes playlist idejére
    const duckId = `narrPL-${pageId}-${runId}`;
    narrationDuckIdRef.current = duckId;
    audioDucking.startDuck(duckId, { duckTo, attackMs, releaseMs });
    updateNativeSafety(duckTo);

    firstT0Ref.current = null;

    try {
      for (let i = 0; i < list.length; i++) {
        if (playlistRunIdRef.current !== runId) break; // abort
        const item = list[i];
        const src = normalizeAudioSrc(item.src);

        await playOne(voiceEl, src);

        // t0 csak az első sikeres play után
        if (!t0FiredRef.current) {
          t0FiredRef.current = true;
          const t0 = performance.now();
          firstT0Ref.current = t0;
          onNarrationStart?.(t0);
        }

        const gap = Math.max(0, item.gapAfterMs ?? 0);
        if (gap > 0) {
          const p = new Promise<void>(r => setTimeout(r, gap));
          await p;
        }
      }
    } finally {
      // duck leoldása
      if (narrationDuckIdRef.current === duckId) {
        audioDucking.endDuck(duckId);
        narrationDuckIdRef.current = null;
      }
      updateNativeSafety(1);
      // ha bármi okból maradt voiceId, zárjuk
      if (currentVoiceIdRef.current) {
        safeStop("voice", currentVoiceIdRef.current);
        currentVoiceIdRef.current = null;
      }
    }
  };

  // Narráció + SFX indítása
  const startNarrationAndSfx = async () => {
    stopNarrationAndSfx();

    // SFX
    sfx.forEach(effect => {
      const timerId = window.setTimeout(() => {
        const file = effect.file.startsWith("sfx/") ? effect.file : `sfx/${effect.file}`;
        const url = `/assets/${file}`;
        const fx = new Audio(url);
        const mediaId = `sfx:${url}`;
        fx.dataset.__id = mediaId; // cleanupnál elérhető

        fx.muted = isMuted;
        setVolumeSafe(fx, clamp01(volume)); // SFX globális volume
        sfxActiveRef.current.push(fx);

        // ANALITIKA – SFX START
        if (!activeSfxIdsRef.current.has(mediaId)) {
          activeSfxIdsRef.current.add(mediaId);
          safeStart("sfx", mediaId);
        }

        const duckId = `sfx-${pageId}-${file}-${Date.now()}`;
        sfxDuckIdsRef.current.add(duckId);
        audioDucking.startDuck(duckId, { duckTo: 0.5, attackMs: 200, releaseMs: 500 });

        const safetyUnduck = window.setTimeout(() => {
          if (sfxDuckIdsRef.current.has(duckId)) {
            audioDucking.endDuck(duckId);
            sfxDuckIdsRef.current.delete(duckId);
          }
        }, 10000);

        const cleanup = () => {
          clearTimeout(safetyUnduck);
          sfxActiveRef.current = sfxActiveRef.current.filter(a => a !== fx);
          if (sfxDuckIdsRef.current.has(duckId)) {
            audioDucking.endDuck(duckId);
            sfxDuckIdsRef.current.delete(duckId);
          }
          // ANALITIKA – SFX STOP
          if (activeSfxIdsRef.current.has(mediaId)) {
            safeStop("sfx", mediaId);
            activeSfxIdsRef.current.delete(mediaId);
          }
        };
        fx.onended = cleanup;
        fx.onpause = cleanup;

        fx.play().catch(() => cleanup());
      }, effect.time);
      sfxTimersRef.current.push(timerId);
      registerTimeout(timerId);
    });

    // ------ Narráció kiválasztása (playlist vs single) ------
    if (playMode === "playlist" && (narrationPlaylist?.length ?? 0) > 0) {
      setNarrationSource(`Playlist (${narrationPlaylist!.length} items)`);
      const id = window.setTimeout(() => { void startNarrationPlaylist(); }, 300);
      registerTimeout(id);
      return;
    }

    // SINGLE mód: mint eddig (ANALITIKÁVAL a startFixedNarration-ben)
    const effectiveNarrationPath =
      narrationPath || (pageId ? `/assets/audio/${pageId}.mp3` : undefined);

    if (effectiveNarrationPath) {
      setNarrationSource(`JSON/Public: ${effectiveNarrationPath}`);
      const id = window.setTimeout(() => startFixedNarration(effectiveNarrationPath), 300);
      registerTimeout(id);
    } else if (voicePrompt && voicePrompt.prompt) {
      setNarrationSource("AI: Generating...");
      const id = window.setTimeout(() => startVoice(), 300);
      registerTimeout(id);
    } else {
      setNarrationSource("None");
    }
  };

  // Előre felvett narráció + duck (single mód) – ANALITIKÁVAL
  const startFixedNarration = async (path: string) => {
    const voiceEl = voiceAudioRef.current;
    if (!path || !voiceEl) return;
    try {
      voiceEl.src = path;
      voiceEl.currentTime = 0;
      voiceEl.muted = isMuted;

      const duckId = `narr-${pageId}-${Date.now()}`;
      narrationDuckIdRef.current = duckId;
      audioDucking.startDuck(duckId, { duckTo: NARR_DUCK_TO, attackMs: 920, releaseMs: 1450 });
      updateNativeSafety(NARR_DUCK_TO); // natívban lejjebb húzzuk

      // ANALITIKA – voice START
      const mediaId = `voice:${path}`;
      currentVoiceIdRef.current = mediaId;
      safeStart("voice", mediaId);

      const endDuckIfAny = () => {
        if (narrationDuckIdRef.current) {
          audioDucking.endDuck(narrationDuckIdRef.current);
          narrationDuckIdRef.current = null;
        }
        updateNativeSafety(1);
        // ANALITIKA – voice STOP
        if (currentVoiceIdRef.current) {
          safeStop("voice", currentVoiceIdRef.current);
          currentVoiceIdRef.current = null;
        }
      };
      voiceEl.onended = endDuckIfAny;
      voiceEl.onpause = () => {
        if (voiceEl.ended || voiceEl.currentTime === 0) endDuckIfAny();
      };

      await voiceEl.play();

      if (!t0FiredRef.current) {
        t0FiredRef.current = true;
        onNarrationStart?.(performance.now());
      }
    } catch {
      if (narrationDuckIdRef.current) {
        audioDucking.endDuck(narrationDuckIdRef.current);
        narrationDuckIdRef.current = null;
      }
      updateNativeSafety(1);
      // ANALITIKA – fail safe STOP
      if (currentVoiceIdRef.current) {
        safeStop("voice", currentVoiceIdRef.current);
        currentVoiceIdRef.current = null;
      }
    }
  };

  // AI-generált narráció + duck (single fallback) – ANALITIKÁVAL
  const startVoice = () => {
    const voiceEl = voiceAudioRef.current;
    if (!pageId || !voicePrompt?.prompt || !voiceEl) return;

    generateVoice({
      pageId,
      promptOverride: voicePrompt.prompt,
      voice: voicePrompt.voice,
      style: voicePrompt.style,
      format: "mp3",
      reuseExisting: true,
    })
      .then(async (res) => {
        if (!res?.ok || !res.url || !voiceEl) return;
        const fullUrl = res.url.startsWith("http") ? res.url : `http://127.0.0.1:8000${res.url}`;
        try {
          voiceEl.src = fullUrl;
          voiceEl.currentTime = 0;
          voiceEl.muted = isMuted;

          const duckId = `narrAI-${pageId}-${Date.now()}`;
          narrationDuckIdRef.current = duckId;
          audioDucking.startDuck(duckId, { duckTo: NARR_DUCK_TO, attackMs: 220, releaseMs: 650 });
          updateNativeSafety(NARR_DUCK_TO);

          // ANALITIKA – voice START
          const mediaId = `voice:${fullUrl}`;
          currentVoiceIdRef.current = mediaId;
          safeStart("voice", mediaId);

          const endDuckIfAny = () => {
            if (narrationDuckIdRef.current) {
              audioDucking.endDuck(narrationDuckIdRef.current);
              narrationDuckIdRef.current = null;
            }
            updateNativeSafety(1);
            // ANALITIKA – voice STOP
            if (currentVoiceIdRef.current) {
              safeStop("voice", currentVoiceIdRef.current);
              currentVoiceIdRef.current = null;
            }
          };
          voiceEl.onended = endDuckIfAny;
          voiceEl.onpause = () => {
            if (voiceEl.ended || voiceEl.currentTime === 0) endDuckIfAny();
          };

          await voiceEl.play();
          setNarrationSource(`AI: ${fullUrl}`);

          if (!t0FiredRef.current) {
            t0FiredRef.current = true;
            onNarrationStart?.(performance.now());
          }
        } catch {
          if (narrationDuckIdRef.current) {
            audioDucking.endDuck(narrationDuckIdRef.current);
            narrationDuckIdRef.current = null;
          }
          updateNativeSafety(1);
          // ANALITIKA – fail safe STOP
          if (currentVoiceIdRef.current) {
            safeStop("voice", currentVoiceIdRef.current);
            currentVoiceIdRef.current = null;
          }
        }
      })
      .catch(() => {});
  };

  // Háttérzene csak audioPath változásnál
  useEffect(() => {
    if (audioPath) startBackgroundMusic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioPath]);

  // Narráció minden pageId váltásnál
  useEffect(() => {
    if (!autoPlay) return;
    if (startTimerRef.current) clearTimeout(startTimerRef.current);
    const id = window.setTimeout(startNarrationAndSfx, delayMs);
    startTimerRef.current = id;
    registerTimeout(id);

    return () => {
      if (startTimerRef.current) clearTimeout(startTimerRef.current);
      stopNarrationAndSfx();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pageId,
    narrationPath,
    voicePrompt?.prompt,
    voicePrompt?.voice,
    voicePrompt?.style,
    autoPlay,
    delayMs,
    audioRestartToken,
    registerTimeout,

    // playlist/ducking változás esetén is induljon újra
    playMode,
    narrationPlaylist?.length,
    ducking?.duckTo,
    ducking?.attackMs,
    ducking?.releaseMs,
  ]);

  // hangerő frissítése
  useEffect(() => {
    if (voiceAudioRef.current) setVolumeSafe(voiceAudioRef.current, clamp01(isMuted ? 0 : volume));
    sfxActiveRef.current.forEach(a => setVolumeSafe(a, clamp01(isMuted ? 0 : volume)));

    const eff = getEffectiveBase(); // 🔧 egységes alap
    audioDucking.setBaseVolume(eff);
    if (!isMuted) updateNativeSafety(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volume, bgmVolume, isMuted]);

  return (
    <>
      {/* BGM singleton placeholder – a valódi elem a body alá kerül */}
      <audio ref={bgAudioRef} preload="auto" loop playsInline={true} style={{ display: "none" }} />
      <audio ref={voiceAudioRef} preload="auto" />
      <div
        style={{
          position: "absolute",
          bottom: 10,
          right: 10,
          background: "rgba(0,0,0,0.6)",
          color: "#fff",
          padding: "4px 8px",
          fontSize: "11px",
          borderRadius: "4px",
          fontFamily: "monospace",
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        Narration src: {narrationSource}{autoplayFailed ? " (autoplay blocked)" : ""}
      </div>
    </>
  );
};

export default AudioPlayer;
