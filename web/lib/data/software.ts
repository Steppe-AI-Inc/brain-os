"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function getProductSpecs() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_specs")
    .select("id, title, status, body_md, company_id, companies(name), created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getSoftwareTickets() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, status, priority, company_id, companies(name)")
    .eq("source", "software_factory")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return data;
}

// Ported from js/modules/softwareFactory.js: creates a PRD (product_specs, the new
// Phase 3 table) plus a fixed set of atomic engineering tickets as `tasks` rows
// (source='software_factory') — tickets stay in the tasks table rather than a parallel
// table, per the rewrite plan's bias toward fewer new tables.
export async function createSoftwareSpec(_prevState: string | null, formData: FormData) {
  const title = String(formData.get("title") || "").trim();
  const companyId = String(formData.get("company_id") || "").trim();
  const problem = String(formData.get("problem") || "").trim();
  if (!title) return "Title is required.";

  const supabase = await createClient();
  const { data: spec, error } = await supabase
    .from("product_specs")
    .insert({
      title: `AI PRD: ${title}`,
      company_id: companyId || null,
      status: "draft",
      body_md: problem || null,
    })
    .select("id")
    .single();
  if (error || !spec) return error?.message || "Failed to create PRD.";

  const ticketTitles = [
    "Write product requirement and acceptance criteria",
    "Identify allowed modules and files only",
    "Implement patch-only code change",
    "Add module-specific UI check",
    "Run regression QA and record evidence",
    "Prepare release approval summary",
  ];
  for (let i = 0; i < ticketTitles.length; i++) {
    await supabase.from("tasks").insert({
      title: `${ticketTitles[i]}: ${title}`,
      company_id: companyId || null,
      owner_type: "human",
      status: "queued",
      priority: "high",
      risk_level: "medium",
      approval_required: i >= 2,
      source: "software_factory",
    });
  }

  await supabase.from("approvals").insert({
    company_id: companyId || null,
    title: `Approve software factory release: AI PRD: ${title}`,
    reason: "Production-impacting software changes require release gate approval.",
    risk_level: "high",
    domain: "production",
  });

  revalidatePath("/software");
  revalidatePath("/tasks");
  revalidatePath("/approvals");
  return null;
}
