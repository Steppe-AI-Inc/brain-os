"use client";

import { useActionState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createProductLine } from "@/lib/data/products";

export function ProductCreateForm({
  companies,
}: {
  companies: Array<{ id: string; name: string }>;
}) {
  const [error, formAction, pending] = useActionState(createProductLine, null);

  return (
    <Card className="bg-card/80 backdrop-blur">
      <CardContent className="pt-6">
        <form action={formAction} className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required className="w-52" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="company_id">Company</Label>
            <Select name="company_id" required>
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
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="unit_price">Unit price</Label>
            <Input id="unit_price" name="unit_price" type="number" step="0.01" className="w-28" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="unit_cost">Unit cost</Label>
            <Input id="unit_cost" name="unit_cost" type="number" step="0.01" className="w-28" />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Adding…" : "Add product"}
          </Button>
        </form>
        {error && <p className="mt-2 text-sm font-medium text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
