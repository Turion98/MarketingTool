"use client";
import React, { createContext, useContext, useMemo, useState, useEffect } from "react";
import { getAuth, type AuthAPI, type AuthUser } from "./client";

type Ctx = {
  ready: boolean;
  user: AuthUser | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  getToken: () => Promise<string | null>;
};
const AuthCtx = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const api = useMemo<AuthAPI>(() => getAuth(), []);
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => { setUser(api.user()); setReady(true); }, [api]);

  const value: Ctx = {
    ready,
    user,
    login: async () => { await api.login(); setUser(api.user()); },
    logout: async () => { await api.logout(); setUser(null); },
    getToken: () => api.getToken(),
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
