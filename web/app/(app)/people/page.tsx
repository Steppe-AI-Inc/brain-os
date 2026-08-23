import { getPeople } from "@/lib/data/people";
import { getCompanies } from "@/lib/data/companies";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PersonCreateForm } from "./person-create-form";

export default async function PeoplePage() {
  const [people, companies] = await Promise.all([getPeople(), getCompanies()]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">People</h1>
      <PersonCreateForm companies={companies} />
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
    </div>
  );
}
