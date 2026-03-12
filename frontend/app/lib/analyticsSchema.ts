// lib/analyticsSchema.ts
export const ANALYTICS_SCHEMA_VERSION = 1 as const;

export type AnalyticsEventType =
  | "page_enter" | "page_exit"
  | "choice_select"
  | "puzzle_try" | "puzzle_result"
  | "rune_unlock"
  | "ui_click"
  | "media_start" | "media_stop"
  | "game:complete"
  | "cta_shown"
  | "cta_click";  

export type GenericProps = Record<string, string | number | boolean | null | undefined | string[]>;

export type DeviceMeta = {
  ua?: string;
  w?: number; h?: number; dpr?: number;
  lang?: string;
  campaign?: string;
  userId?: string; 
};

export type AnalyticsEvent = {
  id: string;              // ulid/uuid
  t: AnalyticsEventType;
  ts: number;              // epoch ms
  storyId: string;
  sessionId: string;
  pageId?: string;
  refPageId?: string;      // pl. előző oldal
  props?: GenericProps;
  userId?: string; 
};

export type Counters = {
  pageViews: number;
  choices: number;
  puzzles: { tries: number; solved: number };
  runes: number;
  mediaStarts: number;
  mediaStops: number;
};

export type DailyRollup = {
  storyId: string;
  day: string;             // YYYY-MM-DD
  sessions: number;        // distinct sessionId
  pages: number;           // distinct pageId
  totals: Counters;
  topPages: Array<{ pageId: string; views: number }>;
};

export type StorageShape = {
  schema: number;
  // Per story
  stories: Record<string, {
    sessions: Record<string, true>;
    events: AnalyticsEvent[]; // append-only, LRU-trimmelve
    meta?: { title?: string; src?: string } & DeviceMeta;
  }>;
};
