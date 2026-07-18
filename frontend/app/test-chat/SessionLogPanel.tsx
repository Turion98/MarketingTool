"use client";

import { useEffect, useRef } from "react";

import type { ApiTurnLogEntry, DebugInfo, LogEntry } from "./testChatTypes";
import { formatApiTurnStepLabel, formatStatusForLog } from "./testChatTypes";

/**
 * SessionLogPanel — 2. sor jobb oldali panele.
 * A régi `debugAside` és `promptLogSection` teljes tartalmát átveszi:
 * - debugInfo (activeNodeId, aktív/következő step, status+responseType, nextPageId, latency)
 * - satisfiedConditions / newlySatisfied / missing 3-oszlopos blokk
 * - apiTurnLog (forduló napló)
 * - logs lista (prompt + AI válasz + pageId transition)
 * - Mentés gomb (onSave prop)
 *
 * NEM mentésre: saveLogsToBackend logikája a szülő page.tsx-ben marad,
 * itt csak onSave callback fut.
 */

type Props = {
  debugInfo: DebugInfo;
  apiTurnLog: ApiTurnLogEntry[];
  logs: LogEntry[];
  isSavingLogs: boolean;
  onSave: () => void;
};

const STYLE_SCOPED = `
.slp-panel {
  display: flex;
  flex-direction: column;
  min-height: 240px;
  /* A panel termeszetes magassagot kap, de nem nyulik veg nelkul:
     a slp-scroll belul gorget, ha sok a tartalom. */
  max-height: 72vh;
  border-radius: 12px;
  border: 1px solid var(--tc-border);
  background: rgba(3, 7, 18, 0.92);
  color: #e5e7eb;
  overflow: hidden;
  font-family: system-ui, -apple-system, Segoe UI, sans-serif;
}
.slp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.55rem 0.85rem;
  border-bottom: 1px solid #1f2937;
  background: rgba(15, 23, 42, 0.55);
}
.slp-title {
  margin: 0;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #94a3b8;
}
.slp-save {
  appearance: none;
  border: none;
  cursor: pointer;
  font-size: 0.74rem;
  font-weight: 600;
  padding: 0.35rem 0.85rem;
  border-radius: 0.5rem;
  color: #fff;
  background: linear-gradient(180deg, var(--tc-accent-mid) 0%, var(--tc-accent) 100%);
}
.slp-save:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.slp-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 0.75rem 0.85rem;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.slp-scroll::-webkit-scrollbar {
  display: none;
}
.slp-section {
  margin-bottom: 0.95rem;
}
.slp-section-label {
  margin: 0 0 0.4rem;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #6b7280;
}
.slp-grid {
  display: grid;
  /* NodeInfo: keskenyebb, Conditions: szelesebb hogy a 3 sub-oszlop ne legyen szukseges. */
  grid-template-columns: minmax(220px, 1fr) minmax(0, 1.9fr);
  gap: 0.95rem;
}
@media (max-width: 760px) {
  .slp-grid {
    grid-template-columns: 1fr;
  }
}
.slp-row {
  display: flex;
  gap: 0.4rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.76rem;
  line-height: 1.4;
}
.slp-key {
  color: #6b7280;
  flex-shrink: 0;
}
.slp-val {
  color: #4ade80;
  font-weight: 500;
  word-break: break-all;
}
.slp-val-warn {
  color: #facc15;
}
.slp-val-blue {
  color: #60a5fa;
}
.slp-conds {
  display: grid;
  /* Rugalmas: auto-fit a min-szelessegig stackel, soha nem szorul ki nev. */
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 0.6rem;
}
.slp-cond-col {
  border: 1px solid #1f2937;
  border-radius: 6px;
  padding: 0.45rem 0.55rem;
  background: rgba(15, 23, 42, 0.4);
  min-width: 0;
}
.slp-cond-title {
  margin: 0 0 0.35rem;
  font-size: 0.62rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #6b7280;
}
.slp-cond-list {
  margin: 0;
  padding: 0;
  list-style: none;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.72rem;
  line-height: 1.45;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.slp-cond-list li {
  display: flex;
  gap: 0.35rem;
  align-items: flex-start;
  /* Hosszu kondicio-nevek toresenek engedelyezese. */
  word-break: break-word;
  overflow-wrap: anywhere;
}
.slp-cond-marker {
  flex-shrink: 0;
  font-weight: 700;
  line-height: 1.45;
}
.slp-cond-name {
  min-width: 0;
  flex: 1;
}
.slp-cond-sat {
  color: #4ade80;
}
.slp-cond-new {
  color: #facc15;
}
.slp-cond-miss {
  color: #f87171;
}
.slp-cond-empty {
  color: #4b5563;
  font-size: 0.7rem;
}
.slp-turnlog {
  border: 1px solid #1f2937;
  border-radius: 8px;
  padding: 0.55rem 0.65rem;
  max-height: 240px;
  overflow-y: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.72rem;
  background: rgba(0, 0, 0, 0.25);
}
.slp-turnlog-empty {
  color: #6b7280;
  font-style: italic;
  margin: 0;
}
.slp-turnlog-entry {
  padding-bottom: 0.5rem;
  margin-bottom: 0.5rem;
  border-bottom: 1px solid #1f2937;
}
.slp-turnlog-entry:last-child {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}
.slp-turnlog-meta {
  color: #94a3b8;
  margin: 0 0 0.2rem;
}
.slp-turnlog-prompt {
  color: #93c5fd;
  margin: 0 0 0.2rem;
}
.slp-turnlog-nodes {
  color: #86efac;
  margin: 0 0 0.2rem;
}
.slp-turnlog-newly {
  color: #fde047;
  margin: 0;
}
.slp-logs {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  max-height: 280px;
  overflow-y: auto;
}
.slp-log-card {
  border: 1px solid #1f2937;
  border-radius: 8px;
  background: rgba(17, 24, 39, 0.55);
  padding: 0.5rem 0.6rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.72rem;
  line-height: 1.45;
}
.slp-log-time {
  color: #94a3b8;
  margin: 0 0 0.2rem;
}
.slp-log-prompt {
  color: #93c5fd;
  margin: 0 0 0.2rem;
}
.slp-log-ai-label {
  color: #fbbf24;
  font-size: 0.62rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin: 0.25rem 0 0.1rem;
}
.slp-log-ai {
  color: #e5e7eb;
  margin: 0 0 0.2rem;
  white-space: pre-line;
}
.slp-log-meta {
  color: #86efac;
  margin: 0;
}
.slp-log-empty {
  color: #6b7280;
  font-style: italic;
  margin: 0;
}
`;

