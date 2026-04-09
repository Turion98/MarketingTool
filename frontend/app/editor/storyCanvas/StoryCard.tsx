"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from "react";
import type { StoryGraphEdge, StoryGraphNode } from "@/app/lib/editor/storyGraph";
import { STORY_GRAPH_START_NODE_ID } from "@/app/lib/editor/storyGraph";
import { isEditorLogicPage } from "@/app/lib/editor/storyPagesFlatten";
import {
  choiceFragmentVisibilityTitle,
  choiceHasConditionalDisplay,
  choiceHasFragmentVisibilityRule,
  choiceHasSavedFragments,
  pageHasResolvableFragments,
} from "@/app/lib/editor/storyCardSignals";
import type { PageValidationIssue } from "@/app/lib/editor/pageInspectorValidation";
import {
  START_H,
  cardDimensions,
  editorEndCardAccentStyle,
  inputPortYs,
  isRiddleNode,
  orderedOutgoingEdges,
  outPortY,
  outgoingSlotIndexForEdge,
  slotCount,
} from "./storyCanvasGeometry";
import { isEditorPendingPageId } from "@/app/lib/editor/storyTemplateInsert";
import s from "./storyCanvas.module.scss";

type StoryCardProps = {
  node: StoryGraphNode;
  x: number;
  y: number;
  outgoing: StoryGraphEdge[];
  incomingPortCount: number;
  selected: boolean;
  issues: PageValidationIssue[];
  /** Ha meg van adva: milestone = flag VAGY fragment bank `{pageId}_DONE` */
  milestoneActive?: boolean;
  /** Nagyobb érték = felül (meta.editorLayout z). */
  stackZ?: number;
  /** Csak nem-kezdő kártyán; megerősítés a szülőben. */
  onRequestDelete?: () => void;
  /** Kártya tartalmának alaphelyzetbe állítása (ID marad). */
  onRequestClean?: () => void;
  /** Kártya másolása egyedi ID-val. */
  onRequestDuplicate?: () => void;
  onBodyPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onSelectSingleForA11y?: () => void;
  onDragStart: (e: ReactPointerEvent<HTMLDivElement>) => void;
  /** Vászon: kijelöléskor a kártya DOM-ja (láthatóság / pan). */
  domRef?: Ref<HTMLDivElement | null>;
  /** Bemeneti kötegenként: false = csak távoli él, ne legyen szürke portpont. */
  incomingPortDotVisible?: boolean[];
  /** Kimenő él id-k, amikhez ne rajzoljunk jobb oldali portpontot (távoli bekötés). */
  distantOutgoingEdgeIds?: Set<string>;
  /** Dupla kattintás a fejlécben: oldal-ID; `null` = siker. */
  onRenamePageId?: (fromId: string, toId: string) => string | null;
  /** Új sztori bootstrap: START kártyán rövid útmutató. */
  bootstrapStartHint?: boolean;
};

