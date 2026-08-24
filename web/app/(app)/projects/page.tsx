import { FolderKanban } from "lucide-react";
import { getProjects } from "@/lib/data/projects";
import { getCompanies } from "@/lib/data/companies";
import { PageHeader } from "@/components/page-header";
import { ProjectCreateForm } from "./project-create-form";
import { ProjectsTable } from "./projects-table";

export default async function ProjectsPage() {
  const [projects, companies] = await Promise.all([getProjects(), getCompanies()]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={FolderKanban} title="Projects" description="Active work across the portfolio." />
      <ProjectCreateForm companies={companies} />
      <ProjectsTable projects={projects} companies={companies.map((c) => ({ id: c.id, name: c.name }))} />
    </div>
  );
}
