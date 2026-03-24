"use client";

import { useEffect, useMemo } from "react";
import type { MutableRefObject } from "react";

import { resolveCta } from "../../core/cta/ctaResolver";
import type { CtaConfig, CtaContext, CampaignConfig } from "../../core/cta/ctaTypes";

import { normalizeAssetUrl } from "./storyPageText";

type RecordValue = Record<string, unknown>;
type StoryMeta = RecordValue & {
  title?: string;
  logo?: string;
  campaignId?: string;
  endDefaultCta?: string;
  ctaPresets?: Record<string, unknown>;
};

type StoryPageEndData = {
  id?: string;
  type?: string;
  title?: string;
  endAlias?: string;
  endMeta?: unknown;
  endCta?: unknown;
  cta?: unknown;
  meta?: unknown;
};

type ExtendedCtaContext = CtaContext & {
  endId?: string;
  endAlias?: string;
};

type UseStoryPageEndStateParams = {
  derivedStoryId?: string;
  derivedSessionId?: string;
  currentPageId?: string;
  pageData?: StoryPageEndData | null;
  globals?: Record<string, unknown>;
  endTrackedRef: MutableRefObject<boolean>;
};

type UseStoryPageEndStateResult = {
  endCtaContext: ExtendedCtaContext;
  resolvedEndCta: CtaConfig;
  meta: StoryMeta | null;
  titleText: string;
  logoUrl: string;
};

function asRecord(value: unknown): RecordValue | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as RecordValue;
}

function getNestedRecord(source: RecordValue | undefined, key: string): RecordValue | undefined {
  return asRecord(source?.[key]);
}

function getNestedMeta(source: RecordValue | undefined, key: string): RecordValue | undefined {
  return asRecord(getNestedRecord(source, key)?.meta);
}

