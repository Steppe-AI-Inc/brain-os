"use client";

import { useActionState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { createCompany } from "@/lib/data/companies";

export function CompanyCreateForm() {
  const [error, formAction, pending] = useActionState(createCompany, null);

  return (
    <Card className="bg-card/80 backdrop-blur">
      <CardContent className="pt-6">
        <form action={formAction} className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required className="w-56" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="country">Country</Label>
            <Input id="country" name="country" className="w-40" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Description</Label>
            <Input id="description" name="description" className="w-64" />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Add company"}
          </Button>
        </form>
        {error && <p className="mt-2 text-sm font-medium text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
