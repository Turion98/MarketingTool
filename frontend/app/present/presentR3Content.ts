import type {
  PresentRole,
  R3ClosureByRolePain,
  R3ContentByPain,
} from "./presentDeck.types";

function hud(
  title: string,
  agency: string,
  saas: string,
  webshop: string
): {
  title: string;
  subtextByRole: Record<PresentRole, string>;
  micro: string;
} {
  return {
    title,
    subtextByRole: { agency, saas, webshop },
    micro: "",
  };
}

function hudHu(
  title: string,
  agency: string,
  saas: string,
  webshop: string
): {
  title: string;
  subtextByRole: Record<PresentRole, string>;
  micro: string;
} {
  return {
    title,
    subtextByRole: { agency, saas, webshop },
    micro: "",
  };
}

export const r3ContentEn: R3ContentByPain = {
  low_conversion: {
    shortLabel: "Activation gap",
    hud: hud(
      "ACTIVATION GAP",
      "Clicks land. The decision after the click does not close.",
      "Users start. Most stop before they reach the moment the product proves itself.",
      "Visitors arrive at the product. Fewer move from interest to buying intent."
    ),
    questellPrimer: {
      title: "What Questell does here",
      body: [
        "Questell adds a guided decision layer at the point where users stall.",
        "Instead of a static page and a passive CTA, the user moves through a structured path that ends at a specific outcome — not a general landing point.",
      ],
    },
    painNarrative: {
      title: "Why activation breaks here",
      body: [
        "Reach can look fine while commitment never forms, because nothing structured closes the next decision.",
        "Commercially that shows up as weaker progression, softer pipeline intent, and slower revenue conversion from the same traffic.",
      ],
    },
    evidenceLine: {
      signal: "Engagement shows up; the commitment step does not.",
      proof: "Leakage concentrates after the click, not at entry.",
      pattern: "A guided path at the stall point restores forward motion.",
    },
    actionBridge: {
      title: "Choose a first surface",
      body: [
        "Start where users stall right before commitment: trial, demo, or qualification.",
        "Your next choice is the specific surface where guided decisions can be measured first.",
      ],
    },
  },
  choice_overload: {
    shortLabel: "Decision overload",
    hud: hud(
      "DECISION OVERLOAD",
      "Too many parallel options on client pages slow the decision down and increase exit.",
      "Too many plans, paths, and setup options create hesitation exactly where momentum should build.",
      "Variant and offer choices accumulate uncertainty between the product page and the cart."
    ),
    questellPrimer: {
      title: "What Questell does here",
      body: [
        "Questell does not remove options. It sequences them.",
        "Each step narrows the space based on what the previous answer implied, so the user moves toward a decision instead of scanning everything at once.",
      ],
    },
    painNarrative: {
      title: "Why overload shows up as exit",
      body: [
        "Parallel surfaces increase comparison load and delay commitment at the highest-value moments.",
        "That shows up commercially as weaker completion, longer cycles, and softer intent quality.",
      ],
    },
    evidenceLine: {
      signal: "Momentum drops where everything is visible at once.",
      proof: "Hesitation converts to exit when the decision surface is too wide.",
      pattern: "Sequenced narrowing restores decision speed.",
    },
    actionBridge: {
      title: "Choose a first surface",
      body: [
        "Start where option density is highest: packaging, qualification, or request flow.",
        "Your next choice is where sequencing will produce the fastest measurable lift.",
      ],
    },
  },
  no_visibility: {
    shortLabel: "Intent visibility gap",
    hud: hud(
      "INTENT VISIBILITY GAP",
      "Traffic is measurable. Where decisions break down across client flows is not.",
      "Drop-off is visible in the numbers. What causes it at each decision point is not.",
      "Sessions and exits are tracked. Where purchase intent is lost in between is not."
    ),
    questellPrimer: {
      title: "What Questell does here",
      body: [
        "Questell turns navigation into explicit decision events.",
        "Instead of click data, you get a structured record of what users needed, what they ruled out, and where they stopped deciding.",
      ],
    },
    painNarrative: {
      title: "Why invisible intent blocks growth",
      body: [
        "When intent breakpoints are unclear, teams optimize on assumptions and learn slowly from experiments.",
        "That weakens prioritization confidence and delays the highest-impact funnel fixes.",
      ],
    },
    evidenceLine: {
      signal: "Behaviour is visible; intent breakpoints are not.",
      proof: "Prioritization becomes reactive without decision-level signals.",
      pattern: "Explicit decision events make intent readable at each step.",
    },
    actionBridge: {
      title: "Choose a first surface",
      body: [
        "Start where intent can be captured quickly: qualification journeys or structured plan selection.",
        "Your next choice should maximize learning velocity from decision events, not just page engagement.",
      ],
    },
  },
  need_new: {
    shortLabel: "Fast validation pressure",
    hud: hud(
      "FAST VALIDATION PRESSURE",
      "Client results are needed now. Full rebuilds and long test cycles are not an option.",
      "The growth stage demands quick evidence. Long CRO cycles are too slow for this moment.",
      "Revenue improvement is urgent. A full redesign path takes longer than the business can wait."
    ),
    questellPrimer: {
      title: "What Questell does here",
      body: [
        "Questell embeds into an existing page without a rebuild.",
        "You can test a new decision route in days, not months, and measure the impact before committing to anything larger.",
      ],
    },
    painNarrative: {
      title: "Why speed matters more than scope",
      body: [
        "When proof is required on a short horizon, long rollouts delay learning and increase outcome risk.",
        "The winning move is a contained intervention that produces a measurable signal quickly.",
      ],
    },
    evidenceLine: {
      signal: "Pressure rises for visible progress within a short window.",
      proof: "Long cycles delay meaningful learning and increase correction cost.",
      pattern: "Short, measurable pilots create actionable evidence early.",
    },
    actionBridge: {
      title: "Choose a first surface",
      body: [
        "Pick a use case where implementation is light and decision impact is visible quickly.",
        "Your next choice is the shortest path to validated signal before the next planning cycle closes.",
      ],
    },
  },
};

