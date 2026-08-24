/**
 * Deterministic $/token lookup — no reason to call an LLM to estimate its own cost.
 * Mirrors the identical table in supabase/functions/sem-ai-command/index.ts (Deno and
 * Next.js don't share a package here, so the small constant map is duplicated —
 * update both if pricing changes).
 */

// [inputPer1M, outputPer1M] in USD.
const PRICING_PER_1M: Record<string, [number, number]> = {
  "gpt-4.1-mini": [0.4, 1.6],
  "gpt-4.1": [2.0, 8.0],
  "gpt-4o-mini": [0.15, 0.6],
  "gpt-4o": [2.5, 10.0],
  "claude-sonnet-4-6": [3.0, 15.0],
  "claude-haiku-4-6": [0.8, 4.0],
};

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const rates = PRICING_PER_1M[model];
  if (!rates) return 0;
  const [inRate, outRate] = rates;
  return (inputTokens / 1_000_000) * inRate + (outputTokens / 1_000_000) * outRate;
}

export const SUPPORTED_MODELS: Array<{ provider: "openai" | "anthropic"; model: string; label: string }> = [
  { provider: "openai", model: "gpt-4.1-mini", label: "GPT-4.1 mini" },
  { provider: "openai", model: "gpt-4.1", label: "GPT-4.1" },
  { provider: "openai", model: "gpt-4o-mini", label: "GPT-4o mini" },
  { provider: "openai", model: "gpt-4o", label: "GPT-4o" },
  { provider: "anthropic", model: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { provider: "anthropic", model: "claude-haiku-4-6", label: "Claude Haiku 4.6" },
];
