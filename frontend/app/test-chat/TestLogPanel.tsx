"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

import type { SavedLogSnapshotEntry, SavedTestRun } from "./savedRunsStorage";
import { loadSavedRuns } from "./savedRunsStorage";

import s from "./TestChatShell.module.scss";

type Props = {
  /** Increment after a successful save so the list reloads from localStorage. */
  savedRevision: number;
};

const PROMPT_COLLAPSE_LEN = 180;
const ASSISTANT_COLLAPSE_LEN = 220;

function shortRunId(runId: string): string {
  if (runId.length <= 14) return runId;
  return `${runId.slice(0, 10)}…${runId.slice(-4)}`;
}

function formatStepLine(sent: string | null | undefined, response: string | null | undefined): string {
  const a = sent ?? null;
  const b = response ?? null;
  if (a === null && b === null) return "—";
  if (a === null) return b as string;
  if (b === null) return a;
  if (a === b) return a;
  return `${a} → ${b}`;
}

function CollapsibleTextBlock({
  label,
  text,
  threshold,
  variant,
}: {
  label: string;
  text: string;
  threshold: number;
  variant: "prompt" | "ai";
}) {
  const long = text.length > threshold;
  if (!long && variant === "ai") {
    return (
      <div className={s.aiBlock}>
        <p className={s.aiBlockTitle}>{label}</p>
        <p className={s.aiBlockText}>{text}</p>
      </div>
    );
  }
  if (!long) {
    return (
      <>
        <p className={s.entryLabel}>{label}</p>
        <p className={s.entryPrompt}>{text}</p>
      </>
    );
  }
  const wrapClass =
    variant === "ai" ? `${s.logCollapsible} ${s.logCollapsibleAi}` : s.logCollapsible;
  return (
    <details className={wrapClass}>
      <summary className={s.logCollapsibleSummary}>
        {label} — {text.length} karakter (kattints a teljes szöveghez)
      </summary>
      <p className={s.logCollapsibleBody}>{text}</p>
    </details>
  );
}

function LogEntryCard({ entry, idx }: { entry: SavedLogSnapshotEntry; idx: number }) {
  const cq = entry.clarificationQuestion;
  const hasClarification = typeof cq === "string" && cq.trim().length > 0;
  const sentStep = entry.sentStepId ?? null;
  const respStep = entry.responseStepId ?? null;
  const respNext = entry.responseNextStepId ?? null;
  const hasStepMeta = sentStep !== null || respStep !== null || respNext !== null;
  const imageProvided = entry.imageProvided === true;
  const orderId = entry.orderId;

  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const handleCopy = async () => {
    try {
      const payload = JSON.stringify(entry, null, 2);
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload);
      } else {
        const ta = document.createElement("textarea");
        ta.value = payload;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("Bejegyzés másolása sikertelen", err);
    }
  };

  return (
    <article className={s.entryCard}>
      <button
        type="button"
        onClick={handleCopy}
        className={`${s.entryCopyBtn} ${copied ? s.entryCopyBtnCopied : ""}`}
        aria-label={copied ? "Másolva" : "Bejegyzés JSON másolása"}
        title={copied ? "Másolva" : "Bejegyzés JSON másolása"}
      >
        {copied ? <Check size={16} strokeWidth={2.25} /> : <Copy size={16} strokeWidth={2} />}
      </button>
      <p className={s.entryMeta}>
        #{idx + 1} · {new Date(entry.ts).toLocaleTimeString()} ·{" "}
        {entry.responseType === "fallback" && entry.status === "clarification"
          ? "fallback (clarification)"
          : (entry.status ?? "—")}{" "}
        · {entry.latencyMs ?? "—"}ms
      </p>
      <CollapsibleTextBlock
        label="Prompt"
        text={entry.prompt}
        threshold={PROMPT_COLLAPSE_LEN}
        variant="prompt"
      />
      {hasClarification ? (
        <>
          <p className={s.entryLabel}>Pontosító kérdés (API)</p>
          <p className={s.entryPrompt}>{cq}</p>
        </>
      ) : null}
      <CollapsibleTextBlock
        label="AI válasz (megjelenített)"
        text={entry.assistantMessage}
        threshold={ASSISTANT_COLLAPSE_LEN}
        variant="ai"
      />
      {hasStepMeta ? (
        <p className={s.entryRow}>
          Lépés (küldött → válasz currentStep): {formatStepLine(sentStep, respStep)}
          {respNext != null && respNext !== "" ? ` · válasz nextStep: ${respNext}` : ""}
        </p>
      ) : null}
      {imageProvided ? <p className={s.entryRow}>Kép: igen (image_provided)</p> : null}
      {orderId ? (
        <p className={s.entryRow}>
          Rendelés ID: <code>{orderId}</code>
        </p>
      ) : null}
      <p className={s.entryRow}>
        Küldött node: {entry.sentPageId ?? entry.activeNodeId ?? "—"}
      </p>
      <p className={s.entryRow}>
        Szerver node:{" "}
        {entry.serverActiveNodeId ??
          (entry.status === "clarification" ? "— (clarification)" : entry.activeNodeId ?? "—")}{" "}
        → {entry.nextPageId ?? "—"}
      </p>
      {entry.satisfiedConditions.length > 0 ? (
        <ul className={s.entryTags}>
          <li>Teljesült: {entry.satisfiedConditions.join(", ")}</li>
        </ul>
      ) : null}
      {entry.newlySatisfied.length > 0 ? (
        <ul className={s.entryTags}>
          <li>Új: {entry.newlySatisfied.join(", ")}</li>
        </ul>
      ) : null}
      {entry.missing.length > 0 ? (
        <ul className={s.entryTags}>
          <li>Hiányzó: {entry.missing.join(", ")}</li>
        </ul>
      ) : null}
    </article>
  );
}

