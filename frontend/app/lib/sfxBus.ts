// frontend/lib/sfxBus.ts

let audioCtx: AudioContext | null = null;
let busGain: GainNode | null = null;
let muted = false;
let busVolume = 1;

// Aktív SFX elemek kezelése (leállításhoz, takarításhoz)
const activeAudios = new Set<HTMLAudioElement>();

// MediaElementSource csak egyszer hozható létre ugyanarra az <audio>-ra.
// WeakMap-pal megőrizzük a kapcsolatot.
const sourceMap = new WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>();

function ensureBus() {
  if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (!busGain && audioCtx) {
    busGain = audioCtx.createGain();
    busGain.gain.value = muted ? 0 : busVolume;
    busGain.connect(audioCtx.destination);
  }
}

/**
 * iOS/Safari unlock: user gesture után érdemes hívni.
 */
export async function resumeSfxContext() {
  ensureBus();
  if (audioCtx?.state === "suspended") {
    try { await audioCtx.resume(); } catch { /* noop */ }
  }
}

function connectToBus(el: HTMLAudioElement) {
  ensureBus();
  if (!audioCtx || !busGain) return;

  if (!sourceMap.has(el)) {
    const src = audioCtx.createMediaElementSource(el);
    src.connect(busGain);
    sourceMap.set(el, src);
  }
}

/**
 * SFX lejátszás – gyors, biztonságos API.
 * @param url – SFX fájl (pl. "assets/sfx/footsteps_soft.mp3")
 * @param opts.volume – 0..1 (alap: 1)
 * @param opts.fadeInMs – lineáris fade-in ms (alap: 0)
 * @param opts.fadeOutMs – lineáris fade-out ms a végén (alap: 0 – nem vágjuk le)
 */
export async function playSfx(
  url: string,
  opts: { volume?: number; fadeInMs?: number; fadeOutMs?: number } = {}
): Promise<{ audio: HTMLAudioElement; stop: () => void }> {
  ensureBus();
  await resumeSfxContext();

  const { volume = 1, fadeInMs = 0, fadeOutMs = 0 } = opts;

  const el = new Audio(url);
  el.preload = "auto";
  el.crossOrigin = "anonymous";

  // A saját el-hangerőnk maradjon 1; mixelést a buszon intézzük.
  el.volume = 1;

  // A lejátszás indítása előtt csatlakoztatjuk a buszra
  connectToBus(el);

  // Fade-in: busz volume marad globális; egyedi fade-hez MediaElement-nél nincs külön gain,
  // ezért rövid ideig a saját elem-hangerőt használjuk (lokális fade).
  if (fadeInMs > 0) {
    el.volume = 0;
  }

  // Indítás
  try { await el.play(); } catch { /* autoplay/gesture hiba esetén csendben továbblépünk */ }

  activeAudios.add(el);

  // Fade-in lokálisan
  if (fadeInMs > 0) {
    const start = performance.now();
    const startVol = 0;
    const targetVol = 1 * volume;
    const raf = () => {
      const t = Math.min(1, (performance.now() - start) / fadeInMs);
      el.volume = startVol + (targetVol - startVol) * t;
      if (t < 1) requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
  } else {
    el.volume = volume;
  }

  // Ha kérnek fade-out-ot, a 'ended' előtt időzítve manuálisan is meg tudod hívni,
  // de legegyszerűbb: külső oldalon stop() előtt fadeOutMs-et használsz.

  const stop = () => {
    // Opcionális fade-out
    if (fadeOutMs > 0 && !el.paused && !el.ended) {
      const start = performance.now();
      const startVol = el.volume;
      const raf = () => {
        const t = Math.min(1, (performance.now() - start) / fadeOutMs);
        el.volume = startVol * (1 - t);
        if (t < 1) {
          requestAnimationFrame(raf);
        } else {
          el.pause();
          el.currentTime = 0;
          activeAudios.delete(el);
        }
      };
      requestAnimationFrame(raf);
    } else {
      el.pause();
      el.currentTime = 0;
      activeAudios.delete(el);
    }
  };

  // Ha magától lejátszotta, takarítsunk
  el.addEventListener("ended", () => {
    activeAudios.delete(el);
  });

  return { audio: el, stop };
}

/**
 * Előtöltés (canplaythrough-ig) – hasznos, ha kritikus SFX-et akarsz pontosan időzíteni.
 */
export function preloadSfx(url: string): Promise<void> {
  return new Promise((resolve) => {
    const el = new Audio(url);
    el.preload = "auto";
    el.crossOrigin = "anonymous";
    const done = () => {
      el.removeEventListener("canplaythrough", done);
      el.removeEventListener("error", done);
      resolve();
    };
    el.addEventListener("canplaythrough", done, { once: true });
    el.addEventListener("error", done, { once: true });
    // A Safari néha nem kezdi el a betöltést play nélkül – egy rövid .load() segít.
    try { el.load(); } catch { /* noop */ }
  });
}

/** Globális SFX busz mute */
export function setSfxMuted(mute: boolean) {
  muted = mute;
  ensureBus();
  if (busGain) busGain.gain.value = mute ? 0 : busVolume;
}
export function isSfxMuted() {
  return muted;
}

/** Globális SFX busz hangerő (0..1) – a mute-tól függetlenül tároljuk */
export function setSfxVolume(v: number) {
  busVolume = Math.max(0, Math.min(1, v));
  ensureBus();
  if (busGain && !muted) busGain.gain.value = busVolume;
}
export function getSfxVolume() {
  return busVolume;
}

/** Minden aktív SFX azonnali leállítása (oldalváltás takarítás) */
export function stopAllSfx() {
  activeAudios.forEach((el) => {
    try {
      el.pause();
      el.currentTime = 0;
    } catch { /* noop */ }
  });
  activeAudios.clear();
}
