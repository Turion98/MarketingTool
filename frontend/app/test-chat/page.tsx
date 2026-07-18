"use client";

import {
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { FileImage, Paperclip, X } from "lucide-react";

// Kanonikus order ID regex: /\bORD-[A-Z]{2,6}-[0-9]{2,6}\b/i — questellOrderId.ts
import { extractQuestellOrderId } from "../lib/questellOrderId";
import { ChatTicketCard } from "./ChatTicketCard";
import { DocsSection, DOCS_SECTION_ID } from "./DocsSection";
import { LeftGuidePanel } from "./LeftGuidePanel";
import {
  RightProcessPanel,
  type PhaseTurn,
  type ProcessPhaseId,
} from "./RightProcessPanel";
import { SessionLogPanel } from "./SessionLogPanel";
import { TestLogPanel } from "./TestLogPanel";
import { appendSavedRun } from "./savedRunsStorage";
import type {
  ApiTurnLogEntry,
  DebugInfo,
  LogEntry,
  ProcessResponse,
  Ticket,
} from "./testChatTypes";
import {
  formatApiTurnStepLabel,
  formatStatusForLog,
} from "./testChatTypes";

import s from "./TestChatShell.module.scss";

type ChatMessage =
  | { role: "user"; text: string; hasImage?: boolean }
  | {
      role: "assistant";
      bubbles: string[];
      sentAt?: number;
      isLoading?: boolean;
      /** A buborékhoz tartozó RightProcessPanel turn-id (data-turn-id alapján
       *  a "Háttérben" chip ide scrollol és highlight pulse-t indít). */
      turnId?: string;
    };

const PENDING_ASSISTANT_TEXT = "Feldolgozom a kérésedet…";

function stripLoadingAssistantMessages(msgs: ChatMessage[]): ChatMessage[] {
  return msgs.filter((m) => !(m.role === "assistant" && m.isLoading));
}

const PROMPT_TRUNCATE_LEN = 60;

function truncatePrompt(s: string, maxLen: number): string {
  const t = s.trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1)}…`;
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

/** Új phase + intermediates rögzítése egy turn-ön. */
function markPhase(
  t: PhaseTurn,
  phase: ProcessPhaseId,
  intermediates: ProcessPhaseId[] = [],
): PhaseTurn {
  const next = [...t.phases, ...intermediates, phase];
  const seen = new Set<ProcessPhaseId>();
  const dedup: ProcessPhaseId[] = [];
  for (const p of next) {
    if (!seen.has(p)) {
      seen.add(p);
      dedup.push(p);
    }
  }
  return { ...t, activePhase: phase, phases: dedup };
}

/**
 * Minimum dwell time két egymást követő fázisváltás között.
 * Gyors backend válasznál is láthatóvá teszi minden fázist a process panelen.
 */
const PHASE_MIN_DWELL_MS = 320;
/** A "done" állapot rövid reveal-je a collapsed nézet előtt. */
const PHASE_DONE_REVEAL_MS = 600;

export default function TestChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [satisfiedConditions, setSatisfiedConditions] = useState<string[]>([]);
  const [debugInfo, setDebugInfo] = useState<DebugInfo>(INITIAL_DEBUG);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isSavingLogs, setIsSavingLogs] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [inputValue, setInputValue] = useState("");
  /** Backend activeNodeId — mindig a szerver válasz alapján frissül; a következő kérés pageId-je. */
  const [currentPageId, setCurrentPageId] = useState<string>(
    AI_COMPLAINT_STORY_START_PAGE_ID,
  );
  const currentPageIdRef = useRef<string>(AI_COMPLAINT_STORY_START_PAGE_ID);
  const [currentStepId, setCurrentStepId] = useState<string | null>(null);
  /** Kiszűrt rendelés-azonosító (ORD-[KAT]-[SZÁM]), ha a backend jelezte a has_order_id kondíciót. */
  const [orderId, setOrderId] = useState<string | null>(null);
  const [apiTurnLog, setApiTurnLog] = useState<ApiTurnLogEntry[]>([]);
  const [activeTab, setActiveTab] = useState<TestTab>("test");
  const [savedRevision, setSavedRevision] = useState(0);
  /** Kiválasztott kép fájlneve — küldésig preview kártyán. */
  const [pendingAttachmentName, setPendingAttachmentName] = useState<string | null>(null);
  /** Object URL a kiválasztott képhez (preview thumbnail). */
  const [pendingAttachmentPreviewUrl, setPendingAttachmentPreviewUrl] = useState<
    string | null
  >(null);
  /** Teszt: következő üzenethez image_provided: true, küldés után auto off. */
  const [simulateImage, setSimulateImage] = useState(false);
  /** RightProcessPanel feed-je. */
  const [processTurns, setProcessTurns] = useState<PhaseTurn[]>([]);
  /** Input composer fókusz ring. */
  const [composerFocused, setComposerFocused] = useState(false);
  /**
   * Legutóbb generált ticket — end node lezáráskor frissül az API válasz
   * `ticket` mezőjéből. `null`: nincs ticket (még pre-end-page, vagy az end
   * node-on nem volt `ticket` blokk). A `TicketPanel` ekkor nem renderel semmit.
   */
  const [lastTicket, setLastTicket] = useState<Ticket | null>(null);

  /** A chat görgő-konténer ref-je — instant `scrollTop = scrollHeight`-tel
   *  görgetjük, hogy a globális `.shell` scrollja NE mozduljon. */
  const chatScrollRef = useRef<HTMLElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const turnCounterRef = useRef(0);
  const processTurnIdRef = useRef(0);
  const sessionIdRef = useRef<string>(`testchat-${Date.now()}`);
  const runIdRef = useRef<string>(`run-${Date.now()}`);

  /**
   * `?dev=1` URL paraméter — bekapcsolja a fejlesztői zónákat:
   *  - Teszt/Log tab navigáció a stickyNav-on
   *  - Aktív node code-chip a header alcímében
   *  - SessionLogPanel a chat alatt (debugInfo + apiTurnLog + logs)
   *  - "Mentett tesztek" funkció (TestLogPanel)
   * Default `false` — a látogatói (demo) nézet ezekből egyetlen elemet sem lát.
   */
  const [isDev, setIsDev] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setIsDev(params.get("dev") === "1");
  }, []);

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

  /**
   * Chat auto-scroll: CSAK a `.chatSection` belső görgőjét mozgatjuk.
   * A `scrollIntoView` az ős-láncot is mozgatná, ami a `.shell`-t lefelé tolná
   * (és a 2. sor logokra ugrana a viewport) — ezért közvetlen scrollTop-ot
   * használunk a chat container-en.
   */
  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  /** Textarea auto-resize (1–5 sor). */
  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const lineHeight = 24;
    const maxHeight = lineHeight * 5;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, []);

  /** Az inputValue reset utáni "vissza-zsugorítás" (submit után). */
  useEffect(() => {
    if (inputValue === "") resizeTextarea();
  }, [inputValue, resizeTextarea]);

  /** Object URL cleanup unmount-kor. */
  useEffect(() => {
    return () => {
      if (pendingAttachmentPreviewUrl) {
        URL.revokeObjectURL(pendingAttachmentPreviewUrl);
      }
    };
  }, [pendingAttachmentPreviewUrl]);

  /**
   * Új beszélgetés indítása — minden chat state-et nulláz, friss sessionId-t
   * generál. A `?dev=1` nézet log-listáját és a saved-runs localStorage-t
   * NEM törli (a fejlesztő nem akar elveszteni rögzített futásokat).
   */
  const handleRestart = useCallback(() => {
    setMessages([]);
    setSatisfiedConditions([]);
    setDebugInfo(INITIAL_DEBUG);
    setLogs([]);
    setApiTurnLog([]);
    setProcessTurns([]);
    setCurrentPageId(AI_COMPLAINT_STORY_START_PAGE_ID);
    currentPageIdRef.current = AI_COMPLAINT_STORY_START_PAGE_ID;
    setCurrentStepId(null);
    setOrderId(null);
    setLastTicket(null);
    setInputValue("");
    setPendingAttachmentName(null);
    setPendingAttachmentPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setSimulateImage(false);
    sessionIdRef.current = `testchat-${Date.now()}`;
    runIdRef.current = `run-${Date.now()}`;
    turnCounterRef.current = 0;
    processTurnIdRef.current = 0;
  }, []);

  /**
   * Az asszisztens-buborék "Háttérben" chipjének kattintása: a jobb oldali
   * Döntési folyamat panelen a megfelelő turn-kártyához scrollol és egy rövid
   * accent pulse-t indít a vizuális visszacsatoláshoz. A turn-kártyák a
   * `data-turn-id` attribútumon keresztül azonosíthatók (RightProcessPanel).
   */
  const handleBehindReplyClick = useCallback((turnId: string) => {
    if (typeof window === "undefined") return;
    const el = document.querySelector(`[data-turn-id="${CSS.escape(turnId)}"]`);
    if (!el) return;
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    el.classList.add("rpp-turn-highlight");
    window.setTimeout(() => {
      el.classList.remove("rpp-turn-highlight");
    }, 700);
  }, []);

  const submitMessage = async () => {
    const promptRaw = inputValue.trim();
    const imageThisTurn = simulateImage || pendingAttachmentName !== null;
    if ((!promptRaw && !imageThisTurn) || isLoading) return;

    const promptForApi = promptRaw || "(Kép csatolva.)";
    const displayText = promptRaw || "(Kép csatolva.)";

    const pageIdAtSend = currentPageIdRef.current;
    const stepIdAtSend = currentStepId;

    // A turn-id-t a setMessages ELŐTT generáljuk, hogy a loading
    // assistant-üzenet már a buborék létrejöttekor tudjon hivatkozni
    // a hozzá tartozó Process panel kártyára (data-turn-id-n keresztül).
    processTurnIdRef.current += 1;
    const newTurnNum = processTurnIdRef.current;
    const newTurnId = `pturn-${Date.now()}-${newTurnNum}`;

    setMessages((prev) => [
      ...prev,
      { role: "user", text: displayText, hasImage: imageThisTurn },
      {
        role: "assistant",
        bubbles: [PENDING_ASSISTANT_TEXT],
        isLoading: true,
        turnId: newTurnId,
      },
    ]);
    setInputValue("");
    setPendingAttachmentName(null);
    setPendingAttachmentPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
    setSimulateImage(false);
    setIsLoading(true);
    const startedAt = performance.now();

    // RightProcessPanel: új turn waiting fázissal.
    setProcessTurns((prev) => [
      ...prev.map((t) => ({ ...t, activePhase: null })),
      {
        id: newTurnId,
        turnNum: newTurnNum,
        activePhase: "waiting" as ProcessPhaseId,
        phases: ["waiting" as ProcessPhaseId],
        details: {},
        finalTransition: null,
      },
    ]);

    /**
     * Per-turn animation queue.
     * A backend gyorsabban is válaszolhat, mint amit a szem érzékelni tud:
     * a phaseChain láncolja a fázisváltásokat, és minimum PHASE_MIN_DWELL_MS-ig
     * tartja az előzőt, mielőtt a következőt alkalmazza.
     * lastPhaseAt = utolsó alkalmazott fázisváltás időbélyege.
     */
    let lastPhaseAt = performance.now();
    let phaseChain: Promise<void> = Promise.resolve();

    const enqueuePhaseUpdate = (fn: () => void) => {
      phaseChain = phaseChain
        .catch(() => undefined)
        .then(async () => {
          const elapsed = performance.now() - lastPhaseAt;
          const wait = PHASE_MIN_DWELL_MS - elapsed;
          if (wait > 0) {
            await new Promise<void>((resolve) => {
              window.setTimeout(resolve, wait);
            });
          }
          fn();
          lastPhaseAt = performance.now();
        });
    };

    const updateProcessTurn = (updater: (t: PhaseTurn) => PhaseTurn) => {
      enqueuePhaseUpdate(() => {
        setProcessTurns((prev) =>
          prev.map((t) => (t.id === newTurnId ? updater(t) : t)),
        );
      });
    };

    let routingStarted = false;

    try {
      const fetchPromise = fetch("/api/ai-node/process", {
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

      // Fetch elindult → "sent" fázis. A "parsing" intermediate marker:
      // ezt később a meta belép, vagy a done-only ágon a final cleanup.
      updateProcessTurn((t) => markPhase(t, "sent"));

      const response = await fetchPromise;

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
            turnId: newTurnId,
          },
        ]);
        setDebugInfo((prev) => ({ ...prev, latencyMs: latencyMsErr }));
        updateProcessTurn((t) => ({
          ...markPhase(t, "done"),
          details: {
            ...t.details,
            done: { transition: "error", latency: latencyMsErr },
          },
          finalTransition: "error",
        }));
        return;
      }

      const contentType = response.headers.get("content-type") ?? "";
      const isSse = contentType.includes("text/event-stream");

      let data: ProcessResponse;
      if (isSse) {
        let doneData: ProcessResponse | null = null;
        await consumeAiNodeSseStream(response, {
          onMeta: (p) => {
            const nextSatisfied = Array.isArray(p.satisfiedConditions)
              ? p.satisfiedConditions
              : [];
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
            updateProcessTurn((t) => ({
              ...markPhase(t, "meta", ["parsing"]),
              details: {
                ...t.details,
                meta: {
                  badges: nextNewly.length ? nextNewly : undefined,
                },
              },
            }));
          },
          onDelta: (text) => {
            if (!routingStarted) {
              routingStarted = true;
              updateProcessTurn((t) => markPhase(t, "routing"));
            }
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
          turnId: newTurnId,
        },
      ]);
      // End-page lezáráskor a backend `ticket` mezőt küld; egyébként null.
      // A TicketPanel null-on nem renderel — placeholder helyett semmi sem látszik.
      setLastTicket(data.ticket ?? null);

      // RightProcessPanel: done fázis + transition + latency.
      const transition = data.activeNodeId
        ? `${pageIdAtSend} → ${data.activeNodeId}`
        : undefined;
      updateProcessTurn((t) => ({
        ...markPhase(t, "done"),
        details: {
          ...t.details,
          done: { transition, latency: latencyMs },
        },
        finalTransition: transition ?? null,
      }));
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
          turnId: newTurnId,
        },
      ]);
      setDebugInfo((prev) => ({ ...prev, latencyMs }));
      updateProcessTurn((t) => ({
        ...markPhase(t, "done"),
        details: {
          ...t.details,
          done: { transition: "error", latency: latencyMs },
        },
        finalTransition: "error",
      }));
    } finally {
      setIsLoading(false);
      /**
       * Forduló lezárása:
       *  1. megvárjuk, amíg a phaseChain teljes hosszában lecsorog
       *     (azaz a "done" frame is alkalmazva van a UI-on)
       *  2. PHASE_DONE_REVEAL_MS-ig hagyjuk látható a done állapotot
       *  3. átkapcsolunk collapsed nézetre.
       */
      void (async () => {
        try {
          await phaseChain;
        } catch {
          /* a chain a fázisok közben lehet elbukik; a collapse-t mégis lefuttatjuk */
        }
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, PHASE_DONE_REVEAL_MS);
        });
        setProcessTurns((prev) =>
          prev.map((t) => (t.id === newTurnId ? { ...t, activePhase: null } : t)),
        );
      })();
    }
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await submitMessage();
  };

  const onTextareaKeyDown = async (e: KeyboardEvent<HTMLTextAreaElement>) => {
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

  /** Typing-dots feltétele (C variant):
   *  - dot, ha a bubble még üres vagy a PENDING sablonszöveg van benne;
   *  - amint az első delta beérkezik, élő token-folyam.
   */
  const shouldShowTypingDots = (m: ChatMessage): boolean => {
    if (m.role !== "assistant" || !m.isLoading) return false;
    const first = m.bubbles[0] ?? "";
    return first === "" || first === PENDING_ASSISTANT_TEXT;
  };

  // Suppress unused-warning a formatStatusForLog import-ra: a SessionLogPanel kapja meg.
  void formatStatusForLog;
  void formatApiTurnStepLabel;

  return (
    <main className={s.shell}>
      <header className={s.stickyNav}>
        <div className={s.navTitleBlock}>
          <h1 className={s.navTitle}>Questell · Decision flow demo</h1>
          {isDev && activeTab === "test" ? (
            <p className={s.navMeta}>
              Aktív node: <code>{currentPageId}</code>
            </p>
          ) : isDev && activeTab === "log" ? (
            <p className={s.navMeta}>Mentett tesztek megtekintése</p>
          ) : (
            <p className={s.navMeta}>
              Refurbished electronics — complaint intake (HU)
            </p>
          )}
        </div>
        <div className={s.navActions}>
          <button
            type="button"
            className={s.navAction}
            onClick={handleRestart}
          >
            Új beszélgetés
          </button>
          <a href={`#${DOCS_SECTION_ID}`} className={s.navAction}>
            Dokumentáció
          </a>
          {isDev ? (
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
          ) : null}
        </div>
      </header>

      {isDev && activeTab === "log" ? (
        <TestLogPanel savedRevision={savedRevision} />
      ) : (
        <>
          <div className={s.testBody}>
            <LeftGuidePanel />

            <div className={s.mainChatColumn}>
              <section ref={chatScrollRef} className={s.chatSection}>
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
                        <div className={s.assistantAvatar} aria-hidden />
                        <div className={s.assistantBubbleGroup}>
                          {m.bubbles.map((para, pi) => {
                            const isFirst = pi === 0;
                            const bubbleClass = m.isLoading
                              ? `${s.bubbleAssistantPending}`
                              : `${s.bubbleAssistant} ${
                                  isFirst ? s.bubbleAssistantFirst : s.bubbleAssistantFollowup
                                }`;
                            const showDots = isFirst && shouldShowTypingDots(m);
                            return (
                              <div key={pi} className={bubbleClass}>
                                {showDots ? (
                                  <span
                                    className={s.typingDots}
                                    aria-label="Feldolgozás folyamatban"
                                  >
                                    <span />
                                    <span />
                                    <span />
                                  </span>
                                ) : (
                                  para
                                )}
                              </div>
                            );
                          })}
                          {!m.isLoading && m.sentAt != null ? (
                            <div className={s.assistantMetaRow}>
                              <time
                                className={s.assistantTimestamp}
                                dateTime={new Date(m.sentAt).toISOString()}
                              >
                                {new Date(m.sentAt).toLocaleTimeString()}
                              </time>
                              {m.turnId ? (
                                <button
                                  type="button"
                                  className={s.behindReplyChip}
                                  onClick={() =>
                                    handleBehindReplyClick(m.turnId as string)
                                  }
                                  aria-label="Mutasd, mit csinált a háttérben"
                                >
                                  <span aria-hidden>▸</span> Háttérben
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ),
                  )}
                </div>
              </section>

              <form onSubmit={onSubmit} className={s.inputBar}>
                <div className={s.inputBarInner}>
                  <label
                    className={`${s.simulateToggle} ${simulateImage ? s.simulateToggleOn : ""}`}
                  >
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
                      {pendingAttachmentPreviewUrl ? (
                        // blob: URL preview — next/image nem alkalmas (nem optimalizálható).
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={pendingAttachmentPreviewUrl}
                          alt=""
                          className={s.attachmentThumb}
                        />
                      ) : (
                        <span className={s.attachmentThumbFallback} aria-hidden>
                          <FileImage size={18} />
                        </span>
                      )}
                      <span className={s.attachmentName} title={pendingAttachmentName}>
                        {pendingAttachmentName}
                      </span>
                      <button
                        type="button"
                        className={s.attachmentRemove}
                        onClick={() => {
                          setPendingAttachmentName(null);
                          setPendingAttachmentPreviewUrl((prev) => {
                            if (prev) URL.revokeObjectURL(prev);
                            return null;
                          });
                          if (fileInputRef.current) fileInputRef.current.value = "";
                        }}
                        aria-label="Csatolmány eltávolítása"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : null}
                  <div
                    className={`${s.inputComposer} ${composerFocused ? s.inputComposerFocused : ""}`}
                    onFocusCapture={() => setComposerFocused(true)}
                    onBlurCapture={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                        setComposerFocused(false);
                      }
                    }}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className={s.fileInputHidden}
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null;
                        setPendingAttachmentName(f ? f.name : null);
                        setPendingAttachmentPreviewUrl((prev) => {
                          if (prev) URL.revokeObjectURL(prev);
                          return f && f.type.startsWith("image/")
                            ? URL.createObjectURL(f)
                            : null;
                        });
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
                    <textarea
                      ref={textareaRef}
                      value={inputValue}
                      onChange={(e) => {
                        setInputValue(e.target.value);
                        requestAnimationFrame(resizeTextarea);
                      }}
                      onKeyDown={onTextareaKeyDown}
                      placeholder="Írd be az üzeneted… (Shift+Enter = sortörés)"
                      className={s.textarea}
                      disabled={isLoading}
                      rows={1}
                    />
                    <button
                      type="submit"
                      disabled={
                        isLoading ||
                        (!inputValue.trim() && !simulateImage && !pendingAttachmentName)
                      }
                      className={s.btnSend}
                    >
                      {isLoading ? "Küldés…" : "Küldés"}
                    </button>
                  </div>
                  <p className={s.inputHint}>
                    Enter = küldés · Shift+Enter = sortörés
                  </p>
                </div>
              </form>
            </div>

            <RightProcessPanel turns={processTurns} isRunning={isLoading} />
          </div>

          {(() => {
            // Demo-nézet: a látogató csak a ticket-kártyát látja (ha készült),
            // a fejlesztői SessionLogPanel `?dev=1` mögé van rejtve.
            const showTicket = lastTicket !== null;
            const showLogs = isDev && logs.length > 0;
            if (!showTicket && !showLogs) return null;
            const singleColumn = !(showTicket && showLogs);
            return (
              <div className={`${s.secondRow} ${s.secondRowVisible}`}>
                <div
                  className={`${s.secondRowInner} ${
                    singleColumn ? s.secondRowInnerSingle : ""
                  }`}
                >
                  {showTicket ? <ChatTicketCard ticket={lastTicket} /> : null}
                  {showLogs ? (
                    <SessionLogPanel
                      debugInfo={debugInfo}
                      apiTurnLog={apiTurnLog}
                      logs={logs}
                      isSavingLogs={isSavingLogs}
                      onSave={saveLogsToBackend}
                    />
                  ) : null}
                </div>
              </div>
            );
          })()}

          <DocsSection />
        </>
      )}
    </main>
  );
}
