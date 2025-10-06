import React, { useEffect, useState } from "react";
import styles from "./RewardOverlay.module.scss";

interface RewardOverlayProps {
  message?: string;
  onComplete?: () => void;

  /** új opcionális CTA-slot a kampányvég gombhoz */
  ctaSlot?: React.ReactNode;
}

const RewardOverlay: React.FC<RewardOverlayProps> = ({
  message = "Emlék megszerezve",
  onComplete,
  ctaSlot
}) => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onComplete?.();
    }, 2000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div
      className={`${styles.rewardOverlay} ${
        visible ? styles.show : styles.hide
      }`}
    >
      <div className={styles.rewardMessage}>{message}</div>
      <div className={styles.rewardFlash} />

      {/* CTA zóna – csak ha van átadva */}
      {ctaSlot && <div className={styles.ctaRow}>{ctaSlot}</div>}
    </div>
  );
};

export default RewardOverlay;
