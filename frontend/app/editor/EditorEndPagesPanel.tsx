"use client";

import { useEffect, useMemo, useState } from "react";
import { findPageInStoryDocument } from "@/app/lib/editor/findPageInStory";
import { collectEndPageIdsFromStory } from "@/app/lib/editor/storyGraphLayout";
import s from "./editor.module.scss";

const LS_END_PANEL = "questell:editor:endPagesPanelExpanded";

type EditorEndPagesPanelProps = {
  draftStory: Record<string, unknown>;
  selectedPageId: string | null;
  onSelectPageId: (id: string) => void;
};

export default function EditorEndPagesPanel({
  draftStory,
  selectedPageId,
  onSelectPageId,
}: EditorEndPagesPanelProps) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    try {
      if (localStorage.getItem(LS_END_PANEL) === "0") setOpen(false);
    } catch {
      /* ignore */
    }
  }, []);

  const endIds = useMemo(
    () => collectEndPageIdsFromStory(draftStory),
    [draftStory]
  );

  if (endIds.length === 0) return null;

  const toggle = () => {
    setOpen((v) => {
      const next = !v;
      try {
        localStorage.setItem(LS_END_PANEL, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <div className={`${s.panel} ${s.previewPanel} ${s.endPagesPanelRoot}`}>
      <button
        type="button"
        className={`${s.panelHeader} ${s.previewPanelToggle}`}
        aria-expanded={open}
        aria-controls="editor-end-pages-body"
        onClick={toggle}
      >
        <span className={s.stackPanelToggleTitle}>
          <span className={s.stackPanelToggleMain}>Végoldalak</span>
          <span className={s.stackPanelToggleSubMuted}>
            {endIds.length} db — kattintás: kijelölés az inspectorban
          </span>
        </span>
        <span className={s.previewPanelToggleChevron} aria-hidden>
          {open ? "▼" : "▶"}
        </span>
      </button>
      <div
        id="editor-end-pages-body"
        className={s.endPagesPanelBody}
        hidden={!open}
      >
        <ul className={s.endPagesPanelList}>
          {endIds.map((id) => {
            const p = findPageInStoryDocument(draftStory, id);
            const title =
              typeof p?.title === "string" && p.title.trim()
                ? p.title.trim()
                : id;
            const sel = selectedPageId === id;
            return (
              <li key={id}>
                <button
                  type="button"
                  className={`${s.endPagesPanelRow} ${sel ? s.endPagesPanelRowSelected : ""}`}
                  onClick={() => onSelectPageId(id)}
                >
                  <span className={s.endPagesPanelId}>{id}</span>
                  <span className={s.endPagesPanelTitle}>{title}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
