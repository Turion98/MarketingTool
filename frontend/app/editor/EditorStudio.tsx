"use client";

import Link from "next/link";
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
import { validateStoryPages as validateEditorPages } from "@/app/lib/editor/pageInspectorValidation";
import type { EditorPageCategory } from "@/app/lib/editor/storyPagesFlatten";
import { getClientFetchApiBase } from "@/app/lib/publicApiBase";
import { normalizeLegacyMilestoneFragmentIdsInStory } from "@/app/lib/milestoneFragmentId";
import { removePageFromStory } from "@/app/lib/editor/storyPagePatch";
import { validateStory } from "@/app/lib/schema/validator";
import EditorOutline from "./EditorOutline";
import PageInspector from "./PageInspector";
import StoryCanvas from "./storyCanvas/StoryCanvas";
import s from "./editor.module.scss";

const DEBOUNCE_MS = 380;
const SEED_STORY_SRC = "stories/Mrk6_D_text_updated_en.json";
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

type SkinEntry = { id: string; title: string };

function PreviewToolbar({
  pageIds,
  onSyncEditorPageId,
}: {
  pageIds: string[];
  /** Preview oldal váltás → ugyanaz a kártya legyen kijelölve a vásznon. */
  onSyncEditorPageId: (pageId: string) => void;
}) {
  const { currentPageId, setCurrentPageId, setGlobal } = useGameState();
  const [skins, setSkins] = useState<SkinEntry[]>([]);
  const [skin, setSkin] = useState("contract_creative_dusk");

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
    let initial = "contract_creative_dusk";
    try {
      initial = localStorage.getItem(EDITOR_SKIN_LS) || initial;
    } catch {
      /* ignore */
    }
    setSkin(initial);
    setGlobal("skin", initial);
  }, [setGlobal]);

  const skinOptions = useMemo(() => {
    if (skins.length) return skins;
    return [{ id: "contract_creative_dusk", title: "Creative — Dusk" }];
  }, [skins]);

  return (
    <div className={s.previewToolbar}>
      <label>
        Preview oldal
        <select
          className={s.pageSelect}
          value={pageIds.includes(currentPageId) ? currentPageId : pageIds[0] ?? ""}
          onChange={(e) => {
            const v = e.target.value.trim();
            if (!v) return;
            setCurrentPageId(v);
            if (pageIds.includes(v)) onSyncEditorPageId(v);
          }}
          aria-label="Preview oldal választása"
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
      <label>
        Skin
        <select
          className={s.pageSelect}
          value={skinOptions.some((sk) => sk.id === skin) ? skin : skinOptions[0]?.id}
          onChange={(e) => {
            const v = e.target.value;
            setSkin(v);
            setGlobal("skin", v);
            try {
              localStorage.setItem(EDITOR_SKIN_LS, v);
            } catch {
              /* ignore */
            }
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
      <span className={s.previewToolbarHint}>
        Legördülő = vászon kijelölés; a szerkesztő választás is erre állítja a
        preview-t.
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
}: {
  draftStory: Record<string, unknown>;
  revision: number;
  pageIds: string[];
  selectedPageId: string | null;
  onSelectPageId: (id: string | null) => void;
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
          <span className={s.stackPanelToggleMain}>Előnézet (élő draft)</span>
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
            />
            <div className={s.previewViewport}>
            <div className={s.previewStoryMount}>
              <StoryPage />
            </div>
          </div>
          <div
            className={s.previewResizeHandle}
            role="separator"
            aria-orientation="horizontal"
            aria-valuemin={220}
            aria-valuemax={maxBodyHeightPx}
            aria-valuenow={Math.round(bodyHeightPx)}
            aria-label="Előnézet magasságának állítása"
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
}) {
  return (
    <div className={s.dockedRightStack}>
      <EditorPreviewColumn
        draftStory={draftStory}
        revision={revision}
        pageIds={pageIds}
        selectedPageId={selectedPageId}
        onSelectPageId={onSelectPageId}
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
            <span className={s.stackPanelToggleMain}>Oldal szerkesztő</span>
            {selectedPageId ? (
              <span className={s.stackPanelToggleSub}>{selectedPageId}</span>
            ) : (
              <span className={s.stackPanelToggleSubMuted}>
                Nincs oldal kijelölve
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
          <details className={s.inspectorPageDetails}>
            <summary className={s.inspectorPageSummary}>
              <span className={s.inspectorPageSummaryLabel}>
                <span className={s.inspectorPageSummaryChevron} aria-hidden>
                  ▼
                </span>
                Aktuális oldal
              </span>
              <code>{selectedPageId ?? "—"}</code>
            </summary>
            <div className={s.inspectorPageInner}>
              <label className={s.inspectorPageLabel}>
                Oldal a szerkesztőben
                <select
                  className={s.pageSelect}
                  value={selectedPageId ?? ""}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    onSelectPageId(v || null);
                  }}
                  aria-label="Oldal választása a szerkesztőben"
                >
                  <option value="">
                    {pageIds.length
                      ? "— válassz oldalt —"
                      : "Nincs oldal a sztoriban"}
                  </option>
                  {pageIds.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </label>
              <p className={s.inspectorPageHint}>
                A „Preview oldal” legördülő váltása kijelöli a megfelelő kártyát a
                vásznon; a szerkesztőben választott oldal az előnézetet is erre
                állítja.
              </p>
            </div>
          </details>
          <PageInspector
            draftStory={draftStory}
            selectedPageId={selectedPageId}
            onStoryChange={onStoryChange}
            onRequestDeletePage={onDeletePage}
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
  /** Csak adminnak: szerverlista + váltó a vászon panel tetején. */
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
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const visualWorkbenchRef = useRef<HTMLDivElement>(null);
  const [fullscreenDockEl, setFullscreenDockEl] = useState<HTMLDivElement | null>(
    null
  );
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeStorySrc, setActiveStorySrc] =
    useState<string>(SEED_STORY_SRC);
  const [adminStoryList, setAdminStoryList] = useState<ListedStory[]>([]);
  const [adminListLoading, setAdminListLoading] = useState(false);
  const [adminListError, setAdminListError] = useState<string | null>(null);
  const adminLsSyncedRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    setAdminListLoading(true);
    setAdminListError(null);
    fetch("/api/stories", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: unknown) => {
        if (cancelled) return;
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
        setAdminStoryList(normalized);
      })
      .catch(() => {
        if (cancelled) return;
        setAdminStoryList([]);
        setAdminListError(
          "Nem sikerült betölteni a sztori listát (/api/stories). Ellenőrizd a backendet."
        );
      })
      .finally(() => {
        if (!cancelled) setAdminListLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin || !adminStoryList.length || adminLsSyncedRef.current) return;
    adminLsSyncedRef.current = true;
    try {
      const saved = localStorage.getItem(LS_ADMIN_STORY_SRC);
      if (!saved?.trim()) return;
      const norm = normalizeEditorStorySrc(saved);
      const hit = adminStoryList.some(
        (x) => normalizeEditorStorySrc(x.jsonSrc) === norm
      );
      if (hit) setActiveStorySrc(norm);
    } catch {
      /* ignore */
    }
  }, [isAdmin, adminStoryList]);

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
                ? `Séma figyelmeztetések: ${v.warnings.length} db`
                : null
            );
          } else {
            setSchemaHint(
              `Séma: ${v.errors.length} hiba — a preview ettől még futhat.`
            );
          }
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof DOMException && e.name === "AbortError") return;
        setParseError(
          "Nem sikerült betölteni a sztorit (backend /api/story). Illeszd be manuálisan a JSON-t."
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
        throw new Error("A gyökérnek JSON objektumnak kell lennie.");
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
            ? `Séma figyelmeztetések: ${v.warnings.length} db`
            : null
        );
      } else {
        setSchemaHint(
          `Séma: ${v.errors.length} hiba — a preview ettől még futhat, ha az oldalak felismerhetők.`
        );
      }
    } catch (e) {
      setParseError(e instanceof Error ? e.message : String(e));
      setSchemaHint(null);
    }
  }, []);

  const onJsonChange = useCallback(
    (value: string) => {
      setJsonText(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        applyParsed(value);
      }, DEBOUNCE_MS);
    },
    [applyParsed]
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
    if (selectedPageId && !pageIds.includes(selectedPageId)) {
      setSelectedPageId(null);
    }
  }, [pageIds, selectedPageId]);

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
            ? `Séma figyelmeztetések: ${v.warnings.length} db`
            : null
        );
      } else {
        setSchemaHint(
          `Séma: ${v.errors.length} hiba — a preview ettől még futhat.`
        );
      }
    },
    []
  );

  const onDeletePage = useCallback(
    (pageId: string) => {
      const pid = pageId.trim();
      if (!pid || !draftStory) return;
      if (
        !window.confirm(
          `Biztosan törlöd a(z) „${pid}” oldalt? Más oldalak hivatkozásait kézzel ellenőrizd.`
        )
      ) {
        return;
      }
      const next = removePageFromStory(draftStory, pid);
      onStoryChangeFromCanvas(next);
      setSelectedPageId((cur) => (cur === pid ? null : cur));
    },
    [draftStory, onStoryChangeFromCanvas]
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
            ? `Séma figyelmeztetések: ${v.warnings.length} db`
            : null
        );
      } else {
        setSchemaHint(
          `Séma: ${v.errors.length} hiba — a preview ettől még futhat.`
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

  const adminStorySelectOptions = useMemo((): ReactNode[] => {
    const cur = normalizeEditorStorySrc(activeStorySrc);
    const inList = adminStoryList.some(
      (x) => normalizeEditorStorySrc(x.jsonSrc) === cur
    );
    const opts: ReactNode[] = [];
    if (!inList && cur) {
      opts.push(
        <option key="__current__" value={cur}>
          Jelenlegi (nincs a listán): {cur.replace(/^stories\//, "")}
        </option>
      );
    }
    adminStoryList.forEach((st) => {
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
          Alapértelmezett (lista üres)
        </option>
      );
    }
    return opts;
  }, [activeStorySrc, adminStoryList]);

  return (
    <div className={s.root}>
      <div className={s.shell}>
      <div className={s.topBar}>
        <h1 className={s.title}>Szerkesztő</h1>
        <button type="button" className={s.btnGhost} onClick={onLogout}>
          Kilépés
        </button>
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

      <div
        className={`${s.workspace} ${draftStory ? "" : s.workspaceCanvasOnly}`}
      >
        <div className={s.leftColumn}>
          <div ref={visualWorkbenchRef} className={s.visualWorkbench}>
            <div className={s.visualWorkbenchBody}>
              {draftStory ? (
                <StoryCanvas
                  draftStory={draftStory}
                  onStoryChange={onStoryChangeFromCanvas}
                  selectedPageId={selectedPageId}
                  onSelectPage={setSelectedPageId}
                  issuesByPage={issuesByPage}
                  metaIssues={metaEditorIssues}
                  embedded
                  onDeletePage={onDeletePage}
                  canvasFullscreen={isFullscreen}
                  fullscreenSideSlot={
                    draftStory && isFullscreen ? (
                      <div className={s.fullscreenSideInner}>
                        <EditorStudioRightColumn
                          draftStory={draftStory}
                          revision={revision}
                          pageIds={pageIds}
                          inspectorOpen={inspectorOpen}
                          onToggleInspector={toggleInspectorExpanded}
                          selectedPageId={selectedPageId}
                          onSelectPageId={setSelectedPageId}
                          issuesByPage={issuesByPage}
                          onStoryChange={onStoryChangeFromCanvas}
                          onDeletePage={onDeletePage}
                        />
                      </div>
                    ) : undefined
                  }
                  visualBarLeading={
                    <>
                      <button
                        type="button"
                        className={s.fullscreenToggleBtn}
                        onClick={() => void toggleEditorFullscreen()}
                        aria-pressed={isFullscreen}
                        aria-label={
                          isFullscreen
                            ? "Kilépés a teljes képernyőből"
                            : "Vizuális szerkesztő teljes képernyőre"
                        }
                        title={
                          isFullscreen
                            ? "Kilépés (Esc)"
                            : "Teljes képernyő (vászon)"
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
                      {isAdmin ? (
                        <div className={s.adminInline}>
                          <span
                            className={s.adminInlineLabel}
                            id="editor-admin-src-label"
                          >
                            Forrás
                          </span>
                          <select
                            id="editor-admin-story-select"
                            className={`${s.pageSelect} ${s.adminInlineSelect}`}
                            aria-labelledby="editor-admin-src-label"
                            aria-busy={adminListLoading}
                            title={
                              adminListError
                                ? adminListError
                                : adminListLoading &&
                                    adminStoryList.length === 0
                                  ? "Sztori lista betöltése…"
                                  : `${adminStoryList.length} sztori a szerveren`
                            }
                            value={normalizeEditorStorySrc(activeStorySrc)}
                            onChange={(e) => {
                              const next = normalizeEditorStorySrc(
                                e.target.value
                              );
                              setActiveStorySrc(next);
                              setSelectedPageId(null);
                              try {
                                localStorage.setItem(LS_ADMIN_STORY_SRC, next);
                              } catch {
                                /* ignore */
                              }
                            }}
                          >
                            {adminStorySelectOptions}
                          </select>
                          {adminListError ? (
                            <span className={s.adminInlineErr}>
                              {adminListError}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </>
                  }
                />
              ) : (
                <div className={s.visualEmptyState}>
                  <p className={s.visualEmptyStateText}>
                    Tölts be vagy illessz be érvényes sztori JSON-t a lenti haladó
                    blokkban. Betöltés után az előnézet és az oldal szerkesztő a
                    jobb oszlopban jelenik meg.
                  </p>
                </div>
              )}
            </div>
          </div>

          <details className={s.advancedJson}>
            <summary>Haladó: nyers JSON + vázlat</summary>
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
                aria-label="Sztori JSON szerkesztése"
                style={{ minHeight: "12rem" }}
              />
              {parseError ? <p className={s.errorBox}>{parseError}</p> : null}
              {schemaHint && !parseError ? (
                <p className={s.hint}>{schemaHint}</p>
              ) : null}
              <p className={s.hint}>
                A vászon és az előnézet a memóriában lévő JSON-ból él — sémaellenőrzés
                figyelmeztethet, a preview ettől még futhat.
              </p>
            </div>
          </details>
        </div>

        {draftStory && !isFullscreen ? (
          <div
            className={s.rightColumn}
            aria-label="Előnézet és oldal szerkesztő"
          >
            <EditorStudioRightColumn
              draftStory={draftStory}
              revision={revision}
              pageIds={pageIds}
              inspectorOpen={inspectorOpen}
              onToggleInspector={toggleInspectorExpanded}
              selectedPageId={selectedPageId}
              onSelectPageId={setSelectedPageId}
              issuesByPage={issuesByPage}
              onStoryChange={onStoryChangeFromCanvas}
              onDeletePage={onDeletePage}
            />
          </div>
        ) : null}
      </div>

      <div className={s.footerLinks}>
        <Link href="/">← Vissza a kezdőlapra</Link>
      </div>
    </div>
  </div>
  );
}
