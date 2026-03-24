"use client";

import { useEffect } from "react";
import type { MutableRefObject } from "react";

import {
  inferTerminalPagesFromStory,
  setTerminalPages,
  trackPageEnter,
  trackPageExit,
} from "../../lib/analytics";

type PageAnalyticsData = {
  id?: string;
  type?: string;
  endAlias?: string;
};

type UseStoryPageAnalyticsParams = {
  derivedStoryId?: string;
  derivedSessionId?: string;
  derivedRunId?: string;
  currentPageId?: string;
  pageData?: PageAnalyticsData | null;
  lastPageRef: MutableRefObject<string | null>;
  enterTsRef: MutableRefObject<number | null>;
  globals?: Record<string, unknown>;
};

function getLoadedStory(globals?: Record<string, unknown>): unknown {
  if (!globals) return undefined;
  return (
    globals.loadedStory ??
    globals.storyJson ??
    globals.storyData ??
    globals.story
  );
}

export function useStoryPageAnalytics({
  derivedStoryId,
  derivedSessionId,
  derivedRunId,
  currentPageId,
  pageData,
  lastPageRef,
  enterTsRef,
  globals,
}: UseStoryPageAnalyticsParams): void {
  useEffect(() => {
    if (!derivedStoryId || !derivedSessionId) return;

    const pageId = currentPageId || pageData?.id;
    if (!pageId) return;

    const fallbackEndAlias =
      typeof pageData?.id === "string" && pageData.id.startsWith("end_")
        ? pageData.id.slice(4)
        : undefined;

    const normalizedPageType =
      pageData?.type || (fallbackEndAlias ? "end" : undefined);

    const normalizedEndAlias = pageData?.endAlias || fallbackEndAlias;

    if (lastPageRef.current && enterTsRef.current != null) {
      const dwell = Date.now() - enterTsRef.current;
      try {
        trackPageExit(
          derivedStoryId,
          derivedSessionId,
          lastPageRef.current,
          Math.max(0, dwell)
        );
      } catch {}
    }

    try {
      trackPageEnter(
        derivedStoryId,
        derivedSessionId,
        pageId,
        lastPageRef.current ?? undefined,
        {
          runId: derivedRunId || undefined,
          rawPageId: pageData?.id,
          pageType: normalizedPageType,
          endAlias: normalizedEndAlias,
        }
      );
    } catch {}

    enterTsRef.current = Date.now();
    lastPageRef.current = pageId;

    return () => {
      if (!lastPageRef.current || enterTsRef.current == null) return;
      const dwell = Date.now() - enterTsRef.current;
      try {
        trackPageExit(
          derivedStoryId,
          derivedSessionId,
          lastPageRef.current,
          Math.max(0, dwell)
        );
      } catch {}
      enterTsRef.current = null;
      lastPageRef.current = null;
    };
  }, [
    derivedStoryId,
    derivedSessionId,
    currentPageId,
    derivedRunId,
    pageData?.id,
    pageData?.type,
    pageData?.endAlias,
    lastPageRef,
    enterTsRef,
  ]);

  useEffect(() => {
    if (!derivedStoryId || !derivedSessionId) return;

    const onHide = () => {
      if (document.visibilityState !== "hidden") return;
      if (!lastPageRef.current || enterTsRef.current == null) return;
      const dwell = Date.now() - enterTsRef.current;
      try {
        trackPageExit(
          derivedStoryId,
          derivedSessionId,
          lastPageRef.current,
          Math.max(0, dwell)
        );
      } catch {}
      enterTsRef.current = Date.now();
    };

    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [derivedStoryId, derivedSessionId, lastPageRef, enterTsRef]);

  useEffect(() => {
    if (!derivedStoryId) return;

    const storyJson = getLoadedStory(globals);
    if (!storyJson) return;

    const terminals = inferTerminalPagesFromStory(storyJson);
    if (terminals.length) {
      setTerminalPages(derivedStoryId, terminals);
    }
  }, [derivedStoryId, globals]);
}
