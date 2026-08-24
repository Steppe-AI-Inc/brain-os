"use server";

import { createClient } from "@/lib/supabase/server";

export async function getActiveAgents() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agents")
    .select("id, name, role, active")
    .eq("active", true)
    .order("name", { ascending: true })
    .limit(6);
  if (error) throw error;
  return data;
}
