"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ChatChannel = {
  id: string;
  name: string;
  company_id: string | null;
  archived: boolean;
  created_at: string | null;
};

export async function getChannels(): Promise<ChatChannel[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chat_channels")
    .select("id, name, company_id, archived, created_at")
    .eq("archived", false)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createChannel(name: string, companyId?: string | null): Promise<{ id: string } | string> {
  const trimmed = name.trim();
  if (!trimmed) return "Channel name is required.";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return "Not signed in.";
  const { data: profile } = await supabase.from("profiles").select("id").eq("auth_user_id", user.id).single();
  if (!profile) return "Profile not found.";

  const { data, error } = await supabase
    .from("chat_channels")
    .insert({ name: trimmed, company_id: companyId || null, created_by_profile_id: profile.id })
    .select("id")
    .single();
  if (error) return error.message;

  revalidatePath("/chat");
  return { id: data.id };
}

export async function renameChannel(id: string, name: string): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return "Channel name is required.";
  const supabase = await createClient();
  const { error } = await supabase.from("chat_channels").update({ name: trimmed, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return error.message;
  revalidatePath("/chat");
  return null;
}

// Deleting a channel does not delete its messages — work_orders.channel_id is
// ON DELETE SET NULL, so every message just becomes unfiled (visible in "General")
// rather than being destroyed.
export async function deleteChannel(id: string): Promise<string | null> {
  const supabase = await createClient();
  const { error } = await supabase.from("chat_channels").delete().eq("id", id);
  if (error) return error.message;
  revalidatePath("/chat");
  return null;
}
