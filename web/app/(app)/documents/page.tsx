import { FileText } from "lucide-react";
import { getDocuments } from "@/lib/data/documents";
import { getCompanies } from "@/lib/data/companies";
import { PageHeader } from "@/components/page-header";
import { DocumentCreateForm } from "./document-create-form";
import { DocumentsTable } from "./documents-table";

export default async function DocumentsPage() {
  const [documents, companies] = await Promise.all([getDocuments(), getCompanies()]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={FileText} title="Documents & Knowledge" description="Uploaded/pasted content, indexed for reference." />
      <DocumentCreateForm />
      <DocumentsTable documents={documents} companies={companies.map((c) => ({ id: c.id, name: c.name }))} />
    </div>
  );
}
