"use client";

import { useEffect, useRef, type RefObject } from "react";
import {
  EMBED_PARENT_MSG_SOURCE,
  EMBED_PARENT_MSG_VERSION,
  type EmbedParentResizeMessage,
} from "@/app/lib/embedParentMessaging";

/**
 * Küldi a dokumentum gyökér magasságát a szülőnek (embed.js), hogy az iframe auto-resize-oljon.
 * @param resubscribeKey változzon, ha a mérendő root más DOM csomópontra kerül (pl. loading → runtime).
 */
export function useEmbedParentResize(
  rootRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  resubscribeKey?: string | number
): void {
  const lastHRef = useRef<number>(-1);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;
    if (window.parent === window) return;

    const post = (height: number) => {
      const h = Math.max(0, Math.ceil(height));
      if (h === lastHRef.current) return;
      lastHRef.current = h;
      const msg: EmbedParentResizeMessage = {
        source: EMBED_PARENT_MSG_SOURCE,
        v: EMBED_PARENT_MSG_VERSION,
        type: "resize",
        height: h,
      };
      try {
        window.parent.postMessage(msg, "*");
      } catch {
        /* ignore */
      }
    };

    const measure = () => {
      const el = rootRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const sh = el.scrollHeight;
      post(Math.max(rect.height, sh));
    };

    const schedule = () => {
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        measure();
      });
    };

    schedule();
    const ro = new ResizeObserver(() => schedule());
    const el = rootRef.current;
    if (el) ro.observe(el);

    window.addEventListener("resize", schedule, { passive: true });

    const id = window.setInterval(schedule, 400);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", schedule);
      window.clearInterval(id);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [enabled, rootRef, resubscribeKey]);
}
