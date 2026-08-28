import { Building2 } from "lucide-react";
import { getCompanies, getOrganizationRelationships } from "@/lib/data/companies";
import { PageHeader } from "@/components/page-header";
import { CompanyCreateForm } from "./company-create-form";
import { CompaniesTable } from "./companies-table";
import { OrganizationTree } from "./organization-tree";

export default async function CompaniesPage() {
  const [companies, relationships] = await Promise.all([getCompanies(), getOrganizationRelationships()]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={Building2} title="Companies" description="Holding + operating entities." />
      <CompanyCreateForm />
      <OrganizationTree companies={companies} relationships={relationships} />
      <CompaniesTable companies={companies} />
    </div>
  );
}
