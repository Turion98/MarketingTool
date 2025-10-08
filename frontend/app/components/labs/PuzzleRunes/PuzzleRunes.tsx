"use client";
import React, { useRef, useState } from "react";
import { trackPuzzleResult } from "../../../lib/analytics";

type PuzzleRunesProps = {
  options: string[];
  answer: string[];
  maxAttempts?: number;
  onResult: (ok: boolean) => void;

  // ⬇️ kötelező az analytics miatt:
  storyId: string;
  sessionId: string;
  pageId: string;
  puzzleId: string;

  // ⬇️ skin/layout
  className?: string;
  buttonClassName?: string;
};

export default function PuzzleRunes({
  options,
  answer,
  maxAttempts = 3,
  onResult,
  storyId,
  sessionId,
  pageId,
  puzzleId,
  className,
  buttonClassName,
}: PuzzleRunesProps) {
  const [picked, setPicked] = useState<string[]>([]);
  const [attempts, setAttempts] = useState(0);
 const t0Ref = useRef<number>(
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now()
);

  const pick = (id: string) =>
    !picked.includes(id) && setPicked((p) => [...p, id]);

  const undo = (id: string) =>
    setPicked((p) => p.filter((x) => x !== id));

  const reset = () => setPicked([]);

  const submit = () => {
    const ok =
      picked.length === answer.length &&
      picked.every((x, i) => x === answer[i]);

    const now = (() => { try { return performance.now(); } catch { return Date.now(); } })();
    const durationMs = Math.max(0, now - (t0Ref.current || now));

    // ⬇️ HELYES HÍVÁS – minden kötelező paraméterrel
    trackPuzzleResult(
      storyId,
      sessionId,
      pageId,
      puzzleId,
      ok,
      attempts + 1,
      durationMs,
      { size: options.length } // extra (opcionális)
    );

    setAttempts((n) => n + 1);
    onResult(ok);
  };

  return (
    <div className={className} role="group" aria-label="Runák kirakó">
      <div role="list" aria-label="Elérhető runák">
        {options.map((id) => {
          const selected = picked.includes(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => pick(id)}
              disabled={selected || picked.length >= answer.length}
              className={buttonClassName}
              aria-pressed={selected}
              data-selected={selected}
            >
              {id}
            </button>
          );
        })}
      </div>

      <div role="list" aria-label="Kiválasztott sorrend">
        {picked.map((id) => (
          <button
            key={`picked-${id}`}
            type="button"
            onClick={() => undo(id)}
            className={buttonClassName}
            data-rune-picked="true"
          >
            {id} ✕
          </button>
        ))}
      </div>

      <div>
        <button
          type="button"
          onClick={submit}
          disabled={picked.length !== answer.length}
          className={buttonClassName}
          data-action="submit"
        >
          Ellenőrzés
        </button>

        <button
          type="button"
          onClick={reset}
          className={buttonClassName}
          data-action="reset"
        >
          Reset
        </button>

        <span>Próbálkozás: {attempts}/{maxAttempts}</span>
      </div>
    </div>
  );
}
