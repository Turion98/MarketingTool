"use client";

import type { MutableRefObject, ReactElement, ReactNode } from "react";

import type { CtaConfig, CtaContext } from "../../core/cta/ctaTypes";
import { trackPuzzleResult, trackPuzzleTry } from "../../lib/analytics";
import {
  buildOpenModeRoutePickKey,
  puzzleRoutePickGlobalKey,
  runesPickBounds,
} from "../../lib/puzzleRoutePick";
import CampaignCta from "../CampaignCta/CampaignCta";
import InteractionDock from "../layout/InteractionDock/InteractionDock";
import PuzzleRunes from "../labs/PuzzleRunes/PuzzleRunes";
import RiddleQuiz, { type RiddleQuizResult } from "../labs/RiddleQuiz/RiddleQuiz";
import dockStyles from "../layout/InteractionDock/InteractionDock.module.scss";

import { type DockChoiceItem, resolveDockSelection } from "./storyPageChoices";
import style from "./StoryPage.module.scss";

type PuzzleRiddleData = {
  id?: string;
  question: string;
  options: string[];
  correctIndex: number;
};

type PuzzleRunesBranch = {
  goto?: string;
  setFlags?: string[] | Record<string, boolean>;
};

type PuzzleRunesData = {
  id: string;
  options: string[];
  answer?: string[];
  maxAttempts?: number;
  maxPick?: number;
  minPick?: number;
  optionFlagsBase?: string;
  mode?: "ordered" | "set";
  feedback?: "keep" | "reset";
  onSuccess?: PuzzleRunesBranch;
  onFail?: PuzzleRunesBranch;
};

type DockPageData = {
  id: string;
  choices?: unknown[];
  [key: string]: unknown;
};

type StoryPageDockProps = {
  showChoices: boolean;
  choicePageId: string | null;
  pageUnlockedForInteraction: string | null;
  dockRef: MutableRefObject<HTMLDivElement | null>;
  dockJustAppeared: boolean;
  isFadingOut: boolean;
  isEndNode: boolean;
  resolvedEndCta: CtaConfig;
  endCtaContext: CtaContext;
  isRiddlePage: boolean;
  isRunesPage: boolean;
  pageData: DockPageData;
  riddleCorrectLabel: string;
  derivedStoryId?: string;
  derivedSessionId?: string;
  dockChoicesForThisPage: DockChoiceItem[];
  resolvedNext?: string | null;
  handleRiddleAnswer: (choiceIdx: number) => void;
  handleChoice: (next: string, reward?: unknown, choiceObj?: unknown) => void;
  setFlag: (flagId: string) => void;
  goToNextPage: (id: string) => void;
  setGlobal?: (key: string, value: unknown) => void;
  embedGhost?: boolean;
  /** Vége CTA: ugyanaz a média blokk, mint a Canvas-on (kis előnézet a gomb fölött) */
  endCtaMedia?: ReactNode;
};

