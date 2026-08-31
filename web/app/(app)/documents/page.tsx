import { FileText } from "lucide-react";
import { getDocuments } from "@/lib/data/documents";
import { getCompaniesForSelection } from "@/lib/data/companies";
import { getDepartments } from "@/lib/data/departments";
import { getProjects } from "@/lib/data/projects";
import { getOrganizationContext } from "@/lib/data/organizations";
import { ALL_ORGANIZATIONS_ID } from "@/lib/data/organizations-types";
import { PageHeader } from "@/components/page-header";
import { DocumentCreateForm } from "./document-create-form";
import { DocumentsTree } from "./documents-tree";
import { DocumentsTable } from "./documents-table";

export const maxDuration = 30;

export default async function DocumentsPage() {
  const organizations = await getOrganizationContext();
  const scopeToActiveOrg =
    organizations.memberships.length > 1 && organizations.activeOrganizationId !== ALL_ORGANIZATIONS_ID
      ? organizations.activeOrganizationId
      : null;
  const [documents, companies, departments, projects] = await Promise.all([
    getDocuments(scopeToActiveOrg),
    getCompaniesForSelection(),
    getDepartments(),
    getProjects(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={FileText}
        title="Documents & Knowledge"
        description={
          organizations.activeOrganizationName && scopeToActiveOrg
            ? `Files stored and sorted by category in ${organizations.activeOrganizationName}. Select multiple to batch-download or delete.`
            : "Files stored and sorted by company and category. Select multiple to batch-download or delete."
        }
      />
      <DocumentCreateForm
        companies={companies.map((c) => ({ id: c.id, name: c.name }))}
        departments={departments.map((d) => ({ id: d.id, name: d.name, company_id: d.company_id }))}
        projects={projects.map((p) => ({ id: p.id, title: p.title, company_id: p.company_id }))}
      />
      <DocumentsTree documents={documents} />
      <details className="rounded-xl border bg-card/60 p-3">
        <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
          All documents (edit sensitivity / company)
        </summary>
        <div className="mt-3">
          <DocumentsTable documents={documents} companies={companies.map((c) => ({ id: c.id, name: c.name }))} />
        </div>
      </details>
    </div>
  );
}
