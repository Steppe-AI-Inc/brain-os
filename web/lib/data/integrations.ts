import { createClient } from "@/lib/supabase/server";

export async function getIntegrationQueue() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("integration_queue")
    .select("id, integration, action, status, created_at, companies(name)")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return data;
}
