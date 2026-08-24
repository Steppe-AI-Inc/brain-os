import { Building2 } from "lucide-react";
import { getCompanies } from "@/lib/data/companies";
import { PageHeader } from "@/components/page-header";
import { CompanyCreateForm } from "./company-create-form";
import { CompaniesTable } from "./companies-table";

export default async function CompaniesPage() {
  const companies = await getCompanies();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={Building2} title="Companies" description="Holding + operating entities." />
      <CompanyCreateForm />
      <CompaniesTable companies={companies} />
    </div>
  );
}
