"use client";

import Link from "next/link";
import Image from "next/image";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import type { PageValidationIssue } from "@/app/lib/editor/pageInspectorValidation";
import StoryPage from "@/app/components/StoryPage/StoryPage";
import {
  GameStateProvider,
  type DraftStoryResolver,
  useGameState,
} from "@/app/lib/GameStateContext";
import { collectStoryPageIds } from "@/app/lib/editor/findPageInStory";
import { findPageInStoryDocument } from "@/app/lib/editor/findPageInStory";
import { validateStoryPages as validateEditorPages } from "@/app/lib/editor/pageInspectorValidation";
import {
  classifyEditorPage,
  type EditorPageCategory,
} from "@/app/lib/editor/storyPagesFlatten";
import { saveStoryDocumentJson } from "@/app/lib/api/stories";
import {
  NEW_STORY_SRC_SENTINEL,
  createBootstrapShellDraft,
  isNewStorySentinel,
} from "@/app/lib/editor/newStoryBootstrap";
import { getClientFetchApiBase } from "@/app/lib/publicApiBase";
import { loadTokens } from "@/app/lib/tokenLoader";
import { normalizeLegacyMilestoneFragmentIdsInStory } from "@/app/lib/milestoneFragmentId";
import {
  removePageFromStory,
  replacePageInStory,
  renameStoryPageIdInStory,
} from "@/app/lib/editor/storyPagePatch";
import {
  appendPageToStory,
  buildEmptyPageForCategory,
  isEditorPendingPageId,
} from "@/app/lib/editor/storyTemplateInsert";
import { STORY_GRAPH_START_NODE_ID } from "@/app/lib/editor/storyGraph";
import {
  EDITOR_LAYOUT_REVISION,
  mergeEditorLayoutIntoStory,
  readEditorLayoutFromStory,
  type EditorLayoutNode,
  type EditorLayoutState,
} from "@/app/lib/editor/storyGraphLayout";
import { validateStory } from "@/app/lib/schema/validator";
import EditorOutline from "./EditorOutline";
import NewStoryMetaPanel from "./NewStoryMetaPanel";
import EditorEndPagesPanel from "./EditorEndPagesPanel";
import PageInspector from "./PageInspector";
import StoryCanvas from "./storyCanvas/StoryCanvas";
import s from "./editor.module.scss";
import { EditorInfoHoverPanel } from "./EditorInfoHoverPanel";
import hi from "./editorInfoHoverPanel.module.scss";

const DEBOUNCE_MS = 380;
const SEED_STORY_SRC = "stories/Mrk6_D_text_updated_en.json";
const LS_EDITOR_STORY_SRC = "questell:editor:activeStorySrc";
const LS_ADMIN_STORY_SRC = "questell:editor:adminStorySrc";
const LS_PREFIX = "questell:editor:draft:";
const EDITOR_SKIN_LS = "questell:editor:skinPref";
const PREVIEW_HEIGHT_LS = "questell:editor:previewHeightPx";
const PREVIEW_EXPANDED_LS = "questell:editor:previewExpanded";
const INSPECTOR_EXPANDED_LS = "questell:editor:inspectorExpanded";

function getDocumentFullscreenElement(): Element | null {
  if (typeof document === "undefined") return null;
  const d = document as Document & {
    webkitFullscreenElement?: Element | null;
    mozFullScreenElement?: Element | null;
    msFullscreenElement?: Element | null;
  };
  return (
    document.fullscreenElement ??
    d.webkitFullscreenElement ??
    d.mozFullScreenElement ??
    d.msFullscreenElement ??
    null
  );
}

async function exitDocumentFullscreen(): Promise<void> {
  const d = document as Document & {
    webkitExitFullscreen?: () => Promise<void>;
    mozCancelFullScreen?: () => Promise<void>;
    msExitFullscreen?: () => Promise<void>;
  };
  if (!getDocumentFullscreenElement()) return;
  await (
    document.exitFullscreen?.() ??
    d.webkitExitFullscreen?.() ??
    d.mozCancelFullScreen?.() ??
    d.msExitFullscreen?.() ??
    Promise.resolve()
  );
}

async function enterFullscreenElement(el: HTMLElement): Promise<void> {
  const anyEl = el as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void>;
    mozRequestFullScreen?: () => Promise<void>;
    msRequestFullscreen?: () => Promise<void>;
  };
  await (
    el.requestFullscreen?.() ??
    anyEl.webkitRequestFullscreen?.() ??
    anyEl.mozRequestFullScreen?.() ??
    anyEl.msRequestFullscreen?.() ??
    Promise.resolve()
  );
}

function previewMaxBodyHeightPx(): number {
  if (typeof window === "undefined") return 920;
  const inner = window.innerHeight;
  if (getDocumentFullscreenElement()) {
    return Math.max(220, Math.min(Math.round(inner * 0.9), inner - 140));
  }
  return Math.min(920, Math.round(inner * 0.92));
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function defaultPreviewBodyHeightPx() {
  if (typeof window === "undefined") return 480;
  return Math.round(clamp(window.innerHeight * 0.52, 280, 820));
}

/** Backend `/api/story?src=` és listás `jsonSrc` egységes formára (`stories/foo.json`). */
function draftHasPendingEditorPageIds(story: Record<string, unknown>): boolean {
  const pages = story.pages;
  if (!Array.isArray(pages)) return false;
  for (const p of pages) {
    if (!p || typeof p !== "object" || Array.isArray(p)) continue;
    const id = (p as Record<string, unknown>).id;
    if (typeof id === "string" && isEditorPendingPageId(id)) return true;
  }
  return false;
}

function normalizeEditorStorySrc(raw: string): string {
  const s = raw.trim().replace(/\\/g, "/");
  if (!s) return SEED_STORY_SRC;
  let path = s.startsWith("/") ? s.slice(1) : s;
  if (!path.startsWith("stories/")) {
    const base = path.replace(/^\/+/, "");
    const withJson = base.endsWith(".json") ? base : `${base}.json`;
    path = `stories/${withJson.replace(/^stories\//, "")}`;
  }
  if (!path.endsWith(".json")) path = `${path}.json`;
  return path;
}

type ListedStory = {
  id: string;
  title: string;
  jsonSrc: string;
  startPageId?: string;
};

function readPersistedEditorStorySrc(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const next = localStorage.getItem(LS_EDITOR_STORY_SRC);
    if (next?.trim()) return next.trim();
    const legacy = localStorage.getItem(LS_ADMIN_STORY_SRC);
    return legacy?.trim() ? legacy.trim() : null;
  } catch {
    return null;
  }
}

function writePersistedEditorStorySrc(normalizedPath: string): void {
  try {
    localStorage.setItem(LS_EDITOR_STORY_SRC, normalizedPath);
    localStorage.setItem(LS_ADMIN_STORY_SRC, normalizedPath);
  } catch {
    /* ignore */
  }
}

