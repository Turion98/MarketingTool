"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  PRESENT_LANG_CHANGED_EVENT,
  readPresentLangFromStorage,
} from "@/app/present/presentLangSync";
import s from "../productFinder/productFinderPage.module.scss";

type ExpandKey = "problem" | "different" | "business" | "practice";

/** Stable id per `[data-reveal]` section — reveal visibility must live in React className (not classList), or state updates wipe `isVisible`. */
type RevealKey = "hero" | "problem" | "different" | "business" | "practice" | "final";

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

export default function OnboardingFlowsPage() {
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
    const root = rootRef.current;
    if (!root) return;
    const nodes = root.querySelectorAll<HTMLElement>("[data-reveal]");
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const id = entry.target.getAttribute("data-reveal-id") as RevealKey | null;
          if (!id) continue;
          setRevealById((prev) => ({ ...prev, [id]: true }));
          io.unobserve(entry.target);
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -24px 0px" }
    );
    const initial: Partial<Record<RevealKey, boolean>> = {};
    nodes.forEach((el) => {
      const id = el.getAttribute("data-reveal-id") as RevealKey | null;
      if (!id) return;
      const r = el.getBoundingClientRect();
      const inView = r.top < window.innerHeight * 0.94 && r.bottom > 0;
      if (inView) initial[id] = true;
      else io.observe(el);
    });
    setRevealById((prev) => ({ ...prev, ...initial }));
    return () => io.disconnect();
  }, []);

  return (
    <article ref={rootRef} className={s.page}>
      <section
        className={cx(s.zigzagSection, s.heroZigzag, revealById.hero && s.isVisible)}
        data-reveal
        data-reveal-id="hero"
        aria-labelledby="oe-hero-heading"
      >
        <div className={s.sectionInner}>
          <div className={s.zigzagInner}>
            <div className={s.zigzagVisual}>
              <ImagePlaceholder
                type="hero-onboarding"
                label={isHu ? "Onboarding flow előnézet" : "Onboarding flow preview"}
              />
            </div>
            <div className={s.zigzagText}>
              <p className={s.eyebrow}>{isHu ? "Use case, Onboarding & oktatás" : "Use case, Onboarding & Education"}</p>
              <h1 id="oe-hero-heading" className={s.heroTitle}>
                {isHu
                  ? "A legtöbb onboarding flow válaszokat gyűjt. A Questell azt értelmezi, hogyan állnak össze."
                  : "Most onboarding flows collect answers. Questell interprets how they combine."}
              </h1>
              <p className={s.lead}>
                {isHu
                  ? "A lineáris flow izoláltan kezeli a válaszokat. Az utolsó válasz dönti el a kimenetet. A döntések nem így működnek - és ezt a user is érzi."
                  : "A linear flow treats every answer in isolation. The last response decides the outcome. That is not how decisions work — and users can feel the difference."}
              </p>
              <p className={s.lead}>
                {isHu
                  ? "A Questell stateful. Minden válasz módosítja a következő kérdés jelentését, és a végső irány a teljes mintázatot tükrözi - nem csak az utolsó kattintást."
                  : "Questell is stateful. Each answer changes what the next question means, and the final direction reflects the full pattern — not just the last click."}
              </p>
              <div className={s.heroActions}>
                <Link href="/about" className={s.btnPrimary}>
                  {isHu ? "Építsd fel az onboarding mögötti logikát" : "Build the logic behind your onboarding"}
                </Link>
                <Link href="/demos" className={s.btnSecondary}>
                  {isHu ? "Mutasd, hogyan működik" : "See how it works"}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        className={cx(s.zigzagSection, revealById.problem && s.isVisible, moreId === "problem" && s.sectionExpandOpen)}
        data-reveal
        data-reveal-id="problem"
        aria-labelledby="oe-problem-heading"
      >
        <div className={s.sectionInner}>
          <div className={s.zigzagInner}>
            <div className={s.zigzagText}>
              <div className={s.sectionHeader}>
                <p className={s.sectionKicker}>{isHu ? "A probléma" : "The problem"}</p>
                <h2 id="oe-problem-heading" className={s.sectionHeading}>
                  {isHu ? "A kérdőív nem döntési rendszer" : "A questionnaire is not a decision system"}
                </h2>
              </div>
              <p className={s.prose}>
                {isHu
                  ? "Ha minden választ külön értékelünk, a kimenet legfeljebb olyan jó, mint az utolsó kérdés. Kérdezhetsz húsz dolgot is, mégis mellémehet - mert a kombináció sosem lett értelmezve."
                  : "When every answer is evaluated independently, the outcome is only as good as the last question. You can ask twenty things and still miss the point — because the combination was never read."}
              </p>
              {moreId !== "problem" && (
                <button
                  type="button"
                  className={s.expandTrigger}
                  aria-expanded={false}
                  aria-controls="oe-expand-problem"
                  onClick={() => setMoreId("problem")}
                >
                  {isHu ? "További részletek" : "More detail"}
                </button>
              )}
            </div>
            <div className={s.zigzagVisual}>
              <ImagePlaceholder
                type="problem-onboarding"
                label={isHu ? "Kérdőív vs döntési rendszer" : "Questionnaire vs decision system"}
              />
            </div>
          </div>
          <div
            id="oe-expand-problem"
            className={cx(s.expandHost, moreId === "problem" && s.expandHostOpen)}
            aria-hidden={moreId !== "problem"}
          >
            <div className={s.expandHostInner}>
              <div className={s.expandSurface}>
                <div className={s.expandTwoCol}>
                  <div className={s.detailProse}>
                    <p>
                      {isHu
                        ? "A legtöbb interaktív onboarding eszköz ugyanúgy működik a motorháztető alatt: feltesz egy kérdést, rögzít egy választ, és a következő lépést csak ez az egy válasz határozza meg. A rendszernek nincs memóriája arról, mi történt korábban. Nem érti, hogy az első és a harmadik válasz együtt már két megmaradt útvonalat is kizár. Egyszerűen csak megy tovább."
                        : "Most interactive onboarding tools work the same way underneath: a question is asked, an answer is recorded, and the next step is determined by that answer alone. The system has no memory of what came before. It does not know that the first and third answers together rule out two of the remaining paths. It just moves forward."}
                    </p>
                    <p>
                      {isHu
                        ? "Ez quiz-logika. Gyors felépíteni és könnyű érteni, de van plafonja. A valós orientációs döntések - mit érdemes először megtanulni, melyik workflow illik, honnan indulj - több jelből felépülő kontextuson múlnak, nem egyetlen mezőn."
                        : "This is quiz logic. It is fast to build and easy to understand, but it has a ceiling. Because real orientation decisions — what to learn first, which workflow fits, where to start — depend on context that accumulates across several signals, not on a single field."}
                    </p>
                    <p>
                      {isHu
                        ? "Amikor a rendszer nem tudja olvasni ezt a felhalmozódó kontextust, vagy túlegyszerűsíti a kimenetet, vagy fárasztóan sok kérdésen viszi végig a felhasználót kompenzációként. Egyik sem jó élmény, és egyik sem termel igazán használható insightot."
                        : "When the system cannot read that accumulation, it either oversimplifies the outcome or forces the user through an exhausting number of questions to compensate. Neither is a good experience, and neither generates insight worth acting on."}
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

      <section
        className={cx(
          s.zigzagSection,
          s.whyOneAnswer,
          revealById.different && s.isVisible,
          moreId === "different" && s.sectionExpandOpen
        )}
        data-reveal
        data-reveal-id="different"
        aria-labelledby="oe-different-heading"
      >
        <div className={s.sectionInner}>
          <div className={s.sectionSurface}>
            <div className={s.whyOneAnswerColumn}>
              <div className={s.whyOneAnswerTop}>
              <div className={s.sectionHeader}>
                <p className={s.sectionKicker}>{isHu ? "Miért más a Questell" : "What makes Questell different"}</p>
                <h2 id="oe-different-heading" className={s.sectionHeading}>
                  {isHu ? "A kombináció dönt, nem az utolsó válasz" : "The combination decides, not the last answer"}
                </h2>
              </div>
              <p className={s.prose}>
                {isHu
                  ? "A Questell figyeli, hogy minden válasz mit jelent a következőkre nézve. A már nem illeszkedő útvonalak csendben lezárulnak. Azok az irányok, amelyek bizonyítékot kapnak, erősödnek. A végén a kimenet a teljes mintázatot tükrözi, amit a felhasználó leírt - nem pontszámot, nem kategóriát, hanem konkrét irányt."
                  : "Questell tracks what each answer implies about all the answers that follow. Paths that no longer fit are quietly closed. Paths that gain evidence grow stronger. By the end, the outcome reflects the full pattern the user described — not a score, not a category, but a specific direction."}
              </p>
            </div>
              <div className={s.whyOneAnswerCardRow} role="list">
                <div className={s.card} role="listitem">
                  <h3 className={s.cardTitle}>{isHu ? "Tervezetten stateful" : "Stateful by design"}</h3>
                  <p className={s.cardBody}>
                  {isHu
                    ? "A rendszer emlékszik. Minden válasz módosítja mindennek a súlyát, ami utána következik."
                    : "The system remembers. Each answer changes the weight of everything that follows."}
                  </p>
                </div>
                <div className={s.card} role="listitem">
                  <h3 className={s.cardTitle}>{isHu ? "Kombinációs logika" : "Combination logic"}</h3>
                  <p className={s.cardBody}>
                  {isHu
                    ? "Nem az első válasz dönt, és nem is az utolsó. Az számít, mit mond együtt az első, második és harmadik."
                    : "It is not the first answer that decides, nor the last. It is what the first, second, and third say together."}
                  </p>
                </div>
                <div className={s.card} role="listitem">
                  <h3 className={s.cardTitle}>{isHu ? "Az útvonalak szűkülnek, nem szaporodnak" : "Paths narrow, not multiply"}</h3>
                  <p className={s.cardBody}>
                  {isHu
                    ? "Ahogy gyűlnek a jelek, a nem releváns irányok lezárulnak. A felhasználó nem lát olyan opciót, amit a korábbi válaszai már kizártak."
                    : "As signals accumulate, irrelevant directions close. The user is never shown options that their earlier answers already ruled out."}
                  </p>
                </div>
                <div className={s.card} role="listitem">
                  <h3 className={s.cardTitle}>{isHu ? "Egy tartalmi készlet, sok útvonal" : "One content set, many paths"}</h3>
                  <p className={s.cardBody}>
                  {isHu
                    ? "A logika kezeli a variációt. Nem kell külön flow minden user-típusra - ugyanaz a tartalom más mintázatnak másképp szolgál."
                    : "The logic handles variation. You do not need a separate flow for every user type — the same content serves each pattern differently."}
                  </p>
                </div>
                <div className={s.card} role="listitem">
                  <h3 className={s.cardTitle}>{isHu ? "Döntések, nem kattintások" : "Decisions, not responses"}</h3>
                  <p className={s.cardBody}>
                  {isHu
                    ? "Nem csak az kerül rögzítésre, hogy mire kattintott valaki. Hanem az a döntési mintázat, amit feltárt - szegmentálható, elemezhető és akcióra fordítható."
                    : "What gets recorded is not just what someone clicked. It is the decision pattern they revealed — segmentable, analyzable, and actionable."}
                  </p>
                </div>
              </div>
              <div className={s.whyOneAnswerExpand}>
              {moreId !== "different" && (
                <button
                  type="button"
                  className={s.expandTrigger}
                  aria-expanded={false}
                  aria-controls="oe-expand-different"
                  onClick={() => setMoreId("different")}
                >
                  {isHu ? "Mutasd, miért számít ez a gyakorlatban" : "See why this matters in practice"}
                </button>
              )}
              </div>
            <div
              id="oe-expand-different"
              className={cx(s.expandHost, moreId === "different" && s.expandHostOpen)}
              aria-hidden={moreId !== "different"}
            >
              <div className={s.expandHostInner}>
                <div className={s.expandSurface}>
                  <div className={s.expandTwoCol}>
                    <div className={s.detailProse}>
                      <p>
                        {isHu
                          ? "Vegyünk két felhasználót ugyanabban az onboarding flowban. Mindketten öt kérdésre válaszolnak. Egy lineáris rendszerben az útjaik csak akkor válnak szét, ha a válaszaik kifejezetten eltérnek - és akkor is csak annál a kérdésnél, ahol az elágazás előre be volt kódolva."
                          : "Consider two users going through the same onboarding flow. Both answer five questions. In a linear system, their paths only diverge when their answers explicitly differ — and even then, only on the question where the branching was hardcoded."}
                      </p>
                      <p>
                        {isHu
                          ? "A Questellben a szétválás korábban indul és mélyebbre megy. Ha az első user válaszai sürgősséget és szűk use case-t jeleznek, a rendszer már a harmadik kérdés előtt leszűkíti a teret. Ha a második user válaszai értékelési módot és több stakeholdert jeleznek, más útvonalak maradnak nyitva. Ugyanazok a kérdések, más jelentés - mert a felhalmozott kontextus megváltoztatja, mit implikál egy-egy válasz."
                          : "In Questell, the divergence starts earlier and runs deeper. If the first user&apos;s answers suggest urgency and a narrow use case, the system has already narrowed the space before question three. If the second user&apos;s answers suggest evaluation mode and multiple stakeholders, a different set of paths stays open. Same questions, different meaning — because the context that accumulated changes what each answer implies."}
                      </p>
                      <p>
                        {isHu
                          ? "Ez az elmozdulás adatgyűjtésből értelmezésbe. Nem több kérdés kell, hanem egy rendszer, ami érti, mit jelentenek együtt a válaszok."
                          : "This is the shift from data collection to interpretation. Not more questions, but a system that knows what the answers mean together."}
                      </p>
                    </div>
                  </div>
                  {moreId === "different" && (
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
        </div>
      </section>

      <section
        className={cx(s.zigzagSection, revealById.business && s.isVisible, moreId === "business" && s.sectionExpandOpen)}
        data-reveal
        data-reveal-id="business"
        aria-labelledby="oe-business-heading"
      >
        <div className={s.sectionInner}>
          <div className={s.zigzagInner}>
            <div className={s.zigzagText}>
              <div className={s.sectionHeader}>
                <p className={s.sectionKicker}>{isHu ? "Üzleti szempontból" : "The business case"}</p>
                <h2 id="oe-business-heading" className={s.sectionHeading}>
                  {isHu ? "Relevancia skálán, használható insightokkal" : "Relevance at scale, insight worth using"}
                </h2>
              </div>
              <p className={s.prose}>
                {isHu
                  ? "Egy stateful döntési rendszer három dolgot tud, amit egy kérdőív nem: pontosabban route-ol, tartalomszorzás nélkül skáláz, és olyan insightot ad, ami azt tükrözi, hogyan gondolkodnak az emberek - nem csak azt, mire kattintottak."
                  : "A stateful decision system does three things a questionnaire cannot: it routes more precisely, it scales without multiplying content, and it produces insight that reflects how people actually think — not just what they clicked."}
              </p>
              {moreId !== "business" && (
                <button
                  type="button"
                  className={s.expandTrigger}
                  aria-expanded={false}
                  aria-controls="oe-expand-business"
                  onClick={() => setMoreId("business")}
                >
                  {isHu ? "További részletek" : "More detail"}
                </button>
              )}
            </div>
            <div className={s.zigzagVisual}>
              <ImagePlaceholder
                type="business-onboarding"
                label={isHu ? "Relevancia és insight skálán" : "Relevance and insight at scale"}
              />
            </div>
          </div>
          <div
            id="oe-expand-business"
            className={cx(s.expandHost, moreId === "business" && s.expandHostOpen)}
            aria-hidden={moreId !== "business"}
          >
            <div className={s.expandHostInner}>
              <div className={s.expandSurface}>
                <div className={s.expandTwoCol}>
                  <div className={s.detailProse}>
                    <p>
                      {isHu ? (
                        <>
                          <strong>Relevancia overhead nélkül.</strong> Egy elágazó kérdőívben minden új user
                          szegmens új ágat igényel. A tartalmi fa együtt nő a közönséggel. Egy döntési logika
                          rendszerben ugyanaz a tartalom más mintázatoknak másképp jelenik meg - a variációt a
                          logika nyeli el, nem a tartalom-architektúra.
                        </>
                      ) : (
                        <>
                          <strong>Relevance without overhead.</strong> In a branching questionnaire, every
                          new user segment requires a new branch. The content tree grows with the audience. In
                          a decision logic system, the same content is served differently to different
                          patterns — the logic absorbs the variation, not the content architecture.
                        </>
                      )}
                    </p>
                    <p>
                      {isHu ? (
                        <>
                          <strong>Jelentéssel bíró insight.</strong> A CTR megmutatja, mit tettek az emberek.
                          A döntési útvonalak megmutatják, hogyan gondolkodtak. Mely jelek jelentek meg együtt,
                          hol bizonytalanodtak el, mely kombinációk vezettek lemorzsolódáshoz - ez az az adat,
                          ami termékdöntést támogat, nem csak kampány riportot.
                        </>
                      ) : (
                        <>
                          <strong>Insight that means something.</strong> Click-through rates tell you what
                          people did. Decision paths tell you how they reasoned. Which signals appeared
                          together, where people hesitated, which combinations led to drop-off — this is the
                          kind of data that informs product decisions, not just campaign reports.
                        </>
                      )}
                    </p>
                    <p>
                      {isHu ? (
                        <>
                          <strong>Bizalom a figyelem által.</strong> A user ezt nem űrlapként éli meg. Olyan
                          rendszerként éli meg, ami figyel - mert figyel. Ha a következő kérdés azért létezik,
                          mert az előbb ezt mondta, és nem azért, mert egy fix lista negyedik eleme, az
                          interakció más minőségű lesz. Ez hat a completion rate-re, és arra is, hogyan érez
                          a user a termékről, amibe épp onboardolt.
                        </>
                      ) : (
                        <>
                          <strong>Trust through attention.</strong> Users do not experience this as a form.
                          They experience it as a system that is paying attention — because it is. When the
                          next question exists because of what they just said, rather than because it is item
                          four on a fixed list, the interaction feels different. That difference affects
                          completion rates, and it affects how people feel about the product they just
                          onboarded into.
                        </>
                      )}
                    </p>
                  </div>
                </div>
                {moreId === "business" && (
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

      <section
        className={cx(s.zigzagSection, revealById.practice && s.isVisible, moreId === "practice" && s.sectionExpandOpen)}
        data-reveal
        data-reveal-id="practice"
        aria-labelledby="oe-practice-heading"
      >
        <div className={s.sectionInner}>
          <div className={s.zigzagInner}>
            <div className={s.zigzagVisual}>
              <ImagePlaceholder
                type="practice-onboarding"
                label={isHu ? "Egy brief, három útvonal" : "One brief, three paths"}
              />
            </div>
            <div className={s.zigzagText}>
              <div className={s.sectionHeader}>
                <p className={s.sectionKicker}>{isHu ? "Hogy néz ki ez a gyakorlatban" : "What this looks like in practice"}</p>
                <h2 id="oe-practice-heading" className={s.sectionHeading}>
                  {isHu
                    ? "Érkezik egy brief. Három ember nyitja meg ugyanazt a flow-t. Három eltérő út szűkül le."
                    : "A brief arrives. Three people open the same flow. Three different paths close in."}
                </h2>
              </div>
              <p className={s.prose}>
                {isHu
                  ? "A flow nem azt kérdezi, hogy „mi a szereped?”, és onnan ágazik. Azt olvassa, hogy az adott személy több lépésen át mit implikál - sürgősség, korlátok, kinek kell még együtt állnia a döntésben - és ennek megfelelően route-ol. Ugyanaz a belépési pont, ténylegesen eltérő kimenetek."
                  : "The flow does not ask &quot;what is your role?&quot; and branch from there. It reads what each person implies across several steps — urgency, constraints, who else needs to align — and routes accordingly. Same entry point, genuinely different outcomes."}
              </p>
              {moreId !== "practice" && (
                <button
                  type="button"
                  className={s.expandTrigger}
                  aria-expanded={false}
                  aria-controls="oe-expand-practice"
                  onClick={() => setMoreId("practice")}
                >
                  {isHu ? "További részletek" : "More detail"}
                </button>
              )}
            </div>
          </div>
          <div
            id="oe-expand-practice"
            className={cx(s.expandHost, moreId === "practice" && s.expandHostOpen)}
            aria-hidden={moreId !== "practice"}
          >
            <div className={s.expandHostInner}>
              <div className={s.expandSurface}>
                <div className={s.expandTwoCol}>
                  <div className={s.detailProse}>
                    <p>
                      {isHu
                        ? "Egy kampány onboarding helyzetben az egyik ember válaszai azt jelzik, hogy gyorsan kell haladnia, és a kreatív jóváhagyás már megvan. Egy másiké azt jelzi, hogy fejlesztőt kell bevonnia a döntésbe, mielőtt bármi elköteleződés történik. A harmadik még az üzleti indoklást építi az ügyfél felé."
                        : "In a campaign onboarding scenario, one person&apos;s answers suggest they need to move fast and have creative sign-off already. Another&apos;s suggest they need to bring a developer into the decision before anything is committed. A third is still building the business case for a client."}
                    </p>
                    <p>
                      {isHu
                        ? "Egy lineáris flow mindhármuktól ugyanazt kérdezné ugyanabban a sorrendben, és ugyanazt a modullistát mutatná a végén. Egy döntési logika rendszer korán felismeri a mintát, abbahagyja a már nem releváns kérdéseket, és azt a kezdőpontot hozza fel, ami valóban illeszkedik - nem kategóriát, hanem konkrét következő lépést."
                        : "A linear flow would ask all three the same questions in the same order and present the same module list at the end. A decision logic system reads the pattern early, stops asking questions that are no longer relevant, and surfaces the starting point that fits — not a category, but a specific next action."}
                    </p>
                    <p>
                      {isHu
                        ? "Ezt kódolja egy Questell flow mögötti JSON: nem scriptet, hanem döntési architektúrát. A tartalom bármilyen irányba átírható. A struktúra - stateful, kombinációvezérelt, útvonal-szűkítő - adja a kimenet valódi értelmét."
                        : "This is what the JSON behind a Questell flow encodes: not a script, but a decision architecture. The content can be rewritten in any direction. The structure — stateful, combination-driven, path-narrowing — is what makes the outcome meaningful."}
                    </p>
                  </div>
                </div>
                {moreId === "practice" && (
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

      <section
        className={cx(s.finalSection, revealById.final && s.isVisible)}
        data-reveal
        data-reveal-id="final"
        aria-labelledby="oe-final-heading"
      >
        <div className={s.sectionInner}>
          <div className={s.ctaPanel}>
            <header className={s.closingHeader}>
              <h2 id="oe-final-heading" className={s.finalStatement}>
                {isHu
                  ? "A kérdőív és a döntési rendszer között nem a kérdések száma a különbség. Hanem az, hogy a válaszok együtt jelentenek-e valamit."
                  : "The difference between a questionnaire and a decision system is not the number of questions. It is whether the answers mean anything together."}
              </h2>
            </header>
            <div className={s.closingBody}>
              <p className={s.finalLead}>
                {isHu
                  ? "A Questell kódba fordítja azt az ítélőképességet, ami ma is ott van a legjobb onboarding hívásaidban: kontextusolvasás, opciószűkítés, és az a pont, ahol egyértelművé válik a jó út. Ugyanez skálán, anélkül, hogy minden session másik végén ott ülne valaki."
                  : "Questell encodes the judgment that already lives in your best onboarding calls — the reading of context, the narrowing of options, the moment when the right path becomes clear. That judgment, at scale, without a person on the other end of every session."}
              </p>
            </div>
            <div className={s.ctaPanelActions}>
              <Link href="/about" className={s.btnPrimary}>
                {isHu ? "Építsd fel az onboarding mögötti logikát" : "Build the logic behind your onboarding"}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </article>
  );
}
