"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { FileImage, Paperclip, X } from "lucide-react";

// Kanonikus order ID regex: /\bORD-[A-Z]{2,6}-[0-9]{2,6}\b/i — questellOrderId.ts
import { extractQuestellOrderId } from "../lib/questellOrderId";
import { TestLogPanel } from "./TestLogPanel";
import { appendSavedRun } from "./savedRunsStorage";

import s from "./TestChatShell.module.scss";

type ChatMessage =
  | { role: "user"; text: string; hasImage?: boolean }
  | { role: "assistant"; bubbles: string[]; sentAt?: number; isLoading?: boolean };

const PENDING_ASSISTANT_TEXT = "Feldolgozom a kérésedet…";

function stripLoadingAssistantMessages(msgs: ChatMessage[]): ChatMessage[] {
  return msgs.filter((m) => !(m.role === "assistant" && m.isLoading));
}

type DebugInfo = {
  activeNodeId: string | null;
  nextPageId: string | null;
  status: string | null;
  /** Backend: pl. "fallback" ha story JSON-ból jött assistantMessage. */
  responseType: string | null;
  satisfiedConditions: string[];
  newlySatisfied: string[];
  missing: string[];
  latencyMs: number | null;
  /** Utolsó API válasz `currentStepId` mezője (ha volt a payloadban). */
  lastApiCurrentStepId: string | null;
  stepNextId: string | null;
};

type ProcessResponse = {
  assistantMessage?: string;
  /** Goto végoldal fix szövege (ha a backend küldi). */
  endPageContent?: string | null;
  clarificationQuestion?: string | null;
  responseType?: string | null;
  activeNodeId?: string | null;
  nextPageId?: string | null;
  status?: string | null;
  satisfiedConditions?: string[];
  newlySatisfied?: string[];
  missing?: string[];
  currentStepId?: string | null;
  nextStepId?: string | null;
};

type LogEntry = {
  id: string;
  ts: number;
  prompt: string;
  assistantMessage: string;
  sentPageId: string | null;
  serverActiveNodeId: string | null;
  responseType: string | null;
  activeNodeId: string | null;
  nextPageId: string | null;
  status: string | null;
  latencyMs: number | null;
  satisfiedConditions: string[];
  newlySatisfied: string[];
  missing: string[];
  clarificationQuestion: string | null;
  sentStepId: string | null;
  responseStepId: string | null;
  responseNextStepId: string | null;
  imageProvided: boolean;
  orderId: string | null;
};

type ApiTurnLogEntry = {
  id: string;
  turn: number;
  promptTruncated: string;
  sentPageId: string;
  serverActiveNodeId: string | null;
  responseType: string | null;
  /** Kérésben küldött currentStepId (null = nem volt step a kérésben). */
  sentStepId: string | null;
  /** Válasz `currentStepId` (ha szerepelt a payloadban). */
  responseStepId: string | null;
  newlySatisfied: string[];
  status: string | null;
  latencyMs: number | null;
};

const PROMPT_TRUNCATE_LEN = 60;

