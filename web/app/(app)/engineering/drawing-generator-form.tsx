"use client";

import { useActionState, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { generateEngineeringDrawing } from "@/lib/data/engineering";

export function DrawingGeneratorForm({ companies }: { companies: Array<{ id: string; name: string }> }) {
  const [error, formAction, pending] = useActionState(generateEngineeringDrawing, null);
  const [companyId, setCompanyId] = useState("");

  return (
    <Card className="bg-card/80 backdrop-blur">
      <CardContent className="flex flex-col gap-3 pt-6">
        <form action={formAction} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Describe the layout</Label>
            <Textarea
              id="description"
              name="description"
              required
              className="min-h-20"
              placeholder="e.g. A 24m x 15m surface lot with 18 standard parking stalls and 4 EV charging stalls near the entrance, single drive aisle, one entry/exit."
            />
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="company_id">Company (optional)</Label>
              <Select name="company_id" value={companyId} onValueChange={(v: unknown) => typeof v === "string" && setCompanyId(v)}>
                <SelectTrigger id="company_id" className="w-56">
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
            <Button type="submit" disabled={pending}>
              {pending ? "Drafting…" : "Generate drawing"}
            </Button>
          </div>
        </form>
        {error && <p className="text-sm font-medium text-destructive">{error}</p>}
        <p className="text-xs text-muted-foreground">
          Generates a labeled, scaled, top-down technical diagram (SVG) from your description — a real
          drawing, not a CAD file (no DXF/DWG export). Good for laying out and communicating a design, not
          for construction-grade engineering.
        </p>
      </CardContent>
    </Card>
  );
}
