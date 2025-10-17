"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useGameState } from "../../lib/GameStateContext";
import ParallaxBackground from "../ParallaxBackground/ParallaxBackground";
import ErrorOverlay from "../ErrorOverlay/ErrorOverlay";
import { layers } from "../LayersConfig";
import styles from "./LandingPage.module.scss";
import UploadStoryForm from "../UploadStoryForm/UploadStoryForm";
import UploadStoryPanel from "../UploadStoryPanel";

const LandingPage: React.FC = () => {
  const {
    voiceApiKey,
    setVoiceApiKey,
    imageApiKey,
    setImageApiKey,
    setGlobalError,
    setCurrentPageId,
    setGlobal,
  } = useGameState();

  const [loading, setLoading] = useState(false);
  const [apiReady, setApiReady] = useState(false);
  const [validating, setValidating] = useState(false);

  const router = useRouter();

  /** 🔧 Ütközést okozó lokál kulcsok célzott törlése új kampány indítása előtt */
  const resetStoryState = (hard = false) => {
    try {
      if (hard) {
        // Teszt mód: mindent törlünk (API kulcsokat külön ezután állítjuk)
        localStorage.clear();
        return;
      }
      // Célzott reset – csak a játékmenet/memória:
      [
        "currentPageId",
        "globalsStore",
        "flagsStore",
        "unlockedFragments",
        "fragmentsStore",
        "fragmentsGlobal",
        "runeImagesByFlag",
        "storyMetaCache",
      ].forEach((k) => localStorage.removeItem(k));
    } catch {}
  };

  const saveApiKeysToLocal = () => {
    if (voiceApiKey) localStorage.setItem("voiceApiKey", voiceApiKey);
    if (imageApiKey) localStorage.setItem("imageApiKey", imageApiKey);
  };

  const goToFirstPage = async () => {
    const defaultSrc = "/stories/global.json"; // ⬅️ a fő JSON-od
    const firstPageId = "ch1_pg1";
    const title = "Main Campaign";

    // ✅ mindig tiszta állapotból induljunk
    resetStoryState(false);

    try {
      localStorage.setItem("storySrc", defaultSrc);
      localStorage.setItem("storyTitle", title);
      localStorage.setItem("currentPageId", firstPageId);
    } catch {}

    setGlobal?.("storySrc", defaultSrc);
    setGlobal?.("storyTitle", title);
    setCurrentPageId?.(firstPageId);

    router.push(
      `/story?src=${encodeURIComponent(defaultSrc)}&start=${encodeURIComponent(
        firstPageId
      )}&title=${encodeURIComponent(title)}`
    );
  };

  const handleStart = async () => {
    if (!apiReady) {
      setGlobalError("Érvénytelen vagy hiányzó API kulcs(ok).");
      return;
    }
    setLoading(true);
    saveApiKeysToLocal();
    await goToFirstPage();
  };

  const handleTestMode = async () => {
    // 🔥 teljes reset – elkerüli a duplaforrás ütközést
    resetStoryState(true);
    // Teszt mód: API kulcsok üresen
    localStorage.setItem("voiceApiKey", "");
    localStorage.setItem("imageApiKey", "");
    await goToFirstPage();
  };

  const API_BASE =
    process.env.NEXT_PUBLIC_API_BASE?.replace(/\/+$/, "") ||
    "http://127.0.0.1:8000";

  // Kulcsok validálása
  const validateKeys = async () => {
    if (!voiceApiKey || !imageApiKey) {
      setApiReady(false);
      return;
    }
    setValidating(true);
    try {
      const resVoice = await fetch("/api/testVoice", {
        method: "POST",
        headers: { Authorization: `Bearer ${voiceApiKey}` },
      });
      const resImage = await fetch("/api/testImage", {
        method: "POST",
        headers: { Authorization: `Bearer ${imageApiKey}` },
      });

      if (resVoice.ok && resImage.ok) {
        setApiReady(true);
        setGlobalError(null);
      } else {
        setApiReady(false);
        setGlobalError("Az egyik API kulcs hibás.");
      }
    } catch (err) {
      setApiReady(false);
      setGlobalError("Nem sikerült kapcsolódni az API-hoz.");
    } finally {
      setValidating(false);
    }
  };

  useEffect(() => {
    validateKeys();
  }, [voiceApiKey, imageApiKey]);

  return (
    <>
      <ErrorOverlay />
      <div className={styles.landingContainer}>
        <ParallaxBackground layers={layers} />

        {/* LOGO */}
        <div className={styles.logoBlock}>
          <img src="/logo.png" alt="Game Logo" className={styles.logoImage} />
        </div>

        {/* DESCRIPTION */}
        <div className={styles.descriptionBlock}>
          <p className="text-zoomable">
            Lépj be egy posztapokaliptikus világba, ahol a torony titka vár
            felfedezésre. Döntéseid befolyásolják az utad, és minden választás
            nyomot hagy a történetedben.
          </p>
        </div>

        {/* API KEYS */}
        <div className={styles.apiKeyVoice}>
          <label>Voice API kulcs:</label>
          <input
            type="text"
            placeholder="Írd ide a Voice API kulcsot..."
            value={voiceApiKey || ""}
            onChange={(e) => setVoiceApiKey?.(e.target.value)}
          />
        </div>
        <div className={styles.apiKeyImage}>
          <label>Image API kulcs:</label>
          <input
            type="text"
            placeholder="Írd ide az Image API kulcsot..."
            value={imageApiKey || ""}
            onChange={(e) => setImageApiKey?.(e.target.value)}
          />
        </div>

        {/* VALIDATION MESSAGES */}
        {!apiReady && (voiceApiKey || imageApiKey) && !validating && (
          <p className={styles.errorMessage}>
            A megadott API kulcsok érvénytelenek vagy hibásak.
          </p>
        )}
        {validating && (
          <p className={styles.validatingMessage}>Kulcsok ellenőrzése...</p>
        )}

        {/* BUTTONS */}
        <button
          className={`${styles.startButton} globalStartButton`}
          onClick={handleStart}
          disabled={
            !apiReady ||
            validating ||
            loading ||
            !voiceApiKey?.trim() ||
            !imageApiKey?.trim()
          }
        >
          {loading ? "Indítás..." : "Enter the Tower"}
        </button>

        <button className={styles.testButton} onClick={handleTestMode}>
          Teszt mód (API nélkül)
        </button>

        <button
          className={styles.adventuresButton}
          onClick={() => router.push("/adventures")}
        >
          Adventures
        </button>

        <UploadStoryPanel />
      </div>
    </>
  );
};

export default LandingPage;
