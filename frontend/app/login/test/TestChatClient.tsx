"use client";

import Link from "next/link";
import { FormEvent, useMemo, useRef, useState } from "react";
import { FileImage, Paperclip, X } from "lucide-react";
import { getClientFetchApiBase } from "@/app/lib/publicApiBase";
// Kanonikus order ID regex: /\bORD-[A-Z]{2,6}-[0-9]{2,6}\b/i — questellOrderId.ts
import { extractQuestellOrderId } from "@/app/lib/questellOrderId";
import s from "./testChat.module.scss";

/** API forduló: ha a válasz `currentStepId` eltér a küldött lépéstől → step_1 → step_3a. */
function formatApiTurnStepLabel(sent: string | null, response: string | null): string {
  const s = sent ?? null;
  const r = response ?? null;
  if (s === null && r === null) return "—";
  if (s === null) return r as string;
  if (r === null) return s;
  if (s === r) return s;
  return `${s} → ${r}`;
}

function assistantTextFromProcess(result: ProcessResponse): string {
  const end = result.endPageContent;
  const am = result.assistantMessage;
  const ack = typeof am === "string" ? am.trim() : "";
  const endText = typeof end === "string" ? end.trim() : "";
  if (ack && endText && ack !== endText) {
    return `${ack}\n\n${endText}`;
  }
  if (endText) return endText;
  if (ack) return ack;
  const cq = result.clarificationQuestion;
  if (typeof cq === "string" && cq.trim()) return cq.trim();
  return "Nincs szoveges valasz a backendtol.";
}

