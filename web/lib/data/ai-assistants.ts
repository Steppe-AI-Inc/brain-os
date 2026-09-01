"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type AutomationMode = "manual" | "draft" | "auto_routine" | "fallback_after_timeout";

export async function getPersonAiPolicies() {
  const supabase = await createClient();
  const [{ data: people, error: peopleError }, { data: policies, error: policyError }] = await Promise.all([
    supabase.from("people").select("id, full_name, role_title, company_id, active, companies(name, status)").eq("active", true).order("full_name"),
    supabase.from("person_ai_policy").select("person_id, mode, fallback_sla_minutes, allowed_categories"),
  ]);
  if (peopleError) throw peopleError;
  if (policyError) throw policyError;

  const byPerson = new Map((policies ?? []).map((p) => [p.person_id, p]));
  return (people ?? []).map((person) => ({
    ...person,
    policy: byPerson.get(person.id) ?? { mode: "manual" as AutomationMode, fallback_sla_minutes: 60, allowed_categories: [] },
  }));
}

// Founder/admin only — RLS enforces this (person_ai_policy_write), but the friendly
// error is nicer than a bare Postgres permission-denied string. "An ordinary employee
// should not be able to grant their own AI broader authority" (governance doc) — this
// is deliberately not exposed to company managers, only founder/admin.
export async function setPersonAiPolicy(
  personId: string,
  mode: AutomationMode,
  fallbackSlaMinutes: number
): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "Not signed in.";
  const { data: profile } = await supabase.from("profiles").select("id").eq("auth_user_id", user.id).single();
  if (!profile) return "Profile not found.";

  const { error } = await supabase.from("person_ai_policy").upsert(
    {
      person_id: personId,
      mode,
      fallback_sla_minutes: fallbackSlaMinutes,
      updated_by_profile_id: profile.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "person_id" }
  );
  if (error) return error.message;

  revalidatePath("/ai-assistants");
  return null;
}

// Manual trigger for "the assigned human hasn't responded — the AI assistant answers,
// clearly labeled as AI." Real live SLA-timeout detection needs an actual external
// channel (Slack/WhatsApp/Telegram — not built yet) plus a scheduler to watch for
// silence; this is the same underlying capability (compose as the person's AI
// assistant, log it, never impersonate the human) exposed as an explicit action a
// manager/founder can invoke today against an existing chat channel.
export async function recordAiAssistantReply(input: {
  personId: string;
  channelId: string | null;
  replyText: string;
  mode: "draft" | "auto_routine" | "fallback_after_timeout";
}): Promise<string | null> {
  if (!input.replyText.trim()) return "Reply text is required.";
  const supabase = await createClient();
  const { error } = await supabase.from("ai_reply_log").insert({
    person_id: input.personId,
    channel_id: input.channelId,
    mode: input.mode,
    reply_text: input.replyText.trim(),
  });
  if (error) return error.message;
  revalidatePath("/ai-assistants");
  return null;
}

export async function getAiReplyLog(personId?: string) {
  const supabase = await createClient();
  let query = supabase
    .from("ai_reply_log")
    .select("id, person_id, mode, reply_text, created_at, people(full_name)")
    .order("created_at", { ascending: false })
    .limit(50);
  if (personId) query = query.eq("person_id", personId);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}
