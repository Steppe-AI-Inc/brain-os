/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function getKpiRecords() {
  const supabase = await createClient();
  const db = supabase as any;
  const { data, error } = await db
    .from("kpi_records")
    .select("id,metric,period,target,actual,weight,score,calculated_score,direction,evidence_refs,quality_gate_passed,status,person_id,people(full_name,role_title)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data ?? [];
}

export async function getCompensationRecommendations() {
  const supabase = await createClient();
  const db = supabase as any;
  const { data, error } = await db
    .from("compensation_recommendations")
    .select("id,person_id,period,overall_kpi_score,performance_bonus_pct,performance_bonus_amount,value_creation_amount,total_variable_amount,currency,status,explanation,evidence_refs,people(full_name,role_title)")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    if (String(error.message || "").includes("compensation_recommendations")) return [];
    throw error;
  }
  return data ?? [];
}

export async function getSalesCommissionEvents() {
  const supabase = await createClient();
  const db = supabase as any;
  const { data, error } = await db
    .from("sales_commission_events")
    .select("id,person_id,period,customer_name,contract_value,collected_revenue,gross_profit,commission_basis,commission_rate_pct,commission_amount,currency,status,evidence_refs,people(full_name,role_title)")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    if (String(error.message || "").includes("sales_commission_events")) return [];
    throw error;
  }
  return data ?? [];
}

export async function getFixedSalaryVisibleToCaller() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("salary_private")
    .select("person_id,base_salary,currency,people(full_name)");
  if (error) return [];
  return data ?? [];
}

// Bulk weekly evidence check-in. It creates work to collect measurable evidence; it does
// not change base salary or automatically pay a bonus.
export async function runKpiCheckins(): Promise<string | { created: number }> {
  const supabase = await createClient();
  const { data: people, error } = await supabase.from("people").select("id, full_name, company_id");
  if (error) return error.message;
  if (!people || people.length === 0) return { created: 0 };

  let created = 0;
  for (const person of people) {
    const { error: taskError } = await supabase.from("tasks").insert({
      title: `Weekly performance evidence: ${person.full_name}`,
      description:
        "Collect measurable evidence for productivity/speed, quality/rework, punctuality/deadlines, communication and ownership/value creation. Do not alter base salary.",
      company_id: person.company_id,
      owner_type: "human",
      owner_person_id: person.id,
      priority: "medium",
      risk_level: "low",
      approval_required: false,
      status: "queued",
      source: "kpi_checkin_bulk",
      acceptance_criteria: [
        "Evidence links attached",
        "Quality/rework considered alongside speed",
        "No compensation action executed automatically",
      ],
    });
    if (!taskError) created++;
  }

  revalidatePath("/kpi");
  revalidatePath("/tasks");
  return { created };
}
