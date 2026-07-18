"use client";

import { useEffect, useRef } from "react";

/**
 * RightProcessPanel — jobb oldali folyamatmonitor a test-chat oldalhoz.
 *
 * Backend SSE protokollra épül:
 *   - meta esemény → "meta" fázis aktív (+ newlySatisfied badge-ek)
 *   - első delta esemény → "routing" fázis aktív
 *   - done esemény → "done" fázis aktív + transition + latency
 *
 * Done-only SSE flow (clarification fallback, no-match, step_done_only, tail_gen):
 *   - csak `done` esemény érkezik
 *   - a `meta` és `routing` fázisokat skipped/neutral állapotban jelöljük (NEM error)
 *   - a turn ettől függetlenül `done`-nal zárul
 */

export type ProcessPhaseId =
  | "waiting"
  | "sent"
  | "parsing"
  | "meta"
  | "routing"
  | "done";

export type PhaseDetail = {
  badges?: string[];
  transition?: string;
  latency?: number;
};

export type PhaseTurn = {
  id: string;
  turnNum: number;
  /** Aktuális futó fázis. null = a turn lezárult (collapsed nézet). */
  activePhase: ProcessPhaseId | null;
  /** A turn során eddig aktivált fázisok (sorrend nem garantált). */
  phases: ProcessPhaseId[];
  details: Partial<Record<ProcessPhaseId, PhaseDetail>>;
  finalTransition: string | null;
};

export type RightProcessPanelProps = {
  turns: PhaseTurn[];
  isRunning: boolean;
};

const ALL_PHASES: ProcessPhaseId[] = [
  "waiting",
  "sent",
  "parsing",
  "meta",
  "routing",
  "done",
];

const PHASE_LABELS: Record<ProcessPhaseId, string> = {
  waiting: "Várakozás",
  sent: "Beérkezés",
  parsing: "Feldolgozás",
  meta: "Kondíciók illesztve",
  routing: "Routing döntés",
  done: "Válasz kész",
};

/**
 * Demo-céllal: ms → ember-olvashatóbb forma. 1000 ms felett másodpercre váltunk,
 * a pontos ms a `title` attribútumban tooltipben elérhető.
 */
function formatLatency(latencyMs: number): {
  text: string;
  tooltip: string;
} {
  const tooltip = `${latencyMs} ms`;
  if (latencyMs >= 1000) {
    return { text: `${(latencyMs / 1000).toFixed(2)} s`, tooltip };
  }
  return { text: `${Math.round(latencyMs)} ms`, tooltip };
}

/** Egyetlen fázis állapota a UI szempontjából. */
type PhaseUiState = "idle" | "active" | "done" | "skipped";

function resolvePhaseState(
  turn: PhaseTurn,
  phase: ProcessPhaseId,
): PhaseUiState {
  if (turn.activePhase === phase) return "active";
  if (turn.phases.includes(phase)) return "done";
  // A "done" fázis elérése után minden ki nem hagyott köztes fázis skipped.
  if (turn.phases.includes("done") || turn.activePhase === "done") {
    return "skipped";
  }
  if (turn.activePhase === null) {
    return turn.phases.includes(phase) ? "done" : "skipped";
  }
  return "idle";
}

