"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type OnboardingPlan = {
  roleSummary: string;
  keyResponsibilities: string[];
  week1Plan: Array<{ day: string; focus: string; activities: string[]; resources: string[] }>;
  quiz: Array<{ question: string; expectedAnswerGuidance: string }>;
  certificationCriteria: string;
  gaps: string[];
};

function formatPlanAsText(personName: string, roleTitle: string, plan: OnboardingPlan): string {
  const lines: string[] = [];
  lines.push(`1-Week Induction Plan — ${personName} (${roleTitle})`, "");
  lines.push("ROLE SUMMARY", plan.roleSummary, "");
  lines.push("KEY RESPONSIBILITIES", ...plan.keyResponsibilities.map((r) => `- ${r}`), "");
  for (const day of plan.week1Plan) {
    lines.push(`${day.day}: ${day.focus}`);
    lines.push("Activities:", ...day.activities.map((a) => `  - ${a}`));
    if (day.resources.length) lines.push("Resources:", ...day.resources.map((r) => `  - ${r}`));
    lines.push("");
  }
  lines.push("CERTIFICATION TEST", ...plan.quiz.map((q, i) => `${i + 1}. ${q.question}\n   (guidance: ${q.expectedAnswerGuidance})`), "");
  lines.push("CERTIFICATION CRITERIA", plan.certificationCriteria, "");
  if (plan.gaps.length) lines.push("KNOWLEDGE GAPS FOUND", ...plan.gaps.map((g) => `- ${g}`));
  return lines.join("\n");
}

// Founder's ask: "generate your own education system and material... utilize full AI
// power" so a senior person doesn't burn weeks training each new hire in person.
// Grounded in real documents/goals/tasks already on file for the person's company — the
// digest is built here from RLS-scoped queries, not invented by the edge function.
export async function generateOnboardingPlan(personId: string): Promise<string | { documentId: string; plan: OnboardingPlan }> {
  const supabase = await createClient();
  const { data: person, error: personError } = await supabase
    .from("people")
    .select("id, full_name, role_title, company_id, companies(name)")
    .eq("id", personId)
    .single();
  if (personError || !person) return "Person not found.";
  if (!person.role_title) return "This person has no role title set — add one first so the plan can be grounded in it.";
  if (!person.company_id) return "This person has no company set — add one first so the plan can be grounded in real company material.";
  const companyId = person.company_id;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "Not signed in.";
  const { data: profile } = await supabase.from("profiles").select("id").eq("auth_user_id", user.id).single();
  if (!profile) return "Profile not found.";

  const [{ data: docs }, { data: goals }, { data: tasks }] = await Promise.all([
    supabase.from("documents").select("title, category, summary").eq("company_id", companyId).limit(30),
    supabase.from("goals").select("title, status, kind").eq("company_id", companyId).limit(15),
    supabase.from("tasks").select("title, status").eq("company_id", companyId).limit(20),
  ]);

  const digestParts: string[] = [];
  if (docs?.length) {
    digestParts.push("Documents on file:");
    digestParts.push(...docs.map((d) => `- [${d.category ?? "General"}] ${d.title}${d.summary ? `: ${d.summary.slice(0, 150)}` : ""}`));
  }
  if (goals?.length) {
    digestParts.push("", "Company goals:");
    digestParts.push(...goals.map((g) => `- (${g.kind}, ${g.status}) ${g.title}`));
  }
  if (tasks?.length) {
    digestParts.push("", "Recent/active tasks:");
    digestParts.push(...tasks.map((t) => `- (${t.status}) ${t.title}`));
  }

  const { data: invokeResult, error: invokeError } = await supabase.functions.invoke("generate-onboarding-plan", {
    body: {
      personName: person.full_name,
      roleTitle: person.role_title,
      companyName: person.companies?.name ?? "",
      digest: digestParts.join("\n"),
    },
  });
  if (invokeError) {
    const context = (invokeError as { context?: Response }).context;
    const detail = context ? await context.clone().json().catch(() => null) : null;
    return detail?.error || invokeError.message || "Plan generation failed.";
  }
  const plan = invokeResult?.result as OnboardingPlan | undefined;
  if (!plan) return invokeResult?.error || "Plan generation returned no result.";

  const { data: docRow, error: docError } = await supabase
    .from("documents")
    .insert({
      title: `${person.full_name} — 1-Week Induction Plan`,
      company_id: companyId,
      category: "HR",
      mime_type: "text/plain",
      extracted_text: formatPlanAsText(person.full_name, person.role_title, plan),
      summary: plan.roleSummary.slice(0, 200),
      sensitivity: "internal",
      uploaded_by_profile_id: profile.id,
    })
    .select("id")
    .single();
  if (docError || !docRow) return docError?.message || "Failed to save the induction plan.";

  await supabase.from("tasks").insert({
    title: `Complete 1-week induction: ${person.full_name}`,
    description: `AI-generated induction plan and certification test saved to Documents & Knowledge (HR category). Pass the test before taking on full responsibilities.`,
    company_id: companyId,
    owner_type: "human",
    owner_person_id: person.id,
    priority: "high",
    risk_level: "low",
    approval_required: false,
    status: "queued",
    source: "onboarding_plan",
  });

  revalidatePath("/people");
  revalidatePath("/documents");
  revalidatePath("/tasks");
  return { documentId: docRow.id, plan };
}
