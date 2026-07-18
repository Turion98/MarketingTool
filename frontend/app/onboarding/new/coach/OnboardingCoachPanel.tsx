"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type { CardId } from "../briefDraft";
import type { SupportChatbotBrief } from "../briefTypes";
import { applyCoachSuggestion, canApplySuggestion } from "./coachApply";
import type { CoachMessage, CoachSuggestion } from "./coachSession";
import { useOnboardingCoach } from "./useOnboardingCoach";
import s from "./onboardingCoachPanel.module.scss";

export interface OnboardingCoachPanelProps {
  activeCard: CardId;
  brief: SupportChatbotBrief;
  updateBrief: (
    updater: (prev: SupportChatbotBrief) => SupportChatbotBrief,
  ) => void;
}

function SimpleMarkdown({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <p className={s.msgBody}>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i}>{part.slice(2, -2)}</strong>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </p>
  );
}

function SuggestionCard({
  suggestion,
  onAccept,
}: {
  suggestion: CoachSuggestion;
  onAccept: () => void;
}) {
  const copy = useCallback(() => {
    void navigator.clipboard.writeText(suggestion.display_value);
  }, [suggestion.display_value]);

  return (
    <div className={s.suggestion}>
      <div className={s.suggestionHead}>
        <span className={s.suggestionLabel}>{suggestion.label}</span>
        <code className={s.suggestionValue}>{suggestion.display_value}</code>
      </div>
      <div className={s.suggestionActions}>
        <button type="button" className={s.btnGhost} onClick={copy}>
          Másolás
        </button>
        {canApplySuggestion(suggestion) && (
          <button type="button" className={s.btnAccept} onClick={onAccept}>
            Elfogadom
          </button>
        )}
      </div>
    </div>
  );
}

function MessageBubble({
  msg,
  onAcceptSuggestion,
}: {
  msg: CoachMessage;
  onAcceptSuggestion: (s: CoachSuggestion) => void;
}) {
  return (
    <div
      className={[
        s.msg,
        msg.role === "user" ? s.msgUser : "",
        msg.role === "system" ? s.msgSystem : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {msg.role === "system" && (
        <span className={s.msgTag}>Útmutató</span>
      )}
      {msg.role === "assistant" && (
        <span className={s.msgTag}>Tanácsadó</span>
      )}
      <SimpleMarkdown text={msg.content} />
      {msg.suggestions && msg.suggestions.length > 0 && (
        <div className={s.suggestionList}>
          {msg.suggestions.map((sg) => (
            <SuggestionCard
              key={`${sg.target}-${sg.display_value}`}
              suggestion={sg}
              onAccept={() => onAcceptSuggestion(sg)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function OnboardingCoachPanel({
  activeCard,
  brief,
  updateBrief,
}: OnboardingCoachPanelProps) {
  const { messages, loading, sendQuestion } = useOnboardingCoach({
    activeCard,
    brief,
  });
  const [input, setInput] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 980px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const q = input;
    setInput("");
    void sendQuestion(q);
    if (isMobile) setMobileOpen(true);
  };

  const handleAccept = (sg: CoachSuggestion) => {
    updateBrief((prev) => applyCoachSuggestion(prev, sg));
  };

  const panelBody = (
    <>
      <div className={s.msgList} ref={listRef}>
        {messages.length === 0 && (
          <p className={s.empty}>Nyisd meg a kártyákat — első alkalommal útmutatót kapsz.</p>
        )}
        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            msg={m}
            onAcceptSuggestion={handleAccept}
          />
        ))}
        {loading && (
          <div className={s.typing} aria-live="polite">
            Tanácsadó gondolkodik…
          </div>
        )}
      </div>
      <form className={s.composer} onSubmit={onSubmit}>
        <input
          type="text"
          className={s.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Kérdezz, ha elakadtál…"
          disabled={loading}
          aria-label="Kérdés a tanácsadónak"
        />
        <button
          type="submit"
          className={s.sendBtn}
          disabled={loading || !input.trim()}
        >
          Küldés
        </button>
      </form>
    </>
  );

  if (isMobile) {
    return (
      <>
        {!mobileOpen && (
          <button
            type="button"
            className={s.mobileFab}
            onClick={() => setMobileOpen(true)}
            aria-expanded={mobileOpen}
          >
            Segítség
          </button>
        )}
        {mobileOpen && (
          <div className={s.mobileSheet} role="dialog" aria-label="Onboarding tanácsadó">
            <header className={s.mobileHead}>
              <span>Tanácsadó</span>
              <button
                type="button"
                className={s.mobileClose}
                onClick={() => setMobileOpen(false)}
                aria-label="Bezárás"
              >
                ×
              </button>
            </header>
            {panelBody}
          </div>
        )}
      </>
    );
  }

  return (
    <aside className={s.panel} aria-label="Onboarding tanácsadó">
      <header className={s.head}>
        <span className={s.avatar} aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 22 22">
            <circle cx="11" cy="9" r="3.5" fill="currentColor" opacity="0.85" />
            <path
              d="M3.5 19.5c1.6-3.6 4.6-5.4 7.5-5.4s5.9 1.8 7.5 5.4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <div>
          <p className={s.eyebrow}>Tanácsadó</p>
          <h3 className={s.title}>AI asszisztens</h3>
        </div>
      </header>
      {panelBody}
    </aside>
  );
}
