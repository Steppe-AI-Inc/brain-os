"use client";

import { FormEvent, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { createDocument, registerUploadedDocument } from "@/lib/data/documents";
import { createClient } from "@/lib/supabase/client";
import {
  ARTIFACT_BUCKET,
  artifactValidationError,
  canonicalArtifactMime,
  sanitizeArtifactFileName,
} from "@/lib/artifacts";

const fieldClass =
  "h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/25";

export function DocumentCreateForm({
  companies,
}: {
  companies: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [pending, startTransition] = useTransition();

  function report(text: string, error = true) {
    setMessage(text);
    setIsError(error);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const file = formData.get("file");
    const title = String(formData.get("title") || "").trim();
    const companyId = String(formData.get("company_id") || "").trim();

    report("", false);
    startTransition(async () => {
      try {
        if (!(file instanceof File) || file.size === 0) {
          const error = await createDocument(null, formData);
          if (error) return report(error);
          form.reset();
          report("Document saved.", false);
          router.refresh();
          return;
        }

        if (!title) return report("Title is required.");
        if (!companyId) return report("Choose a company for private file storage.");
        const validationError = artifactValidationError(file);
        if (validationError) return report(validationError);

        const mimeType = canonicalArtifactMime(file.name, file.type);
        if (!mimeType) return report("Unsupported file type.");

        const supabase = createClient();
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError || !user) return report("Your session expired. Please sign in again.");

        const safeName = sanitizeArtifactFileName(file.name);
        const storagePath = `${companyId}/${user.id}/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from(ARTIFACT_BUCKET)
          .upload(storagePath, file, {
            contentType: mimeType,
            cacheControl: "3600",
            upsert: false,
          });
        if (uploadError) return report(uploadError.message);

        const textLike = mimeType.startsWith("text/") || mimeType === "application/json";
        const extractedText = textLike ? (await file.text()).slice(0, 250_000) : null;
        const registerError = await registerUploadedDocument({
          title,
          companyId,
          category: String(formData.get("category") || "general"),
          sensitivity: String(formData.get("sensitivity") || "internal"),
          notes: String(formData.get("text") || ""),
          storagePath,
          fileName: file.name,
          mimeType,
          fileSize: file.size,
          extractedText,
        });

        if (registerError) {
          await supabase.storage.from(ARTIFACT_BUCKET).remove([storagePath]);
          return report(registerError);
        }

        form.reset();
        report(`${file.name} uploaded securely.`, false);
        router.refresh();
      } catch (error) {
        report(error instanceof Error ? error.message : "Upload failed. Please try again.");
      }
    });
  }

  return (
    <Card className="bg-card/80 backdrop-blur">
      <CardContent className="pt-6">
        <form ref={formRef} onSubmit={handleSubmit} className="grid gap-3 lg:grid-cols-6">
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
              accept=".pdf,.docx,.xlsx,.txt,.md,.csv,.json,.png,.jpg,.jpeg,.jfif,.webp"
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
              {pending ? "Uploading…" : "Store document"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Direct private upload to Supabase · 25 MB maximum.
            </p>
          </div>
        </form>
        {message && (
          <p className={`mt-2 text-sm font-medium ${isError ? "text-destructive" : "text-emerald-600"}`}>
            {message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