function normalizeStoriesListResponse(data: unknown): ListedStory[] {
  const arr = Array.isArray(data) ? data : [];
  const normalized: ListedStory[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const x = item as Record<string, unknown>;
    const id = typeof x.id === "string" ? x.id : "";
    const title = typeof x.title === "string" ? x.title : id || "—";
    const jsonSrc = typeof x.jsonSrc === "string" ? x.jsonSrc : "";
    if (!id || !jsonSrc) continue;
    const row: ListedStory = { id, title, jsonSrc };
    if (typeof x.startPageId === "string") row.startPageId = x.startPageId;
    normalized.push(row);
  }
  return normalized;
}

/**
 * Nem-admin: vesszővel elválasztott story id vagy fájlnév (.json nélkül).
 * Egyetlen `*` = minden sztori (csak fejlesztéshez; élesben kerüld).
 */
function parseEditorStoryAllowlistFromEnv(): string[] | null {
  const raw = process.env.NEXT_PUBLIC_EDITOR_STORY_ALLOWLIST;
  if (raw == null || String(raw).trim() === "") return null;
  return String(raw)
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function listedStoryAllowKeys(st: ListedStory): string[] {
  const id = st.id.trim().toLowerCase();
  const file = st.jsonSrc
    .replace(/^.*\//, "")
    .replace(/\.json$/i, "")
    .trim()
    .toLowerCase();
  return [...new Set([id, file].filter(Boolean))];
}

function filterStoriesForEditorRole(
  list: ListedStory[],
  admin: boolean,
  allowlist: string[] | null
): ListedStory[] {
  if (admin) return list;
  if (!allowlist?.length) return [];
  if (allowlist.length === 1 && allowlist[0] === "*") return list;
  const allow = new Set(allowlist);
  return list.filter((st) =>
    listedStoryAllowKeys(st).some((k) => allow.has(k))
  );
}

type SkinEntry = { id: string; title: string };

function PreviewToolbar({
  pageIds,
  onSyncEditorPageId,
  metaSkinFromStory,
  onPersistSkinToMeta,
  onHardRefreshPreview,
}: {
  pageIds: string[];
  /** Preview oldal váltás → ugyanaz a kártya legyen kijelölve a vásznon. */
  onSyncEditorPageId: (pageId: string) => void;
  metaSkinFromStory?: string | null;
  onPersistSkinToMeta?: (skinId: string) => void;
  /** Token újratöltés + preview remount (szülő). */
  onHardRefreshPreview?: (skinId: string) => void | Promise<void>;
}) {
  const { currentPageId, setCurrentPageId, setGlobal } = useGameState();
  const [skins, setSkins] = useState<SkinEntry[]>([]);
  const [skin, setSkin] = useState("contract_creative_dusk");
  const [skinApplyBusy, setSkinApplyBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/skins/registry.json")
      .then((r) => r.json())
      .then((data: { skins?: SkinEntry[] }) => {
        if (cancelled || !Array.isArray(data?.skins)) return;
        setSkins(data.skins);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const fromMeta = metaSkinFromStory?.trim();
    if (fromMeta) {
      setSkin(fromMeta);
      setGlobal("skin", fromMeta);
      return;
    }
    let fromLs = "contract_creative_dusk";
    try {
      fromLs = localStorage.getItem(EDITOR_SKIN_LS) || fromLs;
    } catch {
      /* ignore */
    }
    setSkin(fromLs);
    setGlobal("skin", fromLs);
  }, [metaSkinFromStory, setGlobal]);

  const skinOptions = useMemo(() => {
    if (skins.length) return skins;
    return [{ id: "contract_creative_dusk", title: "Creative — Dusk" }];
  }, [skins]);

  return (
    <div className={s.previewToolbar}>
      <label>
        Előnézet oldala
        <select
          className={s.pageSelect}
          value={pageIds.includes(currentPageId) ? currentPageId : pageIds[0] ?? ""}
          onChange={(e) => {
            const v = e.target.value.trim();
            if (!v) return;
            setCurrentPageId(v);
            if (pageIds.includes(v)) onSyncEditorPageId(v);
          }}
          aria-label="Melyik oldalon álljon az előnézet (a vászon kijelölése is ehhez igazodik)"
        >
          {pageIds.length === 0 ? (
            <option value="">—</option>
          ) : (
            pageIds.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))
          )}
        </select>
      </label>
      <div className={s.previewSkinRow}>
        <label className={s.previewSkinLabel}>
          Skin
          <select
            className={s.pageSelect}
            value={
              skinOptions.some((sk) => sk.id === skin)
                ? skin
                : skinOptions[0]?.id
            }
            onChange={(e) => {
              const v = e.target.value;
              setSkin(v);
              setGlobal("skin", v);
              try {
                localStorage.setItem(EDITOR_SKIN_LS, v);
              } catch {
                /* ignore */
              }
              onPersistSkinToMeta?.(v);
            }}
            aria-label="Preview skin"
          >
            {skinOptions.map((sk) => (
              <option key={sk.id} value={sk.id}>
                {sk.title}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={s.previewSkinApplyBtn}
          disabled={skinApplyBusy}
          title="A választott téma bekerül a projekt beállításaiba; az előnézet azonnal frissül. A szerverre külön kell menteni."
          onClick={() => {
            if (!onHardRefreshPreview) return;
            const v = skin;
            setSkinApplyBusy(true);
            setGlobal("skin", v);
            try {
              localStorage.setItem(EDITOR_SKIN_LS, v);
            } catch {
              /* ignore */
            }
            onPersistSkinToMeta?.(v);
            Promise.resolve(onHardRefreshPreview(v))
              .catch(() => {})
              .finally(() => setSkinApplyBusy(false));
          }}
        >
          {skinApplyBusy ? "Alkalmazás…" : "Téma alkalmazása az előnézeten"}
        </button>
      </div>
      <span className={s.previewToolbarHint}>
        <strong>Hogyan működik?</strong> 1) Válassz témát. 2) A gomb elmenti a témát a
        projektben, és csak az előnézetet frissíti. 3) A szerverre a vászon fölötti „Változások
        mentése” írja ki a munkát. Az „Előnézet oldala” mező ugyanarra a lépésre mutat, amelyik
        kártya épp kijelölt a vásznon.
      </span>
    </div>
  );
}

/**
 * Szerkesztő (vászon / inspektor) → élő preview: a preview oldala követi a kijelölést.
 *
 * A preview → vászon irányt csak a „Preview oldal” legördülő kezeli (`onSyncEditorPageId`);
 * nem futtatunk külön effektet rá, mert ugyanabban a commitban a régi `currentPageId`
 * miatt felülírná a friss vászon-kijelölést és végtelen / hibás frissítést okozna.
 */
function EditorPreviewSelectionBridge({
  pageIds,
  selectedPageId,
  children,
}: {
  pageIds: string[];
  selectedPageId: string | null;
  children: ReactNode;
}) {
  const { currentPageId, setCurrentPageId } = useGameState();

  useEffect(() => {
    if (!selectedPageId || !pageIds.includes(selectedPageId)) return;
    if (currentPageId === selectedPageId) return;
    setCurrentPageId(selectedPageId);
  }, [selectedPageId, pageIds, currentPageId, setCurrentPageId]);

  return <>{children}</>;
}

function EditorPreviewColumn({
  draftStory,
  revision,
  pageIds,
  selectedPageId,
  onSelectPageId,
  onStoryChange,
}: {
  draftStory: Record<string, unknown>;
  revision: number;
  pageIds: string[];
  selectedPageId: string | null;
  onSelectPageId: (id: string | null) => void;
  onStoryChange: (next: Record<string, unknown>) => void;
}) {
  const [previewExpanded, setPreviewExpanded] = useState(true);
  const [bodyHeightPx, setBodyHeightPx] = useState(480);
  const bodyHeightRef = useRef(480);
  const resizeDragRef = useRef<{ startY: number; startH: number } | null>(
    null
  );

  useEffect(() => {
    try {
      const rawH = localStorage.getItem(PREVIEW_HEIGHT_LS);
      if (rawH) {
        const parsed = Number.parseInt(rawH, 10);
        if (!Number.isNaN(parsed)) {
          const maxH = previewMaxBodyHeightPx();
          const h = clamp(parsed, 220, maxH);
          setBodyHeightPx(h);
          bodyHeightRef.current = h;
        }
      } else {
        const d = defaultPreviewBodyHeightPx();
        setBodyHeightPx(d);
        bodyHeightRef.current = d;
      }
      const ex = localStorage.getItem(PREVIEW_EXPANDED_LS);
      if (ex === "0") setPreviewExpanded(false);
    } catch {
      /* ignore */
    }
  }, []);

  bodyHeightRef.current = bodyHeightPx;

  const maxBodyHeightPx = previewMaxBodyHeightPx();

  const metaSkinFromStory = useMemo(() => {
    const m = draftStory.meta;
    if (!m || typeof m !== "object" || Array.isArray(m)) return null;
    const sk = (m as Record<string, unknown>).skin;
    return typeof sk === "string" && sk.trim() ? sk.trim() : null;
  }, [draftStory.meta]);

  const persistPreviewSkinToMeta = useCallback(
    (skinId: string) => {
      const prevMeta =
        draftStory.meta &&
        typeof draftStory.meta === "object" &&
        !Array.isArray(draftStory.meta)
          ? { ...(draftStory.meta as Record<string, unknown>) }
          : {};
      onStoryChange({
        ...draftStory,
        meta: { ...prevMeta, skin: skinId },
      });
    },
    [draftStory, onStoryChange]
  );

  const [previewRemountKey, setPreviewRemountKey] = useState(0);

  const hardRefreshPreviewSkin = useCallback(async (skinId: string) => {
    if (skinId && skinId !== "legacy-default") {
      await loadTokens(`/skins/${skinId}.json`, {
        forceReload: true,
      }).catch(() => {});
    }
    setPreviewRemountKey((k) => k + 1);
  }, []);

  useEffect(() => {
    const onResize = () => {
      setBodyHeightPx((h) => {
        const maxH = previewMaxBodyHeightPx();
        const next = clamp(h, 220, maxH);
        bodyHeightRef.current = next;
        return next;
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const sync = () => {
      setBodyHeightPx((h) => {
        const maxH = previewMaxBodyHeightPx();
        const next = clamp(h, 220, maxH);
        bodyHeightRef.current = next;
        return next;
      });
    };
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    document.addEventListener("mozfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
      document.removeEventListener("mozfullscreenchange", sync);
    };
  }, []);

  const togglePreviewExpanded = useCallback(() => {
    setPreviewExpanded((open) => {
      const next = !open;
      try {
        localStorage.setItem(PREVIEW_EXPANDED_LS, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const onResizeHandlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      resizeDragRef.current = {
        startY: e.clientY,
        startH: bodyHeightRef.current,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    []
  );

  const onResizeHandlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const drag = resizeDragRef.current;
      if (!drag) return;
      const maxH = previewMaxBodyHeightPx();
      const delta = e.clientY - drag.startY;
      const next = clamp(drag.startH + delta, 220, maxH);
      setBodyHeightPx(next);
    },
    []
  );

  const onResizeHandlePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (resizeDragRef.current) {
        resizeDragRef.current = null;
        try {
          localStorage.setItem(
            PREVIEW_HEIGHT_LS,
            String(bodyHeightRef.current)
          );
        } catch {
          /* ignore */
        }
      }
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    },
    []
  );

  const resolver = useMemo<DraftStoryResolver>(
    () => ({
      revision,
      getStoryJson: () => draftStory,
    }),
    [revision, draftStory]
  );

  const bodyId = "editor-preview-body";

  return (
    <div className={`${s.panel} ${s.previewPanel}`}>
      <button
        type="button"
        className={`${s.panelHeader} ${s.previewPanelToggle}`}
        aria-expanded={previewExpanded}
        aria-controls={bodyId}
        onClick={togglePreviewExpanded}
      >
        <span className={s.stackPanelToggleTitle}>
          <span className={s.stackPanelToggleMain}>Előnézet (élő vázlat)</span>
        </span>
        <span className={s.previewPanelToggleChevron} aria-hidden>
          {previewExpanded ? "▼" : "▶"}
        </span>
      </button>
      <GameStateProvider
        storagePrefix={LS_PREFIX}
        draftStoryResolver={resolver}
      >
        <EditorPreviewSelectionBridge
          pageIds={pageIds}
          selectedPageId={selectedPageId}
        >
          <div
            id={bodyId}
            className={s.previewPanelBody}
            hidden={!previewExpanded}
            style={
              previewExpanded
                ? {
                    height: `${bodyHeightPx}px`,
                    maxHeight: `${maxBodyHeightPx}px`,
                  }
                : undefined
            }
          >
            <PreviewToolbar
              pageIds={pageIds}
              onSyncEditorPageId={(id) => onSelectPageId(id)}
              metaSkinFromStory={metaSkinFromStory}
              onPersistSkinToMeta={persistPreviewSkinToMeta}
              onHardRefreshPreview={hardRefreshPreviewSkin}
            />
            <div className={s.previewViewport}>
            <div className={s.previewStoryMount}>
              <StoryPage key={previewRemountKey} />
            </div>
          </div>
          <div
            className={s.previewResizeHandle}
            role="separator"
            aria-orientation="horizontal"
            aria-valuemin={220}
            aria-valuemax={maxBodyHeightPx}
            aria-valuenow={Math.round(bodyHeightPx)}
            aria-label="Az előnézet panel magasságának állítása húzással"
            onPointerDown={onResizeHandlePointerDown}
            onPointerMove={onResizeHandlePointerMove}
            onPointerUp={onResizeHandlePointerUp}
            onPointerCancel={onResizeHandlePointerUp}
          />
          </div>
        </EditorPreviewSelectionBridge>
      </GameStateProvider>
    </div>
  );
}

function EditorStudioRightColumn({
  draftStory,
  revision,
  pageIds,
  inspectorOpen,
  onToggleInspector,
  selectedPageId,
  onSelectPageId,
  issuesByPage,
  onStoryChange,
  onDeletePage,
  onRenamePageId,
  bootstrapMode,
  onBootstrapStoryCreated,
}: {
  draftStory: Record<string, unknown>;
  revision: number;
  pageIds: string[];
  inspectorOpen: boolean;
  onToggleInspector: () => void;
  selectedPageId: string | null;
  onSelectPageId: (id: string | null) => void;
  issuesByPage: Map<string, PageValidationIssue[]>;
  onStoryChange: (next: Record<string, unknown>) => void;
  onDeletePage: (pageId: string) => void;
  onRenamePageId?: (fromId: string, toId: string) => string | null;
  bootstrapMode?: boolean;
  onBootstrapStoryCreated?: (result: { jsonSrc: string; id: string }) => void;
}) {
  if (bootstrapMode && onBootstrapStoryCreated) {
    return (
      <div className={s.dockedRightStack}>
        <div
          className={`${s.panel} ${s.previewPanel} ${s.inspectorPanelRoot}`}
        >
          <div className={s.bootstrapPanelRoot}>
            <div className={s.bootstrapPanelHeadRow}>
              <h2 className={s.bootstrapPanelHead}>
                Új projekt: első lépés — kötelező adatok
              </h2>
              <EditorInfoHoverPanel ariaLabel="Új projekt első lépés: útmutató">
                <div className={hi.section}>
                  <p className={hi.sectionBody}>
                    Add meg az alap meta adatokat és mentsd a szerverre: utána nyílik meg teljesen
                    az előnézet és az oldal-szerkesztő. Addig a vásznon csak a kezdőpont jelenik
                    meg, így nem tudsz félkész projekttel „eltévedni”.
                  </p>
                </div>
              </EditorInfoHoverPanel>
            </div>
            <div className={s.bootstrapPanelBody}>
              <NewStoryMetaPanel onCreated={onBootstrapStoryCreated} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={s.dockedRightStack}>
      <EditorPreviewColumn
        draftStory={draftStory}
        revision={revision}
        pageIds={pageIds}
        selectedPageId={selectedPageId}
        onSelectPageId={onSelectPageId}
        onStoryChange={onStoryChange}
      />
      <EditorEndPagesPanel
        draftStory={draftStory}
        selectedPageId={selectedPageId}
        onSelectPageId={(id) => onSelectPageId(id)}
      />
      <div
        className={`${s.panel} ${s.previewPanel} ${s.inspectorPanelRoot}`}
      >
        <button
          type="button"
          className={`${s.panelHeader} ${s.previewPanelToggle}`}
          aria-expanded={inspectorOpen}
          aria-controls="editor-inspector-body"
          onClick={onToggleInspector}
        >
          <span className={s.stackPanelToggleTitle}>
            <span className={s.stackPanelToggleMain}>Oldal tulajdonságok</span>
            {selectedPageId ? (
              <span
                className={
                  isEditorPendingPageId(selectedPageId)
                    ? `${s.stackPanelToggleSub} ${s.stackPanelToggleSubWarn}`
                    : s.stackPanelToggleSub
                }
              >
                {selectedPageId === STORY_GRAPH_START_NODE_ID
                  ? "Projekt meta (START kártya)"
                  : isEditorPendingPageId(selectedPageId)
                    ? "Új lap: adj meg egyedi oldal-ID-t"
                    : selectedPageId}
              </span>
            ) : (
              <span className={s.stackPanelToggleSubMuted}>
                Válassz kártyát a vásznon a részletekhez
              </span>
            )}
          </span>
          <span className={s.previewPanelToggleChevron} aria-hidden>
            {inspectorOpen ? "▼" : "▶"}
          </span>
        </button>
        <div
          id="editor-inspector-body"
          className={s.inspectorPanelContent}
          hidden={!inspectorOpen}
        >
          <PageInspector
            draftStory={draftStory}
            selectedPageId={selectedPageId}
            onStoryChange={onStoryChange}
            onRequestDeletePage={onDeletePage}
            onRenamePageId={onRenamePageId}
            onSelectPageInEditor={onSelectPageId}
            issues={
              selectedPageId
                ? issuesByPage.get(selectedPageId) ?? []
                : []
            }
            knownPageIds={pageIds}
          />
        </div>
      </div>
    </div>
  );
}

type EditorStudioProps = {
  userEmail: string | null | undefined;
  userId: string | undefined;
  tierLabel: string | null;
  tierColor: string;
  /** Admin (fiók tier vagy böngészős admin munkamenet): teljes sztori-lista; különben allowlist. */
  isAdmin?: boolean;
  onLogout: () => void;
};

export default function EditorStudio({
  userEmail,
  userId,
  tierLabel,
  tierColor,
  isAdmin = false,
  onLogout,
}: EditorStudioProps) {
  const [jsonText, setJsonText] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [draftStory, setDraftStory] = useState<Record<string, unknown> | null>(
    null
  );
  const [revision, setRevision] = useState(0);
  const [schemaHint, setSchemaHint] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] =
    useState<EditorPageCategory | null>(null);
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);
  const selectedPageIdsRef = useRef(selectedPageIds);
  const draftStoryRef = useRef(draftStory);
  selectedPageIdsRef.current = selectedPageIds;
  draftStoryRef.current = draftStory;
  const selectedPageId =
    selectedPageIds.length === 1 ? selectedPageIds[0] ?? null : null;
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const visualWorkbenchRef = useRef<HTMLDivElement>(null);
  const [fullscreenDockEl, setFullscreenDockEl] = useState<HTMLDivElement | null>(
    null
  );
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeStorySrc, setActiveStorySrc] =
    useState<string>(SEED_STORY_SRC);
  const [isNewStoryBootstrap, setIsNewStoryBootstrap] = useState(false);
  const [leftRailOpen, setLeftRailOpen] = useState(true);
  const previousActiveStorySrcRef = useRef<string>(SEED_STORY_SRC);
  const [serverStoryList, setServerStoryList] = useState<ListedStory[]>([]);
  const [storyListLoading, setStoryListLoading] = useState(false);
  const [storyListError, setStoryListError] = useState<string | null>(null);
  const editorStorySrcLsSyncedRef = useRef(false);
  const prevIsAdminRef = useRef(isAdmin);
  const editorStoryAllowlist = useMemo(
    () => parseEditorStoryAllowlistFromEnv(),
    []
  );
  const visibleStoryList = useMemo(
    () =>
      filterStoriesForEditorRole(
        serverStoryList,
        isAdmin,
        editorStoryAllowlist
      ),
    [serverStoryList, isAdmin, editorStoryAllowlist]
  );

  useEffect(() => {
    if (!prevIsAdminRef.current && isAdmin) {
      editorStorySrcLsSyncedRef.current = false;
    }
    prevIsAdminRef.current = isAdmin;
  }, [isAdmin]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveServerTimerRef = useRef<number | null>(null);
  const [saveServerBusy, setSaveServerBusy] = useState(false);
  const [saveServerHint, setSaveServerHint] = useState<string | null>(null);
  const [saveServerTone, setSaveServerTone] = useState<"ok" | "err" | null>(
    null
  );

  useEffect(() => {
    return () => {
      if (saveServerTimerRef.current) {
        clearTimeout(saveServerTimerRef.current);
      }
    };
  }, []);

  const onSaveDraftToServer = useCallback(async () => {
    if (saveServerTimerRef.current) {
      clearTimeout(saveServerTimerRef.current);
      saveServerTimerRef.current = null;
    }
    const cur = draftStoryRef.current;
    if (!cur) return;
    if (draftHasPendingEditorPageIds(cur)) {
      setSaveServerTone("err");
      setSaveServerHint(
        "Mentés előtt: minden új kártyának legyen végleges, egyedi oldal-ID. Nevezd el a függő lapokat a jobb oldali panelben, vagy töröld őket a vászonról."
      );
      return;
    }
    setSaveServerBusy(true);
    setSaveServerTone(null);
    setSaveServerHint(null);
    try {
      const payload =
        typeof structuredClone === "function"
          ? (structuredClone(cur) as Record<string, unknown>)
          : (JSON.parse(JSON.stringify(cur)) as Record<string, unknown>);
      const normalized = normalizeLegacyMilestoneFragmentIdsInStory(payload);
      const result = await saveStoryDocumentJson(normalized, {
        overwrite: true,
        mode: "strict",
      });
      const jsonSrc =
        typeof result.jsonSrc === "string"
          ? result.jsonSrc
          : typeof result.id === "string"
            ? `stories/${result.id}.json`
            : "";
      setSaveServerTone("ok");
      setSaveServerHint(
        jsonSrc ? `Szerverre mentve (${jsonSrc}).` : "Szerverre mentve."
      );
      saveServerTimerRef.current = window.setTimeout(() => {
        setSaveServerHint(null);
        setSaveServerTone(null);
        saveServerTimerRef.current = null;
      }, 7000);
    } catch (e) {
      setSaveServerTone("err");
      setSaveServerHint(e instanceof Error ? e.message : String(e));
    } finally {
      setSaveServerBusy(false);
    }
  }, [isNewStoryBootstrap]);

  const beginNewStory = useCallback(() => {
    previousActiveStorySrcRef.current = activeStorySrc;
    setIsNewStoryBootstrap(true);
    setActiveStorySrc(NEW_STORY_SRC_SENTINEL);
    const shell = createBootstrapShellDraft();
    setDraftStory(shell);
    setJsonText(JSON.stringify(shell, null, 2));
    setParseError(null);
    setSchemaHint(
      "Új projekt: 1) töltsd ki a jobb oldali meta űrlapot, 2) mentsd a szerverre — ez létrehozza a fájlt, utána szerkesztheted a teljes gráfot."
    );
    setSelectedPageIds([]);
    setRevision((r) => r + 1);
    setInspectorOpen(true);
  }, [activeStorySrc]);

  const cancelNewStory = useCallback(() => {
    const prev = previousActiveStorySrcRef.current;
    setIsNewStoryBootstrap(false);
    if (isNewStorySentinel(prev)) {
      setActiveStorySrc(SEED_STORY_SRC);
    } else {
      setActiveStorySrc(normalizeEditorStorySrc(prev));
    }
  }, []);

  const handleBootstrapStoryCreated = useCallback(
    (result: { jsonSrc: string; id: string }) => {
      setIsNewStoryBootstrap(false);
      const path = result.jsonSrc.replace(/^\/+/, "");
      const norm = normalizeEditorStorySrc(path);
      setActiveStorySrc(norm);
      setSelectedPageIds([]);
      writePersistedEditorStorySrc(norm);
      fetch("/api/stories", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("list"))))
        .then((data: unknown) => {
          setServerStoryList(normalizeStoriesListResponse(data));
        })
        .catch(() => {});
    },
    []
  );

  useEffect(() => {
    let cancelled = false;
    setStoryListLoading(true);
    setStoryListError(null);
    fetch("/api/stories", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: unknown) => {
        if (cancelled) return;
        setServerStoryList(normalizeStoriesListResponse(data));
      })
      .catch(() => {
        if (cancelled) return;
        setServerStoryList([]);
        setStoryListError(
          "A projektlista nem érhető el. Ellenőrizd, hogy fut-e a háttér-szolgáltatás, és hogy a böngésző eléri a `/api/stories` címet."
        );
      })
      .finally(() => {
        if (!cancelled) setStoryListLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!serverStoryList.length || editorStorySrcLsSyncedRef.current) return;
    editorStorySrcLsSyncedRef.current = true;
    const saved = readPersistedEditorStorySrc();
    if (!saved?.trim()) return;
    const norm = normalizeEditorStorySrc(saved);
    const visible = filterStoriesForEditorRole(
      serverStoryList,
      isAdmin,
      editorStoryAllowlist
    );
    const hit = visible.some(
      (x) => normalizeEditorStorySrc(x.jsonSrc) === norm
    );
    if (hit) setActiveStorySrc(norm);
  }, [serverStoryList, isAdmin, editorStoryAllowlist]);

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    const base = getClientFetchApiBase();
    const src = normalizeEditorStorySrc(activeStorySrc);
    const url = `${base}/api/story?src=${encodeURIComponent(src)}`;
    fetch(url, { signal: ac.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: unknown) => {
        if (cancelled) return;
        if (data && typeof data === "object" && !Array.isArray(data)) {
          const normalized = normalizeLegacyMilestoneFragmentIdsInStory(
            data as Record<string, unknown>
          );
          const text = JSON.stringify(normalized, null, 2);
          setJsonText(text);
          setParseError(null);
          setDraftStory(normalized);
          setRevision((r) => r + 1);
          const v = validateStory(normalized, "warnOnly", false);
          if (v.ok) {
            setSchemaHint(
              v.warnings.length
                ? `A projektben ${v.warnings.length} figyelmeztetés van — az előnézet működhet; érdemes később rendbe tenni.`
                : null
            );
          } else {
            setSchemaHint(
              `A projektben ${v.errors.length} hiba van — az előnézet ettől még futhat, de javítsd a hibákat mentés előtt.`
            );
          }
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof DOMException && e.name === "AbortError") return;
        setParseError(
          "A projekt nem töltődött be a szerverről. Próbáld: másik fájl a listából, vagy illessz be érvényes adatot a haladó nézetbe."
        );
      });
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [activeStorySrc]);

  const applyParsed = useCallback((raw: string) => {
    const t = raw.trim();
    if (!t) {
      setParseError(null);
      setSchemaHint(null);
      setDraftStory(null);
      return;
    }
    try {
      const data = JSON.parse(raw) as unknown;
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new Error("A JSON gyökere objektum kell legyen (nem tömb vagy primitív).");
      }
      setParseError(null);
      const rec = data as Record<string, unknown>;
      const normalized = normalizeLegacyMilestoneFragmentIdsInStory(rec);
      setDraftStory(normalized);
      setJsonText(JSON.stringify(normalized, null, 2));
      setRevision((r) => r + 1);
      const v = validateStory(normalized, "warnOnly", false);
      if (v.ok) {
        setSchemaHint(
          v.warnings.length
            ? `A projektben ${v.warnings.length} figyelmeztetés van — az előnézet működhet; érdemes később rendbe tenni.`
            : null
        );
      } else {
        setSchemaHint(
          `A projektben ${v.errors.length} hiba van — az előnézet még futhat, ha az oldalak felismerhetők; javítsd a hibákat mentés előtt.`
        );
      }
    } catch (e) {
      setParseError(e instanceof Error ? e.message : String(e));
      setSchemaHint(null);
    }
  }, []);

  const onJsonChange = useCallback(
    (value: string) => {
      if (isNewStoryBootstrap) return;
      setJsonText(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        applyParsed(value);
      }, DEBOUNCE_MS);
    },
    [applyParsed, isNewStoryBootstrap]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const pageIds = useMemo(
    () => (draftStory ? collectStoryPageIds(draftStory) : []),
    [draftStory]
  );

  useEffect(() => {
    try {
      if (localStorage.getItem(INSPECTOR_EXPANDED_LS) === "0") {
        setInspectorOpen(false);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const sync = () => {
      const fs = getDocumentFullscreenElement();
      const root = visualWorkbenchRef.current;
      setIsFullscreen(!!fs && !!root && fs === root);
      if (typeof window !== "undefined") {
        requestAnimationFrame(() => {
          window.dispatchEvent(new Event("resize"));
        });
      }
    };
    sync();
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    document.addEventListener("mozfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
      document.removeEventListener("mozfullscreenchange", sync);
    };
  }, []);

  const toggleEditorFullscreen = useCallback(async () => {
    const root = visualWorkbenchRef.current;
    if (!root) return;
    try {
      if (getDocumentFullscreenElement() === root) {
        await exitDocumentFullscreen();
      } else {
        await enterFullscreenElement(root);
      }
    } catch {
      /* pl. böngésző nem engedi */
    }
  }, []);

  const editorIssues = useMemo(
    () => (draftStory ? validateEditorPages(draftStory) : new Map()),
    [draftStory]
  );

  const metaEditorIssues = editorIssues.get("__meta__") ?? [];
  const issuesByPage = useMemo(() => {
    const m = new Map(editorIssues);
    m.delete("__meta__");
    return m;
  }, [editorIssues]);

  const onStoryChangeFromCanvas = useCallback(
    (next: Record<string, unknown>) => {
      const normalized = normalizeLegacyMilestoneFragmentIdsInStory(next);
      const json = JSON.stringify(normalized, null, 2);
      setJsonText(json);
      setParseError(null);
      setDraftStory(normalized);
      setRevision((r) => r + 1);
      const v = validateStory(normalized, "warnOnly", false);
      if (v.ok) {
        setSchemaHint(
          v.warnings.length
            ? `A projektben ${v.warnings.length} figyelmeztetés van — az előnézet működhet; érdemes később rendbe tenni.`
            : null
        );
      } else {
        setSchemaHint(
          `A projektben ${v.errors.length} hiba van — az előnézet ettől még futhat, de javítsd a hibákat mentés előtt.`
        );
      }
    },
    []
  );

  const handleSelectPageIds = useCallback(
    (ids: string[]) => {
      const prev = selectedPageIdsRef.current;
      const cur = draftStoryRef.current;
      if (cur) {
        let nextStory = cur;
        for (const pid of collectStoryPageIds(cur)) {
          if (
            isEditorPendingPageId(pid) &&
            prev.includes(pid) &&
            !ids.includes(pid)
          ) {
            nextStory = removePageFromStory(nextStory, pid);
          }
        }
        if (nextStory !== cur) {
          onStoryChangeFromCanvas(nextStory);
        }
      }
      setSelectedPageIds(ids);
    },
    [onStoryChangeFromCanvas]
  );

  const onRenamePageFromCanvas = useCallback(
    (fromId: string, toId: string): string | null => {
      const cur = draftStoryRef.current;
      if (!cur) return "Nincs betölthető projekt — válassz egyet a listából, vagy tölts be adatot a haladó nézetben.";
      const res = renameStoryPageIdInStory(cur, fromId, toId);
      if (!res.ok) return res.error;
      onStoryChangeFromCanvas(res.story);
      const trimmed = toId.trim();
      setSelectedPageIds((p) => p.map((x) => (x === fromId ? trimmed : x)));
      return null;
    },
    [onStoryChangeFromCanvas]
  );

  const openInspectorForPendingPage = useCallback(() => {
    setInspectorOpen(true);
  }, []);

  const onDeletePage = useCallback(
    (pageId: string) => {
      const pid = pageId.trim();
      if (!pid || !draftStory) return;
      if (
        !window.confirm(
          `Törlöd a(z) „${pid}” oldalt? Utána nézd át a többi oldal ugrásait: előfordulhat, hogy még erre az ID-ra mutatnak.`
        )
      ) {
        return;
      }
      const next = removePageFromStory(draftStory, pid);
      onStoryChangeFromCanvas(next);
      setSelectedPageIds((ids) => ids.filter((x) => x !== pid));
    },
    [draftStory, onStoryChangeFromCanvas]
  );

  const onCleanPage = useCallback(
    (pageId: string) => {
      const pid = pageId.trim();
      const cur = draftStoryRef.current;
      if (!pid || !cur) return;
      const page = findPageInStoryDocument(cur, pid);
      if (!page) return;
      const cls = classifyEditorPage(page);
      if (cls === "end") return;
      const blank = buildEmptyPageForCategory(cls, cur);
      const blankWithSameId = { ...blank, id: pid };
      const next = replacePageInStory(cur, pid, blankWithSameId);
      onStoryChangeFromCanvas(next);
      setSelectedPageIds([pid]);
    },
    [onStoryChangeFromCanvas]
  );

  const onDuplicatePage = useCallback(
    (pageId: string) => {
      const pid = pageId.trim();
      const cur = draftStoryRef.current;
      if (!pid || !cur) return;
      const src = findPageInStoryDocument(cur, pid);
      if (!src) return;

      const used = new Set(collectStoryPageIds(cur));
      const stem = `${pid}_copy`;
      let nextId = stem;
      let i = 2;
      while (used.has(nextId)) {
        nextId = `${stem}${i}`;
        i += 1;
      }

      const clone: Record<string, unknown> =
        typeof structuredClone === "function"
          ? (structuredClone(src) as Record<string, unknown>)
          : (JSON.parse(JSON.stringify(src)) as Record<string, unknown>);
      clone.id = nextId;

      let nextStory = appendPageToStory(cur, clone);
      const savedLayout = readEditorLayoutFromStory(cur);
      const srcPos = savedLayout?.nodes[pid];
      if (savedLayout && srcPos) {
        let maxZ = 0;
        for (const n of Object.values(savedLayout.nodes)) {
          if (typeof n.z === "number" && Number.isFinite(n.z)) {
            maxZ = Math.max(maxZ, n.z);
          }
        }
        const dupPos: EditorLayoutNode = {
          x: srcPos.x + 40,
          y: srcPos.y + 28,
          z: Math.max(maxZ + 1, (srcPos.z ?? 1) + 1),
        };
        const nextLayout: EditorLayoutState = {
          version: 1,
          layoutRevision:
            savedLayout.layoutRevision ?? EDITOR_LAYOUT_REVISION,
          nodes: { ...savedLayout.nodes, [nextId]: dupPos },
        };
        nextStory = mergeEditorLayoutIntoStory(nextStory, nextLayout);
      }

      onStoryChangeFromCanvas(nextStory);
      setSelectedPageIds([nextId]);
    },
    [onStoryChangeFromCanvas]
  );

  const onStoryReplaced = useCallback(
    (nextStory: Record<string, unknown>, _json: string) => {
      const normalized = normalizeLegacyMilestoneFragmentIdsInStory(nextStory);
      const json = JSON.stringify(normalized, null, 2);
      setJsonText(json);
      setParseError(null);
      setDraftStory(normalized);
      setRevision((r) => r + 1);
      const v = validateStory(normalized, "warnOnly", false);
      if (v.ok) {
        setSchemaHint(
          v.warnings.length
            ? `A projektben ${v.warnings.length} figyelmeztetés van — az előnézet működhet; érdemes később rendbe tenni.`
            : null
        );
      } else {
        setSchemaHint(
          `A projektben ${v.errors.length} hiba van — az előnézet ettől még futhat, de javítsd a hibákat mentés előtt.`
        );
      }
    },
    []
  );

  const toggleInspectorExpanded = useCallback(() => {
    setInspectorOpen((open) => {
      const next = !open;
      try {
        localStorage.setItem(INSPECTOR_EXPANDED_LS, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const editorStorySelectOptions = useMemo((): ReactNode[] => {
    const cur = normalizeEditorStorySrc(activeStorySrc);
    const opts: ReactNode[] = [];
    if (isNewStorySentinel(activeStorySrc)) {
      opts.push(
        <option key="__new_draft__" value={NEW_STORY_SRC_SENTINEL}>
          Új projekt (meta szerkesztés alatt)
        </option>
      );
    }
    const inList = visibleStoryList.some(
      (x) => normalizeEditorStorySrc(x.jsonSrc) === cur
    );
    if (!inList && cur && !isNewStorySentinel(activeStorySrc)) {
      opts.push(
        <option key="__current__" value={cur}>
          Aktuális fájl (nincs a listában): {cur.replace(/^stories\//, "")}
        </option>
      );
    }
    visibleStoryList.forEach((st) => {
      const v = normalizeEditorStorySrc(st.jsonSrc);
      opts.push(
        <option key={st.id || v} value={v}>
          {st.title} ({st.id})
        </option>
      );
    });
    if (opts.length === 0) {
      opts.push(
        <option key="__seed__" value={SEED_STORY_SRC}>
          Alap példa (a lista üres)
        </option>
      );
    }
    return opts;
  }, [activeStorySrc, visibleStoryList]);

  useEffect(() => {
    if (!leftRailOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLeftRailOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [leftRailOpen]);

  return (
    <div className={s.root}>
      <div className={s.shell}>
      <div className={s.topBar}>
        <h1 className={s.title}>Projekt szerkesztő</h1>
      </div>
      <p className={s.userLine}>
        Bejelentkezve: <strong>{userEmail ?? userId}</strong>
        {tierLabel ? (
          <>
            {" "}
            · <span style={{ color: tierColor }}>{tierLabel}</span>
          </>
        ) : null}
      </p>

      <button
        type="button"
        className={s.sidePanelTrigger}
        aria-expanded={leftRailOpen}
        aria-label={leftRailOpen ? "Close side panel" : "Open side panel"}
        title={leftRailOpen ? "Close panel" : "Open panel"}
        onClick={() => setLeftRailOpen((v) => !v)}
      >
        {leftRailOpen ? "←" : "→"}
      </button>
      {leftRailOpen ? (
        <button
          type="button"
          aria-label="Close side panel backdrop"
          className={s.sidePanelBackdrop}
          onClick={() => setLeftRailOpen(false)}
        />
      ) : null}
      <aside
        className={`${s.sidePanel} ${leftRailOpen ? s.sidePanelOpen : ""}`}
        aria-label="Editor controls"
      >
        <div className={s.sidePanelLogoWrap} aria-hidden>
          <div className={s.sidePanelLogoMark}>
            <Image
              src="/assets/my_logo.png"
              alt="Questell logo"
              width={40}
              height={40}
              className={s.sidePanelLogoImg}
              priority
            />
          </div>
        </div>
        <div className={s.sidePanelActions}>
          <button type="button" className={s.sidePanelActionBtn} onClick={onLogout}>
            Logout
          </button>
          <button
            type="button"
            className={s.sidePanelActionBtn}
            onClick={beginNewStory}
            title="Create a new story (meta bootstrap first)."
          >
            New Story
          </button>
          <button
            type="button"
            className={s.sidePanelActionBtn}
            disabled={saveServerBusy || isNewStoryBootstrap}
            onClick={() => void onSaveDraftToServer()}
            title="Save draft changes to server (strict validation)."
          >
            {saveServerBusy ? "Saving..." : "Save Changes"}
          </button>
          {isNewStoryBootstrap ? (
            <button
              type="button"
              className={s.sidePanelActionBtn}
              onClick={cancelNewStory}
              title="Back to previous story"
            >
              Cancel
            </button>
          ) : null}
        </div>
      </aside>
      <div
        className={`${s.workspace} ${draftStory ? "" : s.workspaceCanvasOnly}`}
      >
        <div className={s.leftColumn}>
          <div ref={visualWorkbenchRef} className={s.visualWorkbench}>
            <button
              type="button"
              className={s.visualFullscreenCornerBtn}
              onClick={() => void toggleEditorFullscreen()}
              aria-pressed={isFullscreen}
              aria-label={
                isFullscreen
                  ? "Kilépés a teljes képernyős vászon nézetből"
                  : "Teljes képernyő: csak a vászon és a dokkolt jobb oszlop"
              }
              title={
                isFullscreen
                  ? "Kilépés: Esc vagy újra erre a gombra kattintás"
                  : "Teljes képernyő: nagyobb vászon, jobb oldalon előnézet és oldal-panel"
              }
            >
              {isFullscreen ? (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden
                >
                  <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
                </svg>
              ) : (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden
                >
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                </svg>
              )}
            </button>
            <div className={s.visualWorkbenchBody}>
              {draftStory ? (
                <StoryCanvas
                  draftStory={draftStory}
                  onStoryChange={onStoryChangeFromCanvas}
                  selectedPageIds={selectedPageIds}
                  onSelectPageIds={handleSelectPageIds}
                  onRenamePageId={onRenamePageFromCanvas}
                  onPendingPageCreated={openInspectorForPendingPage}
                  issuesByPage={issuesByPage}
                  metaIssues={metaEditorIssues}
                  embedded
                  onDeletePage={onDeletePage}
                  onCleanPage={onCleanPage}
                  onDuplicatePage={onDuplicatePage}
                  canvasFullscreen={isFullscreen}
                  interactionLocked={isNewStoryBootstrap}
                  fullscreenSideSlot={
                    draftStory && isFullscreen ? (
                      <div className={s.fullscreenSideInner}>
                        <div className={s.fullscreenSideScroll}>
                          <EditorStudioRightColumn
                            draftStory={draftStory}
                            revision={revision}
                            pageIds={pageIds}
                            inspectorOpen={inspectorOpen}
                            onToggleInspector={toggleInspectorExpanded}
                            selectedPageId={selectedPageId}
                            onSelectPageId={(id) =>
                              handleSelectPageIds(id ? [id] : [])
                            }
                            issuesByPage={issuesByPage}
                            onStoryChange={onStoryChangeFromCanvas}
                            onDeletePage={onDeletePage}
                            onRenamePageId={onRenamePageFromCanvas}
                            bootstrapMode={isNewStoryBootstrap}
                            onBootstrapStoryCreated={handleBootstrapStoryCreated}
                          />
                        </div>
                      </div>
                    ) : undefined
                  }
                  visualBarLeading={
                    <>
                      <div className={s.visualStoryPickerRow}>
                        <div className={`${s.storyPickerWrap} ${s.storyPickerWrapInCanvas}`}>
                          <span
                            className={`${s.storyPickerLabel} ${
                              isAdmin
                                ? s.storyPickerLabelAdmin
                                : s.storyPickerLabelUser
                            }`}
                            id="editor-story-src-label"
                          >
                            Projekt
                          </span>
                          <select
                            id="editor-story-select"
                            className={`${s.pageSelect} ${s.storyPickerSelect}`}
                            aria-labelledby="editor-story-src-label"
                            disabled={isNewStoryBootstrap}
                            aria-busy={storyListLoading}
                            title={
                              storyListError
                                ? storyListError
                                : storyListLoading &&
                                    visibleStoryList.length === 0
                                  ? "Projektlista betöltése…"
                                  : isAdmin
                                    ? `Összesen ${serverStoryList.length} projekt a szerveren`
                                    : `Számodra ${visibleStoryList.length} projekt érhető el`
                            }
                            value={normalizeEditorStorySrc(activeStorySrc)}
                            onChange={(e) => {
                              const next = normalizeEditorStorySrc(
                                e.target.value
                              );
                              setActiveStorySrc(next);
                              handleSelectPageIds([]);
                              writePersistedEditorStorySrc(next);
                            }}
                          >
                            {editorStorySelectOptions}
                          </select>
                          {storyListError ? (
                            <span className={s.storyPickerErr}>
                              {storyListError}
                            </span>
                          ) : null}
                          {!isAdmin &&
                          (!editorStoryAllowlist ||
                            editorStoryAllowlist.length === 0) &&
                          !storyListError ? (
                            <span className={s.storyPickerHint}>
                              Korlátozott mód: a környezetben állítsd be a{" "}
                              <code className={s.storyPickerCode}>
                                NEXT_PUBLIC_EDITOR_STORY_ALLOWLIST
                              </code>{" "}
                              változót — vesszővel felsorolt story id-k határozzák meg,
                              mely fájlok jelenjenek meg. Csak teszteléshez: egyetlen{" "}
                              <code className={s.storyPickerCode}>*</code> az összes
                              projekt listázása (éles környezetben ne használd).
                            </span>
                          ) : null}
                        </div>
                      </div>
                      {saveServerHint ? (
                        <span
                          className={
                            saveServerTone === "ok"
                              ? s.saveServerHintOk
                              : s.saveServerHintErr
                          }
                        >
                          {saveServerHint}
                        </span>
                      ) : null}
                    </>
                  }
                />
              ) : (
                <div className={s.visualEmptyState}>
                  <p className={s.visualEmptyStateText}>
                    Kezdés: nyisd le lent a „Haladó: nyers JSON” részt, és illessz be
                    érvényes projekt-adatot — vagy válassz fájlt a fenti listából, ha
                    a backend elérhető. Sikeres betöltés után megjelenik a vászon, jobbra
                    pedig az előnézet és az oldal tulajdonságok panel.
                  </p>
                </div>
              )}
            </div>
          </div>

          {isNewStoryBootstrap ? (
            <div className={s.advancedJsonBlocked}>
              Új projekt esetén először a jobb oldali űrlapot kell kitöltened és elmentened:
              csak utána nyílik meg a nyers JSON, a sablonok és a teljes vászon-szerkesztés.
              Következő lépés: a jobb oldali mentés gomb (új fájl a szerveren).
            </div>
          ) : (
            <details className={s.advancedJson}>
              <summary>Haladó: nyers JSON és sablonok</summary>
              <div className={s.advancedJsonInner}>
                {draftStory ? (
                  <EditorOutline
                    draftStory={draftStory}
                    textareaRef={textareaRef}
                    activeCategory={activeCategory}
                    onActiveCategoryChange={setActiveCategory}
                    onStoryReplaced={onStoryReplaced}
                  />
                ) : null}
                <textarea
                  ref={textareaRef}
                  className={s.textarea}
                  value={jsonText}
                  onChange={(e) => onJsonChange(e.target.value)}
                  spellCheck={false}
                  aria-label="Teljes projekt-adat szerkesztése, haladó nézet (szöveg)"
                  style={{ minHeight: "12rem" }}
                />
                {parseError ? <p className={s.errorBox}>{parseError}</p> : null}
                {schemaHint && !parseError ? (
                  <p className={s.hint}>{schemaHint}</p>
                ) : null}
                <p className={s.hint}>
                  <strong>Haladó nézet és vászon:</strong> a szöveg és a vászon egymást követi;
                  az ellenőrzés figyelmeztethet, de az előnézet ettől még futhat.{" "}
                  <strong>Szerverre mentés:</strong> a vászon fölötti „Változások mentése” írja
                  ki a kiválasztott fájlt (felülírja a meglévőt).
                </p>
              </div>
            </details>
          )}
        </div>

        {draftStory && !isFullscreen ? (
          <div
            className={s.rightColumn}
            aria-label="Előnézet, végoldalak listája és oldal tulajdonságok"
          >
            <EditorStudioRightColumn
              draftStory={draftStory}
              revision={revision}
              pageIds={pageIds}
              inspectorOpen={inspectorOpen}
              onToggleInspector={toggleInspectorExpanded}
              selectedPageId={selectedPageId}
              onSelectPageId={(id) => handleSelectPageIds(id ? [id] : [])}
              issuesByPage={issuesByPage}
              onStoryChange={onStoryChangeFromCanvas}
              onDeletePage={onDeletePage}
              onRenamePageId={onRenamePageFromCanvas}
              bootstrapMode={isNewStoryBootstrap}
              onBootstrapStoryCreated={handleBootstrapStoryCreated}
            />
          </div>
        ) : null}
      </div>

      <div className={s.footerLinks}>
        <Link href="/">← Vissza a kezdőlapra (kilépés a szerkesztőből)</Link>
      </div>
    </div>
  </div>
  );
}
