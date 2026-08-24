"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registerPerformanceArtifact } from "@/lib/data/performance-cases";
import { analyzeArtifact } from "@/lib/data/documents";
import { createClient } from "@/lib/supabase/client";
import {
  ARTIFACT_BUCKET,
  artifactValidationError,
  canonicalArtifactMime,
  sanitizeArtifactFileName,
} from "@/lib/artifacts";

const fieldClass =
  "h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/25";

export function PerformanceArtifactUpload({
  caseId,
  companyId,
}: {
  caseId: string;
  companyId: string;
}) {
  const router = useRouter();
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
    const category = String(formData.get("category") || "performance_report");
    const allowExternalAi = formData.get("allow_external_ai") === "yes";

    report("", false);
    startTransition(async () => {
      try {
        if (!title) return report("Artifact title is required.");
        if (!(file instanceof File) || file.size === 0) return report("Choose a file to upload.");

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

        const storagePath = `${companyId}/${user.id}/${crypto.randomUUID()}-${sanitizeArtifactFileName(file.name)}`;
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
        const registration = await registerPerformanceArtifact({
          caseId,
          title,
          category,
          storagePath,
          fileName: file.name,
          mimeType,
          fileSize: file.size,
          extractedText,
        });

        if (typeof registration === "string") {
          await supabase.storage.from(ARTIFACT_BUCKET).remove([storagePath]);
          return report(registration);
        }

        const analysis = await analyzeArtifact(registration.id, allowExternalAi);
        form.reset();
        router.refresh();
        if (analysis.error) {
          return report(file.name + " is stored, but automatic analysis could not start: " + analysis.error);
        }
        report(file.name + " added, analyzed and tracked in the evidence vault.", false);
      } catch (error) {
        report(error instanceof Error ? error.message : "Upload failed. Please try again.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="artifact-title">Artifact title</Label>
          <Input id="artifact-title" name="title" placeholder="Aigerim monthly report — August" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="artifact-category">Category</Label>
          <select id="artifact-category" name="category" className={fieldClass} defaultValue="performance_report">
            <option value="performance_report">Performance report</option>
            <option value="sales_evidence">Sales evidence</option>
            <option value="financial_report">Financial report</option>
            <option value="communication">Communication</option>
            <option value="employment_document">Employment document</option>
            <option value="legal_document">Legal document</option>
          </select>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="artifact-file">File</Label>
        <Input
          id="artifact-file"
          name="file"
          type="file"
          required
          accept=".pdf,.docx,.xlsx,.txt,.md,.csv,.json,.png,.jpg,.jpeg,.jfif,.webp"
        />
        <p className="text-[11px] text-muted-foreground">
          Direct private upload to Supabase · 25 MB maximum · confidential case access.
        </p>
      </div>
      <label className="flex items-start gap-2 rounded-lg border border-border/70 bg-muted/30 p-3 text-xs">
        <input type="checkbox" name="allow_external_ai" value="yes" className="mt-0.5" />
        Allow this private artifact to be sent temporarily to the configured OpenAI API for deeper content analysis.
      </label>
      <Button type="submit" className="justify-self-start" disabled={pending}>
        {pending ? "Uploading and analyzing…" : "Store and analyze"}
      </Button>
      {message && (
        <p className={`text-sm font-medium ${isError ? "text-destructive" : "text-emerald-600"}`}>
          {message}
        </p>
      )}
    </form>
  );
}
