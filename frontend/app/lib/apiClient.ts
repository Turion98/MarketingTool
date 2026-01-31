const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE ??
  (process.env.NODE_ENV === "development"
    ? "http://127.0.0.1:8000"
    : "https://api.thequestell.com");


// --- IMAGE ---
export async function generateImage(
  pageId: string,
  prompt: string,
  seed: number | null = null
): Promise<string> {
  try {
    const response = await fetch(`${API_BASE_URL}/generate_image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pageId,
        prompt,
        params: {},
        styleProfile: {},
        seed,
        promptKey: null,
        cache: true,
        format: "png",
        reuseExisting: true,
        mode: "draft"
      })
    });

    const data = await response.json();

    if (data.status !== "ok" && data.status !== "mock") {
      throw new Error(`Image API error: ${JSON.stringify(data)}`);
    }

    return data.path.startsWith("http")
      ? data.path
      : `${API_BASE_URL}${data.path}`;
  } catch (err) {
    console.error("Image API error", err);
    throw err;
  }
}

// --- VOICE ---
export async function generateVoice(
  pageId: string,
  prompt: string,
  apiKey: string,
  voice: string = "default",
  style: string = "default"
): Promise<string> {
  try {
    const response = await fetch(`${API_BASE_URL}/generate_voice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pageId,
        apiKey: apiKey || undefined,
        promptOverride: prompt,
        voice,
        style,
        format: "mp3",
        reuseExisting: true
      })
    });

    const data = await response.json();

    // ✅ Mock fallback, ha nincs voice backend vagy nincs URL
    if (!data.ok || !data.url) {
      console.warn("Voice API fallback → mock_voice.mp3");
      return `${API_BASE_URL}/assets/mock_voice.mp3`;
    }

    return data.url.startsWith("http")
      ? data.url
      : `${API_BASE_URL}${data.url}`;
  } catch (err) {
    console.error("Voice API error, fallback → mock_voice.mp3", err);
    return `${API_BASE_URL}/assets/mock_voice.mp3`;
  }
}
