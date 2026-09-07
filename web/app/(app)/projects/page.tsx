import { FolderKanban } from "lucide-react";
import { getProjects } from "@/lib/data/projects";
import { getCompaniesForSelection } from "@/lib/data/companies";
import { getOrganizationContext } from "@/lib/data/organizations";
import { scopeToActiveOrganization } from "@/lib/data/org-scope";
import { PageHeader } from "@/components/page-header";
import { ProjectCreateForm } from "./project-create-form";
import { ProjectsTable } from "./projects-table";

export default async function ProjectsPage() {
  const organizations = await getOrganizationContext();
  const scopeToActiveOrg = scopeToActiveOrganization(organizations);
  const [projects, companies] = await Promise.all([getProjects(scopeToActiveOrg), getCompaniesForSelection()]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={FolderKanban}
        title="Projects"
        description={
          organizations.activeOrganizationName && scopeToActiveOrg
            ? `Active work in ${organizations.activeOrganizationName}.`
            : "Active work across the portfolio."
        }
      />
      <ProjectCreateForm companies={companies} />
      <ProjectsTable projects={projects} companies={companies.map((c) => ({ id: c.id, name: c.name }))} />
    </div>
  );
}
