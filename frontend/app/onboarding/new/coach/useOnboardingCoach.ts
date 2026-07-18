"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CardId } from "../briefDraft";
import type { SupportChatbotBrief } from "../briefTypes";
import { askOnboardingCoach } from "../onboardingBriefApi";
import { toApiBrief } from "../briefApiAdapter";
import { formatCardIntroMessage } from "./coachCardIntro";
import {
  createMessage,
  markCardVisited,
  readCoachMessages,
  readVisitedCards,
  writeCoachMessages,
  type CoachMessage,
} from "./coachSession";
import { useCoachHighlight } from "./CoachHighlightContext";

export interface UseOnboardingCoachOptions {
  activeCard: CardId;
  brief: SupportChatbotBrief;
}

export function useOnboardingCoach({
  activeCard,
  brief,
}: UseOnboardingCoachOptions) {
  const { highlightTargets } = useCoachHighlight();
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hydrated = useRef(false);
  const lastIntroCard = useRef<CardId | null>(null);

  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    setMessages(readCoachMessages());
  }, []);

  useEffect(() => {
    writeCoachMessages(messages);
  }, [messages]);

  const pushMessage = useCallback((msg: CoachMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  // Első látogatáskor system intro (csak egyszer / kártya).
  useEffect(() => {
    if (!hydrated.current) return;
    const visited = readVisitedCards();
    if (visited.has(activeCard)) return;
    if (lastIntroCard.current === activeCard) return;
    lastIntroCard.current = activeCard;
    markCardVisited(activeCard);
    pushMessage(
      createMessage("system", formatCardIntroMessage(activeCard)),
    );
  }, [activeCard, pushMessage]);

  const sendQuestion = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || loading) return;
      setError(null);
      pushMessage(createMessage("user", q));
      setLoading(true);
      try {
        const history = [...messages, createMessage("user", q)].map((m) => ({
          role: m.role,
          content: m.content,
        }));
        const locale = brief.card1.locale === "hu" ? "hu" : "en";
        const res = await askOnboardingCoach({
          active_card: activeCard,
          user_question: q,
          messages: history.filter((m) => m.role !== "system").slice(-8),
          brief_snapshot: toApiBrief(brief) as Record<string, unknown>,
          locale,
        });
        const assistant = createMessage("assistant", res.reply, {
          highlights: res.highlights,
          suggestions: res.suggestions,
        });
        pushMessage(assistant);
        if (res.highlights.length > 0) {
          highlightTargets(res.highlights);
        }
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "A coach válasz sikertelen.";
        setError(msg);
        pushMessage(
          createMessage(
            "assistant",
            "Most nem érem el a tanácsadót. Próbáld újra pár másodperc múlva, vagy folytasd a kitöltést a bal oldali mezőkkel.",
          ),
        );
      } finally {
        setLoading(false);
      }
    },
    [activeCard, brief, highlightTargets, loading, messages, pushMessage],
  );

  return {
    messages,
    loading,
    error,
    sendQuestion,
    clearError: () => setError(null),
  };
}
