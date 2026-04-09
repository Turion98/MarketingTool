"use client";

import type { RefObject } from "react";
import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import {
  buildPageObjectRangeMap,
  rangesForPageIds,
} from "@/app/lib/editor/jsonPageOffsets";
import {
  CATEGORY_LABELS,
  EDITOR_CATEGORY_ORDER,
  type EditorPageCategory,
  flattenStoryPages,
  groupPagesByCategory,
} from "@/app/lib/editor/storyPagesFlatten";
import {
  insertStoryTemplate,
  TEMPLATE_LABELS,
  type StoryTemplateKey,
} from "@/app/lib/editor/storyTemplateInsert";
import s from "./editor.module.scss";

type EditorOutlineProps = {
  draftStory: Record<string, unknown>;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  activeCategory: EditorPageCategory | null;
  onActiveCategoryChange: (c: EditorPageCategory | null) => void;
  onStoryReplaced: (nextStory: Record<string, unknown>, json: string) => void;
};

/** Minden szerkesztői típus mindig látható; a szám a jelenlegi JSON-ból jön. */
const CATEGORY_ORDER: EditorPageCategory[] = [
  "narrative1",
  "narrativeN",
  "puzzleRiddle",
  "puzzleRunes",
  "puzzleRoute",
  "poolRoute",
  "logic",
  "conditionalRouting",
  "transition",
  "other",
];

function scrollTextareaToSelection(el: HTMLTextAreaElement, pos: number) {
  const text = el.value;
  const line = text.slice(0, pos).split("\n").length;
  const lineHeight =
    parseFloat(getComputedStyle(el).lineHeight || "20") || 20;
  const pad = parseFloat(getComputedStyle(el).paddingTop) || 0;
  el.scrollTop = Math.max(0, (line - 2) * lineHeight - pad);
}

export default function EditorOutline({
  draftStory,
  textareaRef,
  activeCategory,
  onActiveCategoryChange,
  onStoryReplaced,
}: EditorOutlineProps) {
  const [highlightIdx, setHighlightIdx] = useState(0);

  const flat = useMemo(() => flattenStoryPages(draftStory), [draftStory]);
  const grouped = useMemo(() => groupPagesByCategory(flat), [flat]);

  const categoryPageIds = useMemo(() => {
    if (!activeCategory) return [];
    return grouped[activeCategory].map((p) => p.id);
  }, [activeCategory, grouped]);

  const getRanges = useCallback(() => {
    const raw = textareaRef.current?.value ?? "";
    if (!activeCategory || categoryPageIds.length === 0) return [];
    const map = buildPageObjectRangeMap(raw);
    return rangesForPageIds(categoryPageIds, map);
  }, [activeCategory, categoryPageIds, textareaRef]);

  const applySelection = useCallback(
    (idx: number) => {
      const el = textareaRef.current;
      if (!el) return;
      const ranges = getRanges();
      if (ranges.length === 0) return;
      const i = ((idx % ranges.length) + ranges.length) % ranges.length;
      const { start, end } = ranges[i]!;
      el.focus();
      el.setSelectionRange(start, end);
      scrollTextareaToSelection(el, start);
    },
    [getRanges, textareaRef]
  );

  useLayoutEffect(() => {
    if (!activeCategory) return;
    const ranges = getRanges();
    if (ranges.length === 0) return;
    applySelection(highlightIdx);
  }, [activeCategory, highlightIdx, applySelection, getRanges]);

  const onTemplate = (key: StoryTemplateKey) => {
    const next = insertStoryTemplate(draftStory, key);
    const json = JSON.stringify(next, null, 2);
    onStoryReplaced(next, json);
  };

  const rangeCount = activeCategory ? getRanges().length : 0;

  return (
    <div className={s.outlineWrap}>
      <details className={s.outlineDetails}>
        <summary className={s.outlineSummary}>
          Oldaltípusok (szerkesztő)
          <span className={s.outlineBadge}>{flat.length} oldal</span>
        </summary>
        <div className={s.outlineBody}>
          <div className={s.categoryScroll}>
            {EDITOR_CATEGORY_ORDER.map((cat) => {
              const list = grouped[cat];
              const active = activeCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  className={`${s.categoryChip} ${active ? s.categoryChipActive : ""}`}
                  onClick={() => {
                    setHighlightIdx(0);
                    onActiveCategoryChange(active ? null : cat);
                  }}
                >
                  {CATEGORY_LABELS[cat]}
                  <span className={s.chipCount}>{list.length}</span>
                </button>
              );
            })}
          </div>

          {activeCategory ? (
            <div className={s.highlightBar}>
              <span className={s.highlightMeta}>
                Kijelölés: teljes oldal-objektum — {CATEGORY_LABELS[activeCategory]}
                {rangeCount === 0
                  ? " — nincs ilyen típus a jelenlegi JSON-ban"
                  : ` — ${rangeCount} db · Előző / Következő = másik oldal ugyanabban a típusban`}
              </span>
              {rangeCount > 1 ? (
                <div className={s.highlightNav}>
                  <button
                    type="button"
                    className={s.btnTiny}
                    onClick={() => setHighlightIdx((i) => i - 1)}
                  >
                    ← Előző oldal
                  </button>
                  <button
                    type="button"
                    className={s.btnTiny}
                    onClick={() => setHighlightIdx((i) => i + 1)}
                  >
                    Következő oldal →
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </details>

      <details className={s.outlineDetails}>
        <summary className={s.outlineSummary}>
          Oldal sablonok
          <span className={s.outlineHint}>+ beszúrás a pages végére</span>
        </summary>
        <div className={s.templateScroll}>
          {(Object.keys(TEMPLATE_LABELS) as StoryTemplateKey[]).map((k) => (
            <button
              key={k}
              type="button"
              className={s.templateBtn}
              onClick={() => onTemplate(k)}
            >
              {TEMPLATE_LABELS[k]}
            </button>
          ))}
        </div>
      </details>
    </div>
  );
}
