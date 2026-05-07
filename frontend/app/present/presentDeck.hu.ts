import type { PresentDeck } from "./presentDeck.types";

/** Questell present / HU — brief.txt alapú; iparági számok lábjegyzettel. */
export const presentDeckHu: PresentDeck = {
  definition: {
    visualHint: "embedFrame",
    variants: {
      short: {
        title: "Mi a Questell?",
        body:
          "Beágyazható interaktív widget, ami konverziós rétegként működik a meglévő oldalon. Nem lineáris „végigkattintós” quiz: döntési folyamaton vezet, és közben mérhető jelzéseket ad.",
        bullets: [
          "Konverziós réteg ugyanarra a forgalomra",
          "Dinamikus, elágazó döntési út",
          "Nem egyetlen lineáris kérdősor",
        ],
      },
      medium: {
        title: "Mi a Questell?",
        body:
          "A Questell egy iframe-ben beágyazható élmény: a látogató válaszai állapotot váltanak, a rendszer pedig a döntési gráf szerint viszi tovább — így a végén nem „egy eredmény”, hanem kontextusba ágyazott következő lépés (ajánlás, termék, csomag, CTA).",
        bullets: [
          "Ugyanaz a forgalom — döntési réteg a webshopon vagy landingen",
          "A logika JSON-ban szerkeszthető, nem sablon-kvíz",
          "A kimenet mellett döntési és útvonal-adat keletkezik",
        ],
      },
      full: {
        title: "Mi a Questell?",
        body:
          "A Questell egy beágyazható interaktív élmény (widget), ami konverziós rétegként működik. Nem lineáris, dinamikus folyamatokon keresztül vezet döntéshez — nem egy egyszerű quiz. A cél: ugyanabból a forgalomból több értelmes döntés és több konverzió.",
        bullets: [
          "Embed: iframe, gyors telepítés",
          "Decision flow: AI + strukturált JSON",
          "Kimnet + analitika: útvonal, drop-off, idő",
        ],
      },
    },
  },
  outcome: {
    visualHint: "twoColumn",
    variants: {
      short: {
        title: "Innen ugyanaz a réteg — de a példák nálad állnak össze",
        body:
          "A bevezetőben a lényeg: döntésvezérelt élmény a meglévő oldalon, nem lineáris kvíz. Most nem ismételjük — egy gyors szűréssel továbbhaladunk, hogy a következő képernyők a te szerepedhez igazodjanak.",
        bullets: [
          "Egy választás: ki áll a legközelebb ahhoz, amit építesz vagy értékesítesz?",
          "Utána: hol akad el a szándék, és mire vinnéd először a Questellt.",
          "A végén egy rád szabott összkép és konkrét CTA-k — nem általános brosúra.",
        ],
      },
      medium: {
        title: "Mi változik?",
        body:
          "A forgalom önmagában nem oldja meg a döntést. A Questell a választásokat szűkíti, sorba rendezi, és láthatóvá teszi, hol akad el a szándék — így a marketing nem csak kattintást hoz, hanem következő lépéshez juttatja a látogatót.",
        bullets: [
          "Kevesebb „véletlen” navigáció",
          "Több irányított döntés",
          "Kimutathatóbb kapcsolat: forgalom → bevétel",
        ],
      },
      full: {
        title: "Kimenet: döntés és bevétel",
        body:
          "Questell nélkül: böngészés, bizonytalanság, lemorzsolódás. Questell-lel: döntésekhez vezetett út, magasabb konverzió ugyanabból a forgalomból. A fő eredmény: több bevétel ugyanabból a forgalomból — nem önmagában „szebb UX”.",
        bullets: [
          "Ugyanaz a hirdetés / landing — más döntési réteg",
          "A funnel nem csak megjelenik: mérhetővé válik",
          "Agency-knál: egy deploy, több ügyfél-use-case",
        ],
      },
    },
  },
  problem_metrics: {
    visualHint: "statGrid",
    variants: {
      short: {
        title: "Monetizációs probléma",
        body:
          "Túl sok opció és kevés irány → bizonytalanság és kilépés. Ez közvetlen konverzió- és bevételkiesés.",
        stats: [
          { label: "Nem vásárol (túl sok opció)", value: "64%" },
          { label: "Drop-off (komplex döntés)", value: "20–40%" },
        ],
        footnote:
          "Iparági / publikációkban gyakran idézett irányok — nem garancia egyedi eredményre.",
      },
      medium: {
        title: "A probléma mérhető",
        body:
          "A látogató túlterhelt választási helyzetben van, nincs világos iránymutatás — ez nem „apró UX”, hanem bevételt érintő döntési súrlódás.",
        stats: [
          { label: "Nem vásárol túl sok opció miatt", value: "64%" },
          { label: "Lemorzsolódás döntési komplexitás miatt", value: "20–40%" },
          { label: "Vásárlás: 24 vs 6 opció", value: "3% vs 30%" },
        ],
        footnote:
          "Összehasonlítások iparági forrásokból; a te oldaladon A/B méréssel validálandó.",
      },
      full: {
        title: "Túl sok választás, kevés vezetés",
        body:
          "A vállalkozások konverziót veszítenek, és gyakran nincs strukturált rálátásuk arra, hol vesznek el a szándékok. Ez monetizációs probléma: nem csak dizájn finomhangolás.",
        stats: [
          { label: "User nem vásárol (overchoice)", value: "64%" },
          { label: "Drop-off (döntés komplexitás)", value: "20–40%" },
          { label: "Purchase arány (24 vs 6 opció)", value: "3% vs 30%" },
        ],
        bullets: [
          "A probléma strukturális és mérhető — nem vélemény",
          "A megoldás: irányított döntési réteg + adat",
        ],
        footnote:
          "A számok iparági referenciák; ügyfélnél mindig saját mérés szükséges.",
      },
    },
  },
  icp: {
    visualHint: "icpTags",
    variants: {
      short: {
        title: "Kinek?",
        body:
          "Elsődlegesen ügynökségeknek és partnereknek, akik forgalmat hoznak és gyorsan tudnak deployolni ügyfélnél.",
      },
      medium: {
        title: "Ki fizet először?",
        body:
          "Primary ICP: agency-k — már kezelnek forgalmat, konverziós nyomás alatt vannak, egy deal mögött több use case is lehet. Másodlagosan: nem-Shopify ecommerce, B2B SaaS, szolgáltatók, kampány- és landing tulajdonosok.",
        bullets: [
          "Agency: sales sebesség + ismétlődő deploy",
          "Márka: ugyanaz a forgalom, más döntési réteg",
          "Végfelhasználó: gyors, magabiztos döntést akar",
        ],
      },
      full: {
        title: "Célcsoport és vásárló",
        body:
          "Performance marketing agency owner (5–20 webshop, ROAS nyomás): ők az elsődleges fizető szegmens — forgalom + konverziós nyomás + azonnali ügyfél-deploy. Másodlagos: B2B SaaS, szolgáltatók, kampány tulajdonosok. A végfelhasználó túlterhelt, alacsony figyelemmel — neki vezetés kell, nem több szöveg.",
        bullets: [
          "Agency: 1 szerződés → többféle bevetés",
          "Márka / webshop: product finder, seasonal, offer",
          "SaaS: csomagválasztás és kvalifikáció",
        ],
      },
    },
  },
  use_cases: {
    visualHint: "useCaseTiles",
    variants: {
      short: {
        title: "Mire?",
        body:
          "Primary GTM: ecommerce product finder — közvetlen vásárlási hatás, magas fájdalom, könnyű demo.",
      },
      medium: {
        title: "Use case-ek",
        body:
          "A leggyorsabb üzleti nyomvonal a termékajánló / finder. Emellett: discovery, SaaS csomagválasztás, szolgáltatás kvalifikáció, kampány engagement, onboarding.",
        bullets: [
          "Product finder (primary GTM)",
          "Csomagválasztás, kvalifikáció",
          "Kampány, edukáció",
        ],
      },
      full: {
        title: "Mire használják?",
        body:
          "Primary GTM use case: ecommerce product finder — közvetlen vásárlási hatás, magas fájdalom, könnyű demo, leggyorsabb út bevételhez. Egyéb: termék discovery, SaaS csomagválasztás, szolgáltatás kvalifikáció, kampány engagement, edukáció / onboarding.",
        bullets: [
          "Product finder: rövid idő alatt látványos eredmény",
          "SaaS: összetett választás vezetett útra bontva",
          "Kampány: engagement + következő lépés egyben",
        ],
      },
    },
  },
  mechanism: {
    visualHint: "stepFlow",
    variants: {
      short: {
        title: "Hogyan működik?",
        bullets: [
          "Decision flow (AI / JSON)",
          "Embed (iframe)",
          "Válasz → irányítás → kimenet + adat",
        ],
      },
      medium: {
        title: "Működés lépésben",
        body:
          "A logika és a tartalom egy decision flow-ban fut. Beágyazod az oldalba, a user válaszol, a rendszer állapot szerint léptet, a végén kimenet és mérhető események keletkeznek.",
        bullets: [
          "Flow szerkesztése / generálása JSON-ben",
          "Iframe embed — nincs kötelező saját backend integráció",
          "Analitika: útvonal, idő, drop-off",
        ],
      },
      full: {
        title: "A döntési motor",
        body:
          "Decision flow (AI + JSON) határozza meg az elágazásokat és az állapotokat. Embed iframe-ként kerül a weboldalra. A user válaszai állapotot váltanak, a rendszer a gráf szerint irányít. Kimenet: ajánlás / termék / következő lépés + strukturált adat a finomhangoláshoz.",
        bullets: [
          "1) Flow / logika",
          "2) Embed",
          "3) Interakció és állapot",
          "4) Kimenet + analitika",
        ],
      },
    },
  },
  integration: {
    visualHint: "snippetChecks",
    variants: {
      short: {
        title: "Integráció",
        body:
          "Iframe embed, bármilyen weboldalon. Gyors deploy, alacsony kockázat — nincs kötelező backend integráció.",
        bullets: ["Iframe", "Nincs kötelező backend", "Gyors telepítés"],
      },
      medium: {
        title: "Gyors deploy, alacsony kockázat",
        body:
          "Az integrációs modell iframe alapú: a meglévő oldalba beilleszthető a widget, nem kell saját backendhez kötni ahhoz, hogy elinduljon az élmény. Agency-knál ez kritikus: kevesebb fejlesztői függőség, gyorsabb ügyfél-go-live.",
        bullets: [
          "Bármilyen weboldal — ahol iframe elfér",
          "Kockázat: alacsony, mert nem kell core rendszert nyitni",
          "Ügyfélnél is gyors „első élő” verzió",
        ],
      },
      full: {
        title: "Embed modell",
        body:
          "iframe embed: nincs backend integráció kötelezően, bármilyen weboldalon működik. Gyors deploy, alacsony kockázat — különösen agency workflow-ban, ahol a sebesség és az ismétlődhetőség versenyelőny.",
        bullets: [
          "Nincs kötelező saját API integráció induláshoz",
          "Landing, webshop, kampányoldal — ugyanaz a minta",
          "Ügyféloldali fejlesztés minimalizálható",
        ],
      },
    },
  },
  ai_layer: {
    visualHint: "pipelineThree",
    variants: {
      short: {
        title: "AI réteg",
        bullets: [
          "Web / kontextus elemzés",
          "Decision logika generálás",
          "JSON flow",
        ],
      },
      medium: {
        title: "AI mint core komponens",
        body:
          "Az AI nem „dísz”: a weboldal / kontextus elemzéséből indulhat a releváns döntési szerkezet, majd decision logika generálás és JSON flow készül — így gyorsan iterálható, szerkeszthető rendszer jön létre.",
        bullets: [
          "Elemzés → logika → strukturált flow",
          "A motorhoz illeszkedő tartalom- és elágazás-szerkezet",
        ],
      },
      full: {
        title: "AI réteg részletei",
        body:
          "Weboldal elemzés, decision logika generálás, JSON flow — a brief szerint ez a core komponens. Cél: ne kézzel építs minden elágazást nulláról napokig, hanem strukturált, futtatható döntési gráfot kapj, amit finomíthatsz.",
        bullets: [
          "Kontextus → szabályok és kérdések",
          "JSON: verziózható, átlátható",
          "Gyorsabb pilot és A/B hipotézis",
        ],
      },
    },
  },
  metrics_proof: {
    visualHint: "proofSplit",
    variants: {
      short: {
        title: "Mérhető hatás",
        body:
          "Completion, döntési idő, uplift, útvonal-hatékonyság, drop-off pontok. Fő keret: conversion → revenue.",
      },
      medium: {
        title: "Metrikák és bizonyíték",
        body:
          "A rendszer nem csak „lefut”: completion rate, decision time, conversion uplift, path efficiency és drop-off pontok láthatók. Iparági referencia: +20–35% konverzió, +5–15% bevétel, ~2× interactive uplift irányok (nem garancia).",
        footnote:
          "Iparági baseline állítások; saját mérés szükséges. Belső demo: ~40% gyorsabb döntés; +25–30% több user a termékválasztásig — pilot jelleg.",
      },
      full: {
        title: "Mérhető hatás és adatok",
        body:
          "Fő metrika: conversion → revenue. Másodlagos: decision time, path efficiency, drop-off. Iparági jelzések (lábjegyzet). Belső mérések külön címkézve.",
        stats: [
          { label: "Konverzió (iparági irány)", value: "+20–35%" },
          { label: "Bevétel (iparági irány)", value: "+5–15%" },
          { label: "Interactive uplift (irány)", value: "~2×" },
        ],
        bullets: [
          "Konkurens kategória is nagy upliftet hoz (Zoovu, Aiden, Crobox/Octane — publikus állítások)",
          "Belső demo: ~40% gyorsabb döntés; +25–30% több user termékválasztásig",
        ],
        footnote:
          "Iparági vs belső: külön kezelendő üzenetben és jogilag.",
      },
    },
  },
  competitive: {
    visualHint: "compareColumns",
    variants: {
      short: {
        title: "Versenyképkép",
        body:
          "Enterprise guided selling drága és komplex; quiz toolok gyakran lineárisak; generic formok nem decision engine.",
      },
      medium: {
        title: "Hol áll a Questell?",
        body:
          "Enterprise (Zoovu, Crobox, Neocom, Aiden): erős logika, €400–1000+/hó, komplex. Ecommerce quiz (RevenueHunt, Octane AI): lineárisabb. Generic (Typeform, Outgrow): nincs valódi decision engine. A Questell: embed + decision logic + AI + SMB pricing irány.",
        bullets: [
          "Enterprise: erős, de drága",
          "Quiz tool: lineáris flow limitáció",
          "Questell: decision layer SMB-ben",
        ],
      },
      full: {
        title: "Verseny és piaci rés",
        body:
          "Enterprise: €400–1000+/hó, komplex bevezetés. Quiz toolok: lineáris flow, limitált routing. Generic: nincs decision engine. Konkurens publikus eredmények (+25% Zoovu, 17–26% Aiden guided, 2–6× Crobox/Octane) azt mutatják: a kategória nagy hatást hoz — a Questell a SMB + embed + decision graph rést célozza.",
        bullets: [
          "Stratégia: enterprise túl drága, generic túl gyenge döntésre",
          "Questell: guided conversion system, nem quiz builder",
        ],
        footnote:
          "Versenytárs számok publikus anyagokból — összehasonlító állításnál óvatosság.",
      },
    },
  },
  closest_competitor: {
    visualHint: "checkTable",
    variants: {
      short: {
        title: "Miért nem „quiz tool”?",
        body:
          "A legközelebbi minta gyakran lineáris: nincs decision graph, state logika és routing limitált.",
      },
      medium: {
        title: "Lineáris quiz vs decision system",
        body:
          "RevenueHunt-szerű eszközök: lineáris flow, nincs decision graph, nincs state logika, limitált routing. A Questell decision system generator: állapot, gráf, irányítás.",
        checklist: [
          { ok: false, label: "Lineáris végigkattintás mint fő modell" },
          { ok: true, label: "Állapot-alapú elágazás" },
          { ok: true, label: "Útvonal és drop-off értelmezhetőség" },
          { ok: true, label: "JSON decision flow" },
        ],
      },
      full: {
        title: "Közvetlen összehasonlítási sík",
        body:
          "A brief szerinti legközelebbi kategória: lineáris quiz tool. A Questell különbsége: nem quiz builder, hanem decision system — gráf, állapot, routing.",
        checklist: [
          { ok: false, label: "Lineáris flow mint egyetlen út" },
          { ok: false, label: "Decision graph hiánya" },
          { ok: false, label: "State logika hiánya" },
          { ok: true, label: "Questell: döntési gráf + állapot + irányítás" },
        ],
      },
    },
  },
  positioning_messaging: {
    visualHint: "badgeRow",
    variants: {
      short: {
        title: "Pozíció",
        body: "Decision layer. Guided conversion system. Nem quiz — decision engine.",
        badges: ["Decision layer", "Guided conversion"],
      },
      medium: {
        title: "Core messaging",
        body:
          "Nem quiz. Decision engine. Forgalomból döntés → bevétel. Buyer nyelv: interactive product finder, guided selection tool — a szövegben leírjuk, hogy nem klasszik kvíz, hanem döntésvezérelt ajánlás.",
        badges: ["Decision engine", "Guided conversion", "Product finder"],
      },
      full: {
        title: "Pozicionálás és adoption trigger",
        body:
          "A Questell decision layer és guided conversion system. Adoption trigger: nem működik a funnel, alacsony a konverzió, nyomás van — „kell valami új”. Buyer nyelv: interactive product finder, guided selection tool, quiz that leads to product — mindezt egy mondatban pontosítjuk: döntésvezérelt réteg, nem szórakoztató kvíz.",
        badges: ["Decision layer", "Guided conversion", "Forgalom → bevétel"],
        bullets: [
          "Üzenet: strukturált döntés, nem több szöveg",
          "Kimenet: konverzió és revenue fókusz",
        ],
      },
    },
  },
  offer_pricing_cta: {
    visualHint: "pricingGrid",
    variants: {
      short: {
        title: "Belépés",
        body:
          "€179 egyszeri build (flow + logika + embed + analitika), majd SaaS: €59 / 1 flow, €119 / 3 flow, €199+ scale.",
      },
      medium: {
        title: "MVP ajánlat",
        body:
          "Nem „csak tool előfizetés”: működő rendszer induláshoz. €179 build, utána futás és mérés SaaS modellben.",
        pricing: [
          { name: "Starter", price: "€59/hó", detail: "1 flow" },
          { name: "Growth", price: "€119/hó", detail: "3 flow" },
          { name: "Scale", price: "€199+", detail: "több / egyeztetés" },
        ],
        checklistOffer: [
          "Flow építés + logika / struktúra",
          "Embed",
          "Analitika",
        ],
        footnote:
          "Outcome állítások (+15–25% több döntés, ~20% több checkout) pilot / belső jelleggel kezelendők, amíg nincs publikus case study.",
      },
      full: {
        title: "Árazás és következő lépés",
        body:
          "SaaS: €59 / hó — 1 flow; €119 / hó — 3 flow; €199+ — scale. Belépési ajánlat: €179 egyszeri — flow építés, logika + struktúra, embed, analitika. Utána a flow fut, az eredmény mérhető. Kulcs: nem tool, hanem működő rendszer induláshoz.",
        pricing: [
          { name: "Build", price: "€179", detail: "egyszeri — induló rendszer" },
          { name: "Starter", price: "€59/hó", detail: "1 flow" },
          { name: "Growth", price: "€119/hó", detail: "3 flow" },
        ],
        checklistOffer: [
          "Flow + döntési struktúra",
          "Embed (iframe)",
          "Analitika és export irány",
          "SaaS: futás és skálázás",
        ],
        footnote:
          "Pilot eredmények külön címkézve; ügyfélnél mindig saját mérés.",
      },
    },
  },
};
