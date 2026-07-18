"use client";

import {
  CARD_LABELS,
  CARD_ORDER,
  type CardCompletionMap,
  type CardId,
} from "./briefDraft";
import s from "./briefProgress.module.scss";

export interface BriefProgressProps {
  completion: CardCompletionMap;
  activeCard: CardId | null;
  onSelect: (card: CardId) => void;
}

export default function BriefProgress({
  completion,
  activeCard,
  onSelect,
}: BriefProgressProps) {
  const total = CARD_ORDER.length;
  const done = CARD_ORDER.filter((c) => completion[c]).length;
  const ratio = total > 0 ? done / total : 0;

  return (
    <div className={s.wrapper} aria-label="Folyamatban: brief kitöltés">
      <div className={s.header}>
        <div className={s.heading}>
          <p className={s.eyebrow}>Tudásbázis felépítése</p>
          <h1 className={s.title}>6 lépéses gyors kérdőív</h1>
        </div>
        <div className={s.scoreBlock}>
          <div className={s.scoreText}>
            <span className={s.scoreNumber}>{done}</span>
            <span className={s.scoreDivider}>/</span>
            <span className={s.scoreTotal}>{total}</span>
          </div>
          <div className={s.scoreLabel}>kártya kész</div>
        </div>
      </div>

      <div
        className={s.bar}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
      >
        <div
          className={s.barFill}
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </div>

      <div className={s.steps}>
        {CARD_ORDER.map((card, idx) => {
          const isDone = completion[card];
          const isActive = activeCard === card;
          return (
            <button
              key={card}
              type="button"
              className={[
                s.step,
                isDone ? s.stepDone : "",
                isActive ? s.stepActive : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => onSelect(card)}
              aria-current={isActive ? "step" : undefined}
            >
              <span className={s.stepDot}>{idx + 1}</span>
              <span className={s.stepLabel}>{CARD_LABELS[card]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
