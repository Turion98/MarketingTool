"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useGameState } from "../../lib/GameStateContext";

type Props = {
  apiBase?: string;   // ha nem adod meg, NEXT_PUBLIC_API_BASE vagy http://127.0.0.1:8000
  className?: string; // extra osztály, ha kell
};

/**
 * Bárhol elérhető, fix pozíciós admin belépő:
 * - Alt + A: panel megjelenítése/elrejtése
 * - Admin státusz: localStorage.adminMode === "true" && sessionStorage.adminKey
 * - Sikeres login után: adminMode=true, sessionStorage.adminKey=...
 */
const AdminQuickPanel: React.FC<Props> = ({ apiBase, className }) => {
  const API_BASE =
    (apiBase || process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000").replace(/\/+$/, "");

  const [visible, setVisible] = useState(false);
  const [adminOk, setAdminOk] = useState(false);
  const [user, setUser] = useState("admin");
  const [pass, setPass] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const { setGlobal } = (useGameState() as any) ?? {};

  // --- helpers
  const markOn = useCallback(
    (key: string) => {
      try {
        localStorage.setItem("adminMode", "true");
        sessionStorage.setItem("adminKey", key);
        // ⬇️ jelezd minden komponensnek, hogy admin ON
        window.dispatchEvent(
          new CustomEvent("qzera:admin-change", { detail: { isAdmin: true } })
        );
      } catch {}
      try {
        setGlobal?.("isAdmin", true);
      } catch {}
      setAdminOk(true);
      setMsg("Belépve: admin mód aktív.");
    },
    [setGlobal]
  );

  const markOff = useCallback(
    () => {
      try {
        localStorage.removeItem("adminMode");
        sessionStorage.removeItem("adminKey");
        // ⬇️ jelezd minden komponensnek, hogy admin OFF
        window.dispatchEvent(
          new CustomEvent("qzera:admin-change", { detail: { isAdmin: false } })
        );
      } catch {}
      try {
        setGlobal?.("isAdmin", false);
      } catch {}
      setAdminOk(false);
      setMsg("Kiléptél az admin módból.");
    },
    [setGlobal]
  );

  const checkExisting = useCallback(() => {
    try {
      const was = localStorage.getItem("adminMode") === "true";
      const k = sessionStorage.getItem("adminKey") || "";
      if (!was || !k) {
        setAdminOk(false);
        try {
          setGlobal?.("isAdmin", false);
        } catch {}
        return;
      }

      fetch(`${API_BASE}/admin/ping`, { headers: { "x-admin-key": k } })
        .then((r) => {
          if (r.ok) {
            // kulcs jó → erősítsük meg az állapotot
            markOn(k);
          } else if (r.status === 401 || r.status === 403) {
            // tényleges hitelesítési hiba → dobjuk el az admin módot
            markOff();
          } else {
            // egyéb hiba (500, 404 stb.) → ne rúgjuk ki a usert, csak log
            console.warn("[AdminQuickPanel] /admin/ping error status:", r.status);
            setAdminOk(true);
            try {
              setGlobal?.("isAdmin", true);
            } catch {}
            window.dispatchEvent(
              new CustomEvent("qzera:admin-change", { detail: { isAdmin: true } })
            );
          }
        })
        .catch((err) => {
          // hálózati hiba → dev módban ne dobjuk le az admint, csak figyelmeztetés
          console.warn("[AdminQuickPanel] /admin/ping network error:", err);
          setAdminOk(true);
          try {
            setGlobal?.("isAdmin", true);
          } catch {}
          window.dispatchEvent(
            new CustomEvent("qzera:admin-change", { detail: { isAdmin: true } })
          );
        });
    } catch {
      setAdminOk(false);
      try {
        setGlobal?.("isAdmin", false);
      } catch {}
    }
  }, [API_BASE, markOn, markOff, setGlobal]);

  // --- hotkey Alt+A: panel toggle, Ctrl+Alt+R: vész reset
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === "a" || e.key === "A")) {
        setVisible((v) => !v);
      }
      if (e.ctrlKey && e.altKey && (e.key === "r" || e.key === "R")) {
        try {
          localStorage.clear();
          sessionStorage.clear();
        } catch {}
        window.location.href = "/?admin=1";
      }
    };
    window.addEventListener("keydown", onKey as any);
    return () => window.removeEventListener("keydown", onKey as any);
  }, []);

  // --- initial check + ha ?admin=1 a url-ben, nyissuk meg egyszer a panelt
  useEffect(() => {
    checkExisting();
    try {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get("admin") === "1") setVisible(true);
    } catch {}
  }, [checkExisting]);

  const handleLogin = async () => {
    setMsg(null);
    if ((user || "").trim().toLowerCase() !== "admin") {
      setMsg("Hibás felhasználónév.");
      return;
    }
    const key = (pass || "").trim();
    if (!key) {
      setMsg("Írd be a jelszót.");
      return;
    }
    try {
      const r = await fetch(`${API_BASE}/admin/ping`, {
        headers: { "x-admin-key": key },
      });
      if (!r.ok) {
        setMsg("Sikertelen hitelesítés.");
        setAdminOk(false);
        try {
          setGlobal?.("isAdmin", false);
        } catch {}
        window.dispatchEvent(
          new CustomEvent("qzera:admin-change", { detail: { isAdmin: false } })
        );
        return;
      }
      markOn(key);
    } catch {
      setMsg("Nem érem el a backend /admin/ping végpontot.");
    }
  };

  // --- rövid admin jelző gomb (fix bal-alsó)
  return (
    <>
      <button
        type="button"
        onClick={() => setVisible(true)}
        aria-label={adminOk ? "Admin: aktív" : "Admin: belépés"}
        title={adminOk ? "Admin mód aktív (Alt+A)" : "Admin login (Alt+A)"}
        style={{
          position: "fixed",
          left: 14,
          bottom: 14,
          zIndex: 5000,
          padding: "8px 12px",
          borderRadius: 8,
          border: "1px solid rgba(242,184,91,.55)",
          background: "rgba(31,58,62,.65)",
          color: "#f2b85b",
          fontFamily: "var(--font-cormorant), serif",
          cursor: "pointer",
          backdropFilter: "blur(6px)",
        }}
        className={className}
      >
        {adminOk ? "Admin ✓" : "Admin"}
      </button>

      {visible && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setVisible(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.45)",
            zIndex: 5001,
            display: "grid",
            placeItems: "center",
          }}
        >
          <div
            style={{
              width: 380,
              maxWidth: "90vw",
              background: "rgba(15,20,20,.82)",
              border: "1px solid rgba(242,184,91,.45)",
              borderRadius: 12,
              padding: "1.6rem 1.8rem",
              color: "#f2b85b",
              fontFamily: "var(--font-cormorant), serif",
              boxShadow: "0 0 24px rgba(242,184,91,.2)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 12,
              }}
            >
              <strong style={{ fontSize: "1.3rem" }}>Admin login</strong>
              <span
                style={{
                  fontSize: ".85rem",
                  padding: "2px 10px",
                  borderRadius: 6,
                  border: adminOk
                    ? "1px solid rgba(91,242,155,.4)"
                    : "1px solid rgba(242,184,91,.4)",
                  background: adminOk
                    ? "rgba(91,242,155,.2)"
                    : "rgba(242,184,91,.2)",
                  color: adminOk ? "#6ef59c" : "#f2b85b",
                }}
              >
                {adminOk ? "Active" : "Locked"}
              </span>
            </div>

            <label style={{ display: "block", marginBottom: 6 }}>
              Felhasználónév
            </label>
            <input
              value={user}
              onChange={(e) => setUser(e.target.value)}
              placeholder="admin"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 6,
                border: "1px solid rgba(255,255,255,.25)",
                background: "rgba(255,255,255,.08)",
                color: "#fff",
                marginBottom: 10,
              }}
            />

            <label style={{ display: "block", marginBottom: 6 }}>Jelszó</label>
            <input
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              placeholder="••••••••"
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 6,
                border: "1px solid rgba(255,255,255,.25)",
                background: "rgba(255,255,255,.08)",
                color: "#fff",
                marginBottom: 10,
              }}
            />

            {msg && (
              <p style={{ minHeight: 22, margin: "4px 0 10px" }}>{msg}</p>
            )}

            <div
              style={{
                display: "flex",
                gap: 8,
                justifyContent: "space-between",
              }}
            >
              <button
                onClick={handleLogin}
                style={{
                  flex: 1,
                  padding: "8px 10px",
                  borderRadius: 6,
                  cursor: "pointer",
                  border: "1px solid rgba(242,184,91,.5)",
                  background: "rgba(31,58,62,.6)",
                  color: "#f2b85b",
                }}
              >
                Belépés
              </button>
              <button
                onClick={markOff}
                style={{
                  flex: 1,
                  padding: "8px 10px",
                  borderRadius: 6,
                  cursor: "pointer",
                  border: "1px solid rgba(255,255,255,.25)",
                  background: "rgba(255,255,255,.05)",
                  color: "#ccc",
                }}
              >
                Kilépés
              </button>
              <button
                onClick={() => setVisible(false)}
                style={{
                  padding: "8px 10px",
                  borderRadius: 6,
                  cursor: "pointer",
                  border: "1px solid rgba(255,255,255,.25)",
                  background: "rgba(255,255,255,.05)",
                  color: "#ccc",
                }}
              >
                Bezár
              </button>
            </div>

            <p
              style={{
                marginTop: 10,
                fontSize: ".9rem",
                color: "rgba(255,255,255,.75)",
              }}
            >
              Tipp: <kbd>Alt</kbd>+<kbd>A</kbd> panel nyit/zár.{" "}
              <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>R</kbd> vész-reset.
            </p>
          </div>
        </div>
      )}
    </>
  );
};

export default AdminQuickPanel;
