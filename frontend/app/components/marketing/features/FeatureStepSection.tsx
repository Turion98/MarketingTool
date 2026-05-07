import VisualPlaceholder from "./VisualPlaceholder";
import type { FeatureCardData, StepBlock } from "./featuresContent";
import s from "./featuresMarketing.module.scss";

function FeatureCardArticle({
  card,
  className,
}: {
  card: FeatureCardData;
  className?: string;
}) {
  return (
    <article className={[s.featureCard, className].filter(Boolean).join(" ")}>
      <h3 className={s.featureCardTitle}>{card.title}</h3>
      <p className={s.featureCardSentence}>{card.sentence}</p>
      <ul className={s.featureCardList}>
        {card.bullets.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>
    </article>
  );
}

export default function FeatureStepSection({
  data,
  sectionId,
  isLastStep = false,
}: {
  data: StepBlock;
  sectionId: string;
  isLastStep?: boolean;
}) {
  const useStep1Split =
    data.visualBesideLastCard === true &&
    Boolean(data.topVisualLabel) &&
    data.cards.length === 4;

  const alignBulletRow =
    sectionId === "step-define" ||
    sectionId === "step-integrate" ||
    sectionId === "step-guide";

  return (
    <section
      id={sectionId}
      className={`${s.section} ${s.stepBlock} ${isLastStep ? s.stepBlockLast : ""}`}
      aria-labelledby={`${sectionId}-title`}
    >
      <p className={s.sectionLabel}>{data.stepLabel}</p>
      <h2 id={`${sectionId}-title`} className={s.sectionTitle}>
        {data.title}
      </h2>
      <p className={s.sectionSubtitle}>{data.subtitle}</p>
      {data.introLine ? <p className={s.stepIntro}>{data.introLine}</p> : null}
      {!useStep1Split && data.topVisualLabel ? (
        <div className={s.stepTopVisual}>
          <VisualPlaceholder label={data.topVisualLabel} variant="wide" />
        </div>
      ) : null}
      {useStep1Split && data.topVisualLabel ? (
        <div className={s.stepSurface}>
          <div className={s.step1Grid}>
            <div className={s.step1TopRow}>
              {data.cards.slice(0, 3).map((card) => (
                <FeatureCardArticle
                  key={card.title}
                  card={card}
                  className={alignBulletRow ? s.featureCardGuide : undefined}
                />
              ))}
            </div>
            <div className={s.step1Bottom}>
              <FeatureCardArticle
                card={data.cards[3]}
                className={alignBulletRow ? s.featureCardGuide : undefined}
              />
              <div className={s.step1VisualCell}>
                <VisualPlaceholder label={data.topVisualLabel} variant="wide" />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className={s.stepSurface}>
          <div className={s.cardGrid}>
            {data.cards.map((card) => (
              <FeatureCardArticle
                key={card.title}
                card={card}
                className={alignBulletRow ? s.featureCardGuide : undefined}
              />
            ))}
          </div>
          {data.closingLine ? <p className={s.stepClosing}>{data.closingLine}</p> : null}
        </div>
      )}
      {data.visualLabel ? (
        <VisualPlaceholder label={data.visualLabel} variant="wide" />
      ) : null}
    </section>
  );
}
