// frontend/lib/schema/validator.ts
import Ajv, { type ErrorObject } from "ajv";
import addFormats from "ajv-formats";
import ajvErrors from "ajv-errors";
// Állítsd a path-ot a projektedhez (pl. frontend/schemas/...)
// Ha máshol van a séma, módosítsd az importot.
import CoreSchema from "../../../schemas/CoreSchema.json";
import { collectWarnings, type WarningItem } from "./deprecated";
import { stripLegacyUx, DEFAULT_STRIP_OPTS } from "./stripLegacyUx";

// ---- Types ----
export type ValidateMode = "warnOnly" | "strict";

export type ValidationErrorItem = {
  path: string;     // JSON pointer / property path
  msg: string;      // human message
  keyword?: string; // ajv keyword (optional)
};

export type ValidationResult =
  | { ok: true; warnings: WarningItem[] }
  | { ok: false; errors: ValidationErrorItem[]; warnings: WarningItem[] };

// ---- AJV init (singleton) ----
const ajv = new Ajv({ allErrors: true }); // szükség esetén strict:true
addFormats(ajv);
ajvErrors(ajv);

const validateCore = ajv.compile(CoreSchema as any);

// ---- Public API ----
/**
 * JSON validálás + opcionális legacy UX mezők eltávolítása
 */
export function validateStory(
  data: unknown,
  mode: ValidateMode = "warnOnly",
  stripLegacy: boolean = false
): ValidationResult {
  const cleaned = stripLegacy ? stripLegacyUx(data, DEFAULT_STRIP_OPTS) : data;

  const ok = validateCore(cleaned);
  const warnings = collectWarnings(cleaned);

  if (!ok) {
    const errs = (validateCore.errors || []).map(
      (e: ErrorObject & { instancePath?: string; dataPath?: string }): ValidationErrorItem => {
        const rawPath = e.instancePath ?? e.dataPath ?? "";
        return {
          path: rawPath.replace(/^\//, "").replace(/\//g, ".") || "(root)",
          msg: e.message || "Invalid",
          keyword: e.keyword,
        };
      }
    );

    // core sémahibát nem engedünk át
    return { ok: false, errors: errs, warnings };
  }

  return { ok: true, warnings };
}

// ---- Helper: rövid emberi összefoglaló ----
export function formatErrors(errors: ValidationErrorItem[]): string[] {
  return errors.map((e) => `${e.path}: ${e.msg}`);
}

export function formatWarnings(warnings: WarningItem[]): string[] {
  return warnings.map((w) => `${w.path}: ${w.msg}`);
}