function StatusValue({ debugInfo }: { debugInfo: DebugInfo }) {
  const isClarification = debugInfo.status === "clarification";
  return (
    <span
      className={`slp-val ${isClarification ? "slp-val-warn" : ""}`}
    >
      {formatStatusForLog(debugInfo.status, debugInfo.responseType)}
    </span>
  );
}

function NodeInfoBlock({ debugInfo }: { debugInfo: DebugInfo }) {
  return (
    <div>
      <p className="slp-section-label">Node Info</p>
      <div className="slp-row">
        <span className="slp-key">Aktív:</span>
        <span className="slp-val">{debugInfo.activeNodeId || "—"}</span>
      </div>
      <div className="slp-row">
        <span className="slp-key">Aktív step:</span>
        <span className="slp-val">{debugInfo.lastApiCurrentStepId || "—"}</span>
      </div>
      <div className="slp-row">
        <span className="slp-key">Következő step:</span>
        <span className="slp-val">{debugInfo.stepNextId || "—"}</span>
      </div>
      <div className="slp-row">
        <span className="slp-key">ResponseType:</span>
        <span className="slp-val">{debugInfo.responseType || "—"}</span>
      </div>
      <div className="slp-row">
        <span className="slp-key">Új kondíciók:</span>
        <span className="slp-val slp-val-warn">
          {debugInfo.newlySatisfied.length
            ? debugInfo.newlySatisfied.join(", ")
            : "—"}
        </span>
      </div>
      <div className="slp-row">
        <span className="slp-key">Státusz:</span>
        <StatusValue debugInfo={debugInfo} />
      </div>
      <div className="slp-row">
        <span className="slp-key">Következő:</span>
        <span className="slp-val">{debugInfo.nextPageId || "—"}</span>
      </div>
      <div className="slp-row">
        <span className="slp-key">Latencia:</span>
        <span className="slp-val slp-val-blue">
          {debugInfo.latencyMs ?? "—"}ms
        </span>
      </div>
    </div>
  );
}

