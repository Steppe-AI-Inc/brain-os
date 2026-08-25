/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import { createClient } from "@/lib/supabase/server";

export type BillingAccountSummary = {
  id: string;
  organizationId: string;
  organizationName: string;
  currency: string;
  status: string;
  hardStopWhenEmpty: boolean;
  balance: number;
};

export async function getBillingAccounts(): Promise<BillingAccountSummary[]> {
  const supabase = await createClient();
  const db = supabase as any;
  const { data, error } = await db
    .from("billing_accounts")
    .select("id,organization_id,currency,status,hard_stop_when_empty,organizations(name)")
    .order("created_at");
  if (error) {
    if (String(error.message || "").includes("billing_accounts")) return [];
    throw error;
  }

  const out: BillingAccountSummary[] = [];
  for (const row of data ?? []) {
    const { data: balanceData } = await db.rpc("billing_balance", { p_account_id: row.id });
    const org = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations;
    out.push({
      id: row.id,
      organizationId: row.organization_id,
      organizationName: org?.name ?? "Workspace",
      currency: row.currency ?? "USD",
      status: row.status ?? "active",
      hardStopWhenEmpty: row.hard_stop_when_empty ?? true,
      balance: Number(balanceData ?? 0),
    });
  }
  return out;
}

export async function getServiceLedger(limit = 100) {
  const supabase = await createClient();
  const db = supabase as any;
  const { data, error } = await db
    .from("service_credit_ledger")
    .select("id,organization_id,billing_account_id,entry_type,amount,currency,reference,created_at,organizations(name)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (String(error.message || "").includes("service_credit_ledger")) return [];
    throw error;
  }
  return data ?? [];
}

export async function getAiUsage(limit = 100) {
  const supabase = await createClient();
  const db = supabase as any;
  const { data, error } = await db
    .from("ai_usage_events")
    .select("id,organization_id,provider,model_name,input_tokens,output_tokens,cached_tokens,customer_charge,created_at,organizations(name),profiles(full_name)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (String(error.message || "").includes("ai_usage_events")) return [];
    throw error;
  }
  return data ?? [];
}

export async function getProviderEconomics(limit = 100) {
  const supabase = await createClient();
  const db = supabase as any;
  const { data, error } = await db
    .from("ai_usage_private")
    .select("usage_event_id,provider_cost,gross_margin,ai_usage_events(provider,model_name,customer_charge,organization_id,organizations(name),created_at)")
    .limit(limit);
  // Normal customer owners intentionally receive no rows here. Platform billing operators
  // see this explicit economics view without gaining generic access to customer data.
  if (error) return [];
  return data ?? [];
}

export async function getDepositHistory(limit = 50) {
  const supabase = await createClient();
  const db = supabase as any;
  const { data, error } = await db
    .from("billing_deposits")
    .select("id,billing_account_id,amount,currency,status,payment_method,external_payment_ref,created_at,settled_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (String(error.message || "").includes("billing_deposits")) return [];
    throw error;
  }
  return data ?? [];
}
