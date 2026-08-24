import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const criticalFiles = [
  "app/login/page.tsx",
  "app/(app)/dashboard/page.tsx",
  "app/(app)/goals/page.tsx",
  "app/(app)/board/page.tsx",
  "app/(app)/board/[id]/page.tsx",
  "app/(app)/board/[id]/work-board.tsx",
  "lib/data/boards.ts",
  "app/(app)/tasks/page.tsx",
  "app/(app)/approvals/page.tsx",
  "app/(app)/chat/page.tsx",
  "proxy.ts",
];

describe("SEM Brain application smoke", () => {
  it.each(criticalFiles)("includes the critical entry point %s", (file) => {
    expect(existsSync(resolve(process.cwd(), file))).toBe(true);
  });

  it("defines RLS-scoped board tables and transactional task movement", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "../supabase/migrations/202608280001_work_boards.sql"),
      "utf8"
    );

    expect(migration).toContain("alter table public.board_items enable row level security");
    expect(migration).toContain("create or replace function public.create_board_task");
    expect(migration).toContain("create or replace function public.move_board_item");
    expect(migration).toContain("create trigger board_item_audit_change");
    expect(migration).toContain("update public.tasks set status = v_status");
    expect(migration).toContain("Employees may assign board tasks only to themselves");
  });

  it("keeps the global authentication proxy connected", () => {
    const proxy = readFileSync(resolve(process.cwd(), "proxy.ts"), "utf8");

    expect(proxy).toContain("updateSession(request)");
    expect(proxy).toContain("matcher");
  });
});
