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
  const { setGlobalError } = useGameState();

  const [fadeIn, setFadeIn] = useState(false);
  const [showAnticipation, setShowAnticipation] = useState(false);
  const [displayedSrc, setDisplayedSrc] = useState<string | null>(null);
  const [terminalError, setTerminalError] = useState<string | null>(null);

  const imgFit = typeof params?.objectFit === "string" ? params.objectFit : "contain";

  const shouldGenerate = imageTiming?.generate !== false && !terminalError;
  const effectivePrompt = shouldGenerate ? (prompt ?? "") : "";

  const cache = useImageCache({
    enabled: shouldGenerate,
    pageId,
    prompt: effectivePrompt,
    params,
    mode,
  });

  const { imageUrl, loading, error } = adaptCacheResult(cache);

  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => setShowAnticipation(true), 600);
    return () => clearTimeout(t);
  }, [loading]);

  useEffect(() => {
    if (imageUrl && imageUrl.trim().length > 0) {
      setDisplayedSrc(imageUrl);
      setTerminalError(null);
    }
  }, [imageUrl]);

  useEffect(() => {
    if (!error) return;
    setGlobalError?.(String(error));
    if (isTerminalError(error)) {
      setTerminalError(String(error));
      if (!displayedSrc) setDisplayedSrc(FALLBACK_SRC);
    }
  }, [error, displayedSrc, setGlobalError]);

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
      {(showAnticipation || loading) && !terminalError && (
        <div className={styles.anticipationText}>A vision is forming…</div>
      )}
    </div>
  );
};

export default GeneratedImage_with_fadein;
