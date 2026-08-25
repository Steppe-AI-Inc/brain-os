"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Founder governance doc, section 1: senior/manager roles should build a reusable Role
// Knowledge Pack instead of repeatedly training each new hire in person. Heuristic for
// "senior": role_title mentions a seniority/leadership keyword — matches the real roles
// on file (CTO, Software Chief Engineer, Senior Software Developer) without requiring a
// separate seniority flag that doesn't exist in the schema yet.
const SENIORITY_PATTERN = /chief|manager|director|lead|head|ceo|cto|coo|founder|senior/i;

const KNOWLEDGE_PACK_DESCRIPTION = `Submit the source materials someone else would need to reproduce your work, so a replacement can learn from Brain OS + pass tests instead of costing you weeks of 1:1 training.

Needed, where applicable to your role:
- SOPs / standard operating procedures
- Approved brochures and sales/marketing material
- Proposal and quotation templates
- Pricing guidance
- Customer scripts
- Partner/vendor lists
- Weekly reporting templates
- Lessons learned / post-mortems

Editable source is required where one exists — a PDF-only brochure isn't enough if the original was a PPTX. Upload both (e.g. PPTX + PDF, DOCX + PDF, XLSX + PDF) via Documents & Knowledge; the browser flags a submission with a missing editable source automatically.`;

export async function requestRoleKnowledgePacks(): Promise<string | { created: number; skipped: number }> {
  const supabase = await createClient();
  const { data: people, error } = await supabase
    .from("people")
    .select("id, full_name, role_title, company_id")
    .eq("active", true);
  if (error) return error.message;
  if (!people) return { created: 0, skipped: 0 };

  const seniorPeople = people.filter((p) => p.role_title && SENIORITY_PATTERN.test(p.role_title));

  let created = 0;
  for (const person of seniorPeople) {
    const { error: taskError } = await supabase.from("tasks").insert({
      title: `Submit your Role Knowledge Pack: ${person.full_name} (${person.role_title})`,
      description: KNOWLEDGE_PACK_DESCRIPTION,
      company_id: person.company_id,
      owner_type: "human",
      owner_person_id: person.id,
      priority: "medium",
      risk_level: "low",
      approval_required: false,
      status: "queued",
      source: "knowledge_pack_request",
    });
    if (!taskError) created++;
  }

  revalidatePath("/people");
  revalidatePath("/tasks");
  return { created, skipped: people.length - seniorPeople.length };
}
