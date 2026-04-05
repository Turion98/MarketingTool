"use client";

import { useEffect, useState } from "react";
import { isEmbedParentResizeMessage } from "./embedParentMessaging";

/**
 * Beágyazott player (ghost embed) → szülő: iframe magasság postMessage alapján.
 * Csak a megadott origin + adventure-embed resize forma (a kezdőlapon egy külső player iframe van).
 */
export function useEmbedParentIframeHeight(
  playerOrigin: string,
  initialPx = 120
): number {
  const [height, setHeight] = useState(initialPx);

  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      if (ev.origin !== playerOrigin) return;
      if (!isEmbedParentResizeMessage(ev.data)) return;
      setHeight(Math.max(0, Math.ceil(ev.data.height) + 2));
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [playerOrigin]);

  return height;
}
