"use client";

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { ContactModal } from "./components/ContactModal";
import { DynamicMeshBackground } from "./components/DynamicMeshBackground";
import MarketingNav from "@/app/components/marketing/MarketingNav";
import { presentFlowUiByLang } from "./presentFlowUi";
import {
  resolvePresentCards,
  type PresentContext,
} from "./presentDeck.resolve";
import type {
  CardVariantContent,
  PresentChoiceDetail,
  PresentLang,
  PresentPain,
  PresentPhase,
  PresentRole,
  PresentUsecase,
  ResolvedCard,
} from "./presentDeck.types";

import s from "./PresentDecisionLanding.module.scss";
import {
  PRESENT_LANG_CHANGED_EVENT,
  readPresentLangFromStorage,
} from "./presentLangSync";

const DEFAULT_LOGO = "/assets/my_logo.png";

const ROLES: PresentRole[] = ["agency", "saas", "webshop"];
const PAINS: PresentPain[] = [
  "low_conversion",
  "choice_overload",
  "no_visibility",
  "need_new",
];
const USECASES: PresentUsecase[] = [
  "product_finder",
  "package_pick",
  "qualification",
  "campaign",
];

/** Fázis kilépő animáció hossza (SCSS keyframes-szel egyeztetve). */
const R1_EXIT_MS = 260;
const R2_EXIT_MS = 260;
const R3_EXIT_MS = 260;
const R3_CONTAINERS_REVEAL_TOTAL_MS = 1600;

/** Szavas belépő — SCSS `.narrativeWord` egyeztetve (lassabb, overlap + hosszabb fade → simább hullám). */
const NARRATIVE_WORD_STAGGER_MS = 54;
const NARRATIVE_WORD_FADE_MS = 480;
const NARRATIVE_PAUSE_AFTER_LINE_MS = 120;
const NARRATIVE_MICRO_TAIL_MS = 160;

function splitWords(t: string): string[] {
  const s = t.trim();
  if (!s) return [];
  return s.split(/\s+/).filter(Boolean);
}

function countWords(t: string): number {
  return splitWords(t).length;
}

function lineRevealDurationMs(wordCount: number): number {
  if (wordCount <= 0) return 0;
  return (wordCount - 1) * NARRATIVE_WORD_STAGGER_MS + NARRATIVE_WORD_FADE_MS;
}

function narrativeHudLeadMs(p: PresentPhase): number {
  if (p === "r2") return 260;
  if (p === "r3") return 220;
  if (p === "r1") return 100;
  if (p === "summary") return 80;
  return 0;
}

function NarrativeWordLine({
  text,
  wordBaseMs,
  className,
}: {
  text: string;
  wordBaseMs: number;
  className?: string;
}) {
  const words = splitWords(text);
  if (words.length === 0) return null;
  const lineStyle = {
    ["--narrative-word-base"]: `${wordBaseMs}ms`,
    ["--nw-stagger"]: `${NARRATIVE_WORD_STAGGER_MS}ms`,
    ["--nw-fade"]: `${NARRATIVE_WORD_FADE_MS}ms`,
  } as React.CSSProperties;
  return (
    <span className={className} style={lineStyle}>
      {words.map((w, i) => (
        <span
          key={`${i}-${w.slice(0, 12)}`}
          className={s.narrativeWord}
          style={{ ["--nw"]: i } as React.CSSProperties}
        >
          {w}
          {i < words.length - 1 ? "\u00A0" : ""}
        </span>
      ))}
    </span>
  );
}

type R2ExitPending =
  | { kind: "to-r3"; pain: PresentPain }
  | { kind: "to-r1" };

type R3ExitPending = "to-r2" | "to-r1";

function emitPresentChoice(detail: PresentChoiceDetail) {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent("present_choice", { detail }));
  } catch {
    /* ignore */
  }
}

function PresentCardVisual({
  hint,
  content,
  lang,
}: {
  hint: ResolvedCard["visualHint"];
  content: CardVariantContent;
  lang: PresentLang;
}) {
  if (hint === "none") return null;

  if (hint === "embedFrame") {
    const line =
      lang === "hu"
        ? "iframe · beágyazott widget · ugyanaz a forgalom"
        : "iframe · embedded widget · same traffic";
    return (
      <div className={s.visualEmbed} aria-hidden>
        {line}
      </div>
    );
  }

  if (hint === "twoColumn") {
    const before =
      lang === "hu"
        ? "Előtte: több opció, kevés vezetés"
        : "Before: many options, weak guidance";
    const after =
      lang === "hu"
        ? "Utána: szűkülő döntési út + kimenet"
        : "After: tighter path + outcome";
    return (
      <div className={s.visualTwoCol} aria-hidden>
        <div className={s.visualCol}>{before}</div>
        <div className={s.visualCol}>{after}</div>
      </div>
    );
  }

  if (hint === "stepFlow" && content.bullets?.length) {
    return (
      <div className={s.visualSteps} aria-hidden>
        {content.bullets.map((b, i) => (
          <span key={i} className={s.stepPill}>
            {i + 1}. {b.replace(/^[^:]+:\s*/, "").slice(0, 42)}
            {b.length > 42 ? "…" : ""}
          </span>
        ))}
      </div>
    );
  }

  return null;
}

