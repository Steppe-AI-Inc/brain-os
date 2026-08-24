"use client";

import { useActionState, useTransition, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2 } from "lucide-react";
import { createAiProvider, setActiveProvider, deleteAiProvider } from "@/lib/data/ai-providers";
import { SUPPORTED_MODELS } from "@/lib/usage/pricing";

type ProviderRow = {
  id: string;
  provider: string;
  label: string;
  model: string;
  is_active: boolean;
  created_at: string;
};

export function ProvidersPanel({ providers }: { providers: ProviderRow[] }) {
  const [error, formAction, pending] = useActionState(createAiProvider, null);
  const [providerChoice, setProviderChoice] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const models = SUPPORTED_MODELS.filter((m) => m.provider === providerChoice);

  function activate(id: string) {
    setActionError(null);
    setBusy(id);
    startTransition(async () => {
      const result = await setActiveProvider(id);
      setBusy(null);
      if (result) setActionError(result);
    });
  }

  function remove(id: string) {
    setActionError(null);
    setBusy(id);
    startTransition(async () => {
      const result = await deleteAiProvider(id);
      setBusy(null);
      if (result) setActionError(result);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="border-border/80 shadow-none">
        <CardContent className="pt-6">
          <p className="mb-4 text-sm text-muted-foreground">
            AI Native Chat calls whichever provider is marked{" "}
            <span className="font-medium text-foreground">Active</span>. The real API key
            never lives here — it&apos;s a Supabase Edge Function secret (
            <code className="rounded bg-secondary px-1 py-0.5 text-xs">OPENAI_API_KEY</code>{" "}
            /{" "}
            <code className="rounded bg-secondary px-1 py-0.5 text-xs">ANTHROPIC_API_KEY</code>
            ), set once outside this app. If the active provider&apos;s key isn&apos;t set, chat
            falls back to a deterministic planner rather than failing.
          </p>
          <form action={formAction} className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="provider">Provider</Label>
              <Select
                name="provider"
                required
                onValueChange={(v: unknown) => setProviderChoice(typeof v === "string" ? v : "")}
              >
                <SelectTrigger id="provider" className="w-40">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="anthropic">Anthropic</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="model">Model</Label>
              <Select name="model" required disabled={!providerChoice}>
                <SelectTrigger id="model" className="w-56">
                  <SelectValue placeholder={providerChoice ? "Select model" : "Pick a provider first"} />
                </SelectTrigger>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={m.model} value={m.model}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="label">Label (optional)</Label>
              <Input id="label" name="label" className="w-48" placeholder="e.g. Default" />
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding…" : "Add provider"}
            </Button>
          </form>
          {error && <p className="mt-2 text-sm font-medium text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-border/80 shadow-none">
        <div className="flex flex-col divide-y divide-border">
          {providers.map((p) => (
            <div key={p.id} className="flex items-center gap-4 px-4 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{p.label}</div>
                <div className="text-xs text-muted-foreground">
                  {p.provider} · {p.model}
                </div>
              </div>
              {p.is_active ? (
                <Badge>Active</Badge>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy === p.id}
                  onClick={() => activate(p.id)}
                >
                  Make active
                </Button>
              )}
              <button
                type="button"
                className="text-muted-foreground hover:text-destructive"
                disabled={busy === p.id}
                onClick={() => remove(p.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {providers.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              No providers configured yet.
            </p>
          )}
        </div>
      </Card>
      {actionError && <p className="text-sm font-medium text-destructive">{actionError}</p>}
    </div>
  );
}