export default function StoryCard({
  node,
  x,
  y,
  outgoing,
  incomingPortCount,
  selected,
  issues,
  milestoneActive,
  stackZ,
  onRequestDelete,
  onRequestClean,
  onRequestDuplicate,
  onBodyPointerDown,
  onSelectSingleForA11y,
  onDragStart,
  domRef,
  incomingPortDotVisible,
  distantOutgoingEdgeIds,
  onRenamePageId,
  bootstrapStartHint = false,
}: StoryCardProps) {
  const [idEdit, setIdEdit] = useState(false);
  const [draftId, setDraftId] = useState("");
  const [renameErr, setRenameErr] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const idInputRef = useRef<HTMLInputElement>(null);
  const cardRootRef = useRef<HTMLDivElement | null>(null);

  const ord = orderedOutgoingEdges(node.pageId, outgoing);
  const { w, h } = cardDimensions(node, ord);
  const rows = slotCount(node, ord);
  const isStart = node.pageId === STORY_GRAPH_START_NODE_ID;

  const raw = node.raw;
  const hasRes = !isStart && pageHasResolvableFragments(raw);
  const choices = Array.isArray(raw.choices) ? raw.choices : [];

  const riddle = isRiddleNode(node);
  const riddleOptLabels = Array.isArray(raw.options)
    ? raw.options.filter((x): x is string => typeof x === "string" && !!x)
    : [];
  const riddleStripCount = riddle
    ? riddleOptLabels.length >= 1
      ? riddleOptLabels.length
      : Math.max(ord.length, 1)
    : 0;

  const isRunesPuzzle =
    node.isPuzzlePage &&
    !riddle &&
    node.puzzleKind === "runes" &&
    Array.isArray(raw.options);
  const runesOptLabels = isRunesPuzzle
    ? (raw.options as unknown[]).filter(
        (x): x is string => typeof x === "string" && x.trim().length > 0
      )
    : [];

  const inYs = inputPortYs(incomingPortCount, h, {
    logicLayout:
      node.isLogicPage || node.category === "puzzleRoute" || node.category === "poolRoute",
  });

  const milestoneOn =
    milestoneActive ?? raw.saveMilestone === true;
  const showMilestoneOrb =
    !isStart && !isEditorLogicPage(raw) && milestoneOn;

  const pendingPage = !isStart && isEditorPendingPageId(node.pageId);
  const headerDisplayText = pendingPage ? "" : node.pageId;
  const headerHoverLabel = node.pageId;

  useEffect(() => {
    if (!idEdit || !idInputRef.current) return;
    idInputRef.current.focus();
    if (!pendingPage) idInputRef.current.select();
  }, [idEdit, pendingPage]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocPointerDown = (ev: PointerEvent) => {
      const t = ev.target as Node | null;
      if (!t) return;
      if (cardRootRef.current?.contains(t)) return;
      setMenuOpen(false);
    };
    const onDocKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onDocPointerDown);
    document.addEventListener("keydown", onDocKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown);
      document.removeEventListener("keydown", onDocKeyDown);
    };
  }, [menuOpen]);

  const cancelIdEdit = useCallback(() => {
    setIdEdit(false);
    setRenameErr(null);
  }, []);

  const tryCommitId = useCallback(() => {
    if (!onRenamePageId || !idEdit) return;
    const trimmed = draftId.trim();
    if (pendingPage) {
      if (!trimmed) {
        cancelIdEdit();
        return;
      }
    } else {
      if (!trimmed) {
        setRenameErr("Az oldalazonosító nem lehet üres.");
        return;
      }
      if (trimmed === node.pageId) {
        cancelIdEdit();
        return;
      }
    }
    const err = onRenamePageId(node.pageId, trimmed);
    if (err) setRenameErr(err);
    else {
      setIdEdit(false);
      setRenameErr(null);
    }
  }, [
    cancelIdEdit,
    draftId,
    idEdit,
    node.pageId,
    onRenamePageId,
    pendingPage,
  ]);

  const beginIdEdit = useCallback(
    (e: ReactMouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (isStart || !onRenamePageId) return;
      setRenameErr(null);
      setDraftId(pendingPage ? "" : node.pageId);
      setIdEdit(true);
    },
    [isStart, node.pageId, onRenamePageId, pendingPage]
  );

  const lastAutoOpenPendingKey = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingPage) {
      lastAutoOpenPendingKey.current = null;
      return;
    }
    if (!selected || !onRenamePageId) return;
    if (lastAutoOpenPendingKey.current === node.pageId) return;
    lastAutoOpenPendingKey.current = node.pageId;
    setRenameErr(null);
    setDraftId("");
    setIdEdit(true);
  }, [pendingPage, selected, onRenamePageId, node.pageId]);

  return (
    <div
      ref={(el) => {
        cardRootRef.current = el;
        if (!domRef) return;
        if (typeof domRef === "function") {
          domRef(el);
          return;
        }
        (domRef as { current: HTMLDivElement | null }).current = el;
      }}
      className={`${s.card} ${node.category === "end" ? s.cardEnd : ""} ${selected ? s.cardSelected : ""} ${issues.length ? s.cardInvalid : ""} ${pendingPage ? s.cardNeedsPageId : ""}`}
      style={{
        left: x,
        top: y,
        width: w,
        height: h,
        ...(node.category === "end"
          ? editorEndCardAccentStyle(node.pageId, selected)
          : {}),
        ...(typeof stackZ === "number" && Number.isFinite(stackZ)
          ? { zIndex: menuOpen ? Math.max(stackZ, 9999) : stackZ }
          : menuOpen
            ? { zIndex: 9999 }
            : {}),
        ...(menuOpen ? { overflow: "visible" } : {}),
      }}
      role={idEdit ? undefined : "button"}
      tabIndex={idEdit ? -1 : 0}
      onKeyDown={(e) => {
        if (idEdit) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelectSingleForA11y?.();
        }
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
      }}
      onPointerDown={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("[data-no-card-drag='1']")) {
          e.stopPropagation();
          return;
        }
        e.stopPropagation();
        onBodyPointerDown(e);
        if (e.shiftKey) {
          return;
        }
        e.preventDefault();
        onDragStart(e);
      }}
    >
      {showMilestoneOrb ? (
        <span
          className={s.milestoneOrb}
          aria-hidden
          title={`Milestone: ${node.pageId}_DONE`}
        />
      ) : null}
      {!isStart && incomingPortCount > 0 ? (
        <div className={s.cardInPorts} aria-hidden>
          {inYs.map((py, i) => {
            const showDot = incomingPortDotVisible?.[i] !== false;
            if (!showDot) return null;
            return (
              <span
                key={i}
                className={s.portDot}
                style={{ top: py - 4 }}
              />
            );
          })}
        </div>
      ) : null}

      <div
        className={s.cardDragStrip}
        title={
          pendingPage
            ? "Dupla katt az ID mezőn — kötelező. Máshol húzd az áthelyezéshez."
            : "Húzd az áthelyezéshez (az ID sávon dupla katt: szerkesztés)"
        }
      >
        {isStart ? (
          <div className={s.cardStartInner}>
            <span className={s.cardStartLabel}>Kezdőpont</span>
            {bootstrapStartHint ? (
              <span className={s.cardStartBootstrapHint}>
                Add meg a sztori adatait a jobb panelen.
              </span>
            ) : null}
          </div>
        ) : (
          <div
            className={s.cardRow1}
            onDoubleClick={(e) => {
              e.stopPropagation();
              if ((e.target as HTMLElement).closest("button")) return;
              beginIdEdit(e);
            }}
          >
            <div
              className={s.cardIdZone}
              data-card-id-zone="1"
              data-no-card-drag="1"
              title={
                pendingPage
                  ? onRenamePageId
                    ? "Kattints vagy dupla katt — egyedi ID megadása (kötelező)"
                    : undefined
                  : onRenamePageId
                    ? `${headerHoverLabel} — dupla katt: azonosító szerkesztése`
                    : headerHoverLabel
              }
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                if (!onRenamePageId || idEdit || isStart) return;
                if (pendingPage) {
                  setRenameErr(null);
                  setDraftId("");
                  setIdEdit(true);
                }
              }}
            >
              {idEdit ? (
                <input
                  ref={idInputRef}
                  className={s.cardIdInput}
                  data-no-card-drag="1"
                  value={draftId}
                  aria-label="Oldalazonosító"
                  aria-invalid={renameErr ? true : undefined}
                  title={renameErr ?? undefined}
                  spellCheck={false}
                  autoComplete="off"
                  placeholder={pendingPage ? "pl. chapter_2_a" : undefined}
                  onChange={(e) => {
                    setDraftId(e.target.value);
                    setRenameErr(null);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      tryCommitId();
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      cancelIdEdit();
                    }
                  }}
                  onBlur={() => {
                    window.setTimeout(() => tryCommitId(), 0);
                  }}
                />
              ) : (
                <span
                  className={`${s.cardId} ${pendingPage ? s.cardIdMuted : ""}`}
                >
                  {pendingPage ? "új oldal — ID kötelező" : headerDisplayText}
                </span>
              )}
            </div>
            {onRequestDelete ? (
              <div className={s.cardHeaderRight}>
                <button
                  type="button"
                  className={s.cardMenuBtn}
                  data-no-card-drag="1"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  aria-label="Kártya műveletek"
                  title="Kártya műveletek"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen((open) => !open);
                  }}
                >
                  ⋯
                </button>
                {menuOpen ? (
                  <div
                    className={s.cardMenuPanel}
                    data-no-card-drag="1"
                    role="menu"
                    aria-label="Kártya műveletek"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                  >
                    {onRequestClean ? (
                      <button
                        type="button"
                        className={s.cardMenuItem}
                        role="menuitem"
                        data-no-card-drag="1"
                        onClick={() => {
                          setMenuOpen(false);
                          onRequestClean();
                        }}
                      >
                        Clean
                      </button>
                    ) : null}
                    {onRequestDuplicate ? (
                      <button
                        type="button"
                        className={s.cardMenuItem}
                        role="menuitem"
                        data-no-card-drag="1"
                        onClick={() => {
                          setMenuOpen(false);
                          onRequestDuplicate();
                        }}
                      >
                        Duplicate
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className={`${s.cardMenuItem} ${s.cardMenuDelete}`}
                      role="menuitem"
                      data-no-card-drag="1"
                      onClick={() => {
                        setMenuOpen(false);
                        onRequestDelete();
                      }}
                    >
                      Delete
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className={s.cardBody}>
        {isStart ? (
          <span className={s.cardStartSub}>start →</span>
        ) : (
          <>
            <div className={s.cardRow2}>
              {node.category === "puzzleRoute" ? (
                <span className={s.cardTagRoute}>route</span>
              ) : node.category === "poolRoute" ? (
                <span className={s.cardTagRoute}>pool route</span>
              ) : node.isLogicPage ? (
                <span className={s.cardTag}>logic</span>
              ) : node.isPuzzlePage && !riddle ? (
                <span className={s.cardTag}>
                  {node.puzzleKind === "runes" ? "runes" : "puzzle"}
                </span>
              ) : null}
              <span className={hasRes ? s.cardFragOn : s.cardFragOff}>
                {hasRes ? "Feloldható fragment" : "Nincs fragment a szövegben"}
              </span>
            </div>
            {riddle ? (
              <div className={s.cardOptStripStack}>
                {riddleOptLabels.length === 0 && ord.length === 0 ? (
                  <span className={s.cardOptMuted}>nincs opció</span>
                ) : (
                  Array.from({ length: riddleStripCount }, (_, idx) => (
                    <div
                      key={ord[idx]?.id ?? `${node.pageId}-riddle-${idx}`}
                      className={s.cardOptStrip}
                    >
                      <span className={s.cardOptStripLabel}>
                        Opció {idx + 1}
                      </span>
                      <span className={s.cardOptStripSpacer} />
                      <span
                        className={s.cardVisDotOff}
                        title="Nincs fragmenthez kötött láthatóság"
                        aria-hidden
                      />
                      <span
                        className={s.cardFragDotOff}
                        title="Nincs mentett fragment az opciónál (jutalom)"
                        aria-hidden
                      />
                    </div>
                  ))
                )}
              </div>
            ) : node.category === "end" ? (
              <div className={s.cardOptStripStack}>
                <span className={s.cardOptMuted}>vég — nincs kimenet</span>
              </div>
            ) : node.category === "puzzleRoute" ? (
              <div className={s.cardOptStripStack}>
                {ord.length === 0 ? (
                  <span className={s.cardOptMuted}>nincs kimenet</span>
                ) : (
                  ord.map((e) => {
                    const rawLab = String(e.label ?? "");
                    const comboLab = rawLab.startsWith("rt:")
                      ? rawLab.slice(3)
                      : rawLab;
                    return (
                      <div key={e.id} className={s.cardOptStrip}>
                        <span className={s.cardOptStripMain}>
                          {e.kind === "logicElse" ? (
                            <span className={s.cardRouteElseMark}>default</span>
                          ) : (
                            <>
                              <span className={s.cardRouteComboMark}>kombó</span>
                              <span
                                className={s.cardLogicFragTight}
                                title={comboLab}
                              >
                                {comboLab || "?"}
                              </span>
                            </>
                          )}
                        </span>
                        <span className={s.cardOptStripGoto} title={e.to}>
                          → {e.to}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            ) : node.category === "poolRoute" ? (
              <div className={s.cardOptStripStack}>
                {ord.length === 0 ? (
                  <span className={s.cardOptMuted}>nincs kimenet</span>
                ) : (
                  ord.map((e) => {
                    const rawLab = String(e.label ?? "");
                    const comboLab = rawLab.startsWith("pool:")
                      ? rawLab.slice(5)
                      : rawLab;
                    return (
                      <div key={e.id} className={s.cardOptStrip}>
                        <span className={s.cardOptStripMain}>
                          {e.kind === "logicElse" ? (
                            <span className={s.cardRouteElseMark}>default</span>
                          ) : (
                            <>
                              <span className={s.cardRouteComboMark}>pool</span>
                              <span
                                className={s.cardLogicFragTight}
                                title={comboLab}
                              >
                                {comboLab || "?"}
                              </span>
                            </>
                          )}
                        </span>
                        <span className={s.cardOptStripGoto} title={e.to}>
                          → {e.to}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            ) : !node.isLogicPage && !node.isPuzzlePage ? (
              <div className={s.cardOptStripStack}>
                {choices.length === 0 ? (
                  <span className={s.cardOptMuted}>nincs opció</span>
                ) : (
                  choices.map((ch, idx) => {
                    const conditional = choiceHasConditionalDisplay(ch);
                    const visRule = choiceHasFragmentVisibilityRule(ch);
                    const visTitle = choiceFragmentVisibilityTitle(ch);
                    const fragDot = choiceHasSavedFragments(ch);
                    return (
                      <div key={idx} className={s.cardOptStrip}>
                        <span className={s.cardOptStripLabel}>
                          Opció {idx + 1}
                        </span>
                        {conditional ? (
                          <span
                            className={s.cardCondPin}
                            title="Feltételes megjelenés (lock / when)"
                          />
                        ) : null}
                        <span className={s.cardOptStripSpacer} />
                        <span
                          className={
                            visRule ? s.cardVisDotOn : s.cardVisDotOff
                          }
                          title={
                            visRule
                              ? visTitle
                              : "Nincs fragmenthez kötött láthatóság"
                          }
                        />
                        <span
                          className={
                            fragDot ? s.cardFragDotOn : s.cardFragDotOff
                          }
                          title="Mentett fragment az opciónál (jutalom)"
                        />
                      </div>
                    );
                  })
                )}
              </div>
            ) : node.isLogicPage ? (
              <div className={s.cardOptStripStack}>
                {ord.map((e) => (
                  <div key={e.id} className={s.cardOptStrip}>
                    <span className={s.cardOptStripMain}>
                      {e.kind === "logicElse" ? (
                        <span className={s.cardLogicElseMark}>egyébként</span>
                      ) : (
                        <>
                          <span className={s.cardLogicIfMark}>ha</span>
                          <span className={s.cardLogicFragTight}>
                            {String(e.label ?? "?")}
                          </span>
                        </>
                      )}
                    </span>
                    <span className={s.cardOptStripGoto} title={e.to}>
                      → {e.to}
                    </span>
                  </div>
                ))}
              </div>
            ) : isRunesPuzzle ? (
              <div className={s.cardOptStripStack}>
                {runesOptLabels.length === 0 ? (
                  <span className={s.cardOptMuted}>nincs opció</span>
                ) : (
                  runesOptLabels.map((label, idx) => (
                    <div
                      key={`${node.pageId}-runes-${idx}`}
                      className={s.cardOptStrip}
                    >
                      <span className={s.cardOptStripLabel}>
                        Opció {idx + 1}
                      </span>
                      <span className={s.cardOptStripSpacer} />
                      <span className={s.cardRunesOptText} title={label}>
                        {label.length > 28 ? `${label.slice(0, 27)}…` : label}
                      </span>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className={s.cardOptStripStack}>
                <div className={s.cardOptStrip}>
                  <span className={s.cardPuzzleBranchOk}>siker</span>
                  <span className={s.cardOptStripGoto} title={ord.find((x) => x.kind === "puzzleSuccess")?.to}>
                    {ord.find((x) => x.kind === "puzzleSuccess")?.to ?? "—"}
                  </span>
                </div>
                <div className={s.cardOptStrip}>
                  <span className={s.cardPuzzleBranchFail}>hiba</span>
                  <span className={s.cardOptStripGoto} title={ord.find((x) => x.kind === "puzzleFail")?.to}>
                    {ord.find((x) => x.kind === "puzzleFail")?.to ?? "—"}
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {!isStart ? (
        <div className={s.cardOutPorts} aria-hidden>
          {ord.map((e, edgeIdx) => {
            if (distantOutgoingEdgeIds?.has(e.id)) {
              return null;
            }
            const slotIndex = outgoingSlotIndexForEdge(node, ord, edgeIdx);
            return (
              <span
                key={e.id}
                className={s.portDotOut}
                style={{
                  top: outPortY(slotIndex) - 4,
                }}
              />
            );
          })}
        </div>
      ) : (
        <div className={s.cardOutPorts} aria-hidden>
          <span
            className={s.portDotOut}
            style={{ top: START_H / 2 - 4 }}
          />
        </div>
      )}

      {issues.length > 0 ? (
        <div className={s.cardIssueBadge} title={issues.map((i) => i.message).join("\n")}>
          {issues.length}
        </div>
      ) : null}
    </div>
  );
}
