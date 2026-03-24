"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useEffect,
} from "react";
import {
  getAuth,
  type AuthAPI,
  type AuthUser,
  type LoginCredentials,
} from "./client";
import {
  canAccessPaidFeatures,
  isAdminTier,
  tierLabelHu,
  type AccountTier,
} from "./tier";

type Ctx = {
  ready: boolean;
  user: AuthUser | null;
  /** Bejelentkezett user szintje; null ha nincs user */
  accountTier: AccountTier | null;
  tierLabel: string | null;
  canUsePaidFeatures: boolean;
  isAdmin: boolean;
  login: (creds?: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  getToken: () => Promise<string | null>;
};

const AuthCtx = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const api = useMemo<AuthAPI>(() => getAuth(), []);
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    setUser(api.user());
    setReady(true);
  }, [api]);

  const login = useCallback(
    async (creds?: LoginCredentials) => {
      await api.login(creds);
      setUser(api.user());
    },
    [api]
  );

  const logout = useCallback(async () => {
    await api.logout();
    setUser(api.user());
  }, [api]);

  const tier = user?.tier ?? null;
  const value: Ctx = {
    ready,
    user,
    accountTier: tier,
    tierLabel: tier ? tierLabelHu(tier) : null,
    canUsePaidFeatures: tier ? canAccessPaidFeatures(tier) : false,
    isAdmin: tier ? isAdminTier(tier) : false,
    login,
    logout,
    getToken: () => api.getToken(),
  };

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
