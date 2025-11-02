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

  const [fadeIn, setFadeIn] = useState(false);
  const [displayedSrc, setDisplayedSrc] = useState<string | null>(null);
  const [terminalError, setTerminalError] = useState<string | null>(null);
  const [showAnticipation, setShowAnticipation] = useState(false);
  // ⬇️ ÚJ: külön state a keret nyitottságára
  const [isFrameOpen, setIsFrameOpen] = useState(false);

  const imgFit =
    typeof params?.objectFit === "string" ? params.objectFit : "contain";

  const shouldGenerate = imageTiming?.generate !== false && !terminalError;
  const normalizedPrompt = shouldGenerate ? normalizePrompt(prompt) : "";

  const cache = useImageCache({
    enabled: shouldGenerate,
    pageId,
    prompt: normalizedPrompt,
    params,
    mode,
    apiKey: imageApiKey,
  });

  const { imageUrl, loading, error } = adaptCacheResult(cache);

useEffect(() => {
  // 1) régi kép le
  setDisplayedSrc(null);
  setFadeIn(false);
  setShowAnticipation(true);

  // 2) először ZÁRD BE,
  // de úgy, hogy a browser tényleg kirajzolja zárva
  let raf1: number;
  let raf2: number;

  setIsFrameOpen(false);

  raf1 = requestAnimationFrame(() => {
    // itt már van egy paint zárt állapottal
    raf2 = requestAnimationFrame(() => {
      // itt nyitjuk ki → EZT már látja transitionként
      setIsFrameOpen(true);
    });
  });

  return () => {
    if (raf1) cancelAnimationFrame(raf1);
    if (raf2) cancelAnimationFrame(raf2);
  };
}, [pageId]);


// loader / anticipation
useEffect(() => {
  if (loading) {
    // kicsi késleltetés, hogy ne villogjon, ha 150ms alatt jön a kép
    const t = setTimeout(() => setShowAnticipation(true), 350);
    return () => clearTimeout(t);
  }

  // ha már NEM loading
  setShowAnticipation(false);

  // ⚠️ NEM csukjuk össze itt a frame-et!
  // majd csak akkor csukjuk, ha új oldalra lépünk (a pageId-s effectben),
  // vagy ha te explicit úgy döntesz.
}, [loading]);

  // új kép érkezett
  useEffect(() => {
    if (imageUrl && imageUrl.trim().length > 0) {
      const FRONT_ORIGIN =
        (typeof window !== "undefined" && window.location.origin) ||
        "http://localhost:3000";

      let finalUrl = imageUrl.trim();

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

      setDisplayedSrc(finalUrl);
      setTerminalError(null);
      // ⬇️ biztosan legyen nyitva ha már kép is van
      setIsFrameOpen(true);
    }
  }, [imageUrl]);

  // error → global + fallback
  useEffect(() => {
    if (!error) return;
    setGlobalError?.(String(error));
    if (isTerminalError(error)) {
      setTerminalError(String(error));
      if (!displayedSrc) setDisplayedSrc(FALLBACK_SRC);
      // ha fallback-et tettünk be, akkor is legyen nyitva
      setIsFrameOpen(true);
    }
  }, [error, displayedSrc, setGlobalError]);

  // fade-in az új képre
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

  const shouldBeOpen =
  isFrameOpen || loading || showAnticipation || !!displayedSrc;

return (
  <div className={styles.imageRoot} style={rootVars} data-page={pageId}>
    <div
      className={
        shouldBeOpen
          ? `${styles.imageFrameInner} ${styles.imageFrameInnerOpen}`
          : styles.imageFrameInner
      }
    >
        {displayedSrc ? (
          <img
            key={displayedSrc}
            src={displayedSrc}
            alt=""
            className={imgClass}
            draggable={false}
            onError={(e) => {
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
  );
};

export default GeneratedImage_with_fadein;
