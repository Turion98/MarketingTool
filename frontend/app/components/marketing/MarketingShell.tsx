 "use client";

import { useEffect, useRef, type ReactNode } from "react";
import MarketingNav from "./MarketingNav";
import s from "./MarketingShell.module.scss";

export default function MarketingShell({ children }: { children: ReactNode }) {
  const shellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const body = document.body;
    const prevBackground = body.style.background;
    const prevBackgroundColor = body.style.backgroundColor;
    const nextBackground =
      shellRef.current != null
        ? getComputedStyle(shellRef.current).backgroundColor
        : "rgb(230, 230, 230)";

    body.style.background = nextBackground;
    body.style.backgroundColor = nextBackground;

    return () => {
      body.style.background = prevBackground;
      body.style.backgroundColor = prevBackgroundColor;
    };
  }, []);

  return (
    <div ref={shellRef} className={s.shell} data-marketing-shell="true">
      <MarketingNav />
      <main className={s.main}>{children}</main>
    </div>
  );
}
