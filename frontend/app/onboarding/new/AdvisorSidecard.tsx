"use client";

import type { CardId } from "./briefDraft";
import s from "./advisorSidecard.module.scss";

/** Statikus tippek per kártya — V2-ben kontextus-érzékeny szövegekkel bővítjük. */
const ADVISOR_TIPS: Record<CardId, {
  heading: string;
  bullets: string[];
  proTip?: string;
}> = {
  card1: {
    heading: "Mire figyelj a cégalapoknál",
    bullets: [
      "A márkanév pontos kiírása fontos — a chatbot ezzel köszön a vásárlóknak.",
      "Ha többféle termékkategóriát árulsz, jelöld az arányt: ezzel a chatbot eldönti, melyik szabályrendszert kell hangsúlyosabban kezelnie.",
      "A nyelv (Locale) megválasztása nem csak nyelvi: a jogi háttér (pl. 14 nap fogyasztói visszaküldés) is ehhez kötődik.",
    ],
    proTip:
      "Marketplace modellnél a chatbot diplomatikusabban fogalmaz — pl. eladók helyett platformot említ.",
  },
  card2: {
    heading: "A működési politika a chatbot gerince",
    bullets: [
      "A visszaküldési ablakot pontosan add meg — minden egyéb szabály ehhez ér hozzá.",
      "A remedy-sorrend (visszatérítés / csere / javítás) eldönti, mit kínál fel elsőként a bot.",
      "A futárcég lista a kárrendezést és az elveszett csomag forgatókönyvet vezérli.",
    ],
    proTip:
      "Ha minden visszaküldés nálatok van fizetve, jelöld be — a chatbot különben azt mondja: „a postaköltség a tiéd”.",
  },
  card3: {
    heading: "Helpdesk integráció = jegykezelés",
    bullets: [
      "Ha van Zendesk / Freshdesk / HubSpot fiókod, a chatbot automatikusan jegyet nyit — a vásárló nem írogat külön emailt.",
      "Az SLA-szám az ügyfél felé tett ígéret: a bot ezt visszamondja („24 órán belül válaszolunk”).",
      "Az „urgency trigger” olyan helyzeteket jelöl, ahol a bot azonnal embert hív (pl. akkumulátor-túlmelegedés).",
    ],
    proTip:
      "Webhook helpdesk esetén bármilyen rendszerhez köthető — küldd el a fejlesztődnek a webhook URL-t, és kérj egy header auth-ot.",
  },
  card4: {
    heading: "Visszajelző szövegek a chatbot „arca”",
    bullets: [
      "Az AI a Card 2 (működés) alapján kiírta a 6 alapszöveget — átolvasásra a ti hangotokon.",
      "Apró szerkesztéssel adhattok stílust: barátságos, formális, vagy magázódó tónus.",
      "Ha a Card 2-ben változtatsz, a felső sárga jelzés mutatja, hogy újra generálható — döntsd el, az új szöveget kéred vagy a sajátodat tartod meg.",
    ],
    proTip:
      "Egyetlen klikk a „Frissítés” gombbal, és ezek a szövegek újra generálódnak — a tiéd-szerkesztett változatokat soha nem írjuk felül kérdés nélkül.",
  },
  card5: {
    heading: "Hol végződik a chatbot hatásköre",
    bullets: [
      "Off-topic üzenetnél (pl. „milyen ma az idő?”) a bot udvariasan visszatereli a beszélgetést.",
      "Ha van élő ügyfélszolgálati csapatotok, jelöld be a nyitvatartást — a bot mondhatja: „Holnap reggel jelentkezik kollégánk”.",
      "A kapcsolattartási formák (telefon, email, űrlap) közvetlenül megjelennek a chatbot escalation üzenetében.",
    ],
    proTip:
      "Ha 0–24 nyitva vagytok, jelöld be az „always” opciót — különben a bot mindig az aktuális napszakhoz méri a választ.",
  },
  card6: {
    heading: "Csatolt dokumentumok = forrásigazság",
    bullets: [
      "A feltöltött ÁSZF, garancia-szabályzat, FAQ-k a bot „másodlagos memóriájába” kerülnek.",
      "A „primary” jelölés azt jelenti: a bot ezt mindig idézi vita esetén; a „secondary” csak akkor, ha a kérdés rákényszeríti.",
      "Ha most nem töltesz fel semmit, a chatbot a Card 1–5 alapján is működik — később bármikor pótolható.",
    ],
    proTip:
      "Egy FAQ feltöltése a leggyorsabb módja annak, hogy a chatbot „okosabb” legyen az általános kérdésekre.",
  },
};

export interface AdvisorSidecardProps {
  activeCard: CardId | null;
}

export default function AdvisorSidecard({ activeCard }: AdvisorSidecardProps) {
  const card = activeCard ?? "card1";
  const tip = ADVISOR_TIPS[card];

  return (
    <aside className={s.sidecard} aria-label="Tanácsadó panel">
      <header className={s.head}>
        <span className={s.avatar} aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 22 22">
            <circle cx="11" cy="9" r="3.5" fill="currentColor" opacity="0.85" />
            <path
              d="M3.5 19.5c1.6-3.6 4.6-5.4 7.5-5.4s5.9 1.8 7.5 5.4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <div>
          <p className={s.eyebrow}>Tanácsadó</p>
          <h3 className={s.title}>{tip.heading}</h3>
        </div>
      </header>

      <ul className={s.bullets}>
        {tip.bullets.map((b, i) => (
          <li key={i}>{b}</li>
        ))}
      </ul>

      {tip.proTip && (
        <div className={s.proTip}>
          <span className={s.proTipLabel}>💡 Pro tipp</span>
          <p>{tip.proTip}</p>
        </div>
      )}

      <footer className={s.foot}>
        Megakadtál? <a href="mailto:hello@questell.app">Írj nekünk</a> —
        24 órán belül válaszolunk.
      </footer>
    </aside>
  );
}
