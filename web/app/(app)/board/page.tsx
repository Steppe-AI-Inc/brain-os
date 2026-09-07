import { Kanban } from "lucide-react";
import { getGoals } from "@/lib/data/goals";
import { getOrganizationContext } from "@/lib/data/organizations";
import { scopeToActiveOrganization } from "@/lib/data/org-scope";
import { PageHeader } from "@/components/page-header";
import { BoardColumns } from "./board-columns";

export default async function BoardPage() {
  // Overnight multi-org milestone follow-up (found during independent verification,
  // qa/KNOWN_FAILURE_MODES.md #59): Board is a second, drag-and-drop view of the exact
  // same `goals` entity the Goals page already scopes to the active organization
  // (web/app/(app)/goals/page.tsx). Board was missed when org-scoping was extended to
  // Goals — same entity, same active-org selection, but this page showed every goal RLS
  // allowed regardless of the selector. Same pattern as every other scoped page.
  const organizations = await getOrganizationContext();
  const scopeToActiveOrg = scopeToActiveOrganization(organizations);
  const goals = await getGoals(scopeToActiveOrg);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Kanban}
        title="Board"
        description="Every goal's status, one drag away from changing. Every move is audited."
      />
      <BoardColumns goals={goals} />
    </div>
  );
}
