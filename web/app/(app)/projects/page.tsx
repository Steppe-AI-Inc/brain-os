import { FolderKanban } from "lucide-react";
import { getProjects } from "@/lib/data/projects";
import { getCompaniesForSelection } from "@/lib/data/companies";
import { getOrganizationContext } from "@/lib/data/organizations";
import { ALL_ORGANIZATIONS_ID } from "@/lib/data/organizations-types";
import { PageHeader } from "@/components/page-header";
import { ProjectCreateForm } from "./project-create-form";
import { ProjectsTable } from "./projects-table";

export default async function ProjectsPage() {
  const organizations = await getOrganizationContext();
  const scopeToActiveOrg =
    organizations.memberships.length > 1 && organizations.activeOrganizationId !== ALL_ORGANIZATIONS_ID
      ? organizations.activeOrganizationId
      : null;
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
