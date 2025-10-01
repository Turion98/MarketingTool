"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import styles from "./SmokeField.module.scss";

export type SmokeLayer = {
  src: string;
  speed?: number;            // px/sec (csak akkor kell, ha nincs amplitude)
  z?: number;                // CSS z-index
  opacity?: number;          // 0..1
  startOffsetPx?: number;    // rétegenkénti kezdő X
  scaleMultiplier?: number;  // rétegenkénti nagyítás
  horizAmplitude?: number;   // vízszintes kitérés pixelben (oda-vissza)
  vertAmplitude?: number;    // függőleges lebegés pixelben
  cycleTime?: number;        // teljes oda-vissza mozgás ideje mp-ben

  // Opacitás animáció
  opacityAmplitude?: number;  // mennyit változzon az áttetszőség
  opacityCycleTime?: number;  // egy teljes fel-le ciklus ideje mp-ben
  phaseOffset?: number;       // opcionális fáziseltolás
};

type Props = {
  layers: SmokeLayer[];
  globalScale?: number;         // minden rétegre vonatkozó alap nagyítás
  offsetPercentX?: number;      // %-os kezdő eltolás balra (+ jobbra), alap: -15
  offsetPercentY?: number;      // %-os kezdő eltolás fel/le, alap: -15
};

type LayerRuntime = {
  tileW: number;
  tiles: HTMLImageElement[];
  offset: number;
  layerEl: HTMLDivElement; // opacitás beállításához
};

const SmokeParallax: React.FC<Props> = ({
  layers,
  globalScale = 1,
  offsetPercentX = -15,
  offsetPercentY = -15,
}) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<LayerRuntime[]>([]);
  const [vw, setVw] = useState(0);
  const [vh, setVh] = useState(0);
  const frameRef = useRef<number | null>(null);
  const lastTRef = useRef<number | null>(null);

  // preload képek
  const preloaders = useMemo(
    () =>
      layers.map(
        (l) =>
          new Promise<{ w: number; h: number }>((res, rej) => {
            const i = new Image();
            i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight });
            i.onerror = rej;
            i.src = l.src;
          })
      ),
    [layers]
  );

  // viewport méret figyelése (a wrap tényleges mérete alapján)
  useEffect(() => {
    const onResize = () => {
      const r = wrapRef.current?.getBoundingClientRect();
      setVw(Math.max(1, Math.round(r?.width ?? window.innerWidth)));
      setVh(Math.max(1, Math.round(r?.height ?? window.innerHeight)));
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // init + animáció
  useEffect(() => {
    let cancelled = false;

    Promise.all(preloaders).then((sizes) => {
      if (cancelled || !wrapRef.current) return;

      wrapRef.current.innerHTML = "";
      runtimeRef.current = [];

      // Egységes tile-méret (legszélesebb skálázott width)
      const scaleFactors = sizes.map((s, i) => {
        const layerScale = (layers[i].scaleMultiplier ?? 1) * globalScale;
        return (vh / s.h) * layerScale;
      });
      const scaledWidths = sizes.map((s, i) =>
        Math.round(s.w * scaleFactors[i])
      );
      const tileWGlobal = Math.max(...scaledWidths);

      // Szinkron kezdőpozíció
      const baseOffset = 0;

      layers.forEach((layer, idx) => {
        const layerEl = document.createElement("div");
        layerEl.className = styles.layer;
        layerEl.style.zIndex = String(layer.z ?? idx + 1);
        layerEl.style.opacity = String(layer.opacity ?? 1);
        wrapRef.current!.appendChild(layerEl);

        const tilesNeeded = Math.max(3, Math.ceil(vw / tileWGlobal) + 2);
        const tiles: HTMLImageElement[] = [];

        for (let i = 0; i < tilesNeeded; i++) {
          const img = new Image();
          img.src = layer.src;
          img.className = styles.tile;
          img.style.width = `${tileWGlobal}px`;
          img.style.height = `${
            vh * (layer.scaleMultiplier ?? 1) * globalScale
          }px`;
          img.style.transform = `translateX(${i * tileWGlobal}px) translateZ(0)`;
          layerEl.appendChild(img);
          tiles.push(img);
        }

        runtimeRef.current[idx] = {
          tileW: tileWGlobal,
          tiles,
          offset: (baseOffset + (layer.startOffsetPx ?? 0)) % tileWGlobal,
          layerEl,
        };
      });

      // animáció loop
      lastTRef.current = null;
      const loop = (t: number) => {
        if (!lastTRef.current) lastTRef.current = t;
        const dt = (t - lastTRef.current) / 1000;
        lastTRef.current = t;

        layers.forEach((layer, i) => {
          const rt = runtimeRef.current[i];
          if (!rt) return;
          const tw = rt.tileW;

          // Opacitás animáció
          if (layer.opacityAmplitude && layer.opacityCycleTime) {
            const elapsed = t / 1000;
            const cycle = layer.opacityCycleTime;
            const angle = ((elapsed % cycle) / cycle) * 2 * Math.PI;
            const baseOpacity = layer.opacity ?? 1;
            const variation = Math.sin(angle + (layer.phaseOffset ?? 0)) * layer.opacityAmplitude;
            const newOpacity = Math.max(0, Math.min(1, baseOpacity + variation));
            rt.layerEl.style.opacity = String(newOpacity);
          }

          // Sinusos lebegés
          if (layer.horizAmplitude || layer.vertAmplitude) {
            const elapsed = t / 1000;
            const cycle = layer.cycleTime ?? 12;
            const angle = ((elapsed % cycle) / cycle) * 2 * Math.PI + (layer.phaseOffset ?? 0);

            const xOffset = Math.sin(angle) * (layer.horizAmplitude ?? 0);
            const yOffset = Math.sin(angle + Math.PI / 2) * (layer.vertAmplitude ?? 0);

            rt.tiles.forEach((img, idx2) => {
              const baseX = idx2 * tw;
              img.style.transform = `translate(${baseX + xOffset}px, ${yOffset}px) translateZ(0)`;
            });
          } else {
            // Folyamatos scroll
            rt.offset += (layer.speed ?? 0) * dt;
            if (rt.offset <= -tw) rt.offset += tw;
            if (rt.offset >= tw) rt.offset -= tw;

            rt.tiles.forEach((img, idx2) => {
              const x = Math.round(idx2 * tw + rt.offset);
              img.style.transform = `translateX(${x}px) translateZ(0)`;
            });
          }
        });

        frameRef.current = requestAnimationFrame(loop);
      };
      frameRef.current = requestAnimationFrame(loop);
    });

    return () => {
      cancelled = true;
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [preloaders, vh, vw, layers, globalScale]);

  // A CSS itt olvassa a változókat: --off-x / --off-y (pl. left/top: var(--off-x))
  return (
    <div
      ref={wrapRef}
      className={styles.wrap}
      style={
        {
          ["--off-x" as any]: `${offsetPercentX}%`,
          ["--off-y" as any]: `${offsetPercentY}%`,
        } as React.CSSProperties
      }
    />
  );
};

export default SmokeParallax;
