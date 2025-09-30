// frontend/lib/schema/deprecated.ts

export const DEPRECATED_KEYS = ["layout", "globalUI"];
export const WARN_PREFIXES = ["ux", "x-"];

/**
 * Végigmegy egy objektumon és összegyűjti a warningokat
 * (deprecated vagy vendor extension mezők).
 */
export type WarningItem = {
  path: string;
  msg: string;
};

export function collectWarnings(obj: unknown, basePath = ""): WarningItem[] {
  const out: WarningItem[] = [];
  if (obj && typeof obj === "object") {
    const rec = obj as Record<string, unknown>;
    for (const key of Object.keys(rec)) {
      const val = rec[key];
      const path = basePath ? `${basePath}.${key}` : key;

      if (DEPRECATED_KEYS.includes(key)) {
        out.push({ path, msg: `Deprecated UX key: "${key}" (warn-only).` });
      }
      if (WARN_PREFIXES.some((p) => key.startsWith(p))) {
        out.push({ path, msg: `Vendor/UX extension "${key}" (warn-only).` });
      }
      if (val && typeof val === "object") {
        out.push(...collectWarnings(val, path));
      }
    }
  }
  return out;
}
