"use client";
import React, { KeyboardEvent, useState } from "react";
import s from "./ActionBar.module.scss";
import RestartButton from "../../RestartButton/RestartButton";

type ActionBarProps = {
  canSkip: boolean;
  onSkip: () => void;
  canReplay: boolean;
  onReplay: () => void;
  muted: boolean;
  onToggleMute: () => void;
  className?: string;
};

const ActionBar: React.FC<ActionBarProps> = ({
  canSkip,
  onSkip,
  canReplay,
  onReplay,
  muted,
  onToggleMute,
  className,
}) => {
  const [open, setOpen] = useState(false);

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
    <>
      {/* mobil toggle gomb a jobb alsó sarokban */}
      <div className={s.mobileRow}>
        <button
          type="button"
          className={s.mobileToggle}
          aria-label="Open actions"
          aria-controls="actionbar"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          Actions
        </button>
      </div>

      <aside
        id="actionbar"
        className={[s.actionBar, open ? s.open : "", className ?? ""].join(" ")}
        role="complementary"
        aria-label="Actions sidebar"
        data-testid="action-bar"
      >
        {/* felső gombsor */}
        <div className={s.group}>
          <button
            type="button"
            className={s.btn}
            disabled={!canSkip}
            onClick={onSkip}
            onKeyDown={onKeyActivate(onSkip, !canSkip)}
            aria-label="Skip typing"
          >
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
            <span className={s.label}>{muted ? "Muted" : "Sound"}</span>
          </button>
        </div>

        {/* footer: csak Restart marad itt */}
        <div className={s.footer}>
          <RestartButton
            className={s.btn}
            startPageId="landing"
            aria-label="Restart"
          />
        </div>
      </aside>
    </>
  );
};

export default ActionBar;
