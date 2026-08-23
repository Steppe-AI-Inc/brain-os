import { getProjects } from "@/lib/data/projects";
import { getCompanies } from "@/lib/data/companies";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ProjectCreateForm } from "./project-create-form";

export default async function ProjectsPage() {
  const [projects, companies] = await Promise.all([getProjects(), getCompanies()]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Projects</h1>
      <ProjectCreateForm companies={companies} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Company</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Deadline</TableHead>
            <TableHead>Risk</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {projects.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-medium">{p.title}</TableCell>
              <TableCell>{p.companies?.name ?? "—"}</TableCell>
              <TableCell>
                <Badge variant="secondary">{p.status}</Badge>
              </TableCell>
              <TableCell>{p.deadline ?? "—"}</TableCell>
              <TableCell>{p.risk_score}</TableCell>
            </TableRow>
          ))}
          {projects.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                No projects visible yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
