/**
 * Deterministic $/token lookup — no reason to call an LLM to estimate its own cost.
 * Mirrors the identical table in supabase/functions/sem-ai-command/index.ts (Deno and
 * Next.js don't share a package here, so the small constant map is duplicated —
 * update both if pricing changes).
 */

// [inputPer1M, outputPer1M] in USD. Verified live against platform.claude.com/docs and
// developers.openai.com/api/docs/pricing (2026-08-24) — not memorized/guessed figures.
// claude-sonnet-4-6 and the gpt-4.1/4o legacy rows are kept even though newer generations
// exist below, because a real ai_providers row can still reference them.
export const PRICING_PER_1M: Record<string, [number, number]> = {
  "gpt-4.1-mini": [0.4, 1.6],
  "gpt-4.1": [2.0, 8.0],
  "gpt-4o-mini": [0.15, 0.6],
  "gpt-4o": [2.5, 10.0],
  "gpt-5-nano": [0.05, 0.4],
  "gpt-5-mini": [0.25, 2.0],
  "gpt-5": [1.25, 10.0],
  "gpt-5-pro": [15.0, 120.0],
  "claude-haiku-4-5": [1.0, 5.0],
  "claude-sonnet-4-6": [3.0, 15.0],
  "claude-sonnet-5": [2.0, 10.0],
  "claude-opus-5": [5.0, 25.0],
  "claude-fable-5": [10.0, 50.0],
};

// Ordinal 1-5 "how capable is this model relative to its own family" — derived from each
// publisher's own product positioning (nano < mini < flagship < pro; haiku < sonnet <
// opus/fable), NOT a measured benchmark score. There is no live benchmark API wired up
// here; presenting a fake numeric "IQ" would be worse than not having one. Use this only
// for a rough relative ordering, never as a precise capability claim.
export const CAPABILITY_TIER: Record<string, number> = {
  "gpt-4o-mini": 1,
  "gpt-5-nano": 1,
  "gpt-4.1-mini": 2,
  "gpt-5-mini": 2,
  "gpt-4.1": 3,
  "gpt-4o": 3,
  "gpt-5": 4,
  "gpt-5-pro": 5,
  "claude-haiku-4-5": 2,
  "claude-sonnet-4-6": 3,
  "claude-sonnet-5": 4,
  "claude-opus-5": 5,
  "claude-fable-5": 5,
};

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const rates = PRICING_PER_1M[model];
  if (!rates) return 0;
  const [inRate, outRate] = rates;
  return (inputTokens / 1_000_000) * inRate + (outputTokens / 1_000_000) * outRate;
}

export const SUPPORTED_MODELS: Array<{ provider: "openai" | "anthropic"; model: string; label: string }> = [
  { provider: "openai", model: "gpt-5-nano", label: "GPT-5 nano" },
  { provider: "openai", model: "gpt-5-mini", label: "GPT-5 mini" },
  { provider: "openai", model: "gpt-5", label: "GPT-5" },
  { provider: "openai", model: "gpt-5-pro", label: "GPT-5 pro" },
  { provider: "openai", model: "gpt-4.1-mini", label: "GPT-4.1 mini" },
  { provider: "openai", model: "gpt-4.1", label: "GPT-4.1" },
  { provider: "openai", model: "gpt-4o-mini", label: "GPT-4o mini" },
  { provider: "openai", model: "gpt-4o", label: "GPT-4o" },
  { provider: "anthropic", model: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
  { provider: "anthropic", model: "claude-sonnet-5", label: "Claude Sonnet 5" },
  { provider: "anthropic", model: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { provider: "anthropic", model: "claude-opus-5", label: "Claude Opus 5" },
  { provider: "anthropic", model: "claude-fable-5", label: "Claude Fable 5" },
];
