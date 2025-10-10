import React from "react";
import { useGameState } from "../../lib/GameStateContext";
import styles from "./LoadingOverlay.module.scss";

type LoadingOverlayProps = {
  /** Opcionális felirat (alap: "Loading…") */
  message?: string;
};

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ message = "Loading…" }) => {
  const { isLoading } = useGameState();
  if (!isLoading) return null;

  return (
    <div className={styles.overlay} role="status" aria-live="polite" aria-busy="true">
      {/* BG token-vezérelt (szín/gradient/kép + blur + scrim) */}
      <div className={styles.bg}>
        <div className={styles.cssBg} aria-hidden />
        <div className={styles.scrim} aria-hidden />
      </div>

      {/* Tartalom */}
      <div className={styles.content}>
        <div className={styles.spinner} aria-hidden />
        <div className={styles.label}>{message}</div>
      </div>
    </div>
  );
};

export default LoadingOverlay;
