"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  PRESENT_LANG_CHANGED_EVENT,
  readPresentLangFromStorage,
} from "@/app/present/presentLangSync";
import s from "../onboardingFlows/onboardingFlowsPage.module.scss";

type ExpandKey = "problem" | "brand" | "architecture";

type RevealKey = "hero" | "problem" | "agency" | "brand" | "architecture" | "final";

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

export default function CampaignFlowsPage() {
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
      agency: true,
      brand: true,
      architecture: true,
      final: true,
    };
    setRevealById(allVisible);
  }, []);

  return (
    <article ref={rootRef} className={s.page}>
      <section
        className={[s.zigzagSection, s.heroOe, revealById.hero && s.isVisible].filter(Boolean).join(" ")}
        data-reveal
        data-reveal-id="hero"
        aria-labelledby="cf-hero-heading"
      >
        <div className={s.sectionInner}>
          <div className={s.oeZigzagRow}>
            <div className={s.zigzagVisual}>
              <ImagePlaceholder
                type="hero-campaign"
                label={isHu ? "Kampány flow előnézet" : "Campaign flow preview"}
              />
            </div>
            <div className={s.zigzagText}>
              <p className={s.eyebrow}>{isHu ? "Use case, Kampány flow-k" : "Use case, Campaign flows"}</p>
              <h1 id="cf-hero-heading" className={s.heroTitle}>
                {isHu
                  ? "Egy kampány, ami a konkrét emberre reagál, teljesen más kategória."
                  : "A campaign that responds to the person in front of it is a different thing entirely."}
              </h1>
              <p className={s.lead}>
                {isHu
                  ? "A legtöbb kampány broadcastol: mindenkinek ugyanazt mondja, és reméli, hogy működik. A Questell flow ennek az ellenkezőjét teszi: néhány lépés alatt olvassa a felhasználó mintázatát, és arra reagál."
                  : "Most campaigns broadcast. They say the same thing to everyone and hope it lands. A Questell flow does the opposite: it reads what the person implies across a few steps, and responds to that specific pattern."}
              </p>
              <p className={s.lead}>
                {isHu
                  ? "Az eredmény nem személyre szabott üzenet, hanem személyre szabott élmény - olyan, amitől a márka figyelmesnek érződik."
                  : "The result is not a personalised message. It is a personalised experience — one that feels like the brand was paying attention."}
              </p>
              <div className={s.heroActions}>
                <Link href="/about" className={s.btnPrimary}>
                  {isHu ? "Építs kampány flow-t" : "Build a campaign flow"}
                </Link>
                <Link href="/examples" className={s.btnSecondary}>
                  {isHu ? "Mutass egy példát" : "See an example"}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        className={[
          s.zigzagSection,
          revealById.problem && s.isVisible,
          moreId === "problem" && s.sectionExpandOpen,
        ]
          .filter(Boolean)
          .join(" ")}
        data-reveal
        data-reveal-id="problem"
        aria-labelledby="cf-problem-heading"
      >
        <div className={s.sectionInner}>
          <div className={s.oeZigzagRow}>
            <div className={s.zigzagText}>
              <div className={s.sectionHeader}>
                <p className={s.sectionKicker}>{isHu ? "A probléma" : "The problem"}</p>
                <h2 id="cf-problem-heading" className={s.sectionHeading}>
                  {isHu
                    ? "Az üzenetszintű perszonalizáció nem ugyanaz, mint a döntésszintű perszonalizáció"
                    : "Personalisation at the message level is not the same as personalisation at the decision level"}
                </h2>
              </div>
              <p className={s.prose}>
                {isHu
                  ? "Az email tárgymezőben egy keresztnév kicserélése még nem perszonalizáció. Ahogy az sem, ha másik szegmensnek másik bannert mutatsz. A valódi perszonalizáció az, amikor maga az út változik - mert a felhasználó jelei megváltoztatják."
                  : "Swapping a first name in an email subject line is not personalisation. Neither is showing a different banner to a different segment. Real personalisation means the path through the experience changes — because the person&apos;s signals changed it."}
              </p>
              {moreId !== "problem" && (
                <button
                  type="button"
                  className={s.expandTrigger}
                  aria-expanded={false}
                  aria-controls="cf-expand-problem"
                  onClick={() => setMoreId("problem")}
                >
                  {isHu ? "További részletek" : "More detail"}
                </button>
              )}
            </div>
            <div className={s.zigzagVisual}>
              <ImagePlaceholder
                type="problem-campaign"
                label={isHu ? "Broadcast vs reagáló kampány" : "Broadcast vs responsive campaign"}
              />
            </div>
          </div>
          <div
            id="cf-expand-problem"
            className={`${s.expandHost}${moreId === "problem" ? ` ${s.expandHostOpen}` : ""}`}
            aria-hidden={moreId !== "problem"}
          >
            <div className={s.expandHostInner}>
              <div className={s.expandSurface}>
                <div className={s.expandTwoCol}>
                  <div className={s.detailProse}>
                    <p>
                      Most campaign personalisation happens after the fact. The user does something, the
                      system records it, and the next touchpoint is adjusted accordingly. That is
                      retargeting, not responsiveness.
                    </p>
                    <p>
                      A decision flow personalises in the moment. The first answer changes what the second
                      question means. The second answer closes paths that are no longer relevant. By the
                      time the experience ends, the outcome reflects a combination of signals that is
                      specific to that person — not a segment they were pre-assigned to, but a pattern they
                      revealed in real time.
                    </p>
                    <p>
                      This is the difference between a campaign that adapts its message and a campaign
                      that adapts its logic.
                    </p>
                  </div>
                </div>
                {moreId === "problem" && (
                  <button
                    type="button"
                    className={s.expandCloseStrip}
                    aria-label="Close details"
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
        className={[s.band, revealById.agency && s.isVisible].filter(Boolean).join(" ")}
        data-reveal
        data-reveal-id="agency"
        aria-labelledby="cf-agency-heading"
      >
        <div className={s.sectionInner}>
          <div className={s.bandInner}>
            <div className={s.bandTop}>
              <div className={s.sectionHeader}>
                <p className={s.sectionKicker}>{isHu ? "Ügynökségeknek" : "For agencies"}</p>
                <h2 id="cf-agency-heading" className={s.sectionHeading}>
                  {isHu
                    ? "Egy deliverable, amire az ügyfeled emlékezni fog - a megszokott idő töredéke alatt"
                    : "A deliverable your client will remember, built in a fraction of the usual time"}
                </h2>
              </div>
              <p className={s.prose}>
                {isHu
                  ? "A Questellre épített interaktív kampány flow nem microsite, nem chatbot és nem quiz. Döntési élmény - beágyazható, mérhető, márkára szabható -, amit normál kampányidőben is fel lehet ajánlani, felépíteni és leszállítani."
                  : "An interactive campaign flow built on Questell is not a microsite, not a chatbot, and not a quiz. It is a decision experience — embeddable, measurable, and brand-tailored — that you can propose, build, and deliver within a normal campaign timeline."}
              </p>
            </div>
            <div className={s.oeCardRow} role="list">
              <div className={s.oeCard} role="listitem">
                <h3 className={s.oeCardTitle}>{isHu ? "Nincs app-fejlesztés" : "No app development"}</h3>
                <p className={s.oeCardBody}>
                  {isHu
                    ? "A flow közvetlenül beágyazható a meglévő oldalakba. Nincs külön build, nincs fejlesztői handoff."
                    : "The flow embeds directly into any existing page. No separate build, no handoff to a dev team."}
                </p>
              </div>
              <div className={s.oeCard} role="listitem">
                <h3 className={s.oeCardTitle}>{isHu ? "Design szerint brand-safe" : "Brand-safe by design"}</h3>
                <p className={s.oeCardBody}>
                  {isHu
                    ? "A vizuál, a tónus és a kimenet előre definiált. Semmi nem megy élesbe jóváhagyás nélkül."
                    : "Visuals, tone, and outcomes are defined upfront. Nothing goes live that was not approved."}
                </p>
              </div>
              <div className={s.oeCard} role="listitem">
                <h3 className={s.oeCardTitle}>{isHu ? "Klikken túl is mérhető" : "Measurable beyond clicks"}</h3>
                <p className={s.oeCardBody}>
                  {isHu
                    ? "Döntési útvonalak, drop-off pontok és completion minták valóban értelmezhető adatot adnak - nem csak impressiont."
                    : "Decision paths, drop-off points, and completion patterns give you data that means something — not just impressions."}
                </p>
              </div>
              <div className={s.oeCard} role="listitem">
                <h3 className={s.oeCardTitle}>{isHu ? "Újrahasznosítható logika" : "Reusable logic"}</h3>
                <p className={s.oeCardBody}>
                  {isHu
                    ? "A döntési architektúra új kampányra is átírható újraépítés nélkül."
                    : "The decision architecture can be rewritten for a new campaign without rebuilding from scratch."}
                </p>
              </div>
              <div className={s.oeCard} role="listitem">
                <h3 className={s.oeCardTitle}>{isHu ? "Erős ügyfél-sztori" : "A story to tell the client"}</h3>
                <p className={s.oeCardBody}>
                  {isHu
                    ? "A „felhasználónként reagáló flow-t építettünk” erősebb esettanulmány, mint az, hogy „futtattunk egy quizt”."
                    : "&quot;We built a flow that responds to each user individually&quot; is a stronger case study than &quot;we ran a quiz.&quot;"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        className={[
          s.zigzagSection,
          revealById.brand && s.isVisible,
          moreId === "brand" && s.sectionExpandOpen,
        ]
          .filter(Boolean)
          .join(" ")}
        data-reveal
        data-reveal-id="brand"
        aria-labelledby="cf-brand-heading"
      >
        <div className={s.sectionInner}>
          <div className={s.oeZigzagRow}>
            <div className={s.zigzagText}>
              <div className={s.sectionHeader}>
                <p className={s.sectionKicker}>{isHu ? "A márka oldaláról" : "For the brand"}</p>
                <h2 id="cf-brand-heading" className={s.sectionHeading}>
                  {isHu
                    ? "A vendég nem egy menüt lát. Olyan ajánlást kap, ami személyesnek érződik."
                    : "The guest does not see a menu. They get a recommendation that feels like it was made for them."}
                </h2>
              </div>
              <p className={s.prose}>
                {isHu
                  ? "Egy food hall kampányban a flow nem azt kérdezi, hogy „milyen ételt szeretsz?”, majd listát ad. Azt kérdezi, milyen a helyzet - egyedül vagy társasággal, könnyűt vagy laktatót, ismerőset vagy újat -, és ebből szűkít. A kimenet egy konkrét étel, egy konkrét standról, a hangulathoz illesztett vizuállal."
                  : "In a food hall campaign, the flow does not ask &quot;what kind of food do you like?&quot; and present a list. It asks what the moment feels like — alone or with others, something light or something filling, a familiar comfort or something new — and narrows from there. The outcome is a specific dish, from a specific stand, with a visual that matches the mood."}
              </p>
              {moreId !== "brand" && (
                <button
                  type="button"
                  className={s.expandTrigger}
                  aria-expanded={false}
                  aria-controls="cf-expand-brand"
                  onClick={() => setMoreId("brand")}
                >
                  {isHu ? "További részletek" : "More detail"}
                </button>
              )}
            </div>
            <div className={s.zigzagVisual}>
              <ImagePlaceholder
                type="brand-campaign"
                label={isHu ? "Food hall ajánló flow" : "Food hall recommendation flow"}
              />
            </div>
          </div>
          <div
            id="cf-expand-brand"
            className={`${s.expandHost}${moreId === "brand" ? ` ${s.expandHostOpen}` : ""}`}
            aria-hidden={moreId !== "brand"}
          >
            <div className={s.expandHostInner}>
              <div className={s.expandSurface}>
                <div className={s.expandTwoCol}>
                  <div className={s.detailProse}>
                    <p>
                      This is what the Market33 flow does. A visitor arrives at a food hall with ten
                      stands and no obvious starting point. The flow reads their situation — group or solo,
                      diet, energy level, what they are in the mood for — across a handful of conversational
                      steps. By the end, it knows whether to send them toward a Vietnamese pho, a Korean
                      rice bowl, or a shared sushi platter. And it generates an image of that specific
                      recommendation, in the atmosphere of the hall, so the outcome feels like a destination,
                      not a data point.
                    </p>
                    <p>
                      The brand did not build an app. They built a moment. That moment is the campaign.
                    </p>
                  </div>
                </div>
                {moreId === "brand" && (
                  <button
                    type="button"
                    className={s.expandCloseStrip}
                    aria-label="Close details"
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
        className={[
          s.zigzagSection,
          revealById.architecture && s.isVisible,
          moreId === "architecture" && s.sectionExpandOpen,
        ]
          .filter(Boolean)
          .join(" ")}
        data-reveal
        data-reveal-id="architecture"
        aria-labelledby="cf-architecture-heading"
      >
        <div className={s.sectionInner}>
          <div className={s.oeZigzagRow}>
            <div className={s.zigzagVisual}>
              <ImagePlaceholder
                type="architecture-campaign"
                label={isHu ? "Döntési logika architektúra" : "Decision logic architecture"}
              />
            </div>
            <div className={s.zigzagText}>
              <div className={s.sectionHeader}>
                <p className={s.sectionKicker}>{isHu ? "Az architektúra" : "The architecture"}</p>
                <h2 id="cf-architecture-heading" className={s.sectionHeading}>
                  {isHu
                    ? "Ugyanaz a döntési logika, ami a product findert és onboarding flow-t hajtja, kampányélményekre alkalmazva"
                    : "The same decision logic that powers product finders and onboarding flows, applied to campaign experiences"}
                </h2>
              </div>
              <p className={s.prose}>
                {isHu
                  ? "Minden Questell flow stateful és kombináció-alapú. A rendszer nem külön-külön értékel válaszokat - azt figyeli, mit jelent a mintázat együtt, és ennek megfelelően irányít. Az erre épülő kampány flow nem elágazó kérdőív, hanem döntési rendszer, ami beszélgetésnek érződik."
                  : "Every Questell flow is stateful and combination-driven. The system does not evaluate each answer independently — it tracks what the pattern of answers implies, and routes accordingly. A campaign flow built on this architecture is not a branching questionnaire. It is a decision system that happens to feel like a conversation."}
              </p>
              {moreId !== "architecture" && (
                <button
                  type="button"
                  className={s.expandTrigger}
                  aria-expanded={false}
                  aria-controls="cf-expand-architecture"
                  onClick={() => setMoreId("architecture")}
                >
                  {isHu ? "További részletek" : "More detail"}
                </button>
              )}
            </div>
          </div>
          <div
            id="cf-expand-architecture"
            className={`${s.expandHost}${moreId === "architecture" ? ` ${s.expandHostOpen}` : ""}`}
            aria-hidden={moreId !== "architecture"}
          >
            <div className={s.expandHostInner}>
              <div className={s.expandSurface}>
                <div className={s.expandTwoCol}>
                  <div className={s.detailProse}>
                    <p>
                      The JSON behind a Questell campaign flow encodes the decision logic — which signals
                      matter, how they combine, which paths they close, and what outcome they point toward.
                      That logic can be written for a food hall, a skincare brand, a financial product, or a
                      corporate onboarding programme. The structure is the same. The content is yours.
                    </p>
                    <p>
                      This is what makes the format reusable across clients. The agency learns the
                      architecture once and applies it to every campaign that needs a decision layer —
                      without rebuilding the underlying system each time.
                    </p>
                  </div>
                </div>
                {moreId === "architecture" && (
                  <button
                    type="button"
                    className={s.expandCloseStrip}
                    aria-label="Close details"
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
        className={[s.finalSection, revealById.final && s.isVisible].filter(Boolean).join(" ")}
        data-reveal
        data-reveal-id="final"
        aria-labelledby="cf-final-heading"
      >
        <div className={s.sectionInner}>
          <div className={s.ctaPanel}>
            <h2 id="cf-final-heading" className={s.finalStatement}>
              {isHu
                ? "Azokra a márkákra emlékeznek, amelyek reagáltak - nem azokra, amelyek csak hangosabban broadcastoltak."
                : "The brands that will be remembered are the ones that responded. Not the ones that broadcasted louder."}
            </h2>
            <p className={s.finalLead}>
              {isHu
                ? "A Questell olyan formátumot ad az ügynökségeknek, amit az ügyfelek még nem láttak - és olyan eredményt, ami a kampány után is erős esettanulmány marad."
                : "Questell gives agencies a format that clients have not seen before — and a result that holds up as a case study long after the campaign ends."}
            </p>
            <div className={s.ctaPanelActions}>
              <Link href="/about" className={s.btnPrimary}>
                {isHu ? "Építs kampány flow-t" : "Build a campaign flow"}
              </Link>
            </div>
            <footer className={s.siteFooter}>
              <a href="https://thequestell.com" rel="noopener noreferrer">
                thequestell.com
              </a>
            </footer>
          </div>
        </div>
      </section>
    </article>
  );
}
