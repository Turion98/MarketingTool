"use client";

import { useEffect, useRef, useState } from "react";
import FeatureHero from "./FeatureHero";
import FeatureStepSection from "./FeatureStepSection";
import TrustSection from "./TrustSection";
import FinalCta from "./FinalCta";
import {
  FEATURES_COPY,
  UiLang,
} from "./featuresContent";
import {
  PRESENT_LANG_CHANGED_EVENT,
  readPresentLangFromStorage,
} from "@/app/present/presentLangSync";
import s from "./featuresMarketing.module.scss";

const STEP_IDS = ["define", "integrate", "guide"] as const;
type RevealKey = "hero" | "define" | "integrate" | "trust" | "guide" | "final";

function cx(...parts: (string | false | undefined | null)[]) {
  return parts.filter(Boolean).join(" ");
}

export default function FeaturesPage() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [lang, setLang] = useState<UiLang>("en");
  const [revealById, setRevealById] = useState<Partial<Record<RevealKey, boolean>>>({});

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
      define: true,
      integrate: true,
      trust: true,
      guide: true,
      final: true,
    };
    setRevealById(allVisible);
  }, []);

  const copy = FEATURES_COPY[lang];

  return (
    <div ref={rootRef} className={s.page}>
      <div
        className={cx(s.revealSection, revealById.hero && s.isVisible)}
        data-reveal
        data-reveal-id="hero"
      >
        <FeatureHero data={copy.featuresHero} />
      </div>
      {copy.featureSteps.map((step, i) => (
        <div
          key={step.stepLabel}
          className={cx(s.revealSection, revealById[STEP_IDS[i]] && s.isVisible)}
          data-reveal
          data-reveal-id={STEP_IDS[i]}
        >
          <FeatureStepSection
            data={step}
            sectionId={`step-${STEP_IDS[i]}`}
            isLastStep={i === copy.featureSteps.length - 1}
          />
          {i === 1 ? (
            <div
              className={cx(s.revealSection, revealById.trust && s.isVisible)}
              data-reveal
              data-reveal-id="trust"
            >
              <TrustSection data={copy.trustSection} />
            </div>
          ) : null}
        </div>
      ))}
      <div
        className={cx(s.revealSection, revealById.final && s.isVisible)}
        data-reveal
        data-reveal-id="final"
      >
        <FinalCta data={copy.finalCtaSection} />
      </div>
    </div>
  );
}
