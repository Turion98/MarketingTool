"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import VisualPlaceholder from "@/app/components/marketing/features/VisualPlaceholder";
import {
  PRESENT_LANG_CHANGED_EVENT,
  readPresentLangFromStorage,
} from "@/app/present/presentLangSync";
import s from "./agenciesPage.module.scss";

type SplitBlock = {
  key: string;
  eyebrow: string;
  title: string;
  body: ReactNode;
  visualLabel: string;
};

type RevealKey =
  | "hero"
  | "structure"
  | "deploy"
  | "scale"
  | "insight"
  | "result"
  | "final";

type UiLang = "en" | "hu";

function getSplitBlocks(lang: UiLang): SplitBlock[] {
  return [
    {
      key: "structure",
      eyebrow: lang === "hu" ? "Support" : "Support",
      title:
        lang === "hu"
          ? "Egy ügyfélszolgálatos betanítható. Most már az AI is az."
          : "A support agent can be trained. Now AI can be too.",
      body: (
        <div className={s.prosePanels}>
          <div className={s.prosePanel} data-panel="1">
            <p className={s.prose}>
              {lang === "hu"
                ? "Egy jó ügyintéző ismeri a szabályokat, számon tartja mi hangzott el, és két hasonló helyzetben ugyanúgy dönt. Nem improvizál. Nem felejt el fontos részleteket. Tudja mikor kell eszkalálni."
                : "A good agent knows the rules, remembers what was said, and handles similar situations consistently. They don't improvise. They don't miss the moment to escalate."}
            </p>
          </div>
          <div className={s.prosePanel} data-panel="2">
            <p className={s.prose}>
              {lang === "hu"
                ? "Egy chatbot nem azért hibázik mert buta. Hanem mert nincs mögötte struktúra. A promptba írt szabályokat az LLM értelmezi, nem követi. Két hasonló helyzetben két különböző döntést hoz, és egyik sem lesz nyomon követhető."
                : "A chatbot doesn't fail because it's unintelligent. It fails because there's no structure behind it. Rules written in a prompt get interpreted, not followed. Two similar cases, two different outcomes, and neither is traceable."}
            </p>
          </div>
          <div className={s.prosePanel} data-panel="3">
            <p className={s.prose}>
              {lang === "hu"
                ? "A Questell-lel te határozod meg a folyamatot. Látod hol tart az ügy, mi teljesült már, mi hiányzik még. Ha valami nem stimmel, javítod. Ugyanúgy ahogy egy munkatársat betanítanál, és a munkáját folyamatosan finomítanád."
                : "With Questell, you define the process. You see where each case stands, what's done, what's missing. If something's off, you fix it, the same way you'd retrain a colleague."}
            </p>
          </div>
        </div>
      ),
      visualLabel:
        lang === "hu"
          ? "[Visual placeholder: Questell support folyamat — strukturált ügyintézés]"
          : "[Visual placeholder: Questell support flow — structured case handling]",
    },
    {
      key: "deploy",
      eyebrow: lang === "hu" ? "Sales" : "Sales",
      title:
        lang === "hu"
          ? "Egy jó kérdés többet ér mint tíz válasz."
          : "One good question beats ten answers.",
      body: (
        <div className={s.prosePanels}>
          <div className={s.prosePanel} data-panel="1">
            <p className={s.prose}>
              {lang === "hu"
                ? "Egy jó sales qualification nem előre megírt kérdéssor. A tapasztalt saleses folyamatosan próbálja megérteni milyen helyzetben van a cég, hol a valódi probléma, mennyire sürgős, és mi akadályozza a döntést. Ugyanaz a válasz két különböző cégnél teljesen mást jelenthet."
                : "Good qualification isn't a fixed script. Experienced salespeople constantly read the room, the company's situation, the real problem, the urgency, what's blocking the decision."}
            </p>
          </div>
          <div className={s.prosePanel} data-panel="2">
            <p className={s.prose}>
              {lang === "hu"
                ? "Egy LLM ezt nem tudja stabilan végigvezetni. Nem azért mert nem érti a nyelvet, hanem mert nincs mögötte folyamatstruktúra. A fontos információk elvesznek, a qualification iránya szétesik, és nem látható mi alapján jutott következtetésre."
                : "An LLM can't run this reliably. Not because it doesn't understand, but because there's no process structure behind it. Key details slip, the qualification drifts, and you can't see why it reached its conclusion."}
            </p>
          </div>
          <div className={s.prosePanel} data-panel="3">
            <p className={s.prose}>
              {lang === "hu"
                ? "A Questell strukturált állapotot épít a qualification mögött. A fontos információk számon vannak tartva, a rendszer tudja mi derült ki és mi hiányzik még. A qualification nem improvizált chat marad, hanem kontrollált és javítható folyamat."
                : "Questell builds structured state behind qualification. What's been uncovered is tracked. What's still missing is visible. Qualification stops being an improvised chat and becomes a controllable, refinable process."}
            </p>
          </div>
        </div>
      ),
      visualLabel:
        lang === "hu"
          ? "[Visual placeholder: Questell sales qualification — strukturált feltárás]"
          : "[Visual placeholder: Questell sales qualification — structured discovery]",
    },
    {
      key: "scale",
      eyebrow: lang === "hu" ? "Tudás" : "Knowledge",
      title:
        lang === "hu"
          ? "Mindenki ugyanazt tanulja. Mégsem ugyanott tart."
          : "Same material. Different gaps.",
      body: (
        <div className={s.prosePanels}>
          <div className={s.prosePanel} data-panel="1">
            <p className={s.prose}>
              {lang === "hu"
                ? "Egy jó mentor nem ugyanazt kérdezi mindenkitől. Észreveszi hol van lyuk, és ott megy mélyebbre ahol szükséges. Ugyanaz az anyag két embernél teljesen különböző hiányosságokat takar."
                : "A good mentor doesn't ask everyone the same thing. They spot the gap and go deeper there. The same material can hide completely different weaknesses in different people."}
            </p>
          </div>
          <div className={s.prosePanel} data-panel="2">
            <p className={s.prose}>
              {lang === "hu"
                ? "Egy LLM ezt nem tudja stabilan végigvezetni. Nem azért mert nem ismeri az anyagot, hanem mert nem tartja számon hol tart az adott ember. Minden válasznál újraértelmez mindent. A hiányosságok láthatatlanok maradnak."
                : "An LLM can't run this reliably, not because it doesn't know the material, but because it doesn't track where someone actually stands. Every response starts from scratch. Gaps stay invisible."}
            </p>
          </div>
          <div className={s.prosePanel} data-panel="3">
            <p className={s.prose}>
              {lang === "hu"
                ? "A Questell-lel a tudásellenőrzés nem egységes folyamat többé. Mindenki ott folytatja ahol valóban tart, és addig tart ameddig a hiányosság meg nem szűnt. A mentori munka logikája leírható, futtatható és javítható."
                : "With Questell, knowledge checks aren't one-size-fits-all. Everyone picks up where they actually are, and the process runs until the gap is closed. The logic of mentorship becomes something you can define, run, and improve."}
            </p>
          </div>
        </div>
      ),
      visualLabel:
        lang === "hu"
          ? "[Visual placeholder: Questell tudásellenőrzés — személyre szabott haladás]"
          : "[Visual placeholder: Questell knowledge evaluation — personalized progression]",
    },
  ];
}

