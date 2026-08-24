"use client";

import { useActionState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { createDocument } from "@/lib/data/documents";

const fieldClass =
  "h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/25";

export function DocumentCreateForm({
  companies,
}: {
  companies: Array<{ id: string; name: string }>;
}) {
  const [error, formAction, pending] = useActionState(createDocument, null);

  return (
    <Card className="bg-card/80 backdrop-blur">
      <CardContent className="pt-6">
        <form action={formAction} className="grid gap-3 lg:grid-cols-6">
          <div className="flex flex-col gap-1.5 lg:col-span-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" required placeholder="Monthly report, contract, brochure…" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="company_id">Company</Label>
            <select id="company_id" name="company_id" className={fieldClass} defaultValue="">
              <option value="">No company</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="category">Category</Label>
            <select id="category" name="category" className={fieldClass} defaultValue="general">
              <option value="general">General</option>
              <option value="performance_report">Performance report</option>
              <option value="financial_report">Financial report</option>
              <option value="sales_asset">Sales asset</option>
              <option value="proposal">Proposal</option>
              <option value="employment_document">Employment document</option>
              <option value="legal_document">Legal document</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sensitivity">Visibility</Label>
            <select id="sensitivity" name="sensitivity" className={fieldClass} defaultValue="internal">
              <option value="public">Public</option>
              <option value="internal">Internal</option>
              <option value="confidential">Confidential</option>
              <option value="restricted">Restricted</option>
              <option value="founder_only">Founder only</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="file">File</Label>
            <Input
              id="file"
              name="file"
              type="file"
              accept=".pdf,.docx,.xlsx,.txt,.md,.csv,.json,.png,.jpg,.jpeg,.webp"
            />
          </div>
          <div className="flex flex-col gap-1.5 lg:col-span-6">
            <Label htmlFor="text">Notes or pasted content</Label>
            <Textarea
              id="text"
              name="text"
              className="min-h-24"
              placeholder="Optional when a file is uploaded. Text formats are indexed immediately; PDF/DOCX/XLSX are stored now and queued for later extraction."
            />
          </div>
          <div className="flex items-center gap-3 lg:col-span-6">
            <Button type="submit" disabled={pending}>
              {pending ? "Storing…" : "Store document"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Files are private in Supabase Storage. 25 MB maximum.
            </p>
          </div>
        </form>
        {error && <p className="mt-2 text-sm font-medium text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
