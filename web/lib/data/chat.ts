"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type StoredChatThread = {
  id: string;
  title: string;
  lastMessageAt: string;
  createdAt: string;
};

export type StoredChatMessage = {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  status: "streaming" | "done" | "error";
  result: Record<string, unknown> | null;
  usage: { input_tokens?: number; output_tokens?: number } | null;
  error: string | null;
  createdAt: string;
};

export type ChatWorkspace = {
  threads: StoredChatThread[];
  activeThreadId: string | null;
  messages: StoredChatMessage[];
};

type ThreadRow = {
  id: string;
  title: string;
  last_message_at: string;
  created_at: string;
};

type MessageRow = {
  id: string;
  role: StoredChatMessage["role"];
  content: string;
  status: StoredChatMessage["status"];
  result: Record<string, unknown> | null;
  usage: { input_tokens?: number; output_tokens?: number } | null;
  error: string | null;
  created_at: string;
};

function untyped(client: Awaited<ReturnType<typeof createClient>>): SupabaseClient {
  return client as unknown as SupabaseClient;
}

function errorMessage(error: unknown): string {
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "The chat operation could not be completed.";
}

export async function getChatWorkspace(requestedThreadId?: string): Promise<ChatWorkspace> {
  const db = untyped(await createClient());
  const { data: threadData, error: threadError } = await db
    .from("chat_threads")
    .select("id, title, last_message_at, created_at")
    .is("archived_at", null)
    .order("last_message_at", { ascending: false })
    .limit(50);
  if (threadError) throw threadError;

  const rows = (threadData ?? []) as ThreadRow[];
  const activeThreadId =
    (requestedThreadId && rows.some((row) => row.id === requestedThreadId)
      ? requestedThreadId
      : rows[0]?.id) ?? null;

  let messages: StoredChatMessage[] = [];
  if (activeThreadId) {
    const { data, error } = await db
      .from("chat_messages")
      .select("id, role, content, status, result, usage, error, created_at")
      .eq("thread_id", activeThreadId)
      .order("created_at")
      .order("id");
    if (error) throw error;
    messages = ((data ?? []) as MessageRow[]).map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      status: row.status,
      result: row.result,
      usage: row.usage,
      error: row.error,
      createdAt: row.created_at,
    }));
  }

  return {
    threads: rows.map((row) => ({
      id: row.id,
      title: row.title,
      lastMessageAt: row.last_message_at,
      createdAt: row.created_at,
    })),
    activeThreadId,
    messages,
  };
}

export async function renameChatThread(
  threadId: string,
  title: string
): Promise<{ error: string | null }> {
  const cleanTitle = title.trim();
  if (!cleanTitle) return { error: "Conversation title is required." };
  if (cleanTitle.length > 160) return { error: "Conversation title must be 160 characters or fewer." };

  const db = untyped(await createClient());
  const { data, error } = await db
    .from("chat_threads")
    .update({ title: cleanTitle, updated_at: new Date().toISOString() })
    .eq("id", threadId)
    .select("id");
  if (error) return { error: errorMessage(error) };
  if (!data?.length) return { error: "Conversation was not found or is not yours." };

  revalidatePath("/chat");
  return { error: null };
}

export async function deleteChatThread(threadId: string): Promise<{ error: string | null }> {
  const db = untyped(await createClient());
  const { data, error } = await db.from("chat_threads").delete().eq("id", threadId).select("id");
  if (error) return { error: errorMessage(error) };
  if (!data?.length) return { error: "Conversation was not found or is not yours." };

  revalidatePath("/chat");
  return { error: null };
}