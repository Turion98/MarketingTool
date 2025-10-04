"use client";
import React, { createContext, useContext, useMemo, useState, useCallback } from "react";

export type ActionItem = {
  id: string;
  label: string;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
};

type Ctx = {
  actions: ActionItem[];
  setActions: (next: ActionItem[]) => void;
  clearActions: () => void;
};

const ActionBarContext = createContext<Ctx | null>(null);

export function ActionBarProvider({ children }: { children: React.ReactNode }) {
  const [actions, _setActions] = useState<ActionItem[]>([]);
  const setActions = useCallback((next: ActionItem[]) => _setActions(next), []);
  const clearActions = useCallback(() => _setActions([]), []);
  const value = useMemo(() => ({ actions, setActions, clearActions }), [actions, setActions, clearActions]);
  return <ActionBarContext.Provider value={value}>{children}</ActionBarContext.Provider>;
}

export function useActionBar() {
  const ctx = useContext(ActionBarContext);
  if (!ctx) throw new Error("useActionBar must be used within <ActionBarProvider>");
  return ctx;
}