function SplitSection({
  block,
  visualFirst,
  revealId,
  isVisible,
}: {
  block: SplitBlock;
  visualFirst: boolean;
  revealId: RevealKey;
  isVisible: boolean;
}) {
  const text = (
    <div className={s.zigzagText}>
      <div className={s.sectionHeader}>
        <p className={s.sectionKicker}>{block.eyebrow}</p>
        <h2 id={`agencies-${block.key}`} className={s.sectionHeading}>
          {block.title}
        </h2>
      </div>
      <div className={s.splitProse}>{block.body}</div>
    </div>
  );

  const visual = (
    <div className={s.zigzagVisual}>
      <VisualPlaceholder label={block.visualLabel} variant="wide" />
    </div>
  );

  return (
    <section
      className={[s.zigzagSection, isVisible && s.isVisible].filter(Boolean).join(" ")}
      data-reveal
      data-reveal-id={revealId}
      aria-labelledby={`agencies-${block.key}`}
    >
      <div className={s.sectionInner}>
        <div className={s.agZigzagRow}>
          {visualFirst ? (
            <>
              {visual}
              {text}
            </>
          ) : (
            <>
              {text}
              {visual}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

export default function AgenciesPage() {
  const rootRef = useRef<HTMLElement>(null);
  const [lang, setLang] = useState<UiLang>("en");
  const [revealById, setRevealById] = useState<Partial<Record<RevealKey, boolean>>>({});
  const splitBlocks = getSplitBlocks(lang);

  useEffect(() => {
    const saved = readPresentLangFromStorage();
    if (saved) setLang(saved);
    const onLangChanged = (ev: Event) => {
      const detail = (ev as CustomEvent<{ lang?: UiLang }>).detail;
      const next = detail?.lang;
      if (next === "hu" || next === "en") setLang(next);
    };
    window.addEventListener(PRESENT_LANG_CHANGED_EVENT, onLangChanged as EventListener);
    return () =>
      window.removeEventListener(PRESENT_LANG_CHANGED_EVENT, onLangChanged as EventListener);
  }, []);

  useEffect(() => {
    const allVisible: Partial<Record<RevealKey, boolean>> = {
      hero: true,
      structure: true,
      deploy: true,
      scale: true,
      insight: true,
      result: true,
      final: true,
    };
    setRevealById(allVisible);
  }, []);

  return (
    <article ref={rootRef} className={s.page}>
      <section
        className={[s.zigzagSection, s.heroAg, revealById.hero && s.isVisible].filter(Boolean).join(" ")}
        data-reveal
        data-reveal-id="hero"
        aria-labelledby="agencies-hero-heading"
      >
        <div className={s.sectionInner}>
          <div className={s.heroAgCenter}>
            <p className={s.eyebrow}>{lang === "hu" ? "Miért Questell" : "Why Questell"}</p>
            <h1 id="agencies-hero-heading" className={s.heroTitle}>
              {lang === "hu"
                ? "Az LLM értelmezésre lett tervezve. Nem folyamatvezetésre."
                : "LLMs were designed for interpretation. Not for process control."}
            </h1>
            <div className={s.heroLeadStack}>
              <p className={s.lead}>
                {lang === "hu"
                  ? "Egy AI asszisztenst ma már bárki bevezethet. Gyorsan, olcsón, technikai tudás nélkül. Válaszol, kommunikál, rendelkezésre áll. De amint a folyamatnak iránya van, feltételei vannak, szabályai vannak:"
                  : "Anyone can deploy an AI assistant today. Fast, cheap, no technical expertise needed. It responds, communicates, stays available. But once a process has direction, conditions, rules:"}
              </p>
              <ul className={s.heroBullets}>
                <li>{lang === "hu" ? "a korai információk elvesznek a beszélgetés során" : "early information gets lost along the way"}</li>
                <li>{lang === "hu" ? "ugyanarra a helyzetre két különböző döntést hoz" : "the same situation leads to different decisions"}</li>
                <li>{lang === "hu" ? "nem tartja számon mi teljesült már és mi nem" : "it doesn't track what's done and what isn't"}</li>
              </ul>
              <p className={s.heroClosing}>
                {lang === "hu"
                  ? "Egy LLM önmagában nem tud üzleti folyamatot vezetni. Nem azért mert buta, hanem mert nem erre tervezték."
                  : "An LLM can't run a business process on its own. Not because it's not smart enough, because it wasn't built for that."}
              </p>
            </div>
            <div className={s.heroActions}>
              <Link href="/about" className={s.btnPrimary}>
                {lang === "hu" ? "Készítsd el a saját chatbotodat" : "Build your own chatbot"}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {splitBlocks.map((block, i) => (
        <SplitSection
          key={block.key}
          block={block}
          visualFirst={i % 2 === 0}
          revealId={block.key as RevealKey}
          isVisible={!!revealById[block.key as RevealKey]}
        />
      ))}

      <section
        className={[s.finalSection, revealById.final && s.isVisible].filter(Boolean).join(" ")}
        data-reveal
        data-reveal-id="final"
        aria-labelledby="agencies-final"
      >
        <div className={s.sectionInner}>
          <div className={s.ctaPanel}>
            <h2 id="agencies-final" className={s.finalStatement}>
              {lang === "hu"
                ? "Ezt a három problémát külön fejlesztőcsapat, hónapok és jelentős költség nélkül nem lehet megoldani."
                : "Solving these three problems usually takes a dedicated engineering team, months of work, and serious budget."}
            </h2>
            <p className={s.finalLead}>
              {lang === "hu"
                ? "És ha megoldják, a rendszer még mindig nem látható, nem javítható, és nem tanítható nem technikai embernek. A Questell ezt architektúrával oldja meg."
                : "And even then, the system is often opaque, hard to adjust, and out of reach for non-technical people. Questell solves this through architecture."}
            </p>
            <div className={s.ctaPanelActions}>
              <Link href="/about" className={s.btnPrimary}>
                {lang === "hu" ? "Készítsd el a saját chatbotodat" : "Build your own chatbot"}
              </Link>
            </div>
            <footer className={s.siteFooter}>
              <a href="https://thequestell.com" rel="noopener noreferrer">
                thequestell.com
              </a>
            </footer>
          </div>
        </div>
      </section>
    </article>
  );
}
