"use client";

import { useState } from "react";

/**
 * Demo-céllal: bal oldali "Próbáld ki" segédpanel a látogatónak.
 * Statikus tartalom — semmilyen backend state-tel nincs összekötve.
 * - Demo környezet: a story `meta.runtime.mock_today` tükre (vizuális kontextus).
 * - Rendelés-szcenáriók: a backend `data/mock_orders.csv` 5 rendeléséhez.
 * - Kérdés-példák: statikus pill-példák, nincs satisfiedConditions binding.
 */

const SYSTEM_DATE = new Date("2026-05-15").toLocaleDateString("hu-HU", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

type OrderScenario = {
  id: string;
  title: string;
  scenario: string;
  facts: Array<{ label: string; value: string }>;
};

const ORDER_SCENARIOS: OrderScenario[] = [
  {
    id: "ORD-CUST-001",
    title: "Ideális, garanciás",
    scenario:
      "Ideális teszteset: garancia aktív, Excellent grade, ablakon belül (még 5 nap). Bármilyen panasz-típushoz használható — kozmetikai, akku, hiányzó tartozék egyaránt tesztelhető a 4 tartozék bármelyikével.",
    facts: [
      { label: "Vásárlás", value: "2026-04-20 · 25 napja · még 5 nap" },
      { label: "Garancia", value: "Kiterjesztett · aktív" },
      { label: "Termék", value: "Excellent · 90% akku küszöb" },
      { label: "Tartozék", value: "töltő, kábel, tok, fülhallgató" },
      { label: "Szállítás", value: "DPD · DPD123456789 · kézbesítve 2026-04-23" },
      { label: "Fizetés", value: "bankkártya" },
    ],
  },
  {
    id: "ORD-CUST-002",
    title: "Késő csomag, in_transit",
    scenario:
      'Szállítási késedelem: a csomag még úton van, de az ígért határidő 5 napja lejárt. Az ügyfél valószínűleg sürgető hangvételű — tipikus első üzenet: "Hol a csomagom?"',
    facts: [
      { label: "Vásárlás", value: "2026-04-28 · 17 napja · még 13 nap" },
      { label: "Garancia", value: "Alap 30 nap · nincs kiterjesztett" },
      { label: "Termék", value: "Good · 80% akku küszöb" },
      { label: "Tartozék", value: "töltő, kábel" },
      {
        label: "Szállítás",
        value: "GLS · GLS987654321 · in_transit · ígért: 2026-05-10 (5 napja lejárt!)",
      },
      { label: "Fizetés", value: "PayPal" },
    ],
  },
  {
    id: "ORD-CUST-003",
    title: "Kézbesítve, de nem érkezett meg",
    scenario:
      "Klasszikus delivered-but-not-received konfliktus: a tracking szerint kézbesítve, az ügyfél szerint nincs meg. A marked_delivered_not_received flag az ügyfél üzenete alapján aktiválódik, nem a backendből.",
    facts: [
      { label: "Vásárlás", value: "2026-04-25 · 20 napja · még 10 nap" },
      { label: "Garancia", value: "Kiterjesztett · aktív" },
      { label: "Termék", value: "Very Good · 85% akku küszöb" },
      { label: "Tartozék", value: "töltő, kábel, tok" },
      {
        label: "Szállítás",
        value: "DHL · DHL555444333 · tracking: kézbesítve 2026-05-01",
      },
      { label: "Fizetés", value: "bankkártya" },
      { label: "Megjegyzés", value: "Ügyfél állítja: nem kapta meg" },
    ],
  },
  {
    id: "ORD-CUST-004",
    title: "Ablakon kívül, Acceptable grade",
    scenario:
      'Visszaküldési ablak 36 napja lezárult — csak garancia-flow elérhető. Acceptable grade miatt kozmetikai kifogásokra az AI hivatkozhat hogy "ez a kategória ezt megengedi."',
    facts: [
      { label: "Vásárlás", value: "2026-03-10 · 66 napja · 36 nappal túl!" },
      { label: "Garancia", value: "Kiterjesztett · aktív" },
      { label: "Termék", value: "Acceptable · 75% akku küszöb" },
      { label: "Tartozék", value: "csak kábel" },
      {
        label: "Szállítás",
        value: "PostaNL · PostaNL111222 · kézbesítve 2026-03-14",
      },
      { label: "Fizetés", value: "PayPal" },
    ],
  },
  {
    id: "ORD-CUST-005",
    title: "Folyamatban lévő refund",
    scenario:
      "Folyamatban lévő visszatérítés follow-up: a visszaküldés elfogadva, 249 EUR refund elindítva, várható 2026-05-24. Az AI nem kérdezhet rá semmire ami itt már szerepel.",
    facts: [
      { label: "Vásárlás", value: "2026-03-26 · 50 napja" },
      { label: "Garancia", value: "Nincs kiterjesztett" },
      { label: "Termék", value: "Good · 88% akku küszöb" },
      { label: "Tartozék", value: "töltő, kábel" },
      {
        label: "Szállítás",
        value: "DPD · DPD777888999 · kézbesítve 2026-03-30",
      },
      { label: "Fizetés", value: "bankkártya" },
      { label: "Eset", value: "CASE-2026-0428 · return: accepted" },
      {
        label: "Refund",
        value: "249,00 EUR · elindítva: 2026-05-10 · várható: 2026-05-24",
      },
    ],
  },
];

type GuideQuestion = {
  num: string;
  label: string;
  examples: string[];
};

const QUESTIONS: GuideQuestion[] = [
  {
    num: "01",
    label: "Mi a problémád?",
    examples: ["késő csomag", "hibás termék", "hiányzó tétel"],
  },
  {
    num: "02",
    label: "Van rendelésszámod?",
    examples: ["ORD-CUST-001", "ORD-CUST-005"],
  },
  {
    num: "03",
    label: "Kaptál visszajelzést?",
    examples: ["futártól", "ügyfélszolgálattól"],
  },
  {
    num: "04",
    label: "Visszatérítés vagy csere?",
    examples: ["visszatérítést kérek", "cserét szeretnék"],
  },
];

const STYLE_SCOPED = `
.lgp-aside {
  width: 280px;
  flex-shrink: 0;
  align-self: stretch;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--tc-border);
  background: rgba(255, 255, 255, 0.4);
}
.lgp-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 1rem 0.85rem;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.lgp-scroll::-webkit-scrollbar {
  display: none;
}
.lgp-header {
  font-size: 0.62rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--tc-muted);
  margin: 0 0 0.4rem;
}
.lgp-header-line {
  width: 2rem;
  height: 2px;
  background: linear-gradient(90deg, var(--tc-accent), var(--tc-accent-mid));
  border-radius: 2px;
  margin: 0 0 1.1rem;
}
.lgp-card {
  background: var(--tc-card-bg);
  border: 1px solid var(--tc-border);
  border-radius: 10px;
  box-shadow: var(--tc-shadow);
  padding: 0.65rem 0.8rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 1.25rem;
}
.lgp-card-label {
  font-size: 0.72rem;
  color: var(--tc-muted);
  font-weight: 600;
}
.lgp-card-value {
  font-size: 0.8rem;
  color: var(--tc-text);
  font-weight: 600;
}
.lgp-section-label {
  font-size: 0.62rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--tc-muted);
  margin: 0 0 0.5rem;
}
.lgp-pattern-card {
  background: rgba(138, 106, 74, 0.06);
  border: 1px solid var(--tc-border);
  border-radius: 8px;
  padding: 0.55rem 0.75rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.78rem;
  color: var(--tc-text);
  margin-bottom: 0.6rem;
}
.lgp-pattern-card small {
  display: block;
  margin-top: 0.2rem;
  font-size: 0.7rem;
  color: var(--tc-muted);
  font-family: inherit;
}
.lgp-order-card {
  border: 1px solid var(--tc-border);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.85);
  margin-bottom: 0.55rem;
  overflow: hidden;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}
.lgp-order-card-open {
  border-color: var(--tc-accent-mid);
  box-shadow: 0 0 0 2px rgba(138, 106, 74, 0.12);
}
.lgp-order-head {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.4rem 0.45rem 0.4rem 0.6rem;
  width: 100%;
}
.lgp-order-toggle {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex: 1;
  min-width: 0;
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  color: var(--tc-text);
  text-align: left;
  font: inherit;
}
.lgp-order-toggle:focus-visible {
  outline: 2px solid var(--tc-accent-mid);
  outline-offset: 2px;
  border-radius: 4px;
}
.lgp-order-id {
  flex: 1;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--tc-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lgp-order-copy {
  background: transparent;
  border: none;
  color: var(--tc-accent);
  cursor: pointer;
  font-size: 0.9rem;
  padding: 0.15rem 0.32rem;
  border-radius: 4px;
  transition: background 0.12s ease, color 0.12s ease;
}
.lgp-order-copy:hover {
  background: rgba(138, 106, 74, 0.1);
}
.lgp-order-copy-ok {
  color: #16a34a;
}
.lgp-order-caret {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.1rem;
  font-size: 0.68rem;
  color: var(--tc-accent);
  transition: transform 0.18s ease;
}
.lgp-order-caret-open {
  transform: rotate(90deg);
}
.lgp-order-body {
  padding: 0 0.6rem 0.7rem;
  border-top: 1px solid var(--tc-border);
}
.lgp-order-title {
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--tc-accent);
  letter-spacing: 0.02em;
  margin: 0.55rem 0 0.3rem;
}
.lgp-order-scenario {
  font-size: 0.72rem;
  line-height: 1.45;
  color: var(--tc-text);
  margin: 0 0 0.55rem;
}
.lgp-order-facts {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.lgp-order-facts li {
  display: grid;
  grid-template-columns: 5.2rem 1fr;
  gap: 0.4rem;
  align-items: baseline;
  font-size: 0.7rem;
  line-height: 1.4;
}
.lgp-order-fact-label {
  color: var(--tc-muted);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: 0.62rem;
}
.lgp-order-fact-value {
  color: var(--tc-text);
  word-break: break-word;
  overflow-wrap: anywhere;
}
.lgp-section-spacer {
  height: 1.2rem;
}
.lgp-question {
  position: relative;
  padding-left: 2.1rem;
  padding-bottom: 0.85rem;
}
.lgp-question:not(:last-child)::before {
  content: "";
  position: absolute;
  left: 0.78rem;
  top: 1.4rem;
  bottom: 0;
  width: 2px;
  background: linear-gradient(180deg, var(--tc-accent-mid) 0%, transparent 100%);
  opacity: 0.5;
}
.lgp-question-bubble {
  position: absolute;
  left: 0;
  top: 0;
  width: 1.6rem;
  height: 1.6rem;
  border-radius: 999px;
  background: linear-gradient(180deg, var(--tc-accent-mid) 0%, var(--tc-accent) 100%);
  color: #fff;
  font-size: 0.65rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px rgba(138, 106, 74, 0.3);
}
.lgp-question-head {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  cursor: pointer;
  background: transparent;
  border: none;
  color: var(--tc-text);
  font-size: 0.82rem;
  font-weight: 600;
  text-align: left;
  padding: 0.2rem 0;
  width: 100%;
}
.lgp-question-caret {
  display: inline-block;
  font-size: 0.7rem;
  color: var(--tc-accent);
  transition: transform 0.18s ease;
}
.lgp-question-caret-open {
  transform: rotate(90deg);
}
.lgp-question-examples {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin: 0.4rem 0 0;
  padding: 0;
  list-style: none;
}
.lgp-question-examples li {
  font-size: 0.7rem;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  background: rgba(138, 106, 74, 0.1);
  color: var(--tc-accent);
  border: 1px solid var(--tc-border);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
.lgp-footer {
  margin: 1.4rem 0 0;
  padding: 0.7rem 0.6rem 0;
  border-top: 1px solid var(--tc-border);
  font-size: 0.72rem;
  font-style: italic;
  color: var(--tc-muted);
  line-height: 1.45;
}
`;

export function LeftGuidePanel() {
  const [openOrderIdx, setOpenOrderIdx] = useState<number | null>(null);
  const [copiedOrderIdx, setCopiedOrderIdx] = useState<number | null>(null);
  const [openQuestionIdx, setOpenQuestionIdx] = useState<number | null>(0);

  const handleCopyOrder = async (idx: number) => {
    const id = ORDER_SCENARIOS[idx]?.id;
    if (!id) return;
    try {
      await navigator.clipboard.writeText(id);
      setCopiedOrderIdx(idx);
      window.setTimeout(() => {
        setCopiedOrderIdx((prev) => (prev === idx ? null : prev));
      }, 1200);
    } catch {
      /* clipboard hozzáférés letiltva — csendes fail */
    }
  };

  return (
    <aside className="lgp-aside" aria-label="Próbáld ki — segédpanel">
      <style>{STYLE_SCOPED}</style>
      <div className="lgp-scroll">
        <p className="lgp-header">Próbáld ki</p>
        <div className="lgp-header-line" aria-hidden />

        <div className="lgp-card">
          <span className="lgp-card-label">Demo környezet</span>
          <span className="lgp-card-value">{SYSTEM_DATE}</span>
        </div>

        <p className="lgp-section-label">Rendelésszám formátum</p>
        <div className="lgp-pattern-card">
          ORD-[KAT]-[SZÁM]
          <small>2–6 nagybetű · 2–6 szám</small>
        </div>

        {ORDER_SCENARIOS.map((order, idx) => {
          const isOpen = openOrderIdx === idx;
          const isCopied = copiedOrderIdx === idx;
          const bodyId = `lgp-order-body-${idx}`;
          return (
            <div
              key={order.id}
              className={`lgp-order-card ${isOpen ? "lgp-order-card-open" : ""}`}
            >
              <div className="lgp-order-head">
                <button
                  type="button"
                  className="lgp-order-toggle"
                  onClick={() =>
                    setOpenOrderIdx((prev) => (prev === idx ? null : idx))
                  }
                  aria-expanded={isOpen}
                  aria-controls={bodyId}
                >
                  <span
                    className={`lgp-order-caret ${isOpen ? "lgp-order-caret-open" : ""}`}
                    aria-hidden
                  >
                    ▶
                  </span>
                  <span className="lgp-order-id">{order.id}</span>
                </button>
                <button
                  type="button"
                  className={`lgp-order-copy ${isCopied ? "lgp-order-copy-ok" : ""}`}
                  onClick={() => void handleCopyOrder(idx)}
                  aria-label={isCopied ? "Másolva" : `Másolás: ${order.id}`}
                  title={isCopied ? "Másolva" : "Másolás vágólapra"}
                >
                  {isCopied ? "✓" : "⎘"}
                </button>
              </div>
              {isOpen ? (
                <div id={bodyId} className="lgp-order-body">
                  <p className="lgp-order-title">{order.title}</p>
                  <p className="lgp-order-scenario">{order.scenario}</p>
                  <ul className="lgp-order-facts">
                    {order.facts.map((fact) => (
                      <li key={fact.label}>
                        <span className="lgp-order-fact-label">
                          {fact.label}
                        </span>
                        <span className="lgp-order-fact-value">
                          {fact.value}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          );
        })}

        <div className="lgp-section-spacer" />
        <p className="lgp-section-label">Kérdés-példák</p>

        {QUESTIONS.map((q, qIdx) => {
          const isOpen = openQuestionIdx === qIdx;
          return (
            <div key={q.num} className="lgp-question">
              <span className="lgp-question-bubble" aria-hidden>
                {q.num}
              </span>
              <button
                type="button"
                className="lgp-question-head"
                onClick={() =>
                  setOpenQuestionIdx((prev) => (prev === qIdx ? null : qIdx))
                }
                aria-expanded={isOpen}
              >
                <span
                  className={`lgp-question-caret ${isOpen ? "lgp-question-caret-open" : ""}`}
                  aria-hidden
                >
                  ▶
                </span>
                <span>{q.label}</span>
              </button>
              {isOpen ? (
                <ul className="lgp-question-examples">
                  {q.examples.map((ex) => (
                    <li key={ex}>{ex}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}

        <p className="lgp-footer">
          Ez egy döntési flow, nem szabad LLM-válasz: minden lépés egy kondíción
          múlik. A teljesülő kondíciók együttese határozza meg, hogyan halad
          tovább a beszélgetés.
        </p>
      </div>
    </aside>
  );
}
