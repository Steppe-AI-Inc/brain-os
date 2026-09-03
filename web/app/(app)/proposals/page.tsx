import { FileSignature } from "lucide-react";
import { getProposals } from "@/lib/data/proposals";
import { getCompaniesForSelection } from "@/lib/data/companies";
import { getProductLines } from "@/lib/data/products";
import { getOrganizationContext } from "@/lib/data/organizations";
import { ALL_ORGANIZATIONS_ID } from "@/lib/data/organizations-types";
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
  const organizations = await getOrganizationContext();
  const scopeToActiveOrg =
    organizations.memberships.length > 1 && organizations.activeOrganizationId !== ALL_ORGANIZATIONS_ID
      ? organizations.activeOrganizationId
      : null;
  const [proposals, companies, products] = await Promise.all([
    getProposals(scopeToActiveOrg),
    getCompaniesForSelection(),
    getProductLines(scopeToActiveOrg),
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
