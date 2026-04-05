"use client";

import React, { KeyboardEvent, useMemo } from "react";
import s from "./InteractionDock.module.scss";

// 🔊 hang hook import
import { useUiClickSound } from "../../../lib/useUiClickSound";

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
  /** Ghost embed: egyszerű szövegszerű választók */
  embedGhost?: boolean;
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
  embedGhost = false,
}) => {
  const safeChoices = useMemo<DockChoice[]>(
    () => (Array.isArray(choices) ? choices : []),
    [choices]
  );

  // 🔊 hang inicializálása
  const playClick = useUiClickSound();

  const onKeyActivate =
    (id: string, disabled?: boolean) =>
    (e: KeyboardEvent<HTMLButtonElement>) => {
      if (disabled) return;

      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        playClick();       // 🔊 billentyű aktiválás hangja
        onSelect(id);
      }
    };

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
      <div className={cx(s.grid, embedGhost && s.gridGhost)} role="list">
        {safeChoices.map((c) => {
          const disabled = !!c.disabled;
          const key = String(c.id);

          return (
            <button
              key={key}
              type="button"
              data-questell-dock-choice
              className={cx(s.choice, c.className)}
              disabled={disabled}
              aria-disabled={disabled || undefined}
              aria-label={c.label}
              title={c.title}
              onClick={() => {
                if (disabled) return;
                playClick();         // 🔊 kattintási hang
                onSelect(c.id);
              }}
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
