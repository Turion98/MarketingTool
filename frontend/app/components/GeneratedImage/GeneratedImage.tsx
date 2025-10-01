// app/components/GeneratedImage/GeneratedImage.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import styles from "./GeneratedImage.module.scss";
import { useGameState } from "../../lib/GameStateContext";
import { useImageCache } from "../../lib/useImageCache";

type GeneratedImageProps = {
  pageId: string;
  prompt?: string | null;
  params?: Record<string, any>;
  imageTiming?: { generate?: boolean; delayMs?: number };
  mode?: "draft" | "refine";
};

const FALLBACK_SRC = "/assets/FallBack_image.png";

const clamp = (n: number, min = 0, max = 100) =>
  Math.min(max, Math.max(min, n));

function adaptCacheResult(cache: any): {
  imageUrl: string | undefined;
  loading: boolean;
  error: unknown;
  retry?: () => void;
} {
  if (Array.isArray(cache)) {
    const [state, actions] = cache ?? [];
    const url =
      state?.url ??
      state?.src ??
      state?.imageUrl ??
      state?.data?.url ??
      state?.data?.src ??
      undefined;
    const loading =
      !!state?.loading || !!state?.isLoading || state?.status === "loading";
    const error = state?.error ?? state?.err ?? state?.data?.error ?? null;
    const retry =
      actions?.retry ?? actions?.refetch ?? actions?.reload ?? actions?.refresh;
    return { imageUrl: url, loading, error, retry };
  }

  const url =
    cache?.url ??
    cache?.src ??
    cache?.imageUrl ??
    cache?.data?.url ??
    cache?.data?.src ??
    undefined;
  const loading =
    !!cache?.loading || !!cache?.isLoading || cache?.status === "loading";
  const error = cache?.error ?? cache?.err ?? cache?.data?.error ?? null;
  const retry =
    cache?.retry ?? cache?.refetch ?? cache?.reload ?? cache?.refresh;

  return { imageUrl: url, loading, error, retry };
}

function isTerminalError(err: unknown): boolean {
  const msg = String(err || "").toLowerCase();
  if (!msg) return false;
  return (
    msg.includes("404") ||
    msg.includes("not found") ||
    msg.includes("invalid") ||
    msg.includes("forbidden") ||
    msg.includes("unauthorized")
  );
}

