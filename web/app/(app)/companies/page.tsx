import { getCompanies } from "@/lib/data/companies";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CompanyCreateForm } from "./company-create-form";

export default async function CompaniesPage() {
  const companies = await getCompanies();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Companies</h1>
      <CompanyCreateForm />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Country</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Risk</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {companies.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="font-medium">{c.name}</TableCell>
              <TableCell>{c.country ?? "—"}</TableCell>
              <TableCell>
                <Badge variant={c.status === "active" ? "default" : "secondary"}>
                  {c.status}
                </Badge>
              </TableCell>
              <TableCell>{c.strategic_priority}</TableCell>
              <TableCell>{c.risk_score}</TableCell>
            </TableRow>
          ))}
          {companies.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                No companies visible — either none exist yet, or RLS is scoping you out
                of the ones that do.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
