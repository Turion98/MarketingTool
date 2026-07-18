"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  PRESENT_LANG_CHANGED_EVENT,
  readPresentLangFromStorage,
} from "@/app/present/presentLangSync";
import s from "./productFinderPage.module.scss";

type ExpandKey = "problem" | "why" | "approach" | "narrow" | "feel" | "skincare" | "embed";

type RevealKey =
  | "hero"
  | "problem"
  | "why"
  | "approach"
  | "narrow"
  | "feel"
  | "skincare"
  | "embed"
  | "final";

function cx(...parts: (string | false | undefined | null)[]) {
  return parts.filter(Boolean).join(" ");
}

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

export default function ProductFinderPage() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [lang, setLang] = useState<"en" | "hu">("en");
  const [moreId, setMoreId] = useState<ExpandKey | null>(null);
  const [revealById, setRevealById] = useState<Partial<Record<RevealKey, boolean>>>({});
  const isHu = lang === "hu";

  useEffect(() => {
    const saved = readPresentLangFromStorage();
    if (saved) setLang(saved);
    const onLangChanged = (ev: Event) => {
      const detail = (ev as CustomEvent<{ lang?: "en" | "hu" }>).detail;
      const next = detail?.lang;
      if (next === "hu" || next === "en") setLang(next);
    };
    window.addEventListener(PRESENT_LANG_CHANGED_EVENT, onLangChanged as EventListener);
    return () =>
      window.removeEventListener(PRESENT_LANG_CHANGED_EVENT, onLangChanged as EventListener);
  }, []);

  useEffect(() => {
    const allVisible: Partial<Record<RevealKey, boolean>> = {
      hero: true,
      problem: true,
      why: true,
      approach: true,
      narrow: true,
      feel: true,
      skincare: true,
      embed: true,
      final: true,
    };
    setRevealById(allVisible);
  }, []);

  return (
    <article ref={rootRef} className={s.page}>
      {/* SECTION 1, HERO */}
      <section
        className={cx(
          s.zigzagSection,
          s.heroZigzag,
          revealById.hero && s.isVisible
        )}
        data-reveal
        data-reveal-id="hero"
        aria-labelledby="pf-hero-heading"
      >
        <div className={s.sectionInner}>
          <div className={s.zigzagInner}>
            <div className={s.zigzagText}>
              <div className={s.sectionHeader}>
                <p className={s.eyebrow}>{isHu ? "Use case, E-kereskedelem" : "Use case, Ecommerce"}</p>
                <h1 id="pf-hero-heading" className={s.heroTitle}>
                  <span className={s.heroTitleFirst}>
                    {isHu ? "A látogató megérkezik az oldaladra." : "A visitor lands on your store."}
                  </span>{" "}
                  {isHu
                    ? "Már tudja, hogy valamilyen bőrápoló terméket keres."
                    : "They already know they are looking for a skincare product."}
                </h1>
              </div>
              <p className={s.lead}>
                {isHu
                  ? "Leírásokat és értékeléseket is olvasott, mégis kiléphet, mert semmi nem mutatja egyértelműen, melyik termék illik rá, nem azért, mert ne bízna benned."
                  : "They may have read descriptions and reviews, and still leave because nothing clearly says which product is theirs, not because they distrust you."}
              </p>
              <p className={s.lead}>
                {isHu
                  ? "Az oldal nem zárja le az információ és a döntés közti rést."
                  : "The page never closes the gap between information and choice."}
              </p>
              <div className={s.heroActions}>
                <Link href="/about" className={s.btnPrimary}>
                  {isHu ? "Készítsd el a saját chatbotodat" : "Build your own chatbot"}
                </Link>
                <Link href="/test-chat" className={s.btnSecondary}>
                  {isHu ? "Próbáld ki élőben" : "Try the live demo"}
                </Link>
              </div>
            </div>
            <div className={s.zigzagVisual}>
              <ImagePlaceholder
                type="hero-product-finder"
                label={isHu ? "Termékajánló felület előnézet" : "Product finder UI preview"}
              />
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2, THE PROBLEM */}
      <section
        className={cx(s.zigzagSection, revealById.problem && s.isVisible, moreId === "problem" && s.sectionExpandOpen)}
        data-reveal
        data-reveal-id="problem"
        aria-labelledby="pf-problem-heading"
      >
        <div className={s.sectionInner}>
          <div className={s.zigzagInner}>
            <div className={s.zigzagText}>
              <div className={s.sectionHeader}>
                <p className={s.sectionKicker}>{isHu ? "A probléma" : "The problem"}</p>
                <h2 id="pf-problem-heading" className={s.sectionHeading}>
                  {isHu ? "A katalógus tele van, a döntés viszont nincs felépítve" : "The catalog is full, the decision is not built"}
                </h2>
              </div>
              <p className={s.prose}>
                {isHu ? <>Az oldalad már megválaszolja, hogy <strong>mi létezik</strong>.</> : <>Your store already answers <strong>what exists</strong>.</>}
                <br />
                {isHu
                  ? <>A vásárlónak viszont arra is szüksége van, hogy <strong>mi illik rá</strong>, és enélkül általában a bizonytalanság győz.</>
                  : <>Shoppers still need <strong>what fits them</strong>, and without that guidance, hesitation usually wins.</>}
              </p>
              {moreId !== "problem" && (
                <button
                  type="button"
                  className={s.expandTrigger}
                  aria-expanded={false}
                  aria-controls="pf-expand-problem"
                  onClick={() => setMoreId("problem")}
                >
                  {isHu ? "További részletek" : "More detail"}
                </button>
              )}
            </div>
            <div className={s.zigzagVisual}>
              <ImagePlaceholder
                type="problem-static-page"
                label={
                  isHu
                    ? "Statikus e-kereskedelmi oldal túl sok opcióval"
                    : "Static ecommerce page with too many choices"
                }
              />
            </div>
          </div>
          <div
            id="pf-expand-problem"
            className={cx(s.expandHost, moreId === "problem" && s.expandHostOpen)}
            aria-hidden={moreId !== "problem"}
          >
            <div className={s.expandHostInner}>
              <div className={s.expandSurface}>
                <div className={s.expandTwoCol}>
                  <div className={s.detailProse}>
                    <p>
                      {isHu
                        ? "A legtöbb e-kereskedelmi oldalon az információ már eleve rendelkezésre áll. A termékek logikus kategóriákban vannak, a leírások pontosak, a szűrők úgy működnek, ahogy a vásárlók várják. A bolt nézőpontjából a polc teljes."
                        : "In most ecommerce stores, the information is already there. Products are organized into sensible categories, descriptions are accurate, and filters behave the way shoppers expect. From the store&apos;s point of view, the shelf is complete."}
                    </p>
                    <p>
                      {isHu ? (
                        <>
                          A vásárló viszont nem csak böngészési helyzetben van. Egy{" "}
                          <strong>döntési helyzetben</strong> van: több hihető opció, hasonló ígéretek,
                          és nincs egyértelmű jel, melyik út az övé. Az oldal azt megválaszolja, hogy
                          „mi létezik”; azt is meg kell válaszolnia, hogy „mi illik ehhez az emberhez,
                          ebben a helyzetben”. Ha ez a második réteg hiányzik, a bizonytalanság győz,
                          és ez leggyakrabban kilépéshez vezet, nem kosárhoz.
                        </>
                      ) : (
                        <>
                          Yet the customer is not in a browsing situation alone. They are in a{" "}
                          <strong>decision situation</strong>: several plausible products, similar
                          claims, and no clear signal about which path is theirs. The store answers
                          &quot;what exists&quot;; it still has to answer &quot;what fits this person, in
                          this context.&quot; When that second layer is missing, hesitation wins, and
                          hesitation usually ends in an exit tab, not in a cart.
                        </>
                      )}
                    </p>
                  </div>
                </div>
                {moreId === "problem" && (
                  <button
                    type="button"
                    className={s.expandCloseStrip}
                    aria-label={isHu ? "Részletek bezárása" : "Close details"}
                    onClick={() => setMoreId(null)}
                  >
                    <span className={s.expandCloseStripLabel}>{isHu ? "Bezárás" : "Close"}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3, WHY ONE ANSWER IS NOT ENOUGH */}
      <section
        className={cx(
          s.zigzagSection,
          s.whyOneAnswer,
          revealById.why && s.isVisible,
          moreId === "why" && s.sectionExpandOpen
        )}
        data-reveal
        data-reveal-id="why"
        aria-labelledby="pf-one-answer-heading"
      >
        <div className={s.sectionInner}>
          <div className={s.sectionSurface}>
            <div className={s.whyOneAnswerColumn}>
            <div className={s.whyOneAnswerTop}>
              <div className={s.sectionHeader}>
                <p className={s.sectionKicker}>{isHu ? "Miért nem elég egy válasz" : "Why one answer is not enough"}</p>
                <h2 id="pf-one-answer-heading" className={s.sectionHeading}>
                  {isHu ? (
                    <>
                      Az emberek nem címkék alapján döntenek.
                      <br />
                      Hanem felismerhető mintázatok alapján.
                    </>
                  ) : (
                    <>
                      People don&apos;t decide from labels.
                      <br />
                      They decide from patterns they recognize.
                    </>
                  )}
                </h2>
              </div>
              <p className={s.prose}>{isHu ? "Egy termékoldal tiszta válaszokat ad." : "A product page gives clear answers."}</p>
              <p className={s.prose}>
                {isHu ? (
                  <>
                    De a vásárló nem egyetlen választ keres.
                    <br />
                    Azt próbálja megérteni, mi történik vele.
                  </>
                ) : (
                  <>
                    But a buyer isn&apos;t looking for an answer
                    <br />
                    they&apos;re trying to understand what&apos;s happening to them.
                  </>
                )}
              </p>
            </div>

            <div className={s.whyOneAnswerCardRow} role="list">
              <div className={s.card} role="listitem">
                <h4 className={s.cardTitle}>{isHu ? "Napközben" : "During the day"}</h4>
                <p className={s.cardLead}>{isHu ? "Nem marad ugyanaz" : "It doesn&apos;t stay the same"}</p>
                <p className={s.cardBody}>{isHu ? "Reggel rendben." : "Fine in the morning."}</p>
                <p className={s.cardBody}>{isHu ? "Délutánra zsírosodik." : "Oily by the afternoon."}</p>
                <p className={s.cardBody}>
                  {isHu
                    ? "Ami a nap egyik pontján jónak tűnik, pár órával később már rossznak érződhet."
                    : "What feels right at one point in the day can feel wrong a few hours later."}
                </p>
              </div>
              <div className={s.card} role="listitem">
                <h4 className={s.cardTitle}>{isHu ? "Eltérő zónák" : "Different areas"}</h4>
                <p className={s.cardLead}>{isHu ? "Egy arc, eltérő igények" : "One face, different needs"}</p>
                <p className={s.cardBody}>{isHu ? "Száraz orca. Fénylő T-zóna." : "Dry cheeks. Shiny T-zone."}</p>
                <p className={s.cardBody}>
                  {isHu
                    ? "Ha az egyik területre választasz, gyakran kompromisszumot kötsz a másikon."
                    : "Choosing for one area often means compromising on another."}
                </p>
              </div>
              <div className={s.card} role="listitem">
                <h4 className={s.cardTitle}>{isHu ? "Termék kipróbálása után" : "After trying a product"}</h4>
                <p className={s.cardLead}>{isHu ? "Az elvárás használat közben törik meg" : "Expectation breaks on use"}</p>
                <p className={s.cardBody}>{isHu ? "Papíron jónak tűnik." : "Looks right on paper."}</p>
                <p className={s.cardBody}>{isHu ? "Használatban mégsem jó." : "Feels wrong in practice."}</p>
                <p className={s.cardBody}>
                  {isHu
                    ? "Az összetevők és ígéretek logikusak, amíg a valós élmény mást nem mutat."
                    : "Ingredients and promises make sense, until real experience says otherwise."}
                </p>
              </div>
              <div className={s.card} role="listitem">
                <h4 className={s.cardTitle}>{isHu ? "Közvetlenül tisztítás után" : "Right after cleansing"}</h4>
                <p className={s.cardLead}>{isHu ? "Az első jel ad irányt" : "The first signal sets direction"}</p>
                <p className={s.cardBody}>{isHu ? "Feszül, nyugodt vagy enyhén irritált." : "Tight, calm, or slightly irritated."}</p>
                <p className={s.cardBody}>
                  {isHu
                    ? "Ez az azonnali érzés csendben eldönti, mire van valójában szüksége a bőrnek."
                    : "That immediate feeling quietly decides what the skin actually needs next."}
                </p>
              </div>
              <div className={s.card} role="listitem">
                <h4 className={s.cardTitle}>{isHu ? "Ahol megállnak" : "Where people stop"}</h4>
                <p className={s.cardLead}>{isHu ? "A döntésnek nincs szerkezete" : "The decision has no structure"}</p>
                <p className={s.cardBody}>{isHu ? "Két jó opció." : "Two good options."}</p>
                <p className={s.cardBody}>{isHu ? "Nincs egyértelmű választási mód." : "No clear way to choose."}</p>
                <p className={s.cardBody}>
                  {isHu
                    ? "Mindkettő jónak tűnik, de semmi nem köti őket egy világos döntéssé."
                    : "Both seem right, but nothing connects them to a clear decision."}
                </p>
              </div>
            </div>

            <div className={s.whyOneAnswerExpand}>
              {moreId !== "why" && (
                <button
                  type="button"
                  className={s.expandTrigger}
                  aria-expanded={false}
                  aria-controls="pf-expand-why"
                  onClick={() => setMoreId("why")}
                >
                  {isHu ? "Mutasd, hogyan kapcsolódnak ezek a jelek" : "See how these signals actually connect"}
                </button>
              )}
            </div>
          </div>
            <div
            id="pf-expand-why"
            className={cx(s.expandHost, moreId === "why" && s.expandHostOpen)}
            aria-hidden={moreId !== "why"}
          >
            <div className={s.expandHostInner}>
              <div className={s.expandSurface}>
                <div className={s.expandTwoCol}>
                  <div className={s.detailProse}>
                    <p>{isHu ? "A „kombinált bőr” úgy hangzik, mintha válasz lenne." : "&quot;Combination skin&quot; sounds like an answer."}</p>
                    <p>{isHu ? "Valójában elfedi azt, ami tényleg számít." : "In reality, it hides what actually matters."}</p>
                    <p>{isHu ? "Mert az emberek nem címkék alapján döntenek." : "Because people don&apos;t decide based on a label."}</p>
                    <p>{isHu ? "Hanem olyan mintázatok alapján, amiket magukon felismernek." : "They decide based on patterns they recognize in themselves."}</p>
                    <p>
                      <strong>{isHu ? "Hogy néz ez ki a gyakorlatban" : "What that actually looks like"}</strong>
                    </p>
                    <p>
                      {isHu ? "A bőröd reggel rendben lehet," : "Your skin might feel fine in the morning,"}
                      <br />
                      {isHu ? "délutánra viszont zsírosodik." : "but get oily by the afternoon."}
                    </p>
                    <p>
                      {isHu ? "Az orcád lehet száraz," : "Your cheeks can feel dry,"}
                      <br />
                      {isHu ? "miközben a T-zónád kifényesedik." : "while your T-zone starts to shine."}
                    </p>
                    <p>
                      {isHu ? "Egy termék papíron lehet tökéletes," : "A product can look perfect on paper,"}
                      <br />
                      {isHu ? "de pár használat után mégis rossznak érződik." : "but feel wrong after a few uses."}
                    </p>
                    <p>
                      {isHu ? "Tisztítás után a bőröd lehet feszes, nyugodt vagy irritált," : "After cleansing, your skin might feel tight, calm, or irritated,"}
                      <br />
                      {isHu ? "és ez az egy pillanat megváltoztatja, minek kell következnie." : "and that one moment changes what should come next."}
                    </p>
                    <p>
                      <strong>{isHu ? "Itt akadnak el az emberek" : "This is where people get stuck"}</strong>
                    </p>
                    <p>{isHu ? "Ezek a jelek együtt számítanak." : "All of these signals matter together."}</p>
                    <p>
                      {isHu ? "Egy termékoldal viszont külön kezeli őket," : "But a product page treats them separately,"}
                      <br />
                      {isHu ? "vagy teljesen figyelmen kívül hagyja őket." : "or ignores them completely."}
                    </p>
                    <p>
                      {isHu ? "Így amikor valakinek két „jó” opció közül kell választania," : "So when someone has to choose between two &quot;good&quot; options,"}
                      <br />
                      {isHu ? "nincs döntési szerkezet, ami segítene." : "there&apos;s no structure to help them decide."}
                    </p>
                    <p>{isHu ? "És itt jelenik meg a bizonytalanság." : "And that&apos;s where hesitation happens."}</p>
                    <p>
                      <strong>{isHu ? "A valódi probléma" : "The real problem"}</strong>
                    </p>
                    <p>{isHu ? "Nem az a gond, hogy kevés az információ." : "It&apos;s not that the store lacks information."}</p>
                    <p>
                      {isHu ? "Hanem az, hogy nem köti össze őket" : "It&apos;s that it doesn&apos;t connect it"}
                      <br />
                      {isHu ? "úgy, ahogy egy valódi ember dönt." : "in the way a real person makes a decision."}
                    </p>
                  </div>
                </div>
                {moreId === "why" && (
                  <button
                    type="button"
                    className={s.expandCloseStrip}
                    aria-label={isHu ? "Részletek bezárása" : "Close details"}
                    onClick={() => setMoreId(null)}
                  >
                    <span className={s.expandCloseStripLabel}>{isHu ? "Bezárás" : "Close"}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
          </div>
        </div>
      </section>

      {/* SECTION 4, QUESTELL'S APPROACH */}
      <section
        className={cx(
          s.zigzagSection,
          revealById.approach && s.isVisible,
          moreId === "approach" && s.sectionExpandOpen
        )}
        data-reveal
        data-reveal-id="approach"
        aria-labelledby="pf-approach-heading"
      >
        <div className={s.sectionInner}>
          <div className={s.zigzagInner}>
            <div className={s.zigzagText}>
              <div className={s.sectionHeader}>
                <p className={s.sectionKicker}>{isHu ? "A Questell megközelítése" : "Questell&apos;s approach"}</p>
                <h2 id="pf-approach-heading" className={s.sectionHeading}>
                  {isHu
                    ? "Döntési logika a katalógus mögött, nem egy kérdőív a katalógus előtt"
                    : "Decision logic behind the catalog, not a questionnaire in front of it"}
                </h2>
              </div>
              <p className={s.prose}>
                {isHu ? (
                  <>
                    A Questell nem egy generikus quizt tesz a termékeid elé.{" "}
                    <strong>Döntési logikát épít mögéjük</strong>, és a válaszokat{" "}
                    <em>kombinációban</em> értelmezi, nem elszigetelt mezőkként.
                  </>
                ) : (
                  <>
                    Questell does not park a generic quiz in front of your products. It builds{" "}
                    <strong>decision logic behind them</strong> and reads answers <em>in combination</em>,
                    not as isolated fields.
                  </>
                )}
              </p>
              {moreId !== "approach" && (
                <button
                  type="button"
                  className={s.expandTrigger}
                  aria-expanded={false}
                  aria-controls="pf-expand-approach"
                  onClick={() => setMoreId("approach")}
                >
                  {isHu ? "További részletek" : "More detail"}
                </button>
              )}
            </div>
            <div className={s.zigzagVisual}>
              <ImagePlaceholder
                type="quiz-vs-decision-logic"
                label={isHu ? "Quiz vs döntési logika összehasonlítás" : "Quiz vs decision logic comparison"}
              />
            </div>
          </div>
          <div
            id="pf-expand-approach"
            className={cx(s.expandHost, moreId === "approach" && s.expandHostOpen)}
            aria-hidden={moreId !== "approach"}
          >
            <div className={s.expandHostInner}>
              <div className={s.expandSurface}>
                <div className={s.expandTwoCol}>
                  <div className={s.detailProse}>
                    <p>
                      {isHu ? (
                        <>
                          A Questell nem egy generikus quizt tesz a termékeid elé.{" "}
                          <strong>Döntési logikát épít mögéjük</strong> - ugyanazt a gondolkodást,
                          amit egy erős sales tanácsadó használna, ha egyszerre minden jelet látna.
                        </>
                      ) : (
                        <>
                          Questell does not park a generic quiz in front of your products. It builds{" "}
                          <strong>decision logic behind them</strong>, the same kind of reasoning a strong
                          sales associate would use if they could read every signal at once.
                        </>
                      )}
                    </p>
                    <p>
                      {isHu ? (
                        <>
                          A hagyományos kérdőív válaszokat gyűjt. A Questell azt értelmezi, hogyan{" "}
                          <em>állnak össze</em> ezek a válaszok. Ami számít, az ritkán az első válasz
                          önmagában; inkább az, mit mond együtt az első, második és harmadik válasz
                          a korlátokról, prioritásokról és trade-offokról. Ez a váltás adatgyűjtésből
                          jelentésalkotásba: nem több mező, hanem szűkebb és igazabb útvonal a kínálatodban.
                        </>
                      ) : (
                        <>
                          A traditional questionnaire collects answers. Questell interprets how those
                          answers <em>combine</em>. What matters is rarely the first response in isolation; it
                          is what the first, second, and third answers say together about constraints,
                          priorities, and trade-offs. That is the shift from data capture to meaning: not more
                          fields, but a narrower, truer path through your assortment.
                        </>
                      )}
                    </p>
                  </div>
                </div>
                {moreId === "approach" && (
                  <button
                    type="button"
                    className={s.expandCloseStrip}
                    aria-label={isHu ? "Részletek bezárása" : "Close details"}
                    onClick={() => setMoreId(null)}
                  >
                    <span className={s.expandCloseStripLabel}>{isHu ? "Bezárás" : "Close"}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 5, HOW THE DECISION SPACE NARROWS */}
      <section
        className={cx(s.zigzagSection, revealById.narrow && s.isVisible, moreId === "narrow" && s.sectionExpandOpen)}
        data-reveal
        data-reveal-id="narrow"
        aria-labelledby="pf-narrow-heading"
      >
        <div className={s.sectionInner}>
          <div className={s.sectionSurface}>
            <div className={s.zigzagInner}>
            <div className={s.zigzagText}>
              <div className={s.sectionHeader}>
                <p className={s.sectionKicker}>{isHu ? "Hogyan szűkül a döntési tér" : "How the decision space narrows"}</p>
                <h2 id="pf-narrow-heading" className={s.sectionHeading}>
                  {isHu ? "Minden lépés szűkít, amíg egy valódi illeszkedés marad" : "Each step shrinks the field until one fit remains"}
                </h2>
              </div>
              <p className={s.prose}>
                {isHu ? (
                  <>
                    Minden lépés szűkíti a teret: az erősebb utak bent maradnak, a gyengék kiesnek.
                    A kimenet egy konkrét <strong>irány vagy termék</strong>, nem egy újabb homályos kategória.
                  </>
                ) : (
                  <>
                    Each step shrinks the space: stronger paths stay, weak ones drop. The outcome is a
                    specific <strong>direction or product</strong>, not another vague category.
                  </>
                )}
              </p>
              <div className={s.stepGrid} role="list" aria-label={isHu ? "Szűkítési lépések" : "Narrowing steps"}>
                <div className={s.stepCard} role="listitem">
                  <span className={s.stepIndex}>1</span>
                  <div>
                    <h3 className={s.stepTitle}>{isHu ? "Nyisd meg a kontextust" : "Open context"}</h3>
                    <p className={s.stepBody}>
                      {isHu ? "Először célok és érzékenységek, korai kategóriába zárás nélkül." : "Goals and sensitivities first, no premature category lock-in."}
                    </p>
                  </div>
                </div>
                <div className={s.stepCard} role="listitem">
                  <span className={s.stepIndex}>2</span>
                  <div>
                    <h3 className={s.stepTitle}>{isHu ? "Szűkítsd a korlátokat" : "Tighten constraints"}</h3>
                    <p className={s.stepBody}>
                      {isHu ? "Oldd a konfliktusokat; az inkompatibilis utak ne versenyezzenek tovább." : "Resolve conflicts; incompatible paths stop competing."}
                    </p>
                  </div>
                </div>
                <div className={s.stepCard} role="listitem">
                  <span className={s.stepIndex}>3</span>
                  <div>
                    <h3 className={s.stepTitle}>{isHu ? "Erősítsd a nyerő utat" : "Strengthen the winning path"}</h3>
                    <p className={s.stepBody}>{isHu ? "A bizonyíték egyre kevesebb irányra koncentrálódik." : "Evidence piles onto fewer directions."}</p>
                  </div>
                </div>
                <div className={s.stepCard} role="listitem">
                  <span className={s.stepIndex}>4</span>
                  <div>
                    <h3 className={s.stepTitle}>{isHu ? "Mutasd meg az illeszkedést" : "Surface the fit"}</h3>
                    <p className={s.stepBody}>
                      {isHu ? "Egy világos ajánlás, ami tiszteletben tartja a teljes történetet." : "One clear recommendation that respects the full thread."}
                    </p>
                  </div>
                </div>
              </div>
              {moreId !== "narrow" && (
                <button
                  type="button"
                  className={s.expandTrigger}
                  aria-expanded={false}
                  aria-controls="pf-expand-narrow"
                  onClick={() => setMoreId("narrow")}
                >
                  {isHu ? "További részletek" : "More detail"}
                </button>
              )}
            </div>
            <div className={s.zigzagVisual}>
              <ImagePlaceholder
                type="flow-narrowing"
                label={isHu ? "Szűkülő döntési folyamat" : "Narrowing decision flow"}
              />
            </div>
          </div>
            <div
            id="pf-expand-narrow"
            className={cx(s.expandHost, moreId === "narrow" && s.expandHostOpen)}
            aria-hidden={moreId !== "narrow"}
          >
            <div className={s.expandHostInner}>
              <div className={s.expandSurface}>
                <div className={s.expandTwoCol}>
                  <div className={s.detailProse}>
                    <p>
                      {isHu
                        ? "Minden lépéssel kisebb lesz a döntési tér. Néhány irány több bizonyítékot kap és erősödik; mások csendben kiesnek, mert ellentmondanak annak, amit a vásárló már jelzett. A vásárló nem az egész katalógust görgeti újra, hanem egy olyan úton halad, amit a logika konzisztensen tart az eddigi válaszokkal."
                        : "With every step, the decision space becomes smaller. Some directions gain evidence and grow stronger; others quietly fall away because they contradict what the shopper has already implied. The shopper is not scrolling through the whole catalog again, they are walking a path that your logic keeps consistent with everything they have said so far."}
                    </p>
                    <p>
                      {isHu ? (
                        <>
                          A végén nem egy homályos, generikus kategóriába kell érkezniük, ahol még mindig
                          öt SKU között hasonlítgatnak egyedül. Azt kell látniuk, melyik{" "}
                          <strong>irány vagy konkrét termék</strong> illeszkedik valóban az általuk leírt
                          mintázathoz: kombinált válaszok eredményét, nem egy túl korán kiválasztott címkét.
                        </>
                      ) : (
                        <>
                          At the end, they should not land on a vague, generic category that still leaves them
                          comparing five SKUs alone. They should see the{" "}
                          <strong>direction or specific product</strong> that actually matches the pattern they
                          described, the outcome of combined answers, not a label picked too early.
                        </>
                      )}
                    </p>
                    <p>
                      {isHu ? (
                        <>
                          <strong>Nyisd meg a kontextust.</strong> A korai válaszok kijelölik a célokat,
                          érzékenységeket és azt, ahogyan a vásárló a saját helyzetéről beszél, korai
                          kategóriába kényszerítés nélkül.
                        </>
                      ) : (
                        <>
                          <strong>Open context.</strong> Early answers establish goals, sensitivities, and how
                          the shopper talks about their own situation, without forcing a premature category
                          choice.
                        </>
                      )}
                    </p>
                    <p>
                      {isHu ? (
                        <>
                          <strong>Szűkítsd a korlátokat.</strong> A folyamat közepi kérdések feloldják az
                          ellentmondásokat, és priorizálják azt, ami nem fér meg ugyanabban a rutinban, így
                          az inkompatibilis ágak nem versenyeznek tovább a figyelemért.
                        </>
                      ) : (
                        <>
                          <strong>Tighten constraints.</strong> Mid-flow questions resolve contradictions and
                          prioritize what cannot coexist in the same routine, so incompatible branches stop
                          competing for attention.
                        </>
                      )}
                    </p>
                    <p>
                      {isHu ? (
                        <>
                          <strong>Erősítsd a nyerő utat.</strong> A bizonyíték egy kisebb iránykészletre
                          halmozódik; a gyengébb hipotézisek levágásra kerülnek, nem maradnak bent, hogy a
                          checkoutnál zavarják a vásárlót.
                        </>
                      ) : (
                        <>
                          <strong>Strengthen the winning path.</strong> Evidence accumulates for a smaller set
                          of directions; weaker hypotheses are pruned instead of left to confuse the shopper at
                          checkout.
                        </>
                      )}
                    </p>
                    <p>
                      {isHu ? (
                        <>
                          <strong>Mutasd meg az illeszkedést.</strong> A vásárló egy világos ajánlást lát:
                          egy terméket vagy szűken definiált útvonalat, ami a teljes történetet tiszteletben
                          tartja, nem csak az első kattintott taget.
                        </>
                      ) : (
                        <>
                          <strong>Surface the fit.</strong> The shopper sees a clear recommendation, a product or
                          tightly scoped route, that respects the full story they told, not the first tag they
                          clicked.
                        </>
                      )}
                    </p>
                  </div>
                </div>
                {moreId === "narrow" && (
                  <button
                    type="button"
                    className={s.expandCloseStrip}
                    aria-label={isHu ? "Részletek bezárása" : "Close details"}
                    onClick={() => setMoreId(null)}
                  >
                    <span className={s.expandCloseStripLabel}>{isHu ? "Bezárás" : "Close"}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
          </div>
        </div>
      </section>

      {/* SECTION 6, WHAT THE CUSTOMER FEELS */}
      <section
        className={cx(s.zigzagSection, revealById.feel && s.isVisible, moreId === "feel" && s.sectionExpandOpen)}
        data-reveal
        data-reveal-id="feel"
        aria-labelledby="pf-feel-heading"
      >
        <div className={s.sectionInner}>
          <div className={s.zigzagInner}>
            <div className={s.zigzagText}>
              <div className={s.sectionHeader}>
                <p className={s.sectionKicker}>{isHu ? "Mit él meg a vásárló" : "What the customer experiences"}</p>
                <h2 id="pf-feel-heading" className={s.sectionHeading}>
                  {isHu ? "Rövid kérdések, amelyek beszélgetésnek érződnek, nem tesztnek" : "Short questions that feel like a conversation, not a test"}
                </h2>
              </div>
              <p className={s.prose}>
                {isHu
                  ? "Rövid, emberi kérdések - nem vizsga. Minden lépés az előzőre épül, így az oldal figyelmesnek érződik, nem statikus űrlapnak."
                  : "Short, human prompts, not a test. Each step builds on the last, so the page feels like it is paying attention, not running a static form."}
              </p>
              {moreId !== "feel" && (
                <button
                  type="button"
                  className={s.expandTrigger}
                  aria-expanded={false}
                  aria-controls="pf-expand-feel"
                  onClick={() => setMoreId("feel")}
                >
                  {isHu ? "További részletek" : "More detail"}
                </button>
              )}
            </div>
            <div className={s.zigzagVisual}>
              <ImagePlaceholder
                type="conversation-flow"
                label={isHu ? "Beszélgető jellegű termékajánló minta" : "Conversational product finder mockup"}
              />
            </div>
          </div>
          <div
            id="pf-expand-feel"
            className={cx(s.expandHost, moreId === "feel" && s.expandHostOpen)}
            aria-hidden={moreId !== "feel"}
          >
            <div className={s.expandHostInner}>
              <div className={s.expandSurface}>
                <div className={s.expandTwoCol}>
                  <div className={s.detailProse}>
                    <p>
                      {isHu
                        ? "A flow néhány rövid, hétköznapi kérdést használ. Szándékosan nem vizsgaként van felépítve: nincs trükkös megfogalmazás, nincs olyan érzés, hogy a „jó” válasz szakzsargon mögé van rejtve. A hangnem emberi marad, mert a cél bizalom és tisztaság, nem pontszám."
                        : "The flow uses a few short, everyday questions. It is deliberately not framed as an exam: no trick wording, no sense that the &quot;right&quot; answer is hidden behind jargon. The tone stays human because the goal is trust and clarity, not a score."}
                    </p>
                    <p>
                      {isHu ? (
                        <>
                          Minden kérdés az előző válaszra épít, ezért az élmény folyamatosnak hat. A
                          vásárló azt érzi, hogy az oldal figyel rá, hogy a következő prompt azért létezik,{" "}
                          <em>mert</em> azt mondta, amit az előbb - nem pedig egy statikus űrlapon halad át,
                          ahol minden mező ugyanaz lenne bármit is válaszolna.
                        </>
                      ) : (
                        <>
                          Each question builds on the previous answer, so the experience feels continuous. The
                          shopper gets the sense that the page is paying attention, that the next prompt exists{" "}
                          <em>because</em> of what they just said, rather than marching through a static form
                          where every field would have been the same no matter what.
                        </>
                      )}
                    </p>
                  </div>
                </div>
                {moreId === "feel" && (
                  <button
                    type="button"
                    className={s.expandCloseStrip}
                    aria-label={isHu ? "Részletek bezárása" : "Close details"}
                    onClick={() => setMoreId(null)}
                  >
                    <span className={s.expandCloseStripLabel}>{isHu ? "Bezárás" : "Close"}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 7, SKINCARE EXAMPLE */}
      <section
        className={cx(
          s.zigzagSection,
          revealById.skincare && s.isVisible,
          moreId === "skincare" && s.sectionExpandOpen
        )}
        data-reveal
        data-reveal-id="skincare"
        aria-labelledby="pf-skincare-heading"
      >
        <div className={s.sectionInner}>
          <div className={s.zigzagInner}>
            <div className={s.zigzagText}>
              <div className={s.sectionHeader}>
                <p className={s.sectionKicker}>{isHu ? "Bőrápolási példa" : "Skincare example"}</p>
                <h2 id="pf-skincare-heading" className={s.sectionHeading}>
                  {isHu ? "Ne a skin-type legördülővel kezdd, hanem azzal, amit a tükör előtt érez" : "Start from a feeling in front of the mirror, not from a skin-type dropdown"}
                </h2>
              </div>
              <p className={s.prose}>
                {isHu
                  ? "Ne azt kérdezd először, hogy „milyen bőrtípusod van?”, hanem azt, mit mutat reggel a tükör. Pár lépésben eljutsz a kombinált, száraz, érzékeny vagy olajos irányhoz - és egy konkrét termékhez."
                  : "Ask what the mirror evokes in the morning, not &quot;skin type&quot; first. In a few steps you can map to combination, dry, sensitive, or oil-forward, and a specific product."}
              </p>
              {moreId !== "skincare" && (
                <button
                  type="button"
                  className={s.expandTrigger}
                  aria-expanded={false}
                  aria-controls="pf-expand-skincare"
                  onClick={() => setMoreId("skincare")}
                >
                  {isHu ? "További részletek" : "More detail"}
                </button>
              )}
            </div>
            <div className={s.zigzagVisual}>
              <ImagePlaceholder
                type="skincare-example"
                label={isHu ? "Bőrápolási ajánlási példa" : "Skincare recommendation example"}
              />
            </div>
          </div>
          <div
            id="pf-expand-skincare"
            className={cx(s.expandHost, moreId === "skincare" && s.expandHostOpen)}
            aria-hidden={moreId !== "skincare"}
          >
            <div className={s.expandHostInner}>
              <div className={s.expandSurface}>
                <div className={s.expandTwoCol}>
                  <div className={s.detailProse}>
                    <p>
                      {isHu
                        ? "Egy bőrápolási helyzetben az első kérdés nem absztraktan azt kérdezi: „Milyen a bőrtípusod?”. Inkább azt, mi jut eszedbe reggel a tükör előtt: egy érzés, egy szokás, egy frusztráció. Ez a nyitás tudatos: a folytatást valós élményhez köti, nem egy címkéhez, amit lehet, hogy korábban rosszul tanult a vásárló."
                        : "In a skincare scenario, the first question does not ask &quot;What is your skin type?&quot; in the abstract. Instead, it might ask what comes to mind when they stand in front of the mirror in the morning, a feeling, a habit, a frustration. That opening is deliberate: it anchors the rest of the flow in lived experience, not in a label they may have mislearned from marketing elsewhere."}
                    </p>
                    <p>
                      {isHu
                        ? "Innen minden follow-up hű maradhat ehhez a szálhoz. Nagyjából négy ilyen lépés után a rendszer már képes megállapítani, hogy a vásárlót kombinált, száraz, érzékeny vagy olajosabb irányba érdemes terelni, és melyik konkrét termék illeszkedik ehhez az úthoz - ahelyett, hogy visszadobná az egész termékrácsba."
                        : "From there, every follow-up can stay faithful to that thread. After roughly four such steps, the system can already infer whether the shopper should be guided toward combination, dry, sensitive, or oil-forward directions, and which specific product on your shelf matches that path, instead of dumping them back into the full grid."}
                    </p>
                  </div>
                </div>
                {moreId === "skincare" && (
                  <button
                    type="button"
                    className={s.expandCloseStrip}
                    aria-label={isHu ? "Részletek bezárása" : "Close details"}
                    onClick={() => setMoreId(null)}
                  >
                    <span className={s.expandCloseStripLabel}>{isHu ? "Bezárás" : "Close"}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 8, EMBEDDED */}
      <section
        className={cx(s.zigzagSection, revealById.embed && s.isVisible, moreId === "embed" && s.sectionExpandOpen)}
        data-reveal
        data-reveal-id="embed"
        aria-labelledby="pf-embed-heading"
      >
        <div className={s.sectionInner}>
          <div className={s.zigzagInner}>
            <div className={s.zigzagText}>
              <div className={s.sectionHeader}>
                <p className={s.sectionKicker}>{isHu ? "Beágyazva a meglévő oldaladba" : "Embedded into the page you already have"}</p>
                <h2 id="pf-embed-heading" className={s.sectionHeading}>
                  {isHu ? "Nem külön app, ugyanannak az URL-nek és történetnek a része" : "Not a separate app, part of the same URL and story"}
                </h2>
              </div>
              <p className={s.prose}>
                {isHu
                  ? "Beágyazható PDP-re, kampányoldalra vagy kollekciós oldalra, ugyanabban az élményben. A vásárló nem kerül át egy másik eszközbe, hogy visszatérképezze a választ a katalógusodra."
                  : "Embed on PDP, campaign, or collection pages, same journey, same chrome. Shoppers are not bounced to another tool to map an answer back to your catalog."}
              </p>
              {moreId !== "embed" && (
                <button
                  type="button"
                  className={s.expandTrigger}
                  aria-expanded={false}
                  aria-controls="pf-expand-embed"
                  onClick={() => setMoreId("embed")}
                >
                  {isHu ? "További részletek" : "More detail"}
                </button>
              )}
            </div>
            <div className={s.zigzagVisual}>
              <ImagePlaceholder
                type="embed-preview"
                label={isHu ? "Beágyazott widget e-kereskedelmi oldalon" : "Embedded widget inside ecommerce page"}
              />
            </div>
          </div>
          <div
            id="pf-expand-embed"
            className={cx(s.expandHost, moreId === "embed" && s.expandHostOpen)}
            aria-hidden={moreId !== "embed"}
          >
            <div className={s.expandHostInner}>
              <div className={s.expandSurface}>
                <div className={s.expandTwoCol}>
                  <div className={s.detailProse}>
                    <p>
                      {isHu
                        ? "Az élmény nem úgy működik, mint egy leválasztott miniapp, ami mentális kontextusváltásra kényszeríti a vásárlót. Közvetlenül beágyazható termékoldalba, kampány landingbe vagy kollekciós hubba - oda, ahol a bizonytalanság ténylegesen megjelenik."
                        : "The experience does not behave like a disconnected mini-application that asks the shopper to change mental context. It can be embedded directly into a product detail page, a campaign landing page, or a collection hub, wherever the hesitation actually happens."}
                    </p>
                    <p>
                      {isHu
                        ? "Vizuálisan és működésben is az oldal részévé válik: a vásárló nem kerül át „egy másik eszközbe”, hogy ott kapjon egy választ, amit utána még vissza kell térképeznie a katalógusodra. Benne marad az általad tervezett útvonalban, a döntési réteg pedig együtt fut a már meglévő tartalmaiddal."
                        : "Visually and behaviorally, it becomes part of the page: the shopper is not sent away to &quot;another tool&quot; to earn an answer they still have to map back to your catalog. They stay inside the journey you designed, with the decision layer sitting alongside the content you already invested in."}
                    </p>
                  </div>
                </div>
                {moreId === "embed" && (
                  <button
                    type="button"
                    className={s.expandCloseStrip}
                    aria-label={isHu ? "Részletek bezárása" : "Close details"}
                    onClick={() => setMoreId(null)}
                  >
                    <span className={s.expandCloseStripLabel}>{isHu ? "Bezárás" : "Close"}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 9, FINAL CTA */}
      <section
        className={cx(s.finalSection, revealById.final && s.isVisible)}
        data-reveal
        data-reveal-id="final"
        aria-labelledby="pf-final-heading"
      >
        <div className={s.sectionInner}>
          <div className={s.ctaPanel}>
            <header className={s.closingHeader}>
              <h2 id="pf-final-heading" className={s.finalStatement}>
                {isHu
                  ? "Ha a döntés nincs beépítve az oldalba, a vásárló dönt helyetted - és ez a döntés legtöbbször a kilépés."
                  : "If the decision is not built into the page, the customer decides for you, and that decision is usually to leave."}
              </h2>
            </header>
            <div className={s.closingBody}>
              <p className={s.finalLead}>
                {isHu
                  ? "A Questell skálázhatóvá teszi azt az ítélőképességet, amit már ma is használsz merchandisingban és supportban, anélkül, hogy a márkát egy generikus quizre redukálná."
                  : "Questell encodes the judgment you already use in merchandising and support, at scale, without reducing the brand to a generic quiz."}
              </p>
              <p className={s.finalSupportFull}>
                {isHu
                  ? "A Questell segít kódba fordítani azt az ítélőképességet, ami már ma is ott van a legjobb merchandising és support beszélgetésekben, így az oldal skálán is át tudja venni ennek egy részét, anélkül hogy a márkát egy generikus quizre egyszerűsítené."
                  : "Questell helps you encode the judgment that already lives in your best merchandising and support conversations, so the site can carry part of that load at scale, without reducing your brand to a generic quiz."}
              </p>
            </div>
            <div className={s.ctaPanelActions}>
              <Link href="/about" className={s.btnPrimary}>
                {isHu ? "Készítsd el a saját chatbotodat" : "Build your own chatbot"}
              </Link>
              <Link href="/test-chat" className={s.btnSecondary}>
                {isHu ? "Próbáld ki élőben" : "Try the live demo"}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </article>
  );
}
