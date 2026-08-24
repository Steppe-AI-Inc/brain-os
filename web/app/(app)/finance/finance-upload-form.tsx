"use client";

import { useActionState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { uploadFinancialDocument } from "@/lib/data/finance";

export function FinanceUploadForm({ companies }: { companies: Array<{ id: string; name: string }> }) {
  const [error, formAction, pending] = useActionState(uploadFinancialDocument, null);

  return (
    <Card className="bg-card/80 backdrop-blur">
      <CardContent className="pt-6">
        <form action={formAction} className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="company_id">Company</Label>
            <Select name="company_id" required>
              <SelectTrigger id="company_id" className="w-56">
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
            <Label htmlFor="period">Period (optional)</Label>
            <Input id="period" name="period" placeholder="e.g. 2026-07" className="w-36" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="file">Financial statement (PDF or CSV/text)</Label>
            <Input
              id="file"
              name="file"
              type="file"
              accept=".pdf,.csv,.txt,text/plain,text/csv,application/pdf"
              required
              className="w-72"
            />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Analyzing…" : "Upload & analyze"}
          </Button>
        </form>
        {error && <p className="mt-2 text-sm font-medium text-destructive">{error}</p>}
        <p className="mt-2 text-xs text-muted-foreground">
          The AI CFO/Bookkeeper reads the document, extracts revenue/expenses/net income/cash
          position, and saves a health report — one pass, no manual steps. This is AI-assisted
          analysis of what you upload, not a bookkeeping system of record.
        </p>
      </CardContent>
    </Card>
  );
}
