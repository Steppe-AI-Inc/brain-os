"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function getInventory() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_items")
    .select(
      "id, sku, quantity_on_hand, reserved_quantity, reorder_point, location, company_id, companies(name), product_lines(name)"
    )
    .order("sku");
  if (error) throw error;
  return data;
}

// Ported from js/modules/productInventory.js's reorder-task generator: scan for items at
// or below reorder point, create one approval-gated task per item plus a single covering
// approval, both real rows via the RLS-hardened tasks/approvals tables from this
// session's earlier work — not a decorative alert.
export async function runReorderCheck(): Promise<string | { created: number }> {
  const supabase = await createClient();
  const { data: items, error } = await supabase
    .from("inventory_items")
    .select("id, sku, quantity_on_hand, reserved_quantity, reorder_point, company_id, product_lines(name)");
  if (error) return error.message;

  const low = (items ?? []).filter(
    (i) => (i.quantity_on_hand ?? 0) - (i.reserved_quantity ?? 0) <= (i.reorder_point ?? 0)
  );
  if (low.length === 0) return { created: 0 };

  const taskIds: string[] = [];
  for (const item of low) {
    const { data, error: taskError } = await supabase
      .from("tasks")
      .insert({
        title: `Inventory action required: ${item.product_lines?.name ?? item.sku ?? item.id}`,
        description: `Available stock is at or below reorder point (SKU ${item.sku ?? "n/a"}).`,
        company_id: item.company_id,
        owner_type: "agent",
        priority: "high",
        risk_level: "medium",
        approval_required: true,
        status: "needs_approval",
        source: "inventory_reorder_check",
      })
      .select("id")
      .single();
    if (!taskError && data) taskIds.push(data.id);
  }

  if (taskIds.length > 0) {
    await supabase.from("approvals").insert({
      title: `Approve inventory/procurement actions (${taskIds.length})`,
      reason: "Inventory shortage can block proposals/contracts.",
      risk_level: "medium",
      domain: "general",
      task_id: taskIds[0],
    });
  }

  revalidatePath("/inventory");
  revalidatePath("/tasks");
  revalidatePath("/approvals");
  return { created: taskIds.length };
}
