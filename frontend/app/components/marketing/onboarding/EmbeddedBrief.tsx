"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { CoachHighlightProvider } from "@/app/onboarding/new/coach/CoachHighlightContext";
import OnboardingCoachPanel from "@/app/onboarding/new/coach/OnboardingCoachPanel";
import { clearCoachSession } from "@/app/onboarding/new/coach/coachSession";
import BriefCard from "@/app/onboarding/new/BriefCard";
import BriefProgress from "@/app/onboarding/new/BriefProgress";
import Card1Content from "@/app/onboarding/new/Card1Content";
import Card2Content from "@/app/onboarding/new/Card2Content";
import Card3Content from "@/app/onboarding/new/Card3Content";
import Card4Content from "@/app/onboarding/new/Card4Content";
import Card5Content from "@/app/onboarding/new/Card5Content";
import Card6Content from "@/app/onboarding/new/Card6Content";
import CenterToast from "@/app/onboarding/new/CenterToast";
import {
  clearSession,
  markCardVisited,
  readSession,
  readVisitedCards,
  writeSession,
} from "@/app/onboarding/new/briefSession";
import { submitKnowledgeBaseBrief } from "@/app/onboarding/new/onboardingBriefApi";
import {
  CARD_LABELS,
  CARD_ORDER,
  cardCompletion,
  canSubmitBrief,
  isCardComplete,
  useBriefDraft,
  type CardId,
} from "@/app/onboarding/new/briefDraft";
import type { SupportChatbotBrief } from "@/app/onboarding/new/briefTypes";
import { useCard4Generation } from "@/app/onboarding/new/useCard4Generation";

import s from "./onboarding.module.scss";

const CARD_SUBTITLES: Record<CardId, string> = {
  card1: "Cégnév, üzleti modellek, célpiac, nyelv.",
  card2: "Visszaküldés, remedy-sorrend, szállítás.",
  card3: "Helpdesk integráció és SLA.",
  card4: "A bot 6 alapszövege — AI-val előkitöltve.",
  card5: "Hatáskör, ügyfélszolgálati elérhetőség.",
  card6: "Csatolt dokumentumok (ÁSZF, FAQ, garancia).",
};

const CARD2_RESAVED_TOAST =
  "A Card 2 módosításai érintik a Card 4 szövegeit — az újragenerálás a Card 4-en elérhető.";

function CardContentRouter({
  cardId,
  brief,
  updateBrief,
  generation,
}: {
  cardId: CardId;
  brief: SupportChatbotBrief;
  updateBrief: (updater: (prev: SupportChatbotBrief) => SupportChatbotBrief) => void;
  generation: ReturnType<typeof useCard4Generation>;
}) {
  switch (cardId) {
    case "card1":
      return <Card1Content brief={brief} updateBrief={updateBrief} />;
    case "card2":
      return <Card2Content brief={brief} updateBrief={updateBrief} />;
    case "card3":
      return <Card3Content brief={brief} updateBrief={updateBrief} />;
    case "card4":
      return (
        <Card4Content brief={brief} updateBrief={updateBrief} generation={generation} />
      );
    case "card5":
      return <Card5Content brief={brief} updateBrief={updateBrief} />;
    case "card6":
      return <Card6Content brief={brief} updateBrief={updateBrief} />;
  }
}

/**
 * §4 (b) — a kiemelt brief-mag portfólió-keretben.
 *
 * A `app/onboarding/new` működő darabjait használja újra (draft, kártyák, coach,
 * Card 4 generálás, submit), de a régi teljes-képernyős layout helyett a
 * portfólió-oldalba illő kerettel. Navigáció nincs: beküldés után `submitted`
 * állapotba vált (a valódi build-progress a #5).
 *
 * `apiKey`: a kapuban megadott látogatói Anthropic-kulcs — a coach/generálás
 * hívásokhoz a backend átvezetés (#2) után kötjük élesbe.
 */
