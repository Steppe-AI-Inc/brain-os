import { TrendingUp } from "lucide-react";
import { getLeads } from "@/lib/data/sales";
import { getCompaniesForSelection } from "@/lib/data/companies";
import { getOrganizationContext } from "@/lib/data/organizations";
import { ALL_ORGANIZATIONS_ID } from "@/lib/data/organizations-types";
import { PageHeader } from "@/components/page-header";
import { LeadCreateForm } from "./lead-create-form";
import { LeadsTable } from "./leads-table";

export default async function SalesPage() {
  const organizations = await getOrganizationContext();
  const scopeToActiveOrg =
    organizations.memberships.length > 1 && organizations.activeOrganizationId !== ALL_ORGANIZATIONS_ID
      ? organizations.activeOrganizationId
      : null;
  const [leads, companies] = await Promise.all([getLeads(scopeToActiveOrg), getCompaniesForSelection()]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={TrendingUp} title="Sales OS" description="CRM pipeline." />
      <LeadCreateForm companies={companies} />
      <LeadsTable leads={leads} companies={companies.map((c) => ({ id: c.id, name: c.name }))} />
    </div>
  );
}
