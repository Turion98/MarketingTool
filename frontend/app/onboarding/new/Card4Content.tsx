"use client";

import AiPrefilledTextarea from "./AiPrefilledTextarea";
import { TextareaField } from "./formFields";
import s from "./cardContent.module.scss";
import card4s from "./card4Content.module.scss";
import {
  approveSlot,
  type UseCard4GenerationReturn,
} from "./useCard4Generation";
import {
  END_NODE_KINDS,
  END_NODE_LABELS,
  END_NODE_SOURCE_BADGES,
  isSlotStale,
} from "./card4Utils";
import type { EndNodeKind, SupportChatbotBrief } from "./briefTypes";

export interface Card4ContentProps {
  brief: SupportChatbotBrief;
  updateBrief: (
    updater: (prev: SupportChatbotBrief) => SupportChatbotBrief,
  ) => void;
  generation: UseCard4GenerationReturn;
}

function FixedInfoPanel() {
  return (
    <div className={card4s.fixedPanel}>
      <p className={card4s.fixedPanelTitle}>Eszkaláció utáni viselkedés</p>
      <p className={card4s.fixedPanelText}>
        Ha a chatbot emberi ügyfélszolgálathoz eszkalál, a rendszer automatikusan
        jegyet nyit a helpdeskben (Card 3), és a vásárló megkapja a várt
        válaszidőt (SLA). Ezt a viselkedést nem kell külön szövegesen megadni —
        a Card 3 beállításaid alapján működik.
      </p>
    </div>
  );
}

export default function Card4Content({
  brief,
  updateBrief,
  generation,
}: Card4ContentProps) {
  const { generating, card4Stale, generationError, regenerateEndNodes, clearError } =
    generation;

  const setSlot = (kind: EndNodeKind, next: SupportChatbotBrief["card4"]["end_node_texts"][EndNodeKind]) => {
    updateBrief((prev) => ({
      ...prev,
      card4: {
        ...prev.card4,
        end_node_texts: {
          ...prev.card4.end_node_texts,
          [kind]: next,
        },
      },
    }));
  };

  const handleApprove = (kind: EndNodeKind) => {
    updateBrief((prev) => approveSlot(prev, kind));
  };

  return (
    <div className={s.cardForm}>
      <p className={s.intro}>
        Az AI a Card 2 (működési politikák) alapján 6 végállomás-szöveget ír.
        Olvasd át, szerkeszd ha kell, majd jóváhagyd. Ha később módosítod a
        Card 2-t, az „Újragenerálás” gombbal frissítheted a szövegeket.
      </p>

      <div className={s.subsection}>
        <div className={s.subsectionHead}>
          <span className={s.subsectionTag}>4A</span>
          <div>
            <h3 className={s.subsectionTitle}>Végállomás-szövegek</h3>
            <p className={s.subsectionSubtitle}>
              Mit mond a bot, amikor egy ügy eléri a végállomást.
            </p>
          </div>
        </div>

        <div className={card4s.regenRow}>
          <div className={card4s.regenCopy}>
            {card4Stale && !generating && (
              <p className={card4s.staleHint}>
                A Card 2-ben változtattál az utolsó generálás óta — az alábbi
                szövegek még a régi policy alapján készültek.
              </p>
            )}
            {generationError && (
              <p className={card4s.errorHint} role="alert">
                {generationError}{" "}
                <button type="button" className={card4s.errorDismiss} onClick={clearError}>
                  Bezárás
                </button>
              </p>
            )}
          </div>
          <button
            type="button"
            className={[
              card4s.regenBtn,
              card4Stale ? card4s.regenBtnHighlight : "",
            ]
              .filter(Boolean)
              .join(" ")}
            disabled={generating}
            onClick={() => void regenerateEndNodes(false)}
          >
            {generating ? "Generálás…" : "↻ Újragenerálás"}
          </button>
        </div>

        <div className={card4s.slotList}>
          {END_NODE_KINDS.map((kind) => (
            <AiPrefilledTextarea
              key={kind}
              label={END_NODE_LABELS[kind]}
              sourceBadge={END_NODE_SOURCE_BADGES[kind]}
              value={brief.card4.end_node_texts[kind]}
              stale={isSlotStale(brief.card4.end_node_texts[kind], card4Stale)}
              disabled={generating}
              onChange={(next) => setSlot(kind, next)}
              onApprove={() => handleApprove(kind)}
            />
          ))}
        </div>
      </div>

      <div className={s.subsection}>
        <div className={s.subsectionHead}>
          <span className={s.subsectionTag}>4B</span>
          <div>
            <h3 className={s.subsectionTitle}>Scope-on kívüli kérések</h3>
            <p className={s.subsectionSubtitle}>
              Mit mondjon a bot, ha a kérdés kívül esik a hatáskörén.
            </p>
          </div>
        </div>
        <TextareaField
          label="Scope-out üzenet"
          hint="Kötelező manuális mező — ezt te írod meg, nem az AI."
          value={brief.card4.scope_out_message}
          coachTarget="card4.scope_out_message"
          onChange={(v) =>
            updateBrief((prev) => ({
              ...prev,
              card4: { ...prev.card4, scope_out_message: v },
            }))
          }
          rows={3}
          required
        />
      </div>

      <div className={s.subsection}>
        <div className={s.subsectionHead}>
          <span className={s.subsectionTag}>4C</span>
          <div>
            <h3 className={s.subsectionTitle}>Eszkaláció</h3>
          </div>
        </div>
        <FixedInfoPanel />
      </div>
    </div>
  );
}
