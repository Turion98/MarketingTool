import React, { useEffect, useState } from "react";
import LoadingScreen from "../components/LoadingScreen/LoadingScreen";
import TypingText from "../components/TypingText/TypingText";
import AudioPlayer from "../components/AudioPlayer";
import GeneratedImage_with_fadein from "../components/GeneratedImage/GeneratedImage";
import ChoiceButtons from "../components/ChoiceButtons/ChoiceButtons";

type Choice = {
  text: string;
  next: string;
  lockedIf?: string[];
  reward?: any;
  style?: any;
};

type Props = {
  pageId: string;
  textLines: string[];
  audioPath: string;
  sfx?: { file: string; time: number }[];
  imageEnabled?: boolean;
  imageDelayMs?: number;
  choices: Choice[];
};

const PageTransitionManager: React.FC<Props> = ({
  pageId,
  textLines,
  audioPath,
  sfx = [],
  imageEnabled = true,
  imageDelayMs = 6000,
  choices
}) => {
  const [phase, setPhase] = useState<
    "fadingOut" | "loading" | "fadingIn" | "typing" | "audio" | "image" | "choice"
  >("fadingOut");
  const [fadeIn, setFadeIn] = useState(false);

  useEffect(() => {
    setFadeIn(false);
    const fadeTimer = setTimeout(() => setFadeIn(true), 50);

    // Szekvenciális fázisok
    setTimeout(() => setPhase("loading"), 800);
    setTimeout(() => setPhase("fadingIn"), 1800);
    setTimeout(() => setPhase("typing"), 2500);
    setTimeout(() => setPhase("audio"), 3500);
    setTimeout(() => setPhase("image"), imageDelayMs);
    setTimeout(() => setPhase("choice"), imageDelayMs + 3000);

    return () => clearTimeout(fadeTimer);
  }, [pageId, imageDelayMs]);

  if (phase === "fadingOut" || phase === "loading") {
    return <LoadingScreen />;
  }

  return (
    <div
      className="story-page"
      style={{
        opacity: fadeIn ? 1 : 0,
        transition: "opacity 0.8s ease-in-out"
      }}
    >
      {phase === "typing" && <TypingText lines={textLines} />}
      {phase === "audio" && (
        <AudioPlayer pageId={pageId} audioPath={audioPath} sfx={sfx} />
      )}
      {phase === "image" && imageEnabled && (
        <GeneratedImage_with_fadein pageId={pageId} />
      )}
      {phase === "choice" && (
        <ChoiceButtons
          choices={choices}
          onChoiceSelected={(next) => (window.location.href = `/${next}`)}
        />
      )}
    </div>
  );
};

export default PageTransitionManager;
