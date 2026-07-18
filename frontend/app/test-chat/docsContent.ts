/**
 * A `/test-chat` demo oldal alatti `DocsSection` adatforrása.
 * Az adat a story-független engine + a komplaint demo köré épül.
 * Free-text átírás bátran — a `DocBlock` discriminated union ad keretet.
 */

export type CodeLang = "json" | "ts" | "bash" | "http";

export type DocBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "bullets"; items: string[] }
  | { kind: "code"; lang: CodeLang; code: string; caption?: string }
  | { kind: "callout"; tone: "info" | "warn" | "tip"; title?: string; text: string };

export type DocSection = {
  /** URL anchor slug, pl. "pipeline". A sticky ToC ide scrollol. */
  anchor: string;
  /** A bal sticky ToC-ben megjelenő rövid címke. */
  navLabel: string;
  /** A szekció címe (h3). */
  title: string;
  /** Egysoros lead a cím alatt — opcionális. */
  lead?: string;
  /** Tartalom blokkok. */
  blocks: DocBlock[];
};

export const DOCS_TITLE = "Hogyan működik ez a flow";
export const DOCS_LEAD =
  "Egy story JSON + egy backend endpoint. A user szabad szöveggel ír, a rendszer kondíciókat ismer fel, és a folyamat végén egy strukturált ticket kerül egy ügyintézői csapathoz.";