export const r3ContentHu: R3ContentByPain = {
  low_conversion: {
    shortLabel: "Aktivációs rés",
    hud: hudHu(
      "AKTIVÁCIÓS RÉS",
      "A kattintások megérkeznek. A kattintás utáni döntés nem záródik le.",
      "A felhasználók elindulnak. A legtöbben megállnak, mielőtt a termék bizonyítana.",
      "A látogatók eljutnak a termékhez. Kevesebben lépnek az érdeklődésből vásárlási szándékba."
    ),
    questellPrimer: {
      title: "Mit csinál itt a Questell?",
      body: [
        "A Questell egy vezetett döntési réteget ad oda, ahol a felhasználók megtorpanak.",
        "Statikus oldal és passzív CTA helyett strukturált úton halad a user, és egy konkrét kimenetig jut el — nem egy általános landolási pontig.",
      ],
    },
    painNarrative: {
      title: "Miért törik itt meg az aktiváció?",
      body: [
        "A reach rendben lehet, miközben a kötelezettségvállalás nem alakul ki, mert nincs struktúra a következő döntés lezárására.",
        "Üzletileg gyengébb haladás, lágyabb pipeline-szándék és lassabb bevételi konverzió jelenik meg ugyanabból a forgalomból.",
      ],
    },
    evidenceLine: {
      signal: "Az engagement látszik; a kötelezettségvállalás lépése nem.",
      proof: "A veszteség a kattintás után koncentrálódik, nem a belépésnél.",
      pattern: "A megtorpanási ponton vezetett út visszaadja az előrehaladást.",
    },
    actionBridge: {
      title: "Válassz első felületet",
      body: [
        "Indulj ott, ahol a user a kötelezettség előtt megáll: trial, demo vagy qualification.",
        "A következő választás az a konkrét felület, ahol a vezetett döntések hatása először mérhető.",
      ],
    },
  },
  choice_overload: {
    shortLabel: "Döntési túlterhelés",
    hud: hudHu(
      "DÖNTÉSI TÚLTERHELÉS",
      "Túl sok párhuzamos opció az ügyféloldali oldalakon lassítja a döntést és növeli a kilépést.",
      "Túl sok csomag, út és beállítási lehetőség bizonytalanságot hoz pont oda, ahol lendület kellene.",
      "A variáns- és ajánlati választások bizonytalanságot halmoznak a termékoldal és a kosár között."
    ),
    questellPrimer: {
      title: "Mit csinál itt a Questell?",
      body: [
        "A Questell nem vesz el opciókat. Sorrendbe teszi őket.",
        "Minden lépés szűkíti a teret az előző válasz alapján, így a user döntés felé halad ahelyett, hogy egyszerre mindent pásztázna.",
      ],
    },
    painNarrative: {
      title: "Miért vezet túlterhelés kilépéshez?",
      body: [
        "A párhuzamos felületek növelik az összehasonlítási terhet és késleltetik a kötelezettséget a legértékesebb pillanatokban.",
        "Üzletileg gyengébb lezárás, hosszabb ciklusok és lágyabb szándékminőség a következmény.",
      ],
    },
    evidenceLine: {
      signal: "A lendület ott esik vissza, ahol egyszerre minden látszik.",
      proof: "A bizonytalanság kilépéssé válik, ha a döntési felület túl széles.",
      pattern: "A sorba rendezett szűkítés visszaadja a döntési sebességet.",
    },
    actionBridge: {
      title: "Válassz első felületet",
      body: [
        "Indulj ott, ahol a legmagasabb az opciósűrűség: csomagválasztás, qualification vagy ajánlatkérés.",
        "A következő választás arról szól, hol ad a szekvenciálás a leggyorsabban mérhető ugrást.",
      ],
    },
  },
  no_visibility: {
    shortLabel: "Intent láthatóság hiánya",
    hud: hudHu(
      "INTENT LÁTHATÓSÁG HIÁNYA",
      "A forgalom mérhető. Az ügyfél-flowok mentén hol törnek meg a döntések, az nem.",
      "A lemorzsolódás a számokban látszik. Mi okozza egyes döntési pontokon, az nem.",
      "A session és a kilépés követett. Hol vész el a vásárlási szándék közben, az nem."
    ),
    questellPrimer: {
      title: "Mit csinál itt a Questell?",
      body: [
        "A Questell a navigációt explicit döntési eseményekké bontja.",
        "Kattintásadat helyett strukturált nyilvántartást kapsz arról, mire volt szükség, mit zártak ki, és hol álltak meg a döntésben.",
      ],
    },
    painNarrative: {
      title: "Miért gátolja a növekedést a rejtett intent?",
      body: [
        "Ha az intent töréspontok nem látszanak, a csapat feltételezésekre optimalizál és lassan tanul a kísérletekből.",
        "Ez gyengíti a priorizálás magabiztosságát és késlelteti a legnagyobb hatású funnel-javításokat.",
      ],
    },
    evidenceLine: {
      signal: "A viselkedés látszik; az intent töréspontok nem.",
      proof: "Döntési jelek nélkül az optimalizáció reaktív marad és lassan tanul.",
      pattern: "Explicit döntési eseményekkel olvashatóvá válik az intent lépésenként.",
    },
    actionBridge: {
      title: "Válassz első felületet",
      body: [
        "Indulj ott, ahol gyorsan rögzíthető az intent: qualification flow vagy strukturált plan-választás.",
        "A következő választás a tanulási sebességet maximalizálja döntési eseményekből, nem csak oldal-engagementből.",
      ],
    },
  },
  need_new: {
    shortLabel: "Gyors validációs nyomás",
    hud: hudHu(
      "GYORS VALIDÁCIÓS NYOMÁS",
      "Ügyféloldali eredmény kell most. Teljes újratervezés és hosszú tesztciklus nem opció.",
      "A növekedési szakasz gyors bizonyítékot kér. A hosszú CRO-ciklus erre a pillanatra lassú.",
      "A bevételi javulás sürgős. A teljes redesign útja hosszabb, mint amit az üzlet kibír."
    ),
    questellPrimer: {
      title: "Mit csinál itt a Questell?",
      body: [
        "A Questell beágyazható meglévő oldalba, újratervezés nélkül.",
        "Napok alatt tesztelhetsz új döntési utat, nem hónapok alatt, és mérheted a hatást mielőtt nagyobb elköteleződés jönne.",
      ],
    },
    painNarrative: {
      title: "Miért fontosabb a sebesség a scope-nál?",
      body: [
        "Ha rövid időn belül kell bizonyíték, a hosszú bevezetés késlelteti a tanulást és növeli a kimeneti kockázatot.",
        "A nyerő lépés egy kontrollált beavatkozás, ami gyorsan mérhető jelet ad.",
      ],
    },
    evidenceLine: {
      signal: "Nő a nyomás a rövid időn belüli, látható előrelépésre.",
      proof: "A hosszú ciklusok késleltetik a tanulást és drágítják a korrekciót.",
      pattern: "Rövid, mérhető pilotok korai, használható bizonyítékot adnak.",
    },
    actionBridge: {
      title: "Válassz első felületet",
      body: [
        "Olyan use case-et válassz, ahol könnyű a bevezetés és gyorsan látszik a döntési hatás.",
        "A következő választás a legrövidebb út a validált jelhez, mielőtt lezárul a következő tervezési ciklus.",
      ],
    },
  },
};

