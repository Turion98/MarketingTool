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
  pageIsFadingOut?: boolean;
};

const FALLBACK_SRC = "/assets/FallBack_image.png";

/**
 * prompt normalizálás – elfogadja az objektumos promptot is
 */
function normalizePrompt(p: any): string {
  if (!p) return "";
  if (typeof p === "string") return p.trim();
  if (typeof p === "object") {
    if (p.combinedPrompt) {
      const base = String(p.combinedPrompt).trim();
      return p.negativePrompt
        ? `${base}, Negative: ${String(p.negativePrompt).trim()}`
        : base;
    }
    const parts: string[] = [];
    if (p.global) parts.push(String(p.global).trim());
    if (p.chapter) parts.push(String(p.chapter).trim());
    if (p.page) parts.push(String(p.page).trim());
    let base = parts.join(", ");
    if (p.negativePrompt) {
      base = `${base}, Negative: ${String(p.negativePrompt).trim()}`;
    }
    return base.trim();
  }
  return String(p).trim();
}

/**
 * a useImageCache többféle formában adhat vissza adatot
 */
function adaptCacheResult(cache: any) {
  if (Array.isArray(cache)) {
    const [state, actions] = cache ?? [];
    return {
      imageUrl:
        state?.url ??
        state?.src ??
        state?.imageUrl ??
        state?.data?.url ??
        state?.data?.src ??
        undefined,
      loading:
        !!state?.loading || !!state?.isLoading || state?.status === "loading",
      error: state?.error ?? state?.err ?? state?.data?.error ?? null,
      retry:
        actions?.retry ??
        actions?.refetch ??
        actions?.reload ??
        actions?.refresh,
    };
  }
  return {
    imageUrl:
      cache?.url ??
      cache?.src ??
      cache?.imageUrl ??
      cache?.data?.url ??
      cache?.data?.src ??
      undefined,
    loading:
      !!cache?.loading || !!cache?.isLoading || cache?.status === "loading",
    error: cache?.error ?? cache?.err ?? cache?.data?.error ?? null,
    retry: cache?.retry ?? cache?.refetch ?? cache?.reload ?? cache?.refresh,
  };
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
  pageIsFadingOut = false,
}) => {
  const { setGlobalError, imageApiKey } = useGameState();

  // vizuális state-ek
  const [fadeIn, setFadeIn] = useState(false);
  const [displayedSrc, setDisplayedSrc] = useState<string | null>(null);
  const [terminalError, setTerminalError] = useState<string | null>(null);
  const [showAnticipation, setShowAnticipation] = useState(false);
  const [isFrameOpen, setIsFrameOpen] = useState(false);
  const [didMount, setDidMount] = useState(false);

  const imgFit =
    typeof params?.objectFit === "string" ? params.objectFit : "contain";

  // csak akkor próbáljon képet beszerezni, ha engedélyezett és nincs végleges hibánk
  const shouldGenerate = imageTiming?.generate !== false && !terminalError;
  const normalizedPrompt = shouldGenerate ? normalizePrompt(prompt) : "";

  // kép betöltés / cache
  const cache = useImageCache({
    enabled: shouldGenerate,
    pageId,
    prompt: normalizedPrompt,
    params,
    mode,
    apiKey: imageApiKey,
  });

  const { imageUrl, loading, error } = adaptCacheResult(cache);

  // első render
  useEffect(() => {
    setDidMount(true);
  }, []);

  /**
   * OLDALVÁLTÁS
   * - keretet csukjuk be
   * - de a KÉPET NEM szedjük le azonnal → ha nem jön új kép, legalább a régi látszik
   */
  useEffect(() => {
    setIsFrameOpen(false);
    // jelezzük, hogy “dolgozik”
    setShowAnticipation(true);
  }, [pageId]);

  /**
   * LOADING állapot:
   * - ha tölt, egy kis késés után mutassuk az anticipation-t
   * - ha nem tölt már: ha volt régi kép, akkor nyissuk ki a keretet, hogy ne legyen üres
   */
  useEffect(() => {
    if (loading) {
      const t = setTimeout(() => setShowAnticipation(true), 300);
      return () => clearTimeout(t);
    }

    // ha nem loading
    setShowAnticipation(false);

    // ha nincs új imageUrl, de volt korábban kép, ne hagyjuk zárva
    if (!loading && !imageUrl && displayedSrc) {
      setIsFrameOpen(true);
    }
  }, [loading, imageUrl, displayedSrc]);

  /**
   * ÚJ KÉP ÉRKEZETT
   * - URL normalizálás (backend → frontend proxy)
   * - displayedSrc beállítás
   * - keret kinyitás
   */
  useEffect(() => {
    if (imageUrl && imageUrl.trim().length > 0) {
      const FRONT_ORIGIN =
        (typeof window !== "undefined" && window.location.origin) ||
        "http://localhost:3000";

      let finalUrl = imageUrl.trim();

      // backend által adott abszolút URL → frontend image proxy-ra irányítjuk
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

      // ha ugyanaz a kép jött vissza, ne villogjunk
      setDisplayedSrc((prev) => {
        if (prev === finalUrl) return prev;
        return finalUrl;
      });

      // külön tickben nyissuk a keretet, hogy a transition tényleg fusson
      requestAnimationFrame(() => {
        setIsFrameOpen(true);
      });

      setTerminalError(null);
    }
  }, [imageUrl]);

  /**
   * HIBA → fallback + keret nyitva
   */
  useEffect(() => {
    if (!error) return;
    setGlobalError?.(String(error));

    if (isTerminalError(error)) {
      setTerminalError(String(error));
      if (!displayedSrc) {
        setDisplayedSrc(FALLBACK_SRC);
      }
      setIsFrameOpen(true);
    }
  }, [error, displayedSrc, setGlobalError]);

  /**
   * KÉP SAJÁT FADE-INJE
   */
  useEffect(() => {
    if (!displayedSrc) return;
    setFadeIn(false);
    const t = setTimeout(() => setFadeIn(true), 30);
    return () => clearTimeout(t);
  }, [displayedSrc]);

  const imgClass =
    displayedSrc != null
      ? [
          styles.generatedImage,
          fadeIn ? styles.fadeIn : "",
          pageIsFadingOut ? styles.fadeOut : "",
        ]
          .filter(Boolean)
          .join(" ")
      : styles.generatedImage;

  const rootVars = useMemo(
    () => ({ ["--gi-fit" as any]: imgFit }),
    [imgFit]
  );

  const shouldBeOpen = didMount && isFrameOpen;

  return (
    <div className={styles.imageRoot} style={rootVars} data-page={pageId}>
      <div
        className={
          shouldBeOpen
            ? `${styles.imageFrameInner} ${styles.imageFrameInnerOpen}`
            : styles.imageFrameInner
        }
      >
        <div className={styles.imageRatio}>
          {displayedSrc ? (
            <img
              key={displayedSrc}
              src={displayedSrc}
              alt=""
              className={imgClass}
              draggable={false}
              onError={(e) => {
                // ha a proxy 405-öt dob és emiatt nem tudja betölteni:
                if (displayedSrc !== FALLBACK_SRC) {
                  e.currentTarget.src = FALLBACK_SRC;
                  setDisplayedSrc(FALLBACK_SRC);
                  setIsFrameOpen(true);
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
