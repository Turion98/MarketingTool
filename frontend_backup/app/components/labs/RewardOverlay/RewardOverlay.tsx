import React, { useEffect, useState } from 'react';
import styles from './RewardOverlay.module.scss';

interface RewardOverlayProps {
  message?: string;
  onComplete?: () => void;
}

const RewardOverlay: React.FC<RewardOverlayProps> = ({
  message = "Emlék megszerezve",
  onComplete
}) => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      if (onComplete) onComplete();
    }, 2000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className={`${styles.rewardOverlay} ${visible ? styles.show : styles.hide}`}>
      <div className={styles.rewardMessage}>{message}</div>
      <div className={styles.rewardFlash} />
    </div>
  );
};

export default RewardOverlay;