export const r3ClosureEn: R3ClosureByRolePain = {
  agency: {
    low_conversion: {
      title: "Post-click closure",
      body: [
        "Where performance is lost is clear: the decision after the click does not close consistently.",
        "The next focus is building the structure that was missing at that point — a guided path that ends at a defined outcome, not an open page.",
      ],
    },
    choice_overload: {
      title: "Parallel options at exit",
      body: [
        "Where friction accumulates is clear: too many parallel options slow the decision and increase exit at the highest-value moments.",
        "The next focus is a guided sequence that narrows choices instead of presenting them all at once.",
      ],
    },
    no_visibility: {
      title: "Intent across client flows",
      body: [
        "Where measurement stops is clear: traffic is visible, but intent breakpoints across client flows are not.",
        "The next focus is turning decision moments into explicit signals that support faster, more confident prioritization.",
      ],
    },
    need_new: {
      title: "Proof inside the window",
      body: [
        "What the situation requires is clear: visible progress in a short window without a long rollout.",
        "The next focus is a short-cycle pilot with a measurable output that can be shown to clients before anything larger is committed.",
      ],
    },
  },
  saas: {
    low_conversion: {
      title: "To the value moment",
      body: [
        "Where momentum is lost is clear: users enter the product but stall before they reach the moment it proves its value.",
        "The next focus is reinforcing that transition — a guided path that moves users from entry to first meaningful outcome.",
      ],
    },
    choice_overload: {
      title: "Plan path clarity",
      body: [
        "Where progression slows is clear: packaging and plan decisions carry too much interpretation cost at once.",
        "The next focus is a stepwise decision flow that keeps users on the path that matches their situation instead of scanning options without commitment.",
      ],
    },
    no_visibility: {
      title: "Intent per step",
      body: [
        "Where confidence breaks down is clear: behaviour is tracked, but intent and readiness at each decision point are not.",
        "The next focus is embedding decision-level signals into the flow so optimization is driven by what users actually decided, not just where they clicked.",
      ],
    },
    need_new: {
      title: "Fast validation signal",
      body: [
        "What the growth stage requires is clear: faster evidence without long cycles.",
        "The next focus is a short, measurable validation loop that produces a real signal before the next planning cycle closes.",
      ],
    },
  },
  webshop: {
    low_conversion: {
      title: "Interest to intent",
      body: [
        "Where revenue is lost is clear: product pages attract interest, but the transition to buying intent does not hold.",
        "The next focus is a guided decision layer at the point where interest should become action.",
      ],
    },
    choice_overload: {
      title: "Density before checkout",
      body: [
        "Where hesitation builds is clear: variant and offer surfaces are too dense, and uncertainty concentrates between the product page and checkout.",
        "The next focus is narrower option framing with a guided path through the choices that actually matter.",
      ],
    },
    no_visibility: {
      title: "Loss near completion",
      body: [
        "Where measurement stops is clear: sessions and exits are tracked, but where purchase intent breaks down in between is not.",
        "The next focus is decision-level signals near the completion stages where revenue is actually lost.",
      ],
    },
    need_new: {
      title: "Quick revenue pilot",
      body: [
        "What the business requires is clear: measurable revenue improvement without a full redesign.",
        "The next focus is a low-risk intervention at one decision point with fast, readable feedback on completion impact.",
      ],
    },
  },
};

