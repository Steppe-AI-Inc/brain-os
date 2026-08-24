"use server";

import { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type UsageSummary = {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
};

async function summarize(supabase: SupabaseClient, sinceIso: string): Promise<UsageSummary> {
  const { data, error } = await supabase
    .from("model_usage")
    .select("input_tokens, output_tokens, estimated_cost_usd")
    .gte("created_at", sinceIso);
  if (error) throw error;
  const rows = data ?? [];
  return {
    totalCalls: rows.length,
    totalInputTokens: rows.reduce((s, r) => s + (r.input_tokens ?? 0), 0),
    totalOutputTokens: rows.reduce((s, r) => s + (r.output_tokens ?? 0), 0),
    totalCostUsd: rows.reduce((s, r) => s + Number(r.estimated_cost_usd ?? 0), 0),
  };
}

export async function getUsageSummary() {
  const supabase = await createClient();
  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const since7d = new Date(now - 7 * 86_400_000).toISOString();
  const since30d = new Date(now - 30 * 86_400_000).toISOString();

  const [today, last7d, last30d] = await Promise.all([
    summarize(supabase, startOfToday.toISOString()),
    summarize(supabase, since7d),
    summarize(supabase, since30d),
  ]);

  return { today, last7d, last30d };
}

export async function getRecentUsage(limit = 20) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("model_usage")
    .select("id, model_name, input_tokens, output_tokens, estimated_cost_usd, created_at, profiles(full_name)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}
