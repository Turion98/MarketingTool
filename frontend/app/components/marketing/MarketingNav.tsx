"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  MARKETING_NAV_INDUSTRIES,
  MARKETING_NAV_PRODUCT,
  MARKETING_NAV_USE_CASES,
} from "@/config/marketingPages";
import type { PresentLang } from "@/app/present/presentDeck.types";
import {
  notifyPresentLangChanged,
  PRESENT_LANG_CHANGED_EVENT,
  readPresentLangFromStorage,
  writePresentLangToStorage,
} from "@/app/present/presentLangSync";
import s from "./MarketingNav.module.scss";

type DropdownId = "product" | "industries" | "useCases" | null;

function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  onOutside: () => void,
  active: boolean
) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onOutside();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [active, onOutside, ref]);
}

export default function MarketingNav() {
  const pathname = usePathname();
  const [openDropdown, setOpenDropdown] = useState<DropdownId>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [lang, setLang] = useState<PresentLang>("hu");
  const wrapRef = useRef<HTMLDivElement>(null);

  const closeAll = useCallback(() => {
    setOpenDropdown(null);
  }, []);

  useClickOutside(wrapRef, closeAll, openDropdown !== null);

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
    setOpenDropdown(null);
  }, [pathname]);

  const setLangPersist = useCallback((next: PresentLang) => {
    setLang(next);
    writePresentLangToStorage(next);
    notifyPresentLangChanged(next);
  }, []);

  const toggleDropdown = (id: Exclude<DropdownId, null>) => {
    setOpenDropdown((cur) => (cur === id ? null : id));
  };

  const dropdownItemClass = (href: string) =>
    pathname === href ? `${s.dropdownLink} ${s.dropdownLinkActive}` : s.dropdownLink;

  return (
    <header className={s.header}>
      <div className={s.inner} ref={wrapRef}>
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
          <div className={s.dropdownWrap}>
            <button
              type="button"
              className={s.dropdownTrigger}
              aria-expanded={openDropdown === "product"}
              aria-haspopup="true"
              onClick={() => toggleDropdown("product")}
            >
              Product <span className={s.chevron}>▾</span>
            </button>
            {openDropdown === "product" ? (
              <div className={s.dropdownPanel} role="menu">
                {MARKETING_NAV_PRODUCT.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={dropdownItemClass(item.href)}
                    role="menuitem"
                    onClick={closeAll}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>

          <div className={s.dropdownWrap}>
            <button
              type="button"
              className={s.dropdownTrigger}
              aria-expanded={openDropdown === "industries"}
              aria-haspopup="true"
              onClick={() => toggleDropdown("industries")}
            >
              Industries <span className={s.chevron}>▾</span>
            </button>
            {openDropdown === "industries" ? (
              <div className={s.dropdownPanel} role="menu">
                {MARKETING_NAV_INDUSTRIES.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={dropdownItemClass(item.href)}
                    role="menuitem"
                    onClick={closeAll}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>

          <div className={s.dropdownWrap}>
            <button
              type="button"
              className={s.dropdownTrigger}
              aria-expanded={openDropdown === "useCases"}
              aria-haspopup="true"
              onClick={() => toggleDropdown("useCases")}
            >
              Use cases <span className={s.chevron}>▾</span>
            </button>
            {openDropdown === "useCases" ? (
              <div className={s.dropdownPanel} role="menu">
                {MARKETING_NAV_USE_CASES.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={dropdownItemClass(item.href)}
                    role="menuitem"
                    onClick={closeAll}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>

          <Link href="/pricing" className={s.topLink}>
            Pricing
          </Link>
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
          <div>
            <p className={s.mobileGroupTitle}>Product</p>
            <div className={s.mobileLinks}>
              {MARKETING_NAV_PRODUCT.map((item) => (
                <Link key={item.href} href={item.href} className={s.mobileLink}>
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
          <div>
            <p className={s.mobileGroupTitle}>Industries</p>
            <div className={s.mobileLinks}>
              {MARKETING_NAV_INDUSTRIES.map((item) => (
                <Link key={item.href} href={item.href} className={s.mobileLink}>
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
          <div>
            <p className={s.mobileGroupTitle}>Use cases</p>
            <div className={s.mobileLinks}>
              {MARKETING_NAV_USE_CASES.map((item) => (
                <Link key={item.href} href={item.href} className={s.mobileLink}>
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
          <div className={s.mobileLinks}>
            <Link href="/pricing" className={s.mobileLink}>
              Pricing
            </Link>
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
