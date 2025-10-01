import React from "react";
import { useGameState } from "../../lib/GameStateContext";
import styles from "./ErrorOverlay.module.scss";

const ErrorOverlay: React.FC = () => {
  const { globalError, setGlobalError } = useGameState();

  if (!globalError) return null;

  const handleRetry = () => {
    window.location.reload();
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.container}>
        <p>{globalError}</p>
        <button className={styles.buttonPrimary} onClick={handleRetry}>
          Újrapróbálás
        </button>
        <button className={styles.buttonSecondary} onClick={() => setGlobalError(null)}>
          Bezárás
        </button>
      </div>
    </div>
  );
};

export default ErrorOverlay;
