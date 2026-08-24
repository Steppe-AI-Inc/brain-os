"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { approvalRisk, domainForRisk } from "@/lib/proposals/risk-score";

export async function getProposals() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("proposals")
    .select(
      "id, title, status, currency, subtotal, discount_pct, total, internal_margin, payment_terms, version, created_at, companies(name)"
    )
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

// Consolidates the old dealDesk.js + proposalFactory.js into one flow, per the rewrite
// plan (proposalFactory was a strict superset). "Quotations" fold into
// proposals.status='draft' rather than a separate table.
export async function createProposal(_prevState: string | null, formData: FormData) {
  const title = String(formData.get("title") || "").trim();
  const companyId = String(formData.get("company_id") || "").trim();
  const productLineId = String(formData.get("product_line_id") || "").trim();
  const quantity = Number(formData.get("quantity") || 1);
  const discountPct = Number(formData.get("discount_pct") || 0);
  const paymentTerms = String(formData.get("payment_terms") || "").trim();

  if (!title) return "Title is required.";
  if (!companyId) return "Company is required.";
  if (!productLineId) return "Product is required.";

  const supabase = await createClient();

  const { data: product, error: productError } = await supabase
    .from("product_lines")
    .select("id, name, currency, unit_price, unit_cost")
    .eq("id", productLineId)
    .single();
  if (productError || !product) return "Could not load the selected product.";

  const { data: inventory } = await supabase
    .from("inventory_items")
    .select("quantity_on_hand, reserved_quantity")
    .eq("product_line_id", productLineId);
  const available = (inventory ?? []).reduce(
    (sum, i) => sum + (i.quantity_on_hand ?? 0) - (i.reserved_quantity ?? 0),
    0
  );
  const shortageLines = available > 0 && available < quantity ? [`${product.name}: need ${quantity}, available ${available}`] : [];

  const subtotal = quantity * (product.unit_price ?? 0);
  const cost = quantity * (product.unit_cost ?? 0);
  const discount = subtotal * (discountPct / 100);
  const total = subtotal - discount;
  const margin = total - cost;
  const marginPct = total ? Math.round((margin / total) * 100) : 0;

  const risk = approvalRisk({ discountPct, marginPct, paymentTerms, shortageLines });
  const needsApproval = risk.risk !== "low";

  const { data: proposal, error: proposalError } = await supabase
    .from("proposals")
    .insert({
      title,
      company_id: companyId,
      currency: product.currency,
      subtotal,
      discount_pct: discountPct,
      total,
      internal_margin: margin,
      payment_terms: paymentTerms || null,
      status: needsApproval ? "needs_approval" : "draft",
    })
    .select("id")
    .single();
  if (proposalError || !proposal) return proposalError?.message || "Failed to create proposal.";

  await supabase.from("proposal_items").insert({
    proposal_id: proposal.id,
    product_line_id: productLineId,
    description: product.name,
    quantity,
    unit_price: product.unit_price,
    unit_cost: product.unit_cost,
    line_total: subtotal,
  });

  if (needsApproval) {
    await supabase.from("approvals").insert({
      company_id: companyId,
      proposal_id: proposal.id,
      title: `Approve proposal: ${title}`,
      reason: risk.reasons.join(" "),
      risk_level: risk.risk,
      domain: domainForRisk(risk),
    });
  }

  if (shortageLines.length > 0) {
    await supabase.from("tasks").insert({
      title: `Resolve inventory before contract: ${title}`,
      description: shortageLines.join(" "),
      company_id: companyId,
      owner_type: "agent",
      priority: "high",
      risk_level: "high",
      approval_required: true,
      status: "needs_approval",
      source: "proposal_inventory_shortage",
    });
  }

  revalidatePath("/proposals");
  revalidatePath("/approvals");
  revalidatePath("/tasks");
  return null;
}

export type ProposalInput = { title: string; status: string; paymentTerms: string };

export async function updateProposal(id: string, input: ProposalInput) {
  if (!input.title.trim()) return "Title is required.";
  const supabase = await createClient();
  const { error } = await supabase
    .from("proposals")
    .update({
      title: input.title.trim(),
      status: input.status.trim() || "draft",
      payment_terms: input.paymentTerms.trim() || null,
    })
    .eq("id", id);
  if (error) return error.message;
  revalidatePath("/proposals");
  return null;
}

export async function deleteProposal(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("proposals").delete().eq("id", id);
  if (error) return error.message;
  revalidatePath("/proposals");
  return null;
}
