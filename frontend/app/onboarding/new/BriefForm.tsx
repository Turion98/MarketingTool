"use client";



import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { CoachHighlightProvider } from "./coach/CoachHighlightContext";
import OnboardingCoachPanel from "./coach/OnboardingCoachPanel";
import { clearCoachSession } from "./coach/coachSession";
import BriefCard from "./BriefCard";
import BriefProgress from "./BriefProgress";

import Card1Content from "./Card1Content";

import Card2Content from "./Card2Content";

import Card3Content from "./Card3Content";

import Card4Content from "./Card4Content";
import Card5Content from "./Card5Content";
import Card6Content from "./Card6Content";

import CenterToast from "./CenterToast";

import { clearSession, markCardVisited, readSession, readVisitedCards, writeSession } from "./briefSession";
import { submitKnowledgeBaseBrief } from "./onboardingBriefApi";

import {

  CARD_LABELS,

  CARD_ORDER,

  cardCompletion,

  canSubmitBrief,

  isCardComplete,

  useBriefDraft,

  type CardId,

} from "./briefDraft";

import type { SupportChatbotBrief } from "./briefTypes";

import { useCard4Generation } from "./useCard4Generation";

import s from "./briefForm.module.scss";



/** Card subtitle copy a head-soron. */

const CARD_SUBTITLES: Record<CardId, string> = {

  card1: "Cégnév, üzleti modellek, célpiac, nyelv.",

  card2: "Visszaküldés, remedy-sorrend, szállítás — a chatbot szabályrendszere.",

  card3: "Helpdesk integráció és SLA beállítások.",

  card4: "A bot által használt 6 alapszöveg — AI-val előkitöltve.",

  card5: "Hatáskör határai, élő ügyfélszolgálati ablakok, kapcsolatok.",

  card6: "Csatolt dokumentumok (ÁSZF, FAQ, garancia-szabályzat).",

};



const CARD2_RESAVED_TOAST =

  "A Card 2 módosításai érintik a Card 4 szövegeit. Az újragenerálás a Card 4-en elérhető, ha szeretnéd.";



interface CardContentRouterProps {

  cardId: CardId;

  brief: SupportChatbotBrief;

  updateBrief: (

    updater: (prev: SupportChatbotBrief) => SupportChatbotBrief,

  ) => void;

  generation: ReturnType<typeof useCard4Generation>;

}



function CardContentRouter({

  cardId,

  brief,

  updateBrief,

  generation,

}: CardContentRouterProps) {

  switch (cardId) {

    case "card1":

      return <Card1Content brief={brief} updateBrief={updateBrief} />;

    case "card2":

      return <Card2Content brief={brief} updateBrief={updateBrief} />;

    case "card3":

      return <Card3Content brief={brief} updateBrief={updateBrief} />;

    case "card4":

      return (

        <Card4Content

          brief={brief}

          updateBrief={updateBrief}

          generation={generation}

        />

      );

    case "card5":

      return <Card5Content brief={brief} updateBrief={updateBrief} />;

    case "card6":

      return <Card6Content brief={brief} updateBrief={updateBrief} />;

  }

}



