import { CtaConfig, CampaignConfig, CtaContext } from "./ctaTypes";

const tokenize = (tpl: any, ctx: CtaContext): any => {
  if (typeof tpl === "string") {
    return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => (ctx as any)[k] ?? "");
  }
  if (tpl && typeof tpl === "object") {
    const out: any = Array.isArray(tpl) ? [] : {};
    for (const k in tpl) out[k] = tokenize(tpl[k], ctx);
    return out;
  }
  return tpl;
};

export function resolveCta(
  nodeEndMetaCta: string | CtaConfig | undefined,
  campaignCfg: CampaignConfig | undefined,
  engineDefault: CtaConfig,
  ctx: CtaContext
): CtaConfig {
  // 1) node override
  if (nodeEndMetaCta) {
    if (typeof nodeEndMetaCta === "string") {
      const preset = campaignCfg?.ctaPresets?.[nodeEndMetaCta];
      if (preset) return tokenize({ ...preset, presetKey: nodeEndMetaCta }, ctx);
    } else {
      return tokenize(nodeEndMetaCta, ctx);
    }
  }
  // 2) campaign default
  const defKey = campaignCfg?.endDefaultCta;
  if (defKey && campaignCfg?.ctaPresets?.[defKey]) {
    return tokenize({ ...campaignCfg.ctaPresets![defKey], presetKey: defKey }, ctx);
  }
  // 3) engine default
  return tokenize(engineDefault, ctx);
}
