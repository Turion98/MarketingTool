"use client";

import { useCallback, useRef, useState } from "react";
import { extractQuestellOrderId } from "@/app/lib/questellOrderId";
import type { ProcessResponse, Ticket } from "@/app/test-chat/testChatTypes";

/**
 * A beágyazott portfólió-demó motorja. A `/api/ai-node/process` SSE végpontot
 * hívja (ugyanaz a kontraktus, amit a `/test-chat` fejlesztői oldal), és a
 * látogatói felülethez szükséges állapotot adja vissza: chat, teljesült/hiányzó
 * feltételek, körönkénti napló (mit értett meg / melyik szabály döntött), ticket.
 *
 * A dev-only részek (kép-csatolás, log-mentés, fázis-animáció) kihagyva.
 */

const START_PAGE_ID = "complaint-intake";
const STORY_SRC = "ai_complaint_story_v3";
const PENDING_TEXT = "Feldolgozom a kérésedet…";

export type DemoMessage =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; loading?: boolean; sentAt?: number };

/** Egy forduló naplója a state-panel feedjéhez. */
export interface DemoTurn {
  id: string;
  num: number;
  /** Amit a modell megértett ebben a körben (újonnan teljesült feltételek). */
  understood: string[];
  /** A routing döntése: honnan hová lépett a beszélgetés. */
  decision: string | null;
  latencyMs: number | null;
  status: string | null;
}

function assistantTextFromProcess(data: ProcessResponse): string {
  const ack = typeof data.assistantMessage === "string" ? data.assistantMessage.trim() : "";
  const end = typeof data.endPageContent === "string" ? data.endPageContent.trim() : "";
  if (ack && end && ack !== end) return `${ack}\n\n${end}`;
  if (end) return end;
  if (ack) return ack;
  const cq = data.clarificationQuestion;
  if (typeof cq === "string" && cq.trim()) return cq.trim();
  return "Nincs válasz a szervertől.";
}

