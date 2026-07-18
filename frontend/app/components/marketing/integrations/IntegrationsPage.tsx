"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  PRESENT_LANG_CHANGED_EVENT,
  readPresentLangFromStorage,
} from "@/app/present/presentLangSync";
import s from "./integrationsPage.module.scss";

type UiLang = "en" | "hu";

const CHATBOT_CTA: Record<UiLang, string> = {
  hu: "Készítsd el a saját chatbotodat",
  en: "Build your own chatbot",
};

function ImagePlaceholder({ type, label }: { type: string; label: string }) {
  return (
    <div className={s.imagePlaceholder} data-type={type} role="img" aria-label={label}>
      <div className={s.mockSkeleton} aria-hidden>
        <div className={s.mockChrome}>
          <span className={s.mockDot} />
          <span className={s.mockDot} />
          <span className={s.mockDot} />
        </div>
        <div className={s.mockBar} />
        <div className={s.mockBarShort} />
        <div className={s.mockPills}>
          <span className={s.mockPill} />
          <span className={s.mockPill} />
          <span className={s.mockPill} />
        </div>
      </div>
      <span className={s.imagePlaceholderLabel}>{label}</span>
    </div>
  );
}

export default function IntegrationsPage() {
  const [lang, setLang] = useState<UiLang>("en");
  const isHu = lang === "hu";

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
      window.removeEventListener(
        PRESENT_LANG_CHANGED_EVENT,
        onLangChanged as EventListener,
      );
  }, []);

  const heroImageLabel = isHu
    ? "Meglévő chat felületed bal oldalon, egy kapcsolat a Questell döntéshozóba, strukturált kimenet jobbra"
    : "Existing chatbot on the left, single connection into Questell decision engine, structured output on the right";

  return (
    <article className={s.page}>
      <section className={`${s.zigzagSection} ${s.heroOe}`} aria-labelledby="int-hero-heading">
        <div className={s.sectionInner} style={{ opacity: 1, transform: "none" }}>
          <div className={s.oeZigzagRow}>
            <div className={s.zigzagVisual}>
              <ImagePlaceholder type="hero-integrations" label={heroImageLabel} />
            </div>
            <div className={s.zigzagText}>
              <p className={s.eyebrow}>{isHu ? "Integráció" : "Integrations"}</p>
              <h1 id="int-hero-heading" className={s.heroTitle}>
                {isHu ? (
                  <>
                    A logika a chatbotod mögött ül.
                    Nem a helyén.
                  </>
                ) : (
                  <>
                    The intelligence sits behind your chatbot.
                    Not in place of it.
                  </>
                )}
              </h1>
              <p className={s.lead}>
                {isHu
                  ? "A legtöbb döntési motor arra kényszerít, hogy lecseréld a chatfelületet, amiben az ügyfeleid már megbíznak. A Questell mögé csatlakozik — döntési rétegként, ami ismeri a rendszereidet, követi az üzleti szabályaidat, és minden beszélgetést egy strukturált esettel zár, amivel a csapatod azonnal tud dolgozni."
                  : "Most decision engines force you to replace the chat surface your customers already trust. Questell connects behind it as the decision layer that knows your systems, follows your business rules, and closes every conversation with a structured case your operators can act on."}
              </p>
              <div className={s.heroActions}>
                <Link href="/about" className={s.btnPrimary}>
                  {CHATBOT_CTA[lang]}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={s.zigzagSection} aria-labelledby="int-speed-heading">
        <div className={s.sectionInner} style={{ opacity: 1, transform: "none" }}>
          <div className={s.bandTop}>
            <div
              className={s.zigzagText}
              style={{ maxWidth: "72rem", width: "100%", marginInline: "auto", textAlign: "center" }}
            >
              <div className={s.sectionHeader} style={{ marginInline: "auto" }}>
                <h2 id="int-speed-heading" className={s.sectionHeading}>
                  {isHu
                    ? "Három csatlakozási pont. Egyik sem cseréli le, amit ma használsz."
                    : "Three connection points. None of them replace what you already run."}
                </h2>
              </div>
              <p className={s.prose} style={{ marginInline: "auto" }}>
                {isHu
                  ? "Egy bejövő adapter az üzenetforrásodhoz. Egy kontextus-adapter az adataidhoz. Egy kimenő sink a végeredménynek. A meglévő stacked mindegyikbe önállóan csatlakozik."
                  : "An inbound adapter for your message source. A context adapter for your data. An outbound sink for your output. Your existing stack plugs into each one independently."}
              </p>
              <div className={s.oeCardRow} role="list" style={{ marginTop: "1rem" }}>
                <div className={s.oeCard} role="listitem">
                  <h3 className={s.oeCardTitle}>{isHu ? "Bejövő" : "Inbound"}</h3>
                  <p className={s.oeCardBody}>
                    {isHu
                      ? "Bármilyen felület, ami üzenetet tud küldeni, egyetlen endpoint-ra csatlakozik. A beszélgetést onnan a Questell viszi."
                      : "Any surface that can send a message connects to a single endpoint. Questell handles the conversation from there."}
                  </p>
                </div>
                <div className={s.oeCard} role="listitem">
                  <h3 className={s.oeCardTitle}>{isHu ? "Kontextus" : "Context"}</h3>
                  <p className={s.oeCardBody}>
                    {isHu
                      ? "A Questell beszélgetés közben húzza ki a releváns adatokat a meglévő rendszereidből. Amit már tud, azt nem kérdezi újra."
                      : "Questell pulls relevant data from your existing systems mid-conversation. What it already knows, it does not ask."}
                  </p>
                </div>
                <div className={s.oeCard} role="listitem">
                  <h3 className={s.oeCardTitle}>{isHu ? "Kimenő" : "Outbound"}</h3>
                  <p className={s.oeCardBody}>
                    {isHu
                      ? "Amikor a flow lezárul, a Questell egy strukturált kimenetet ad, és odaszállítja, ahol a csapatod dolgozik."
                      : "When the flow closes, Questell produces a structured output and delivers it to wherever your team works."}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={s.zigzagSection} aria-labelledby="int-inbound-heading">
        <div className={s.sectionInner} style={{ opacity: 1, transform: "none" }}>
          <div className={s.oeZigzagRow}>
            <div className={s.zigzagVisual}>
              <ImagePlaceholder
                type="inbound"
                label={
                  isHu
                    ? "Több üzenetforrás csatlakozik egyetlen Questell endpoint-ba"
                    : "Multiple message sources connecting into a single Questell endpoint"
                }
              />
            </div>
            <div className={s.zigzagText}>
              <div className={s.sectionHeader}>
                <h2 id="int-inbound-heading" className={s.sectionHeading}>
                  {isHu ? "Egy endpoint. Bármilyen üzenetforrás." : "One endpoint. Any message source."}
                </h2>
              </div>
              <p className={s.prose}>
                {isHu
                  ? "A csatorna nem számít. Egy chat widget, egy messaging platform, egy hangbot, egy űrlap — bármi, ami üzenetet tud küldeni, ugyanazon a módon csatlakozik a Questellhez. Egy endpoint kezeli az összes felületet, amit ma használsz, és amit később hozzáadsz."
                  : "The channel does not matter. A chat widget, a messaging platform, a voice interface, a form submission, anything that can send a message connects to Questell the same way. One endpoint handles every surface you already support, and any surface you add later."}
              </p>
              <p className={s.prose}>
                {isHu
                  ? "Az ügyféloldalon semmi nem változik. A felület ugyanazt rendereli, mint korábban. A Questell visszaadja a következő választ és a frissített állapotot. A többi láthatatlan."
                  : "Nothing on the customer-facing side needs to change. The calling surface renders what it always rendered. Questell returns the next reply and the updated state. The rest is invisible."}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className={s.zigzagSection} aria-labelledby="int-context-heading">
        <div className={s.sectionInner} style={{ opacity: 1, transform: "none" }}>
          <div className={s.oeZigzagRow}>
            <div className={s.zigzagText}>
              <div className={s.sectionHeader}>
                <h2 id="int-context-heading" className={s.sectionHeading}>
                  {isHu
                    ? "A Questell olvassa a rendszereidet. Hogy a flow ne kelljen kérdezzen."
                    : "Questell reads your systems. So the flow does not have to ask."}
                </h2>
              </div>
              <p className={s.prose}>
                {isHu
                  ? "A legtöbb conversational flow olyan információt kér az ügyféltől, amit a cég már ismer. A Questell ezt megfordítja. Amikor releváns hivatkozás kerül elő a beszélgetésben, a Questell egy kontextus-adapteren keresztül lekérdezi a meglévő rendszeredet, és a választ kondíciókká alakítja, amikre a flow tud reagálni."
                  : "Most conversational flows ask the user for information the company already has. Questell inverts this. When a relevant reference appears in the conversation, Questell queries your existing system through a context adapter and converts the response into conditions the flow can act on."}
              </p>
              <p className={s.prose}>
                {isHu
                  ? "Az adapter ahhoz csatlakozik, ami az adataidat tartja: REST API, GraphQL endpoint, belső adatbázis, harmadik féltől származó platform. Az adatforrás cseréje nem írja át a flow-t."
                  : "The adapter connects to whatever holds your data: a REST API, a GraphQL endpoint, an internal database, a third-party platform. The flow does not change when the data source changes."}
              </p>
              <p className={s.prose}>
                {isHu
                  ? "Amit a rendszered tud, azt az ügyfél nem kérdezi vissza."
                  : "What your system knows, the customer does not get asked."}
              </p>
            </div>
            <div className={s.zigzagVisual}>
              <ImagePlaceholder
                type="context"
                label={
                  isHu
                    ? "A beszélgetésből kiemelt hivatkozás, a kontextus-adapter lekérdezi a külső rendszert, kondíciók teljesülnek"
                    : "Reference extracted from conversation, context adapter querying external system, conditions satisfied"
                }
              />
            </div>
          </div>
        </div>
      </section>

      <section className={s.zigzagSection} aria-labelledby="int-outbound-heading">
        <div className={s.sectionInner} style={{ opacity: 1, transform: "none" }}>
          <div className={s.oeZigzagRow}>
            <div className={s.zigzagVisual}>
              <ImagePlaceholder
                type="outbound"
                label={
                  isHu
                    ? "Strukturált output kártya helpdeskre, CRM-be és belső sorba routolva"
                    : "Structured output card routing to helpdesk, CRM, and internal queue"
                }
              />
            </div>
            <div className={s.zigzagText}>
              <div className={s.sectionHeader}>
                <h2 id="int-outbound-heading" className={s.sectionHeading}>
                  {isHu
                    ? "Minden lezárt flow valami olyat ad, amivel a csapatod tud dolgozni."
                    : "Every closed flow produces something your team can act on."}
                </h2>
              </div>
              <p className={s.prose}>
                {isHu
                  ? "A Questell flow-k nem egy átirattal érnek véget. Egy definiált végponton zárnak, ami pontosan deklarálja, hogyan néz ki a kimenet: a kategóriáját, a prioritását, hova route-ol, milyen evidencia támasztja alá, és milyen következő akció szükséges."
                  : "Questell flows do not end with a transcript. They end on a defined endpoint that declares exactly what the output looks like: its category, its priority, where it routes, what evidence supports it, what actions are required next."}
              </p>
              <p className={s.prose}>
                {isHu
                  ? "Az ügyintéző nem egy beszélgetést olvas el, és dönti el, mi a teendő. Egy kész ügyet nyit meg, és aszerint cselekszik. Ez a különbség egy chat log és egy strukturált kimenet között."
                  : "The operator does not read a conversation and decide what to do. They open a finished case and act on it. That is the difference between a chat log and a structured output."}
              </p>
              <p className={s.prose}>
                {isHu
                  ? "A kimenet oda kerül, ahol a csapatod amúgy is dolgozik. Egy sink csatlakoztatja a Questellt a helpdeskhez, a CRM-hez, a belső sorhoz. Egy kimenet sessionönként. Teljes audit nyom, automatikusan, minden beszélgetés mellé."
                  : "The output goes wherever your team already works. One sink connects Questell to your helpdesk, your CRM, your internal queue. One output per session. A full audit trail written automatically alongside every conversation."}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className={s.finalSection} aria-labelledby="int-final-heading">
        <div className={s.sectionInner} style={{ opacity: 1, transform: "none" }}>
          <div className={s.ctaPanel}>
            <h2 id="int-final-heading" className={s.finalStatement}>
              {isHu
                ? "Három csatlakozási pont. Egyik sem cseréli le, amit ma használsz."
                : "Three connection points. None of them replace what you already run."}
            </h2>
            <p className={s.finalLead}>
              {isHu
                ? "Egy bejövő adapter az üzenetforrásodhoz. Egy kontextus-adapter az adataidhoz. Egy kimenő sink a végeredménynek. Szándékosan keskeny, hogy bármelyik stack-be beférjen migráció nélkül."
                : "An inbound adapter for your message source. A context adapter for your data. An outbound sink for your output. Narrow by design, so it fits into any stack without a migration."}
            </p>
            <div className={s.ctaPanelActions} style={{ justifyContent: "center" }}>
              <Link href="/about" className={s.btnPrimary}>
                {CHATBOT_CTA[lang]}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </article>
  );
}
