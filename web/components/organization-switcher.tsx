"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, ChevronsUpDown } from "lucide-react";
import { setActiveOrganization } from "@/lib/data/organizations";
import type { OrganizationContext } from "@/lib/data/organizations-types";

// Overnight multi-org milestone — real organization selector in the app shell.
// Selecting an organization here changes the CURRENT WORK CONTEXT server-side (a
// validated, httpOnly cookie - see lib/data/organizations.ts's own header for why this
// is a UI convenience, never a source of authority). router.refresh() re-runs every
// server component on the current route, so any page that reads
// getOrganizationContext() picks up the new active org on the very next render - no
// full page reload needed.
export function OrganizationSwitcher({ context }: { context: OrganizationContext }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (context.memberships.length === 0) return null;

  function handleChange(id: string) {
    if (id === context.activeOrganizationId) return;
    startTransition(async () => {
      await setActiveOrganization(id);
      router.refresh();
    });
  }

  // A single membership still shows the real name (so the active-org concept is always
  // visible/legible), just without a functioning switcher - nothing to switch to.
  if (context.memberships.length === 1) {
    return (
      <div className="mb-3 flex items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent/60 px-2.5 py-2 text-xs text-muted-foreground">
        <Building2 className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{context.memberships[0].name}</span>
      </div>
    );
  }

  return (
    <div className="relative mb-3">
      <label className="sr-only" htmlFor="org-switcher">
        Current organization
      </label>
      <div className="flex items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent/60 px-2.5 py-2 text-sm">
        <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <select
          id="org-switcher"
          value={context.activeOrganizationId ?? ""}
          disabled={isPending}
          onChange={(e) => handleChange(e.target.value)}
          className="w-full flex-1 truncate bg-transparent text-sm font-medium outline-none disabled:opacity-60"
        >
          {context.memberships.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </div>
    </div>
  );
}
