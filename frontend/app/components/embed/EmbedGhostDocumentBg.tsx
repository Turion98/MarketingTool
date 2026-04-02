"use client";

import { useLayoutEffect } from "react";

/**
 * Ghost embed: html/body háttér átlátszó, hogy a host oldal látszódjon az iframe mögött.
 */
export default function EmbedGhostDocumentBg() {
  useLayoutEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.backgroundColor;
    const prevBody = body.style.backgroundColor;
    html.style.backgroundColor = "transparent";
    body.style.backgroundColor = "transparent";
    return () => {
      html.style.backgroundColor = prevHtml;
      body.style.backgroundColor = prevBody;
    };
  }, []);
  return null;
}
