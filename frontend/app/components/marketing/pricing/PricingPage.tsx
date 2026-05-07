"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  PRESENT_LANG_CHANGED_EVENT,
  readPresentLangFromStorage,
} from "@/app/present/presentLangSync";
import s from "./pricingPage.module.scss";

type UiLang = "en" | "hu";

const PRICING_COPY = {
  en: {
    heroTitle: "Simple pricing. One starting point.",
    heroLead:
      "Start with a flow that is built, embedded, and live on a real page. When it runs, pick the plan that fits.",
    pricingPlansAria: "Pricing plans",
    planLabel: "Plan",
    comingSoon: "Coming soon",
    firstFlowTitle: "The first flow is available now.",
    firstFlowBody:
      "We map the decision logic, build the flow, and embed it on a live page. You see how users move through it before committing to a monthly plan.",
    firstFlowPrice: "€179 one-time, then €59/mo if you continue.",
    requestFirstFlow: "Request your first flow",
    comparisonTitle: "Plan comparison",
    featureCol: "Feature",
    faqTitle: "Frequently asked questions",
    finalTitle: "The first flow is the fastest way to see if this works for you.",
    plans: [
      {
        name: "Starter",
        price: "€59/mo",
        desc: "For teams running one or two active flows.",
        stats: ["2 active links", "5 projects"],
        features: [
          "Analytics: completion rate, path data, drop-off points",
          "Embed: iframe and script loader",
          "Ghost mode",
        ],
        highlight: false,
      },
      {
        name: "Growth",
        price: "€119/mo",
        desc: "For teams scaling across multiple clients or campaigns.",
        stats: ["5 active links", "10 projects"],
        features: [
          "Analytics: full decision path, intent segmentation",
          "Embed: iframe and script loader",
          "Ghost mode",
          "Signed embed access",
          "Priority support",
        ],
        highlight: true,
      },
      {
        name: "Scale",
        price: "€199/mo",
        desc: "For agencies managing flows across many sites.",
        stats: ["Unlimited active links", "Unlimited projects"],
        features: [
          "Analytics: full decision path, intent segmentation, cross-site",
          "Embed: iframe and script loader",
          "Ghost mode",
          "Signed embed access",
          "Multi-site deploy",
          "Dedicated support",
        ],
        highlight: false,
      },
    ],
    comparison: [
      {
        feature: "Active links",
        desc: "Embed URLs currently live on a page at the same time.",
        starter: "2",
        growth: "5",
        scale: "Unlimited",
      },
      {
        feature: "Projects",
        desc: "Flows saved in your dashboard, published or in progress.",
        starter: "5",
        growth: "10",
        scale: "Unlimited",
      },
      {
        feature: "Completion rate",
        desc: "Share of users who reach a final outcome in the flow.",
        starter: "✓",
        growth: "✓",
        scale: "✓",
      },
      {
        feature: "Path analytics",
        desc: "Decision path data showing how users move through each step.",
        starter: "✓",
        growth: "✓",
        scale: "✓",
      },
      {
        feature: "Intent segmentation",
        desc: "Group users by decision pattern and revealed intent.",
        starter: "—",
        growth: "✓",
        scale: "✓",
      },
      {
        feature: "Cross-site analytics",
        desc: "Unified data across flows running on multiple domains.",
        starter: "—",
        growth: "—",
        scale: "✓",
      },
      {
        feature: "Ghost mode",
        desc: "The flow inherits the host page design with no visible third-party frame.",
        starter: "✓",
        growth: "✓",
        scale: "✓",
      },
      {
        feature: "Signed embed",
        desc: "Token-protected access with origin restrictions and instant revocation.",
        starter: "—",
        growth: "✓",
        scale: "✓",
      },
      {
        feature: "Multi-site deploy",
        desc: "Deploy and manage flows across multiple client domains from one account.",
        starter: "—",
        growth: "—",
        scale: "✓",
      },
      {
        feature: "Support",
        desc: "How you reach us when something needs attention.",
        starter: "Email",
        growth: "Priority",
        scale: "Dedicated",
      },
    ],
    faqs: [
      {
        q: "What is an active link?",
        a: "An active link is an embed URL currently live on a page. You can pause one flow and launch another within your limit at any time.",
      },
      {
        q: "What is a project?",
        a: "A project is any flow saved in your dashboard, published or in progress. Your project limit determines how many flows you can build and store at once.",
      },
      {
        q: "What happens after the €179 build?",
        a: "The flow goes live and you see the data. If you want to keep it running, you move to a monthly plan. If you want to build more, you pick the tier that fits.",
      },
      {
        q: "Can I upgrade later?",
        a: "Yes. The monthly plan can be changed at any time. Your flows and data stay intact.",
      },
      {
        q: "Is the €179 a one-time fee?",
        a: "Yes. It covers the build, the embed, and the first live session. The monthly fee starts only when you continue.",
      },
    ],
  },
  hu: {
    heroTitle: "Egyszerű árazás. Egy tiszta kiindulópont.",
    heroLead:
      "Indíts egy olyan flow-val, ami fel van építve, be van ágyazva, és egy valós oldalon már élőben fut. Ha működik, válaszd a neked megfelelő csomagot.",
    pricingPlansAria: "Arazasi csomagok",
    planLabel: "Csomag",
    comingSoon: "Hamarosan",
    firstFlowTitle: "Az elso flow mar most elerheto.",
    firstFlowBody:
      "Felepitjuk a dontesi logikat, elkeszitjuk a flow-t, es beagyazzuk egy elo oldalba. Latod, hogyan mozognak benne a felhasznalok, mielott havi csomagra valtanál.",
    firstFlowPrice: "Egyszeri 179 EUR, majd 59 EUR/ho, ha folytatod.",
    requestFirstFlow: "Kerem az elso flow-t",
    comparisonTitle: "Csomag-osszehasonlitas",
    featureCol: "Funkcio",
    faqTitle: "Gyakori kerdesek",
    finalTitle: "Az elso flow a leggyorsabb modja annak, hogy lasd, ez mukodik-e nalad.",
    plans: [
      {
        name: "Starter",
        price: "€59/ho",
        desc: "Csapatoknak, akik egy-ket aktiv flow-t futtatnak.",
        stats: ["2 aktiv link", "5 projekt"],
        features: [
          "Analitika: completion rate, utvonal adatok, drop-off pontok",
          "Beagyazas: iframe es script loader",
          "Ghost mode",
        ],
        highlight: false,
      },
      {
        name: "Growth",
        price: "€119/ho",
        desc: "Csapatoknak, akik tobb ugyfelre vagy kampanyra skalaznak.",
        stats: ["5 aktiv link", "10 projekt"],
        features: [
          "Analitika: teljes dontesi utvonal, intent szegmentacio",
          "Beagyazas: iframe es script loader",
          "Ghost mode",
          "Alairt embed hozzaferes",
          "Prioritasos tamogatas",
        ],
        highlight: true,
      },
      {
        name: "Scale",
        price: "€199/ho",
        desc: "Ugynoksegeknek, akik sok oldalon menedzselnek flow-kat.",
        stats: ["Korlátlan aktiv link", "Korlátlan projekt"],
        features: [
          "Analitika: teljes dontesi utvonal, intent szegmentacio, cross-site",
          "Beagyazas: iframe es script loader",
          "Ghost mode",
          "Alairt embed hozzaferes",
          "Tobb oldalas deploy",
          "Dedikalt tamogatas",
        ],
        highlight: false,
      },
    ],
    comparison: [
      {
        feature: "Aktiv linkek",
        desc: "Azok a beagyazott URL-ek, amelyek egyszerre eloben futnak oldalon.",
        starter: "2",
        growth: "5",
        scale: "Korlátlan",
      },
      {
        feature: "Projektek",
        desc: "Dashboardban mentett flow-k, publikalt vagy szerkesztes alatt.",
        starter: "5",
        growth: "10",
        scale: "Korlátlan",
      },
      {
        feature: "Completion rate",
        desc: "A felhasznalok aranya, akik a flow vegere ernek.",
        starter: "✓",
        growth: "✓",
        scale: "✓",
      },
      {
        feature: "Path analitika",
        desc: "Dontesi utvonal adatok arrol, hogyan lepnek vegig a felhasznalok.",
        starter: "✓",
        growth: "✓",
        scale: "✓",
      },
      {
        feature: "Intent szegmentacio",
        desc: "Felhasznalok csoportositasa dontesi mintazat es szandek alapjan.",
        starter: "—",
        growth: "✓",
        scale: "✓",
      },
      {
        feature: "Cross-site analitika",
        desc: "Egyseges adat tobb domainen futo flow-kbol.",
        starter: "—",
        growth: "—",
        scale: "✓",
      },
      {
        feature: "Ghost mode",
        desc: "A flow atveszi a host oldal stilusat, lathato third-party frame nelkul.",
        starter: "✓",
        growth: "✓",
        scale: "✓",
      },
      {
        feature: "Alairt embed",
        desc: "Tokenes vedett hozzaferes origin korlatozassal es azonnali visszavonassal.",
        starter: "—",
        growth: "✓",
        scale: "✓",
      },
      {
        feature: "Tobb oldalas deploy",
        desc: "Flow-k telepitese es menedzselese tobb ugyfel domenjen egy fiokbol.",
        starter: "—",
        growth: "—",
        scale: "✓",
      },
      {
        feature: "Tamogatas",
        desc: "Igy ersz el minket, ha valami figyelmet igenyel.",
        starter: "Email",
        growth: "Prioritasos",
        scale: "Dedikalt",
      },
    ],
    faqs: [
      {
        q: "Mi az aktiv link?",
        a: "Az aktiv link egy olyan beagyazott URL, ami epp eloben fut egy oldalon. Barmikor szuneteltethetsz egy flow-t, es indithatsz masikat a limiteden belul.",
      },
      {
        q: "Mi a projekt?",
        a: "Projekt minden olyan flow, ami mentve van a dashboardodban, publikalt vagy folyamatban levo allapotban. A projekt limited hatarozza meg, egyszerre mennyit epithetsz es tarolhatsz.",
      },
      {
        q: "Mi tortenik a 179 EUR-os build utan?",
        a: "A flow eloben fut, es latod az adatokat. Ha futtatni szeretned tovabb, havi csomagra valtasz. Ha tobbet szeretnel epiteni, a megfelelo csomagot valasztod.",
      },
      {
        q: "Kesobb lehet csomagot valtani?",
        a: "Igen. A havi csomag barmikor modositthato. A flow-k es adataid valtozatlanok maradnak.",
      },
      {
        q: "A 179 EUR egyszeri dij?",
        a: "Igen. Tartalmazza az epitest, a beagyazast es az elso elo sessiont. A havi dij csak akkor indul, ha folytatod.",
      },
    ],
  },
} as const;

