import React from "react";
import styles from "./LoadingScreen.module.scss";

const LoadingScreen: React.FC = () => {
  return (
    <div className={styles.loadingScreen}>
      <div className={styles.loadingLogo}>Quest Forge</div>
      <div className={styles.loadingText}>Loading...</div>
    </div>
  );
};

export default LoadingScreen;
