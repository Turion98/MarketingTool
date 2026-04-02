/**
 * postMessage protokoll: beágyazott player → szülő (embed.js).
 * Az embed.js-ben ugyanezek a literálok szerepeljenek (build nélküli statikus fájl).
 */
export const EMBED_PARENT_MSG_SOURCE = "adventure-embed" as const;
export const EMBED_PARENT_MSG_VERSION = 1 as const;

export type EmbedParentResizeMessage = {
  source: typeof EMBED_PARENT_MSG_SOURCE;
  v: typeof EMBED_PARENT_MSG_VERSION;
  type: "resize";
  height: number;
};

export function isEmbedParentResizeMessage(data: unknown): data is EmbedParentResizeMessage {
  if (!data || typeof data !== "object") return false;
  const o = data as Record<string, unknown>;
  return (
    o.source === EMBED_PARENT_MSG_SOURCE &&
    o.v === EMBED_PARENT_MSG_VERSION &&
    o.type === "resize" &&
    typeof o.height === "number" &&
    Number.isFinite(o.height) &&
    o.height >= 0
  );
}
