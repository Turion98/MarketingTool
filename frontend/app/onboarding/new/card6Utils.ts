import type { SourceDocumentKind, SourceDocumentPriority } from "./briefTypes";

export const SOURCE_DOC_KINDS: SourceDocumentKind[] = [
  "gtc",
  "warranty_terms",
  "faq",
  "product_grades",
  "past_tickets",
  "return_process",
];

export const SOURCE_DOC_LABELS: Record<SourceDocumentKind, string> = {
  gtc: "ÁSZF / Általános Szerződési Feltételek",
  warranty_terms: "Garancia feltételek",
  faq: "FAQ / Tudásbázis",
  product_grades: "Termék grade definíciók",
  past_tickets: "Korábbi support jegyek (anonimizálva)",
  return_process: "Visszaküldési folyamat leírása",
};

export const SOURCE_DOC_PRIORITIES: Record<
  SourceDocumentKind,
  SourceDocumentPriority
> = {
  gtc: "required",
  warranty_terms: "required",
  faq: "strongly_recommended",
  product_grades: "recommended",
  past_tickets: "optional",
  return_process: "optional",
};

export const PRIORITY_LABELS: Record<SourceDocumentPriority, string> = {
  required: "Kötelező",
  strongly_recommended: "Erősen ajánlott",
  recommended: "Ajánlott",
  optional: "Opcionális",
};

export function isPriorityWarning(
  kind: SourceDocumentKind,
  hasAttachments: boolean,
): boolean {
  if (hasAttachments) return false;
  const p = SOURCE_DOC_PRIORITIES[kind];
  return p === "required" || p === "strongly_recommended";
}
