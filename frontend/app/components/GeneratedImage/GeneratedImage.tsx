// app/components/GeneratedImage/GeneratedImage.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import styles from "./GeneratedImage.module.scss";
import { useGameState } from "../../lib/GameStateContext";
import {
  normalizeImagePromptInput,
  useImageCache,
} from "../../lib/useImageCache";
import type {
  ImageCacheResult,
  ImagePromptInput,
  ImageRequestParams,
  ImageRootVars,
} from "../../lib/imageTypes";

type GeneratedImageProps = {
  pageId: string;
  prompt?: ImagePromptInput;
  params?: ImageRequestParams;
  imageTiming?: { generate?: boolean; delayMs?: number };
  mode?: "draft" | "refine";
  pageIsFadingOut?: boolean;
  /** parent: nincs saját fade animáció – a szülő (pl. vége CTA cluster) vezérli a megjelenést */
  imageEntrance?: "internal" | "parent";
};

const FALLBACK_SRC = "/assets/FallBack_image.png";

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
  pageIsFadingOut = false,
  imageEntrance = "internal",
}) => {
  // 🔹 reward flag beépítése
  const { setGlobalError, imageApiKey, setRewardImageReady } = useGameState();

  // vizuális state-ek
  const [fadeIn, setFadeIn] = useState(false);
  const [displayedSrc, setDisplayedSrc] = useState<string | null>(null);
  const [terminalError, setTerminalError] = useState<string | null>(null);
  const [showAnticipation, setShowAnticipation] = useState(false);

  const imgFit =
    typeof params?.objectFit === "string" ? params.objectFit : "contain";

  const shouldGenerate = imageTiming?.generate !== false && !terminalError;
  const normalizedPrompt = shouldGenerate
    ? normalizeImagePromptInput(prompt)
    : "";

  // kép betöltés / cache
  const cache: ImageCacheResult = useImageCache({
    enabled: shouldGenerate,
    pageId,
    prompt: normalizedPrompt,
    params,
    mode,
    apiKey: imageApiKey,
  });

  const { imageUrl, loading, error } = cache;

  /** OLDALVÁLTÁS – csak a “Kép előkészítése…” jelzést reseteljük */
  useEffect(() => {
    setShowAnticipation(true);
    setFadeIn(false);
  }, [pageId]);

  /**
   * LOADING állapot:
   * - ha tölt, egy kis késés után mutassuk az anticipation-t
   * - ha nem tölt már: elrejtjük
   */
  useEffect(() => {
    if (loading) {
      const t = setTimeout(() => setShowAnticipation(true), 300);
      return () => clearTimeout(t);
    }
    setShowAnticipation(false);
  }, [loading]);

  /**
   * ÚJ KÉP ÉRKEZETT
   */
  useEffect(() => {
    if (imageUrl && imageUrl.trim().length > 0) {
      const FRONT_ORIGIN =
        (typeof window !== "undefined" && window.location.origin) ||
        "http://localhost:3000";

      let finalUrl = imageUrl.trim();

      // backend által adott abszolút URL → frontend image proxy
      if (finalUrl.startsWith("http://127.0.0.1:8000/generated/images/")) {
        finalUrl = `${FRONT_ORIGIN}/api/image/${finalUrl.replace(
          "http://127.0.0.1:8000/generated/images/",
          ""
        )}`;
      } else if (finalUrl.startsWith("/generated/images/")) {
        finalUrl = `${FRONT_ORIGIN}/api/image/${finalUrl.replace(
          "/generated/images/",
          ""
        )}`;
      }

      setDisplayedSrc((prev) => {
        if (prev === finalUrl) return prev;
        return finalUrl;
      });

      setTerminalError(null);
    }
  }, [imageUrl]);

  /** HIBA → fallback */
  useEffect(() => {
    if (!error) return;
    setGlobalError?.(String(error));

    if (isTerminalError(error)) {
      setTerminalError(String(error));
      if (!displayedSrc) {
        setDisplayedSrc(FALLBACK_SRC);
      }
    }
  }, [error, displayedSrc, setGlobalError]);

  /** KÉP SAJÁT FADE-INJE */
  useEffect(() => {
    if (!displayedSrc) return;
    setFadeIn(false);
    const t = setTimeout(() => setFadeIn(true), 30);
    return () => clearTimeout(t);
  }, [displayedSrc]);

  const useInternalFade =
    imageEntrance === "internal" && Boolean(fadeIn);

  const imgClass =
    displayedSrc != null
      ? [
          styles.generatedImage,
          imageEntrance === "parent"
            ? styles.parentEntrance
            : useInternalFade
              ? styles.fadeIn
              : "",
          pageIsFadingOut ? styles.fadeOut : "",
        ]
          .filter(Boolean)
          .join(" ")
      : styles.generatedImage;

  const rootVars = useMemo<ImageRootVars>(
    () => ({ "--gi-fit": imgFit }),
    [imgFit]
  );

  return (
    <div className={styles.imageRoot} style={rootVars} data-page={pageId}>
      <div className={styles.imageFrameInner}>
        <div className={styles.imageRatio}>
          {displayedSrc ? (
            <img
              key={displayedSrc}
              src={displayedSrc}
              alt=""
              className={imgClass}
              draggable={false}
              crossOrigin="anonymous"

              // 🔹 Reward jelzés: ha sikeresen betölt, jelez a GameState-nek
              onLoad={() => setRewardImageReady(true)}
              onError={(e) => {
                if (displayedSrc !== FALLBACK_SRC) {
                  e.currentTarget.src = FALLBACK_SRC;
                  setDisplayedSrc(FALLBACK_SRC);
                }
              }}
            />
          ) : null}

          {!displayedSrc && showAnticipation ? (
            <div className={styles.anticipationText}>Kép előkészítése…</div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default GeneratedImage_with_fadein;
