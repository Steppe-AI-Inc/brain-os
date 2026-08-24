import { FileSignature } from "lucide-react";
import { getProposals } from "@/lib/data/proposals";
import { getCompanies } from "@/lib/data/companies";
import { getProductLines } from "@/lib/data/products";
import { PageHeader } from "@/components/page-header";
import { ProposalCreateForm } from "./proposal-create-form";
import { ProposalsTable } from "./proposals-table";

export default async function ProposalsPage() {
  const [proposals, companies, products] = await Promise.all([
    getProposals(),
    getCompanies(),
    getProductLines(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={FileSignature}
        title="Proposal Factory"
        description="Consolidated quote → proposal flow with server-computed risk scoring."
      />
      <ProposalCreateForm companies={companies} products={products} />
      <ProposalsTable proposals={proposals} />
    </div>
  );
}
