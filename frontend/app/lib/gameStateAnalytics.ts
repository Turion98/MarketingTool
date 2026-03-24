"use client";

import { getOrCreateSessionId, startNewRunSession } from "./analytics";
import type { GameStateGlobals } from "./gameStateTypes";

export function getStringGlobal(
  globals: GameStateGlobals,
  key: string
): string | undefined {
  const value = globals[key];
  return typeof value === "string" ? value : undefined;
}

export function getScopeKey(globals: GameStateGlobals): string {
  return (
    getStringGlobal(globals, "accountId") ||
    getStringGlobal(globals, "tenantId") ||
    getStringGlobal(globals, "embedKey") ||
    (typeof window !== "undefined" ? window.location.host : "default")
  );
}

export function getRunKey(globals: GameStateGlobals): string | undefined {
  return getStringGlobal(globals, "runKey");
}

export function getStartPageId(globals: GameStateGlobals): string | undefined {
  return getStringGlobal(globals, "startPageId");
}

export function runStorageKey(storyId: string, scopeKey?: string): string {
  const scope = String(scopeKey || "default").trim() || "default";
  return `q_an:${storyId}:${scope}:runId_v1`;
}

function newRunId(): string {
  return `run_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function getStoredRunId(storyId: string, scopeKey?: string): string | undefined {
  try {
    return sessionStorage.getItem(runStorageKey(storyId, scopeKey)) || undefined;
  } catch {
    return undefined;
  }
}

export function getOrCreateRunId(storyId: string, scopeKey?: string): string {
  const existing = getStoredRunId(storyId, scopeKey);
  if (existing) return existing;

  const runId = newRunId();
  try {
    sessionStorage.setItem(runStorageKey(storyId, scopeKey), runId);
  } catch {}
  return runId;
}

export function startNewRunId(storyId: string, scopeKey?: string): string {
  const runId = newRunId();
  try {
    sessionStorage.setItem(runStorageKey(storyId, scopeKey), runId);
  } catch {}
  return runId;
}

export function initAnalyticsSessionState(
  storyId: string,
  globals: GameStateGlobals
): {
  scopeKey: string;
  runKey?: string;
  sessionId: string;
  runId?: string;
} {
  const scopeKey = getScopeKey(globals);
  const runKey = getRunKey(globals);

  if (runKey) {
    let sessionId = "";
    let runId = getStoredRunId(storyId, scopeKey);

    try {
      const scope = String(scopeKey || "default").trim() || "default";
      const bucket = `q_an:${storyId}:${scope}`;
      sessionId = localStorage.getItem(`${bucket}:sessionId_v2`) || "";
    } catch {}

    if (!sessionId) sessionId = startNewRunSession(storyId, scopeKey);
    if (!runId) runId = startNewRunId(storyId, scopeKey);

    return { scopeKey, runKey, sessionId, runId };
  }

  return {
    scopeKey,
    runKey,
    sessionId: getOrCreateSessionId(storyId, scopeKey),
    runId: getStoredRunId(storyId, scopeKey),
  };
}