function ConditionsBlock({ debugInfo }: { debugInfo: DebugInfo }) {
  return (
    <div>
      <p className="slp-section-label">Kondíciók</p>
      <div className="slp-conds">
        <div className="slp-cond-col">
          <p className="slp-cond-title">Teljesült</p>
          {debugInfo.satisfiedConditions.length ? (
            <ul className="slp-cond-list">
              {debugInfo.satisfiedConditions.map((c) => (
                <li key={`sat-${c}`} className="slp-cond-sat">
                  <span className="slp-cond-marker">✓</span>
                  <span className="slp-cond-name">{c}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="slp-cond-empty">—</p>
          )}
        </div>
        <div className="slp-cond-col">
          <p className="slp-cond-title">Új</p>
          {debugInfo.newlySatisfied.length ? (
            <ul className="slp-cond-list">
              {debugInfo.newlySatisfied.map((c) => (
                <li key={`new-${c}`} className="slp-cond-new">
                  <span className="slp-cond-marker">+</span>
                  <span className="slp-cond-name">{c}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="slp-cond-empty">—</p>
          )}
        </div>
        <div className="slp-cond-col">
          <p className="slp-cond-title">Hiányzó</p>
          {debugInfo.missing.length ? (
            <ul className="slp-cond-list">
              {debugInfo.missing.map((c) => (
                <li key={`miss-${c}`} className="slp-cond-miss">
                  <span className="slp-cond-marker">✗</span>
                  <span className="slp-cond-name">{c}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="slp-cond-empty">—</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ApiTurnLogBlock({ apiTurnLog }: { apiTurnLog: ApiTurnLogEntry[] }) {
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [apiTurnLog.length]);

  return (
    <div>
      <p className="slp-section-label">API forduló napló</p>
      <div className="slp-turnlog">
        {apiTurnLog.length === 0 ? (
          <p className="slp-turnlog-empty">Még nincs API válasz naplózva.</p>
        ) : (
          <div>
            {apiTurnLog.map((entry) => (
              <div key={entry.id} className="slp-turnlog-entry">
                <p className="slp-turnlog-meta">
                  #{entry.turn} · {entry.latencyMs ?? "—"}ms ·{" "}
                  <span
                    style={{
                      color:
                        entry.status === "clarification" ? "#facc15" : "#e5e7eb",
                    }}
                  >
                    {formatStatusForLog(entry.status, entry.responseType)}
                  </span>
                </p>
                <p className="slp-turnlog-prompt">
                  Prompt: {entry.promptTruncated}
                </p>
                <p className="slp-turnlog-nodes">
                  Küldött: <code>{entry.sentPageId}</code> · Szerver:{" "}
                  {entry.serverActiveNodeId ? (
                    <code>{entry.serverActiveNodeId}</code>
                  ) : entry.status === "clarification" ? (
                    <span>— (clarification)</span>
                  ) : (
                    "—"
                  )}{" "}
                  · Step:{" "}
                  {formatApiTurnStepLabel(entry.sentStepId, entry.responseStepId)}
                </p>
                <p className="slp-turnlog-newly">
                  Új kondíciók:{" "}
                  {entry.newlySatisfied.length
                    ? entry.newlySatisfied.join(", ")
                    : "—"}
                </p>
              </div>
            ))}
            <div ref={endRef} style={{ height: 1 }} />
          </div>
        )}
      </div>
    </div>
  );
}

function LogsListBlock({ logs }: { logs: LogEntry[] }) {
  return (
    <div>
      <p className="slp-section-label">Prompt Log</p>
      {logs.length === 0 ? (
        <p className="slp-log-empty">Még nincs log bejegyzés.</p>
      ) : (
        <div className="slp-logs">
          {logs.map((log) => (
            <div key={log.id} className="slp-log-card">
              <p className="slp-log-time">
                {new Date(log.ts).toLocaleTimeString()} ·{" "}
                {formatStatusForLog(log.status, log.responseType)} ·{" "}
                {log.latencyMs ?? "—"}ms
              </p>
              <p className="slp-log-prompt">Prompt: {log.prompt}</p>
              <p className="slp-log-ai-label">AI válasz</p>
              <p className="slp-log-ai">{log.assistantMessage}</p>
              <p className="slp-log-meta">
                Küldött: {log.sentPageId ?? "—"} · Szerver:{" "}
                {log.serverActiveNodeId ??
                  (log.status === "clarification"
                    ? "— (clarification)"
                    : "—")}{" "}
                → {log.nextPageId || "—"}
                {log.responseType ? ` · ${log.responseType}` : ""}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function SessionLogPanel({
  debugInfo,
  apiTurnLog,
  logs,
  isSavingLogs,
  onSave,
}: Props) {
  return (
    <section className="slp-panel" aria-label="Session log panel">
      <style>{STYLE_SCOPED}</style>
      <div className="slp-head">
        <p className="slp-title">Session Log</p>
        <button
          type="button"
          onClick={onSave}
          disabled={isSavingLogs || logs.length === 0}
          className="slp-save"
        >
          {isSavingLogs ? "Mentés…" : "Mentés"}
        </button>
      </div>
      <div className="slp-scroll">
        <div className="slp-section slp-grid">
          <NodeInfoBlock debugInfo={debugInfo} />
          <ConditionsBlock debugInfo={debugInfo} />
        </div>
        <div className="slp-section">
          <ApiTurnLogBlock apiTurnLog={apiTurnLog} />
        </div>
        <div className="slp-section">
          <LogsListBlock logs={logs} />
        </div>
      </div>
    </section>
  );
}
