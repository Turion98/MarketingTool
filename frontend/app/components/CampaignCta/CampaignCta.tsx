"use client";
import React from "react";
import s from "./CampaignCta.module.scss";
import { CtaConfig, CtaContext } from "../../core/cta/ctaTypes";
import { dispatchCta } from "../../core/cta/ctaDispatcher";
import { useUiClickSound } from "./../../lib/useUiClickSound";

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

const openDownload = (url: string, filename?: string, rel?: string) => {
  const a = document.createElement("a");
  a.href = url;
  if (filename === (true as any)) a.setAttribute("download", "");
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

  React.useEffect(() => {
    // CTA láthatóvá vált → jelzés + SFX
    onShown?.();
    playCtaAppear();
  }, [onShown, playCtaAppear]);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();

    // ❗ ITT NINCS SFX – csak logika

    // LINK + opcionális letöltés
    if (cta.kind === "link") {
      const url = (cta as any).urlTemplate as string;
      const explicitTarget = (cta as any).target as string | undefined;
      const rel = (cta as any).rel as string | undefined;
      const download = (cta as any).download as boolean | string | undefined;

      if (download) {
        openDownload(url, download as any, rel);
        // Analitika/mellékhatások aszinkron (popup-blocker kerülése miatt a megnyitás marad szinkron)
        setTimeout(() => {
          try {
            dispatchCta(cta, context);
          } catch {}
        }, 0);
        return;
      }

      // ha nincs explicit target ⇒ külső: _blank, belső: _self
      const target = explicitTarget ?? (isExternal(url) ? "_blank" : "_self");

      // szinkron megnyitás user gesture-ből
      window.open(url, target);

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
      const url = (cta as any).urlTemplate as string;
      const filename = (cta as any).filename as string | undefined;
      const rel = (cta as any).rel as string | undefined;
      openDownload(url, filename, rel);
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