export const DOCS_SECTIONS: DocSection[] = [
  {
    anchor: "setup",
    navLabel: "Bekapcsolás",
    title: "1. Bekapcsolás — mi kell hozzá",
    lead: "Minimum: egy story JSON a backenden és az ai-node endpoint.",
    blocks: [
      {
        kind: "paragraph",
        text:
          "A demo a refurbished-electronics complaint-intake story-t használja " +
          "(`backend/stories/ai_complaint_story_v3.json`). A frontend a `/api/ai-node/process` " +
          "SSE végpontot hívja: ez ugyanaz az endpoint, amit egy éles beágyazás is használ.",
      },
      {
        kind: "bullets",
        items: [
          "Backend: FastAPI + Anthropic Messages API (Claude).",
          "Story: egy validált JSON fájl a `backend/stories/` mappában.",
          "Order context: opcionális — a demo CSV-ből húz mock rendeléseket.",
          "Embed: egyetlen POST kérés, SSE-streammel (meta / delta / done eseményekkel).",
        ],
      },
      {
        kind: "code",
        lang: "http",
        caption: "A demó által hívott endpoint — pontosan ezt használnád élesben is.",
        code:
          "POST /api/ai-node/process\n" +
          "Content-Type: application/json\n\n" +
          "{\n" +
          '  "src": "ai_complaint_story_v3",\n' +
          '  "pageId": "complaint-intake",\n' +
          '  "prompt": "A csomagom 5 napja késik, ORD-CUST-002",\n' +
          '  "satisfiedConditions": [],\n' +
          '  "order_id": null,\n' +
          '  "sessionId": "demo-1234",\n' +
          '  "stream": true\n' +
          "}",
      },
      {
        kind: "callout",
        tone: "tip",
        title: "Próbáld ki",
        text:
          "A bal oldalon kattints egy rendelésszámra (pl. ORD-CUST-002), másold ki, " +
          "és írd be a chat üzenetbe egy szabad-szöveges panasszal. A rendszer felismeri, " +
          "kondíciókat illeszt rá, és onnan vezeti a beszélgetést.",
      },
    ],
  },
  {
    anchor: "pipeline",
    navLabel: "Pipeline",
    title: "2. Mi történik a háttérben",
    lead: "Egy üzenet → kondíciók → routing → AI válasz. Mindegyik lépés a jobb oldali Process panelen is látszik.",
    blocks: [
      {
        kind: "paragraph",
        text:
          "Ez nem egy szabad LLM-prompt. Minden válasznak van egy konkrét helye a story " +
          "node-gráfjában. A backend először eldönti, hogy melyik node-on vagy, kiértékeli " +
          "a kondíciókat (a user üzenetéből, plus a már ismert order_context-ből), és csak " +
          "azután fut a generatív AI a tényleges válaszra.",
      },
      {
        kind: "bullets",
        items: [
          "1) Beérkezés — a backend megkapja a user üzenetét + a session állapotot.",
          "2) Feldolgozás — node-match: melyik AI-node aktív (embedding + scope_keywords).",
          "3) Kondíciók illesztve — a meta.condition_definitions szabályai szerint új kondíciók kerülnek a satisfied listába.",
          "4) Routing — a node routing-szabálya eldönti: maradjunk-e, ugorjunk-e másik node-ra, vagy zárjunk end-page-re.",
          "5) Válasz kész — a generatív AI streameli a válaszbuborékot (SSE delta).",
        ],
      },
      {
        kind: "callout",
        tone: "info",
        title: "Determinisztikus döntés, generált szöveg",
        text:
          "A routing-döntés deterministic: ugyanaz a satisfiedConditions halmaz mindig ugyanoda " +
          "vezet. A választ adó szöveg AI-generált, de a story `reply_rules` korlátozza, hogy " +
          "miről beszélhet és milyen hangnemben.",
      },
    ],
  },
  {
    anchor: "ticket",
    navLabel: "Ticket output",
    title: "3. A kimenet: strukturált ticket",
    lead: "Amikor a flow end-page-re ér, egy `Ticket` payload-ot kapsz — ezt küldöd a CRM-be vagy a JIRA-ba.",
    blocks: [
      {
        kind: "paragraph",
        text:
          "Az end-node `ticket` blokkja a kategóriát, prioritást, routing target-et és evidence-feltételeket " +
          "deklarálja. A `TicketBuilder` ebből + a session-ben összegyűlt satisfiedConditions-ból + az " +
          "order_context-ből épít egy teljes ticket-et, amit a `TicketSink` továbbít.",
      },
      {
        kind: "code",
        lang: "json",
        caption: "Példa ticket — pontosan ez érkezik a `/api/ai-node/process` válaszában az end-node-on.",
        code:
          "{\n" +
          '  "ticket_id": "TCK-2026-06-15-A3F2K9",\n' +
          '  "created_at": "2026-06-15T12:08:43Z",\n' +
          '  "story_id": "ai_complaint_story_v3",\n' +
          '  "session_id": "demo-1234",\n' +
          '  "order_id": "ORD-CUST-002",\n' +
          '  "end_page_id": "delivery-investigation",\n' +
          '  "category": "delivery_late",\n' +
          '  "priority": "high",\n' +
          '  "routing_target": "courier_investigation_team",\n' +
          '  "evidence": [\n' +
          '    {"id": "has_order_id", "label": "Rendelésszám megadva"},\n' +
          '    {"id": "package_late_5_days", "label": "Csomag 5+ napja késik"}\n' +
          "  ],\n" +
          '  "customer_actions_required": ["keep_packaging_until_inspection"],\n' +
          '  "summary": "5 napos késedelem az ORD-CUST-002 rendelésnél, futárkövetés szükséges."\n' +
          "}",
      },
      {
        kind: "bullets",
        items: [
          "A `TicketSink` interface mögött jelenleg egy JSONL fájl sink fut (`backend/data/tickets/`).",
          "CRM / Zendesk / JIRA sink hozzáadása egy új osztály a `services/ticket_sinks.py`-ban.",
          "A `(session_id, end_page_id)` páros idempotens: ugyanaz a flow nem generál duplikátum ticket-et.",
        ],
      },
    ],
  },
  {
    anchor: "customize",
    navLabel: "Saját flow",
    title: "4. Mit állíthatsz át — saját domain bekötése",
    lead: "Ez a demo egy panaszkezelő flow. Ugyanezzel a runtime-mal építhetsz onboarding-, product-finder- vagy bármilyen döntés-vezérelt flow-t.",
    blocks: [
      {
        kind: "paragraph",
        text:
          "A story-formátum dokumentált: minden flow egy JSON, ami a node-gráfot, a kondíciókat és " +
          "a routing-szabályokat írja le. A `services/onboarding/` pipeline egy AI-asszisztált " +
          "wizard-flow-t kínál: research-text → blueprint → per-node generálás → lint → " +
          "semantic audit. A végeredmény egy működő story.",
      },
      {
        kind: "bullets",
        items: [
          "Új node-ok és kondíciók: szerkeszthetők a story JSON-ban, a `lint_full_story` validál.",
          "Külső adatforrás (CRM, rendelés-adatbázis): `meta.order_context_mapping.field_rules` deklarálja, mely mezőből milyen kondíció lesz automatikusan satisfied.",
          "Új ticket-kategóriák: új end-page + ticket-blokk a story-ban.",
          "Stílus / hangnem: a story `reply_rules` mezője szabályozza node-onként.",
        ],
      },
      {
        kind: "callout",
        tone: "info",
        title: "Onboarding pipeline (hamarosan UI is)",
        text:
          "Jelenleg a story-építés CLI-ből megy (`scripts/onboarding_phase1_poc.py` és társai). " +
          "A dashboard alatti AI-asszisztált wizard a következő körben kerül be, ami visual-first " +
          "az egész research → story flow-ra.",
      },
    ],
  },
  {
    anchor: "limits",
    navLabel: "Korlátok",
    title: "5. Mit NEM csinál a Questell",
    lead: "Tisztán határolt scope: a Questell a döntéshozó réteg. Nem CRM, nem ügyintézői dashboard, nem külső integrációs platform.",
    blocks: [
      {
        kind: "bullets",
        items: [
          "Nem CRM: a kibocsátott ticket-et a saját rendszered (Zendesk, Salesforce, JIRA) fogadja a TicketSink-en keresztül.",
          "Nem ügyintézői felület: a ticket-et az ügyintéződ a saját megszokott eszközében nyitja meg.",
          "Nem szabad LLM: a beszélgetés mindig a story node-gráfjában mozog — nincs szabad hallucinálási tér.",
          "Egyelőre egyetlen modell: az AI-réteg az Anthropic Claude-ra van rákötve; alternatív providerek később jönnek.",
          "Nem auto-publish: új story JSON-t Te (vagy a wizard) commit-olja, a runtime onnan tölti be.",
        ],
      },
      {
        kind: "callout",
        tone: "warn",
        title: "Demo-forgalom",
        text:
          "Ez egy demo, nem éles ügyfél-bejövő. Ha valódi ügyfeleknek nyitnál meg egy flow-t, " +
          "kérj a Questell csapattól rate-limit + analytics tagging beállítást — különben a demo " +
          "és az éles forgalom összemosódik az analyticsban.",
      },
    ],
  },
];
