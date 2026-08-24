import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const criticalFiles = [
  "app/login/page.tsx",
  "app/(app)/dashboard/page.tsx",
  "app/(app)/goals/page.tsx",
  "app/(app)/tasks/page.tsx",
  "app/(app)/approvals/page.tsx",
  "app/(app)/chat/page.tsx",
  "proxy.ts",
];

describe("SEM Brain application smoke", () => {
  it.each(criticalFiles)("includes the critical entry point %s", (file) => {
    expect(existsSync(resolve(process.cwd(), file))).toBe(true);
  });

  it("keeps the global authentication proxy connected", () => {
    const proxy = readFileSync(resolve(process.cwd(), "proxy.ts"), "utf8");

    expect(proxy).toContain("updateSession(request)");
    expect(proxy).toContain("matcher");
  });
});
