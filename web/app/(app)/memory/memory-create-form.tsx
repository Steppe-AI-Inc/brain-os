"use client";

import { useActionState, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createMemory } from "@/lib/data/memory";

export function MemoryCreateForm({
  companies,
}: {
  companies: Array<{ id: string; name: string }>;
}) {
  const [error, formAction, pending] = useActionState(createMemory, null);
  const [companyId, setCompanyId] = useState("");

  return (
    <Card className="bg-card/80 backdrop-blur">
      <CardContent className="pt-6">
        <form action={formAction} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fact">Fact</Label>
            <Textarea id="fact" name="fact" required className="min-h-16" />
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="company_id">Company (optional)</Label>
              <Select name="company_id" value={companyId} onValueChange={(v: unknown) => typeof v === "string" && setCompanyId(v)}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="General">{() => companies.find((c) => c.id === companyId)?.name ?? "General"}</SelectValue>
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
              <Label htmlFor="sensitivity">Sensitivity</Label>
              <Select name="sensitivity" defaultValue="internal">
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public</SelectItem>
                  <SelectItem value="internal">Internal</SelectItem>
                  <SelectItem value="confidential">Confidential</SelectItem>
                  <SelectItem value="restricted">Restricted</SelectItem>
                  <SelectItem value="founder_only">Founder only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Add memory"}
            </Button>
          </div>
        </form>
        {error && <p className="mt-2 text-sm font-medium text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