export const r3ClosureHu: R3ClosureByRolePain = {
  agency: {
    low_conversion: {
      title: "Kattintás utáni lezárás",
      body: [
        "Egyértelmű, hol vész el a teljesítmény: a kattintás utáni döntés nem záródik le következetesen.",
        "A következő fókusz a hiányzó struktúra felépítése — vezetett út, amely meghatározott kimenetig visz, nem nyitott oldalig.",
      ],
    },
    choice_overload: {
      title: "Párhuzamos opciók a kilépésnél",
      body: [
        "Egyértelmű, hol halmozódik a súrlódás: túl sok párhuzamos opció lassítja a döntést és növeli a kilépést a legértékesebb pillanatokban.",
        "A következő fókusz egy vezetett sorrend, amely szűkíti a választást, ahelyett hogy egyszerre mindent felmutatna.",
      ],
    },
    no_visibility: {
      title: "Intent az ügyfél-flowok mentén",
      body: [
        "Egyértelmű, hol áll meg a mérés: a forgalom látszik, de az ügyfél-flowok mentén a döntési töréspontok nem.",
        "A következő fókusz a döntési pillanatok explicit jelekké alakítása, hogy gyorsabb és magabiztosabb priorizálás legyen.",
      ],
    },
    need_new: {
      title: "Bizonyíték a rövid ablakban",
      body: [
        "Egyértelmű, mit kíván a helyzet: látható előrelépés rövid időn belül, hosszú rollout nélkül.",
        "A következő fókusz rövid ciklusú pilot mérhető kimenettel, amit az ügyfélnek is meg lehet mutatni, mielőtt nagyobb elköteleződés jönne.",
      ],
    },
  },
  saas: {
    low_conversion: {
      title: "Az érték pillanatáig",
      body: [
        "Egyértelmű, hol vész el a lendület: a user bejut a termékbe, de megáll, mielőtt a termék bizonyítana.",
        "A következő fókusz ennek az átmenetnek a megerősítése — vezetett út a belépéstől az első értelmes kimenetig.",
      ],
    },
    choice_overload: {
      title: "Csomagút tisztasága",
      body: [
        "Egyértelmű, hol lassul a haladás: a csomag- és plan-döntések egyszerre túl nagy értelmezési terhet adnak.",
        "A következő fókusz lépésenkénti döntési folyamat, amely a helyzetnek megfelelő úton tartja a usert ahelyett, hogy kötelezettség nélkül pásztáztatná az opciókat.",
      ],
    },
    no_visibility: {
      title: "Intent lépésenként",
      body: [
        "Egyértelmű, hol bomlik le a magabiztosság: a viselkedés követett, de az intent és a readiness egyes döntési pontokon nem.",
        "A következő fókusz döntési szintű jelek beépítése a flow-ba, hogy az optimalizálást az határozza meg, mit döntött a user, ne csak hol kattintott.",
      ],
    },
    need_new: {
      title: "Gyors validációs jel",
      body: [
        "Egyértelmű, mit kíván a növekedési szakasz: gyorsabb bizonyíték hosszú ciklusok nélkül.",
        "A következő fókusz rövid, mérhető validációs kör, ami valódi jelet ad, mielőtt lezárul a következő tervezési ciklus.",
      ],
    },
  },
  webshop: {
    low_conversion: {
      title: "Érdeklődésből szándék",
      body: [
        "Egyértelmű, hol vész el a bevétel: a termékoldal vonzza az érdeklődést, de a vásárlási szándék átmenete nem tart.",
        "A következő fókusz vezetett döntési réteg ott, ahol az érdeklődésből cselekvésnek kellene válnia.",
      ],
    },
    choice_overload: {
      title: "Sűrűség a checkout előtt",
      body: [
        "Egyértelmű, hol épül a bizonytalanság: a variáns- és ajánlati felületek túl sűrűk, és a termékoldal és a kosár között koncentrálódik.",
        "A következő fókusz szűkebb opció-keretezés és vezetett út a valóban számító választásokon keresztül.",
      ],
    },
    no_visibility: {
      title: "Veszteség a lezárás közelében",
      body: [
        "Egyértelmű, hol áll meg a mérés: a session és a kilépés követett, de közben hol bomlik le a vásárlási szándék, az nem.",
        "A következő fókusz döntési szintű jelek a befejezési szakaszok közelében, ahol ténylegesen elvész a bevétel.",
      ],
    },
    need_new: {
      title: "Gyors bevételi pilot",
      body: [
        "Egyértelmű, mit kíván az üzlet: mérhető bevételi javulás teljes redesign nélkül.",
        "A következő fókusz alacsony kockázatú beavatkozás egy döntési ponton, gyors, olvasható visszajelzéssel a lezárás hatásáról.",
      ],
    },
  },
};