export function useStoryPageEndState({
  derivedStoryId,
  derivedSessionId,
  currentPageId,
  pageData,
  globals,
  endTrackedRef,
}: UseStoryPageEndStateParams): UseStoryPageEndStateResult {
  useEffect(() => {
    if (!derivedStoryId || !derivedSessionId) return;

    const isEnd =
      pageData?.type === "end" ||
      (typeof pageData?.id === "string" && pageData.id.startsWith("end_"));

    if (!isEnd) {
      endTrackedRef.current = false;
      return;
    }

    if (endTrackedRef.current) return;
    endTrackedRef.current = true;
  }, [derivedStoryId, derivedSessionId, pageData?.id, pageData?.type, endTrackedRef]);

  const endCtaContext = useMemo<ExtendedCtaContext>(
    () => ({
      campaignId: derivedStoryId || "unknown_campaign",
      nodeId: pageData?.id || currentPageId || "unknown_node",
      sessionId: derivedSessionId || undefined,
      endId: pageData?.id,
      endAlias: pageData?.endAlias,
      lang: typeof globals?.lang === "string" ? globals.lang : undefined,
      abVariant:
        typeof globals?.abVariant === "string" ? globals.abVariant : null,
      path:
        typeof window !== "undefined" ? window.location.pathname : undefined,
    }),
    [
      derivedStoryId,
      pageData?.id,
      pageData?.endAlias,
      currentPageId,
      derivedSessionId,
      globals?.lang,
      globals?.abVariant,
    ]
  );

  const nodeEndMeta = useMemo(() => {
    const endMeta = pageData?.endMeta;
    if (endMeta) return endMeta;
    const legacy = pageData?.endCta || pageData?.cta;
    return legacy ? { cta: legacy } : undefined;
  }, [pageData?.endMeta, pageData?.endCta, pageData?.cta]);

  const meta = useMemo<StoryMeta | null>(() => {
    const globalsRecord = globals;

    return (
      (asRecord(pageData?.meta) as StoryMeta | undefined) ??
      (asRecord(globalsRecord?.meta) as StoryMeta | undefined) ??
      (getNestedMeta(globalsRecord, "campaign") as StoryMeta | undefined) ??
      null
    );
  }, [pageData?.meta, globals]);

  const campaignCfg = useMemo<CampaignConfig | undefined>(() => {
    const globalsRecord = globals ?? {};

    const metaCandidates = [
      asRecord(pageData?.meta),
      asRecord(globalsRecord.meta),
      getNestedMeta(globalsRecord, "campaign"),
      getNestedMeta(globalsRecord, "story"),
      asRecord(globalsRecord.storyMeta),
      getNestedMeta(globalsRecord, "source"),
      getNestedMeta(globalsRecord, "storyConfig"),
      getNestedMeta(globalsRecord, "loadedStory"),
      getNestedMeta(globalsRecord, "storyData"),
      getNestedMeta(globalsRecord, "storyJson"),
    ].filter((value): value is RecordValue => Boolean(value));

    const metaWithPresets = metaCandidates.find(
      (candidate) => candidate.ctaPresets != null
    );
    const metaFromSources = metaWithPresets ?? metaCandidates[0] ?? null;

    if (metaFromSources && typeof globalsRecord.meta === "undefined") {
      try {
        (globalsRecord as RecordValue).meta = metaFromSources;
      } catch {}
    }

    const storyRecord = getNestedRecord(globalsRecord, "story");
    const presets =
      asRecord(metaFromSources?.ctaPresets) ??
      asRecord(globalsRecord.ctaPresets) ??
      asRecord(globalsRecord.campaignCtaPresets) ??
      asRecord(storyRecord?.ctaPresets) ??
      undefined;

    const endDefaultCta =
      typeof metaFromSources?.endDefaultCta === "string"
        ? metaFromSources.endDefaultCta
        : typeof globalsRecord.endDefaultCta === "string"
          ? globalsRecord.endDefaultCta
          : typeof globalsRecord.campaignEndDefaultCta === "string"
            ? globalsRecord.campaignEndDefaultCta
            : typeof storyRecord?.endDefaultCta === "string"
              ? storyRecord.endDefaultCta
              : undefined;

    const campaignId =
      typeof metaFromSources?.campaignId === "string"
        ? metaFromSources.campaignId
        : typeof globalsRecord.campaignId === "string"
          ? globalsRecord.campaignId
          : typeof storyRecord?.campaignId === "string"
            ? storyRecord.campaignId
            : derivedStoryId ?? "unknown_campaign";

    if (!campaignId && !presets && !endDefaultCta) return undefined;

    if (!presets) {
      console.warn("[CTA] No ctaPresets found. Using engine default.");
    }

    return {
      campaignId,
      ctaPresets: presets as CampaignConfig["ctaPresets"],
      endDefaultCta,
    };
  }, [pageData?.meta, globals, derivedStoryId]);

  const engineDefaultEndCta = useMemo(
    () => ({ kind: "restart", label: "Play again" } as const),
    []
  );

  const resolvedEndCta = useMemo(
    () =>
      resolveCta(
        nodeEndMeta,
        campaignCfg,
        engineDefaultEndCta,
        endCtaContext
      ),
    [nodeEndMeta, campaignCfg, engineDefaultEndCta, endCtaContext]
  );

  const titleText = useMemo(() => {
    const storyTitle =
      typeof globals?.storyTitle === "string" ? globals.storyTitle : undefined;
    return (
      (typeof meta?.title === "string" ? meta.title : undefined) ||
      storyTitle ||
      pageData?.title ||
      derivedStoryId ||
      "default_story"
    );
  }, [meta?.title, globals?.storyTitle, pageData?.title, derivedStoryId]);

  const logoUrl = useMemo(() => {
    const raw =
      (typeof meta?.logo === "string" ? meta.logo : undefined) ??
      (typeof globals?.logo === "string" ? globals.logo : undefined) ??
      null;
    const url = normalizeAssetUrl(raw);
    if (!url && process.env.NODE_ENV !== "production") {
      console.warn("No logo in meta/globals. Using default_logo.png");
    }
    return url ?? "/assets/default_logo.png";
  }, [meta?.logo, globals?.logo]);

  return {
    endCtaContext,
    resolvedEndCta,
    meta,
    titleText,
    logoUrl,
  };
}
