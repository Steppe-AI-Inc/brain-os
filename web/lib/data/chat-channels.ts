"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizeSessionTitle } from "@/lib/chat/session-title";

const PENDING_PREFIX = "__pending__:";

export type ChatChannel = {
  id: string;
  name: string;
  company_id: string | null;
  archived: boolean;
  created_at: string | null;
  updated_at: string | null;
};

async function getCurrentProfileId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  return data?.id ?? null;
}

export async function getChannels(): Promise<ChatChannel[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chat_channels")
    .select("id, name, company_id, archived, created_at, updated_at")
    .eq("archived", false)
    .not("name", "like", `${PENDING_PREFIX}%`)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createChatSession(): Promise<{ id: string } | string> {
  const profileId = await getCurrentProfileId();
  if (!profileId) return "Your profile could not be loaded. Please sign in again.";

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chat_channels")
    .insert({
      name: `${PENDING_PREFIX}${crypto.randomUUID()}`,
      created_by_profile_id: profileId,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) return error.message;
  return { id: data.id };
}

export async function finalizeChatSession(
  id: string,
  aiTitle: string | null | undefined,
  summary: string | null | undefined,
  command: string
): Promise<string | null> {
  const title = normalizeSessionTitle(aiTitle, summary, command);
  const supabase = await createClient();
  const { error } = await supabase
    .from("chat_channels")
    .update({ name: title, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return error.message;
  revalidatePath("/chat");
  return null;
}

export async function touchChatSession(id: string): Promise<string | null> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("chat_channels")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return error.message;
  revalidatePath("/chat");
  return null;
}

export async function createChannel(name: string, companyId?: string | null): Promise<{ id: string } | string> {
  const trimmed = name.trim();
  if (!trimmed) return "Channel name is required.";
  const profileId = await getCurrentProfileId();
  if (!profileId) return "Profile not found.";

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chat_channels")
    .insert({
      name: trimmed,
      company_id: companyId || null,
      created_by_profile_id: profileId,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) return error.message;

  revalidatePath("/chat");
  return { id: data.id };
}

export async function renameChannel(id: string, name: string): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return "Conversation name is required.";
  const supabase = await createClient();
  const { error } = await supabase
    .from("chat_channels")
    .update({ name: trimmed.slice(0, 72), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return error.message;
  revalidatePath("/chat");
  return null;
}

export async function deleteChannel(id: string): Promise<string | null> {
  const supabase = await createClient();
  const { error } = await supabase.from("chat_channels").delete().eq("id", id);
  if (error) return error.message;
  revalidatePath("/chat");
  return null;
}
