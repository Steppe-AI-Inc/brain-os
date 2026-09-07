import Link from "next/link";
import { Building2, Archive } from "lucide-react";
import { getCompanies, getOrganizationRelationships, getArchivedCompanies } from "@/lib/data/companies";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { CompanyCreateForm } from "./company-create-form";
import { CompaniesTable } from "./companies-table";
import { OrganizationTree } from "./organization-tree";

export default async function CompaniesPage() {
  const [companies, relationships, archived] = await Promise.all([getCompanies(), getOrganizationRelationships(), getArchivedCompanies()]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Building2}
        title="Companies"
        description="Holding + operating entities."
        // BUG-014 (Work-PC, 2026-09-07): the Archived view holds the Restore control; the
        // count makes the affordance discoverable instead of a bare label.
        actions={
          <Link href="/companies/archived" className={buttonVariants({ variant: "outline" })} data-testid="companies-archived-link">
            <Archive className="h-4 w-4" />
            Archived ({archived.length})
          </Link>
        }
      />
      <CompanyCreateForm />
      <OrganizationTree companies={companies} relationships={relationships} />
      <CompaniesTable companies={companies} />
    </div>
  );
}
