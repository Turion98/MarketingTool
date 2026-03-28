"use client";

import type { StoryGraphEdge, StoryGraphNode } from "@/app/lib/editor/storyGraph";
import { STORY_GRAPH_START_NODE_ID } from "@/app/lib/editor/storyGraph";
import { CATEGORY_LABELS, type EditorPageCategory } from "@/app/lib/editor/storyPagesFlatten";
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
  const question =
    typeof raw.question === "string" ? raw.question : "";
  const riddleOptions = Array.isArray(raw.options) ? raw.options : [];
  const optCount = riddleOptions.length;
  const correctIdx =
    typeof raw.correctIndex === "number" ? raw.correctIndex : null;
  const riddleTargets = ord
    .filter((e) => e.kind === "puzzleSuccess")
    .map((e) => e.to);

  const inYs = inputPortYs(incomingPortCount, h, node);

  return (
    <div
      className={`${s.card} ${selected ? s.cardSelected : ""} ${issues.length ? s.cardInvalid : ""}`}
      style={{ left: x, top: y, width: w, height: h }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
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
            <span className={s.cardCat}>
              {riddle ? "riddle" : catLabel}
            </span>
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
        ) : riddle ? (
          <div className={s.cardRiddleGrid}>
            <div className={s.cardRiddleCol}>
              <span className={s.cardRiddleColTitle}>Azonosító</span>
              <span className={s.cardIdTight}>{node.pageId}</span>
              <span className={s.cardTagRiddle}>riddle</span>
              <span className={hasRes ? s.cardFragOnTight : s.cardFragOffTight}>
                {hasRes ? "fragment" : "—"}
              </span>
            </div>
            <div className={s.cardRiddleCol}>
              <span className={s.cardRiddleColTitle}>Kérdés / opciók</span>
              <p className={s.cardRiddleQ}>
                {question ? question.slice(0, 120) : "—"}
                {question.length > 120 ? "…" : ""}
              </p>
              <span className={s.cardRiddleMeta}>
                {optCount} opció
                {correctIdx != null ? ` · helyes: #${correctIdx + 1}` : ""}
              </span>
            </div>
            <div className={s.cardRiddleCol}>
              <span className={s.cardRiddleColTitle}>Kimenetek</span>
              {riddleTargets.length ? (
                riddleTargets.map((tid, i) => (
                  <span key={i} className={s.cardRiddleTarget}>
                    → {tid}
                  </span>
                ))
              ) : (
                <span className={s.cardOptMuted}>nincs ág</span>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className={s.cardRow2}>
              {node.isLogicPage ? (
                <span className={s.cardTag}>logic</span>
              ) : node.isPuzzlePage ? (
                <span className={s.cardTag}>
                  {node.puzzleKind === "runes" ? "runes" : "puzzle"}
                </span>
              ) : null}
              <span className={hasRes ? s.cardFragOn : s.cardFragOff}>
                {hasRes ? "Feloldható fragment" : "Nincs fragment a szövegben"}
              </span>
            </div>
            {!node.isLogicPage && !node.isPuzzlePage ? (
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
                top: outPortY(node, slotIndex) - 4,
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
