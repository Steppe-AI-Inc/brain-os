"use client";

import { FormEvent, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  analyzeArtifact,
  createDocument,
  registerUploadedDocument,
} from "@/lib/data/documents";
import { createClient } from "@/lib/supabase/client";
import {
  ARTIFACT_BUCKET,
  artifactValidationError,
  canonicalArtifactMime,
  sanitizeArtifactFileName,
  suggestArtifactCompany,
  type ArtifactCompanyOption,
} from "@/lib/artifacts";

const fieldClass =
  "h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/25";

type MessageTone = "success" | "warning" | "error";

export function DocumentCreateForm({
  companies,
}: {
  companies: ArtifactCompanyOption[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<MessageTone>("success");
  const [stage, setStage] = useState("Uploading…");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [fileName, setFileName] = useState("");
  const [manualCompanyId, setManualCompanyId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const suggestion = useMemo(
    () => suggestArtifactCompany({ title, fileName, notes }, companies),
    [title, fileName, notes, companies]
  );
  const companyId = manualCompanyId ?? suggestion?.companyId ?? "";

  function report(text: string, nextTone: MessageTone = "error") {
    setMessage(text);
    setTone(nextTone);
  }

  function resetForm(form: HTMLFormElement) {
    form.reset();
    setTitle("");
    setNotes("");
    setFileName("");
    setManualCompanyId(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const file = formData.get("file");
    const allowExternalAi = formData.get("allow_external_ai") === "yes";

    setMessage(null);
    setStage("Uploading…");
    startTransition(async () => {
      try {
        if (!(file instanceof File) || file.size === 0) {
          const error = await createDocument(null, formData);
          if (error) return report(error);
          resetForm(form);
          report("Document saved and indexed.", "success");
          router.refresh();
          return;
        }

        if (!title.trim()) return report("Title is required.");
        if (!companyId) return report("No reliable company match was found. Choose a company before uploading.");
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
        const registration = await registerUploadedDocument({
          title: title.trim(),
          companyId,
          category: String(formData.get("category") || "general"),
          sensitivity: String(formData.get("sensitivity") || "internal"),
          notes,
          storagePath,
          fileName: file.name,
          mimeType,
          fileSize: file.size,
          extractedText,
          companyMatchConfidence: suggestion?.companyId === companyId ? suggestion.confidence : 1,
          companyMatchReason: suggestion?.companyId === companyId
            ? suggestion.reason
            : "Company selected manually during upload.",
        });

        if (typeof registration === "string") {
          await supabase.storage.from(ARTIFACT_BUCKET).remove([storagePath]);
          return report(registration);
        }

        setStage("Analyzing…");
        const analysis = await analyzeArtifact(registration.id, allowExternalAi);
        resetForm(form);
        router.refresh();

        if (analysis.error) {
          return report(
            `${file.name} is safely stored, but automatic analysis could not start: ${analysis.error}`,
            "warning"
          );
        }
        if (analysis.warning) {
          return report(
            `${file.name} is stored and locally classified. Review needed: ${analysis.warning}`,
            "warning"
          );
        }
        report(`${file.name} is stored, analyzed and tracked.`, "success");
      } catch (error) {
        report(error instanceof Error ? error.message : "Upload failed. Please try again.");
      }
    });
  }

  const selectedCompany = companies.find((company) => company.id === companyId);

  return (
    <Card className="bg-card/80 backdrop-blur">
      <CardContent className="pt-6">
        <form ref={formRef} onSubmit={handleSubmit} className="grid gap-3 lg:grid-cols-6">
          <div className="flex flex-col gap-1.5 lg:col-span-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              name="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              placeholder="Monthly report, contract, brochure…"
            />
          </div>
          <div className="flex flex-col gap-1.5 lg:col-span-2">
            <Label htmlFor="company_id">Company</Label>
            <select
              id="company_id"
              name="company_id"
              className={fieldClass}
              value={companyId}
              onChange={(event) => setManualCompanyId(event.target.value)}
            >
              <option value="">Choose company</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </select>
            {suggestion && manualCompanyId === null && (
              <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
                Auto-selected {selectedCompany?.name} · {Math.round(suggestion.confidence * 100)}% · {suggestion.reason}
              </p>
            )}
            {!suggestion && manualCompanyId === null && (
              <p className="text-[11px] text-muted-foreground">
                Add brand/product aliases in Companies to improve automatic matching.
              </p>
            )}
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
          <div className="flex flex-col gap-1.5 lg:col-span-2">
            <Label htmlFor="file">File</Label>
            <Input
              id="file"
              name="file"
              type="file"
              accept=".pdf,.docx,.xlsx,.txt,.md,.csv,.json,.png,.jpg,.jpeg,.jfif,.webp"
              onChange={(event) => setFileName(event.target.files?.[0]?.name || "")}
            />
          </div>
          <div className="flex flex-col gap-1.5 lg:col-span-4">
            <Label htmlFor="text">Notes or pasted content</Label>
            <Textarea
              id="text"
              name="text"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="min-h-24"
              placeholder="Client, reporting period, purpose, and anything Brain OS should know."
            />
          </div>
          <label className="flex items-start gap-2 rounded-lg border border-border/70 bg-muted/30 p-3 text-xs lg:col-span-6">
            <input type="checkbox" name="allow_external_ai" value="yes" className="mt-0.5" />
            <span>
              <strong className="flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" /> Allow AI content analysis</strong>
              The selected private file may be temporarily shared with the configured OpenAI API for extraction and analysis. Leave unchecked for local metadata/text analysis only.
            </span>
          </label>
          <div className="flex items-center gap-3 lg:col-span-6">
            <Button type="submit" disabled={pending}>
              {pending ? stage : "Store and analyze"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Direct private upload · automatic company matching · 25 MB maximum.
            </p>
          </div>
        </form>
        {message && (
          <p className={`mt-2 text-sm font-medium ${
            tone === "error"
              ? "text-destructive"
              : tone === "warning"
                ? "text-amber-700 dark:text-amber-300"
                : "text-emerald-600"
          }`}>
            {message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
