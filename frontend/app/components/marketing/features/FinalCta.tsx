import Link from "next/link";
import s from "./featuresMarketing.module.scss";

export type FinalCtaData = {
  title: string;
  body: string;
  primaryCta: { href: string; label: string };
  secondaryCta?: { href: string; label: string };
};

export default function FinalCta({ data }: { data: FinalCtaData }) {
  const secondaryCta = (
    data as FinalCtaData & {
      secondaryCta?: { href: string; label: string };
    }
  ).secondaryCta;

  return (
    <section className={s.finalCta} aria-labelledby="features-final-cta-title">
      <div>
        <h2 id="features-final-cta-title" className={s.sectionTitle}>
          {data.title}
        </h2>
        <p className={s.finalCtaBody}>{data.body}</p>
        <div className={s.heroActions}>
          <Link href={data.primaryCta.href} className={s.btnPrimary}>
            {data.primaryCta.label}
          </Link>
          {secondaryCta ? (
            <Link href={secondaryCta.href} className={s.btnSecondary}>
              {secondaryCta.label}
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
