import { createClient } from "@/lib/supabase/server";

// Multi-org milestone: activeOrganizationId scopes the queue to the currently selected
// organization when set, same pattern as getPeople() in lib/data/people.ts — a query-shape
// filter only, RLS remains the sole authorization boundary either way.
export async function getIntegrationQueue(activeOrganizationId?: string | null) {
  const supabase = await createClient();
  let query = supabase
    .from("integration_queue")
    .select("id, integration, action, status, created_at, companies(name, status)")
    .order("created_at", { ascending: false })
    .limit(30);
  if (activeOrganizationId) query = query.eq("company_id", activeOrganizationId);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}
