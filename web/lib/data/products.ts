"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// unit_cost lives in product_costs (manager+ RLS), not on product_lines — fetched as a
// separate query (mirrors getPersonAiPolicies' pattern) rather than a PostgREST embed,
// so the shape stays a predictable flat map regardless of the 1:1 relationship's embed
// direction. A non-manager's product_costs query just comes back empty (RLS), not an
// error — they see every row with unit_cost omitted, not blocked from the page.
export async function getProductLines() {
  const supabase = await createClient();
  const [{ data, error }, { data: costs }] = await Promise.all([
    supabase
      .from("product_lines")
      .select("id, name, description, currency, unit_price, active, company_id, companies(name)")
      .order("name"),
    supabase.from("product_costs").select("product_line_id, unit_cost"),
  ]);
  if (error) throw error;
  const costByLine = new Map((costs ?? []).map((c) => [c.product_line_id, c.unit_cost]));
  return (data ?? []).map((p) => ({ ...p, unit_cost: costByLine.get(p.id) ?? null }));
}

// product_lines writes are manager-gated by RLS (product_lines_write_manager), and
// product_costs writes are separately manager-gated (product_costs_write) — an employee
// submitting this form will get a clear RLS error back, not a silent failure.
export async function createProductLine(_prevState: string | null, formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const companyId = String(formData.get("company_id") || "").trim();
  const unitPrice = Number(formData.get("unit_price") || 0);
  const unitCost = Number(formData.get("unit_cost") || 0);
  if (!name) return "Name is required.";
  if (!companyId) return "Company is required.";

  const supabase = await createClient();
  const { data: inserted, error } = await supabase
    .from("product_lines")
    .insert({
      name,
      company_id: companyId,
      unit_price: unitPrice,
    })
    .select("id")
    .single();
  if (error) return error.message;

  if (inserted) {
    const { error: costError } = await supabase.from("product_costs").insert({ product_line_id: inserted.id, unit_cost: unitCost });
    if (costError) return costError.message;
  }

  revalidatePath("/products");
  return null;
}

export type ProductLineInput = { name: string; companyId: string; unitPrice: number; unitCost: number; active: boolean };

// Both check affected row count, not just `error` — product_lines_write_manager RLS
// means a caller outside the company's manager tier silently matches 0 rows rather than
// erroring. Same defect class as qa/KNOWN_FAILURE_MODES.md #17/#18.
export async function updateProductLine(id: string, input: ProductLineInput) {
  if (!input.name.trim()) return "Name is required.";
  if (!input.companyId) return "Company is required.";
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_lines")
    .update({
      name: input.name.trim(),
      company_id: input.companyId,
      unit_price: input.unitPrice,
      active: input.active,
    })
    .eq("id", id)
    .select("id");
  if (error) return error.message;
  if (!data || data.length === 0) return "Nothing changed — this product may no longer exist or you may not have access to it.";

  const { error: costError } = await supabase
    .from("product_costs")
    .upsert({ product_line_id: id, unit_cost: input.unitCost }, { onConflict: "product_line_id" });
  if (costError) return costError.message;

  revalidatePath("/products");
  return null;
}

// Deleting a product line cascades to its inventory_items and product_costs (schema: ON
// DELETE CASCADE) — pre-existing data-integrity rule, not something added here.
export async function deleteProductLine(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("product_lines").delete().eq("id", id).select("id");
  if (error) return error.message;
  if (!data || data.length === 0) return "Nothing was deleted — this product may no longer exist or you may not have access to it.";
  revalidatePath("/products");
  return null;
}
