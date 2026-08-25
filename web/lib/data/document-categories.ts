export const DOCUMENT_CATEGORIES = [
  "Financial Statements",
  "Contracts & Legal",
  "Engineering Drawings",
  "Marketing & Brochures",
  "Proposals & Quotations",
  "HR",
  "General",
] as const;

export const SENSITIVITY_OPTIONS = ["public", "internal", "confidential", "restricted", "founder_only"] as const;

// Confidential-by-default categories: HR and legal/financial paperwork should not
// silently start out at the "any company member" tier just because nobody thought to
// change the sensitivity dropdown. Shared between the upload form (to preview the
// default) and the server action (to actually apply it) — the uploader can still
// override it explicitly either way.
const CONFIDENTIAL_BY_DEFAULT_CATEGORIES = new Set(["HR", "Contracts & Legal", "Financial Statements"]);

export function defaultSensitivityForCategory(category: string): "internal" | "confidential" {
  return CONFIDENTIAL_BY_DEFAULT_CATEGORIES.has(category) ? "confidential" : "internal";
}
