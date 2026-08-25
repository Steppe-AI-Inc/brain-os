"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function ensureBillingAccount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string
): Promise<string | null> {
  const { data: existing } = await supabase.from("billing_accounts").select("id").eq("company_id", companyId).maybeSingle();
  if (existing) return existing.id;
  const { data: created, error } = await supabase.from("billing_accounts").insert({ company_id: companyId }).select("id").single();
  if (error || !created) return null;
  return created.id;
}

export async function getBillingOverview() {
  const supabase = await createClient();
  const { data: companies } = await supabase.from("companies").select("id, name").order("name");
  const { data: accounts } = await supabase.from("billing_accounts").select("id, company_id, currency");
  const { data: ledger } = await supabase
    .from("service_credit_ledger")
    .select("billing_account_id, amount, entry_type");

  const accountByCompany = new Map((accounts ?? []).map((a) => [a.company_id, a]));
  const balanceByAccount = new Map<string, number>();
  const depositsByAccount = new Map<string, number>();
  for (const entry of ledger ?? []) {
    balanceByAccount.set(entry.billing_account_id, (balanceByAccount.get(entry.billing_account_id) ?? 0) + entry.amount);
    if (entry.entry_type === "deposit") {
      depositsByAccount.set(entry.billing_account_id, (depositsByAccount.get(entry.billing_account_id) ?? 0) + entry.amount);
    }
  }

  return (companies ?? []).map((c) => {
    const account = accountByCompany.get(c.id);
    return {
      companyId: c.id,
      companyName: c.name,
      billingAccountId: account?.id ?? null,
      currency: account?.currency ?? "USD",
      balance: account ? (balanceByAccount.get(account.id) ?? 0) : 0,
      totalDeposits: account ? (depositsByAccount.get(account.id) ?? 0) : 0,
    };
  });
}

export async function getLedgerEntries(companyId: string) {
  const supabase = await createClient();
  const { data: account } = await supabase.from("billing_accounts").select("id").eq("company_id", companyId).maybeSingle();
  if (!account) return [];
  const { data, error } = await supabase
    .from("service_credit_ledger")
    .select("id, entry_type, amount, description, created_at")
    .eq("billing_account_id", account.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data;
}

// Manual deposit recording — the founder/HR-finance confirms a real bank transfer
// happened and logs it here. Deliberately not a live payment flow: collecting card/bank
// details and moving real money is out of scope for an unsupervised action.
export async function recordDeposit(companyId: string, amount: number, description: string): Promise<string | null> {
  if (!companyId) return "Pick a company.";
  if (!amount || amount <= 0) return "Deposit amount must be positive.";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "Not signed in.";
  const { data: profile } = await supabase.from("profiles").select("id").eq("auth_user_id", user.id).single();
  if (!profile) return "Profile not found.";

  const accountId = await ensureBillingAccount(supabase, companyId);
  if (!accountId) return "Could not create or find a billing account for this company.";

  const { error } = await supabase.from("service_credit_ledger").insert({
    billing_account_id: accountId,
    entry_type: "deposit",
    amount,
    description: description.trim() || "Manual deposit",
    created_by_profile_id: profile.id,
  });
  if (error) return error.message;

  revalidatePath("/billing");
  return null;
}

export async function getPricingSettings() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("ai_pricing_settings").select("markup_multiplier").eq("id", true).single();
  if (error) return { markup_multiplier: 2.0 };
  return data;
}

export async function updateMarkup(multiplier: number): Promise<string | null> {
  if (!multiplier || multiplier <= 0) return "Markup must be a positive number.";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "Not signed in.";
  const { data: profile } = await supabase.from("profiles").select("id").eq("auth_user_id", user.id).single();

  const { error } = await supabase
    .from("ai_pricing_settings")
    .update({ markup_multiplier: multiplier, updated_by_profile_id: profile?.id, updated_at: new Date().toISOString() })
    .eq("id", true);
  if (error) return error.message;
  revalidatePath("/billing");
  return null;
}

// Provider cost is real (model_usage.actual_cost_usd, falling back to the pre-call
// estimate). Customer charge is provider cost * markup — an informational preview of
// what SEM Brain's own service-credit pricing would be, not yet auto-debited per
// transaction (that needs a resolved company attribution per usage event, which
// model_usage doesn't carry today — flagged, not guessed at).
export async function getAiEconomicsSummary() {
  const supabase = await createClient();
  const [{ data: usage }, { data: pricing }] = await Promise.all([
    supabase.from("model_usage").select("model_name, input_tokens, output_tokens, estimated_cost_usd, actual_cost_usd, created_at"),
    supabase.from("ai_pricing_settings").select("markup_multiplier").eq("id", true).single(),
  ]);
  const markup = pricing?.markup_multiplier ?? 2.0;

  const byModel = new Map<string, { cost: number; requests: number; tokens: number }>();
  let totalCost = 0;
  for (const row of usage ?? []) {
    const cost = row.actual_cost_usd ?? row.estimated_cost_usd ?? 0;
    totalCost += cost;
    const key = row.model_name || "unknown";
    const bucket = byModel.get(key) ?? { cost: 0, requests: 0, tokens: 0 };
    bucket.cost += cost;
    bucket.requests += 1;
    bucket.tokens += (row.input_tokens ?? 0) + (row.output_tokens ?? 0);
    byModel.set(key, bucket);
  }

  const customerCharge = totalCost * markup;
  return {
    markup,
    providerCost: totalCost,
    customerCharge,
    grossMargin: customerCharge - totalCost,
    marginPct: customerCharge > 0 ? ((customerCharge - totalCost) / customerCharge) * 100 : 0,
    byModel: Array.from(byModel.entries()).map(([model, v]) => ({
      model,
      providerCost: v.cost,
      customerCharge: v.cost * markup,
      requests: v.requests,
      tokens: v.tokens,
    })),
  };
}
