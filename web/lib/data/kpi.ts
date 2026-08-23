"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function getKpiRecords() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("kpi_records")
    .select("id, metric, period, target, actual, score, status, people(full_name)")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return data;
}

// Ported from js/modules/kpiSalary.js: bulk-creates one check-in task per person, plus a
// single salary-impact approval gate (AI/managers can recommend salary impact, but
// approvals_update_approver's domain gating means only HR-finance can actually decide a
// salary_hr-domain approval — the "review, don't auto-execute" principle is enforced by
// RLS, not just by this action being careful).
export async function runKpiCheckins(): Promise<string | { created: number }> {
  const supabase = await createClient();
  const { data: people, error } = await supabase.from("people").select("id, full_name, company_id");
  if (error) return error.message;
  if (!people || people.length === 0) return { created: 0 };

  let created = 0;
  for (const person of people) {
    const { error: taskError } = await supabase.from("tasks").insert({
      title: `Weekly KPI check-in: ${person.full_name}`,
      description: "Collect KPI evidence and blockers for this week.",
      company_id: person.company_id,
      owner_type: "human",
      owner_person_id: person.id,
      priority: "medium",
      risk_level: "low",
      approval_required: false,
      status: "queued",
      source: "kpi_checkin_bulk",
    });
    if (!taskError) created++;
  }

  await supabase.from("approvals").insert({
    title: "Review salary-impacting KPI recommendations only",
    reason: "AI/managers can recommend salary impact, but only HR-finance can approve salary actions.",
    risk_level: "high",
    domain: "salary_hr",
  });

  revalidatePath("/kpi");
  revalidatePath("/tasks");
  revalidatePath("/approvals");
  return { created };
}
