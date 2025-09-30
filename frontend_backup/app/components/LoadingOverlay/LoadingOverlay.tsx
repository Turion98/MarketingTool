import React from "react";
import { useGameState } from "../../lib/GameStateContext";
import styles from "./LoadingOverlay.module.scss";

const LoadingOverlay: React.FC = () => {
  const { isLoading } = useGameState();

  if (!isLoading) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.spinner}></div>
    </div>
  );
};

export default LoadingOverlay;
