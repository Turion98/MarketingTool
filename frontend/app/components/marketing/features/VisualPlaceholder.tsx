import s from "./featuresMarketing.module.scss";

export type VisualVariant = "hero" | "wide" | "cta";

export default function VisualPlaceholder({
  label,
  variant = "wide",
}: {
  label: string;
  variant?: VisualVariant;
}) {
  const cls = [
    s.visual,
    variant === "hero" && s.visualHero,
    variant === "wide" && s.visualWide,
    variant === "cta" && s.visualCta,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cls} role="img" aria-label={label}>
      <div className={s.visualMockChrome} aria-hidden>
        <span className={s.visualMockDot} />
        <span className={s.visualMockDot} />
        <span className={s.visualMockDot} />
      </div>
      <div className={s.visualInner}>
        <p className={s.visualLabel}>{label}</p>
      </div>
    </div>
  );
}
