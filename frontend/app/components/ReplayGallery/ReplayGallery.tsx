import React from "react";
import { useGameState } from "../../lib/GameStateContext";
import AudioPlayer from "../AudioPlayer";
import styles from "./ReplayGallery.module.scss";

const FRAGMENT_DATA: Record<string, { imagePath: string; audioPrompt?: string }> = {
  "tower_echo_fragment_a1": {
    imagePath: "/assets/image/ui/background.png", // <-- teljes elérési út
    audioPrompt: "It knows you paused. And that matters."
  },
  "tower_veil_fragment_a2": {
    imagePath: "/assets/image/ui/background.png",
    audioPrompt: "Now you’ve seen it. And that changes things."
  },
  "tower_silent_fragment_a3": {
    imagePath: "/assets/image/ui/background.png",
    audioPrompt: "It breathes, because you stayed."
  }
};

const ReplayGallery: React.FC = () => {
  const { unlockedFragments } = useGameState();

  if (!unlockedFragments || unlockedFragments.length === 0) {
    return <div className={styles["replay-gallery"]}>No fragments unlocked yet.</div>;
  }

  return (
    <div className={styles["replay-gallery"]}>
      <h2>Your Echoes</h2>
      <div className={styles["fragment-grid"]}>
        {unlockedFragments.map((tag) => {
          const data = FRAGMENT_DATA[tag];
          if (!data) return null;

          return (
            <div key={tag} className={styles["fragment-card"]}>
              <img
                src={data.imagePath}
                alt={`Fragment ${tag}`}
                className={styles["fragment-image"]}
              />
              <p className={styles["fragment-label"]}>
                {tag.replace(/_/g, " ")}
              </p>
              {data.audioPrompt && (
                <AudioPlayer
                  voicePrompt={{
                    prompt: data.audioPrompt,
                    voice: "internal",
                    style: "whisper"
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ReplayGallery;
