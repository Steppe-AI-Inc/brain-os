import { Landmark } from "lucide-react";
import { getDepartments } from "@/lib/data/departments";
import { getCompaniesForSelection } from "@/lib/data/companies";
import { getOrganizationContext } from "@/lib/data/organizations";
import { scopeToActiveOrganization } from "@/lib/data/org-scope";
import { PageHeader } from "@/components/page-header";
import { DepartmentCreateForm } from "./department-create-form";
import { DepartmentsTable } from "./departments-table";

export default async function DepartmentsPage() {
  const organizations = await getOrganizationContext();
  const scopeToActiveOrg = scopeToActiveOrganization(organizations);
  const [departments, companies] = await Promise.all([getDepartments(scopeToActiveOrg), getCompaniesForSelection()]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Landmark}
        title="Departments"
        description="Nested under each company — Goals and the Board can be scoped to one."
      />
      <DepartmentCreateForm companies={companies} />
      <DepartmentsTable departments={departments} companies={companies.map((c) => ({ id: c.id, name: c.name }))} />
    </div>
  );
}