function assistantBubblesFromProcess(result: ProcessResponse): string[] {
  const end = result.endPageContent;
  const am = result.assistantMessage;
  const ack = typeof am === "string" ? am.trim() : "";
  const endText = typeof end === "string" ? end.trim() : "";
  if (ack && endText && ack !== endText) {
    const ackOnly = ack.includes(endText) ? ack.replace(endText, "").trim() : ack;
    const lead = ackOnly.replace(/\n\n+$/, "").trim();
    if (lead) return [lead, endText];
    return [endText];
  }

  const full = assistantTextFromProcess(result);
  const t = full.replace(/\r\n/g, "\n").trim();
  if (!t) return [full];

  const byDouble = t
    .split(/\n\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (byDouble.length > 1) return byDouble;

  const single = byDouble[0] ?? t;
  const lines = single
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (lines.length === 2) return lines;
  if (lines.length >= 3 && lines.length <= 5 && single.length < 1600) return lines;

  return [single];
}

type ChatMessage =
  | { role: "user"; text: string; hasImage?: boolean }
  | { role: "assistant"; bubbles: string[]; sentAt?: number };

type ProcessResponse = {
  status?: "ok" | "clarification" | "step_start" | string;
  activeNodeId?: string | null;
  satisfiedConditions?: string[];
  assistantMessage?: string;
  endPageContent?: string | null;
  clarificationQuestion?: string | null;
  nextPageId?: string | null;
  responseType?: string | null;
  currentStepId?: string | null;
  nextStepId?: string | null;
};

export default function TestChatClient() {
  const apiBase = getClientFetchApiBase();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      bubbles: ["Teszt chatbot elindult. Irj egy uzenetet a panaszkezeles teszteleshez."],
    },
  ]);
  const [activePageId, setActivePageId] = useState("complaint-intake");
  const [currentStepId, setCurrentStepId] = useState<string | null>(null);
  const [lastApiTurnDebug, setLastApiTurnDebug] = useState<{
    serverNodeId: string | null;
    stepLabel: string;
  } | null>(null);
  const [satisfiedConditions, setSatisfiedConditions] = useState<string[]>([]);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [pendingAttachmentName, setPendingAttachmentName] = useState<string | null>(null);
  const [simulateImage, setSimulateImage] = useState(false);

  const canSend = useMemo(
    () => (input.trim().length > 0 || simulateImage || pendingAttachmentName !== null) && !busy,
    [input, busy, simulateImage, pendingAttachmentName],
  );

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const promptRaw = input.trim();
    const imageThisTurn = simulateImage || pendingAttachmentName !== null;
    if ((!promptRaw && !imageThisTurn) || busy) return;

    const promptForApi = promptRaw || "(Kép csatolva.)";
    const displayText = promptRaw || "(Kép csatolva.)";
    const pageIdAtSend = activePageId;
    const stepIdAtSend = currentStepId;

    setBusy(true);
    setInput("");
    setPendingAttachmentName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setSimulateImage(false);
    setMessages((prev) => [...prev, { role: "user", text: displayText, hasImage: imageThisTurn }]);

    try {
      const response = await fetch(`${apiBase}/api/ai-node/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          src: "ai_complaint_story_v3",
          pageId: activePageId,
          prompt: promptForApi,
          satisfiedConditions,
          currentStepId,
          order_id: orderId ?? null,
          image_provided: imageThisTurn ? true : undefined,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        setLastApiTurnDebug({
          serverNodeId: null,
          stepLabel: formatApiTurnStepLabel(stepIdAtSend, null),
        });
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            bubbles: [`Hiba (${response.status}): ${text || "ismeretlen hiba"}`],
            sentAt: Date.now(),
          },
        ]);
        return;
      }

      const result = (await response.json()) as ProcessResponse;
      if (Array.isArray(result.satisfiedConditions)) {
        setSatisfiedConditions(result.satisfiedConditions);
        if (result.satisfiedConditions.includes("has_order_id")) {
          const extracted = extractQuestellOrderId(promptForApi);
          if (extracted) setOrderId(extracted);
        }
      }
      if (result.status === "ok" && result.nextPageId?.trim()) {
        setActivePageId(result.nextPageId.trim());
        setCurrentStepId(null);
      } else if (result.activeNodeId) {
        setActivePageId(result.activeNodeId);
      }

      const hasStepPayload =
        result.status === "step_start" ||
        "nextStepId" in result ||
        "currentStepId" in result;
      let nextSessionStepId = stepIdAtSend;
      if (hasStepPayload) {
        if (result.nextStepId) {
          nextSessionStepId = result.nextStepId;
        } else if (result.currentStepId) {
          nextSessionStepId = result.currentStepId;
        } else {
          nextSessionStepId = null;
        }
        setCurrentStepId(nextSessionStepId);
      }

      const responseStepId = "currentStepId" in result ? (result.currentStepId ?? null) : null;
      setLastApiTurnDebug({
        serverNodeId: result.activeNodeId ?? pageIdAtSend,
        stepLabel: formatApiTurnStepLabel(stepIdAtSend, responseStepId),
      });

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          bubbles: assistantBubblesFromProcess(result),
          sentAt: Date.now(),
        },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "ismeretlen hiba";
      setLastApiTurnDebug({
        serverNodeId: null,
        stepLabel: formatApiTurnStepLabel(stepIdAtSend, null),
      });
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          bubbles: [`Halozati hiba: ${msg}`],
          sentAt: Date.now(),
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className={s.page}>
      <section className={s.card}>
        <header className={s.header}>
          <h1>Teszt chatbot</h1>
          <p>
            Forras: <code>ai_complaint_story_v3</code>
          </p>
          <p>
            Aktiv node: <code>{activePageId}</code>
          </p>
          {lastApiTurnDebug ? (
            <p>
              Szerver node:{" "}
              {lastApiTurnDebug.serverNodeId ? (
                <code>{lastApiTurnDebug.serverNodeId}</code>
              ) : (
                <span>—</span>
              )}{" "}
              · Step: {lastApiTurnDebug.stepLabel}
            </p>
          ) : null}
        </header>

        <div className={s.chat}>
          {messages.map((m, idx) =>
            m.role === "user" ? (
              <div key={`${m.role}-${idx}`} className={s.user}>
                {m.hasImage ? (
                  <span className={s.userBubbleInner}>
                    <FileImage className={s.msgFileIcon} size={16} aria-hidden />
                    <span>{m.text}</span>
                  </span>
                ) : (
                  m.text
                )}
              </div>
            ) : (
              <div key={`${m.role}-${idx}`} className={s.assistantTurn}>
                {m.bubbles.map((para, pi) => (
                  <div key={pi} className={s.assistant}>
                    {para}
                  </div>
                ))}
                {m.sentAt != null ? (
                  <time
                    className={s.assistantTimestamp}
                    dateTime={new Date(m.sentAt).toISOString()}
                  >
                    {new Date(m.sentAt).toLocaleTimeString()}
                  </time>
                ) : null}
              </div>
            ),
          )}
        </div>

        <form className={s.formWrap} onSubmit={(e) => void onSubmit(e)}>
          <label className={`${s.simulateToggle} ${simulateImage ? s.simulateToggleOn : ""}`}>
            <input
              type="checkbox"
              checked={simulateImage}
              onChange={(e) => setSimulateImage(e.target.checked)}
              disabled={busy}
              className={s.simulateToggleInput}
            />
            <span>Kép szimulálása</span>
          </label>
          {pendingAttachmentName ? (
            <div className={s.attachmentCard}>
              <span className={s.attachmentName} title={pendingAttachmentName}>
                {pendingAttachmentName}
              </span>
              <button
                type="button"
                className={s.attachmentRemove}
                onClick={() => {
                  setPendingAttachmentName(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                aria-label="Csatolmány eltávolítása"
              >
                <X size={16} />
              </button>
            </div>
          ) : null}
          <div className={s.form}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className={s.fileInputHidden}
              onChange={(e) => {
                const f = e.target.files?.[0];
                setPendingAttachmentName(f ? f.name : null);
              }}
              tabIndex={-1}
            />
            <button
              type="button"
              className={s.btnClip}
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              aria-label="Kép csatolása"
            >
              <Paperclip size={20} strokeWidth={2} />
            </button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ird be az uzeneted..."
              disabled={busy}
            />
            <button type="submit" disabled={!canSend}>
              {busy ? "Kuldes..." : "Kuld"}
            </button>
          </div>
        </form>

        <footer className={s.footer}>
          <Link href="/login">Vissza a belepeshez</Link>
        </footer>
      </section>
    </main>
  );
}