export default function BriefForm() {

  const router = useRouter();
  const { brief, updateBrief, resetDraft, hydrated, lastSavedAt } =

    useBriefDraft();

  const [openCard, setOpenCard] = useState<CardId | null>("card1");
  const [, setVisitedRevision] = useState(0);

  const [showResaveToast, setShowResaveToast] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const prevOpenCard = useRef<CardId | null>("card1");



  const generation = useCard4Generation({

    brief,

    updateBrief,

    onResaveWarning: () => setShowResaveToast(true),

  });

  const handleCard2SavedRef = useRef(generation.handleCard2Saved);

  handleCard2SavedRef.current = generation.handleCard2Saved;



  const visited = readVisitedCards();
  const completion = cardCompletion(brief, visited);
  const canSubmit = canSubmitBrief(brief);

  useEffect(() => {
    if (openCard) {
      markCardVisited(openCard);
      setVisitedRevision((n) => n + 1);
    }
  }, [openCard]);

  const handleToggle = useCallback((card: CardId) => {
    setOpenCard((prev) => (prev === card ? null : card));
  }, []);



  const handleSelectFromProgress = useCallback((card: CardId) => {

    setOpenCard(card);

    requestAnimationFrame(() => {

      const el = document.getElementById(`brief-card-${card}`);

      el?.scrollIntoView({ behavior: "smooth", block: "start" });

    });

  }, []);



  // Card 2 "mentés": user elhagyja a kártyát, ha complete → trigger / toast.

  useEffect(() => {

    const prev = prevOpenCard.current;

    if (prev === "card2" && openCard !== "card2") {

      if (isCardComplete(brief, "card2")) {

        handleCard2SavedRef.current();

      }

    }

    prevOpenCard.current = openCard;

  }, [openCard, brief]);



  const handleResetConfirm = useCallback(() => {

    if (

      window.confirm(

        "Biztosan újrakezded? Az eddigi válaszaid elvesznek és új brief_id-vel folytatod.",

      )

    ) {

      resetDraft();

      clearSession();
      clearCoachSession();

      setOpenCard("card1");

      setShowResaveToast(false);

    }

  }, [resetDraft]);



  const handleSubmit = useCallback(async () => {
    if (!canSubmit || submitting) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const session = readSession();
      const summary = await submitKnowledgeBaseBrief(brief, session.jobId);
      const vendorName = brief.card1.vendor_name.trim();
      writeSession({
        ...session,
        jobId: summary.job_id,
        submittedAt: new Date().toISOString(),
        submittedJobId: summary.job_id,
        submittedVendorName: vendorName || null,
      });
      const qs = new URLSearchParams({
        jobId: summary.job_id,
        ...(vendorName ? { vendor: vendorName } : {}),
      });
      router.push(`/onboarding/done?${qs.toString()}`);
    } catch (e) {
      setSubmitError(
        e instanceof Error
          ? e.message
          : "A beküldés sikertelen. Próbáld újra pár másodperc múlva.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [brief, canSubmit, router, submitting]);



  if (!hydrated) {

    return (

      <div className={s.frame}>

        <div className={s.loading}>Brief betöltése…</div>

      </div>

    );

  }



  return (
    <CoachHighlightProvider>
    <div className={s.frame}>

      {showResaveToast && (

        <CenterToast

          message={CARD2_RESAVED_TOAST}

          onDone={() => setShowResaveToast(false)}

        />

      )}



      <div className={s.layout}>

        <div className={s.column}>

          <BriefProgress

            completion={completion}

            activeCard={openCard}

            onSelect={handleSelectFromProgress}

          />



          <div className={s.cards}>

            {CARD_ORDER.map((cardId, idx) => (

              <div key={cardId} id={`brief-card-${cardId}`}>

                <BriefCard

                  index={idx + 1}

                  title={CARD_LABELS[cardId]}

                  subtitle={CARD_SUBTITLES[cardId]}

                  complete={completion[cardId]}

                  open={openCard === cardId}

                  onToggle={() => handleToggle(cardId)}

                  stale={cardId === "card4" && generation.card4Stale}

                  generating={cardId === "card4" && generation.generating}

                >

                  <CardContentRouter

                    cardId={cardId}

                    brief={brief}

                    updateBrief={updateBrief}

                    generation={generation}

                  />

                </BriefCard>

              </div>

            ))}

          </div>



          <footer className={s.footer}>

            <div className={s.footerMeta}>

              {lastSavedAt ? (

                <span className={s.savedHint}>

                  Automatikusan mentve · {formatRelative(lastSavedAt)}

                </span>

              ) : (

                <span className={s.savedHint}>

                  A kártyák mentése automatikus, a böngésződben.

                </span>

              )}

            </div>

            <div className={s.footerActions}>

              {submitError && (
                <p className={s.submitError} role="alert">
                  {submitError}
                </p>
              )}

              <button

                type="button"

                onClick={handleResetConfirm}

                className={s.btnGhost}
                disabled={submitting}

              >

                Újrakezdés

              </button>

              <button

                type="button"

                disabled={!canSubmit || submitting}

                className={s.btnPrimary}

                onClick={() => void handleSubmit()}

                title={

                  canSubmit

                    ? undefined

                    : "Card 1, 2, 3 és 5 kötelezően kitöltendő."

                }

              >

                {submitting ? "Beküldés…" : "Tudásbázis beküldése"}

                {!submitting && <span aria-hidden="true">→</span>}

              </button>

            </div>

          </footer>

        </div>



        <div className={s.sidecol}>
          <OnboardingCoachPanel
            activeCard={openCard ?? "card1"}
            brief={brief}
            updateBrief={updateBrief}
          />
        </div>

      </div>

    </div>
    </CoachHighlightProvider>
  );

}



function formatRelative(epoch: number): string {

  const diffSec = Math.round((Date.now() - epoch) / 1000);

  if (diffSec < 5) return "épp most";

  if (diffSec < 60) return `${diffSec} mp-e`;

  const m = Math.floor(diffSec / 60);

  if (m < 60) return `${m} perce`;

  const h = Math.floor(m / 60);

  return `${h} órája`;

}


