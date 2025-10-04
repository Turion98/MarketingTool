"use client";

import React, { KeyboardEvent, useMemo } from "react";
import s from "./InteractionDock.module.scss";

export type DockChoice = {
  id: string;
  label: string;
  disabled?: boolean;
  /** Egyedi extra osztály a gombhoz (opcionális) */
  className?: string;
  /** Opcionális title/tooltip */
  title?: string;
};

type InteractionDockProps = {
  mode?: "default";
  choices: DockChoice[];
  onSelect: (choiceId: string) => void;
  /** Külső osztály a wrapperhez (pl. grid-area kiosztáshoz) */
  className?: string;
};

/** Egyszerű segédfüggvény a className-ek összefűzésére */
function cx(...v: Array<string | undefined | false | null>) {
  return v.filter(Boolean).join(" ");
}

const InteractionDock: React.FC<InteractionDockProps> = ({
  mode = "default",
  choices,
  onSelect,
  className,
}) => {
  const safeChoices = useMemo<DockChoice[]>(
    () => (Array.isArray(choices) ? choices : []),
    [choices]
  );

  const onKeyActivate =
    (id: string, disabled?: boolean) =>
    (e: KeyboardEvent<HTMLButtonElement>) => {
      if (disabled) return;
      // Button elemeknél Enter és Space az alapértelmezett aktivátor.
      // Itt saját aktiválást adunk, és megakadályozzuk a duplikált triggerelést.
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onSelect(id);
      }
    };

  // Ha nincs mit megjeleníteni, ne adjunk felesleges, üres konténert.
  if (safeChoices.length === 0) {
    return null;
  }

  return (
    <div
      className={cx(s.wrapper, className)}
      role="group"
      aria-label="Choices"
      data-mode={mode}
    >
      <div className={s.grid} role="list">
        {safeChoices.map((c) => {
          const disabled = !!c.disabled;
          const key = String(c.id);

          return (
            <button
              key={key}
              type="button"
              className={cx(s.choice, c.className)}
              disabled={disabled}
              aria-disabled={disabled || undefined}
              aria-label={c.label}
              title={c.title}
              onClick={() => !disabled && onSelect(c.id)}
              onKeyDown={onKeyActivate(c.id, disabled)}
              data-choice-id={key}
              data-disabled={disabled ? "true" : "false"}
              role="listitem"
            >
              {c.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default InteractionDock;
