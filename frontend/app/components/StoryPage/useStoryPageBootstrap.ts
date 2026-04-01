"use client";

import { useEffect, useRef } from "react";

type SearchParamsLike = {
  get(name: string): string | null;
};

type UseStoryPageBootstrapParams = {
  params: SearchParamsLike;
  goToNextPage: (id: string) => void;
  setGlobal?: (key: string, value: string) => void;
  setStorySrc?: (src: string) => void;
};

export function useStoryPageBootstrap({
  params,
  goToNextPage,
  setGlobal,
  setStorySrc,
}: UseStoryPageBootstrapParams): void {
  /**
   * Utolsó alkalmazott (src + start) pár — játék közben ne fusson újra;
   * más történet / más URL `start` esetén viszont igen (pl. két embed ugyanazzal a start id-vel).
   */
  const appliedBootstrapKeyRef = useRef<string | null>(null);

  /** Primitívek: a `params` objektum referenciája Next-ben renderenként változhat → ne kössük effekthez. */
  const srcQ = params.get("src");
  const startQ = params.get("start");
  const titleQ = params.get("title");
  const rsQ = params.get("rs") || "";

  useEffect(() => {
    const src = srcQ;
    const start = startQ;
    const title = titleQ;
    const rs = rsQ;

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

    if (!start) return;

    const bootstrapKey = `${src ?? ""}\0${start}`;
    if (appliedBootstrapKeyRef.current === bootstrapKey) return;

    appliedBootstrapKeyRef.current = bootstrapKey;
    try {
      localStorage.setItem("currentPageId", start);
    } catch {}
    goToNextPage(start);
  }, [srcQ, startQ, titleQ, rsQ, goToNextPage, setGlobal, setStorySrc]);
}