export default function PricingPage() {
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

  const copy = PRICING_COPY[lang];

  return (
    <article className={s.page}>
      <header className={s.hero}>
        <h1 className={s.title}>{copy.heroTitle}</h1>
        <p className={s.lead}>{copy.heroLead}</p>
      </header>

      <section className={s.planGrid} aria-label={copy.pricingPlansAria}>
        {copy.plans.map((plan) => (
          <article key={plan.name} className={`${s.planCard} ${plan.highlight ? s.planCardHighlight : ""}`}>
            <div className={s.planTop}>
              <span className={s.planLabel}>{copy.planLabel}</span>
              <h2 className={s.planName}>{plan.name}</h2>
            </div>
            <div className={s.cardDivider} />
            <p className={s.planPrice}>{plan.price}</p>
            <p className={s.planDesc}>{plan.desc}</p>
            <div className={s.cardDivider} />
            <div className={s.planStats}>
              {plan.stats.map((stat) => (
                <span key={stat} className={s.planStat}>
                  {stat}
                </span>
              ))}
            </div>
            <div className={s.cardDivider} />
            <ul className={s.featureList}>
              {plan.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <div className={s.cardDivider} />
            <button type="button" className={s.comingSoonBtn} disabled aria-disabled="true">
              {copy.comingSoon}
            </button>
          </article>
        ))}
      </section>

      <section className={s.firstFlowCard} aria-labelledby="first-flow-title">
        <h2 id="first-flow-title" className={s.firstFlowTitle}>
          {copy.firstFlowTitle}
        </h2>
        <p className={s.firstFlowBody}>{copy.firstFlowBody}</p>
        <p className={s.firstFlowPrice}>{copy.firstFlowPrice}</p>
        <Link href="/about" className={s.primaryCta}>
          {copy.requestFirstFlow}
        </Link>
      </section>

      <section className={s.section} aria-labelledby="compare-title">
        <h2 id="compare-title" className={s.sectionTitle}>
          {copy.comparisonTitle}
        </h2>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>{copy.featureCol}</th>
                <th>Starter</th>
                <th>Growth</th>
                <th>Scale</th>
              </tr>
            </thead>
            <tbody>
              {copy.comparison.map((row) => (
                <tr key={row.feature}>
                  <td>
                    <div className={s.featureName}>{row.feature}</div>
                    <div className={s.featureDesc}>{row.desc}</div>
                  </td>
                  <td>{row.starter}</td>
                  <td>{row.growth}</td>
                  <td>{row.scale}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={s.section} aria-labelledby="faq-title">
        <h2 id="faq-title" className={s.sectionTitle}>
          {copy.faqTitle}
        </h2>
        <div className={s.faqList}>
          {copy.faqs.map((item) => (
            <article key={item.q} className={s.faqItem}>
              <h3>{item.q}</h3>
              <p>{item.a}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={s.finalCta} aria-labelledby="pricing-final-title">
        <h2 id="pricing-final-title" className={s.finalTitle}>
          {copy.finalTitle}
        </h2>
        <Link href="/about" className={s.primaryCta}>
          {copy.requestFirstFlow}
        </Link>
      </section>
    </article>
  );
}
