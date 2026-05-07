import Link from "next/link";
import VisualPlaceholder from "./VisualPlaceholder";
import s from "./featuresMarketing.module.scss";

export type FeatureHeroData = {
  eyebrow: string;
  headline: string;
  subheadline: string;
  bullets?: string[];
  supporting: string;
  primaryCta: { href: string; label: string };
  secondaryCta?: { href: string; label: string };
  heroVisualLabel: string;
};

export default function FeatureHero({ data }: { data: FeatureHeroData }) {
  const secondaryCta = (
    data as FeatureHeroData & {
      secondaryCta?: { href: string; label: string };
    }
  ).secondaryCta;
  const bullets = (
    data as FeatureHeroData & {
      bullets?: string[];
    }
  ).bullets;

  const headline = String(data.headline || "");
  const firstDot = headline.indexOf(".");
  const headlineNode =
    firstDot > -1 ? (
      <>
        {headline.slice(0, firstDot + 1)}
        <br />
        {headline.slice(firstDot + 1).trimStart()}
      </>
    ) : (
      headline
    );

  return (
    <header className={s.hero}>
      <div>
        <p className={s.eyebrow}>{data.eyebrow}</p>
        <h1 className={s.headline}>{headlineNode}</h1>
        <p className={s.subheadline}>{data.subheadline}</p>
        {Array.isArray(bullets) && bullets.length > 0 ? (
          <ul className={s.heroBullets}>
            {bullets.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
        <p className={s.supporting}>{data.supporting}</p>
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
      <VisualPlaceholder label={data.heroVisualLabel} variant="hero" />
    </header>
  );
}
