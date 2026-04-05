export type CtaKind = "link" | "download" | "webhook" | "share" | "restart" | "custom";

export type CtaTemplateValue =
  | string
  | number
  | boolean
  | null
  | undefined;

export type CtaTemplateContext = Record<string, CtaTemplateValue>;
export type CtaPayloadValue =
  | string
  | number
  | boolean
  | null
  | CtaPayloadValue[]
  | { [key: string]: CtaPayloadValue };

export type CtaBase = {
  id?: string;
  label?: string;
  /** Rövid gombfelirat melletti kontextus (nem a gomb része); preset: subtitle vagy contextLine */
  subtitle?: string;
  kind: CtaKind;
  presetKey?: string;         // ha presetből jön
};

export type LinkCta = CtaBase & {
  kind: "link";
  urlTemplate: string;        // pl. https://...{{campaignId}}...
  target?: "_self" | "_blank" | "_top";
  rel?: string;
  download?: boolean | string;
};

export type DownloadCta = CtaBase & {
  kind: "download";
  urlTemplate: string;
  filename?: string | true;
  rel?: string;
};

export type WebhookCta = CtaBase & {
  kind: "webhook";
  endpoint: string;           // relatív vagy whitelistelt abszolút
  method?: "POST" | "GET";
  payloadTemplate?: Record<string, CtaPayloadValue>;
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
  params?: Record<string, CtaPayloadValue>;
};

export type CtaConfig = LinkCta | DownloadCta | WebhookCta | ShareCta | RestartCta | CustomCta;

export type CtaContext = CtaTemplateContext & {
  campaignId: string;
  nodeId: string;
  storyId?: string;
  pageId?: string;
  endId?: string;
  endAlias?: string;
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
