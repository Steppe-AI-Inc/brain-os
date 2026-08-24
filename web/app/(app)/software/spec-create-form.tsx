"use client";

import { useActionState, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createSoftwareSpec } from "@/lib/data/software";

export function SpecCreateForm({
  companies,
}: {
  companies: Array<{ id: string; name: string }>;
}) {
  const [error, formAction, pending] = useActionState(createSoftwareSpec, null);
  const [companyId, setCompanyId] = useState("");

  return (
    <Card className="bg-card/80 backdrop-blur">
      <CardHeader>
        <CardTitle className="text-base">New software factory request</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="title">Feature title</Label>
              <Input id="title" name="title" required className="w-64" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="company_id">Company</Label>
              <Select name="company_id" value={companyId} onValueChange={(v: unknown) => typeof v === "string" && setCompanyId(v)}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Parent / any">{() => companies.find((c) => c.id === companyId)?.name ?? "Parent / any"}</SelectValue>
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
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create PRD + 6 tickets"}
            </Button>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="problem">Problem statement</Label>
            <Textarea id="problem" name="problem" className="min-h-16" />
          </div>
        </form>
        {error && <p className="mt-2 text-sm font-medium text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
