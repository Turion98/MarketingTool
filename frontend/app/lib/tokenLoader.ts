export async function loadTokens(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Token load failed: ${res.status}`);
  const data = await res.json();
  const tokens = data?.tokens || {};
  const root = document.documentElement;
  Object.entries(tokens).forEach(([k, v]) => {
    root.style.setProperty(k, String(v));
  });
  console.info("[TokenLoader] applied", Object.keys(tokens).length, "vars from", url);
}

export function applyTokensInline(tokens: Record<string, string>) {
  const root = document.documentElement;
  Object.entries(tokens).forEach(([k, v]) => root.style.setProperty(k, String(v)));
}
