import Link from "next/link";
import type { SupportEngineCopy, Step } from "./supportEngineContent";
import { SUPPORT_ENGINE_LINKS } from "./supportEngineContent";
import s from "./supportEngine.module.scss";

/** §1 — Hero. A CTA a lenti demó-szekcióra görget (anchor). */
export function SupportHero({ copy }: { copy: SupportEngineCopy["hero"] }) {
  return (
    <header className={s.hero}>
      <p className={s.eyebrow}>{copy.eyebrow}</p>
      <h1 className={s.headline}>{copy.headline}</h1>
      <p className={s.subtitle}>{copy.subtitle}</p>
      <a href={SUPPORT_ENGINE_LINKS.demoAnchor} className={s.heroCta}>
        {copy.cta}
        <span aria-hidden="true"> ↓</span>
      </a>
    </header>
  );
}

/** §2 — Mit építettem és miért. Tördelt: lead → pull-quote → intro → (szöveg | kód) → útjelző. */
export function SupportWhy({ copy }: { copy: SupportEngineCopy["why"] }) {
  return (
    <section className={s.section} aria-labelledby="why-title">
      <div className={s.sectionHead}>
        <h2 id="why-title" className={s.sectionTitle}>
          {copy.title}
        </h2>
        <div className={s.sectionBar} aria-hidden="true" />
      </div>

      <p className={s.whyLead}>{copy.lead}</p>
      <blockquote className={s.pullQuote}>{copy.thesis}</blockquote>
      <p className={s.whyPara}>{copy.intro}</p>

      <div className={s.whyEvidence}>
        <p className={s.whyPara}>{copy.control}</p>
        <figure className={`${s.codeCard} ${s.codeCardInEvidence}`}>
          <figcaption className={s.codeCardLabel}>{copy.artifact.label}</figcaption>
          <pre className={s.codeCardPre}>
            <code>{copy.artifact.code}</code>
          </pre>
        </figure>
      </div>

      <p className={s.whySignpost}>{copy.signpost}</p>
    </section>
  );
}

/** §3 — Ekkora a szabálykönyv. A számok emberi léptékre fordítva, referenciaponttal. */
export function SupportProof({ copy }: { copy: SupportEngineCopy["proof"] }) {
  return (
    <section className={s.proof} aria-label="Ekkora a szabálykönyv">
      <p className={s.proofCaption}>{copy.caption}</p>
      <div className={s.proofGrid}>
        {copy.stats.map((stat) => (
          <div key={stat.value} className={s.proofTile}>
            <span className={s.proofValue}>{stat.value}</span>
            <span className={s.proofLabel}>{stat.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Numbered stepper rail — a §4 és §6 közös vizuális eleme. */
function StepRail({ steps }: { steps: Step[] }) {
  return (
    <ol className={s.stepper}>
      {steps.map((step) => (
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
  );
}

/** §4 — Mi történik, amikor az ügyfél ír (lépcsős pipeline). */
export function SupportTurnCycle({
  copy,
}: {
  copy: SupportEngineCopy["turnCycle"];
}) {
  return (
    <section className={s.section} aria-labelledby="turn-cycle-title">
      <div className={s.sectionHead}>
        <h2 id="turn-cycle-title" className={s.sectionTitle}>
          {copy.title}
        </h2>
        <div className={s.sectionBar} aria-hidden="true" />
      </div>
      {copy.lead ? <p className={s.sectionLead}>{copy.lead}</p> : null}
      <StepRail steps={copy.steps} />
      {copy.outro ? <p className={s.turnOutro}>{copy.outro}</p> : null}
    </section>
  );
}

/** §6 — Hogyan készül egy szabálykönyv (fázis-lépcső). */
export function SupportBuildPipeline({
  copy,
}: {
  copy: SupportEngineCopy["buildPipeline"];
}) {
  return (
    <section className={s.section} aria-labelledby="build-pipeline-title">
      <div className={s.sectionHead}>
        <h2 id="build-pipeline-title" className={s.sectionTitle}>
          {copy.title}
        </h2>
        <div className={s.sectionBar} aria-hidden="true" />
      </div>
      {copy.lead ? <p className={s.sectionLead}>{copy.lead}</p> : null}
      <p className={s.phasesCaption}>{copy.phasesCaption}</p>
      <StepRail steps={copy.phases} />
      <Link href={SUPPORT_ENGINE_LINKS.onboardingDemoHref} className={s.pipelineCta}>
        {copy.cta}
        <span aria-hidden="true"> →</span>
      </Link>
    </section>
  );
}

/** §7 — Zárás. Repo + Kapcsolat linkek. */
export function SupportClosing({
  copy,
}: {
  copy: SupportEngineCopy["closing"];
}) {
  return (
    <section className={s.closing} aria-label="Zárás">
      <p className={s.closingText}>{copy.text}</p>
      <p className={s.closingLinks}>
        <a href={SUPPORT_ENGINE_LINKS.repoUrl} className={s.closingLink}>
          {copy.repoLabel}
        </a>
        <span className={s.dot} aria-hidden="true">
          {" · "}
        </span>
        <a href={SUPPORT_ENGINE_LINKS.contactHref} className={s.closingLink}>
          {copy.contactLabel}
        </a>
      </p>
    </section>
  );
}
