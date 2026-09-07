import { Users } from "lucide-react";
import { getPeople } from "@/lib/data/people";
import { getCompaniesForSelection } from "@/lib/data/companies";
import { getOrganizationContext } from "@/lib/data/organizations";
import { scopeToActiveOrganization } from "@/lib/data/org-scope";
import { PageHeader } from "@/components/page-header";
import { PersonCreateForm } from "./person-create-form";
import { PeopleTable } from "./people-table";
import { KnowledgePackButton } from "./knowledge-pack-button";

export default async function PeoplePage() {
  const organizations = await getOrganizationContext();
  // Multi-membership users see People scoped to their active organization (real
  // behavior change per the org selector's own requirement). A user with exactly one
  // membership keeps the identical result either way, so this is invisible to them.
  const scopeToActiveOrg = scopeToActiveOrganization(organizations);
  const [people, companies] = await Promise.all([getPeople(scopeToActiveOrg), getCompaniesForSelection()]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Users}
        title="People"
        description={
          organizations.activeOrganizationName && scopeToActiveOrg
            ? `Team members in ${organizations.activeOrganizationName}.`
            : "Team members across every company."
        }
        actions={<KnowledgePackButton />}
      />
      <PersonCreateForm companies={companies} />
      <PeopleTable people={people} companies={companies.map((c) => ({ id: c.id, name: c.name }))} />
    </div>
  );
}
