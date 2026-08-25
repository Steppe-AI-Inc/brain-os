/* eslint-disable @typescript-eslint/no-explicit-any */
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
    .select("id, title, status, priority, company_id, companies(name), source")
    .in("source", ["software_factory", "software_factory_v1"])
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return data;
}

export async function getSoftwareFactoryRuns() {
  const supabase = await createClient();
  const db = supabase as any;
  const { data, error } = await db
    .from("software_factory_runs")
    .select("id,organization_id,company_id,title,problem_statement,template_key,status,current_stage,repository_url,preview_url,output,created_at,companies(name),software_factory_stages(id,stage_key,sort_order,status,acceptance_criteria,evidence)")
    .order("created_at", { ascending: false });
  if (error) {
    if (String(error.message || "").includes("software_factory_runs")) return [];
    throw error;
  }
  return (data ?? []).map((row: any) => ({
    ...row,
    software_factory_stages: (row.software_factory_stages ?? []).sort((a: any, b: any) => Number(a.sort_order) - Number(b.sort_order)),
  }));
}

// Legacy PRD helper retained while v1 runs migrate to the staged factory lifecycle.
export async function createSoftwareSpec(_prevState: string | null, formData: FormData) {
  const title = String(formData.get("title") || "").trim();
  const companyId = String(formData.get("company_id") || "").trim();
  const problem = String(formData.get("problem") || "").trim();
  if (!title) return "Title is required.";

  const supabase = await createClient();
  const { data: spec, error } = await supabase
    .from("product_specs")
    .insert({ title: `AI PRD: ${title}`, company_id: companyId || null, status: "draft", body_md: problem || null })
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

const HOA_SCOPE = `# Mongolia HOA Automation Platform\n\n## Product outcome\nA complete multi-tenant HOA operating system for Mongolian residential associations, managers, accountants, residents and technicians.\n\n## Required modules\n- HOA/workspace, buildings, entrances, units and households\n- resident/owner/tenant accounts and invitation/login\n- recurring dues, invoice generation and payment status\n- resident balance and append-oriented financial ledger\n- payment provider abstraction with idempotent webhooks\n- transparent resident-facing financial window with configurable disclosure\n- expenses, vendors and service contracts\n- maintenance requests, work orders, technician assignment and QA\n- announcements, notifications and resident communication\n- document/artifact library\n- role/RLS separation: board/admin/accountant/manager/resident/technician/auditor\n- immutable audit trail for financial and privileged actions\n- EN/MN shell\n- mobile resident flows\n- automated unit/integration/RLS/Playwright tests\n- Vercel preview before release\n\n## Security acceptance\nA resident sees only authorized household/building data. A technician cannot see private HOA financials. One HOA cannot read another HOA. Payment callbacks are idempotent. Production release is approval-gated.`;

export async function createSoftwareFactoryRunAction(_prevState: string | null, formData: FormData) {
  const organizationId = String(formData.get("organization_id") || "");
  const companyId = String(formData.get("company_id") || "") || null;
  const title = String(formData.get("title") || "").trim();
  const templateKey = String(formData.get("template_key") || "custom");
  let problem = String(formData.get("problem_statement") || "").trim();
  if (!organizationId || !title) return "Workspace and project title are required.";
  if (templateKey === "hoa_mongolia") problem = `${problem ? `${problem}\n\n` : ""}${HOA_SCOPE}`;
  if (!problem) return "Describe the product/problem to build.";

  const supabase = await createClient();
  const db = supabase as any;
  const { data: runId, error } = await db.rpc("create_software_factory_run", {
    p_organization_id: organizationId,
    p_company_id: companyId,
    p_title: title,
    p_problem_statement: problem,
    p_template_key: templateKey === "custom" ? null : templateKey,
  });
  if (error || !runId) return error?.message || "Failed to create software factory run.";

  // Create the initial product spec as a durable artifact of the planning stage.
  const { data: spec } = await supabase
    .from("product_specs")
    .insert({
      title: `PRD: ${title}`,
      company_id: companyId,
      status: "draft",
      body_md: problem,
    })
    .select("id")
    .single();

  const planningTickets = [
    "Complete product brief and business outcome",
    "Finalize PRD and acceptance criteria",
    "Design architecture, threat model and RLS",
    "Design schema migration and rollback",
    "Design critical UX and mobile flows",
  ];
  for (const ticketTitle of planningTickets) {
    await supabase.from("tasks").insert({
      title: `${ticketTitle}: ${title}`,
      company_id: companyId,
      owner_type: "agent",
      status: "queued",
      priority: "high",
      risk_level: "medium",
      approval_required: false,
      source: "software_factory_v1",
      acceptance_criteria: ["Evidence attached to corresponding Software Factory stage"],
    });
  }

  await db
    .from("software_factory_runs")
    .update({
      output: {
        product_spec_id: spec?.id ?? null,
        template_key: templateKey,
        execution_rule: "No production release without tests, preview QA and human approval.",
      },
    })
    .eq("id", runId);

  revalidatePath("/software");
  revalidatePath("/tasks");
  return null;
}

export type ProductSpecInput = { title: string; status: string; bodyMd: string };

export async function updateProductSpec(id: string, input: ProductSpecInput) {
  if (!input.title.trim()) return "Title is required.";
  const supabase = await createClient();
  const { error } = await supabase
    .from("product_specs")
    .update({ title: input.title.trim(), status: input.status.trim() || "draft", body_md: input.bodyMd.trim() || null })
    .eq("id", id);
  if (error) return error.message;
  revalidatePath("/software");
  return null;
}

export async function deleteProductSpec(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("product_specs").delete().eq("id", id);
  if (error) return error.message;
  revalidatePath("/software");
  return null;
}
