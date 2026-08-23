import { FileSignature } from "lucide-react";
import { getProposals } from "@/lib/data/proposals";
import { getCompanies } from "@/lib/data/companies";
import { getProductLines } from "@/lib/data/products";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { ProposalCreateForm } from "./proposal-create-form";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  needs_approval: "destructive",
  sent: "secondary",
  won: "default",
  lost: "destructive",
};

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
      <Card className="overflow-hidden bg-card/80 backdrop-blur">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Margin</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {proposals.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.title}</TableCell>
                <TableCell>{p.companies?.name ?? "—"}</TableCell>
                <TableCell>
                  {p.currency} {p.total?.toLocaleString()}
                </TableCell>
                <TableCell>{p.internal_margin?.toLocaleString()}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[p.status ?? "draft"] ?? "outline"}>
                    {(p.status ?? "draft").replace("_", " ")}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
            {proposals.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No proposals visible yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
