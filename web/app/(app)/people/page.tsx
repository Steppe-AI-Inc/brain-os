import { Users } from "lucide-react";
import { getPeople } from "@/lib/data/people";
import { getCompanies } from "@/lib/data/companies";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { PersonCreateForm } from "./person-create-form";

export default async function PeoplePage() {
  const [people, companies] = await Promise.all([getPeople(), getCompanies()]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={Users} title="People" description="Team members across every company." />
      <PersonCreateForm companies={companies} />
      <Card className="overflow-hidden bg-card/80 backdrop-blur">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Email</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {people.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.full_name}</TableCell>
                <TableCell>{p.role_title ?? "—"}</TableCell>
                <TableCell>{p.companies?.name ?? "—"}</TableCell>
                <TableCell>{p.email ?? "—"}</TableCell>
              </TableRow>
            ))}
            {people.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No people visible yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
