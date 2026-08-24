/**
 * Brain OS text/agent model catalog.
 *
 * Pricing is a dated planning snapshot, not a billing authority. Provider prices,
 * processing tiers, cache discounts, and long-context multipliers change. The UI links
 * directly to each provider's official source and states which assumptions it uses.
 * Mirrors the identical table in supabase/functions/sem-ai-command/index.ts (Deno and
 * Next.js don't share a package here, so the small constant map is duplicated — update
 * both if pricing changes).
 */

export type ModelProfile = {
  provider: "openai" | "anthropic";
  model: string;
  label: string;
  inputPer1M: number;
  outputPer1M: number;
  capabilityScore: number;
  speedScore: number;
  contextTokens: number;
  tier: "frontier" | "advanced" | "balanced" | "efficient";
  bestFor: string;
  color: string;
  sourceUrl: string;
  pricingNote: string;
};

// Verified live against platform.claude.com/docs and developers.openai.com/api/docs/pricing.
export const PRICING_SNAPSHOT_DATE = "2026-08-24";

export const MODEL_CATALOG: ModelProfile[] = [
  {
    provider: "openai",
    model: "gpt-5.6-sol",
    label: "GPT-5.6 Sol",
    inputPer1M: 5,
    outputPer1M: 30,
    capabilityScore: 98,
    speedScore: 2,
    contextTokens: 1_050_000,
    tier: "frontier",
    bestFor: "Complex strategy, high-stakes analysis, difficult agentic work",
    color: "#f59e0b",
    sourceUrl: "https://openai.com/api/pricing/",
    pricingNote: "Standard processing, context under 270K tokens",
  },
  {
    provider: "openai",
    model: "gpt-5.6-terra",
    label: "GPT-5.6 Terra",
    inputPer1M: 2,
    outputPer1M: 12,
    capabilityScore: 92,
    speedScore: 4,
    contextTokens: 1_050_000,
    tier: "balanced",
    bestFor: "Default company operator, planning, proposals, analysis",
    color: "#22c55e",
    sourceUrl: "https://openai.com/api/pricing/",
    pricingNote: "Standard processing, context under 270K tokens",
  },
  {
    provider: "openai",
    model: "gpt-5.6-luna",
    label: "GPT-5.6 Luna",
    inputPer1M: 0.2,
    outputPer1M: 1.2,
    capabilityScore: 78,
    speedScore: 5,
    contextTokens: 1_050_000,
    tier: "efficient",
    bestFor: "Classification, extraction, summaries, high-volume routine work",
    color: "#06b6d4",
    sourceUrl: "https://openai.com/api/pricing/",
    pricingNote: "Standard processing, context under 270K tokens",
  },
  {
    provider: "anthropic",
    model: "claude-fable-5",
    label: "Claude Fable 5",
    inputPer1M: 10,
    outputPer1M: 50,
    capabilityScore: 100,
    speedScore: 1,
    contextTokens: 1_000_000,
    tier: "frontier",
    bestFor: "Highest-capability review, complex enterprise and agentic work",
    color: "#ef4444",
    sourceUrl: "https://platform.claude.com/docs/en/about-claude/pricing",
    pricingNote: "Standard first-party Claude API pricing",
  },
  {
    provider: "anthropic",
    model: "claude-opus-5",
    label: "Claude Opus 5",
    inputPer1M: 5,
    outputPer1M: 25,
    capabilityScore: 97,
    speedScore: 3,
    contextTokens: 1_000_000,
    tier: "frontier",
    bestFor: "Complex professional work, deep review, difficult decisions",
    color: "#f97316",
    sourceUrl: "https://platform.claude.com/docs/en/about-claude/pricing",
    pricingNote: "Standard first-party Claude API pricing",
  },
  {
    provider: "anthropic",
    model: "claude-sonnet-5",
    label: "Claude Sonnet 5",
    inputPer1M: 2,
    outputPer1M: 10,
    capabilityScore: 90,
    speedScore: 4,
    contextTokens: 1_000_000,
    tier: "balanced",
    bestFor: "Daily agents, coding, documents, balanced intelligence and cost",
    color: "#8b5cf6",
    sourceUrl: "https://platform.claude.com/docs/en/about-claude/pricing",
    pricingNote: "Current standard price shown by Anthropic",
  },
  {
    provider: "anthropic",
    model: "claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    inputPer1M: 1,
    outputPer1M: 5,
    capabilityScore: 74,
    speedScore: 5,
    contextTokens: 200_000,
    tier: "efficient",
    bestFor: "Fast routing, extraction, customer triage, repetitive operations",
    color: "#ec4899",
    sourceUrl: "https://platform.claude.com/docs/en/about-claude/pricing",
    pricingNote: "Standard first-party Claude API pricing",
  },
];

// Older/legacy model rows kept billable (estimateCost still resolves them) even after
// the selectable catalog above moves forward — a real ai_providers row, or historical
// model_usage rows, can still reference any of these.
const LEGACY_PRICING_PER_1M: Record<string, [number, number]> = {
  "gpt-4.1-mini": [0.4, 1.6],
  "gpt-4.1": [2, 8],
  "gpt-4o-mini": [0.15, 0.6],
  "gpt-4o": [2.5, 10],
  "gpt-5-nano": [0.05, 0.4],
  "gpt-5-mini": [0.25, 2.0],
  "gpt-5": [1.25, 10.0],
  "gpt-5-pro": [15.0, 120.0],
  "claude-sonnet-4-6": [3, 15],
};

export const PRICING_PER_1M: Record<string, [number, number]> = {
  ...LEGACY_PRICING_PER_1M,
  ...Object.fromEntries(MODEL_CATALOG.map((model) => [model.model, [model.inputPer1M, model.outputPer1M]])),
};

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const rates = PRICING_PER_1M[model];
  if (!rates) return 0;
  const [inputRate, outputRate] = rates;
  return (inputTokens / 1_000_000) * inputRate + (outputTokens / 1_000_000) * outputRate;
}

export function estimateMonthlyCost(
  model: ModelProfile,
  inputTokensPerRun: number,
  outputTokensPerRun: number,
  monthlyRuns: number
): number {
  const oneRun =
    (inputTokensPerRun / 1_000_000) * model.inputPer1M + (outputTokensPerRun / 1_000_000) * model.outputPer1M;
  return oneRun * monthlyRuns;
}

export const SUPPORTED_MODELS: Array<{ provider: "openai" | "anthropic"; model: string; label: string }> =
  MODEL_CATALOG.map(({ provider, model, label }) => ({ provider, model, label }));
