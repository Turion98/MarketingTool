import { useEffect } from "react";

type Sfx = {
  file: string;
  time: number;
};

type Options = {
  onStart?: () => void;
  onMidpoint?: () => void;
  onEnd?: () => void;
};

export const useAudioWithEvents = (
  path: string,
  sfx: Sfx[] = [],
  { onStart, onMidpoint, onEnd }: Options = {}
) => {
  useEffect(() => {
    const audio = new Audio(path);
    const midpoint = () => {
      if (onMidpoint) onMidpoint();
    };
    const finish = () => {
      if (onEnd) onEnd();
    };

    audio.addEventListener("play", () => {
      if (onStart) onStart();
      if (audio.duration > 0) {
        setTimeout(midpoint, (audio.duration * 500));
      }
    });
    audio.addEventListener("ended", finish);

    audio.play().catch(() => {});
    return () => {
      audio.pause();
      audio.removeEventListener("ended", finish);
    };
  }, [path]);
};
