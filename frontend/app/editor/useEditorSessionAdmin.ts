"use client";

import { useCallback, useEffect, useState } from "react";
import { useGameState } from "@/app/lib/GameStateContext";

function readBrowserAdminSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      localStorage.getItem("adminMode") === "true" &&
      !!sessionStorage.getItem("adminKey")
    );
  } catch {
    return false;
  }
}

/**
 * Landing / AdminQuickPanel admin belépés (adminMode + adminKey) és a perzisztált
 * globals.isAdmin — a szerkesztő sztori-listájában ugyanaz a „teljes lista” jog,
 * mint a fiók admin tier-nek (NEXT_PUBLIC_DEV_ADMIN_EMAILS).
 */
export function useEditorSessionAdmin(): boolean {
  const { globals } = useGameState();
  const [browserAdmin, setBrowserAdmin] = useState(() =>
    readBrowserAdminSession()
  );

  const syncBrowser = useCallback(() => {
    setBrowserAdmin(readBrowserAdminSession());
  }, []);

  useEffect(() => {
    syncBrowser();
    window.addEventListener("qzera:admin-change", syncBrowser);
    return () => window.removeEventListener("qzera:admin-change", syncBrowser);
  }, [syncBrowser]);

  return globals.isAdmin === true || browserAdmin;
}
