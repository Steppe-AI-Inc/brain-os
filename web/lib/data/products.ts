"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function getProductLines() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_lines")
    .select("id, name, description, currency, unit_price, unit_cost, active, company_id, companies(name)")
    .order("name");
  if (error) throw error;
  return data;
}

// product_lines writes are manager-gated by RLS (product_lines_write_manager) — an
// employee submitting this form will get a clear RLS error back, not a silent failure.
export async function createProductLine(_prevState: string | null, formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const companyId = String(formData.get("company_id") || "").trim();
  const unitPrice = Number(formData.get("unit_price") || 0);
  const unitCost = Number(formData.get("unit_cost") || 0);
  if (!name) return "Name is required.";
  if (!companyId) return "Company is required.";

  const supabase = await createClient();
  const { error } = await supabase.from("product_lines").insert({
    name,
    company_id: companyId,
    unit_price: unitPrice,
    unit_cost: unitCost,
  });
  if (error) return error.message;

  revalidatePath("/products");
  return null;
}

export type ProductLineInput = { name: string; companyId: string; unitPrice: number; unitCost: number; active: boolean };

export async function updateProductLine(id: string, input: ProductLineInput) {
  if (!input.name.trim()) return "Name is required.";
  if (!input.companyId) return "Company is required.";
  const supabase = await createClient();
  const { error } = await supabase
    .from("product_lines")
    .update({
      name: input.name.trim(),
      company_id: input.companyId,
      unit_price: input.unitPrice,
      unit_cost: input.unitCost,
      active: input.active,
    })
    .eq("id", id);
  if (error) return error.message;
  revalidatePath("/products");
  return null;
}

// Deleting a product line cascades to its inventory_items (schema: ON DELETE CASCADE) —
// pre-existing data-integrity rule, not something added here.
export async function deleteProductLine(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("product_lines").delete().eq("id", id);
  if (error) return error.message;
  revalidatePath("/products");
  return null;
}
