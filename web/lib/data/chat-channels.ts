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

export type SidebarChannel = { id: string; name: string; isGeneral: boolean; lastActivityAt: string | null };

// Merges real channels with a synthetic "General" entry (the pre-channels flat history —
// work_orders.channel_id is null) into one list ordered by last activity, newest first.
// "General" only appears if it actually has messages — no point showing an empty legacy
// bucket to a founder who's never used anything but channels.
export async function getChannelsForSidebar(): Promise<SidebarChannel[]> {
  const supabase = await createClient();
  const [{ data: channels, error: channelsError }, { data: generalRows, error: generalError }] = await Promise.all([
    supabase.from("chat_channels").select("id, name, updated_at").eq("archived", false),
    supabase.from("work_orders").select("created_at").is("channel_id", null).order("created_at", { ascending: false }).limit(1),
  ]);
  if (channelsError) throw channelsError;
  if (generalError) throw generalError;

  const list: SidebarChannel[] = (channels ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    isGeneral: false,
    lastActivityAt: c.updated_at,
  }));

  const generalLast = generalRows?.[0]?.created_at ?? null;
  if (generalLast) {
    list.push({ id: "general", name: "General", isGeneral: true, lastActivityAt: generalLast });
  }

  list.sort((a, b) => new Date(b.lastActivityAt ?? 0).getTime() - new Date(a.lastActivityAt ?? 0).getTime());
  return list;
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
