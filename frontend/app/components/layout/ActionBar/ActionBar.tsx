"use client";
import React, { KeyboardEvent, useState } from "react";
import s from "./ActionBar.module.scss";
import RestartButton from "../../RestartButton/RestartButton";
import RestartGameButton from "../../RestartGameButton/RestartGameButton";
import { useGameState } from "../../../lib/GameStateContext";
import { useUiClickSound } from "../../../lib/useUiClickSound";
import { trackUiClick } from "../../../lib/analytics";
import type { GenericProps } from "../../../lib/analyticsSchema";

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
  const [collapsed, setCollapsed] = useState(false); /* desktop: sáv elrejtve */

  // ⛳ hozzuk ki az analytics-hez szükséges azonosítókat
  const {
    rewardImageReady,
    downloadRewardImage,
    globals,
    storyId,
    sessionId,
    currentPageId,
  } = useGameState();

  const isAdmin = globals?.isAdmin === true;

  // 🔊 Action bar hangok
  const playClick = useUiClickSound("/sounds/actionbar-click.wav");
  const playSlide = useUiClickSound("/sounds/actionbar-slide.mp3");

  const logAction = (control: string, extra?: GenericProps) => {
    try {
      if (!storyId || !sessionId) return;
      const page = String(currentPageId ?? "unknown");
      trackUiClick(String(storyId), String(sessionId), page, control, extra);
    } catch {}
  };

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
    playSlide(); // panel ki/be csúszás hang

    setOpen((v) => {
      const next = !v;
      logAction("actionbar_toggle", { open: next ? "1" : "0" });
      return next;
    });
  };

  const handleDesktopCollapseToggle = () => {
    playSlide();
    setCollapsed((v) => {
      const next = !v;
      logAction("actionbar_desktop_collapse", { collapsed: next ? "1" : "0" });
      return next;
    });
  };

  const handleSkip = () => {
    if (!canSkip) return;
    playClick();
    logAction("action_skip");
    onSkip();
  };

  const handleReplay = () => {
    if (!canReplay) return;
    playClick();
    logAction("action_replay");
    onReplay();
  };

  const handleDownloadReward = () => {
    if (!rewardImageReady) return;
    playClick();
    logAction("action_reward_download");
    downloadRewardImage();
  };

  const handleToggleMute = () => {
    playClick();
    // muted prop a jelenlegi állapot – kattintás után fordul
    logAction("action_mute_toggle", { to: muted ? "unmuted" : "muted" });
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
          className={[s.actionBar, open ? s.open : "", collapsed ? s.collapsed : "", className ?? ""].join(" ")}
          role="complementary"
          aria-label="Actions sidebar"
          aria-expanded={!collapsed}
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

          {/* desktop: collapse/expand gomb jobb oldalon (csak 769px+ látszik) */}
          <div className={s.desktopToggleRow}>
            <button
              type="button"
              className={s.btn}
              onClick={handleDesktopCollapseToggle}
              aria-label={collapsed ? "Show actions" : "Hide actions"}
              aria-expanded={!collapsed}
            >
              <span className={s.label}>{collapsed ? "Actions" : "−"}</span>
            </button>
          </div>
        </aside>
      </div>
    </>
  );
};

export default ActionBar;
