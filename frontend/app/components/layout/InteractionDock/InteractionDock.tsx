"use client";
import React, { KeyboardEvent } from "react";
import s from "./InteractionDock.module.scss";

export type DockChoice = {
  id: string;
  label: string;
  disabled?: boolean;
};

type InteractionDockProps = {
  mode?: "default";
  choices: DockChoice[];
  onSelect: (choiceId: string) => void;
};

const InteractionDock: React.FC<InteractionDockProps> = ({
  mode = "default",
  choices,
  onSelect,
}) => {
  const onKeyActivate =
    (id: string, disabled?: boolean) =>
    (e: KeyboardEvent<HTMLButtonElement>) => {
      if (disabled) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onSelect(id);
      }
    };

  return (
    <div
      className={s.wrapper}
      role="group"
      aria-label="Choices"
      data-mode={mode}
    >
      <div className={s.grid}>
        {choices.map((c) => (
          <button
            key={c.id}
            type="button"
            className={s.choice}
            disabled={!!c.disabled}
            onClick={() => !c.disabled && onSelect(c.id)}
            onKeyDown={onKeyActivate(c.id, !!c.disabled)}
            aria-label={c.label}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default InteractionDock;
