import React, { useEffect, useState } from "react";
import styles from "./FragmentReplayOverlay.module.scss";

type FragmentReplayOverlayProps = {
  imageSrc: string;
  durationMs?: number;
  sfx?: string;
  onComplete?: () => void;
};

const FragmentReplayOverlay: React.FC<FragmentReplayOverlayProps> = ({
  imageSrc,
  durationMs = 2500,
  sfx,
  onComplete
}) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(true);

    if (sfx) {
      const audio = new Audio(sfx);
      audio.play();
    }

    const timer = setTimeout(() => {
      setVisible(false);
      if (onComplete) onComplete();
    }, durationMs);

    return () => clearTimeout(timer);
  }, [durationMs, onComplete, sfx]);

  if (!visible) return null;

  return (
    <div className={styles.fragmentReplayOverlay}>
      <img src={imageSrc} alt="Fragment Replay" />
    </div>
  );
};

export default FragmentReplayOverlay;
