// /components/NineSlicePanel.tsx
"use client";
import React, { useLayoutEffect, useMemo, useRef } from "react";
import s from "./NineSlicePanel.module.scss";

type Slice = { top: number; right: number; bottom: number; left: number };
type Pad = { top?: number; right?: number; bottom?: number; left?: number };

type MeasureBox = {
  /** Panel (külső) doboz a borderrel */
  panel: { x: number; y: number; width: number; height: number };
  /** Tartalom (safe area) – padding figyelembevételével (STABIL, a keretből számolva) */
  content: { x: number; y: number; width: number; height: number };
  /** Border szélek px-ben */
  border: Slice;
  /** Paddingok px-ben (safe area) */
  padding: Required<Pad>;
  /** inner paraméter, ha volt */
  inner: { width: number; height: number };
  /** DPR a mért pillanatban */
  dpr: number;
};

type UnderlayOpts = {
  /** Belső fedőréteg engedélyezése (a content alatt, a frame alatt/fölött) */
  enabled?: boolean;
  /** 0–1 közötti átlátszatlanság (alap: 0.25) */
  opacity?: number;
  /** Háttérszín (alap: rgba(0,0,0,0.25)) – ha megadsz színt, az opacity-t külön állítsd */
  background?: string;
};

type Props = {
  /** A 9-slice sprite elérési útja a public-ból, pl. "/ui/textbox_9slice.png" */
  src: string;
  /** A sprite vágási értékei px-ben (felül/jobb/alul/bal) */
  slice: Slice;
  /** A kereten belüli „safe area” (px) – ha nincs megadva, slice alapján számolunk */
  padding?: Pad;
  /** Extra class a panel gyökerére */
  className?: string;
  /** Panel belső tartalma (szöveg, gombok, stb.) */
  children?: React.ReactNode;
  /** Belépő animáció engedélyezése (nem alkalmazzuk a rooton a drift elkerülésére) */
  animate?: boolean;
  /** Design-time belső (content) méret a min-height számításhoz */
  inner?: { width: number; height: number };
  /** Opcionális callback minden friss méréssel (ResizeObserver + események) */
  onMeasure?: (m: MeasureBox) => void;
  /**
   * Ha a content dobozon belül szeretnél egy kisebb „horgony” területet mérni (pl. optikai
   * korrekció), px-ben adható insets. Ha üres, a teljes contentet mérjük.
   */
  anchorInsets?: Partial<Pad>;

  /** Teljes panel z-index (root) – a szülő stacking contextjén belül */
  zIndex?: number;

  /** Stacking context izolálása (alap: true) */
  isolate?: boolean;

  /** Opcionális belső fedőréteg a content alatt (átlátszóság/blur/kitakarás) */
  underlay?: UnderlayOpts;

  /** Opcionális hátterezés (pl. RuneDock) a FRAME ELŐTT, de a content alatt (garantáltan mögötte) */
  backdrop?: React.ReactNode;

  /** Kövesse-e a görgetést méréskor. Alap: false (nem „tapad” a viewporthoz) */
  trackScroll?: boolean;
};

