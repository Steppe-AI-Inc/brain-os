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

export type DailyUsage = { date: string; totalTokens: number; costUsd: number; calls: number };

export async function getDailyUsage(days = 14): Promise<DailyUsage[]> {
  const supabase = await createClient();
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (days - 1));

  const { data, error } = await supabase
    .from("model_usage")
    .select("input_tokens, output_tokens, estimated_cost_usd, created_at")
    .gte("created_at", since.toISOString());
  if (error) throw error;

  const byDate = new Map<string, { totalTokens: number; costUsd: number; calls: number }>();
  for (const row of data ?? []) {
    if (!row.created_at) continue;
    const date = row.created_at.slice(0, 10);
    const bucket = byDate.get(date) ?? { totalTokens: 0, costUsd: 0, calls: 0 };
    bucket.totalTokens += (row.input_tokens ?? 0) + (row.output_tokens ?? 0);
    bucket.costUsd += Number(row.estimated_cost_usd ?? 0);
    bucket.calls += 1;
    byDate.set(date, bucket);
  }

  const result: DailyUsage[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setDate(since.getDate() + i);
    const date = d.toISOString().slice(0, 10);
    const bucket = byDate.get(date);
    result.push({ date, totalTokens: bucket?.totalTokens ?? 0, costUsd: bucket?.costUsd ?? 0, calls: bucket?.calls ?? 0 });
  }
  return result;
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
