"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
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
import { validateStory } from "@/app/lib/schema/validator";
import EditorOutline from "./EditorOutline";
import PageInspector from "./PageInspector";
import StoryCanvas from "./storyCanvas/StoryCanvas";
import s from "./editor.module.scss";

const DEBOUNCE_MS = 380;
const SEED_STORY_SRC = "stories/Mrk6_D_text_updated_en.json";
const LS_PREFIX = "questell:editor:draft:";
const EDITOR_SKIN_LS = "questell:editor:skinPref";
const PREVIEW_HEIGHT_LS = "questell:editor:previewHeightPx";
const PREVIEW_EXPANDED_LS = "questell:editor:previewExpanded";
const INSPECTOR_EXPANDED_LS = "questell:editor:inspectorExpanded";

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function defaultPreviewBodyHeightPx() {
  if (typeof window === "undefined") return 480;
  return Math.round(clamp(window.innerHeight * 0.52, 280, 820));
}

type SkinEntry = { id: string; title: string };

function PreviewToolbar({ pageIds }: { pageIds: string[] }) {
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
          onChange={(e) => setCurrentPageId(e.target.value)}
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
        Kézi ugrás + megjelenés csak az előnézetben.
      </span>
    </div>
  );
}

function EditorPreviewColumn({
  draftStory,
  revision,
  pageIds,
}: {
  draftStory: Record<string, unknown>;
  revision: number;
  pageIds: string[];
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
          const maxH =
            typeof window !== "undefined"
              ? Math.min(920, Math.round(window.innerHeight * 0.92))
              : 920;
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

  const maxBodyHeightPx =
    typeof window !== "undefined"
      ? Math.min(920, Math.round(window.innerHeight * 0.92))
      : 920;

  useEffect(() => {
    const onResize = () => {
      setBodyHeightPx((h) => {
        const maxH =
          typeof window !== "undefined"
            ? Math.min(920, Math.round(window.innerHeight * 0.92))
            : 920;
        const next = clamp(h, 220, maxH);
        bodyHeightRef.current = next;
        return next;
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
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
      const maxH =
        typeof window !== "undefined"
          ? Math.min(920, Math.round(window.innerHeight * 0.92))
          : 920;
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
        <div
          id={bodyId}
          className={s.previewPanelBody}
          hidden={!previewExpanded}
          style={
            previewExpanded
              ? { height: `${bodyHeightPx}px`, maxHeight: `${maxBodyHeightPx}px` }
              : undefined
          }
        >
          <PreviewToolbar pageIds={pageIds} />
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
      </GameStateProvider>
    </div>
  );
}

type EditorStudioProps = {
  userEmail: string | null | undefined;
  userId: string | undefined;
  tierLabel: string | null;
  tierColor: string;
  onLogout: () => void;
};

export default function EditorStudio({
  userEmail,
  userId,
  tierLabel,
  tierColor,
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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let cancelled = false;
    const base = getClientFetchApiBase();
    const url = `${base}/api/story?src=${encodeURIComponent(SEED_STORY_SRC)}`;
    fetch(url)
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
      .catch(() => {
        if (cancelled) return;
        setParseError(
          "Nem sikerült betölteni a minta sztorit (backend /api/story). Illeszd be manuálisan a JSON-t."
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

      <div className={s.workspace}>
        <div className={s.leftColumn}>
          {draftStory ? (
            <div className={`${s.panel} ${s.storyPanel}`}>
              <div className={s.panelHeader}>Sztori (vászon)</div>
              <StoryCanvas
                draftStory={draftStory}
                onStoryChange={onStoryChangeFromCanvas}
                selectedPageId={selectedPageId}
                onSelectPage={setSelectedPageId}
                issuesByPage={issuesByPage}
                metaIssues={metaEditorIssues}
                embedded
              />
            </div>
          ) : (
            <div className={s.panel}>
              <div className={s.panelHeader}>Sztori (vászon)</div>
              <p className={s.hint} style={{ padding: "1.25rem" }}>
                Tölts be vagy illessz be érvényes sztori JSON-t a haladó nézetben.
              </p>
            </div>
          )}

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

        {draftStory ? (
          <div className={s.rightColumn}>
            <EditorPreviewColumn
              draftStory={draftStory}
              revision={revision}
              pageIds={pageIds}
            />
            <div
              className={`${s.panel} ${s.previewPanel} ${s.inspectorPanelRoot}`}
            >
              <button
                type="button"
                className={`${s.panelHeader} ${s.previewPanelToggle}`}
                aria-expanded={inspectorOpen}
                aria-controls="editor-inspector-body"
                onClick={toggleInspectorExpanded}
              >
                <span className={s.stackPanelToggleTitle}>
                  <span className={s.stackPanelToggleMain}>
                    Oldal szerkesztő
                  </span>
                  {selectedPageId ? (
                    <span className={s.stackPanelToggleSub}>
                      {selectedPageId}
                    </span>
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
                      <span
                        className={s.inspectorPageSummaryChevron}
                        aria-hidden
                      >
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
                          setSelectedPageId(v || null);
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
                      Az előnézet oldala külön állítható a fenti „Preview oldal”
                      menüben.
                    </p>
                  </div>
                </details>
                <PageInspector
                  draftStory={draftStory}
                  selectedPageId={selectedPageId}
                  onStoryChange={onStoryChangeFromCanvas}
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
        ) : (
          <div className={s.panel}>
            <div className={s.panelHeader}>Előnézet</div>
            <p className={s.hint} style={{ padding: "1.25rem" }}>
              Adj meg érvényes JSON-t — az előnézet itt jelenik meg.
            </p>
          </div>
        )}
      </div>

      <div className={s.footerLinks}>
        <Link href="/">← Vissza a kezdőlapra</Link>
      </div>
      </div>
    </div>
  );
}
