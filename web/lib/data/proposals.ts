"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { approvalRisk, domainForRisk } from "@/lib/proposals/risk-score";
import { renderPdf, type PdfLine } from "@/lib/pdf/simple-pdf";

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

// Generates the actual forwardable artifact a proposal was missing — up to now
// "Generate proposal" only produced a database row with no document. Deliberately reads
// from proposal_items (unit_price, line_total) rather than proposals.internal_margin —
// this is a customer-facing document, and internal_margin/unit_cost must never appear in
// it (mirrors why safe_proposals view excludes internal_margin from non-founder reads).
export async function generateQuotationPdf(proposalId: string): Promise<string | { url: string }> {
  try {
    return await generateQuotationPdfInner(proposalId);
  } catch (e) {
    // Nothing downstream had a try/catch — any unhandled exception here (a bad Buffer,
    // an SDK incompatibility, anything) previously crashed the whole Server Action with
    // a bare 503 and zero information reaching the client. Verified live: this masked
    // the real error on every attempt. Whatever this catches now becomes a normal
    // string result the client already knows how to display.
    return e instanceof Error ? e.message : String(e);
  }
}

async function generateQuotationPdfInner(proposalId: string): Promise<string | { url: string }> {
  const supabase = await createClient();

  const { data: proposal, error: proposalError } = await supabase
    .from("proposals")
    .select("id, title, currency, subtotal, discount_pct, total, payment_terms, created_at, company_id, companies(name)")
    .eq("id", proposalId)
    .single();
  if (proposalError || !proposal) return proposalError?.message || "Proposal not found.";

  const { data: items, error: itemsError } = await supabase
    .from("proposal_items")
    .select("description, quantity, unit_price, line_total")
    .eq("proposal_id", proposalId);
  if (itemsError) return itemsError.message;

  const companyName = (proposal.companies as unknown as { name: string } | null)?.name || "—";
  const currency = proposal.currency || "USD";
  const fmt = (n: number | null) => `${currency} ${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const dateStr = new Date(proposal.created_at ?? Date.now()).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

  const lines: PdfLine[] = [
    { text: companyName, size: 20, bold: true, gapAfter: 4 },
    { text: "QUOTATION", size: 14, bold: true, gapAfter: 4 },
    { text: proposal.title, size: 12, gapAfter: 2 },
    { text: `Date: ${dateStr}`, size: 10, gapAfter: 18 },
  ];

  lines.push({ text: "Description", size: 11, bold: true });
  for (const item of items ?? []) {
    lines.push({
      text: `${item.description}  -  qty ${item.quantity}  x  ${fmt(item.unit_price)}  =  ${fmt(item.line_total)}`,
      size: 11,
      gapAfter: 4,
    });
  }
  lines.push({ text: "", size: 6, gapAfter: 10 });
  lines.push({ text: `Subtotal: ${fmt(proposal.subtotal)}`, size: 11 });
  if (proposal.discount_pct) lines.push({ text: `Discount: ${proposal.discount_pct}%`, size: 11 });
  lines.push({ text: `Total: ${fmt(proposal.total)}`, size: 13, bold: true, gapAfter: 18 });

  if (proposal.payment_terms) {
    lines.push({ text: "Payment terms", size: 11, bold: true });
    lines.push({ text: proposal.payment_terms, size: 11, gapAfter: 12 });
  }
  lines.push({ text: "This quotation is valid for 30 days from the date above.", size: 9 });

  const pdfBuffer = renderPdf(lines);
  const storagePath = `${proposal.company_id}/${proposalId}-quotation.pdf`;

  const { error: uploadError } = await supabase.storage.from("documents").upload(storagePath, pdfBuffer, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (uploadError) return uploadError.message;

  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("id").eq("auth_user_id", user.id).single()
    : { data: null };

  // No unique constraint on storage_path to upsert against — regenerating an existing
  // quotation (same proposalId) should update its row, not create a duplicate.
  const { data: existingDoc } = await supabase.from("documents").select("id").eq("storage_path", storagePath).maybeSingle();
  const documentFields = {
    company_id: proposal.company_id,
    title: `Quotation — ${proposal.title}`,
    category: "quotation",
    storage_path: storagePath,
    mime_type: "application/pdf",
    sensitivity: "internal" as const,
    uploaded_by_profile_id: profile?.id ?? null,
  };
  if (existingDoc) {
    await supabase.from("documents").update(documentFields).eq("id", existingDoc.id);
  } else {
    await supabase.from("documents").insert(documentFields);
  }

  const { data: signed, error: signError } = await supabase.storage
    .from("documents")
    .createSignedUrl(storagePath, 3600);
  if (signError || !signed) return signError?.message || "Generated the PDF but failed to create a download link.";

  revalidatePath("/proposals");
  revalidatePath("/documents");
  return { url: signed.signedUrl };
}
