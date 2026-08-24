"use client";

import { useActionState, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createProject } from "@/lib/data/projects";

export function ProjectCreateForm({
  companies,
}: {
  companies: Array<{ id: string; name: string }>;
}) {
  const [error, formAction, pending] = useActionState(createProject, null);
  const [companyId, setCompanyId] = useState("");

  return (
    <Card className="bg-card/80 backdrop-blur">
      <CardContent className="pt-6">
        <form action={formAction} className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" required className="w-56" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="company_id">Company</Label>
            <Select name="company_id" required value={companyId} onValueChange={(v: unknown) => typeof v === "string" && setCompanyId(v)}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select company">{() => companies.find((c) => c.id === companyId)?.name ?? "Select company"}</SelectValue>
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
            <Label htmlFor="goal">Goal</Label>
            <Input id="goal" name="goal" className="w-64" />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Add project"}
          </Button>
        </form>
        {error && <p className="mt-2 text-sm font-medium text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
