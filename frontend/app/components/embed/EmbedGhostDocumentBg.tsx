"use client";

import { useLayoutEffect } from "react";

type Props = {
  /** URL `gmax`: iframe magasság korlát — html 100%, belső görgetés */
  cappedHeight?: boolean;
};

/**
 * Ghost embed: html/body háttér átlátszó, vízszintes túlcsordulás off, rejtett görgetősáv ha kell.
 */
export default function EmbedGhostDocumentBg({
  cappedHeight = false,
}: Props) {
  useLayoutEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlBg = html.style.backgroundColor;
    const prevBodyBg = body.style.backgroundColor;
    const prevHtmlH = html.style.height;
    const prevBodyH = body.style.height;
    const prevHtmlOx = html.style.overflowX;
    const prevHtmlOy = html.style.overflowY;

    html.style.backgroundColor = "transparent";
    body.style.backgroundColor = "transparent";
    html.setAttribute("data-questell-ghost", "");
    html.style.overflowX = "hidden";
    html.style.overflowY = "auto";

    if (cappedHeight) {
      html.setAttribute("data-questell-ghost-capped", "");
      html.style.height = "100%";
      body.style.minHeight = "100%";
    }

    return () => {
      html.style.backgroundColor = prevHtmlBg;
      body.style.backgroundColor = prevBodyBg;
      html.style.height = prevHtmlH;
      body.style.minHeight = "";
      html.style.overflowX = prevHtmlOx;
      html.style.overflowY = prevHtmlOy;
      html.removeAttribute("data-questell-ghost");
      html.removeAttribute("data-questell-ghost-capped");
    };
  }, [cappedHeight]);

  return null;
}