export default function EmbeddedBrief({ apiKey }: { apiKey: string }) {
  void apiKey; // #2-ig még a szerver-kulcson fut; a propot előre átvezetjük

  const { brief, updateBrief, resetDraft, hydrated, lastSavedAt } = useBriefDraft();
  const [openCard, setOpenCard] = useState<CardId | null>("card1");
  const [, setVisitedRevision] = useState(0);
  const [showResaveToast, setShowResaveToast] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedJobId, setSubmittedJobId] = useState<string | null>(null);
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

  useEffect(() => {
    const prev = prevOpenCard.current;
    if (prev === "card2" && openCard !== "card2" && isCardComplete(brief, "card2")) {
      handleCard2SavedRef.current();
    }
    prevOpenCard.current = openCard;
  }, [openCard, brief]);

  const handleToggle = useCallback((card: CardId) => {
    setOpenCard((prev) => (prev === card ? null : card));
  }, []);

  const handleSelectFromProgress = useCallback((card: CardId) => {
    setOpenCard(card);
    requestAnimationFrame(() => {
      document
        .getElementById(`emb-brief-card-${card}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const handleReset = useCallback(() => {
    if (!window.confirm("Biztosan újrakezded? Az eddigi válaszaid elvesznek.")) return;
    resetDraft();
    clearSession();
    clearCoachSession();
    setOpenCard("card1");
    setShowResaveToast(false);
    setSubmittedJobId(null);
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
      setSubmittedJobId(summary.job_id);
    } catch (e) {
      setSubmitError(
        e instanceof Error ? e.message : "A beküldés sikertelen. Próbáld újra.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [brief, canSubmit, submitting]);

  if (!hydrated) {
    return <div className={s.briefLoading}>Brief betöltése…</div>;
  }

  if (submittedJobId) {
    return (
      <div className={s.briefSubmitted} role="status">
        <span className={s.briefSubmittedCheck} aria-hidden="true">
          ✓
        </span>
        <p className={s.briefSubmittedTitle}>Brief beküldve</p>
        <p className={s.briefSubmittedNote}>
          Referencia: <code>{submittedJobId}</code>. A domain-elemzés és a generálás
          élő követése (progress) a következő lépésben kerül ide.
        </p>
      </div>
    );
  }

  return (
    <CoachHighlightProvider>
      <div className={s.briefFrame}>
        {showResaveToast && (
          <CenterToast
            message={CARD2_RESAVED_TOAST}
            onDone={() => setShowResaveToast(false)}
          />
        )}

        <div className={s.briefLayout}>
          <div className={s.briefMain}>
            <BriefProgress
              completion={completion}
              activeCard={openCard}
              onSelect={handleSelectFromProgress}
            />

            <div className={s.briefCards}>
              {CARD_ORDER.map((cardId, idx) => (
                <div key={cardId} id={`emb-brief-card-${cardId}`}>
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

            <footer className={s.briefFooter}>
              <span className={s.briefSavedHint}>
                {lastSavedAt ? "Automatikusan mentve." : "A kártyák mentése automatikus."}
              </span>
              <div className={s.briefFooterActions}>
                {submitError && (
                  <p className={s.briefError} role="alert">
                    {submitError}
                  </p>
                )}
                <button
                  type="button"
                  className={s.briefGhost}
                  onClick={handleReset}
                  disabled={submitting}
                >
                  Újrakezdés
                </button>
                <button
                  type="button"
                  className={s.briefSubmit}
                  disabled={!canSubmit || submitting}
                  onClick={() => void handleSubmit()}
                  title={canSubmit ? undefined : "Card 1, 2, 3 és 5 kötelező."}
                >
                  {submitting ? "Beküldés…" : "Brief beküldése"}
                  {!submitting && <span aria-hidden="true"> →</span>}
                </button>
              </div>
            </footer>
          </div>

          <aside className={s.briefSide}>
            <OnboardingCoachPanel
              activeCard={openCard ?? "card1"}
              brief={brief}
              updateBrief={updateBrief}
            />
          </aside>
        </div>
      </div>
    </CoachHighlightProvider>
  );
}
