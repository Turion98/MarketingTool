"use client";

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
  onSelect: () => void;
  onDragStart: (e: React.PointerEvent) => void;
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
  onSelect,
  onDragStart,
}: StoryCardProps) {
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

  const inYs = inputPortYs(incomingPortCount, h);

  const milestoneOn =
    milestoneActive ?? raw.saveMilestone === true;
  const showMilestoneOrb =
    !isStart && !isEditorLogicPage(raw) && milestoneOn;

  return (
    <div
      className={`${s.card} ${selected ? s.cardSelected : ""} ${issues.length ? s.cardInvalid : ""}`}
      style={{
        left: x,
        top: y,
        width: w,
        height: h,
        ...(typeof stackZ === "number" && Number.isFinite(stackZ)
          ? { zIndex: stackZ }
          : {}),
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
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
          {inYs.map((py, i) => (
            <span
              key={i}
              className={s.portDot}
              style={{ top: py - 4 }}
            />
          ))}
        </div>
      ) : null}

      <div
        className={s.cardDragStrip}
        title="Húzd az áthelyezéshez"
        onPointerDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onDragStart(e);
        }}
      >
        {isStart ? (
          <div className={s.cardStartInner}>
            <span className={s.cardStartLabel}>Kezdőpont</span>
          </div>
        ) : (
          <div className={s.cardRow1}>
            <span className={s.cardId}>{node.pageId}</span>
            <span className={s.cardCat}>{catLabel}</span>
            {onRequestDelete ? (
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
            ) : null}
          </div>
        )}
      </div>

      <div
        className={s.cardBody}
        onPointerDown={(e) => {
          e.stopPropagation();
          onSelect();
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
          {Array.from({ length: rows }, (_, slotIndex) => (
            <span
              key={slotIndex}
              className={s.portDotOut}
              style={{
                top: outPortY(slotIndex) - 4,
              }}
            />
          ))}
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
