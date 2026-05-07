import s from "./featuresMarketing.module.scss";

export type TrustData = { title: string; subtitle?: string };

export default function TrustSection({ data }: { data: TrustData }) {
  return (
    <section className={`${s.section} ${s.trustSection}`} aria-labelledby="features-trust-title">
      <div className={s.trustInlineWrap}>
        <div className={s.trustInlineInner}>
          <h2 id="features-trust-title" className={s.sectionTitle}>
            {data.title}
          </h2>
          {data.subtitle ? <p className={s.sectionSubtitle}>{data.subtitle}</p> : null}
        </div>
      </div>
    </section>
  );
}
