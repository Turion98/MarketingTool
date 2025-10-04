"use client";
import React, { KeyboardEvent } from "react";
import s from "./ActionBar.module.scss";

type ActionBarProps = {
  canNext: boolean;
  onNext: () => void;
  canSkip: boolean;
  onSkip: () => void;
  canReplay: boolean;
  onReplay: () => void;
  muted: boolean;
  onToggleMute: () => void;
  className?: string;
};

const Icon: React.FC<{ src: string; alt?: string }> = ({ src, alt = "" }) => (
  <img className={s.icon} src={src} alt={alt} />
);

const ActionBar: React.FC<ActionBarProps> = ({
  canNext,
  onNext,
  canSkip,
  onSkip,
  canReplay,
  onReplay,
  muted,
  onToggleMute,
}) => {
  const onKeyActivate =
    (cb: () => void, disabled?: boolean) =>
    (e: KeyboardEvent<HTMLButtonElement>) => {
      if (disabled) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        cb();
      }
    };

  return (
    <div
      className={s.actionBar}
      role="toolbar"
      aria-label="Story controls"
      data-testid="action-bar"
    >
      <button
        type="button"
        className={s.btn}
        disabled={!canSkip}
        onClick={onSkip}
        onKeyDown={onKeyActivate(onSkip, !canSkip)}
        aria-label="Skip typing"
      >
        <Icon src="/icons/skip.svg" />
        <span className={s.label}>Skip</span>
      </button>

      <button
        type="button"
        className={s.btn}
        disabled={!canReplay}
        onClick={onReplay}
        onKeyDown={onKeyActivate(onReplay, !canReplay)}
        aria-label="Replay"
      >
        <Icon src="/icons/replay.svg" />
        <span className={s.label}>Replay</span>
      </button>

      <button
        type="button"
        className={s.btn}
        onClick={onToggleMute}
        onKeyDown={onKeyActivate(onToggleMute)}
        aria-label={muted ? "Unmute" : "Mute"}
        data-state={muted ? "muted" : "unmuted"}
      >
        <Icon
          src={
            muted
              ? "/icons/rune_sound_off_128_transparent.png"
              : "/icons/rune_sound_on_128_transparent.png"
          }
        />
        <span className={s.label}>{muted ? "Muted" : "Sound"}</span>
      </button>

      <button
        type="button"
        className={`${s.btn} ${s.primary}`}
        disabled={!canNext}
        onClick={onNext}
        onKeyDown={onKeyActivate(onNext, !canNext)}
        aria-label="Next"
      >
        <Icon src="/icons/next.svg" />
        <span className={s.label}>Next</span>
      </button>
    </div>
  );
};

export default ActionBar;
