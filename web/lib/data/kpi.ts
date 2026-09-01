"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Overnight multi-org milestone: activeOrganizationId scopes KPIs to the currently
// selected organization when set, same pattern as getPeople() in lib/data/people.ts —
// a query-shape filter only, RLS remains the sole authorization boundary either way.
export async function getKpiRecords(activeOrganizationId?: string | null) {
  const supabase = await createClient();
  let query = supabase
    .from("kpi_records")
    .select("id, metric, period, target, actual, score, salary_impact_pct, bonus_amount, status, company_id, people(full_name)")
    .order("created_at", { ascending: false })
    .limit(30);
  if (activeOrganizationId) query = query.eq("company_id", activeOrganizationId);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getSalaryRules() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("salary_rules")
    .select("id, company_id, role_title, rule_name, formula, active, companies(name, status)")
    .eq("active", true)
    .order("role_title", { ascending: true, nullsFirst: true });
  if (error) throw error;
  return data;
}

type BonusBand = { min_score_pct: number; bonus_pct: number };
type EfficiencyFormula = {
  type: "efficiency_bonus";
  input: "manual_time_log" | "tasks_on_time_completion_rate";
  direction: "lower_is_better" | "higher_is_better";
  bonus_bands: BonusBand[];
};
type CommissionFormula = { type: "commission"; rate_pct: number };
type SalaryFormula = EfficiencyFormula | CommissionFormula;

