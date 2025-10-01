// frontend/lib/useSfxScheduler.ts
import { useEffect, useRef } from "react";
import { playSfx } from "./sfxBus";
import { logSfxTrigger } from "./telemetry";
import { audioDucking } from "./audioDucking";

export type SfxItem = { file: string; time: number }; // time = ms T0-hoz képest
type RegisterTimeout = (cb: () => void, ms: number) => number;
type ClearTimeout = (id: number) => void;

type DuckCfg = { duckTo?: number; attackMs?: number; releaseMs?: number };

export function useSfxScheduler(opts: {
  pageId: string;
  sfx?: SfxItem[];
  t0?: number | null;                 // performance.now() – narráció indulás pillanata
  registerTimeout: RegisterTimeout;   // GameState-ből vagy máshonnan
  clearTimeoutFn?: ClearTimeout;      // ha van saját clear, egyébként window.clearTimeout fallback
  /** ÚJ: BGM duck SFX alatt. true = default (0.5 / 200 / 500), objektummal finomhangolható. */
  duckDuringSfx?: boolean | DuckCfg;
}) {
  const timeoutsRef = useRef<number[]>([]);
  const runIdRef = useRef(0);

  useEffect(() => {
    const runId = ++runIdRef.current;

    // előző ütemezések törlése
    timeoutsRef.current.forEach((id) =>
      opts.clearTimeoutFn ? opts.clearTimeoutFn(id) : clearTimeout(id)
    );
    timeoutsRef.current = [];

    const { sfx, t0, pageId, registerTimeout, duckDuringSfx } = opts;
    if (!sfx?.length || !t0) return;

    const now = performance.now();

    sfx.forEach(({ file, time }, idx) => {
      const dueAbs = t0 + Number(time || 0);
      const delay = Math.max(0, dueAbs - now);

      const id = registerTimeout(async () => {
        // ha újraindult a hook (pl. oldalváltás), ne fusson le ez a callback
        if (runIdRef.current !== runId) return;

        const actualNow = performance.now();
        const delta = (actualNow - t0) - time; // +késés / -sietség
        logSfxTrigger(pageId, file, time, delta);

        // --- Opcionális BGM duck SFX alatt ---
        const wantDuck = duckDuringSfx === undefined ? true : duckDuringSfx !== false;
        const cfg: DuckCfg =
          typeof duckDuringSfx === "object"
            ? duckDuringSfx
            : { duckTo: 0.5, attackMs: 200, releaseMs: 500 };

        let duckId: string | null = null;
        let safetyTimer: number | null = null;

        if (wantDuck) {
          duckId = `sfx-${pageId}-${idx}-${Date.now()}`;
          audioDucking.startDuck(duckId, {
            duckTo: cfg.duckTo ?? 0.5,
            attackMs: cfg.attackMs ?? 200,
            releaseMs: cfg.releaseMs ?? 500,
          });
          // hard safety: ha bármiért nem fut le a finally
          safetyTimer = window.setTimeout(() => {
            if (duckId) audioDucking.endDuck(duckId);
          }, 10000);
        }

        try {
          // Lejátszás SFX buszon keresztül (pl. finom fade-in)
          await playSfx(file, { fadeInMs: 150 });
        } finally {
          if (duckId) audioDucking.endDuck(duckId);
          if (safetyTimer != null) clearTimeout(safetyTimer);
        }
      }, delay);

      timeoutsRef.current.push(id);
    });

    return () => {
      timeoutsRef.current.forEach((id) =>
        opts.clearTimeoutFn ? opts.clearTimeoutFn(id) : clearTimeout(id)
      );
      timeoutsRef.current = [];
    };
  }, [
    opts.pageId,
    opts.t0,
    opts.registerTimeout,
    opts.clearTimeoutFn,
    JSON.stringify(opts.sfx),
    JSON.stringify(opts.duckDuringSfx),
  ]);
}
