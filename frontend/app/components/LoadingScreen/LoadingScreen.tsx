import React from "react";
import styles from "./LoadingScreen.module.scss";

const LoadingScreen: React.FC = () => {
  return (
    <div className={styles.screen} role="status" aria-live="polite" aria-busy="true">
      <div className={styles.bg}>
        <div className={styles.cssBg} aria-hidden />
        <div className={styles.scrim} aria-hidden />
      </div>

      <div className={styles.content}>
        <div className={styles.logo} aria-hidden>Quest Forge</div>
        <div className={styles.spinner} aria-hidden />
        <div className={styles.text}>Loading…</div>
      </div>
    </div>
  );
};

export default LoadingScreen;