const GeneratedImage_with_fadein: React.FC<GeneratedImageProps> = ({
  pageId,
  prompt,
  params = {},
  imageTiming,
  mode = "draft",
}) => {
  const { setGlobalError } = useGameState();

  // vizuális állapotok
  const [fadeIn, setFadeIn] = useState(false);
  const [showAnticipation, setShowAnticipation] = useState(false);

  // megjelenített forrás
  const [displayedSrc, setDisplayedSrc] = useState<string | null>(null);
  const [fallbackUsed, setFallbackUsed] = useState(false);
  const [terminalError, setTerminalError] = useState<string | null>(null);

  // layout paraméterek
  const ratioCss =
    typeof params?.aspectRatioCss === "string" ? params.aspectRatioCss : "16 / 9";
  const padXPct = clamp(Number(params?.padXPct ?? 6));
  const padYPct = clamp(Number(params?.padYPct ?? 6));

  // keret belső innetek + object-fit
  const insetTop = Number.isFinite(params?.frameInsetTop)
    ? Number(params.frameInsetTop)
    : undefined;
  const insetRight = Number.isFinite(params?.frameInsetRight)
    ? Number(params.frameInsetRight)
    : undefined;
  const insetBottom = Number.isFinite(params?.frameInsetBottom)
    ? Number(params.frameInsetBottom)
    : undefined;
  const insetLeft = Number.isFinite(params?.frameInsetLeft)
    ? Number(params.frameInsetLeft)
    : undefined;
  const imgFit = typeof params?.objectFit === "string" ? params.objectFit : "contain";

  // generálás logika
  const shouldGenerate = imageTiming?.generate !== false && !terminalError;
  const effectivePrompt = shouldGenerate ? (prompt ?? "") : "";

  // image source via cache
  const cache = useImageCache({
    enabled: shouldGenerate,
    pageId,
    prompt: effectivePrompt,
    params,
    mode,
  });

  const { imageUrl, loading, error, retry } = adaptCacheResult(cache);

  // anticipation
  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => setShowAnticipation(true), 600);
    return () => clearTimeout(t);
  }, [loading]);

  // új generált URL
  useEffect(() => {
    if (imageUrl && imageUrl.trim().length > 0) {
      setDisplayedSrc(imageUrl);
      setFallbackUsed(false);
      setTerminalError(null);
    }
  }, [imageUrl]);

  // hibakezelés
  useEffect(() => {
    if (!error) return;
    setGlobalError?.(String(error));
    if (isTerminalError(error)) {
      setTerminalError(String(error));
      if (!displayedSrc) {
        setDisplayedSrc(FALLBACK_SRC);
        setFallbackUsed(true);
      }
    }
  }, [error, displayedSrc, setGlobalError]);

  const currentSrc: string | null = displayedSrc;

  // fade-in
  useEffect(() => {
    if (!currentSrc) return;
    setFadeIn(false);
    const t = setTimeout(() => setFadeIn(true), 30);
    return () => clearTimeout(t);
  }, [currentSrc]);

  // root container változók (.imageStage & .imageContainer használják)
  const stageVars = useMemo(
    () => ({
      ["--img-ratio" as any]: ratioCss,
      ["--pad-x" as any]: `${padXPct}%`,
      ["--pad-y" as any]: `${padYPct}%`,
    }),
    [ratioCss, padXPct, padYPct]
  );

  // viewport (belső ablak) változók
  const viewportVars = useMemo(
    () => ({
      ...(insetTop !== undefined && { ["--inset-top" as any]: `${insetTop}px` }),
      ...(insetRight !== undefined && { ["--inset-right" as any]: `${insetRight}px` }),
      ...(insetBottom !== undefined && { ["--inset-bottom" as any]: `${insetBottom}px` }),
      ...(insetLeft !== undefined && { ["--inset-left" as any]: `${insetLeft}px` }),
      ["--img-fit" as any]: imgFit,
    }),
    [insetTop, insetRight, insetBottom, insetLeft, imgFit]
  );

  const handleRetry = () => {
    setShowAnticipation(false);
    setFallbackUsed(false);
    setTerminalError(null);
    retry?.();
  };

  const showErrorUI =
    Boolean(terminalError) && currentSrc !== FALLBACK_SRC && !!currentSrc;

  return (
    <div className={styles.imageStage} style={stageVars}>
      <div className={styles.imageContainer} data-page={pageId}>
        {/* filterLayer (pl. Smoke) ide jöhet, a stage-en belül marad */}
        {/* <div className={styles.filterLayer}><SmokeField .../></div> */}

        <div className={styles.innerFrame}>
          {/* háttér keret */}
          <img
            src="/assets/frame.png"
            alt="frame"
            className={styles.frame}
            draggable={false}
          />

          {/* LOGÓ – keret fölött, kép alatt */}
          <div className={styles.logoUnderlay}>
            <img
              src="/logo.png"
              alt="logo"
              className={styles.logoImage}
              draggable={false}
            />
          </div>

          {/* a keret belső ablaka */}
          <div className={styles.innerViewport} style={viewportVars}>
            {currentSrc && (
              <img
                key={currentSrc}
                src={currentSrc}
                alt=""
                className={`${styles.generatedImage} ${fadeIn ? styles.fadeIn : ""}`}
                draggable={false}
                onError={(e) => {
                  if (currentSrc !== FALLBACK_SRC) {
                    setDisplayedSrc(FALLBACK_SRC);
                    setFallbackUsed(true);
                    e.currentTarget.src = FALLBACK_SRC;
                  }
                }}
              />
            )}
          </div>
        </div>

        {(showAnticipation || loading) && !terminalError && (
          <div className={styles.anticipationText}>A vision is forming…</div>
        )}

        {showErrorUI && (
          <div className={styles.errorOverlay}>
            <p>⚠ {terminalError}</p>
            <button onClick={handleRetry} className={styles.retryButton}>
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default GeneratedImage_with_fadein;
