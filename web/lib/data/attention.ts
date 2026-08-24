"use server";

import { createClient } from "@/lib/supabase/server";

export type AttentionItem = {
  id: string;
  kind: "approval" | "decision" | "blocked";
  title: string;
  subtitle: string | null;
  href: string;
  created_at: string;
};

/**
 * Merges three sources into one "wants your attention" feed — same idea as
 * blankcollar's /api/inbox, but reusing this schema's existing tables
 * (`approvals`, `goals`) rather than a dedicated inbox table.
 */
export async function getAttentionItems(): Promise<AttentionItem[]> {
  const supabase = await createClient();
  const [{ data: approvals }, { data: decisions }, { data: blocked }] = await Promise.all([
    supabase
      .from("approvals")
      .select("id, title, domain, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("goals")
      .select("id, title, created_at")
      .eq("kind", "decision")
      .in("status", ["draft", "active"])
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("goals")
      .select("id, title, created_at")
      .eq("status", "paused")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const items: AttentionItem[] = [
    ...(approvals ?? []).map((a) => ({
      id: a.id,
      kind: "approval" as const,
      title: a.title,
      subtitle: a.domain,
      href: "/approvals",
      created_at: a.created_at ?? "",
    })),
    ...(decisions ?? []).map((g) => ({
      id: g.id,
      kind: "decision" as const,
      title: g.title,
      subtitle: "needs a decision",
      href: `/goals/${g.id}`,
      created_at: g.created_at,
    })),
    ...(blocked ?? []).map((g) => ({
      id: g.id,
      kind: "blocked" as const,
      title: g.title,
      subtitle: "blocked",
      href: `/goals/${g.id}`,
      created_at: g.created_at,
    })),
  ];

  return items.sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 8);
}
