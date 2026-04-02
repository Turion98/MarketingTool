import React from "react";
import { useGameState } from "../../lib/GameStateContext";
import styles from "./LoadingOverlay.module.scss";

type LoadingOverlayProps = {
  /** Opcionális felirat (alap: "Loading…") */
  message?: string;
  /** Ghost embed: nincs scrim, csak spinner */
  variant?: "default" | "minimal";
};

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  message = "Loading…",
  variant = "default",
}) => {
  const { isLoading } = useGameState();
  if (!isLoading) return null;

  const minimal = variant === "minimal";

  return (
    <div
      className={`${styles.overlay} ${minimal ? styles.overlayMinimal : ""}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      {!minimal && (
        <div className={styles.bg}>
          <div className={styles.cssBg} aria-hidden />
          <div className={styles.scrim} aria-hidden />
        </div>
      )}

      <div className={styles.content}>
        <div className={styles.spinner} aria-hidden />
        {!minimal && <div className={styles.label}>{message}</div>}
      </div>
    </div>
  );
};

export default LoadingOverlay;
