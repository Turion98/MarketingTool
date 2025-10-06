"use client";
import React from "react";
import s from "./CampaignCta.module.scss";
import { CtaConfig, CtaContext } from "../../core/cta/ctaTypes";
import { dispatchCta } from "../../core/cta/ctaDispatcher";

type Props = { cta: CtaConfig; context: CtaContext; onShown?: () => void };

const CampaignCta: React.FC<Props> = ({ cta, context, onShown }) => {
  React.useEffect(() => { onShown?.(); }, [onShown]);
  return (
    <button className={s.ctaBtn} onClick={() => dispatchCta(cta, context)}>
      {cta.label}
    </button>
  );
};

export default CampaignCta;
