import type {
  CampaignConfig,
  CtaConfig,
  CtaContext,
  CtaPayloadValue,
  CtaTemplateContext,
} from "./ctaTypes";

// Minimál sablonhelyettesítés – {{key}} → context[key]
type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as UnknownRecord;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function interpolate(s: string, ctx: CtaTemplateContext): string {
  if (!s) return s;
  return s.replace(/\{\{(\w+)\}\}/g, (_, k) =>
    (ctx && ctx[k] != null) ? String(ctx[k]) : ""
  );
}

function interpolateMaybe(value: unknown, ctx: CtaContext): string | undefined {
  const text = asString(value);
  return text ? interpolate(text, ctx) : undefined;
}

function normalizePayloadRecord(value: unknown): Record<string, CtaPayloadValue> | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  return record as Record<string, CtaPayloadValue>;
}

function normalizeCtaConfig(
  value: unknown,
  ctx: CtaContext,
  presetKey?: string
): CtaConfig | undefined {
  const record = asRecord(value);
  if (!record) return undefined;

  const kind = asString(record.kind);
  if (!kind) return undefined;

  const subtitleRaw = record.subtitle ?? record.contextLine;
  const base = {
    id: asString(record.id),
    label: asString(record.label),
    subtitle: interpolateMaybe(subtitleRaw, ctx),
    presetKey,
  };

  switch (kind) {
    case "link": {
      const urlTemplate = interpolateMaybe(record.urlTemplate, ctx);
      if (!urlTemplate) return undefined;
      const target = record.target;
      return {
        ...base,
        kind,
        urlTemplate,
        target:
          target === "_self" || target === "_blank" || target === "_top"
            ? target
            : undefined,
        rel: asString(record.rel),
        download:
          typeof record.download === "boolean" || typeof record.download === "string"
            ? record.download
            : undefined,
      };
    }
    case "download": {
      const urlTemplate = interpolateMaybe(record.urlTemplate, ctx);
      if (!urlTemplate) return undefined;
      const filename = record.filename;
      return {
        ...base,
        kind,
        urlTemplate,
        filename:
          filename === true || typeof filename === "string" ? filename : undefined,
        rel: asString(record.rel),
      };
    }
    case "webhook": {
      const endpoint = interpolateMaybe(record.endpoint, ctx);
      if (!endpoint) return undefined;
      return {
        ...base,
        kind,
        endpoint,
        method: record.method === "GET" || record.method === "POST" ? record.method : undefined,
        payloadTemplate: normalizePayloadRecord(record.payloadTemplate),
      };
    }
    case "share":
      return {
        ...base,
        kind,
        textTemplate: interpolateMaybe(record.textTemplate, ctx),
        urlTemplate: interpolateMaybe(record.urlTemplate, ctx),
      };
    case "restart":
      return {
        ...base,
        kind,
      };
    case "custom": {
      const actionId = asString(record.actionId) ?? asString(record.id);
      if (!actionId) return undefined;
      return {
        ...base,
        kind,
        actionId,
        params: normalizePayloadRecord(record.params),
      };
    }
    default:
      return undefined;
  }
}

/**
 * nodeEndMeta: pl. { cta: "google" } vagy { cta: { kind:"link", ... } }
 * campaignCfg: { campaignId, ctaPresets, endDefaultCta }
 * engineDefault: pl. { kind:"restart", label:"Play again" }
 */
export function resolveCta(
  nodeEndMeta: unknown,
  campaignCfg: CampaignConfig | undefined,
  engineDefault: CtaConfig,
  ctx: CtaContext
): CtaConfig {
  const presets = campaignCfg?.ctaPresets ?? {};
  const endDefaultKey = campaignCfg?.endDefaultCta;

  // 1) Node preferencia
  const nodeRec = asRecord(nodeEndMeta);
  const nodeCta =
    nodeRec && "cta" in nodeRec ? nodeRec.cta : nodeEndMeta;
  if (nodeCta) {
    // a) ha string, presetet keresünk
    if (typeof nodeCta === "string") {
      const p = presets[nodeCta];
      if (p) {
        return normalizeCtaConfig(p, ctx, nodeCta) ?? engineDefault;
      }
    }
    // b) ha objektum, közvetlenül használjuk (interpoláció, ha van template)
    if (typeof nodeCta === "object") {
      const normalizedNode = normalizeCtaConfig(nodeCta, ctx);
      if (normalizedNode) return normalizedNode;
    }
  }

  // 2) Campaign default preset (ha van)
  if (endDefaultKey && presets[endDefaultKey]) {
    const normalizedDefault = normalizeCtaConfig(presets[endDefaultKey], ctx, endDefaultKey);
    if (normalizedDefault) return normalizedDefault;
  }

  // 3) Engine default
  return engineDefault;
}
