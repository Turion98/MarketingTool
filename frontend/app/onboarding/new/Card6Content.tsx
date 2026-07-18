"use client";

import { useState } from "react";
import SourceDocumentOverlay from "./SourceDocumentOverlay";
import s from "./cardContent.module.scss";
import card6s from "./card6Content.module.scss";
import {
  PRIORITY_LABELS,
  SOURCE_DOC_KINDS,
  SOURCE_DOC_LABELS,
  SOURCE_DOC_PRIORITIES,
  isPriorityWarning,
} from "./card6Utils";
import type { SourceDocumentKind, SupportChatbotBrief } from "./briefTypes";

export interface Card6ContentProps {
  brief: SupportChatbotBrief;
  updateBrief: (
    updater: (prev: SupportChatbotBrief) => SupportChatbotBrief,
  ) => void;
}

export default function Card6Content({ brief, updateBrief }: Card6ContentProps) {
  const slots = brief.card6.slots;
  const [openKind, setOpenKind] = useState<SourceDocumentKind | null>(null);

  const setSlotAttachments = (
    kind: SourceDocumentKind,
    attachments: SupportChatbotBrief["card6"]["slots"][SourceDocumentKind]["attachments"],
  ) => {
    updateBrief((prev) => ({
      ...prev,
      card6: {
        slots: {
          ...prev.card6.slots,
          [kind]: { kind, attachments },
        },
      },
    }));
  };

  const filledCount = SOURCE_DOC_KINDS.filter(
    (k) => slots[k].attachments.length > 0,
  ).length;

  return (
    <div className={s.cardForm}>
      <p className={s.intro}>
        Forrásdokumentumok a tudásbázishoz. Kattints egy kártyára a szerkesztéshez.
      </p>

      <div className={card6s.summaryBar}>
        <span>
          {filledCount} / {SOURCE_DOC_KINDS.length} slot feltöltve
        </span>
      </div>

      <div className={card6s.cardGrid}>
        {SOURCE_DOC_KINDS.map((kind) => {
          const attachments = slots[kind]?.attachments ?? [];
          const priority = SOURCE_DOC_PRIORITIES[kind];
          const warning = isPriorityWarning(kind, attachments.length > 0);
          return (
            <button
              key={kind}
              type="button"
              className={[
                card6s.slotCard,
                warning ? card6s.slotCardWarning : "",
                attachments.length > 0 ? card6s.slotCardFilled : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => setOpenKind(kind)}
            >
              <div className={card6s.slotCardHead}>
                <span
                  className={[card6s.priorityBadge, card6s[`priority_${priority}`]].join(" ")}
                >
                  {PRIORITY_LABELS[priority]}
                </span>
                {warning && <span className={card6s.warningBadge}>Ajánlott</span>}
              </div>
              <h4 className={card6s.slotCardTitle}>{SOURCE_DOC_LABELS[kind]}</h4>
              <p className={card6s.slotCardMeta}>
                {attachments.length > 0
                  ? `${attachments.length} forrás csatolva`
                  : "Üres — kattints a feltöltéshez"}
              </p>
            </button>
          );
        })}
      </div>

      {openKind && (
        <SourceDocumentOverlay
          kind={openKind}
          attachments={slots[openKind]?.attachments ?? []}
          onChange={(next) => setSlotAttachments(openKind, next)}
          onClose={() => setOpenKind(null)}
        />
      )}
    </div>
  );
}
