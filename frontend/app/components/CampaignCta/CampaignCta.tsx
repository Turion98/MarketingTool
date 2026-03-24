"use client";

import React from "react";
import s from "./CampaignCta.module.scss";
import type { CtaConfig, CtaContext } from "../../core/cta/ctaTypes";
import { dispatchCta } from "../../core/cta/ctaDispatcher";
import { useUiClickSound } from "./../../lib/useUiClickSound";
import { trackCtaShown, trackCtaClick } from "../../lib/analytics";

type Props = { cta: CtaConfig; context: CtaContext; onShown?: () => void };

const isExternal = (url: string) => {
  try {
    const u = new URL(url, window.location.href);
    return u.origin !== window.location.origin;
  } catch {
    // relatív / hibás URL → belsőnek tekintjük
    return false;
  }
};

const openDownload = (
  url: string,
  filename?: string | true,
  rel?: string
) => {
  const a = document.createElement("a");
  a.href = url;
  if (filename === true) a.setAttribute("download", "");
  else if (typeof filename === "string") a.setAttribute("download", filename);
  if (rel) a.setAttribute("rel", rel);
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
};

const CampaignCta: React.FC<Props> = ({ cta, context, onShown }) => {
  // 🔊 CTA megjelenési hang (mountkor)
  const playCtaAppear = useUiClickSound("/sounds/cta.wav");

  // ⛳ analytics context (kampányfüggő pageId oké — csak legyen meg)
  const storyId = context.storyId ?? context.campaignId;
  const sessionId = context.sessionId;
  const pageId = context.pageId ?? context.nodeId;

  // end kötés (ha van)
  const endId = context.endId;
  const endAlias = context.endAlias;

  // StrictMode / rerender dedup
  const shownOnce = React.useRef(false);

  React.useEffect(() => {
    // CTA láthatóvá vált → jelzés + SFX
    onShown?.();
    playCtaAppear();

    // ✅ CTA impression (csak 1x)
    if (shownOnce.current) return;
    shownOnce.current = true;

    if (storyId && sessionId && pageId) {
      try {
        trackCtaShown(storyId, sessionId, pageId, {
          kind: cta.kind,
          label: cta.label ?? "Continue",
          endId,
          endAlias,
        });
      } catch {}
    }
  }, [
    onShown,
    playCtaAppear,
    storyId,
    sessionId,
    pageId,
    endId,
    endAlias,
    cta.kind,
    cta.label,
  ]);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();

    // ✅ CTA click (még a navigáció előtt)
    if (storyId && sessionId && pageId) {
      try {
        trackCtaClick(storyId, sessionId, pageId, {
          kind: cta.kind,
          label: cta.label ?? "Continue",
          endId,
          endAlias,
        });
      } catch {}
    }

    // ❗ ITT NINCS SFX – csak logika

    // LINK + opcionális letöltés
    if (cta.kind === "link") {
      if (cta.download) {
        openDownload(
          cta.urlTemplate,
          cta.download === true ? true : cta.download,
          cta.rel
        );
        // Analitika/mellékhatások aszinkron (popup-blocker kerülése miatt a megnyitás marad szinkron)
        setTimeout(() => {
          try {
            dispatchCta(cta, context);
          } catch {}
        }, 0);
        return;
      }

      // ha nincs explicit target ⇒ külső: _blank, belső: _self
      const target = cta.target ?? (isExternal(cta.urlTemplate) ? "_blank" : "_self");

      // szinkron megnyitás user gesture-ből
      window.open(cta.urlTemplate, target);

      // analitika késleltetve
      setTimeout(() => {
        try {
          dispatchCta(cta, context);
        } catch {}
      }, 0);
      return;
    }

    // DEDIKÁLT LETÖLTÉS CTA
    if (cta.kind === "download") {
      openDownload(cta.urlTemplate, cta.filename, cta.rel);
      setTimeout(() => {
        try {
          dispatchCta(cta, context);
        } catch {}
      }, 0);
      return;
    }

    // Egyéb CTA-típusok maradnak a dispatcherben
    dispatchCta(cta, context);
  };

  return (
    <button className={s.ctaBtn} onClick={handleClick}>
      {cta.label ?? "Continue"}
    </button>
  );
};

export default CampaignCta;