function PresentCard({
  card,
  lang,
}: {
  card: ResolvedCard;
  lang: PresentLang;
}) {
  const c = card.content;
  return (
    <article className={s.card} data-card={card.id} data-density={card.density}>
      <h3 className={s.cardTitle}>{c.title}</h3>
      {c.body && <p className={s.cardBody}>{c.body}</p>}
      <PresentCardVisual hint={card.visualHint} content={c} lang={lang} />
      {c.bullets && c.bullets.length > 0 && card.visualHint !== "stepFlow" && (
        <ul className={s.bullets}>
          {c.bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      )}
      {c.stats && c.stats.length > 0 && (
        <div className={s.stats}>
          {c.stats.map((st, i) => (
            <div key={i} className={s.stat}>
              <span className={s.statValue}>{st.value}</span>
              <span className={s.statLabel}>{st.label}</span>
            </div>
          ))}
        </div>
      )}
      {c.checklist && c.checklist.length > 0 && (
        <ul className={s.checklist}>
          {c.checklist.map((row, i) => (
            <li key={i}>
              <span className={s.checkIcon}>{row.ok ? "✓" : "·"}</span>
              <span>{row.label}</span>
            </li>
          ))}
        </ul>
      )}
      {c.badges && c.badges.length > 0 && (
        <div className={s.badges}>
          {c.badges.map((b) => (
            <span key={b} className={s.badge}>
              {b}
            </span>
          ))}
        </div>
      )}
      {c.pricing && c.pricing.length > 0 && (
        <div className={s.pricingRow}>
          {c.pricing.map((p) => (
            <div key={p.name} className={s.priceCard}>
              <div className={s.priceName}>{p.name}</div>
              <div className={s.priceValue}>{p.price}</div>
              <div className={s.priceDetail}>{p.detail}</div>
            </div>
          ))}
        </div>
      )}
      {c.checklistOffer && c.checklistOffer.length > 0 && (
        <ul className={s.bullets}>
          {c.checklistOffer.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}
      {c.footnote && <p className={s.footnote}>{c.footnote}</p>}
    </article>
  );
}

export type PresentDecisionLandingProps = {
  logoSrc?: string;
  logoAlt?: string;
  onRequestQuoteClick?: () => void;
  onViewDemosClick?: () => void;
};

export default function PresentDecisionLanding({
  logoSrc,
  logoAlt = "Questell",
  onRequestQuoteClick,
  onViewDemosClick,
}: PresentDecisionLandingProps) {
  const resolvedLogo = logoSrc ?? DEFAULT_LOGO;
  const [lang, setLang] = useState<PresentLang>("hu");
  const [phase, setPhase] = useState<PresentPhase>("intro");
  const [role, setRole] = useState<PresentRole | null>(null);
  const [pain, setPain] = useState<PresentPain | null>(null);
  const [usecase, setUsecase] = useState<PresentUsecase | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  const titleRef = useRef<HTMLHeadingElement>(null);
  const narrativeInnerRef = useRef<HTMLDivElement | null>(null);
  const didMountNarrativeAnimRef = useRef(false);
  const r1ExitTimerRef = useRef<number | null>(null);
  const r1PendingRoleRef = useRef<PresentRole | null>(null);
  const r2ExitTimerRef = useRef<number | null>(null);
  const r2PendingExitRef = useRef<R2ExitPending | null>(null);
  const r3ExitTimerRef = useRef<number | null>(null);
  const r3PendingExitRef = useRef<R3ExitPending | null>(null);
  const skipNextNarrativePhaseEnterRef = useRef(false);
  const narrativeRevealTimersRef = useRef<number[]>([]);
  const [typedBlocks, setTypedBlocks] = useState<[string, string, string]>([
    "",
    "",
    "",
  ]);
  const [activeTypingBlock, setActiveTypingBlock] = useState<number | null>(null);
  const [narrativeRevealStep, setNarrativeRevealStep] = useState<0 | 1 | 2 | 3>(
    0
  );
  const [r1Exiting, setR1Exiting] = useState(false);
  const [r2Exiting, setR2Exiting] = useState(false);
  const [r3Exiting, setR3Exiting] = useState(false);
  const [r3CtaReady, setR3CtaReady] = useState(false);
  useEffect(() => {
    const saved = readPresentLangFromStorage();
    if (saved) setLang(saved);
  }, []);

  useEffect(() => {
    const onLang = (e: Event) => {
      const ce = e as CustomEvent<{ lang?: PresentLang }>;
      const v = ce.detail?.lang;
      if (v === "hu" || v === "en") setLang(v);
    };
    window.addEventListener(PRESENT_LANG_CHANGED_EVENT, onLang);
    return () => window.removeEventListener(PRESENT_LANG_CHANGED_EVENT, onLang);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduceMotion(!!mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);

  const ui = presentFlowUiByLang[lang];

  const ctx: PresentContext = useMemo(
    () => ({ phase, role, pain, usecase }),
    [phase, role, pain, usecase]
  );

  const cards = useMemo(
    () => resolvePresentCards(lang, ctx),
    [lang, ctx]
  );

  useLayoutEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, [phase, role, pain, usecase, lang]);

  useEffect(() => {
    const el = narrativeInnerRef.current;
    if (!el) return;

    // Kezdő mount-on ne animáljuk (csak fázisváltásnál).
    if (!didMountNarrativeAnimRef.current) {
      didMountNarrativeAnimRef.current = true;
      return;
    }

    if (skipNextNarrativePhaseEnterRef.current) {
      skipNextNarrativePhaseEnterRef.current = false;
      return;
    }

    // Addig tartsuk az attribútumot, amíg a keyframes fut,
    // különben a selector eltűnik és az animáció leállhat.
    el.setAttribute("data-phase-entering", "");
    const timeout = window.setTimeout(() => {
      el.removeAttribute("data-phase-entering");
    }, 280);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [phase]);

  useEffect(() => {
    return () => {
      if (r1ExitTimerRef.current != null) {
        window.clearTimeout(r1ExitTimerRef.current);
        r1ExitTimerRef.current = null;
      }
      if (r2ExitTimerRef.current != null) {
        window.clearTimeout(r2ExitTimerRef.current);
        r2ExitTimerRef.current = null;
      }
      if (r3ExitTimerRef.current != null) {
        window.clearTimeout(r3ExitTimerRef.current);
        r3ExitTimerRef.current = null;
      }
    };
  }, []);

  const cancelR1Exit = useCallback(() => {
    if (r1ExitTimerRef.current != null) {
      window.clearTimeout(r1ExitTimerRef.current);
      r1ExitTimerRef.current = null;
    }
    r1PendingRoleRef.current = null;
    setR1Exiting(false);
  }, []);

  const cancelR2Exit = useCallback(() => {
    if (r2ExitTimerRef.current != null) {
      window.clearTimeout(r2ExitTimerRef.current);
      r2ExitTimerRef.current = null;
    }
    r2PendingExitRef.current = null;
    setR2Exiting(false);
  }, []);

  const cancelR3Exit = useCallback(() => {
    if (r3ExitTimerRef.current != null) {
      window.clearTimeout(r3ExitTimerRef.current);
      r3ExitTimerRef.current = null;
    }
    r3PendingExitRef.current = null;
    setR3Exiting(false);
  }, []);

  const commitPickRole = useCallback((r: PresentRole) => {
    skipNextNarrativePhaseEnterRef.current = true;
    setR1Exiting(false);
    r1PendingRoleRef.current = null;
    setRole(r);
    setPhase("r2");
    emitPresentChoice({
      phase: "r2",
      role: r,
      pain: null,
      usecase: null,
      choiceType: "role",
      choiceValue: r,
    });
  }, []);

  const commitR2Exit = useCallback(
    (
      pending: R2ExitPending,
      currentRole: PresentRole | null,
      currentUsecase: PresentUsecase | null
    ) => {
      skipNextNarrativePhaseEnterRef.current = pending.kind === "to-r3";
      setR2Exiting(false);
      r2PendingExitRef.current = null;
      if (r2ExitTimerRef.current != null) {
        window.clearTimeout(r2ExitTimerRef.current);
        r2ExitTimerRef.current = null;
      }
      if (pending.kind === "to-r3") {
        setPain(pending.pain);
        setPhase("r3");
        emitPresentChoice({
          phase: "r3",
          role: currentRole,
          pain: pending.pain,
          usecase: null,
          choiceType: "pain",
          choiceValue: pending.pain,
        });
      } else {
        setPain(null);
        setPhase("r1");
        emitPresentChoice({
          phase: "r2",
          role: currentRole,
          pain: null,
          usecase: currentUsecase,
          choiceType: "back",
        });
      }
    },
    []
  );

  const commitR3Exit = useCallback(
    (
      target: R3ExitPending,
      snapshot: {
        role: PresentRole | null;
        pain: PresentPain | null;
        usecase: PresentUsecase | null;
      }
    ) => {
      skipNextNarrativePhaseEnterRef.current = target === "to-r2";
      setR3Exiting(false);
      r3PendingExitRef.current = null;
      if (r3ExitTimerRef.current != null) {
        window.clearTimeout(r3ExitTimerRef.current);
        r3ExitTimerRef.current = null;
      }
      if (target === "to-r2") {
        setUsecase(null);
        setPhase("r2");
        emitPresentChoice({
          phase: "r3",
          role: snapshot.role,
          pain: snapshot.pain,
          usecase: null,
          choiceType: "back",
        });
      } else {
        setRole(null);
        setPain(null);
        setUsecase(null);
        setPhase("r1");
        emitPresentChoice({
          phase: "r3",
          role: null,
          pain: null,
          usecase: null,
          choiceType: "back",
        });
      }
    },
    []
  );

  const goIntro = useCallback(() => {
    cancelR1Exit();
    cancelR2Exit();
    cancelR3Exit();
    setPhase("intro");
    setRole(null);
    setPain(null);
    setUsecase(null);
  }, [cancelR1Exit, cancelR2Exit, cancelR3Exit]);

  const goSkipSummary = useCallback(() => {
    setRole("webshop");
    setPain("need_new");
    setUsecase("product_finder");
    setPhase("summary");
    emitPresentChoice({
      phase: "summary",
      role: "webshop",
      pain: "need_new",
      usecase: "product_finder",
      choiceType: "skip",
    });
  }, []);

  const pickRole = (r: PresentRole) => {
    if (phase !== "r1" || r1Exiting) return;
    if (reduceMotion) {
      commitPickRole(r);
      return;
    }
    r1PendingRoleRef.current = r;
    setR1Exiting(true);
    if (r1ExitTimerRef.current != null) {
      window.clearTimeout(r1ExitTimerRef.current);
    }
    r1ExitTimerRef.current = window.setTimeout(() => {
      r1ExitTimerRef.current = null;
      const pending = r1PendingRoleRef.current;
      if (pending) commitPickRole(pending);
      else setR1Exiting(false);
    }, R1_EXIT_MS);
  };

  const pickPain = (p: PresentPain) => {
    if (phase !== "r2" || !role || r2Exiting) return;
    if (reduceMotion) {
      commitR2Exit({ kind: "to-r3", pain: p }, role, usecase);
      return;
    }
    r2PendingExitRef.current = { kind: "to-r3", pain: p };
    setR2Exiting(true);
    if (r2ExitTimerRef.current != null) {
      window.clearTimeout(r2ExitTimerRef.current);
    }
    const roleSnapshot = role;
    const usecaseSnapshot = usecase;
    r2ExitTimerRef.current = window.setTimeout(() => {
      r2ExitTimerRef.current = null;
      const pending = r2PendingExitRef.current;
      if (pending?.kind === "to-r3" || pending?.kind === "to-r1") {
        commitR2Exit(pending, roleSnapshot, usecaseSnapshot);
      } else {
        setR2Exiting(false);
      }
    }, R2_EXIT_MS);
  };

  const pickUsecase = (u: PresentUsecase) => {
    setUsecase(u);
    setPhase("summary");
    emitPresentChoice({
      phase: "summary",
      role,
      pain,
      usecase: u,
      choiceType: "usecase",
      choiceValue: u,
    });
  };

  const startR3GuidedFlowCta = useCallback(() => {
    if (phase !== "r3" || !pain || r3Exiting) return;
    const snap = { role, pain, usecase };
    if (reduceMotion) {
      commitR3Exit("to-r1", snap);
      return;
    }
    r3PendingExitRef.current = "to-r1";
    setR3Exiting(true);
    if (r3ExitTimerRef.current != null) {
      window.clearTimeout(r3ExitTimerRef.current);
    }
    r3ExitTimerRef.current = window.setTimeout(() => {
      r3ExitTimerRef.current = null;
      const target = r3PendingExitRef.current;
      if (target === "to-r2" || target === "to-r1") {
        commitR3Exit(target, snap);
      } else {
        setR3Exiting(false);
      }
    }, R3_EXIT_MS);
  }, [phase, pain, r3Exiting, reduceMotion, role, usecase, commitR3Exit]);

  const handleBack = () => {
    if (phase === "r1") {
      cancelR1Exit();
      goIntro();
      emitPresentChoice({
        phase: "r1",
        role,
        pain,
        usecase,
        choiceType: "back",
      });
      return;
    }
    if (phase === "r2") {
      if (reduceMotion) {
        cancelR2Exit();
        setPain(null);
        setPhase("r1");
        emitPresentChoice({
          phase: "r2",
          role,
          pain,
          usecase,
          choiceType: "back",
        });
        return;
      }
      if (r2Exiting) return;
      r2PendingExitRef.current = { kind: "to-r1" };
      setR2Exiting(true);
      if (r2ExitTimerRef.current != null) {
        window.clearTimeout(r2ExitTimerRef.current);
      }
      const roleSnapshot = role;
      const usecaseSnapshot = usecase;
      r2ExitTimerRef.current = window.setTimeout(() => {
        r2ExitTimerRef.current = null;
        const pending = r2PendingExitRef.current;
        if (pending?.kind === "to-r3" || pending?.kind === "to-r1") {
          commitR2Exit(pending, roleSnapshot, usecaseSnapshot);
        } else {
          setR2Exiting(false);
        }
      }, R2_EXIT_MS);
      return;
    }
    if (phase === "r3") {
      if (reduceMotion) {
        cancelR3Exit();
        setUsecase(null);
        setPhase("r2");
        emitPresentChoice({
          phase: "r3",
          role,
          pain,
          usecase,
          choiceType: "back",
        });
        return;
      }
      if (r3Exiting) return;
      r3PendingExitRef.current = "to-r2";
      setR3Exiting(true);
      if (r3ExitTimerRef.current != null) {
        window.clearTimeout(r3ExitTimerRef.current);
      }
      const snap = { role, pain, usecase };
      r3ExitTimerRef.current = window.setTimeout(() => {
        r3ExitTimerRef.current = null;
        const target = r3PendingExitRef.current;
        if (target === "to-r2" || target === "to-r1") {
          commitR3Exit(target, snap);
        } else {
          setR3Exiting(false);
        }
      }, R3_EXIT_MS);
      return;
    }
    if (phase === "summary") {
      setPhase("r3");
    }
    emitPresentChoice({
      phase,
      role,
      pain,
      usecase,
      choiceType: "back",
    });
  };

  const handleQuote = () => {
    onRequestQuoteClick?.();
    setContactOpen(true);
  };

  const phaseTitle = useMemo(() => {
    if (phase === "r1") return ui.r1Prompt;
    if (phase === "r2" && role) return ui.r2PromptByRole[role];
    if (phase === "r2") return "";
    if (phase === "r3") return ui.r3Prompt;
    return ui.summaryHint;
  }, [phase, role, ui]);

  const panelTextBlocks = useMemo<[string, string, string]>(() => {
    if (phase === "r1") {
      return [phaseTitle, ui.r1Subtext, ui.r1Micro ?? ""];
    }
    if (phase === "r2" && role) {
      const hud = ui.r2HudByRole[role];
      return [ui.r2PromptByRole[role], hud.subtext, hud.micro];
    }
    if (phase === "r2") {
      return ["", "", ""];
    }
    if (phase === "r3" && pain) {
      const hud = ui.r3ContentByPain[pain].hud;
      const r3Role = role ?? "agency";
      return [hud.title, hud.subtextByRole[r3Role], hud.micro];
    }
    return [phaseTitle, "", ""];
  }, [
    phase,
    phaseTitle,
    role,
    pain,
    ui.r1Subtext,
    ui.r1Micro,
    ui.r2HudByRole,
    ui.r2PromptByRole,
    ui.r3ContentByPain,
  ]);

  useLayoutEffect(() => {
    if (reduceMotion) return;
    setTypedBlocks(["", "", ""]);
    setNarrativeRevealStep(0);
    setActiveTypingBlock(0);
  }, [phase, panelTextBlocks, reduceMotion]);

  useEffect(() => {
    for (const id of narrativeRevealTimersRef.current) {
      window.clearTimeout(id);
    }
    narrativeRevealTimersRef.current = [];

    const schedule = (fn: () => void, ms: number) => {
      const id = window.setTimeout(fn, ms);
      narrativeRevealTimersRef.current.push(id);
    };

    if (reduceMotion) {
      setTypedBlocks(panelTextBlocks);
      setNarrativeRevealStep(3);
      setActiveTypingBlock(null);
      return () => {
        for (const id of narrativeRevealTimersRef.current) {
          window.clearTimeout(id);
        }
        narrativeRevealTimersRef.current = [];
      };
    }

    const [b0, b1, b2] = panelTextBlocks;
    const hasB1 = Boolean(b1.trim());
    const hasB2 = Boolean(b2.trim());
    const base = narrativeHudLeadMs(phase);
    const w0 = countWords(b0);
    const w1 = countWords(b1);

    setTypedBlocks(["", "", ""]);
    setNarrativeRevealStep(0);
    setActiveTypingBlock(0);

    const finalize = () => {
      setNarrativeRevealStep(3);
      setTypedBlocks(panelTextBlocks);
      setActiveTypingBlock(null);
    };

    const t0 = base + lineRevealDurationMs(w0) + NARRATIVE_PAUSE_AFTER_LINE_MS;

    schedule(() => {
      if (hasB1) {
        setNarrativeRevealStep(1);
        setActiveTypingBlock(1);
        const t1 =
          lineRevealDurationMs(w1) + NARRATIVE_PAUSE_AFTER_LINE_MS;
        schedule(() => {
          if (hasB2) {
            setNarrativeRevealStep(2);
            setTypedBlocks([b0, b1, b2]);
            setActiveTypingBlock(null);
            schedule(finalize, NARRATIVE_MICRO_TAIL_MS);
          } else {
            finalize();
          }
        }, t1);
      } else if (hasB2) {
        setNarrativeRevealStep(2);
        setTypedBlocks([b0, b1, b2]);
        setActiveTypingBlock(null);
        schedule(finalize, NARRATIVE_MICRO_TAIL_MS);
      } else {
        finalize();
      }
    }, t0);

    return () => {
      for (const id of narrativeRevealTimersRef.current) {
        window.clearTimeout(id);
      }
      narrativeRevealTimersRef.current = [];
    };
  }, [panelTextBlocks, reduceMotion, phase]);

  /** R1: szerepválasztók a szavas belépő + micro után (narrativeRevealStep === 3). */
  const r1ChoicesReady = useMemo(() => {
    if (phase !== "r1") return false;
    if (narrativeRevealStep !== 3) return false;
    if (activeTypingBlock !== null) return false;
    return (
      typedBlocks[0] === panelTextBlocks[0] &&
      typedBlocks[1] === panelTextBlocks[1] &&
      typedBlocks[2] === panelTextBlocks[2]
    );
  }, [
    phase,
    narrativeRevealStep,
    activeTypingBlock,
    typedBlocks,
    panelTextBlocks,
  ]);

  const r2CopyDone = useMemo(() => {
    if (phase !== "r2" || !role) return false;
    if (narrativeRevealStep !== 3) return false;
    if (activeTypingBlock !== null) return false;
    return (
      typedBlocks[0] === panelTextBlocks[0] &&
      typedBlocks[1] === panelTextBlocks[1] &&
      typedBlocks[2] === panelTextBlocks[2]
    );
  }, [
    phase,
    role,
    narrativeRevealStep,
    activeTypingBlock,
    typedBlocks,
    panelTextBlocks,
  ]);
  const hudComplete = useMemo(() => {
    if (reduceMotion) return true;
    if (phase !== "r3") return narrativeRevealStep >= 3;
    if (narrativeRevealStep !== 3) return false;
    if (activeTypingBlock !== null) return false;
    return (
      typedBlocks[0] === panelTextBlocks[0] &&
      typedBlocks[1] === panelTextBlocks[1] &&
      typedBlocks[2] === panelTextBlocks[2]
    );
  }, [
    reduceMotion,
    phase,
    narrativeRevealStep,
    activeTypingBlock,
    typedBlocks,
    panelTextBlocks,
  ]);

  useEffect(() => {
    if (phase !== "r3" || !pain) {
      setR3CtaReady(false);
      return;
    }
    if (!(reduceMotion || narrativeRevealStep >= 3)) {
      setR3CtaReady(false);
      return;
    }
    if (reduceMotion) {
      setR3CtaReady(true);
      return;
    }
    setR3CtaReady(false);
    const id = window.setTimeout(() => {
      setR3CtaReady(true);
    }, R3_CONTAINERS_REVEAL_TOTAL_MS);
    return () => window.clearTimeout(id);
  }, [phase, pain, narrativeRevealStep, reduceMotion]);

  const r1StepLabel = lang === "hu" ? "1/3 lépés" : "Step 1/3";
  const r2StepLabel = lang === "hu" ? "2/3 lépés" : "Step 2/3";
  const r3StepLabel = lang === "hu" ? "3/3 lépés" : "Step 3/3";
  const activeStep = phase === "r1" ? 1 : phase === "r2" ? 2 : 3;
  const topBarStepLabel =
    phase === "r1" ? r1StepLabel : phase === "r2" ? r2StepLabel : r3StepLabel;
  const meshColor = "12,10,8";

  const meshIntensity =
    phase === "intro"
      ? 0.62
      : phase === "r1"
        ? 0.88
        : phase === "r2"
          ? 0.98
          : phase === "r3"
            ? 1.1
            : 1.15;
  const meshProgress =
    phase === "intro"
      ? 0.08
      : phase === "r1"
        ? 0.26
        : phase === "r2"
          ? 0.52
          : phase === "r3"
            ? 0.78
            : 1;
  const meshBlendRadius =
    phase === "intro"
      ? 0.14
      : phase === "r1"
        ? 0.28
        : phase === "r2"
          ? 0.44
          : phase === "r3"
            ? 0.62
            : 0.9;

  return (
    <div
      className={`${s.page} ${s.pageWithSiteNav} ${
        reduceMotion ? s.reduceMotion : ""
      }`}
      data-phase={phase}
      data-r1-exiting={r1Exiting ? "true" : undefined}
      data-r2-exiting={r2Exiting ? "true" : undefined}
      data-r3-exiting={r3Exiting ? "true" : undefined}
    >
      <div className={s.presentSiteHeader}>
        <MarketingNav />
      </div>

      <DynamicMeshBackground
        className={s.meshCanvas}
        intensity={meshIntensity}
        baseColor="92,64,40"
        color={meshColor}
        progress={meshProgress}
        blendRadius={meshBlendRadius}
        blendCenter={{ x: 0.54, y: 0.42 }}
        focus={{ x: 0.48, y: phase === "intro" ? 0.28 : 0.35 }}
        focusStrength={phase === "intro" ? 0.22 : 0.35}
      />

      <div className={s.shell}>
        {phase === "r1" || phase === "r2" || phase === "r3" ? (
          <div className={s.topBarStack}>
            <div
              className={s.topBarMetaBand}
              role="status"
              aria-label={topBarStepLabel}
            >
              <div className={s.topBarProgress}>
                {(role || pain || usecase) && hudComplete && (
                  <div className={s.profileChips} aria-label={ui.profileAria}>
                    {role && <span className={s.chip}>{ui.role[role]}</span>}
                    {pain && (
                      <span className={s.chipMuted}>
                        {role ? ui.r2PainChoiceByRole[role][pain].title : ""}
                      </span>
                    )}
                    {usecase && <span className={s.chipMuted}>{ui.usecase[usecase]}</span>}
                  </div>
                )}
              </div>
              <div className={s.topBarBackDock}>
                <button
                  type="button"
                  className={s.topBarBackPill}
                  onClick={handleBack}
                >
                  {ui.back}
                </button>
              </div>
              <div className={s.topBarStepDock}>
                <div className={s.topBarStepBandInner}>
                  <span className={s.r1StepTrack} aria-hidden>
                    {[1, 2, 3].map((n) => (
                      <span
                        key={n}
                        className={`${s.r1StepNode} ${n === activeStep ? s.r1StepNodeActive : ""}`}
                      />
                    ))}
                  </span>
                  <span className={s.r1StepLabel}>{topBarStepLabel}</span>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {phase === "intro" ||
        phase === "summary" ||
        phase === "r1" ||
        phase === "r2" ||
        phase === "r3" ? (
          <div
            className={`${s.presentFixedBrand} ${
              phase === "intro" || phase === "summary"
                ? s.presentFixedBrandIntro
                : s.presentFixedBrandDecision
            }`}
          >
            {phase === "r3" && pain && r3CtaReady ? (
              <div className={s.presentFixedIntroCta}>
                <button
                  type="button"
                  className={`${s.heroPrimaryCta} ${s.r3PrimaryCta}`}
                  onClick={startR3GuidedFlowCta}
                >
                  {ui.r3DockCta}
                </button>
              </div>
            ) : null}
            <img
              className={s.presentFixedLogo}
              src={resolvedLogo}
              alt={logoAlt}
              decoding="async"
            />
            {phase === "intro" ? (
              <div className={s.presentFixedIntroCta}>
                <button
                  type="button"
                  className={s.heroPrimaryCta}
                  onClick={() => {
                    setPhase("r1");
                    emitPresentChoice({
                      phase: "intro",
                      role: null,
                      pain: null,
                      usecase: null,
                      choiceType: "start",
                    });
                  }}
                >
                  {ui.introCta}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className={s.body}>
          <div
            className={s.narrative}
            aria-live="polite"
            aria-atomic="false"
            aria-label="Questell present"
          >
            <div
              ref={narrativeInnerRef}
              className={`${s.narrativeInner} ${
                phase === "intro" ? s.narrativeInnerHero : ""
              }`}
            >
              {phase === "intro" ? (
                <div className={s.heroZone}>
                  <div className={s.heroMain}>
                    <h1 ref={titleRef} tabIndex={-1} className={s.heroTitle}>
                      <span className={s.heroTitleLine}>{ui.heroTitleLine1}</span>
                      <br />
                      <span className={s.heroTitleAccent}>{ui.heroTitleLine2}</span>
                    </h1>
                    <div className={s.heroBody}>
                      {ui.heroBlocks.map((block, bi) => (
                        <div
                          key={bi}
                          className={s.heroBlock}
                          data-hero-block={String(bi)}
                        >
                          {block.map((line, li) => (
                            <p
                              key={li}
                              className={s.heroParagraph}
                              data-hero-line={String(li)}
                            >
                              {line}
                            </p>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {phase === "r2" && role ? (
                    <section
                      className={`${s.r1StageLayout} ${s.decisionStage} ${s.r2StageLayout}`}
                      aria-label={ui.r2PromptByRole[role]}
                    >
                      <header className={`${s.r1QuestionStage} ${s.questionStage}`}>
                        <div
                          className={`${s.r1QuestionPanel} ${s.r1QuestionPanelR1}`}
                        >
                          <div className={s.r1SoloCopy}>
                            <p className={s.r2HudEyebrow}>
                              {ui.r2HudByRole[role].title}
                            </p>
                            <h2
                              ref={titleRef}
                              tabIndex={-1}
                              className={`${s.phaseTitle} ${s.phaseTitleTerminal}`}
                              aria-label={panelTextBlocks[0] || undefined}
                            >
                              {reduceMotion || narrativeRevealStep > 0 ? (
                                panelTextBlocks[0]
                              ) : (
                                <NarrativeWordLine
                                  text={panelTextBlocks[0]}
                                  wordBaseMs={narrativeHudLeadMs(phase)}
                                />
                              )}
                            </h2>
                            <div className={s.r1Lead}>
                              <p className={s.r1Subtext}>
                                {reduceMotion || narrativeRevealStep > 1 ? (
                                  panelTextBlocks[1]
                                ) : narrativeRevealStep === 1 ? (
                                  <NarrativeWordLine
                                    text={panelTextBlocks[1]}
                                    wordBaseMs={narrativeHudLeadMs(phase)}
                                  />
                                ) : null}
                              </p>
                              <p
                                className={`${s.r1Micro} ${
                                  (reduceMotion || narrativeRevealStep >= 2) &&
                                  panelTextBlocks[2]
                                    ? s.r1MicroReveal
                                    : ""
                                }`}
                              >
                                {(reduceMotion || narrativeRevealStep >= 2) &&
                                panelTextBlocks[2]
                                  ? panelTextBlocks[2]
                                  : null}
                              </p>
                            </div>
                          </div>
                        </div>
                      </header>

                      <section
                        className={`${s.r1InfoStage} ${s.infoStage}`}
                        aria-label={ui.profileAria}
                      >
                        {r2CopyDone ? (
                          <ul
                            className={`${s.r2FrictionLegendGrid} ${s.r2InfoPanel} ${s.r2FrictionLegendGridReveal}`}
                            aria-label={
                              lang === "hu"
                                ? "Súrlódási pont — válassz egyet"
                                : "Friction point — pick one"
                            }
                          >
                            {PAINS.map((p) => {
                              const line = ui.r2PainChoiceByRole[role][p];
                              return (
                                <li key={p} className={s.r2FrictionListItem}>
                                  <button
                                    type="button"
                                    disabled={r2Exiting}
                                    className={`${s.flowInfoPanel} ${s.r2FrictionCardBtn}`}
                                    onClick={() => pickPain(p)}
                                  >
                                    <span className={s.r2FrictionCardTitle}>
                                      {line.title}
                                    </span>
                                    <p className={s.r2FrictionLegendDesc}>
                                      {line.body}
                                    </p>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        ) : null}
                      </section>
                    </section>
                  ) : phase === "r3" && pain ? (
                    <section
                      className={`${s.r1StageLayout} ${s.decisionStage} ${s.r3StageLayout}`}
                      aria-label={ui.r3Prompt}
                    >
                      <div className={s.r3HudBlurGroup}>
                        <header className={`${s.r1QuestionStage} ${s.questionStage}`}>
                          <div
                            className={`${s.r1QuestionPanel} ${s.r1QuestionPanelR1}`}
                          >
                            <div className={s.r1SoloCopy}>
                              <p className={s.r2HudEyebrow}>
                                {ui.r3ContentByPain[pain].shortLabel}
                              </p>
                              <h2
                                ref={titleRef}
                                tabIndex={-1}
                                className={`${s.phaseTitle} ${s.phaseTitleTerminal}`}
                                aria-label={panelTextBlocks[0] || undefined}
                              >
                                {reduceMotion || narrativeRevealStep > 0 ? (
                                  panelTextBlocks[0]
                                ) : (
                                  <NarrativeWordLine
                                    text={panelTextBlocks[0]}
                                    wordBaseMs={narrativeHudLeadMs(phase)}
                                  />
                                )}
                              </h2>
                              <div className={s.r1Lead}>
                                <p className={s.r1Subtext}>
                                  {reduceMotion || narrativeRevealStep > 1 ? (
                                    panelTextBlocks[1]
                                  ) : narrativeRevealStep === 1 ? (
                                    <NarrativeWordLine
                                      text={panelTextBlocks[1]}
                                      wordBaseMs={narrativeHudLeadMs(phase)}
                                    />
                                  ) : null}
                                </p>
                              </div>
                            </div>
                          </div>
                        </header>

                        {hudComplete ? (
                          <section
                            className={s.r3HudQuestellSection}
                            aria-labelledby="r3-questell-primer-title"
                          >
                            <div className={s.r3HudQuestell} data-pain={pain}>
                              <h3
                                id="r3-questell-primer-title"
                                className={s.r3NarrativeHeading}
                              >
                                {ui.r3ContentByPain[pain].questellPrimer.title}
                              </h3>
                              <p className={s.r3NarrativeParagraph}>
                                {ui.r3ContentByPain[pain].questellPrimer.body[0]}
                              </p>
                              <p className={s.r3NarrativeParagraphMuted}>
                                {ui.r3ContentByPain[pain].questellPrimer.body[1]}
                              </p>
                            </div>
                          </section>
                        ) : null}
                      </div>

                      {hudComplete ? (
                        <section
                          className={`${s.r1InfoStage} ${s.infoStage} ${s.r3InfoStageReady}`}
                          aria-label={ui.profileAria}
                        >
                        <section
                          className={`${s.r3NarrativePanel} ${s.r3NarrativePanelCard}`}
                          aria-labelledby="r3-pain-narrative-title"
                          data-pain={pain}
                        >
                          <h3
                            id="r3-pain-narrative-title"
                            className={s.r3NarrativeHeading}
                          >
                            {ui.r3ContentByPain[pain].painNarrative.title}
                          </h3>
                          <p className={s.r3NarrativeParagraph}>
                            {ui.r3ContentByPain[pain].painNarrative.body[0]}
                          </p>
                          <p className={s.r3NarrativeParagraphMuted}>
                            {ui.r3ContentByPain[pain].painNarrative.body[1]}
                          </p>
                        </section>
                        <div className={s.r3EvidenceLine}>
                          <p
                            className={s.r3EvidenceItem}
                            title={ui.r3ContentByPain[pain].evidenceLine.signal}
                          >
                            {ui.r3ContentByPain[pain].evidenceLine.signal}
                          </p>
                          <p
                            className={s.r3EvidenceItem}
                            title={ui.r3ContentByPain[pain].evidenceLine.proof}
                          >
                            {ui.r3ContentByPain[pain].evidenceLine.proof}
                          </p>
                          <p
                            className={s.r3EvidenceItem}
                            title={ui.r3ContentByPain[pain].evidenceLine.pattern}
                          >
                            {ui.r3ContentByPain[pain].evidenceLine.pattern}
                          </p>
                        </div>

                        <section
                          className={`${s.r3NarrativePanel} ${s.r3NarrativePanelCard}`}
                          aria-labelledby="r3-action-bridge-title"
                          data-pain={pain}
                        >
                          <h3
                            id="r3-action-bridge-title"
                            className={s.r3NarrativeHeading}
                          >
                            {role
                              ? ui.r3ClosureByRolePain[role][pain].title
                              : ui.r3ContentByPain[pain].actionBridge.title}
                          </h3>
                          <p className={s.r3NarrativeParagraph}>
                            {role
                              ? ui.r3ClosureByRolePain[role][pain].body[0]
                              : ui.r3ContentByPain[pain].actionBridge.body[0]}
                          </p>
                          <p className={s.r3NarrativeParagraphMuted}>
                            {role
                              ? ui.r3ClosureByRolePain[role][pain].body[1]
                              : ui.r3ContentByPain[pain].actionBridge.body[1]}
                          </p>
                        </section>
                        </section>
                      ) : null}
                    </section>
                  ) : phase === "r1" ? (
                    <section
                      className={`${s.r1StageLayout} ${s.decisionStage}`}
                      aria-label={ui.r1Prompt}
                    >
                      <header className={`${s.r1QuestionStage} ${s.questionStage}`}>
                        <div
                          className={`${s.r1QuestionPanel} ${s.r1QuestionPanelR1}`}
                        >
                          <div className={s.r1SoloCopy}>
                            <h2
                              ref={titleRef}
                              tabIndex={-1}
                              className={`${s.phaseTitle} ${s.phaseTitleTerminal}`}
                              aria-label={panelTextBlocks[0] || undefined}
                            >
                              {reduceMotion || narrativeRevealStep > 0 ? (
                                panelTextBlocks[0]
                              ) : (
                                <NarrativeWordLine
                                  text={panelTextBlocks[0]}
                                  wordBaseMs={narrativeHudLeadMs(phase)}
                                />
                              )}
                            </h2>
                            <div className={s.r1Lead}>
                              <p className={s.r1Subtext}>
                                {reduceMotion || narrativeRevealStep > 1 ? (
                                  panelTextBlocks[1]
                                ) : narrativeRevealStep === 1 ? (
                                  <NarrativeWordLine
                                    text={panelTextBlocks[1]}
                                    wordBaseMs={narrativeHudLeadMs(phase)}
                                  />
                                ) : null}
                              </p>
                              {ui.r1Micro ? (
                                <p
                                  className={`${s.r1Micro} ${
                                    (reduceMotion || narrativeRevealStep >= 2) &&
                                    panelTextBlocks[2]
                                      ? s.r1MicroReveal
                                      : ""
                                  }`}
                                >
                                  {(reduceMotion || narrativeRevealStep >= 2) &&
                                  panelTextBlocks[2]
                                    ? panelTextBlocks[2]
                                    : null}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </header>

                      {ui.r1CarryoverBlocks.length > 0 && hudComplete ? (
                        <section
                          className={`${s.r1InfoStage} ${s.infoStage}`}
                          aria-label={ui.profileAria}
                        >
                          <div className={s.r1InfoGrid}>
                            {ui.r1CarryoverBlocks.map((pair, bi) => (
                              <article
                                key={bi}
                                className={`${s.flowInfoPanel} ${s.r1InfoCard}`}
                                data-flow-block={String(bi)}
                              >
                                <p className={s.flowInfoLead}>{pair[0]}</p>
                                <p className={s.flowInfoMuted}>{pair[1]}</p>
                              </article>
                            ))}
                          </div>
                        </section>
                      ) : null}

                      {r1ChoicesReady ? (
                        <section
                          className={`${s.r1ActionStage} ${s.actionStage} ${s.r1ActionStageReveal}`}
                          aria-label={ui.profileAria}
                        >
                          <div className={s.r1ActionGrid}>
                            {ROLES.map((r) => (
                              <button
                                key={r}
                                type="button"
                                className={`${s.choiceBtn} ${s.r1ActionBtn}`}
                                onClick={() => pickRole(r)}
                              >
                                {ui.role[r]}
                              </button>
                            ))}
                          </div>
                        </section>
                      ) : null}
                    </section>
                  ) : (
                    <h2
                      ref={titleRef}
                      tabIndex={-1}
                      className={`${s.phaseTitle} ${s.phaseTitleTerminal}`}
                      aria-label={panelTextBlocks[0] || undefined}
                    >
                      {reduceMotion || narrativeRevealStep > 0 ? (
                        panelTextBlocks[0]
                      ) : (
                        <NarrativeWordLine
                          text={panelTextBlocks[0]}
                          wordBaseMs={narrativeHudLeadMs(phase)}
                        />
                      )}
                    </h2>
                  )}

                  {cards.length > 0 && (
                    <div className={s.cards}>
                      {cards.map((card) => (
                        <PresentCard
                          key={`${card.id}-${card.density}`}
                          card={card}
                          lang={lang}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}

              {phase === "summary" && (
                <div className={s.summaryCtas}>
                  <button
                    type="button"
                    className={s.summaryCtaPrimary}
                    onClick={handleQuote}
                  >
                    {ui.ctaQuote}
                  </button>
                  <button
                    type="button"
                    className={s.summaryCtaSecondary}
                    onClick={() => onViewDemosClick?.()}
                  >
                    {ui.ctaDemo}
                  </button>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      <ContactModal
        open={contactOpen}
        onClose={() => setContactOpen(false)}
        lang={lang}
      />
    </div>
  );
}