export default function NineSlicePanel({
  src,
  slice,
  padding,
  className,
  children,
  animate = true,
  inner = { width: 680, height: 752 },
  onMeasure,
  anchorInsets,
  zIndex = 10,
  isolate = true,
  underlay,
  backdrop,
  trackScroll = false, // ⬅ alapértelmezetten NEM figyel scrollra
}: Props) {
  // Alapértelmezett belső padding a slice-hoz igazítva
  const padTop = padding?.top ?? Math.max(0, slice.top - 16);
  const padRight = padding?.right ?? Math.max(0, slice.right - 11);
  const padBottom = padding?.bottom ?? Math.max(0, slice.bottom - 16);
  const padLeft = padding?.left ?? Math.max(0, slice.left - 11);

  // CSS változók
  const styleVars = useMemo(
    () =>
      ({
        // forrás + slice
        ["--ns-src" as any]: `url("${src}")`,
        ["--ns-slice-top" as any]: String(slice.top),
        ["--ns-slice-right" as any]: String(slice.right),
        ["--ns-slice-bottom" as any]: String(slice.bottom),
        ["--ns-slice-left" as any]: String(slice.left),

        // 4 oldalas border-width (px egységgel)
        ["--ns-bw-top" as any]: `${slice.top}px`,
        ["--ns-bw-right" as any]: `${slice.right}px`,
        ["--ns-bw-bottom" as any]: `${slice.bottom}px`,
        ["--ns-bw-left" as any]: `${slice.left}px`,

        // belső padding (safe area)
        ["--ns-pad-top" as any]: `${padTop}px`,
        ["--ns-pad-right" as any]: `${padRight}px`,
        ["--ns-pad-bottom" as any]: `${padBottom}px`,
        ["--ns-pad-left" as any]: `${padLeft}px`,

        // design-time belső méret (unitless → calc(... * 1px) az SCSS-ben)
        ["--ns-inner-w" as any]: String(inner.width),
        ["--ns-inner-h" as any]: String(inner.height),
      } as React.CSSProperties),
    [src, slice, padTop, padRight, padBottom, padLeft, inner.width, inner.height]
  );

  const rootRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  // Kerekítés helper a subpixel drift ellen
  const R = (v: number) => Math.round(v);

  // Egységes mérés + CSS változók frissítése
  const doMeasure = () => {
    const root = rootRef.current;
    if (!root) return;

    // PANEL: külső rect a borderrel
    const panelRect = root.getBoundingClientRect();

    // CONTENT (SAFE AREA): STABILAN számolva a keretből
    const contentX = panelRect.x + slice.left + padLeft;
    const contentY = panelRect.y + slice.top + padTop;
    const contentW = Math.max(
      0,
      panelRect.width - slice.left - slice.right - padLeft - padRight
    );
    const contentH = Math.max(
      0,
      panelRect.height - slice.top - slice.bottom - padTop - padBottom
    );

    const dpr = window.devicePixelRatio || 1;

    // Anchor insets (opcionális)
    const aiTop = anchorInsets?.top ?? 0;
    const aiRight = anchorInsets?.right ?? 0;
    const aiBottom = anchorInsets?.bottom ?? 0;
    const aiLeft = anchorInsets?.left ?? 0;

    const anchorX = contentX + aiLeft;
    const anchorY = contentY + aiTop;
    const anchorW = Math.max(0, contentW - aiLeft - aiRight);
    const anchorH = Math.max(0, contentH - aiTop - aiBottom);

    // Írjuk ki CSS változókba (panel + content + anchor) – kerekítve
    root.style.setProperty("--ns-x", `${R(panelRect.x)}px`);
    root.style.setProperty("--ns-y", `${R(panelRect.y)}px`);
    root.style.setProperty("--ns-w", `${R(panelRect.width)}px`);
    root.style.setProperty("--ns-h", `${R(panelRect.height)}px`);

    root.style.setProperty("--ns-content-x", `${R(contentX)}px`);
    root.style.setProperty("--ns-content-y", `${R(contentY)}px`);
    root.style.setProperty("--ns-content-w", `${R(contentW)}px`);
    root.style.setProperty("--ns-content-h", `${R(contentH)}px`);

    root.style.setProperty("--ns-anchor-x", `${R(anchorX)}px`);
    root.style.setProperty("--ns-anchor-y", `${R(anchorY)}px`);
    root.style.setProperty("--ns-anchor-w", `${R(anchorW)}px`);
    root.style.setProperty("--ns-anchor-h", `${R(anchorH)}px`);

    // Callback a pontos (kerekített) adatokkal
    onMeasure?.({
      panel: {
        x: R(panelRect.x),
        y: R(panelRect.y),
        width: R(panelRect.width),
        height: R(panelRect.height),
      },
      content: {
        x: R(contentX),
        y: R(contentY),
        width: R(contentW),
        height: R(contentH),
      },
      border: slice,
      padding: {
        top: padTop,
        right: padRight,
        bottom: padBottom,
        left: padLeft,
      },
      inner,
      dpr,
    });
  };

  // ResizeObserver + események
  useLayoutEffect(() => {
    doMeasure();

    const ro = new ResizeObserver(() => doMeasure());
    const root = rootRef.current;
    if (root) ro.observe(root);

    const handle = () => doMeasure();

    // ⬇️ CSAK akkor figyelünk scroll-ra, ha kérték
    if (trackScroll) {
      window.addEventListener("scroll", handle, { passive: true });
    }
    window.addEventListener("resize", handle, { passive: true });

    const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    mq.addEventListener?.("change", handle);

    // Font betöltés után is mérjünk
    document.fonts?.ready?.then(() => doMeasure()).catch(() => {});

    return () => {
      ro.disconnect();
      if (trackScroll) window.removeEventListener("scroll", handle);
      window.removeEventListener("resize", handle);
      mq.removeEventListener?.("change", handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackScroll]);

  // Lokális kompozitálás/rétegezés a drift ellen
  const styleAll: React.CSSProperties = {
    ...styleVars,
    position: "relative",
    contain: "layout",
    isolation: isolate ? "isolate" : undefined,
    zIndex, // ← teljes panel z-index
  };

  // Underlay beállítások
  const underlayEnabled = !!underlay?.enabled;
  const underlayStyle: React.CSSProperties | undefined = underlayEnabled
    ? {
        position: "absolute",
        // csak a belső (content) területet takarjuk, ne a border-image-et:
        top: `calc(var(--ns-bw-top) + var(--ns-pad-top))`,
        right: `calc(var(--ns-bw-right) + var(--ns-pad-right))`,
        bottom: `calc(var(--ns-bw-bottom) + var(--ns-pad-bottom))`,
        left: `calc(var(--ns-bw-left) + var(--ns-pad-left))`,
        background: underlay?.background ?? "rgba(0,0,0,0.25)",
        opacity: underlay?.opacity ?? (underlay?.background ? 1 : 1),
        pointerEvents: "none",
        zIndex: 1,
      }
    : undefined;

  return (
    <div ref={rootRef} className={`${s.panel} ${className || ""}`} style={styleAll}>
      {/* Opcionális belső fedőréteg (content alatt) */}
      {underlayEnabled && <div style={underlayStyle} aria-hidden />}

      {/* BACKDROP: ide jön pl. a RuneDock, garantáltan a keret ÉS a content mögött */}
      {backdrop && (
        <div className={s.backdrop} aria-hidden>
          {backdrop}
        </div>
      )}

      {/* Keret (border-image) */}
      <div className={s.frame} style={{ zIndex: 2 }} aria-hidden />

      {/* Tartalom */}
      <div
        ref={contentRef}
        className={s.content}
        style={{
          position: "relative",
          zIndex: 3,
        }}
      >
        {children}
      </div>

      {/* Opcionális: vizuális anchor-doboz (debughoz)
      <div className={s.anchorDebug} aria-hidden /> */}
    </div>
  );
}
