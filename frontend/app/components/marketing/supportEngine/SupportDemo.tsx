import type { SupportEngineCopy } from "./supportEngineContent";
import { SUPPORT_ENGINE_LINKS } from "./supportEngineContent";
import EmbeddedSupportDemo from "./EmbeddedSupportDemo";
import s from "./supportEngine.module.scss";

/**
 * §5 — „Ne olvasd. Törd el." A hero CTA ide görget (`id="demo"`).
 * A beágyazott, újratervezett demó (`EmbeddedSupportDemo`) a §5 törzse alá kerül.
 */
export default function SupportDemo({
  copy,
}: {
  copy: SupportEngineCopy["demo"];
}) {
  return (
    <section id="demo" className={`${s.section} ${s.demoSection}`} aria-labelledby="demo-title">
      <div className={s.sectionHead}>
        <h2 id="demo-title" className={`${s.sectionTitle} ${s.demoTitle}`}>
          {copy.title}
        </h2>
        <div className={s.sectionBar} aria-hidden="true" />
      </div>
      <p className={s.sectionLead}>{copy.intro}</p>

      <p className={s.tryLabel}>{copy.tryLabel}</p>
      <div className={s.tryGrid}>
        {copy.tryIts.map((item, i) => (
          <div key={i} className={s.tryCard}>
            <p className={s.tryPrompt}>
              <span className={s.tryQuote} aria-hidden="true">
                &ldquo;
              </span>
              {item.prompt}
            </p>
            <p className={s.tryOutcome}>{item.outcome}</p>
          </div>
        ))}
      </div>

      <EmbeddedSupportDemo />

      <p className={s.bugLine}>
        {copy.bugLine}{" "}
        <a href={SUPPORT_ENGINE_LINKS.contactHref} className={s.inlineLink}>
          {copy.contactLabel}
        </a>
      </p>
    </section>
  );
}