const STYLE_SCOPED = `
.rpp-aside {
  width: 320px;
  flex-shrink: 0;
  align-self: stretch;
  background: #0f172a;
  color: #e2e8f0;
  border-left: 1px solid var(--tc-border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.rpp-header {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.75rem 0.9rem;
  border-bottom: 1px solid #1e293b;
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #cbd5e1;
}
.rpp-dot {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: #475569;
  flex-shrink: 0;
}
.rpp-dot-running {
  background: #38bdf8;
  box-shadow: 0 0 0 0 rgba(56, 189, 248, 0.7);
  animation: rpp-pulse 1.4s ease-in-out infinite;
}
.rpp-dot-done {
  background: #22c55e;
}
@keyframes rpp-pulse {
  0% { box-shadow: 0 0 0 0 rgba(56, 189, 248, 0.7); }
  70% { box-shadow: 0 0 0 8px rgba(56, 189, 248, 0); }
  100% { box-shadow: 0 0 0 0 rgba(56, 189, 248, 0); }
}
.rpp-feed {
  flex: 1;
  overflow-y: auto;
  padding: 0.65rem 0.7rem;
  max-height: 520px;
  scrollbar-width: thin;
  scrollbar-color: #334155 transparent;
}
.rpp-feed::-webkit-scrollbar {
  width: 6px;
}
.rpp-feed::-webkit-scrollbar-thumb {
  background: #334155;
  border-radius: 3px;
}
.rpp-empty {
  padding: 1.25rem 0.6rem;
  font-size: 0.78rem;
  color: #64748b;
  font-style: italic;
  text-align: center;
}
.rpp-turn {
  border: 1px solid #1e293b;
  border-radius: 9px;
  padding: 0.55rem 0.65rem;
  margin-bottom: 0.55rem;
  background: rgba(15, 23, 42, 0.6);
  transition: max-height 0.35s ease, opacity 0.3s ease, padding 0.25s ease;
  overflow: hidden;
}
.rpp-turn-active {
  max-height: 600px;
  opacity: 1;
}
.rpp-turn-collapsed {
  max-height: 32px;
  opacity: 0.34;
  padding-top: 0.3rem;
  padding-bottom: 0.3rem;
}
/* Demo: a "Háttérben" chip rákattintásakor 700 ms-os accent pulse, hogy
   szemmel követhető legyen, melyik turn-höz tartozik az adott válasz. */
.rpp-turn-highlight {
  animation: rpp-turn-highlight 700ms ease-out;
}
@keyframes rpp-turn-highlight {
  0% {
    background: rgba(56, 189, 248, 0.32);
    box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.4);
  }
  100% {
    background: rgba(15, 23, 42, 0.6);
    box-shadow: 0 0 0 0 rgba(56, 189, 248, 0);
  }
}
.rpp-turn-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.72rem;
  color: #94a3b8;
  margin-bottom: 0.45rem;
}
.rpp-turn-head-collapsed {
  margin-bottom: 0;
  font-size: 0.7rem;
}
.rpp-turn-num {
  font-weight: 700;
  color: #e2e8f0;
}
.rpp-turn-mini {
  display: inline-flex;
  gap: 0.18rem;
}
.rpp-mini-icon {
  width: 11px;
  height: 11px;
  border-radius: 999px;
  background: #1e293b;
  display: inline-block;
  flex-shrink: 0;
  transition: background 0.25s ease, opacity 0.25s ease;
}
.rpp-mini-done {
  background: #22c55e;
}
.rpp-mini-skipped {
  background: #334155;
  opacity: 0.6;
}
.rpp-turn-transition {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.68rem;
  color: #94a3b8;
  margin-left: auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 140px;
}
.rpp-phase {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.32rem 0.4rem;
  border-radius: 6px;
  position: relative;
  margin-bottom: 0.18rem;
  background: transparent;
  font-size: 0.74rem;
  color: #94a3b8;
  transition: background 0.25s ease, color 0.25s ease;
}
.rpp-phase-active {
  background: rgba(56, 189, 248, 0.08);
  color: #e2e8f0;
}
.rpp-phase-active::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0.3rem;
  bottom: 0.3rem;
  width: 2px;
  border-radius: 1px;
  background: #38bdf8;
  box-shadow: 0 0 6px rgba(56, 189, 248, 0.7);
}
.rpp-phase-done {
  color: #cbd5e1;
}
.rpp-phase-skipped {
  color: #475569;
  font-style: italic;
}
.rpp-phase-icon {
  width: 16px;
  height: 16px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 0.6rem;
  border: 1px solid currentColor;
  background: transparent;
  transition:
    border-color 0.25s ease,
    color 0.25s ease,
    background 0.25s ease;
}
.rpp-icon-active {
  border-color: #38bdf8;
  color: #38bdf8;
}
.rpp-icon-active-ring {
  box-shadow: 0 0 0 0 rgba(56, 189, 248, 0.55);
  animation: rpp-ring 1.4s ease-in-out infinite;
}
@keyframes rpp-ring {
  0% { box-shadow: 0 0 0 0 rgba(56, 189, 248, 0.55); }
  70% { box-shadow: 0 0 0 6px rgba(56, 189, 248, 0); }
  100% { box-shadow: 0 0 0 0 rgba(56, 189, 248, 0); }
}
.rpp-icon-done {
  border-color: #22c55e;
  color: #22c55e;
  background: rgba(34, 197, 94, 0.12);
}
.rpp-icon-skipped {
  border-color: #334155;
  color: #475569;
  border-style: dashed;
}
.rpp-icon-spin {
  animation: rpp-spin 1.1s linear infinite;
}
@keyframes rpp-spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
.rpp-phase-detail {
  margin: 0.15rem 0 0.35rem 1.95rem;
  font-size: 0.7rem;
  color: #94a3b8;
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  animation: rpp-fade-in 0.22s ease-out;
}
@keyframes rpp-fade-in {
  from { opacity: 0; transform: translateY(2px); }
  to { opacity: 1; transform: translateY(0); }
}
.rpp-badge {
  display: inline-block;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  background: rgba(250, 204, 21, 0.16);
  color: #facc15;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.66rem;
}
.rpp-detail-latency {
  color: #60a5fa;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
.rpp-detail-transition {
  color: #86efac;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
.rpp-footer {
  border-top: 1px solid #1e293b;
  padding: 0.45rem 0.9rem;
  font-size: 0.7rem;
  color: #64748b;
  letter-spacing: 0.04em;
}
`;

