"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useGameState } from "../../lib/GameStateContext";
import ParallaxBackground from "../ParallaxBackground/ParallaxBackground";
import ErrorOverlay from "../ErrorOverlay/ErrorOverlay";
import { layers } from "../LayersConfig";
import styles from "./LandingPage.module.scss";
import UploadStoryPanel from "../UploadStoryPanel";
import { clearSkinCache } from "../../lib/utils/skinCacheDebug";


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

  // ------- ADMIN UI state -------
  const [adminVisible, setAdminVisible] = useState(false);
  const [adminUser, setAdminUser] = useState("admin");
  const [adminPass, setAdminPass] = useState("");
  const [adminMsg, setAdminMsg] = useState<string | null>(null);
  const [adminOk, setAdminOk] = useState(false);

  const router = useRouter();

  /** 🔧 API BASE a FastAPI-hoz */
  const API_BASE =
    process.env.NEXT_PUBLIC_API_BASE?.replace(/\/+$/, "") ||
    "http://127.0.0.1:8000";

  // ------- Admin: persist helpers -------
  const persistAdminOn = useCallback(
    (key: string) => {
      try {
        localStorage.setItem("adminMode", "true");
        sessionStorage.setItem("adminKey", key);
      } catch {}
      setGlobal?.("isAdmin", true);
      setAdminOk(true);
    },
    [setGlobal]
  );

  const persistAdminOff = useCallback(() => {
    try {
      localStorage.removeItem("adminMode");
      sessionStorage.removeItem("adminKey");
    } catch {}
    setGlobal?.("isAdmin", false);
    setAdminOk(false);
  }, [setGlobal]);

  // ------- Admin: visibility rules -------
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const q = sp.get("admin");
      const was = localStorage.getItem("adminMode") === "true";
      setAdminVisible(q === "1" || was);
      if (was) {
        const k = sessionStorage.getItem("adminKey") || "";
        if (k) {
          // próbáljuk validálni csöndben
          fetch(`${API_BASE}/api/admin/ping`, { headers: { "x-admin-key": k } })
            .then((r) => {
              if (r.ok) {
                persistAdminOn(k);
                setAdminMsg(null);
              } else {
                persistAdminOff();
              }
            })
            .catch(() => persistAdminOff());
        }
      }
    } catch {
      /* no-op */
    }
  }, [API_BASE, persistAdminOn, persistAdminOff]);

  // ------- Admin: hotkey Alt+A -------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === "a" || e.key === "A")) {
        setAdminVisible((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleAdminLogin = useCallback(async () => {
    setAdminMsg(null);
    if ((adminUser || "").trim().toLowerCase() !== "admin") {
      setAdminMsg("Hibás felhasználónév.");
      return;
    }
    const key = (adminPass || "").trim();
    if (!key) {
      setAdminMsg("Írd be a jelszót.");
      return;
    }
    try {
      const resp = await fetch(`${API_BASE}/api/admin/ping`, {
        headers: { "x-admin-key": key },
      });
      if (!resp.ok) {
        setAdminMsg("Sikertelen hitelesítés.");
        setAdminOk(false);
        return;
      }
      persistAdminOn(key);
      setAdminMsg("Belépve: admin mód aktív.");
    } catch (e) {
      setAdminMsg("Nem érem el a backend /admin/ping végpontot.");
    }
  }, [API_BASE, adminUser, adminPass, persistAdminOn]);

  const handleAdminLogout = useCallback(() => {
    persistAdminOff();
    setAdminMsg("Kiléptél az admin módból.");
  }, [persistAdminOff]);

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
    const defaultSrc = "/stories/global.json"; // ⬅️ a fő JSON-od (backend eléri)
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
      setGlobalError(
        "Érvénytelen vagy hiányzó API kulcs(ok) vagy a backend nem elérhető."
      );
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

  // ✅ Kulcsok + backend elérhetőség validálása (FastAPI /health)
  const validateKeys = async () => {
    if (!voiceApiKey?.trim() || !imageApiKey?.trim()) {
      setApiReady(false);
      return;
    }
    setValidating(true);
    try {
      const r = await fetch(`${API_BASE}/health`, { cache: "no-store" });
      if (r.ok) {
        setApiReady(true);
        setGlobalError(null);
      } else {
        setApiReady(false);
        setGlobalError(`Backend /health válasz: ${r.status}`);
      }
    } catch (err) {
      setApiReady(false);
      setGlobalError("Nem sikerült kapcsolódni a backendhez (/health).");
    } finally {
      setValidating(false);
    }
  };

  useEffect(() => {
    validateKeys();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceApiKey, imageApiKey, API_BASE]);

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
            A megadott API kulcsok érvénytelenek, vagy a backend nem elérhető.
          </p>
        )}
        {validating && (
          <p className={styles.validatingMessage}>Kulcsok ellenőrzése...</p>
        )}

        {/* BUTTONS */}
        <button
          className={`${styles.startButton} globalStartButton`}
          onClick={handleStart}
          disabled={!apiReady || validating || loading}
        >
          {loading ? "Indítás..." : "Enter the Tower"}
        </button>

        <button
          className={styles.presentButton}
          onClick={() => router.push("/present")}
        >
          Questell prezentáció
        </button>

        <button className={styles.testButton} onClick={handleTestMode}>
          Teszt mód (API nélkül)
        </button>

{process.env.NODE_ENV !== "production" && (
  <button
    className={styles.testerButton}
    onClick={() => {
      const n = clearSkinCache();
      alert(`Skin cache törölve (${n} kulcs). Frissítek...`);
      location.reload();
    }}
    title="mt:v1:skin:* + skinByCampaignId törlése"
  >
    DEV: Clear skin cache
  </button>
)}

        <button
          className={styles.adventuresButton}
          onClick={() => router.push("/adventures")}
        >
          Adventures
        </button>

        <UploadStoryPanel />

        {/* ---------- ADMIN LOGIN (rejtett, Alt+A vagy ?admin=1) ---------- */}
        {adminVisible && (
          <div className={styles.adminCard}>
            <div className={styles.adminHeader}>
              <strong>Admin login</strong>
              {adminOk ? (
                <span className={styles.adminBadgeOk}>Active</span>
              ) : (
                <span className={styles.adminBadge}>Locked</span>
              )}
            </div>
            <div className={styles.adminRow}>
              <label>Felhasználónév</label>
              <input
                type="text"
                value={adminUser}
                onChange={(e) => setAdminUser(e.target.value)}
                placeholder="admin"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
            <div className={styles.adminRow}>
              <label>Jelszó</label>
              <input
                type="password"
                value={adminPass}
                onChange={(e) => setAdminPass(e.target.value)}
                placeholder="••••••••••"
              />
            </div>
            {adminMsg && <p className={styles.adminMsg}>{adminMsg}</p>}
            <div className={styles.adminActions}>
              <button onClick={handleAdminLogin}>Belépés</button>
              <button onClick={handleAdminLogout} className={styles.adminSecondary}>
                Kilépés
              </button>
              <button
                onClick={() => setAdminVisible(false)}
                className={styles.adminSecondary}
                title="Elrejtés (Alt+A)"
              >
                Elrejt
              </button>
            </div>
            <p className={styles.adminHint}>
              Tipp: nyomd meg az <kbd>Alt</kbd> + <kbd>A</kbd> kombinációt, hogy
              megjelenítsd / elrejtsd az admin panelt. A session jelszót csak
              ideiglenesen tároljuk (sessionStorage).
            </p>
          </div>
        )}
      </div>
    </>
  );
};

export default LandingPage;
