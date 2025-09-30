"use client";
import React, { useRef, useState } from "react";
import { useGameState } from "../../lib/GameStateContext";
import { trackPuzzleTry, trackPuzzleResult, trackUiClick } from "../../lib/analytics";

export default function PuzzleRunes({
  options, answer, maxAttempts = 3,
  onResult,
}: {
  options: string[];
  answer: string[];
  maxAttempts?: number;
  onResult: (ok: boolean) => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [attempts, setAttempts] = useState(0);

  // Kontekstus az analitikához
  const { storyId, sessionId, currentPageId } = (useGameState() as any) ?? {};

  // Időmérés (az első interakciótól számítva)
  const startedAt = useRef<number | null>(null);
  const ensureStart = () => { if (startedAt.current == null) startedAt.current = Date.now(); };

  const puzzleId = `${String(currentPageId || "unknown")}:runes`;

  const pick = (s: string) => {
    ensureStart();
    setPicked((p) => (p.includes(s) ? p : [...p, s]));
    // opcionális kattintás log
    try {
      if (storyId && sessionId && currentPageId) {
        trackUiClick(String(storyId), String(sessionId), String(currentPageId), "runes_pick", { symbol: s });
      }
    } catch {}
  };

  const undo = () => {
    setPicked((p) => p.slice(0, -1));
    try {
      if (storyId && sessionId && currentPageId) {
        trackUiClick(String(storyId), String(sessionId), String(currentPageId), "runes_undo");
      }
    } catch {}
  };

  const reset = () => {
    setPicked([]);
    try {
      if (storyId && sessionId && currentPageId) {
        trackUiClick(String(storyId), String(sessionId), String(currentPageId), "runes_reset");
      }
    } catch {}
  };

  const submit = () => {
    ensureStart();
    const attemptNo = attempts + 1;

    const ok = picked.length === answer.length && picked.every((v, i) => v === answer[i]);

    // TRY
    try {
      if (storyId && sessionId && currentPageId) {
        trackPuzzleTry(
          String(storyId),
          String(sessionId),
          String(currentPageId),
          puzzleId,
          attemptNo,
          { pickedLen: picked.length, expectedLen: answer.length, maxAttempts }
        );
      }
    } catch {}

    // RESULT
    const durationMs = Math.max(0, (Date.now() - (startedAt.current ?? Date.now())));
    try {
      if (storyId && sessionId && currentPageId) {
        trackPuzzleResult(
          String(storyId),
          String(sessionId),
          String(currentPageId),
          puzzleId,
          !!ok,
          attemptNo,
          durationMs,
          { picked: picked.join("|") }
        );
      }
    } catch {}

    if (!ok) setAttempts((a) => a + 1);
    onResult(ok);
  };

  const disabled = picked.length === answer.length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2 justify-center">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            disabled={picked.includes(o) || disabled}
            onClick={() => pick(o)}
            className="btn"
          >
            {o}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 justify-center">
        <span>Kiválasztva:</span>
        {picked.map((p, i) => (
          <span key={p + i} className="px-2 py-1 rounded-md border">{p}</span>
        ))}
        <button type="button" onClick={undo} disabled={picked.length === 0}>Vissza</button>
        <button type="button" onClick={reset} disabled={picked.length === 0}>Törlés</button>
      </div>

      <div className="flex items-center gap-3 justify-center">
        <button
          type="button"
          onClick={submit}
          disabled={picked.length !== answer.length}
        >
          Ellenőrzés
        </button>
        <span>Próbálkozás: {attempts}/{maxAttempts}</span>
      </div>
    </div>
  );
}
