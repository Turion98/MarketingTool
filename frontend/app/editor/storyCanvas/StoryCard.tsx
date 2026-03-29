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
import {
  CATEGORY_LABELS,
  type EditorPageCategory,
  isEditorLogicPage,
} from "@/app/lib/editor/storyPagesFlatten";
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
  inputPortYs,
  isRiddleNode,
  orderedOutgoingEdges,
  outPortY,
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
  onBodyPointerDown,
  onSelectSingleForA11y,
  onDragStart,
  domRef,
  incomingPortDotVisible,
  distantOutgoingEdgeIds,
  onRenamePageId,
}: StoryCardProps) {
  const [idEdit, setIdEdit] = useState(false);
  const [draftId, setDraftId] = useState("");
  const [renameErr, setRenameErr] = useState<string | null>(null);
  const idInputRef = useRef<HTMLInputElement>(null);

  const ord = orderedOutgoingEdges(node.pageId, outgoing);
  const { w, h } = cardDimensions(node, ord);
  const rows = slotCount(node, ord);
  const isStart = node.pageId === STORY_GRAPH_START_NODE_ID;

  const raw = node.raw;
  const catLabel = CATEGORY_LABELS[node.category as EditorPageCategory] ?? node.category;
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

  const inYs = inputPortYs(incomingPortCount, h, {
    logicLayout: node.isLogicPage,
  });

  const milestoneOn =
    milestoneActive ?? raw.saveMilestone === true;
  const showMilestoneOrb =
    !isStart && !isEditorLogicPage(raw) && milestoneOn;

  const pendingPage = !isStart && isEditorPendingPageId(node.pageId);

  useEffect(() => {
    if (!idEdit || !idInputRef.current) return;
    idInputRef.current.focus();
    if (!pendingPage) idInputRef.current.select();
  }, [idEdit, pendingPage]);

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
      ref={domRef}
      className={`${s.card} ${selected ? s.cardSelected : ""} ${issues.length ? s.cardInvalid : ""} ${pendingPage ? s.cardNeedsPageId : ""}`}
      style={{
        left: x,
        top: y,
        width: w,
        height: h,
        ...(typeof stackZ === "number" && Number.isFinite(stackZ)
          ? { zIndex: stackZ }
          : {}),
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
        onPointerDown={(e) => {
          if (
            (e.target as HTMLElement).closest("[data-card-id-zone]")
          ) {
            e.stopPropagation();
            if (e.shiftKey) onBodyPointerDown(e);
            return;
          }
          e.stopPropagation();
          if (e.shiftKey) {
            onBodyPointerDown(e);
            return;
          }
          e.preventDefault();
          onDragStart(e);
        }}
      >
        {isStart ? (
          <div className={s.cardStartInner}>
            <span className={s.cardStartLabel}>Kezdőpont</span>
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
              title={
                onRenamePageId
                  ? pendingPage
                    ? "Kattints vagy dupla katt — egyedi ID megadása (kötelező)"
                    : "Dupla kattintás: oldalazonosító szerkesztése"
                  : undefined
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
                  {pendingPage ? "új oldal — ID kötelező" : node.pageId}
                </span>
              )}
            </div>
            <span className={s.cardCat}>{catLabel}</span>
            {onRequestDelete ? (
              <div className={s.cardHeaderRight}>
                <button
                  type="button"
                  className={s.cardDeleteBtn}
                  aria-label="Oldal törlése"
                  title="Oldal törlése"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRequestDelete();
                  }}
                >
                  ×
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div
        className={s.cardBody}
        onPointerDown={(e) => {
          e.stopPropagation();
          onBodyPointerDown(e);
        }}
      >
        {isStart ? (
          <span className={s.cardStartSub}>start →</span>
        ) : (
          <>
            <div className={s.cardRow2}>
              {node.isLogicPage ? (
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
          {Array.from({ length: rows }, (_, slotIndex) => {
            const e = ord[slotIndex];
            if (
              e &&
              distantOutgoingEdgeIds?.has(e.id)
            ) {
              return null;
            }
            return (
              <span
                key={slotIndex}
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
