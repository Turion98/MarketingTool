// app/components/GeneratedImage/GeneratedImage.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import styles from "./GeneratedImage.module.scss";
import { useGameState } from "../../lib/GameStateContext";
import { useImageCache } from "../../lib/useImageCache";

type GeneratedImageProps = {
  pageId: string;
  prompt?: string | null; // jöhet object is a page JSON-ből
  params?: Record<string, any>;
  imageTiming?: { generate?: boolean; delayMs?: number };
  mode?: "draft" | "refine";
};

const FALLBACK_SRC = "/assets/FallBack_image.png";

function normalizePrompt(p: any): string {
  if (!p) return "";
  if (typeof p === "string") return p.trim();
  if (typeof p === "object") {
    // ha van combinedPrompt → ez az első
    if (p.combinedPrompt) {
      const base = String(p.combinedPrompt).trim();
      return p.negativePrompt ? `${base}, Negative: ${String(p.negativePrompt).trim()}` : base;
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
      loading: !!state?.loading || !!state?.isLoading || state?.status === "loading",
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
    loading: !!cache?.loading || !!cache?.isLoading || cache?.status === "loading",
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

/**
 * CLEAN VERSION – the MediaFrame is the sole "sizer".
 * This component fills its parent (100%/100%) and uses object-fit.
 */
const GeneratedImage_with_fadein: React.FC<GeneratedImageProps> = ({
  pageId,
  prompt,
  params = {},
  imageTiming,
  mode = "draft",
}) => {
  const { setGlobalError, imageApiKey } = useGameState();

  const [fadeIn, setFadeIn] = useState(false);
  const [showAnticipation, setShowAnticipation] = useState(false);
  const [displayedSrc, setDisplayedSrc] = useState<string | null>(null);
  const [terminalError, setTerminalError] = useState<string | null>(null);

  const imgFit = typeof params?.objectFit === "string" ? params.objectFit : "contain";

  const shouldGenerate = imageTiming?.generate !== false && !terminalError;

  // 🔽 ITT normalizáljuk, hogy a hook már ne kapjon objectet
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

  // loader / anticipation
  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => setShowAnticipation(true), 600);
    return () => clearTimeout(t);
  }, [loading]);

  useEffect(() => {
    if (imageUrl && imageUrl.trim().length > 0) {
      const FRONT_ORIGIN =
        (typeof window !== "undefined" && window.location.origin) ||
        "http://localhost:3000";

      let finalUrl = imageUrl.trim();

      // 1) csak a tényleges backend-kép URL-eket proxizzuk
      if (finalUrl.startsWith("http://127.0.0.1:8000/generated/images/")) {
        finalUrl = `${FRONT_ORIGIN}/api/image/${finalUrl.replace(
          "http://127.0.0.1:8000/generated/images/",
          ""
        )}`;
      }
      // 2) csak a /generated/images/... kezdetűeket proxizzuk
      else if (finalUrl.startsWith("/generated/images/")) {
        finalUrl = `${FRONT_ORIGIN}/api/image/${finalUrl.replace(
          "/generated/images/",
          ""
        )}`;
      }
      // 3) MINDEN MÁST HAGYJUNK BÉKÉN

      setDisplayedSrc(finalUrl);
      setTerminalError(null);
    }
  }, [imageUrl]);

  // error → global + fallback
  useEffect(() => {
    if (!error) return;
    setGlobalError?.(String(error));
    if (isTerminalError(error)) {
      setTerminalError(String(error));
      if (!displayedSrc) setDisplayedSrc(FALLBACK_SRC);
    }
  }, [error, displayedSrc, setGlobalError]);

  // fade-in
  useEffect(() => {
    if (!displayedSrc) return;
    setFadeIn(false);
    const t = setTimeout(() => setFadeIn(true), 30);
    return () => clearTimeout(t);
  }, [displayedSrc]);

  const rootVars = useMemo(
    () => ({ ["--gi-fit" as any]: imgFit }),
    [imgFit]
  );

  return (
    <div className={styles.imageRoot} style={rootVars} data-page={pageId}>
      <div className={styles.imageFrameInner}>
        {displayedSrc && (
          <img
            key={displayedSrc}
            src={displayedSrc}
            alt=""
            className={`${styles.generatedImage} ${fadeIn ? styles.fadeIn : ""}`}
            draggable={false}
            onError={(e) => {
              if (displayedSrc !== FALLBACK_SRC) {
                e.currentTarget.src = FALLBACK_SRC;
                setDisplayedSrc(FALLBACK_SRC);
              }
            }}
          />
        )}
      </div>
    </div>
  );
};

export default GeneratedImage_with_fadein;
