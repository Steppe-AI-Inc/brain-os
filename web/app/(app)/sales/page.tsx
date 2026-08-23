import { TrendingUp } from "lucide-react";
import { getLeads } from "@/lib/data/sales";
import { getCompanies } from "@/lib/data/companies";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { LeadCreateForm } from "./lead-create-form";

export default async function SalesPage() {
  const [leads, companies] = await Promise.all([getLeads(), getCompanies()]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={TrendingUp} title="Sales OS" description="CRM pipeline." />
      <LeadCreateForm companies={companies} />
      <Card className="overflow-hidden bg-card/80 backdrop-blur">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Contact</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="font-medium">{l.client_name}</TableCell>
                <TableCell>{l.companies?.name ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{l.stage}</Badge>
                </TableCell>
                <TableCell>${l.value_estimate?.toLocaleString()}</TableCell>
                <TableCell>{l.contact_email ?? "—"}</TableCell>
              </TableRow>
            ))}
            {leads.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No leads visible yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
