"use client";
import React, { KeyboardEvent, useState } from "react";
import s from "./ActionBar.module.scss";
import RestartButton from "../../RestartButton/RestartButton";
import RestartGameButton from "../../RestartGameButton/RestartGameButton";
import { useGameState } from "../../../lib/GameStateContext";
import { useUiClickSound } from "../../../lib/useUiClickSound";


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
  const { rewardImageReady, downloadRewardImage, globals } = useGameState();

  const isAdmin = !!(globals as any)?.isAdmin;

  // 🔊 Action bar hangok
  const playClick = useUiClickSound("/sounds/actionbar-click.wav");
  const playSlide = useUiClickSound("/sounds/actionbar-slide.mp3");

  const onKeyActivate =
    (cb: () => void, disabled?: boolean) =>
    (e: KeyboardEvent<HTMLButtonElement>) => {
      if (disabled) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        playClick(); // billentyűs aktiváláskor katt hang (panel gomboknál)
        cb();
      }
    };

  // 🔊 mobil toggle – CSAK slide hang
  const handleToggle = () => {
    playSlide();           // panel ki/be csúszás hang
    setOpen((v) => !v);
  };

  const handleSkip = () => {
    if (!canSkip) return;
    playClick();
    onSkip();
  };

  const handleReplay = () => {
    if (!canReplay) return;
    playClick();
    onReplay();
  };

  const handleDownloadReward = () => {
    if (!rewardImageReady) return;
    playClick();
    downloadRewardImage();
  };

  const handleToggleMute = () => {
    playClick();
    onToggleMute();
  };

  return (
    <>
    <div className={s.actionBarScope}>
      {/* mobil toggle gomb a jobb alsó sarokban */}
      <div className={s.mobileRow}>
        <button
          type="button"
          className={s.mobileToggle}
          aria-label="Open actions"
          aria-controls="actionbar"
          aria-expanded={open}
          onClick={handleToggle}
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
            onClick={handleSkip}
            onKeyDown={onKeyActivate(handleSkip, !canSkip)}
            aria-label="Skip typing"
          >
            <span className={s.label}>Skip</span>
          </button>

          <button
            type="button"
            className={s.btn}
            disabled={!canReplay}
            onClick={handleReplay}
            onKeyDown={onKeyActivate(handleReplay, !canReplay)}
            aria-label="Replay"
          >
            <span className={s.label}>Replay</span>
          </button>

          {/* 🔹 Reward letöltés gomb – csak akkor aktív, ha van kész kép */}
          <button
            type="button"
            className={s.btn}
            disabled={!rewardImageReady}
            onClick={handleDownloadReward}
            onKeyDown={onKeyActivate(handleDownloadReward, !rewardImageReady)}
            aria-label="Download reward image"
            data-reward-ready={rewardImageReady ? "true" : "false"}
          >
            <span className={s.label}>Get</span>
          </button>

          <button
            type="button"
            className={s.btn}
            onClick={handleToggleMute}
            onKeyDown={onKeyActivate(handleToggleMute)}
            aria-label={muted ? "Unmute" : "Mute"}
            data-state={muted ? "muted" : "unmuted"}
          >
            <span className={s.label}>{muted ? "Muted" : "Sound"}</span>
          </button>
        </div>

        {/* footer: játékos restart – mindig látszik */}
        <div className={s.footer}>
          <RestartGameButton className={s.btn} />
        </div>

        {/* footer: admin BACK – csak admin módban */}
        {isAdmin && (
          <div className={s.footer}>
            <RestartButton
              className={s.btn}
              startPageId="landing"
              label="Back"
              aria-label="Back to landing (admin)"
            />
          </div>
        )}
      </aside>
      </div>
    </>
    
  );
};

export default ActionBar;
