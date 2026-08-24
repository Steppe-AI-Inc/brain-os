import { FileSearch, LoaderCircle, ShieldCheck, Tags } from "lucide-react";
import { getDocuments } from "@/lib/data/documents";
import { getCompanies } from "@/lib/data/companies";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { DocumentCreateForm } from "./document-create-form";
import { DocumentsTable } from "./documents-table";

export default async function DocumentsPage() {
  const [documents, companies] = await Promise.all([getDocuments(), getCompanies()]);
  const stats = [
    { label: "Tracked artifacts", value: documents.length, icon: FileSearch },
    {
      label: "Analyzing",
      value: documents.filter((document) => ["pending", "processing"].includes(document.analysis_status || "")).length,
      icon: LoaderCircle,
    },
    {
      label: "Needs review",
      value: documents.filter((document) =>
        document.analysis_status === "needs_review" || document.company_match_status === "review_needed"
      ).length,
      icon: Tags,
    },
    {
      label: "Ready for retrieval",
      value: documents.filter((document) => document.analysis_status === "ready").length,
      icon: ShieldCheck,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={FileSearch}
        title="Artifact Intelligence"
        description="Upload once. Brain OS classifies, assigns, tracks and retrieves authorized company knowledge."
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="bg-card/80">
              <CardContent className="flex items-center justify-between pt-5">
                <div>
                  <p className="text-2xl font-semibold tabular-nums">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
                <Icon className="h-5 w-5 text-primary" />
              </CardContent>
            </Card>
          );
        })}
      </div>
      <DocumentCreateForm
        companies={companies.map((company) => ({
          id: company.id,
          name: company.name,
          legal_entity_name: company.legal_entity_name,
          country: company.country,
          aliases: company.aliases,
        }))}
      />
      <DocumentsTable
        documents={documents}
        companies={companies.map((company) => ({ id: company.id, name: company.name }))}
      />
    </div>
  );
}
