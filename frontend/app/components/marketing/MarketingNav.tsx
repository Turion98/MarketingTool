"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { MARKETING_NAV_LINKS } from "@/config/marketingPages";
import type { PresentLang } from "@/app/present/presentDeck.types";
import {
  notifyPresentLangChanged,
  PRESENT_LANG_CHANGED_EVENT,
  readPresentLangFromStorage,
  writePresentLangToStorage,
} from "@/app/present/presentLangSync";
import s from "./MarketingNav.module.scss";

export default function MarketingNav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [lang, setLang] = useState<PresentLang>("hu");

  useEffect(() => {
    const saved = readPresentLangFromStorage();
    if (saved) setLang(saved);
  }, []);

  useEffect(() => {
    const onLang = (e: Event) => {
      const ce = e as CustomEvent<{ lang?: PresentLang }>;
      const v = ce.detail?.lang;
      if (v === "hu" || v === "en") setLang(v);
    };
    window.addEventListener(PRESENT_LANG_CHANGED_EVENT, onLang);
    return () => window.removeEventListener(PRESENT_LANG_CHANGED_EVENT, onLang);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const setLangPersist = useCallback((next: PresentLang) => {
    setLang(next);
    writePresentLangToStorage(next);
    notifyPresentLangChanged(next);
  }, []);

  const topLinkClass = (href: string) =>
    pathname === href ? `${s.topLink} ${s.topLinkActive}` : s.topLink;

  const mobileLinkClass = (href: string) =>
    pathname === href ? `${s.mobileLink} ${s.mobileLinkActive}` : s.mobileLink;

  return (
    <header className={s.header}>
      <div className={s.inner}>
        <Link href="/present" className={s.logo} aria-label="Questell present">
          <Image
            src="/assets/my_logo_line.png"
            alt="Questell"
            width={1020}
            height={446}
            priority
            className={s.logoImage}
          />
        </Link>

        <nav className={s.navDesktop} aria-label="Primary">
          {MARKETING_NAV_LINKS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={topLinkClass(item.href)}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className={s.actions}>
          <Link href="/login" className={s.ghost}>
            Log in
          </Link>
        </div>

        <div
          className={s.langSeg}
          role="group"
          aria-label={lang === "hu" ? "Nyelv választása" : "Choose language"}
        >
          <button
            type="button"
            className={`${s.langSegBtn} ${lang === "hu" ? s.langSegBtnActive : ""}`}
            aria-pressed={lang === "hu"}
            onClick={() => setLangPersist("hu")}
          >
            HU
          </button>
          <button
            type="button"
            className={`${s.langSegBtn} ${lang === "en" ? s.langSegBtnActive : ""}`}
            aria-pressed={lang === "en"}
            onClick={() => setLangPersist("en")}
          >
            EN
          </button>
        </div>

        <div className={s.navMobileToggle}>
          <button
            type="button"
            className={s.iconButton}
            aria-expanded={mobileOpen}
            aria-controls="marketing-nav-mobile"
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? "✕" : "☰"}
          </button>
        </div>

        <div
          className={s.langSegMobile}
          role="group"
          aria-label={lang === "hu" ? "Nyelv választása" : "Choose language"}
        >
          <button
            type="button"
            className={`${s.langSegBtn} ${
              lang === "hu" ? s.langSegBtnActive : ""
            }`}
            aria-pressed={lang === "hu"}
            onClick={() => setLangPersist("hu")}
          >
            HU
          </button>
          <button
            type="button"
            className={`${s.langSegBtn} ${
              lang === "en" ? s.langSegBtnActive : ""
            }`}
            aria-pressed={lang === "en"}
            onClick={() => setLangPersist("en")}
          >
            EN
          </button>
        </div>
      </div>

      {mobileOpen ? (
        <div id="marketing-nav-mobile" className={s.mobilePanel}>
          <div className={s.mobileLinks}>
            {MARKETING_NAV_LINKS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={mobileLinkClass(item.href)}
              >
                {item.label}
              </Link>
            ))}
          </div>
          <div className={s.mobileActions}>
            <Link href="/login" className={s.ghost}>
              Log in
            </Link>
          </div>
        </div>
      ) : null}
    </header>
  );
}
