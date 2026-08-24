"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RowActionsMenu } from "@/components/row-actions-menu";
import { EditSheet } from "@/components/edit-sheet";
import { updateProject, deleteProject, type ProjectInput } from "@/lib/data/projects";

type ProjectRow = {
  id: string;
  title: string;
  status: string | null;
  deadline: string | null;
  risk_score: number | null;
  company_id: string | null;
  companies: { name: string } | null;
};

export function ProjectsTable({
  projects,
  companies,
}: {
  projects: ProjectRow[];
  companies: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<ProjectRow | null>(null);
  const [values, setValues] = useState<ProjectInput>({ title: "", companyId: "", goal: "", status: "active", deadline: "" });

  function openEdit(p: ProjectRow) {
    setValues({
      title: p.title,
      companyId: p.company_id ?? "",
      goal: "",
      status: p.status ?? "active",
      deadline: p.deadline ?? "",
    });
    setEditing(p);
  }

  return (
    <>
      <Card className="overflow-hidden bg-card/80 backdrop-blur">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Deadline</TableHead>
              <TableHead>Risk</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.map((p) => (
              <TableRow key={p.id} className="group/row">
                <TableCell className="font-medium">{p.title}</TableCell>
                <TableCell>{p.companies?.name ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{p.status}</Badge>
                </TableCell>
                <TableCell>{p.deadline ?? "—"}</TableCell>
                <TableCell>{p.risk_score}</TableCell>
                <TableCell>
                  <RowActionsMenu
                    itemLabel="project"
                    className="opacity-0 group-hover/row:opacity-100"
                    onEdit={() => openEdit(p)}
                    onDelete={() => deleteProject(p.id)}
                  />
                </TableCell>
              </TableRow>
            ))}
            {projects.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No projects visible yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <EditSheet
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
        title="Edit project"
        saveDisabled={!values.title.trim() || !values.companyId}
        onSave={async () => {
          if (!editing) return null;
          const result = await updateProject(editing.id, values);
          if (!result) router.refresh();
          return result;
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-project-title">Title</Label>
          <Input id="edit-project-title" value={values.title} onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-project-company">Company</Label>
          <Select value={values.companyId} onValueChange={(v: unknown) => typeof v === "string" && setValues((prev) => ({ ...prev, companyId: v }))}>
            <SelectTrigger id="edit-project-company" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-project-status">Status</Label>
          <Input id="edit-project-status" value={values.status} onChange={(e) => setValues((v) => ({ ...v, status: e.target.value }))} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-project-deadline">Deadline</Label>
          <Input id="edit-project-deadline" type="date" value={values.deadline} onChange={(e) => setValues((v) => ({ ...v, deadline: e.target.value }))} />
        </div>
      </EditSheet>
    </>
  );
}
