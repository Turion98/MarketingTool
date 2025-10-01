// lib/audioDucking.ts
type DuckId = string;

export type DuckOpts = {
  /** ABSZOLÚT célhangerő (0..1), pl. 0.3 = 30% */
  duckTo?: number;     // alap: 0.3
  /** Le-fade idő (ms) */
  attackMs?: number;   // alap: 240
  /** Vissza-fade idő (ms) */
  releaseMs?: number;  // alap: 600
};

type TargetNode =
  | { kind: "gain"; node: GainNode }
  | { kind: "media"; el: HTMLMediaElement };

const DEFAULTS: Required<DuckOpts> = { duckTo: 0.2, attackMs: 240, releaseMs: 600 };

let target: TargetNode | null = null;
let baseVolume = 0.6; // zene “normál” szintje (mute/slider után)
let raf: number | null = null;

const active = new Map<DuckId, Required<DuckOpts>>(); // id -> opts
let currentAnim: { from: number; to: number; t0: number; dur: number } | null = null;

function now() { return typeof performance !== "undefined" ? performance.now() : Date.now(); }

function getCurrentVolume(): number {
  if (!target) return 1;
  if (target.kind === "gain") return target.node.gain.value;
  return target.el.volume;
}

function setVolume(v: number) {
  if (!target) return;
  const vol = Math.max(0, Math.min(1, v));
  if (target.kind === "gain") target.node.gain.value = vol;
  else target.el.volume = vol;
}

function stopAnim() {
  if (raf != null) cancelAnimationFrame(raf);
  raf = null;
  currentAnim = null;
}

/** Átmenetes hangerőváltás: GainNode esetén AudioParam automáció, <audio> esetén RAF + easing. */
function fadeTo(to: number, durMs: number) {
  if (!target) return;

  const from = getCurrentVolume();
  const clampedTo = Math.max(0, Math.min(1, to));
  const durSec = Math.max(0, durMs) / 1000;

  // Ha nincs tényleges változás, állítsuk be azonnal
  if (Math.abs(clampedTo - from) < 1e-3 || durMs <= 0) {
    stopAnim();
    setVolume(clampedTo);
    return;
  }

  // GainNode → Web Audio automáció (sample-pontos, akadásmentes)
  if (target.kind === "gain") {
    stopAnim(); // biztosan ne fusson RAF
    const param = target.node.gain;
    const ctx = target.node.context;
    const t = ctx.currentTime;
    try { param.cancelScheduledValues(t); } catch {}
    try { (param as any).cancelAndHoldAtTime?.(t); } catch {}
    param.setValueAtTime(param.value, t);
    param.linearRampToValueAtTime(clampedTo, t + durSec);
    return;
  }

  // HTMLMediaElement.volume → időalapú interpoláció (RAF + easeInOutCubic)
  stopAnim();
  const t0 = now();
  currentAnim = { from, to: clampedTo, t0, dur: durMs };
  const tick = () => {
    if (!currentAnim) return;
    const p = Math.min(1, (now() - currentAnim.t0) / currentAnim.dur);
    const eased = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
    setVolume(currentAnim.from + (currentAnim.to - currentAnim.from) * eased);
    if (p < 1) raf = requestAnimationFrame(tick);
    else stopAnim();
  };
  raf = requestAnimationFrame(tick);
}

/** Újraszámolja az aktuális célhangerőt aktív duckok alapján. */
function recompute() {
  const curr = getCurrentVolume();

  if (active.size === 0) {
    // vissza normál szintre – release idővel
    fadeTo(baseVolume, DEFAULTS.releaseMs);
    return;
  }

  // Több forrásnál a legkisebb duckTo (legerősebb halkítás) érvényesül
  const vals = Array.from(active.values());
  const minDuck = Math.min(...vals.map(o => o.duckTo));

  // ⚠️ ABSZOLÚT célhangerő: a baseVolume alá mehet, fölé nem
  const targetVol = Math.min(baseVolume, Math.max(0, Math.min(1, minDuck)));

  // Irányfüggő idő: lefelé → legkisebb attack; felfelé → legnagyobb release
  const goingDown = targetVol < curr;
  const attack = Math.min(...vals.map(o => o.attackMs));
  const release = Math.max(...vals.map(o => o.releaseMs));
  const dur = goingDown ? attack : release;

  fadeTo(targetVol, dur);
}

export const audioDucking = {
  /** A cél node regisztrálása. Ezt hívd meg, miután létrehoztad a GainNode-ot / <audio>-t. */
  attach(targetNode: TargetNode, initialBaseVolume = 1.0) {
    target = targetNode;
    baseVolume = Math.max(0, Math.min(1, initialBaseVolume));
    // ⬇️ állapot-konszolidáció attach után
    stopAnim();
    if (active.size === 0) {
      setVolume(baseVolume);  // nincs aktív duck → bázisszintre
    } else {
      const vals = Array.from(active.values());
      const minDuck = Math.min(...vals.map(o => o.duckTo));
      const targetVol = Math.min(baseVolume, Math.max(0, Math.min(1, minDuck)));
      setVolume(targetVol);   // azonnal a célszintre (ne pumpáljon)
    }
  },

  /** Target leválasztása (aktív duckok megmaradnak, új attach után érvényesülnek). */
  detach() {
    stopAnim();
    target = null;
  },

  /** Alap hangerő beállítása (UI slider / mute változás). */
  setBaseVolume(v: number) {
    baseVolume = Math.max(0, Math.min(1, v));
    // 🔧 FIX: aktív duck esetén is számoljuk újra a célt (eddig kimaradt)
    if (active.size === 0) {
      fadeTo(baseVolume, 120);
    } else {
      recompute();
    }
  },

  /** Alap hangerő finomított beállítása (ms fade). Ha van aktív duck, recompute. */
  setBaseVolumeSmooth(v: number, ms = 120) {
    baseVolume = Math.max(0, Math.min(1, v));
    if (active.size === 0) {
      fadeTo(baseVolume, ms);
    } else {
      // aktív duck mellett az irányfüggő időket a recompute kezeli
      recompute();
    }
  },

  /** Duck indítása. Adj egyedi id-t, hogy később be tudd fejezni. */
  startDuck(id: DuckId, opts: DuckOpts = {}) {
    const full = { ...DEFAULTS, ...opts };
    active.set(id, full);
    recompute();
  },

  /** Duck befejezése. */
  endDuck(id: DuckId) {
    const ended = active.get(id);
    if (!ended) return;
    active.delete(id);
    if (active.size === 0) {
      // utolsó duck szűnt meg → vissza bázisszintre a saját release idejével
      fadeTo(baseVolume, ended.releaseMs);
    } else {
      // maradt aktív duck → számold újra az aktuális célt (irányfüggő időzítéssel)
      recompute();
    }
  },

  /** Minden duck és animáció leállítása, azonnali visszaállás a bázisszintre. */
  resetAll() {
    active.clear();
    stopAnim();
    if (target) setVolume(baseVolume);
  },

  /** Gyors diagnosztika. */
  getState() {
    return {
      attached: !!target,
      baseVolume,
      activeCount: active.size,
      currentVolume: getCurrentVolume(),
      active: Array.from(active.entries()),
    };
  },
};

export type { TargetNode };
