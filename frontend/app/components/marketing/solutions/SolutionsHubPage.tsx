"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  PRESENT_LANG_CHANGED_EVENT,
  readPresentLangFromStorage,
} from "@/app/present/presentLangSync";
import s from "./solutionsHub.module.scss";

type UiLang = "en" | "hu";

const COPY = {
  en: {
    title: "How decision flows are used",
    subtitle: "Choose a use case to explore how Questell works in real scenarios.",
    cards: [
      {
        href: "/product-finder",
        title: "Product finder",
        line: "Guide users to the right product based on how their answers combine.",
      },
      {
        href: "/package-selection",
        title: "Package selection",
        line: "Help buyers choose the right tier with clear trade-offs and less hesitation.",
      },
      {
        href: "/campaign-flows",
        title: "Campaign flows",
        line: "Turn campaign traffic into guided decisions that end at a specific outcome.",
      },
      {
        href: "/onboarding-flows",
        title: "Onboarding flows",
        line: "Guide new users to the right starting path before confusion becomes drop-off.",
      },
    ],
  },
  hu: {
    title: "Hogyan használhatók a döntési flow-k",
    subtitle: "Válassz use case-t, és nézd meg, hogyan működik a Questell valós helyzetekben.",
    cards: [
      {
        href: "/product-finder",
        title: "Termékajánló",
        line: "A felhasználót a megfelelő termékhez vezeti az alapján, ahogy a válaszok együtt értelmezhetők.",
      },
      {
        href: "/package-selection",
        title: "Csomagválasztás",
        line: "Segít kiválasztani a megfelelő csomagot tiszta trade-offokkal és kevesebb bizonytalansággal.",
      },
      {
        href: "/campaign-flows",
        title: "Kampány flow-k",
        line: "A kampányforgalmat irányított döntésekké alakítja, amelyek konkrét kimenethez vezetnek.",
      },
      {
        href: "/onboarding-flows",
        title: "Onboarding flow-k",
        line: "Az új felhasználókat a megfelelő kezdőútra tereli, mielőtt a bizonytalanság lemorzsolódássá válna.",
      },
    ],
  },
} as const;

export default function SolutionsHubPage() {
  const [lang, setLang] = useState<UiLang>("en");

  useEffect(() => {
    const saved = readPresentLangFromStorage();
    if (saved) setLang(saved);

    const onLangChanged = (ev: Event) => {
      const detail = (ev as CustomEvent<{ lang?: UiLang }>).detail;
      const next = detail?.lang;
      if (next === "hu" || next === "en") setLang(next);
    };
    window.addEventListener(PRESENT_LANG_CHANGED_EVENT, onLangChanged as EventListener);
    return () =>
      window.removeEventListener(PRESENT_LANG_CHANGED_EVENT, onLangChanged as EventListener);
  }, []);

  const copy = COPY[lang];

  return (
    <div className={s.page}>
      <header className={s.hero}>
        <h1 className={s.title}>{copy.title}</h1>
        <p className={s.subtitle}>{copy.subtitle}</p>
      </header>
      <div className={s.grid}>
        {copy.cards.map((item) => (
          <Link key={item.href} href={item.href} className={s.card}>
            <div className={s.cardFx} aria-hidden>
              <div className={s.cardTrap}>
                <h2 className={s.cardTitle}>{item.title}</h2>
                <p className={s.cardLine}>{item.line}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
