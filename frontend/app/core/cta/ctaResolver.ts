import { CtaConfig, CtaContext, CampaignConfig } from "./ctaTypes";

// Minimál sablonhelyettesítés – {{key}} → context[key]
function interpolate(s: string, ctx: Record<string, any>): string {
  if (!s) return s;
  return s.replace(/\{\{(\w+)\}\}/g, (_, k) =>
    (ctx && ctx[k] != null) ? String(ctx[k]) : ""
  );
}

/**
 * nodeEndMeta: pl. { cta: "google" } vagy { cta: { kind:"link", ... } }
 * campaignCfg: { campaignId, ctaPresets, endDefaultCta }
 * engineDefault: pl. { kind:"restart", label:"Play again" }
 */
export function resolveCta(
  nodeEndMeta: any,
  campaignCfg: CampaignConfig | undefined,
  engineDefault: CtaConfig,
  ctx: CtaContext
): CtaConfig {
  const presets = campaignCfg?.ctaPresets ?? {};
  const endDefaultKey = campaignCfg?.endDefaultCta;

  // 1) Node preferencia
  const nodeCta = nodeEndMeta?.cta ?? nodeEndMeta;
  if (nodeCta) {
    // a) ha string, presetet keresünk
    if (typeof nodeCta === "string") {
      const p = (presets as any)[nodeCta];
      if (p) {
        return {
          ...p,
          // fontos: minden opcionális mezőt is engedjünk át
          label: p.label ?? "Continue",
          urlTemplate: p.urlTemplate ? interpolate(p.urlTemplate, ctx) : p.urlTemplate,
          presetKey: nodeCta,
        } as CtaConfig;
      }
    }
    // b) ha objektum, közvetlenül használjuk (interpoláció, ha van template)
    if (typeof nodeCta === "object") {
      const out = { ...nodeCta } as any;
      if (out.urlTemplate) out.urlTemplate = interpolate(out.urlTemplate, ctx);
      return out as CtaConfig;
    }
  }

  // 2) Campaign default preset (ha van)
  if (endDefaultKey && (presets as any)[endDefaultKey]) {
    const p = (presets as any)[endDefaultKey];
    return {
      ...p,
      label: p.label ?? "Continue",
      urlTemplate: p.urlTemplate ? interpolate(p.urlTemplate, ctx) : p.urlTemplate,
      presetKey: endDefaultKey,
    } as CtaConfig;
  }

  // 3) Engine default
  return engineDefault;
}
