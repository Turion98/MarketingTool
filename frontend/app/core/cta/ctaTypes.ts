export type CtaKind = "link" | "download" | "webhook" | "share" | "restart" | "custom";

export type CtaBase = {
  label: string;
  kind: CtaKind;
  presetKey?: string;         // ha presetből jön
};

export type LinkCta = CtaBase & {
  kind: "link";
  urlTemplate: string;        // pl. https://...{{campaignId}}...
  target?: "_self" | "_blank" | "_top";
};

export type DownloadCta = CtaBase & {
  kind: "download";
  urlTemplate: string;
  filename?: string;
};

export type WebhookCta = CtaBase & {
  kind: "webhook";
  endpoint: string;           // relatív vagy whitelistelt abszolút
  method?: "POST" | "GET";
  payloadTemplate?: Record<string, any>;
};

export type ShareCta = CtaBase & {
  kind: "share";
  textTemplate?: string;
  urlTemplate?: string;
};

export type RestartCta = CtaBase & { kind: "restart" };

export type CustomCta = CtaBase & {
  kind: "custom";
  actionId: string;           // registry kulcs
  params?: Record<string, any>;
};

export type CtaConfig = LinkCta | DownloadCta | WebhookCta | ShareCta | RestartCta | CustomCta;

export type CtaContext = {
  campaignId: string;
  nodeId: string;
  abVariant?: string | null;
  lang?: string;
  sessionId?: string;
  path?: string;
};

export type CampaignConfig = {
  campaignId: string;
  ctaPresets?: Record<string, CtaConfig>;
  endDefaultCta?: string;
};
