/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type KnowledgePack = {
  id: string;
  organization_id: string;
  company_id: string | null;
  role_title: string;
  level: number;
  title: string;
  description: string | null;
  status: string;
  required_score: number;
  companies?: { name: string } | null;
  requirements?: Array<{
    id: string;
    category: string;
    title: string;
    editable_source_required: boolean;
    required: boolean;
  }>;
};

export async function getKnowledgePacks(): Promise<KnowledgePack[]> {
  const supabase = await createClient();
  const db = supabase as any;
  const { data, error } = await db
    .from("role_knowledge_packs")
    .select("id,organization_id,company_id,role_title,level,title,description,status,required_score,companies(name),role_knowledge_requirements(id,category,title,editable_source_required,required)")
    .order("role_title")
    .order("level");
  if (error) {
    if (String(error.message || "").includes("role_knowledge_packs")) return [];
    throw error;
  }
  return (data ?? []).map((row: any) => ({
    ...row,
    companies: Array.isArray(row.companies) ? row.companies[0] ?? null : row.companies ?? null,
    requirements: row.role_knowledge_requirements ?? [],
  }));
}

export async function getCertifications() {
  const supabase = await createClient();
  const db = supabase as any;
  const { data, error } = await db
    .from("role_certifications")
    .select("id,level,score,status,passed_at,people(full_name,role_title),role_knowledge_packs(title)")
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) {
    if (String(error.message || "").includes("role_certifications")) return [];
    throw error;
  }
  return data ?? [];
}

export async function createKnowledgePackAction(_prevState: string | null, formData: FormData) {
  const organizationId = String(formData.get("organization_id") || "");
  const companyId = String(formData.get("company_id") || "") || null;
  const roleTitle = String(formData.get("role_title") || "").trim();
  const title = String(formData.get("title") || "").trim();
  const level = Math.max(1, Number(formData.get("level") || 1));
  if (!organizationId || !roleTitle || !title) return "Workspace, role and title are required.";

  const supabase = await createClient();
  const db = supabase as any;
  const { data: pack, error } = await db
    .from("role_knowledge_packs")
    .insert({
      organization_id: organizationId,
      company_id: companyId,
      role_title: roleTitle,
      level,
      title,
      status: "draft",
      required_score: 80,
    })
    .select("id")
    .single();
  if (error || !pack) return error?.message || "Failed to create role pack.";

  const requirements = [
    { category: "role_sop", title: "Role SOP / operating playbook", editable_source_required: false, sort_order: 10 },
    { category: "brochure", title: "Current brochure / presentation", editable_source_required: true, sort_order: 20 },
    { category: "proposal_template", title: "Proposal / quotation template", editable_source_required: true, sort_order: 30 },
    { category: "pricing", title: "Pricing and commercial rules", editable_source_required: true, sort_order: 40 },
    { category: "reporting", title: "Reporting template and cadence", editable_source_required: true, sort_order: 50 },
    { category: "training", title: "Training material and examples", editable_source_required: false, sort_order: 60 },
    { category: "certification", title: "Level test / certification criteria", editable_source_required: false, sort_order: 70 },
  ].map((r) => ({ ...r, knowledge_pack_id: pack.id, required: true }));

  const { error: reqError } = await db.from("role_knowledge_requirements").insert(requirements);
  if (reqError) return reqError.message;

  revalidatePath("/role-knowledge");
  return null;
}
