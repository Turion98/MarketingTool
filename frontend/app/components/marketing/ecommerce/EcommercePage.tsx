"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import VisualPlaceholder from "@/app/components/marketing/features/VisualPlaceholder";
import {
  PRESENT_LANG_CHANGED_EVENT,
  readPresentLangFromStorage,
} from "@/app/present/presentLangSync";
import s from "./ecommercePage.module.scss";

type SplitBlock = {
  key: string;
  eyebrow: string;
  title: string;
  body: ReactNode;
  visualLabel: string;
};

type RevealKey =
  | "hero"
  | "personalize"
  | "service"
  | "connect"
  | "grow"
  | "sell"
  | "final";

type UiLang = "en" | "hu";

function getSplitBlocks(lang: UiLang): SplitBlock[] {
  return [
  {
    key: "personalize",
    eyebrow: lang === "hu" ? "Perszonalizáció" : "Personalize",
    title: lang === "hu" ? "Egy szűrő nem értékesítő." : "A filter is not a salesperson.",
    body: (
      <p className={s.prose}>
        {lang === "hu"
          ? "A szűrők annak segítenek, aki már pontosan tudja, mit keres. A bizonytalan vásárlónak nem, aki érzi, mire van szüksége, de ezt nem tudja termékparaméterekre fordítani. A Questell ezt a beszélgetést fordítja döntési logikává, így a katalógus böngészés helyett reagálni kezd."
          : "Filters help shoppers who already know what they want. They do nothing for the shopper who knows what they need but cannot translate it into a product specification. Questell maps that conversation into decision logic, so the catalog stops being something to browse and becomes something that responds."}
      </p>
    ),
    visualLabel:
      lang === "hu"
        ? "[Visual placeholder: termékkatalógusból döntési logika]"
        : "[Visual placeholder: product catalog turning into decision logic]",
  },
  {
    key: "service",
    eyebrow: lang === "hu" ? "Szolgáltatás" : "Service",
    title:
      lang === "hu"
        ? "A terméktudás megvan. Csak nincs kint az oldalon."
        : "Your product knowledge exists. It just is not on the page.",
    body: (
      <p className={s.prose}>
        {lang === "hu"
          ? "Minden webshopban van hallgatólagos szakértelem arról, mi milyen helyzetben jó választás, és milyen kérdésekre kell választ kapnia a bizonytalan vásárlónak. Ez a tudás általában a legjobb kollégáid fejében van. A Questell ezt a logikát teszi ki az oldalra, és minden látogatásnál konzisztensen futtatja, emberi jelenlét nélkül."
          : "Every store has implicit expertise about what fits different shopper situations and what questions hesitant buyers need answered before they commit. That knowledge usually lives in your best people. Questell brings that logic onto the page and runs it consistently on every visit without requiring a human to be present."}
      </p>
    ),
    visualLabel:
      lang === "hu"
        ? "[Visual placeholder: irányított termékajánló interakció]"
        : "[Visual placeholder: guided product assistant interaction]",
  },
  {
    key: "connect",
    eyebrow: lang === "hu" ? "Kapcsolódás" : "Connect",
    title:
      lang === "hu"
        ? "A vásárló nem feldolgozva akar lenni. Megértve akar lenni."
        : "The shopper does not want to be processed. They want to be understood.",
    body: (
      <p className={s.prose}>
        {lang === "hu"
          ? "Egy űrlap válaszokat gyűjt. Egy decision flow azt olvassa, mit jelentenek ezek együtt. A különbség azonnal érezhető: az egyik kérdőívnek hat, a másik valódi beszélgetésnek, ahol a következő kérdés azért jön, mert az előző válaszod ezt indokolja."
          : "A form collects answers. A decision flow reads what those answers imply. The difference is felt immediately: one feels like a survey, the other feels like a conversation where the next question exists because of what you just said."}
      </p>
    ),
    visualLabel:
      lang === "hu"
        ? "[Visual placeholder: kérdés-flow, ami valós időben reagál a válaszokra]"
        : "[Visual placeholder: question flow that responds to each answer in real time]",
  },
  {
    key: "grow",
    eyebrow: lang === "hu" ? "Növekedés" : "Grow",
    title:
      lang === "hu"
        ? "Van forgalmad. Az intentet információvá alakító réteg hiányzik."
        : "You have traffic. You are missing the layer that converts intent into information.",
    body: (
      <>
        <p className={s.prose}>
          {lang === "hu"
            ? "Minden vásárló, aki végigmegy a flow-n, a kattintásnál sokkal hasznosabb nyomot hagy maga után:"
            : "Every shopper who moves through a decision flow leaves behind something more useful than a click:"}
        </p>
        <ul className={s.heroBullets}>
          <li>{lang === "hu" ? "strukturált képet arról, mire volt szüksége" : "a structured record of what they needed"}</li>
          <li>{lang === "hu" ? "mit zárt ki" : "what they ruled out"}</li>
          <li>{lang === "hu" ? "hol állt meg" : "where they stopped"}</li>
        </ul>
        <p className={s.prose}>
          {lang === "hu"
            ? "Ebből idővel pontosan látszik, hol nincs összhangban a katalógusod azzal, ahogyan az emberek a saját igényeiket megfogalmazzák."
            : "Over time that tells you where your catalog is misaligned with how people describe their needs."}
        </p>
      </>
    ),
    visualLabel:
      lang === "hu"
        ? "[Visual placeholder: vásárlói döntésekből strukturált intent-adat]"
        : "[Visual placeholder: shopper choices becoming structured intent data]",
  },
  {
    key: "sell",
    eyebrow: lang === "hu" ? "Értékesítés" : "Sell",
    title: lang === "hu" ? "Egy termék. Nem jelöltek listája." : "One product. Not a list of candidates.",
    body: (
      <p className={s.prose}>
        {lang === "hu"
          ? "A kosárba rakás előtti pillanat az e-commerce legkényesebb pontja. A vásárló két-három hihető opció között vacillál, és a legegyszerűbb lépés a tab bezárása. Egy decision flow ezt a bizonytalanságot szünteti meg: mire kimenethez ér, a tér már leszűkült arra az egy termékre, ami tényleg illik a mintázatához."
          : "The moment before add-to-cart is the most fragile point in e-commerce. The shopper is looking at two or three plausible options and the easiest move is to close the tab. A decision flow eliminates that moment: by the time they reach an outcome, the space has already narrowed to the one product that matches their pattern."}
      </p>
    ),
    visualLabel:
      lang === "hu"
        ? "[Visual placeholder: egytermékes ajánlás, ami vásárláshoz vezet]"
        : "[Visual placeholder: single product recommendation leading to purchase]",
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
        <h2 id={`ecom-${block.key}`} className={s.sectionHeading}>
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
      aria-labelledby={`ecom-${block.key}`}
    >
      <div className={s.sectionInner}>
        <div className={s.ecZigzagRow}>
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

export default function EcommercePage() {
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
    const root = rootRef.current;
    if (!root) return;
    const nodes = root.querySelectorAll<HTMLElement>("[data-reveal]");
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const id = entry.target.getAttribute("data-reveal-id") as RevealKey | null;
          if (!id) continue;
          setRevealById((prev) => ({ ...prev, [id]: true }));
          io.unobserve(entry.target);
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -24px 0px" }
    );
    const initial: Partial<Record<RevealKey, boolean>> = {};
    nodes.forEach((el) => {
      const id = el.getAttribute("data-reveal-id") as RevealKey | null;
      if (!id) return;
      const r = el.getBoundingClientRect();
      const inView = r.top < window.innerHeight * 0.94 && r.bottom > 0;
      if (inView) initial[id] = true;
      else io.observe(el);
    });
    setRevealById((prev) => ({ ...prev, ...initial }));
    return () => io.disconnect();
  }, []);

  return (
    <article ref={rootRef} className={s.page}>
      <section
        className={[s.zigzagSection, s.heroEcom, revealById.hero && s.isVisible].filter(Boolean).join(" ")}
        data-reveal
        data-reveal-id="hero"
        aria-labelledby="ecom-hero-heading"
      >
        <div className={s.sectionInner}>
          <div className={s.ecZigzagRow}>
            <div className={s.zigzagVisual}>
              <VisualPlaceholder
                label={
                  lang === "hu"
                    ? "[Visual placeholder: vásárló egyedül a katalógussal a döntési ponton]"
                    : "[Visual placeholder: shopper alone with catalog at the decision moment]"
                }
                variant="hero"
              />
            </div>
            <div className={s.zigzagText}>
              <p className={s.eyebrow}>{lang === "hu" ? "E-kereskedelem" : "E-commerce"}</p>
              <h1 id="ecom-hero-heading" className={s.heroTitle}>
                {lang === "hu"
                  ? "Amikor a vásárló bizonytalan, nincs ott senki, aki segítsen."
                  : "The moment a shopper hesitates, there is no one there to help them."}
              </h1>
              <div className={s.heroLeadStack}>
                <p className={s.lead}>
                  {lang === "hu"
                    ? "A fizikai boltban ott az értékesítő. Egy webshopban csak a product page marad. Itt vész el a legtöbb vásárlás:"
                    : "A physical store has a sales associate. An e-commerce store has a product page. The gap is where most purchases are lost:"}
                </p>
                <ul className={s.heroBullets}>
                  <li>
                    {lang === "hu"
                      ? "a termék nincs egyértelműen a vásárló helyzetéhez igazítva"
                      : "the product is not clearly matched to the shopper's context"}
                  </li>
                  <li>
                    {lang === "hu"
                      ? "a jó opció elveszik a túl sok hihető alternatíva között"
                      : "the right option is buried in too many plausible alternatives"}
                  </li>
                  <li>
                    {lang === "hu"
                      ? "nincs döntési réteg, ami áthidalja az igény és a katalógus közti rést"
                      : "no decision guidance closes the gap between need and catalog"}
                  </li>
                </ul>
                <p className={s.lead}>
                  {lang === "hu" ? "A Questell ez a hiányzó lezáró réteg." : "Questell is that closing layer."}
                </p>
              </div>
              <div className={s.heroActions}>
                <Link href="/about" className={s.btnPrimary}>
                  {lang === "hu" ? "Kérem az első flow-t" : "Request your first flow"}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {splitBlocks.map((block, i) => (
        <SplitSection
          key={block.key}
          block={block}
          visualFirst={i % 2 === 1}
          revealId={block.key as RevealKey}
          isVisible={!!revealById[block.key as RevealKey]}
        />
      ))}

      <section
        className={[s.finalSection, revealById.final && s.isVisible].filter(Boolean).join(" ")}
        data-reveal
        data-reveal-id="final"
        aria-labelledby="ecom-final"
      >
        <div className={s.sectionInner}>
          <div className={s.ctaPanelEcom}>
            <h2 id="ecom-final" className={s.finalStatement}>
              {lang === "hu"
                ? "A megfelelő termék már ott van a katalógusodban. A hiányzó rész az, ami az érkezés és a döntés között történik."
                : "Your catalog already has the right product for them. The missing piece is what happens between arrival and decision."}
            </h2>
            <p className={s.finalLead}>
              {lang === "hu"
                ? "Feltérképezzük a terméklogikádat, és felépítjük az első irányított döntési flow-t egy élő oldalon, hogy a vásárlók a bizonytalanság helyett vásárlásig jussanak."
                : "We map your product logic and build the first guided decision flow on a live page, so shoppers stop hesitating and start buying."}
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