// Bands are sorted highest-threshold-first in the seed data; find the first one the
// score clears. This is the "non-negotiable, purely on AI system" lookup the founder
// asked for — no manager discretion once the formula and the underlying numbers exist.
function bonusPctForScore(bands: BonusBand[], scorePct: number): number {
  const sorted = [...bands].sort((a, b) => b.min_score_pct - a.min_score_pct);
  const hit = sorted.find((b) => scorePct >= b.min_score_pct);
  return hit?.bonus_pct ?? 0;
}

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function periodBounds(period: string): { start: string; end: string } {
  const [y, m] = period.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

// Automated half of the bonus engine: computes and writes kpi_records for every active
// person using whichever salary_rules formula applies to their role_title (falling back
// to the company-wide default rule), for the formula types that don't need manual input.
// Technician "manual_time_log" rules are deliberately skipped here — see logTechnicianJobTime.
export async function runAutomatedKpiScoring(period?: string): Promise<string | { scored: number; skipped: number; failed: number }> {
  const supabase = await createClient();
  const p = period && /^\d{4}-\d{2}$/.test(period) ? period : currentPeriod();
  const { start, end } = periodBounds(p);

  const [{ data: people, error: peopleError }, { data: rules, error: rulesError }] = await Promise.all([
    supabase.from("people").select("id, full_name, role_title, company_id").eq("active", true),
    supabase.from("salary_rules").select("id, company_id, role_title, formula").eq("active", true),
  ]);
  if (peopleError) return peopleError.message;
  if (rulesError) return rulesError.message;
  if (!people || !rules) return { scored: 0, skipped: 0, failed: 0 };

  let scored = 0;
  let skipped = 0;
  let failed = 0;

  for (const person of people) {
    const rule =
      rules.find((r) => r.role_title?.toLowerCase() === person.role_title?.toLowerCase()) ??
      rules.find((r) => r.role_title === null);
    if (!rule) {
      skipped++;
      continue;
    }
    const formula = rule.formula as unknown as SalaryFormula;

    if (formula.type === "commission") {
      const { data: leads } = await supabase.from("sales_leads").select("id").eq("owner_person_id", person.id);
      const leadIds = (leads ?? []).map((l) => l.id);
      if (leadIds.length === 0) {
        skipped++;
        continue;
      }
      const { data: won } = await supabase
        .from("proposals")
        .select("total")
        .eq("status", "won")
        .in("lead_id", leadIds)
        .gte("created_at", start)
        .lt("created_at", end);
      const totalValue = (won ?? []).reduce((sum, r) => sum + (r.total ?? 0), 0);
      const commission = Math.round(totalValue * (formula.rate_pct / 100) * 100) / 100;
      const ok = await upsertKpiRecord(supabase, {
        person_id: person.id,
        company_id: person.company_id,
        period: p,
        metric: "won_contract_value",
        target: 0,
        actual: totalValue,
        salary_impact_pct: formula.rate_pct,
        bonus_amount: commission,
      });
      if (ok) scored++; else failed++;
      continue;
    }

    if (formula.type === "efficiency_bonus" && formula.input === "tasks_on_time_completion_rate") {
      const { data: dueTasks } = await supabase
        .from("tasks")
        .select("status, deadline, updated_at")
        .eq("owner_person_id", person.id)
        .not("deadline", "is", null)
        .gte("deadline", start)
        .lt("deadline", end);
      const total = dueTasks?.length ?? 0;
      if (total === 0) {
        skipped++;
        continue;
      }
      const onTime = (dueTasks ?? []).filter(
        (t) => t.status === "done" && t.deadline && t.updated_at && new Date(t.updated_at) <= new Date(t.deadline)
      ).length;
      const scorePct = Math.round((onTime / total) * 100);
      const bonusPct = bonusPctForScore(formula.bonus_bands, scorePct);
      const ok = await upsertKpiRecord(supabase, {
        person_id: person.id,
        company_id: person.company_id,
        period: p,
        metric: "task_on_time_completion_rate",
        target: 100,
        actual: scorePct,
        score: scorePct,
        salary_impact_pct: bonusPct,
      });
      if (ok) scored++; else failed++;
      continue;
    }

    // manual_time_log formulas (technicians) are scored via logTechnicianJobTime, not here.
    skipped++;
  }

  revalidatePath("/kpi");
  return { scored, skipped, failed };
}

type KpiRecordUpsert = {
  person_id: string;
  company_id: string | null;
  period: string;
  metric: string;
  target: number;
  actual: number;
  score?: number;
  salary_impact_pct: number;
  bonus_amount?: number;
};

// Returns whether the write actually happened — checks affected rows on the update path
// and real insert success on the create path, instead of assuming success unconditionally.
// The caller (runAutomatedKpiScoring) used to increment scored++ regardless of this
// result; same defect class as qa/KNOWN_FAILURE_MODES.md #18, just inside a batch loop
// instead of a single Server Action, so it needed its own fix rather than the generic one.
async function upsertKpiRecord(supabase: Awaited<ReturnType<typeof createClient>>, record: KpiRecordUpsert): Promise<boolean> {
  const { data: existing } = await supabase
    .from("kpi_records")
    .select("id")
    .eq("person_id", record.person_id)
    .eq("period", record.period)
    .eq("metric", record.metric)
    .maybeSingle();

  const payload = { ...record, status: "scored", updated_at: new Date().toISOString() };
  if (existing) {
    const { data, error } = await supabase.from("kpi_records").update(payload).eq("id", existing.id).select("id");
    return !error && !!data && data.length > 0;
  }
  const { error } = await supabase.from("kpi_records").insert(payload);
  return !error;
}

// Manual half of the bonus engine: there's no time-clock system yet, so a manager logs
// actual vs. target hours per job for a technician, and the same non-negotiable band
// lookup used by the automated path computes the bonus from it.
export async function logTechnicianJobTime(input: {
  personId: string;
  period: string;
  jobLabel: string;
  targetHours: number;
  actualHours: number;
}): Promise<string | { bonusPct: number; scorePct: number }> {
  if (!input.personId || !input.period || !input.jobLabel.trim()) return "All fields are required.";
  if (input.targetHours <= 0 || input.actualHours <= 0) return "Target and actual hours must be positive.";

  const supabase = await createClient();
  const { data: person, error: personError } = await supabase
    .from("people")
    .select("id, company_id, role_title")
    .eq("id", input.personId)
    .single();
  if (personError || !person) return "Person not found.";
  if (!person.role_title) return "This person has no role title set.";

  const { data: rule, error: ruleError } = await supabase
    .from("salary_rules")
    .select("formula")
    .eq("role_title", person.role_title)
    .eq("active", true)
    .maybeSingle();
  if (ruleError) return ruleError.message;
  const formula = rule?.formula as unknown as EfficiencyFormula | undefined;
  if (!formula || formula.type !== "efficiency_bonus" || formula.input !== "manual_time_log") {
    return `No time-efficiency bonus rule is active for role "${person.role_title}".`;
  }

  const scorePct = Math.round((input.targetHours / input.actualHours) * 100);
  const bonusPct = bonusPctForScore(formula.bonus_bands, scorePct);

  const { error } = await supabase.from("kpi_records").insert({
    person_id: person.id,
    company_id: person.company_id,
    period: input.period,
    metric: `installation_time_efficiency: ${input.jobLabel.trim()}`,
    target: input.targetHours,
    actual: input.actualHours,
    score: scorePct,
    salary_impact_pct: bonusPct,
    status: "scored",
  });
  if (error) return error.message;

  revalidatePath("/kpi");
  return { bonusPct, scorePct };
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
