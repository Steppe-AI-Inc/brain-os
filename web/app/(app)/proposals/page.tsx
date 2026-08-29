import { FileSignature } from "lucide-react";
import { getProposals } from "@/lib/data/proposals";
import { getCompaniesForSelection } from "@/lib/data/companies";
import { getProductLines } from "@/lib/data/products";
import { PageHeader } from "@/components/page-header";
import { ProposalCreateForm } from "./proposal-create-form";
import { ProposalsTable } from "./proposals-table";

// generateQuotationPdf (a Server Action invoked from this route) does PDF assembly +
// a Storage upload + a signed-URL round trip — no maxDuration here meant it inherited
// Vercel's platform default and got killed mid-request with a bare 503, no error message
// reaching the client at all. Same class of bug as /chat/stream, /finance, /engineering
// earlier — verified live this one was still missing it.
export const maxDuration = 60;

export default async function ProposalsPage() {
  const [proposals, companies, products] = await Promise.all([
    getProposals(),
    getCompaniesForSelection(),
    getProductLines(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={FileSignature}
        title="Proposal Factory"
        description="Quote-to-proposal workflow with automatic risk scoring."
      />
      <ProposalCreateForm companies={companies} products={products} />
      <ProposalsTable proposals={proposals} />
    </div>
  );
}
