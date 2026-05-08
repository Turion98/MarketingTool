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
    eyebrow: lang === "hu" ? "Struktúra" : "Structure",
    title:
      lang === "hu"
        ? "Ne órákat adj el. Rendszert adj el."
        : "Stop selling hours. Start selling a system.",
    body: (
      <>
        <p className={s.prose}>
          {lang === "hu"
            ? "A legtöbb ügynökség azt adja le, amit az ügyfél kér. A Questell flow viszont olyan formátum, amit te hozol az asztalra: olyasmi, amit az ügyfél nem is tudott volna pontosan kérni, mégis működik iparágakon, termékeken és kampánytípusokon át."
            : "Most agencies deliver what the client asks for. A Questell flow is something you bring to the table: a format the client did not know to ask for, built on a decision architecture that works across industries, products, and campaign types."}
        </p>
        <p className={s.prose}>
          {lang === "hu"
            ? "A logika egyszer lesz felépítve. Utána a következő ügyfélre újraírható, áthangolható és újradeployolható anélkül, hogy nulláról kellene újrakezdeni. Ez nem egy egyszeri projekt. Ez egy képesség."
            : "The logic is structured once. After that, it can be adapted, rewritten, and redeployed for the next client without rebuilding from scratch. That is not a project. That is a capability."}
        </p>
      </>
    ),
    visualLabel:
      lang === "hu"
        ? "[Visual placeholder: újrahasznosítható döntési architektúra több ügyfélkampányon]"
        : "[Visual placeholder: reusable decision architecture across multiple client campaigns]",
  },
  {
    key: "deploy",
    eyebrow: lang === "hu" ? "Deploy" : "Deploy",
    title:
      lang === "hu"
        ? "Oda kerül, ahol a bizonytalanság van, nem oda, ahol kényelmes."
        : "It goes where the hesitation is, not where it's convenient.",
    body: (
      <>
        <p className={s.prose}>
          {lang === "hu"
            ? "A decision flow közvetlenül beágyazható product oldalakba, kampány landingekbe és gyűjtőoldalakba. Nincs külön microsite. Nincs platformfüggőség. Nincs kötelező fejlesztői handoff, mielőtt élőbe megy."
            : "Decision flows embed directly into product pages, campaign landing pages, and collection hubs. No separate microsite. No platform dependency. No handoff to a dev team before you can go live."}
        </p>
        <p className={s.prose}>
          {lang === "hu"
            ? "Az ügyfélnek nem kell újraépítenie az oldalát, hogy döntési réteget kapjon. Oda teszed be, ahová a felhasználó már most is érkezik, és onnan változik meg a mozgása."
            : "The client does not need to rebuild their site to add a decision layer. You drop it in where users are already arriving and change how they move from there."}
        </p>
      </>
    ),
    visualLabel:
      lang === "hu"
        ? "[Visual placeholder: döntési flow beágyazva különböző ügyféloldal-típusokba]"
        : "[Visual placeholder: decision flow embedded across different client page types]",
  },
  {
    key: "scale",
    eyebrow: lang === "hu" ? "Skálázás" : "Scale",
    title:
      lang === "hu"
        ? "Ami skálázódik, az a logika, nem a munkaóra."
        : "What scales is the logic, not the workload.",
    body: (
      <>
        <p className={s.prose}>
          {lang === "hu"
            ? "Minden flow ugyanarra az alapstruktúrára épül:"
            : "Every flow is built on the same underlying structure:"}
        </p>
        <ul className={s.heroBullets}>
          <li>{lang === "hu" ? "állapotalapú" : "stateful"}</li>
          <li>{lang === "hu" ? "kombináció-alapú" : "combination-driven"}</li>
          <li>{lang === "hu" ? "útvonal-szűkítő" : "path-narrowing"}</li>
        </ul>
        <p className={s.prose}>
          {lang === "hu"
            ? "Ha egyszer tudsz egyet építeni, a következő már gyorsabb. Nem új formátumot találsz ki, hanem ugyanazt alkalmazod új tartalomra."
            : "Once you know how to build one, the next one is faster. You are not reinventing the format. You are applying it to new content."}
        </p>
        <p className={s.prose}>
          {lang === "hu"
            ? "Egy food hall flow, egy skincare termékajánló és egy B2B onboarding ugyanazon döntési architektúrán fut. Az ügyfél tartalma változik. A folyamatod nem."
            : "A food hall flow and a skincare product finder and a B2B onboarding sequence all run on the same decision architecture. The client's content changes. Your process does not."}
        </p>
      </>
    ),
    visualLabel:
      lang === "hu"
        ? "[Visual placeholder: egyetlen döntési keretrendszer több ügyfélszegmensben]"
        : "[Visual placeholder: single decision framework applied across multiple client verticals]",
  },
  {
    key: "insight",
    eyebrow: lang === "hu" ? "Insight" : "Insight",
    title:
      lang === "hu"
        ? "Nem az számít, mire kattintottak. Az számít, hogyan gondolkodtak."
        : "Not what they clicked. How they reasoned.",
    body: (
      <>
        <p className={s.prose}>
          {lang === "hu"
            ? "Minden flow strukturált döntési adatot generál:"
            : "Every flow generates structured decision data:"}
        </p>
        <ul className={s.heroBullets}>
          <li>{lang === "hu" ? "melyik útvonalakat választották" : "which paths were taken"}</li>
          <li>{lang === "hu" ? "hol bizonytalanodtak el" : "where users hesitated"}</li>
          <li>
            {lang === "hu"
              ? "mely jel-kombinációk vezettek befejezéshez"
              : "which signal combinations led to completion"}
          </li>
          <li>
            {lang === "hu"
              ? "mely kombinációk vezettek lemorzsolódáshoz"
              : "which combinations led to drop-off"}
          </li>
        </ul>
        <p className={s.prose}>
          {lang === "hu"
            ? "Ez nem sima kampányriport. Ez egy térkép arról, hogyan gondolkodik az ügyfél célközönsége az opciókról. Ez a térkép alakítja a következő kampányt, a következő termékdöntést és a következő márkaüzenetet."
            : "This is not campaign reporting. It is a map of how your client's audience thinks about their options. That map informs the next campaign, the next product decision, and the next conversation about what the brand should be saying."}
        </p>
      </>
    ),
    visualLabel:
      lang === "hu"
        ? "[Visual placeholder: döntési útvonal analitika ügyfél-flow-kon át]"
        : "[Visual placeholder: decision path analytics across client flows]",
  },
  {
    key: "result",
    eyebrow: lang === "hu" ? "Eredmény" : "Result",
    title:
      lang === "hu"
        ? '"A felhasználónként reagáló flow-t építettünk" erősebb mondat, mint az, hogy "futtattunk egy kvízt."'
        : '"We built a flow that responded to each user individually" is a stronger sentence than "we ran a quiz."',
    body: (
      <>
        <p className={s.prose}>
          {lang === "hu"
            ? "A decision flow olyan eredmény, amit meg lehet mutatni, nem csak riportálni. Befejezési arány, útvonaladatok, az a pont, amikor a márka a broadcastból valódi reakcióba váltott: ezeket az ügyfél megjegyzi, és ezek működnek a következő pitchben is."
            : "A decision flow is a result you can show, not just report. The completion rate, the path data, the moment a brand stopped broadcasting and started responding: these are things a client remembers, and things that travel when you pitch the next one."}
        </p>
        <p className={s.prose}>
          {lang === "hu"
            ? "Nem kell újratervezni az ügyfél teljes oldalát ahhoz, hogy javuljon a felhasználói út. Elég a döntési pont logikáját átalakítani. Ez gyorsabb, olcsóbb és jobban védhető beavatkozás, ráadásul erős narratívával."
            : "You do not need to redesign the client's site to improve how users move through it. You need to change the logic at the decision point. That is a faster, cheaper, and more defensible intervention, and it has a story attached to it."}
        </p>
      </>
    ),
    visualLabel:
      lang === "hu"
        ? "[Visual placeholder: előtte/utána döntési flow hatás konverzióra és engagementre]"
        : "[Visual placeholder: before / after decision flow impact on conversion and engagement]",
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
          <div className={s.agZigzagRow}>
            <div className={s.zigzagText}>
              <p className={s.eyebrow}>{lang === "hu" ? "Ügynökségek" : "Agencies"}</p>
              <h1 id="agencies-hero-heading" className={s.heroTitle}>
                {lang === "hu"
                  ? "Adj az ügyfeleidnek valamit, amit még nem láttak tőled."
                  : "Give your clients something they haven't seen from you before."}
              </h1>
              <div className={s.heroLeadStack}>
                <p className={s.lead}>
                  {lang === "hu"
                    ? "A Questell flow nem kvíz, nem chatbot és nem microsite. Ez egy döntési élmény:"
                    : "A Questell flow is not a quiz, a chatbot, or a microsite. It is a decision experience:"}
                </p>
                <ul className={s.heroBullets}>
                  <li>{lang === "hu" ? "felhasználónként reagál" : "responds to each user individually"}</li>
                  <li>{lang === "hu" ? "beágyazható bármely meglévő oldalba" : "embeds into any existing page"}</li>
                  <li>
                    {lang === "hu"
                      ? "a megjelenésen és kattintáson túl is értelmezhető adatot ad"
                      : "generates data beyond impressions and clicks"}
                  </li>
                </ul>
                <p className={s.lead}>
                  {lang === "hu"
                    ? "Az ügynökség egyszer építi meg. Az ügyfél emlékezni fog rá."
                    : "The agency builds it once. The client remembers it."}
                </p>
              </div>
              <div className={s.heroActions}>
                <Link href="/about" className={s.btnPrimary}>
                  {lang === "hu" ? "Kérem az első flow-t" : "Request your first flow"}
                </Link>
              </div>
            </div>
            <div className={s.zigzagVisual}>
              <VisualPlaceholder
                label={
                  lang === "hu"
                    ? "[Visual placeholder: több ügyféloldal beágyazott döntési flow-val]"
                    : "[Visual placeholder: multiple client sites with embedded decision flows]"
                }
                variant="hero"
              />
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
                ? "Az első flow a legnehezebben eladható. Utána maga a munka adja el önmagát."
                : "The first flow is the hardest one to sell. After that, the work sells itself."}
            </h2>
            <p className={s.finalLead}>
              {lang === "hu"
                ? "Segítünk feltérképezni a döntési logikát, és elindítani az első flow-t egy élő ügyféloldalon, hogy legyen valós eredményed, mielőtt skálázol."
                : "We help you map the decision logic and launch the first flow on a live client site, so you have something real to show before you scale."}
            </p>
            <div className={s.ctaPanelActions}>
              <Link href="/about" className={s.btnPrimary}>
                {lang === "hu" ? "Kérem az első flow-t" : "Request your first flow"}
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
