"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import VisualPlaceholder from "@/app/components/marketing/features/VisualPlaceholder";
import {
  PRESENT_LANG_CHANGED_EVENT,
  readPresentLangFromStorage,
} from "@/app/present/presentLangSync";
import s from "@/app/components/marketing/agencies/agenciesPage.module.scss";

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
  | "guide"
  | "onboard"
  | "insight"
  | "convert"
  | "final";

type UiLang = "en" | "hu";

function getSplitBlocks(lang: UiLang): SplitBlock[] {
  return [
  {
    key: "personalize",
    eyebrow: lang === "hu" ? "Perszonalizáció" : "Personalize",
    title:
      lang === "hu"
        ? "A jó setup útvonal nem az alapértelmezett. Hanem az, ami az adott ember működéséhez illik."
        : "The right setup path is not the default one. It is the one that fits how this person works.",
    body: (
      <p className={s.prose}>
        {lang === "hu"
          ? "A legtöbb SaaS termék egyetlen onboardingot ad, az átlagfelhasználóra szabva, ami valójában senkinek sem illik tökéletesen. Egy decision flow előbb kontextust olvas: szerepkör, cél, az e heti feladat. Innen már személyre szabott útvonalon megy tovább."
          : "Most SaaS products have one onboarding flow, designed for the average user, which means it fits no one particularly well. A decision flow reads context first: role, goal, what they need to solve this week. From there, the path is theirs."}
      </p>
    ),
    visualLabel:
      lang === "hu"
        ? "[Visual placeholder: felhasználói kontextusból célzott termékútvonal]"
        : "[Visual placeholder: user context mapping to a specific product path]",
  },
  {
    key: "guide",
    eyebrow: lang === "hu" ? "Irányítás" : "Guide",
    title:
      lang === "hu"
        ? "Aki az első napon rossz csomagot választ, ritkán upgradel. Inkább lemond."
        : "A user who picks the wrong plan on day one rarely upgrades. They cancel.",
    body: (
      <p className={s.prose}>
        {lang === "hu"
          ? "A pricing oldal megmutatja, mi van az egyes csomagokban, de nem mondja meg, melyik illik az adott helyzethez. A felhasználó tippel, a rossz illeszkedés csendben felhalmozódik, és mire ez nyilvánvaló, már eldöntötte, hogy a termék nem neki való."
          : "Pricing pages show what each plan includes. They do not show which one fits a specific situation. The user makes a reasonable guess, the misalignment compounds quietly, and by the time they realise it, they have already decided the product is not for them."}
      </p>
    ),
    visualLabel:
      lang === "hu"
        ? "[Visual placeholder: irányított csomagválasztás felhasználói helyzet alapján]"
        : "[Visual placeholder: guided plan selection based on user situation]",
  },
  {
    key: "onboard",
    eyebrow: lang === "hu" ? "Onboarding" : "Onboard",
    title:
      lang === "hu"
        ? "A terméken belüli első öt döntés dönti el, marad-e a felhasználó."
        : "The first five decisions inside your product determine whether a user stays.",
    body: (
      <p className={s.prose}>
        {lang === "hu"
          ? "Az aktiváció nem tutorial-kérdés, hanem döntési kérdés. Aki végigmegy az onboardingon, de rossz use case-szel indul vagy kihagy egy kritikus beállítást, technikailag végzett, mégis rossz úton jár."
          : "Activation is not a tutorial problem. It is a decision problem. A user who completes onboarding but starts with the wrong use case or skips a configuration that mattered for their workflow has technically finished and is already on the wrong path."}
      </p>
    ),
    visualLabel:
      lang === "hu"
        ? "[Visual placeholder: onboarding decision flow a megfelelő első lépésre terelve]"
        : "[Visual placeholder: onboarding decision flow routing to the right first action]",
  },
  {
    key: "insight",
    eyebrow: lang === "hu" ? "Insight" : "Insight",
    title:
      lang === "hu"
        ? "A churn adat megmutatja, mikor mentek el. A decision flow megmutatja, hol vesztek el."
        : "Your churn data tells you when users left. A decision flow tells you where they got lost.",
    body: (
      <p className={s.prose}>
        {lang === "hu"
          ? "A lemondási kérdőívek azt mutatják, mi történt a végén. Azt nem, hogy három héttel korábban melyik döntés vitte rossz setup-útra a felhasználót. A Questell flow minden lépése ilyen strukturált adatot ad."
          : "Cancellation surveys show what happened at the end. They do not show the decision three weeks earlier where the user chose the wrong setup path and never recovered. Every step in a Questell flow generates structured data that maps exactly that."}
      </p>
    ),
    visualLabel:
      lang === "hu"
        ? "[Visual placeholder: döntési útvonal adatokból korai churn jelek]"
        : "[Visual placeholder: decision path data revealing early churn signals]",
  },
  {
    key: "convert",
    eyebrow: lang === "hu" ? "Konverzió" : "Convert",
    title:
      lang === "hu"
        ? "Akit biztosítasz arról, hogy jó úton jár, azt nem kell győzködni az upgrade-ről."
        : "A user who knows they are on the right path does not need to be convinced to upgrade.",
    body: (
      <p className={s.prose}>
        {lang === "hu"
          ? "A SaaS konverzió ritkán a CTA-n múlik. Inkább azon, eljutott-e a felhasználó oda, ahol a termék a saját helyzetében is bizonyította az értékét. A decision flow ezt a bizalmat építi fel lépésről lépésre."
          : "Conversion inside a SaaS product is rarely about the CTA. It is about whether the user has reached a point where the product has proven its value for their specific situation. The decision flow builds that confidence across every step that came before."}
      </p>
    ),
    visualLabel:
      lang === "hu"
        ? "[Visual placeholder: irányított döntési úton upgrade pillanat]"
        : "[Visual placeholder: user reaching upgrade moment through guided decision path]",
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
        <h2 id={`saas-${block.key}`} className={s.sectionHeading}>
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
      aria-labelledby={`saas-${block.key}`}
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

export default function SaasPage() {
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
        className={[s.zigzagSection, s.heroAg, revealById.hero && s.isVisible].filter(Boolean).join(" ")}
        data-reveal
        data-reveal-id="hero"
        aria-labelledby="saas-hero-heading"
      >
        <div className={s.sectionInner}>
          <div className={s.agZigzagRow}>
            <div className={s.zigzagText}>
              <p className={s.eyebrow}>SaaS</p>
              <h1 id="saas-hero-heading" className={s.heroTitle}>
                {lang === "hu"
                  ? "A lemorzsolódók többsége már azelőtt elveszik, hogy értéket kapna."
                  : "Most users who churn were lost before they ever reached value."}
              </h1>
              <div className={s.heroLeadStack}>
                <p className={s.lead}>
                  {lang === "hu"
                    ? "Regisztrálnak, hoznak pár korai döntést, majd olyan útra kerülnek, ami nem nekik való:"
                    : "They signed up, made a few early decisions, and ended up on a path that did not fit:"}
                </p>
                <ul className={s.heroBullets}>
                  <li>{lang === "hu" ? "rossz setup útvonal szerepkör/cél szerint" : "wrong setup path for their role and goal"}</li>
                  <li>
                    {lang === "hu"
                      ? "korai termékdöntések, amik fokozódó súrlódást okoznak"
                      : "early product choices that compound into friction"}
                  </li>
                  <li>
                    {lang === "hu"
                      ? "nincs irányítás ahhoz a termékrészhez, ami tényleg nekik való"
                      : "no guidance to the part of the product that is actually theirs"}
                  </li>
                </ul>
                <p className={s.lead}>
                  {lang === "hu"
                    ? "A Questell ezt az irányítást építi be: egy decision layer, ami olvassa, mit akar elérni a felhasználó, és ennek megfelelően tereli, mielőtt a rossz útvonal szokássá válna."
                    : "Questell builds that guidance in: a decision layer that reads what each user is trying to accomplish and routes them accordingly, before the wrong path becomes a habit."}
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
                    ? "[Visual placeholder: decision layer, ami első látogatástól értékig vezeti a felhasználót]"
                    : "[Visual placeholder: decision layer guiding users from first visit to value]"
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
        aria-labelledby="saas-final"
      >
        <div className={s.sectionInner}>
          <div className={s.ctaPanel}>
            <h2 id="saas-final" className={s.finalStatement}>
              {lang === "hu"
                ? "A lemorzsolódók nem rossz felhasználók voltak. Csak nem találták meg a nekik való útvonalat."
                : "The users who churn were not the wrong users. They were the right users who never found the right path."}
            </h2>
            <p className={s.finalLead}>
              {lang === "hu"
                ? "Feltérképezzük a terméklogikádat, és felépítjük az első irányított flow-t egy élő oldalon, hogy a felhasználók találgatás helyett értékig jussanak."
                : "We map your product logic and build the first guided decision flow on a live page, so users stop guessing and start reaching value."}
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
