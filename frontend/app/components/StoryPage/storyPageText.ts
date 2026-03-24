"use client";

import type { FragmentBank, FragmentRef } from "./storyPageTypes";

type TextItemRecord = {
  mode?: string;
  separator?: string;
  default?: unknown;
  ifUnlocked?: unknown;
  text?: unknown;
  ifFragment?: unknown;
  when?: unknown;
};

function asTextItems(value: unknown): TextItemRecord[] {
  return Array.isArray(value) ? value as TextItemRecord[] : [];
}

export function explodeTextToBlocks(s?: string | null): string[] {
  if (!s) return [];
  return s
    .split(/\n{2,}/g)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function normalizeAssetUrl(raw?: string | null): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("/")) return s;
  if (s.startsWith("assets/")) return "/" + s;
  return "/assets/" + s.replace(/^assets\//, "");
}

export function resolveFragmentTokens(
  raw: string,
  bankA: FragmentBank | undefined,
  refMeta: Map<string, { prefix?: string; suffix?: string }>,
  bankB?: FragmentBank
): string {
  return String(raw ?? "").replace(
    /\{fragment:([\w\-]+)\}/g,
    (_, id: string) => {
      const fragTxt =
        (bankA && bankA[id]?.text) || (bankB && bankB[id]?.text) || "";
      const meta = refMeta.get(id) || {};
      const decorated = `${meta?.prefix ?? ""}${fragTxt}${meta?.suffix ?? ""}`;
      return decorated.trim();
    }
  );
}

export function resolvePromptFragments(
  raw: string | undefined,
  unlocked: Set<string> | string[],
  bank?: FragmentBank,
  globalBank?: FragmentBank
): string {
  if (!raw) return "";
  const unlockedSet = Array.isArray(unlocked) ? new Set(unlocked) : unlocked;

  const resolved = String(raw).replace(/\{fragment:([\w\-]+)\}/g, (_, id: string) => {
    if (!unlockedSet.has(id)) return "";
    const txt = (bank?.[id]?.text || globalBank?.[id]?.text || "").trim();
    return txt;
  });

  return resolved.replace(/\s{2,}/g, " ").replace(/\s+([,.!?:;])/g, "$1").trim();
}

export function composeBlocks(
  pageData: Record<string, unknown> | null | undefined,
  unlocked: string[] | Set<string>,
  bank: FragmentBank | undefined,
  globalBank?: FragmentBank
): string[] {
  const unlockedSet = Array.isArray(unlocked) ? new Set(unlocked) : unlocked;
  const out: string[] = [];

  const refs: FragmentRef[] = Array.isArray(pageData?.fragmentRefs)
    ? pageData.fragmentRefs
    : [];
  const refMeta = new Map<string, { prefix?: string; suffix?: string }>(
    refs.map((r) => [r.id, { prefix: r.prefix, suffix: r.suffix }])
  );

  const pushOrAppend = (resolved: string, mode?: string, sep?: string) => {
    const text = (resolved ?? "").trim();
    if (!text) return;
    if (mode === "append_after" && out.length > 0) {
      out[out.length - 1] = `${out[out.length - 1]}${sep ?? "\n\n"}${text}`.trim();
    } else {
      out.push(...explodeTextToBlocks(text));
    }
  };

  let groupHasDefault = false;
  let groupDefault: string | null = null;
  let groupMatched = false;

  const startGroupWithDefault = (defStr: string) => {
    groupHasDefault = true;
    groupDefault = defStr;
    groupMatched = false;
  };

  const flushGroupIfPending = () => {
    if (groupHasDefault && !groupMatched && groupDefault) {
      pushOrAppend(groupDefault);
    }
    groupHasDefault = false;
    groupDefault = null;
    groupMatched = false;
  };

  if (Array.isArray(pageData?.text)) {
    for (const item of asTextItems(pageData.text)) {
      const mode: string | undefined = item?.mode;
      const sep: string | undefined = item?.separator;

      if (item?.default != null) {
        flushGroupIfPending();
        const resolved = resolveFragmentTokens(
          String(item.default),
          bank,
          refMeta,
          globalBank
        );
        startGroupWithDefault(resolved);
        continue;
      }

      const condId =
        typeof item?.ifUnlocked === "string" ? item.ifUnlocked : undefined;
      if (typeof condId === "string") {
        const hit = unlockedSet.has(condId);

        if (hit) {
          let resolved = resolveFragmentTokens(
            String(item.text ?? ""),
            bank,
            refMeta,
            globalBank
          ).trim();

          if (!resolved) {
            const fb =
              bank?.[condId]?.text?.trim() ||
              globalBank?.[condId]?.text?.trim() ||
              "";
            if (fb) {
              resolved = resolveFragmentTokens(
                fb,
                bank,
                refMeta,
                globalBank
              ).trim();
            }
          }

          if (resolved) {
            if (groupHasDefault) {
              if (mode === "append_after") {
                pushOrAppend(groupDefault || "");
                pushOrAppend(resolved, "append_after", sep);
              } else {
                pushOrAppend(resolved);
              }
              groupMatched = true;
              flushGroupIfPending();
            } else {
              pushOrAppend(resolved);
            }
          }
        }
        continue;
      }

      const ifFragment =
        typeof item?.ifFragment === "string" ? item.ifFragment : undefined;
      const when = typeof item?.when === "boolean" ? item.when : undefined;
      if (ifFragment && when === true) {
        const src =
          bank?.[ifFragment]?.text ||
          globalBank?.[ifFragment]?.text ||
          "";
        if (src) {
          const resolved = resolveFragmentTokens(
            String(src),
            bank,
            refMeta,
            globalBank
          );
          if (groupHasDefault) flushGroupIfPending();
          pushOrAppend(resolved);
        }
        continue;
      }

      if (typeof item?.text === "string") {
        const resolved = resolveFragmentTokens(
          item.text,
          bank,
          refMeta,
          globalBank
        );
        if (groupHasDefault) flushGroupIfPending();
        pushOrAppend(resolved);
      }
    }

    flushGroupIfPending();
  } else if (typeof pageData?.text === "string") {
    const baseResolved = resolveFragmentTokens(
      pageData.text,
      bank,
      refMeta,
      globalBank
    );
    out.push(...explodeTextToBlocks(baseResolved));
  }

  return out;
}
