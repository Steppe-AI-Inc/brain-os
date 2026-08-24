import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("persistent chat contracts", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "../supabase/migrations/202608290001_chat_history.sql"),
    "utf8"
  );
  const route = readFileSync(resolve(process.cwd(), "app/(app)/chat/stream/route.ts"), "utf8");
  const page = readFileSync(resolve(process.cwd(), "app/(app)/chat/chat-client.tsx"), "utf8");

  it("keeps chat threads private with row-level security", () => {
    expect(migration).toContain("alter table public.chat_threads enable row level security");
    expect(migration).toContain("alter table public.chat_messages enable row level security");
    expect(migration).toContain("created_by_profile_id = public.current_profile_id()");
    expect(migration).toContain("chat_messages_select_own_thread");
    expect(migration).toContain("revoke update, delete on public.chat_messages");
  });

  it("persists both sides of a command before and after streaming", () => {
    expect(route).toContain('role: "user"');
    expect(route).toContain('role: "assistant"');
    expect(route).toContain("persistMessage");
    expect(route).toContain('type: "thread"');
  });

  it("restores history and supports conversation management", () => {
    expect(page).toContain("initialMessages");
    expect(page).toContain("New conversation");
    expect(page).toContain("renameChatThread");
    expect(page).toContain("deleteChatThread");
  });
});