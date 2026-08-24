import { Landmark } from "lucide-react";
import { getDepartments } from "@/lib/data/departments";
import { getCompanies } from "@/lib/data/companies";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { DepartmentCreateForm } from "./department-create-form";

export default async function DepartmentsPage() {
  const [departments, companies] = await Promise.all([getDepartments(), getCompanies()]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Landmark}
        title="Departments"
        description="Nested under each company — Goals and the Board can be scoped to one."
      />
      <DepartmentCreateForm companies={companies} />
      <Card className="overflow-hidden border-border/80 shadow-none">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Active goals</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {departments.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">{d.name}</TableCell>
                <TableCell className="text-muted-foreground">{d.companies?.name ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={d.active_goal_count > 0 ? "default" : "secondary"}>
                    {d.active_goal_count}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
            {departments.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  No departments yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
