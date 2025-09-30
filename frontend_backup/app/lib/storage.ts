// Image API key lekérése localStorage-ból
export function getImageApiKey(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("imageApiKey");
}

// Image API key mentése localStorage-ba
export function setImageApiKey(key: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem("imageApiKey", key);
}

// Voice API key lekérése localStorage-ból
export function getVoiceApiKey(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("voiceApiKey");
}

// Voice API key mentése localStorage-ba
export function setVoiceApiKey(key: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem("voiceApiKey", key);
}

// API kulcsok törlése (mindkettő)
export function clearApiKeys() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("imageApiKey");
  localStorage.removeItem("voiceApiKey");
}