function truncatePrompt(s: string, maxLen: number): string {
  const t = s.trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1)}…`;
}

/** API forduló napló: step megjelenítés — transition esetén step_1 → step_3a. */
function formatApiTurnStepLabel(sent: string | null, response: string | null): string {
  const s = sent ?? null;
  const r = response ?? null;
  if (s === null && r === null) return "—";
  if (s === null) return r as string;
  if (r === null) return s;
  if (s === r) return s;
  return `${s} → ${r}`;
}

/** API forduló napló / Node Info: ha fallback clarification, egyértelmű címke. */
function formatStatusForLog(
  status: string | null | undefined,
  responseType: string | null | undefined,
): string {
  if (responseType === "fallback" && status === "clarification") {
    return "fallback (clarification)";
  }
  return status ?? "—";
}

function assistantTextFromProcess(data: ProcessResponse): string {
  const end = data.endPageContent;
  const am = data.assistantMessage;
  const ack = typeof am === "string" ? am.trim() : "";
  const endText = typeof end === "string" ? end.trim() : "";
  if (ack && endText && ack !== endText) {
    return `${ack}\n\n${endText}`;
  }
  if (endText) return endText;
  if (ack) return ack;
  const cq = data.clarificationQuestion;
  if (typeof cq === "string" && cq.trim()) return cq.trim();
  return "Nincs assistantMessage a valaszban.";
}

/** API válasz → chat buborékok: \n\n+, majd egy \n (LLM gyakran nem tesz üres sort). */
function assistantBubblesFromProcess(data: ProcessResponse): string[] {
  const end = data.endPageContent;
  const am = data.assistantMessage;
  const ack = typeof am === "string" ? am.trim() : "";
  const endText = typeof end === "string" ? end.trim() : "";
  if (ack && endText && ack !== endText) {
    const ackOnly = ack.includes(endText) ? ack.replace(endText, "").trim() : ack;
    const lead = ackOnly.replace(/\n\n+$/, "").trim();
    if (lead) return [lead, endText];
    return [endText];
  }

  const full = assistantTextFromProcess(data);
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

async function consumeAiNodeSseStream(
  response: Response,
  handlers: {
    onMeta?: (data: ProcessResponse) => void;
    onDelta?: (text: string) => void;
    onDone: (data: ProcessResponse) => void;
  },
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Nincs valasztorzs az SSE olvasashoz.");
  const decoder = new TextDecoder();
  let buffer = "";

  const flushBlocks = () => {
    while (true) {
      const sep = buffer.indexOf("\n\n");
      if (sep < 0) break;
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      let eventName = "message";
      const dataLines: string[] = [];
      for (const rawLine of block.split("\n")) {
        const line = rawLine.replace(/\r$/, "");
        if (line.startsWith("event:")) eventName = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
      }
      const dataStr = dataLines.join("\n");
      if (!dataStr) continue;
      if (eventName === "delta") {
        try {
          const chunk = JSON.parse(dataStr) as { text?: string };
          if (typeof chunk.text === "string" && chunk.text.length > 0) {
            handlers.onDelta?.(chunk.text);
          }
        } catch {
          /* ignore malformed chunk */
        }
        continue;
      }
      let payload: ProcessResponse;
      try {
        payload = JSON.parse(dataStr) as ProcessResponse;
      } catch {
        continue;
      }
      if (eventName === "meta") handlers.onMeta?.(payload);
      else if (eventName === "done") handlers.onDone(payload);
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    if (done) {
      buffer += decoder.decode();
      flushBlocks();
      break;
    }
    flushBlocks();
  }
}

/** ai_complaint_story_v3.json meta.startPageId — első kérés pageId-je (üres satisfied mellett a matching dönt). */
const AI_COMPLAINT_STORY_START_PAGE_ID = "complaint-intake";

type TestTab = "test" | "log";

const INITIAL_DEBUG: DebugInfo = {
  activeNodeId: null,
  nextPageId: null,
  status: null,
  responseType: null,
  satisfiedConditions: [],
  newlySatisfied: [],
  missing: [],
  latencyMs: null,
  lastApiCurrentStepId: null,
  stepNextId: null,
};

export default function TestChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [satisfiedConditions, setSatisfiedConditions] = useState<string[]>([]);
  const [debugInfo, setDebugInfo] = useState<DebugInfo>(INITIAL_DEBUG);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isSavingLogs, setIsSavingLogs] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [inputValue, setInputValue] = useState("");
  /** Backend activeNodeId — mindig a szerver válasz alapján frissül; a következő kérés pageId-je. */
  const [currentPageId, setCurrentPageId] = useState<string>(AI_COMPLAINT_STORY_START_PAGE_ID);
  const currentPageIdRef = useRef<string>(AI_COMPLAINT_STORY_START_PAGE_ID);
  const [currentStepId, setCurrentStepId] = useState<string | null>(null);
  /** Kiszűrt rendelés-azonosító (ORD-[KAT]-[SZÁM]), ha a backend jelezte a has_order_id kondíciót. Lásd: questellOrderId.ts. */
  const [orderId, setOrderId] = useState<string | null>(null);
  const [apiTurnLog, setApiTurnLog] = useState<ApiTurnLogEntry[]>([]);
  const [activeTab, setActiveTab] = useState<TestTab>("test");
  const [savedRevision, setSavedRevision] = useState(0);
  /** Kiválasztott kép fájlneve — küldésig preview kártyán. */
  const [pendingAttachmentName, setPendingAttachmentName] = useState<string | null>(null);
  /** Teszt: következő üzenethez image_provided: true, küldés után auto off. */
  const [simulateImage, setSimulateImage] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const apiTurnLogEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const turnCounterRef = useRef(0);
  const sessionIdRef = useRef<string>(`testchat-${Date.now()}`);
  const runIdRef = useRef<string>(`run-${Date.now()}`);

  const syncPageIdFromServer = (activeNodeId: string | null | undefined) => {
    if (typeof activeNodeId === "string" && activeNodeId.trim()) {
      currentPageIdRef.current = activeNodeId;
      setCurrentPageId(activeNodeId);
    }
  };

  const applyNodeTransitionFromResponse = (data: ProcessResponse) => {
    if (data.status === "ok" && data.nextPageId?.trim()) {
      const next = data.nextPageId.trim();
      currentPageIdRef.current = next;
      setCurrentPageId(next);
      setCurrentStepId(null);
    } else {
      syncPageIdFromServer(data.activeNodeId);
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    apiTurnLogEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [apiTurnLog.length]);

  const submitMessage = async () => {
    const promptRaw = inputValue.trim();
    const imageThisTurn = simulateImage || pendingAttachmentName !== null;
    if ((!promptRaw && !imageThisTurn) || isLoading) return;

    const promptForApi = promptRaw || "(Kép csatolva.)";
    const displayText = promptRaw || "(Kép csatolva.)";

    const pageIdAtSend = currentPageIdRef.current;
    const stepIdAtSend = currentStepId;

    setMessages((prev) => [
      ...prev,
      { role: "user", text: displayText, hasImage: imageThisTurn },
      { role: "assistant", bubbles: [PENDING_ASSISTANT_TEXT], isLoading: true },
    ]);
    setInputValue("");
    setPendingAttachmentName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setSimulateImage(false);
    setIsLoading(true);
    const startedAt = performance.now();

    try {
      const response = await fetch("/api/ai-node/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          src: "ai_complaint_story_v3",
          pageId: currentPageIdRef.current,
          prompt: promptForApi,
          satisfiedConditions,
          currentStepId,
          order_id: orderId ?? null,
          image_provided: imageThisTurn ? true : undefined,
          sessionId: sessionIdRef.current,
          turnCount: turnCounterRef.current + 1,
          stream: true,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const latencyMsErr = Math.round(performance.now() - startedAt);
        turnCounterRef.current += 1;
        setApiTurnLog((prev) => [
          ...prev,
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            turn: turnCounterRef.current,
            promptTruncated: truncatePrompt(promptForApi, PROMPT_TRUNCATE_LEN),
            sentPageId: pageIdAtSend,
            serverActiveNodeId: null,
            responseType: null,
            sentStepId: stepIdAtSend,
            responseStepId: null,
            newlySatisfied: [],
            status: `http_${response.status}`,
            latencyMs: latencyMsErr,
          },
        ]);
        setMessages((prev) => [
          ...stripLoadingAssistantMessages(prev),
          {
            role: "assistant",
            bubbles: [`Hiba (${response.status}): ${errorText || "ismeretlen hiba"}`],
            sentAt: Date.now(),
          },
        ]);
        setDebugInfo((prev) => ({ ...prev, latencyMs: latencyMsErr }));
        return;
      }

      const contentType = response.headers.get("content-type") ?? "";
      const isSse = contentType.includes("text/event-stream");

      let data: ProcessResponse;
      if (isSse) {
        let doneData: ProcessResponse | null = null;
        await consumeAiNodeSseStream(response, {
          onMeta: (p) => {
            const nextSatisfied = Array.isArray(p.satisfiedConditions) ? p.satisfiedConditions : [];
            const nextNewly = Array.isArray(p.newlySatisfied) ? p.newlySatisfied : [];
            const nextMissing = Array.isArray(p.missing) ? p.missing : [];
            setSatisfiedConditions(nextSatisfied);
            if (nextSatisfied.includes("has_order_id")) {
              const extracted = extractQuestellOrderId(promptForApi);
              if (extracted) setOrderId(extracted);
            }
            syncPageIdFromServer(p.activeNodeId);
            setCurrentStepId((prevStep) => {
              if (!(p.status === "step_start" || "nextStepId" in p || "currentStepId" in p)) {
                return prevStep;
              }
              if (p.nextStepId) return p.nextStepId;
              if (p.currentStepId) return p.currentStepId;
              return null;
            });
            setDebugInfo((prev) => ({
              activeNodeId: p.activeNodeId ?? prev.activeNodeId,
              nextPageId: p.nextPageId ?? prev.nextPageId,
              status: p.status ?? prev.status,
              responseType: p.responseType ?? prev.responseType,
              satisfiedConditions: nextSatisfied,
              newlySatisfied: nextNewly,
              missing: nextMissing,
              latencyMs: prev.latencyMs,
              lastApiCurrentStepId:
                "currentStepId" in p ? (p.currentStepId ?? null) : prev.lastApiCurrentStepId,
              stepNextId: "nextStepId" in p ? (p.nextStepId ?? null) : null,
            }));
            setMessages((prev) => {
              const copy = [...prev];
              for (let i = copy.length - 1; i >= 0; i--) {
                const m = copy[i];
                if (m.role === "assistant" && m.isLoading) {
                  copy[i] = { ...m, bubbles: [""] };
                  break;
                }
              }
              return copy;
            });
          },
          onDelta: (text) => {
            setMessages((prev) => {
              const copy = [...prev];
              for (let i = copy.length - 1; i >= 0; i--) {
                const m = copy[i];
                if (m.role === "assistant" && m.isLoading) {
                  const cur0 = m.bubbles[0] ?? "";
                  const base = cur0 === PENDING_ASSISTANT_TEXT ? "" : cur0;
                  copy[i] = { ...m, bubbles: [base + text], isLoading: true };
                  break;
                }
              }
              return copy;
            });
          },
          onDone: (p) => {
            doneData = p;
          },
        });
        if (!doneData) throw new Error("SSE: hianyzo done esemeny.");
        data = doneData;
      } else {
        data = (await response.json()) as ProcessResponse;
      }

      const latencyMs = Math.round(performance.now() - startedAt);

      const nextSatisfied = Array.isArray(data.satisfiedConditions)
        ? data.satisfiedConditions
        : [];
      const nextNewly = Array.isArray(data.newlySatisfied)
        ? data.newlySatisfied
        : [];
      const nextMissing = Array.isArray(data.missing) ? data.missing : [];

      setSatisfiedConditions(nextSatisfied);
      if (nextSatisfied.includes("has_order_id")) {
        const extracted = extractQuestellOrderId(promptForApi);
        if (extracted) setOrderId(extracted);
      }
      applyNodeTransitionFromResponse(data);

      const hasStepPayload =
        data.status === "step_start" ||
        "nextStepId" in data ||
        "currentStepId" in data;
      let nextSessionStepId = currentStepId;
      if (hasStepPayload) {
        if (data.nextStepId) {
          nextSessionStepId = data.nextStepId;
        } else if (data.currentStepId) {
          nextSessionStepId = data.currentStepId;
        } else {
          nextSessionStepId = null;
        }
        setCurrentStepId(nextSessionStepId);
      }

      setDebugInfo((prev) => ({
        activeNodeId: data.activeNodeId ?? null,
        nextPageId: data.nextPageId ?? null,
        status: data.status ?? null,
        responseType: data.responseType ?? null,
        satisfiedConditions: nextSatisfied,
        newlySatisfied: nextNewly,
        missing: nextMissing,
        latencyMs,
        lastApiCurrentStepId:
          "currentStepId" in data ? (data.currentStepId ?? null) : prev.lastApiCurrentStepId,
        stepNextId: "nextStepId" in data ? (data.nextStepId ?? null) : null,
      }));

      turnCounterRef.current += 1;
      setApiTurnLog((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          turn: turnCounterRef.current,
          promptTruncated: truncatePrompt(promptForApi, PROMPT_TRUNCATE_LEN),
          sentPageId: pageIdAtSend,
          serverActiveNodeId: data.activeNodeId ?? null,
          responseType: data.responseType ?? null,
          sentStepId: stepIdAtSend,
          responseStepId: "currentStepId" in data ? (data.currentStepId ?? null) : null,
          newlySatisfied: nextNewly,
          status: data.status ?? null,
          latencyMs,
        },
      ]);
      const assistantText = assistantTextFromProcess(data);
      const cq = data.clarificationQuestion;
      const clarificationStored =
        typeof cq === "string" && cq.trim() ? cq.trim() : null;
      setLogs((prev) => [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          ts: Date.now(),
          prompt: promptForApi,
          assistantMessage: assistantText,
          sentPageId: pageIdAtSend,
          serverActiveNodeId: data.activeNodeId ?? null,
          responseType: data.responseType ?? null,
          activeNodeId: data.activeNodeId ?? null,
          nextPageId: data.nextPageId ?? null,
          status: data.status ?? null,
          latencyMs,
          satisfiedConditions: nextSatisfied,
          newlySatisfied: nextNewly,
          missing: nextMissing,
          clarificationQuestion: clarificationStored,
          sentStepId: stepIdAtSend,
          responseStepId: "currentStepId" in data ? (data.currentStepId ?? null) : null,
          responseNextStepId: "nextStepId" in data ? (data.nextStepId ?? null) : null,
          imageProvided: imageThisTurn,
          orderId: orderId,
        },
        ...prev,
      ]);
      setMessages((prev) => [
        ...stripLoadingAssistantMessages(prev),
        {
          role: "assistant",
          bubbles: assistantBubblesFromProcess(data),
          sentAt: Date.now(),
        },
      ]);
    } catch (err) {
      const latencyMs = Math.round(performance.now() - startedAt);
      const msg = err instanceof Error ? err.message : "ismeretlen hiba";
      turnCounterRef.current += 1;
      setApiTurnLog((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          turn: turnCounterRef.current,
          promptTruncated: truncatePrompt(promptForApi, PROMPT_TRUNCATE_LEN),
          sentPageId: pageIdAtSend,
          serverActiveNodeId: null,
          responseType: null,
          sentStepId: stepIdAtSend,
          responseStepId: null,
          newlySatisfied: [],
          status: "network_error",
          latencyMs,
        },
      ]);
      setMessages((prev) => [
        ...stripLoadingAssistantMessages(prev),
        {
          role: "assistant",
          bubbles: [`Halozati hiba: ${msg}`],
          sentAt: Date.now(),
        },
      ]);
      setDebugInfo((prev) => ({ ...prev, latencyMs }));
    } finally {
      setIsLoading(false);
    }
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await submitMessage();
  };

  const onInputKeyDown = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      await submitMessage();
    }
  };

  const saveLogsToBackend = async () => {
    if (!logs.length || isSavingLogs) return;
    setIsSavingLogs(true);
    try {
      const events = logs.map((log) => ({
        id: log.id,
        t: "ai_test_chat_log",
        ts: log.ts,
        storyId: "ai_complaint_story_v3",
        sessionId: sessionIdRef.current,
        runId: runIdRef.current,
        pageId: log.activeNodeId ?? AI_COMPLAINT_STORY_START_PAGE_ID,
        props: {
          prompt: log.prompt,
          assistantMessage: log.assistantMessage,
          activeNodeId: log.activeNodeId,
          sentPageId: log.sentPageId,
          serverActiveNodeId: log.serverActiveNodeId,
          responseType: log.responseType,
          nextPageId: log.nextPageId,
          status: log.status,
          latencyMs: log.latencyMs,
          satisfiedConditions: log.satisfiedConditions,
          newlySatisfied: log.newlySatisfied,
          missing: log.missing,
          clarificationQuestion: log.clarificationQuestion,
          sentStepId: log.sentStepId,
          responseStepId: log.responseStepId,
          responseNextStepId: log.responseNextStepId,
          imageProvided: log.imageProvided,
          orderId: log.orderId,
        },
      }));

      const res = await fetch("/api/analytics/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storyId: "ai_complaint_story_v3",
          events,
        }),
      });

      if (!res.ok) {
        const txt = await res.text();
        console.error("Log save failed", res.status, txt);
        return;
      }

      appendSavedRun({
        runId: runIdRef.current,
        sessionId: sessionIdRef.current,
        storyId: "ai_complaint_story_v3",
        entries: logs.map((log) => ({
          id: log.id,
          ts: log.ts,
          prompt: log.prompt,
          assistantMessage: log.assistantMessage,
          sentPageId: log.sentPageId,
          serverActiveNodeId: log.serverActiveNodeId,
          responseType: log.responseType,
          activeNodeId: log.activeNodeId,
          nextPageId: log.nextPageId,
          status: log.status,
          latencyMs: log.latencyMs,
          satisfiedConditions: [...log.satisfiedConditions],
          newlySatisfied: [...log.newlySatisfied],
          missing: [...log.missing],
          clarificationQuestion: log.clarificationQuestion,
          sentStepId: log.sentStepId,
          responseStepId: log.responseStepId,
          responseNextStepId: log.responseNextStepId,
          imageProvided: log.imageProvided,
          orderId: log.orderId,
        })),
      });
      setSavedRevision((r) => r + 1);

      console.info(`Logs saved: ${logs.length}`);
    } catch (err) {
      console.error("Log save error", err);
    } finally {
      setIsSavingLogs(false);
    }
  };

  const isClarification = debugInfo.status === "clarification";

  return (
    <main className={s.shell}>
      <header className={s.stickyNav}>
        <div>
          <h1 className={s.navTitle}>Questell AI Teszt</h1>
          {activeTab === "test" ? (
            <p className={s.navMeta}>
              Aktív node (automatikus): <code>{currentPageId}</code>
            </p>
          ) : (
            <p className={s.navMeta}>Mentett tesztek megtekintése</p>
          )}
        </div>
        <div className={s.tabGroup} role="tablist" aria-label="Teszt nézet">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "test"}
            className={`${s.tab} ${activeTab === "test" ? s.tabActive : ""}`}
            onClick={() => setActiveTab("test")}
          >
            Teszt
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "log"}
            className={`${s.tab} ${activeTab === "log" ? s.tabActive : ""}`}
            onClick={() => setActiveTab("log")}
          >
            Log
          </button>
        </div>
      </header>

      {activeTab === "log" ? (
        <TestLogPanel savedRevision={savedRevision} />
      ) : (
        <div className={s.testBody}>
      <section className={s.chatSection}>
        <div className={s.chatInner}>
          {messages.length === 0 ? (
            <p className={s.emptyHint}>
              Kuldj egy uzenetet a teszthez. A valaszok itt jelennek meg.
            </p>
          ) : null}
          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={`${m.role}-${i}`} className={s.bubbleUser}>
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
              <div key={`${m.role}-${i}`} className={s.assistantTurn}>
                {m.bubbles.map((para, pi) => (
                  <div
                    key={pi}
                    className={m.isLoading ? s.bubbleAssistantPending : s.bubbleAssistant}
                  >
                    {para}
                  </div>
                ))}
                {!m.isLoading && m.sentAt != null ? (
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
          <div ref={messagesEndRef} />
        </div>
      </section>

      <form onSubmit={onSubmit} className={s.inputBar}>
        <div className={s.inputBarInner}>
          <label className={`${s.simulateToggle} ${simulateImage ? s.simulateToggleOn : ""}`}>
            <input
              type="checkbox"
              checked={simulateImage}
              onChange={(e) => setSimulateImage(e.target.checked)}
              disabled={isLoading}
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
          <div className={s.inputRow}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className={s.fileInputHidden}
              onChange={(e) => {
                const f = e.target.files?.[0];
                setPendingAttachmentName(f ? f.name : null);
              }}
              aria-hidden
              tabIndex={-1}
            />
            <button
              type="button"
              className={s.btnClip}
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              aria-label="Kép csatolása"
            >
              <Paperclip size={20} strokeWidth={2} />
            </button>
            <input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder="Ird be az uzeneted..."
              className={s.input}
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={
                isLoading ||
                (!inputValue.trim() && !simulateImage && !pendingAttachmentName)
              }
              className={s.btnSend}
            >
              {isLoading ? "Kuldes..." : "Kuldes"}
            </button>
          </div>
        </div>
      </form>

      <aside className={s.debugAside}>
        <div className="mx-auto max-w-4xl" style={{ maxWidth: 960, margin: "0 auto" }}>
          <div
            className="grid grid-cols-1 gap-4 md:grid-cols-2"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: 16,
            }}
          >
          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-gray-500" style={{ color: "#6b7280", margin: "0 0 12px 0", fontSize: 12 }}>
              Node Info
            </p>
            <div className="space-y-1 text-sm font-mono" style={{ fontFamily: "monospace", fontSize: 14, color: "#4ade80" }}>
              <p>
                <span className="mr-2 text-gray-500" style={{ color: "#6b7280", marginRight: 8 }}>Aktiv:</span>
                <span className="font-medium text-green-400" style={{ color: "#4ade80", fontWeight: 500 }}>{debugInfo.activeNodeId || "-"}</span>
              </p>
              <p>
                <span className="mr-2 text-gray-500" style={{ color: "#6b7280", marginRight: 8 }}>Aktív step:</span>
                <span className="font-medium text-green-400" style={{ color: "#4ade80", fontWeight: 500 }}>
                  {debugInfo.lastApiCurrentStepId ?? "—"}
                </span>
              </p>
              <p>
                <span className="mr-2 text-gray-500" style={{ color: "#6b7280", marginRight: 8 }}>Kovetkezo step:</span>
                <span className="font-medium text-green-400" style={{ color: "#4ade80", fontWeight: 500 }}>{debugInfo.stepNextId || "-"}</span>
              </p>
              <p>
                <span className="mr-2 text-gray-500" style={{ color: "#6b7280", marginRight: 8 }}>Új kondíciók:</span>
                <span className="font-medium text-yellow-400" style={{ color: "#facc15", fontWeight: 500 }}>
                  {debugInfo.newlySatisfied.length ? debugInfo.newlySatisfied.join(", ") : "—"}
                </span>
              </p>
              <p>
                <span className="mr-2 text-gray-500" style={{ color: "#6b7280", marginRight: 8 }}>Statusz:</span>
                <span
                  className={
                    debugInfo.status === "clarification"
                      ? "font-medium text-yellow-400"
                      : "font-medium text-green-400"
                  }
                  style={{ color: isClarification ? "#facc15" : "#4ade80", fontWeight: 500 }}
                >
                  {formatStatusForLog(debugInfo.status, debugInfo.responseType)}
                </span>
              </p>
              <p>
                <span className="mr-2 text-gray-500" style={{ color: "#6b7280", marginRight: 8 }}>Kovetkezo:</span>
                <span className="font-medium text-green-400" style={{ color: "#4ade80", fontWeight: 500 }}>{debugInfo.nextPageId || "-"}</span>
              </p>
              <p>
                <span className="mr-2 text-gray-500" style={{ color: "#6b7280", marginRight: 8 }}>Latencia:</span>
                <span className="font-medium text-blue-400" style={{ color: "#60a5fa", fontWeight: 500 }}>{debugInfo.latencyMs ?? "-"}ms</span>
              </p>
            </div>
          </div>

          <div className="border-gray-800 md:border-l md:pl-4" style={{ borderLeft: "1px solid #1f2937", paddingLeft: 16 }}>
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-gray-500" style={{ color: "#6b7280", margin: "0 0 12px 0", fontSize: 12 }}>
              Kondiciok
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="mb-2 text-xs text-gray-500" style={{ color: "#6b7280", fontSize: 12 }}>Teljesult</p>
                {debugInfo.satisfiedConditions.length ? (
                  <ul className="space-y-1">
                    {debugInfo.satisfiedConditions.map((c) => (
                      <li
                        key={`sat-${c}`}
                        className="flex items-center gap-1 font-mono text-xs text-green-400"
                        style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: "monospace", fontSize: 12, color: "#4ade80" }}
                      >
                        <span>✓</span>
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-gray-600" style={{ color: "#4b5563", fontSize: 12 }}>—</p>
                )}
              </div>
              <div className="border-l border-gray-800 pl-3" style={{ borderLeft: "1px solid #1f2937", paddingLeft: 12 }}>
                <p className="mb-2 text-xs text-gray-500" style={{ color: "#6b7280", fontSize: 12 }}>Uj</p>
                {debugInfo.newlySatisfied.length ? (
                  <ul className="space-y-1">
                    {debugInfo.newlySatisfied.map((c) => (
                      <li
                        key={`new-${c}`}
                        className="flex items-center gap-1 font-mono text-xs text-yellow-400"
                        style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: "monospace", fontSize: 12, color: "#facc15" }}
                      >
                        <span>+</span>
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-gray-600" style={{ color: "#4b5563", fontSize: 12 }}>—</p>
                )}
              </div>
              <div className="border-l border-gray-800 pl-3" style={{ borderLeft: "1px solid #1f2937", paddingLeft: 12 }}>
                <p className="mb-2 text-xs text-gray-500" style={{ color: "#6b7280", fontSize: 12 }}>Hianyzo</p>
                {debugInfo.missing.length ? (
                  <ul className="space-y-1">
                    {debugInfo.missing.map((c) => (
                      <li
                        key={`miss-${c}`}
                        className="flex items-center gap-1 font-mono text-xs text-red-400"
                        style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: "monospace", fontSize: 12, color: "#f87171" }}
                      >
                        <span>✗</span>
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-gray-600" style={{ color: "#4b5563", fontSize: 12 }}>—</p>
                )}
              </div>
            </div>
          </div>
        </div>

          <p
            className="mb-2 mt-6 text-xs font-medium uppercase tracking-widest text-gray-500"
            style={{ color: "#6b7280", margin: "24px 0 8px 0", fontSize: 12 }}
          >
            API forduló napló
          </p>
          <div
            className="rounded-lg border border-gray-800 bg-black/30"
            style={{
              maxHeight: 300,
              overflowY: "auto",
              padding: 10,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              fontSize: 12,
            }}
          >
            {apiTurnLog.length === 0 ? (
              <p style={{ color: "#6b7280", margin: 0 }}>Még nincs API válasz naplózva.</p>
            ) : (
              <div>
                {apiTurnLog.map((entry, idx) => (
                  <div
                    key={entry.id}
                    style={{
                      paddingBottom: 10,
                      marginBottom: 10,
                      borderBottom: idx < apiTurnLog.length - 1 ? "1px solid #1f2937" : "none",
                      color: "#d1d5db",
                    }}
                  >
                    <p style={{ margin: "0 0 4px 0", color: "#9ca3af" }}>
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
                    <p style={{ margin: "0 0 4px 0", color: "#93c5fd" }}>Prompt: {entry.promptTruncated}</p>
                    <p style={{ margin: "0 0 2px 0", color: "#86efac" }}>
                      Küldött node: <code>{entry.sentPageId}</code>
                    </p>
                    <p style={{ margin: "0 0 4px 0", color: "#86efac" }}>
                      Szerver node:{" "}
                      {entry.serverActiveNodeId ? (
                        <code>{entry.serverActiveNodeId}</code>
                      ) : entry.status === "clarification" ? (
                        <span>— (clarification)</span>
                      ) : (
                        <span>—</span>
                      )}{" "}
                      · Step: {formatApiTurnStepLabel(entry.sentStepId, entry.responseStepId)}
                    </p>
                    <p style={{ margin: 0, color: "#fde047" }}>
                      Új kondíciók: {entry.newlySatisfied.length ? entry.newlySatisfied.join(", ") : "—"}
                    </p>
                  </div>
                ))}
                <div ref={apiTurnLogEndRef} style={{ height: 1 }} />
              </div>
            )}
          </div>
        </div>
      </aside>

      <section className={s.promptLogSection}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <div className={s.promptLogHeader}>
            <p className={s.promptLogTitle}>Prompt Log</p>
            <button
              type="button"
              onClick={saveLogsToBackend}
              disabled={isSavingLogs || logs.length === 0}
              className={s.btnSave}
            >
              {isSavingLogs ? "Mentés..." : "Mentés"}
            </button>
          </div>

          <div
            className="rounded-lg border border-gray-800 bg-black/20"
            style={{ maxHeight: 170, overflowY: "auto", padding: 12 }}
          >
            {logs.length === 0 ? (
              <p className="text-xs text-gray-600">Még nincs log bejegyzés.</p>
            ) : (
              <div className="space-y-2">
                {logs.map((log) => (
                  <div key={log.id} className="rounded-md border border-gray-800 bg-gray-900/40 p-2 text-xs font-mono">
                    <p className="mb-1 text-gray-400">
                      {new Date(log.ts).toLocaleTimeString()} | {log.status || "-"} | {log.latencyMs ?? "-"}ms
                    </p>
                    <p className="text-blue-300">Prompt: {log.prompt}</p>
                    <p className="text-green-300">
                      Küldött: {log.sentPageId ?? "—"} · Szerver:{" "}
                      {log.serverActiveNodeId ??
                        (log.status === "clarification" ? "— (clarification)" : "—")}{" "}
                      → {log.nextPageId || "-"}
                      {log.responseType ? ` · ${log.responseType}` : ""}
                    </p>
                    <p className="text-amber-200/90 text-[0.7rem] font-semibold uppercase tracking-wide">
                      AI válasz
                    </p>
                    <p className="text-gray-300">{log.assistantMessage}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
        </div>
      )}
    </main>
  );
}