export function StoryPageDock({
  showChoices,
  choicePageId,
  pageUnlockedForInteraction,
  dockRef,
  dockJustAppeared,
  isFadingOut,
  isEndNode,
  resolvedEndCta,
  endCtaContext,
  isRiddlePage,
  isRunesPage,
  pageData,
  riddleCorrectLabel,
  derivedStoryId,
  derivedSessionId,
  dockChoicesForThisPage,
  resolvedNext,
  handleRiddleAnswer,
  handleChoice,
  setFlag,
  goToNextPage,
  setGlobal,
  embedGhost = false,
  endCtaMedia,
}: StoryPageDockProps): ReactElement | null {
  if (
    !showChoices ||
    choicePageId !== pageData.id ||
    pageUnlockedForInteraction !== pageData.id
  ) {
    return null;
  }

  const handleRiddleResult = (result: RiddleQuizResult, page: PuzzleRiddleData) => {
    const pageId = pageData?.id;
    const puzzleId = page.id ?? pageId ?? "riddle";
    if (derivedStoryId && derivedSessionId && pageId) {
      try {
        trackPuzzleTry(
          derivedStoryId,
          derivedSessionId,
          pageId,
          puzzleId,
          1,
          { kind: "riddle" }
        );
        trackPuzzleResult(
          derivedStoryId,
          derivedSessionId,
          pageId,
          puzzleId,
          result.correct,
          1,
          result.elapsedMs ?? 0,
          { kind: "riddle" }
        );
      } catch {}
    }
    handleRiddleAnswer(result.choiceIdx);
  };

  const handleRunesResult = (
    ok: boolean,
    pickedIds: string[],
    page: PuzzleRunesData,
    answer: string[]
  ) => {
    const isOpenPuzzle = answer.length === 0;
    if (!ok && isOpenPuzzle) return;

    if (
      isOpenPuzzle &&
      typeof page.optionFlagsBase === "string" &&
      Array.isArray(page.options)
    ) {
      pickedIds.forEach((label) => {
        const idx = page.options.indexOf(label);
        if (idx >= 0) {
          const flagId = `${page.optionFlagsBase}${idx + 1}`;
          setFlag(flagId);
        }
      });
    }

    if (ok && isOpenPuzzle && setGlobal && Array.isArray(page.options)) {
      const { minPick, maxPick } = runesPickBounds(page);
      const mode = "set";
      const routeKey = buildOpenModeRoutePickKey(
        pickedIds,
        page.options,
        mode,
        minPick,
        maxPick
      );
      if (routeKey) {
        setGlobal(puzzleRoutePickGlobalKey(page.id), routeKey);
      }
      // #region agent log
      if (page.id === "q1_skin_profile") {
        fetch("http://127.0.0.1:7672/ingest/6a94a54d-1f1d-4f7c-b733-51215673e5ef", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Debug-Session-Id": "1f7ff1",
          },
          body: JSON.stringify({
            sessionId: "1f7ff1",
            runId: "pre-fix",
            hypothesisId: "H4",
            location: "StoryPageDock.tsx:handleRunesResult",
            message: "runes success open mode route",
            data: {
              ok,
              routeKey,
              globalKey: puzzleRoutePickGlobalKey(page.id),
              pickedCount: pickedIds.length,
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
      }
      // #endregion
    }

    const branch = ok ? page.onSuccess : page.onFail;
    if (!branch) return;

    const branchFlags = branch.setFlags;
    if (Array.isArray(branchFlags)) {
      branchFlags.forEach((flagId) => setFlag(flagId));
    } else if (branchFlags && typeof branchFlags === "object") {
      Object.entries(branchFlags).forEach(([key, value]) => {
        if (value) setFlag(key);
      });
    }

    const next = branch.goto;
    if (next && next !== pageData?.id) {
      try {
        localStorage.setItem("currentPageId", next);
      } catch {}
      goToNextPage(next);
    }
  };

  const endTakeoverActive = isEndNode && !!resolvedEndCta;
  const hasEndCtaMedia = Boolean(endCtaMedia);

  return (
    <div
      ref={dockRef}
      className={
        endTakeoverActive
          ? dockStyles.dockTakeoverHost
          : [
              dockStyles.fadeWrapper,
              dockJustAppeared ? dockStyles.appearing : "",
              isFadingOut ? dockStyles.fadingOut : "",
            ].join(" ")
      }
      data-embed-ghost={embedGhost ? "1" : undefined}
    >
      {isEndNode ? (
        resolvedEndCta ? (
          <div
            className={[
              style.endCtaTakeoverRoot,
              !hasEndCtaMedia ? style.endCtaTakeoverNoMedia : "",
              embedGhost ? style.endCtaTakeoverRootGhost : "",
              isFadingOut ? style.endCtaTakeoverFading : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {!embedGhost ? (
              <div
                className={style.endCtaTakeoverBackdrop}
                aria-hidden="true"
              />
            ) : null}
            <div className={style.endCtaTakeoverFloat}>
              <div className={style.endCtaRevealCluster}>
                {endCtaMedia ? (
                  <div className={style.endCtaMediaPreview}>
                    <div className={style.endCtaMediaFrameEnter}>{endCtaMedia}</div>
                  </div>
                ) : null}
                <div className={style.endCtaCtaEnter}>
                  <CampaignCta
                    variant="endSoftTakeover"
                    embedGhost={embedGhost}
                    cta={resolvedEndCta}
                    context={endCtaContext}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : null
      ) : (
        <>
          {isRiddlePage &&
            (() => {
              const riddlePage = pageData as unknown as PuzzleRiddleData;
              return (
                <div className={embedGhost ? `${dockStyles.grid} ${dockStyles.gridGhost}` : dockStyles.grid}>
                  <RiddleQuiz
                    page={pageData}
                    question={riddlePage.question}
                    options={riddlePage.options}
                    correctIndex={riddlePage.correctIndex}
                    correctLabel={riddleCorrectLabel}
                    showCorrectLabel="above"
                    onPlaySfx={() => {}}
                    onResult={(result) => handleRiddleResult(result, riddlePage)}
                  />
                </div>
              );
            })()}

          {!isRiddlePage &&
            isRunesPage &&
            (() => {
              const runesPage = pageData as unknown as PuzzleRunesData;
              const answer = Array.isArray(runesPage.answer) ? runesPage.answer : [];
              const { minPick, maxPick } = runesPickBounds(runesPage);

              return (
                <PuzzleRunes
                  options={runesPage.options}
                  answer={answer}
                  maxAttempts={runesPage.maxAttempts ?? 3}
                  maxPick={maxPick}
                  minPick={minPick}
                  mode="set"
                  feedback={runesPage.feedback ?? "reset"}
                  className={embedGhost ? `${dockStyles.grid} ${dockStyles.gridGhost}` : dockStyles.grid}
                  storyId={derivedStoryId || "default_story"}
                  sessionId={derivedSessionId || "sess_unknown"}
                  pageId={pageData.id}
                  puzzleId={runesPage.id ?? `runes-${pageData.id}`}
                  onResult={(ok, pickedIds) =>
                    handleRunesResult(ok, pickedIds, runesPage, answer)
                  }
                />
              );
            })()}

          {!isRiddlePage && !isRunesPage && dockChoicesForThisPage.length > 0 && (
            <InteractionDock
              mode="default"
              embedGhost={embedGhost}
              choices={dockChoicesForThisPage}
              onSelect={(choiceId: string) => {
                const selection = resolveDockSelection({
                  choiceId,
                  pageId: pageData?.id,
                  choices: pageData?.choices,
                  resolvedNext,
                });

                if (selection) {
                  handleChoice(selection.next, selection.reward, selection.choice);
                }
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