function PhaseIcon({
  phase,
  state,
}: {
  phase: ProcessPhaseId;
  state: PhaseUiState;
}) {
  const stateClass =
    state === "active"
      ? "rpp-icon-active rpp-icon-active-ring"
      : state === "done"
        ? "rpp-icon-done"
        : state === "skipped"
          ? "rpp-icon-skipped"
          : "";
  const shouldSpin =
    state === "active" && (phase === "parsing" || phase === "routing");
  const glyph =
    state === "done" ? "✓" : state === "skipped" ? "·" : shouldSpin ? "↻" : "";
  return (
    <span
      className={`rpp-phase-icon ${stateClass} ${shouldSpin ? "rpp-icon-spin" : ""}`}
      aria-hidden
    >
      {glyph}
    </span>
  );
}

function PhaseDetailRow({
  phase,
  detail,
}: {
  phase: ProcessPhaseId;
  detail: PhaseDetail | undefined;
}) {
  if (!detail) return null;
  const badges = detail.badges ?? [];
  const hasTransition = typeof detail.transition === "string" && detail.transition.length > 0;
  const hasLatency = typeof detail.latency === "number";
  if (badges.length === 0 && !hasTransition && !hasLatency) return null;
  return (
    <div className="rpp-phase-detail">
      {phase === "meta" && badges.length > 0
        ? badges.map((b) => (
            <span key={b} className="rpp-badge">
              +{b}
            </span>
          ))
        : null}
      {hasTransition ? (
        <span className="rpp-detail-transition">{detail.transition}</span>
      ) : null}
      {hasLatency ? (
        (() => {
          const fmt = formatLatency(detail.latency as number);
          return (
            <span className="rpp-detail-latency" title={fmt.tooltip}>
              {fmt.text}
            </span>
          );
        })()
      ) : null}
    </div>
  );
}

function ActiveTurnCard({ turn }: { turn: PhaseTurn }) {
  return (
    <div className="rpp-turn rpp-turn-active" data-turn-id={turn.id}>
      <div className="rpp-turn-head">
        <span className="rpp-turn-num">#{turn.turnNum}</span>
        {turn.finalTransition ? (
          <span className="rpp-turn-transition" title={turn.finalTransition}>
            {turn.finalTransition}
          </span>
        ) : null}
      </div>
      {ALL_PHASES.map((phase) => {
        const state = resolvePhaseState(turn, phase);
        const phaseClass =
          state === "active"
            ? "rpp-phase-active"
            : state === "done"
              ? "rpp-phase-done"
              : state === "skipped"
                ? "rpp-phase-skipped"
                : "";
        return (
          <div key={phase}>
            <div className={`rpp-phase ${phaseClass}`}>
              <PhaseIcon phase={phase} state={state} />
              <span>{PHASE_LABELS[phase]}</span>
            </div>
            {state === "done" || state === "active" ? (
              <PhaseDetailRow phase={phase} detail={turn.details[phase]} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function CollapsedTurnCard({ turn }: { turn: PhaseTurn }) {
  return (
    <div className="rpp-turn rpp-turn-collapsed" data-turn-id={turn.id}>
      <div className="rpp-turn-head rpp-turn-head-collapsed">
        <span className="rpp-turn-num">#{turn.turnNum}</span>
        <span className="rpp-turn-mini" aria-hidden>
          {ALL_PHASES.map((phase) => {
            const visited = turn.phases.includes(phase);
            return (
              <span
                key={phase}
                className={`rpp-mini-icon ${visited ? "rpp-mini-done" : "rpp-mini-skipped"}`}
              />
            );
          })}
        </span>
        {turn.finalTransition ? (
          <span className="rpp-turn-transition" title={turn.finalTransition}>
            {turn.finalTransition}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function RightProcessPanel({ turns, isRunning }: RightProcessPanelProps) {
  const feedRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = feedRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [turns]);

  const dotClass = isRunning
    ? "rpp-dot rpp-dot-running"
    : turns.length > 0
      ? "rpp-dot rpp-dot-done"
      : "rpp-dot";

  return (
    <aside className="rpp-aside" aria-label="Folyamat monitor">
      <style>{STYLE_SCOPED}</style>
      <div className="rpp-header">
        <span className={dotClass} aria-hidden />
        <span>Döntési folyamat</span>
      </div>
      <div className="rpp-feed" ref={feedRef}>
        {turns.length === 0 ? (
          <p className="rpp-empty">Még nincs forduló.</p>
        ) : (
          turns.map((t) =>
            t.activePhase !== null ? (
              <ActiveTurnCard key={t.id} turn={t} />
            ) : (
              <CollapsedTurnCard key={t.id} turn={t} />
            ),
          )
        )}
      </div>
      <div className="rpp-footer">{turns.length} forduló</div>
    </aside>
  );
}
