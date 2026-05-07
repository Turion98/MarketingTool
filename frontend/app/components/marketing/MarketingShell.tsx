import type { ReactNode } from "react";
import MarketingNav from "./MarketingNav";
import s from "./MarketingShell.module.scss";

export default function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <div className={s.shell}>
      <MarketingNav />
      <main className={s.main}>{children}</main>
    </div>
  );
}
