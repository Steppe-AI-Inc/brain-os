"use client";

import { useActionState, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createDocument } from "@/lib/data/documents";
import { DOCUMENT_CATEGORIES, SENSITIVITY_OPTIONS, defaultSensitivityForCategory } from "@/lib/data/document-categories";

type Company = { id: string; name: string };
type Department = { id: string; name: string; company_id: string | null };
type Project = { id: string; title: string; company_id: string | null };

export function DocumentCreateForm({
  companies,
  departments,
  projects,
}: {
  companies: Company[];
  departments: Department[];
  projects: Project[];
}) {
  const [error, formAction, pending] = useActionState(createDocument, null);
  const [companyId, setCompanyId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [category, setCategoryState] = useState<string>(DOCUMENT_CATEGORIES[DOCUMENT_CATEGORIES.length - 1]);
  const [fileName, setFileName] = useState("");
  const [sensitivity, setSensitivity] = useState<string>(defaultSensitivityForCategory(category));
  const [sensitivityTouched, setSensitivityTouched] = useState(false);

  function setCategory(next: string) {
    setCategoryState(next);
    if (!sensitivityTouched) setSensitivity(defaultSensitivityForCategory(next));
  }

  const scopedDepartments = departments.filter((d) => !companyId || d.company_id === companyId);
  const scopedProjects = projects.filter((p) => !companyId || p.company_id === companyId);

  return (
    <Card className="bg-card/80 backdrop-blur">
      <CardContent className="pt-6">
        <form action={formAction} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="title">Title</Label>
              <Input id="title" name="title" required className="w-64" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="file">File (any type — PDF, PPTX, DOCX, images…)</Label>
              <Input
                id="file"
                name="file"
                type="file"
                onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
                className="w-64"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Company</Label>
              <Select value={companyId} onValueChange={(v) => setCompanyId(v as string)}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="No company">
                    {() => companies.find((c) => c.id === companyId)?.name ?? "No company"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No company</SelectItem>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" name="company_id" value={companyId === "none" ? "" : companyId} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as string)}>
                <SelectTrigger className="w-56">
                  <SelectValue>{() => category}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" name="category" value={category} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Sensitivity</Label>
              <Select
                value={sensitivity}
                onValueChange={(v) => {
                  setSensitivity(v as string);
                  setSensitivityTouched(true);
                }}
              >
                <SelectTrigger className="w-40">
                  <SelectValue>{() => sensitivity}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {SENSITIVITY_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" name="sensitivity" value={sensitivity} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Department (optional)</Label>
              <Select value={departmentId} onValueChange={(v) => setDepartmentId(v as string)}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="None">
                    {() => scopedDepartments.find((d) => d.id === departmentId)?.name ?? "None"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {scopedDepartments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" name="department_id" value={departmentId === "none" ? "" : departmentId} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Project (optional)</Label>
              <Select value={projectId} onValueChange={(v) => setProjectId(v as string)}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="None">
                    {() => scopedProjects.find((p) => p.id === projectId)?.title ?? "None"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {scopedProjects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" name="project_id" value={projectId === "none" ? "" : projectId} />
            </div>
          </div>

          {!fileName && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="text">Or paste text content (only if not attaching a file)</Label>
              <Textarea id="text" name="text" className="min-h-20" />
            </div>
          )}

          <Button type="submit" disabled={pending} className="self-start">
            {pending ? "Uploading…" : "Add document"}
          </Button>
        </form>
        {error && <p className="mt-2 text-sm font-medium text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
