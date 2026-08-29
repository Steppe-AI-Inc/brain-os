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
// ai_command_runs.channel_id is null) into one list ordered by last activity, newest
// first. "General" only appears if it actually has messages — no point showing an empty
// legacy bucket to a founder who's never used anything but channels.
export async function getChannelsForSidebar(): Promise<SidebarChannel[]> {
  const supabase = await createClient();
  const [{ data: channels, error: channelsError }, { data: generalRows, error: generalError }] = await Promise.all([
    supabase.from("chat_channels").select("id, name, updated_at").eq("archived", false),
    supabase.from("ai_command_runs").select("created_at").is("channel_id", null).order("created_at", { ascending: false }).limit(1),
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

// All three below check affected row count, not just `error` — an RLS-blocked or
// already-gone channel returns success with 0 rows, not an error. Same defect class as
// the AI-chat "claimed a deletion that never executed" bug (qa/KNOWN_FAILURE_MODES.md
// #17/#18); found by searching for the same pattern elsewhere per CLAUDE.md §12.
// Backfills a freshly-created channel's company_id once the AI's response makes it known
// (KNOWN_FAILURE_MODES.md #7) — mirrors the existing "rename from the AI's understanding
// once the stream finishes" pattern, since the channel is created before the model
// responds and there's no company-picker in the "New chat" flow to know it any earlier.
// Only ever sets it once (`set_channel_company_id`'s own `company_id is null` guard) —
// never overwrites an explicitly-set company later.
export async function setChannelCompanyId(id: string, companyId: string): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc("set_channel_company_id", { p_channel_id: id, p_company_id: companyId });
}

export async function renameChannel(id: string, name: string): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return "Channel name is required.";
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chat_channels")
    .update({ name: trimmed, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error) return error.message;
  if (!data || data.length === 0) return "Nothing changed — this channel may no longer exist or you may not have access to it.";
  revalidatePath("/chat");
  return null;
}

// Deleting a channel does not delete its messages — ai_command_runs.channel_id is
// ON DELETE SET NULL, so every message just becomes unfiled (visible in "General")
// rather than being destroyed.
export async function deleteChannel(id: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("chat_channels").delete().eq("id", id).select("id");
  if (error) return error.message;
  if (!data || data.length === 0) return "Nothing was deleted — this channel may no longer exist or you may not have access to it.";
  revalidatePath("/chat");
  return null;
}

// Same non-destructive-to-messages property as deleteChannel, just for every real
// channel at once (the synthetic "General" entry isn't a real row and is never passed
// in). One real query, not N — added after repeated one-at-a-time "delete channel X"
// chat commands turned out to be slow going through the AI for something that's really
// just "empty the sidebar," which RLS on chat_channels already scopes correctly on its
// own without needing per-row confirmation from the model.
export async function deleteAllChannels(ids: string[]): Promise<string | null> {
  if (ids.length === 0) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("chat_channels").delete().in("id", ids).select("id");
  if (error) return error.message;
  const deletedCount = data?.length || 0;
  if (deletedCount > 0) revalidatePath("/chat");
  if (deletedCount < ids.length) {
    return `Only ${deletedCount} of ${ids.length} channel(s) were deleted — the rest may no longer exist or you may not have access to them.`;
  }
  return null;
}
