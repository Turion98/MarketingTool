import type { Metadata } from "next";
import Link from "next/link";
import s from "./onboardingShell.module.scss";

export const metadata: Metadata = {
  title: { default: "Tudásbázis felépítése", template: "%s | Questell" },
  description:
    "Néhány perc alatt összegyűjtjük a support tudásbázisod alapadatait. Töltsd ki a 6 lépéses kérdőívet.",
};

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={s.shell}>
      <header className={s.topbar}>
        <Link href="/" className={s.brand}>
          <span className={s.brandMark} aria-hidden="true">
            Q
          </span>
          <span className={s.brandName}>Questell</span>
        </Link>
        <div className={s.topbarMeta}>
          <span className={s.topbarHint}>
            6 lépéses gyors kérdőív · tudásbázis intake
          </span>
          <Link href="/" className={s.topbarExit}>
            Mégse, vissza a főoldalra
          </Link>
        </div>
      </header>
      <main className={s.main}>{children}</main>
    </div>
  );
}
