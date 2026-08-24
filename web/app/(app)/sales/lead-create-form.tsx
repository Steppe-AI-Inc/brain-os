"use client";

import { useActionState, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createLead } from "@/lib/data/sales";

export function LeadCreateForm({
  companies,
}: {
  companies: Array<{ id: string; name: string }>;
}) {
  const [error, formAction, pending] = useActionState(createLead, null);
  const [companyId, setCompanyId] = useState("");

  return (
    <Card className="bg-card/80 backdrop-blur">
      <CardContent className="pt-6">
        <form action={formAction} className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="client_name">Client</Label>
            <Input id="client_name" name="client_name" required className="w-52" />
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
            <Label htmlFor="contact_email">Contact email</Label>
            <Input id="contact_email" name="contact_email" type="email" className="w-52" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="value_estimate">Value estimate</Label>
            <Input id="value_estimate" name="value_estimate" type="number" className="w-32" />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Adding…" : "Add lead"}
          </Button>
        </form>
        {error && <p className="mt-2 text-sm font-medium text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
