"use client";

import { useEffect } from "react";

type SearchParamsLike = {
  get(name: string): string | null;
};

type UseStoryPageBootstrapParams = {
  params: SearchParamsLike;
  currentPageId?: string;
  goToNextPage: (id: string) => void;
  setGlobal?: (key: string, value: string) => void;
  setStorySrc?: (src: string) => void;
};

export function useStoryPageBootstrap({
  params,
  currentPageId,
  goToNextPage,
  setGlobal,
  setStorySrc,
}: UseStoryPageBootstrapParams): void {
  useEffect(() => {
    const src = params.get("src");
    const start = params.get("start");
    const title = params.get("title");
    const rs = params.get("rs") || "";

    if (src) {
      setStorySrc?.(src);
    }

    if (title) {
      setGlobal?.("storyTitle", title);
      try {
        localStorage.setItem("storyTitle", title);
      } catch {}
    }

    if (start) {
      setGlobal?.("startPageId", start);
      try {
        localStorage.setItem("startPageId", start);
      } catch {}
    }

    if (rs) {
      setGlobal?.("runKey", rs);
      try {
        localStorage.setItem("runKey", rs);
      } catch {}
    }

    if (start && start !== currentPageId) {
      try {
        localStorage.setItem("currentPageId", start);
      } catch {}
      goToNextPage(start);
    }
  }, [params, currentPageId, goToNextPage, setGlobal, setStorySrc]);
}
