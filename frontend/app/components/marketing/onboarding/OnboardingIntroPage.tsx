"use client";

import { useLang } from "../useLang";
import { getOnboardingCopy } from "./onboardingContent";
import OnboardingFormGate from "./OnboardingFormGate";
import s from "./onboarding.module.scss";

export default function OnboardingIntroPage() {
  const lang = useLang("hu");
  const copy = getOnboardingCopy(lang);

  return (
    <article className={s.page}>
      <div className={s.container}>
        <header className={s.hero}>
          <p className={s.eyebrow}>{copy.eyebrow}</p>
          <h1 className={s.title}>{copy.title}</h1>
          <p className={s.lead}>{copy.lead}</p>
        </header>

        <section className={s.section} aria-label={copy.stepsCaption}>
          <p className={s.stepsCaption}>{copy.stepsCaption}</p>
          <ol className={s.stepper}>
            {copy.steps.map((step) => (
              <li key={step.n} className={s.step}>
                <div className={s.stepRail} aria-hidden="true">
                  <span className={s.stepNum}>{step.n}</span>
                </div>
                <div className={s.stepContent}>
                  <div className={s.stepHead}>
                    <span className={s.stepLabel}>{step.label}</span>
                    <div className={s.chipRow}>
                      {step.chips.map((chip) => (
                        <span key={chip} className={s.chip}>
                          {chip}
                        </span>
                      ))}
                    </div>
                  </div>
                  <p className={s.stepBody}>{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className={s.meta} aria-label={copy.meta.caption}>
          <p className={s.metaCaption}>{copy.meta.caption}</p>
          <div className={s.metaGrid}>
            {copy.meta.stats.map((stat) => (
              <div key={stat.value} className={s.metaTile}>
                <span className={s.metaValue}>{stat.value}</span>
                <span className={s.metaLabel}>{stat.label}</span>
              </div>
            ))}
          </div>
          <p className={s.metaKeyNote}>{copy.meta.keyNote}</p>
        </section>

        <OnboardingFormGate copy={copy.formGate} />

        <p className={s.signpost}>{copy.signpost}</p>
      </div>
    </article>
  );
}
