import type { CardId } from "../briefDraft";

/** Első megnyitáskor system üzenet kártyánként (coach chat). */
export interface CoachCardIntro {
  title: string;
  body: string;
  bullets: string[];
  proTip?: string;
}

export const COACH_CARD_INTROS: Record<CardId, CoachCardIntro> = {
  card1: {
    title: "Cégalapok",
    body:
      "Kezdjük a cég alapadataival. Ezekből a chatbot megszólítása, nyelve és üzleti kontextusa épül.",
    bullets: [
      "A márkanév pontos kiírása fontos — ezzel köszön a vásárlóknak.",
      "Több üzleti modell is választható (saját készlet, marketplace, dropship, gyártó).",
      "A locale nem csak nyelv: a jogi háttér is ehhez kötődik.",
    ],
    proTip:
      "Marketplace modellnél a chatbot diplomatikusabban fogalmaz — platformot említ, nem eladót.",
  },
  card2: {
    title: "Működési politikák",
    body:
      "Ez a chatbot gerince: visszaküldés, remedy-sorrend, szállítás. A Card 4 szövegei is innen indulnak.",
    bullets: [
      "A visszaküldési ablakot pontosan add meg.",
      "A remedy-sorrend dönti el, mit kínál fel elsőként a bot.",
      "A futárcég lista az elveszett csomag forgatókönyvet vezérli.",
    ],
    proTip:
      "Ha nálatok van a visszaküldés költsége, jelöld be — különben a bot az ügyfelet terheli.",
  },
  card3: {
    title: "Háttérrendszer",
    body:
      "Helpdesk és SLA: mit ígér a bot az ügyfélnek, és mikor eszkalál emberhez.",
    bullets: [
      "Helpdesk esetén a bot automatikusan jegyet nyit.",
      "Az SLA-szám az ügyfél felé tett ígéret.",
      "A sürgős eseteket a remedy-sorrend és SLA együtt határozza meg.",
    ],
    proTip:
      "Webhook helpdesk esetén bármilyen rendszerhez köthető egy POST endpoint.",
  },
  card4: {
    title: "Visszajelző szövegek",
    body:
      "Az AI a Card 2 alapján kitöltötte a 6 végállomás-szöveget. Olvasd át, szerkeszd, jóváhagyd.",
    bullets: [
      "Apró szerkesztéssel adhatsz stílust: formális vagy barátságos tónus.",
      "Card 2 módosítása után újragenerálható — a saját szerkesztésed védett.",
      "A scope-out üzenetet te írod meg kézzel.",
    ],
    proTip:
      "Egy kattintás az „Újragenerálás” gombra — user-edited slotok felülírása előtt megerősítést kér.",
  },
  card5: {
    title: "Hatáskör és határok",
    body: "Hol végződik a chatbot hatásköre, és mikor érhető el élő support.",
    bullets: [
      "Off-topic üzenetnél a bot visszatereli a beszélgetést.",
      "Support csapat esetén add meg a nyitvatartást.",
      "Kapcsolattartási módok megjelennek eszkalációkor.",
    ],
    proTip:
      "0–24 elérhetőségnél jelöld a „0–24” opciót, különben a bot munkaidőhöz igazodik.",
  },
  card6: {
    title: "Forrásdokumentumok",
    body:
      "Opcionális, de erősít: ÁSZF, garancia, FAQ. Üresen is felépíthető a bot a Card 1–5 alapján.",
    bullets: [
      "A kötelező badge = erősen ajánlott feltöltés.",
      "Feltölthetsz .txt, .md, .csv vagy .pdf fájlt, vagy URL-t / beillesztett szöveget.",
      "Később bármikor pótolható.",
    ],
    proTip: "Egy jó FAQ a leggyorsabb módja, hogy okosabb legyen általános kérdésekre.",
  },
};

export function formatCardIntroMessage(card: CardId): string {
  const intro = COACH_CARD_INTROS[card];
  const lines = [
    `**${intro.title}**`,
    "",
    intro.body,
    "",
    ...intro.bullets.map((b) => `• ${b}`),
  ];
  if (intro.proTip) {
    lines.push("", `💡 ${intro.proTip}`);
  }
  lines.push("", "Ha elakadsz, írj kérdést — megmutatom, melyik mezőre gondolok.");
  return lines.join("\n");
}