export function TestLogPanel({ savedRevision }: Props) {
  const [runs, setRuns] = useState<SavedTestRun[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const list = loadSavedRuns();
    setRuns(list);
    setSelectedId((prev) => {
      if (list.length === 0) return null;
      if (prev && list.some((r) => r.id === prev)) return prev;
      return list[0].id;
    });
  }, [savedRevision]);

  const selected = useMemo(
    () => runs.find((r) => r.id === selectedId) ?? null,
    [runs, selectedId],
  );

  if (runs.length === 0) {
    return (
      <div className={s.logRoot}>
        <p className={s.logEmpty}>
          Még nincs lokálisan mentett futás — használd a Mentés gombot a Teszt nézetben.
        </p>
      </div>
    );
  }

  return (
    <div className={s.logRoot}>
      <div className={s.logGrid}>
        <div className={s.logListCol}>
          <h2 className={s.logListTitle}>Mentett futások</h2>
          <div className={s.logListScroll}>
            {runs.map((run) => (
              <button
                key={run.id}
                type="button"
                className={`${s.logListItem} ${run.id === selectedId ? s.logListItemActive : ""}`}
                onClick={() => setSelectedId(run.id)}
              >
                <span className={s.logListItemTime}>
                  {new Date(run.savedAt).toLocaleString()}
                </span>
                <span className={s.logListItemRun}>{shortRunId(run.runId)}</span>
                <span className={s.logListItemTime}>{run.entryCount} bejegyzés</span>
              </button>
            ))}
          </div>
        </div>

        <div className={s.logDetailCol}>
          {!selected ? (
            <p className={s.logEmpty}>Válassz egy mentést a bal oldali listából.</p>
          ) : (
            <div className={s.logDetailScroll}>
              <p className={`${s.entryMeta} ${s.logRunMeta}`}>
                Session: <code>{selected.sessionId}</code>
                {" · "}
                Story: <code>{selected.storyId}</code>
              </p>
              {selected.entries.map((entry, idx) => (
                <LogEntryCard key={entry.id} entry={entry} idx={idx} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
