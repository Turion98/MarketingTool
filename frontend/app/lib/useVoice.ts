// lib/useVoice.ts
import { useCallback, useState } from "react";

export interface VoiceRequest {
  pageId: string;
  promptOverride?: string;
  voice?: string;
  style?: string;
  format?: string; // mp3 / wav / ogg
  reuseExisting?: boolean;
}

export interface VoiceResponse {
  ok: boolean;
  url?: string;          // a backend által visszaadott URL (relatív vagy abszolút is lehet)
  durationMs?: number;
  cached?: boolean;      // lokális (LS) cache találat
  backend?: string;      // diagnosztika
  message?: string;
  error?: string;
}

const VOICE_DISABLED_MESSAGE = "Generated voice is disabled.";

export function useVoice() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<VoiceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generateVoice = useCallback(async (req: VoiceRequest) => {
    void req;
    setLoading(false);
    const out: VoiceResponse = {
      ok: false,
      backend: "disabled",
      error: VOICE_DISABLED_MESSAGE,
      message: VOICE_DISABLED_MESSAGE,
    };
    setData(out);
    setError(out.error);
    return out;
  }, []);

  return { loading, data, error, generateVoice };
}
