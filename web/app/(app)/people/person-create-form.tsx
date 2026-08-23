"use client";

import { useActionState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createPerson } from "@/lib/data/people";

export function PersonCreateForm({
  companies,
}: {
  companies: Array<{ id: string; name: string }>;
}) {
  const [error, formAction, pending] = useActionState(createPerson, null);

  return (
    <Card className="bg-card/80 backdrop-blur">
      <CardContent className="pt-6">
        <form action={formAction} className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="full_name">Full name</Label>
            <Input id="full_name" name="full_name" required className="w-48" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="role_title">Role title</Label>
            <Input id="role_title" name="role_title" className="w-40" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" className="w-52" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="company_id">Company</Label>
            <Select name="company_id">
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select company" />
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
            {pending ? "Adding…" : "Add person"}
          </Button>
        </form>
        {error && <p className="mt-2 text-sm font-medium text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
