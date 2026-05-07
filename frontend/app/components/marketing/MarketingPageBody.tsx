import Link from "next/link";
import type { MarketingPageConfig, MarketingPageTemplate } from "@/config/marketingPages";
import {
  MARKETING_PAGE_EXAMPLE_PLACEHOLDERS,
  MARKETING_PLACEHOLDER_EXPLAINS,
  MARKETING_PLACEHOLDER_PROBLEM,
} from "@/config/marketingPages";
import s from "./marketingPage.module.scss";

const TEMPLATE_LABEL: Record<MarketingPageTemplate, string> = {
  marketing: "Marketing page",
  industry: "Industry",
  "use-case": "Use case",
  resource: "Resource",
};

export interface MarketingPageBodyProps {
  config: MarketingPageConfig;
  /** Which template wrapper is rendering (for a small structural label). */
  template: MarketingPageTemplate;
}

export default function MarketingPageBody({ config, template }: MarketingPageBodyProps) {
  return (
    <article className={s.page}>
      <p className={s.templateTag}>{TEMPLATE_LABEL[template]}</p>

      <header className={s.hero}>
        <p className={s.eyebrow}>{config.heroEyebrow}</p>
        <h1 className={s.title}>{config.heroTitle}</h1>
        <p className={s.subtitle}>{config.heroSubtitle}</p>
      </header>

      <section className={s.section} aria-labelledby="mkt-problem">
        <h2 id="mkt-problem" className={s.sectionTitle}>
          Problem / context
        </h2>
        <p className={s.sectionBody}>{MARKETING_PLACEHOLDER_PROBLEM}</p>
      </section>

      <section className={s.section} aria-labelledby="mkt-explains">
        <h2 id="mkt-explains" className={s.sectionTitle}>
          What this page explains
        </h2>
        <p className={s.sectionBody}>{MARKETING_PLACEHOLDER_EXPLAINS}</p>
      </section>

      <section className={s.section} aria-labelledby="mkt-benefits">
        <h2 id="mkt-benefits" className={s.sectionTitle}>
          Key benefits
        </h2>
        <p className={s.sectionBody}>Placeholder list — final proof points will replace these.</p>
        <ul className={s.bullets}>
          {config.bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      </section>

      <section className={s.section} aria-labelledby="mkt-examples">
        <h2 id="mkt-examples" className={s.sectionTitle}>
          Example use cases
        </h2>
        <p className={s.sectionBody}>Placeholder scenarios — copy and concrete examples will follow.</p>
        <ul className={s.examplesList}>
          {MARKETING_PAGE_EXAMPLE_PLACEHOLDERS.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>

      <section className={s.cta} aria-labelledby="mkt-cta">
        <h2 id="mkt-cta" className={s.srOnly}>
          Call to action
        </h2>
        <p className={s.ctaText}>Placeholder CTA — next step for visitors after reading this page.</p>
        <Link href={config.ctaHref} className={s.ctaLink}>
          {config.ctaLabel}
        </Link>
      </section>
    </article>
  );
}
