"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";

// 🔹 Típusdefiníció a stílusprofilhoz
export type StyleProfile = {
  resolution: string;     // pl. "1024x1024"
  style: string;          // pl. "dark fantasy"
  quality: string;        // pl. "high", "ultra"
  lighting: string;       // pl. "dramatic", "soft"
  postEffects?: string[]; // pl. ["vignette", "film grain"]
};

type StyleProfileContextType = {
  styleProfile: StyleProfile;
  setStyleProfile: (profile: StyleProfile) => void;
};

// 🔹 Default értékek
const defaultStyleProfile: StyleProfile = {
  resolution: "1024x1024",
  style: "dark fantasy, cinematic, detailed textures",
  quality: "ultra",
  lighting: "dramatic",
  postEffects: ["vignette", "film grain"]
};

const StyleProfileContext = createContext<StyleProfileContextType>({
  styleProfile: defaultStyleProfile,
  setStyleProfile: () => {}
});

export const StyleProfileProvider = ({ children }: { children: ReactNode }) => {
  const [styleProfile, setStyleProfile] = useState<StyleProfile>(defaultStyleProfile);

  return (
    <StyleProfileContext.Provider value={{ styleProfile, setStyleProfile }}>
      {children}
    </StyleProfileContext.Provider>
  );
};

// 🔹 Hook a context használatához
export const useStyleProfile = () => useContext(StyleProfileContext);