async function consumeSse(
  response: Response,
  handlers: {
    onMeta?: (data: ProcessResponse) => void;
    onDelta?: (text: string) => void;
    onDone: (data: ProcessResponse) => void;
  },
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Nincs választörzs az SSE olvasáshoz.");
  const decoder = new TextDecoder();
  let buffer = "";

  const flush = () => {
    for (;;) {
      const sep = buffer.indexOf("\n\n");
      if (sep < 0) break;
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      let eventName = "message";
      const dataLines: string[] = [];
      for (const raw of block.split("\n")) {
        const line = raw.replace(/\r$/, "");
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
          /* ignore */
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
      flush();
      break;
    }
    flush();
  }
}

export function useSupportDemoEngine() {
  const [messages, setMessages] = useState<DemoMessage[]>([]);
  const [satisfied, setSatisfied] = useState<string[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [activeNodeId, setActiveNodeId] = useState<string>(START_PAGE_ID);
  const [turns, setTurns] = useState<DemoTurn[]>([]);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [input, setInput] = useState("");

  const pageIdRef = useRef<string>(START_PAGE_ID);
  const stepIdRef = useRef<string | null>(null);
  const orderIdRef = useRef<string | null>(null);
  const satisfiedRef = useRef<string[]>([]);
  const sessionIdRef = useRef<string>(`demo-${Date.now()}`);
  const turnRef = useRef(0);

  const restart = useCallback(() => {
    setMessages([]);
    setSatisfied([]);
    setMissing([]);
    setActiveNodeId(START_PAGE_ID);
    setTurns([]);
    setTicket(null);
    setInput("");
    pageIdRef.current = START_PAGE_ID;
    stepIdRef.current = null;
    orderIdRef.current = null;
    satisfiedRef.current = [];
    sessionIdRef.current = `demo-${Date.now()}`;
    turnRef.current = 0;
  }, []);

  const setAssistantText = (text: string, loading: boolean) => {
    setMessages((prev) => {
      const copy = [...prev];
      for (let i = copy.length - 1; i >= 0; i--) {
        const m = copy[i];
        if (m.role === "assistant" && m.loading) {
          copy[i] = loading
            ? { role: "assistant", text, loading: true }
            : { role: "assistant", text, sentAt: Date.now() };
          return copy;
        }
      }
      return copy;
    });
  };

  const submit = useCallback(async () => {
    const prompt = input.trim();
    if (!prompt || isLoading) return;

    const pageIdAtSend = pageIdRef.current;
    turnRef.current += 1;
    const turnNum = turnRef.current;
    const turnId = `t-${Date.now()}-${turnNum}`;

    setMessages((prev) => [
      ...prev,
      { role: "user", text: prompt },
      { role: "assistant", text: PENDING_TEXT, loading: true },
    ]);
    setInput("");
    setIsLoading(true);
    const startedAt = performance.now();

    try {
      const res = await fetch("/api/ai-node/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          src: STORY_SRC,
          pageId: pageIdRef.current,
          prompt,
          satisfiedConditions: satisfiedRef.current,
          currentStepId: stepIdRef.current,
          order_id: orderIdRef.current ?? null,
          sessionId: sessionIdRef.current,
          turnCount: turnNum,
          stream: true,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        setAssistantText(`Hiba (${res.status}): ${errText || "ismeretlen"}`, false);
        setTurns((prev) => [
          ...prev,
          { id: turnId, num: turnNum, understood: [], decision: "hiba", latencyMs: null, status: `http_${res.status}` },
        ]);
        return;
      }

      let doneData: ProcessResponse | null = null;
      const isSse = (res.headers.get("content-type") ?? "").includes("text/event-stream");

      const applyMeta = (p: ProcessResponse) => {
        const sat = Array.isArray(p.satisfiedConditions) ? p.satisfiedConditions : [];
        const miss = Array.isArray(p.missing) ? p.missing : [];
        satisfiedRef.current = sat;
        setSatisfied(sat);
        setMissing(miss);
        if (sat.includes("has_order_id")) {
          const extracted = extractQuestellOrderId(prompt);
          if (extracted) orderIdRef.current = extracted;
        }
        if (typeof p.activeNodeId === "string" && p.activeNodeId.trim()) {
          pageIdRef.current = p.activeNodeId;
          setActiveNodeId(p.activeNodeId);
        }
        if (p.nextStepId) stepIdRef.current = p.nextStepId;
        else if (p.currentStepId) stepIdRef.current = p.currentStepId;
      };

      if (isSse) {
        await consumeSse(res, {
          onMeta: (p) => {
            applyMeta(p);
            setAssistantText("", true);
          },
          onDelta: (text) => {
            setMessages((prev) => {
              const copy = [...prev];
              for (let i = copy.length - 1; i >= 0; i--) {
                const m = copy[i];
                if (m.role === "assistant" && m.loading) {
                  const base = m.text === PENDING_TEXT ? "" : m.text;
                  copy[i] = { role: "assistant", text: base + text, loading: true };
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
        if (!doneData) throw new Error("SSE: hiányzó done esemény.");
      } else {
        doneData = (await res.json()) as ProcessResponse;
      }

      const data = doneData as ProcessResponse;
      const latencyMs = Math.round(performance.now() - startedAt);
      const sat = Array.isArray(data.satisfiedConditions) ? data.satisfiedConditions : satisfiedRef.current;
      const miss = Array.isArray(data.missing) ? data.missing : [];
      const newly = Array.isArray(data.newlySatisfied) ? data.newlySatisfied : [];

      satisfiedRef.current = sat;
      setSatisfied(sat);
      setMissing(miss);
      if (sat.includes("has_order_id") && !orderIdRef.current) {
        const extracted = extractQuestellOrderId(prompt);
        if (extracted) orderIdRef.current = extracted;
      }

      // Node-átmenet
      if (data.status === "ok" && data.nextPageId?.trim()) {
        pageIdRef.current = data.nextPageId.trim();
        setActiveNodeId(data.nextPageId.trim());
        stepIdRef.current = null;
      } else if (typeof data.activeNodeId === "string" && data.activeNodeId.trim()) {
        pageIdRef.current = data.activeNodeId;
        setActiveNodeId(data.activeNodeId);
      }

      const decision =
        data.activeNodeId && data.activeNodeId !== pageIdAtSend
          ? `${pageIdAtSend} → ${data.activeNodeId}`
          : null;

      setAssistantText(assistantTextFromProcess(data), false);
      setTicket(data.ticket ?? null);
      setTurns((prev) => [
        ...prev,
        { id: turnId, num: turnNum, understood: newly, decision, latencyMs, status: data.status ?? null },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "ismeretlen hiba";
      setAssistantText(`Hálózati hiba: ${msg}`, false);
      setTurns((prev) => [
        ...prev,
        { id: turnId, num: turnNum, understood: [], decision: "hiba", latencyMs: null, status: "network_error" },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading]);

  return {
    messages,
    satisfied,
    missing,
    activeNodeId,
    turns,
    ticket,
    isLoading,
    input,
    setInput,
    submit,
    restart,
    startPageId: START_PAGE_ID,
  };
}
