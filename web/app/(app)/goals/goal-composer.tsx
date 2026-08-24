"use client";

import { useActionState, useState } from "react";
import { Sparkles } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createGoal } from "@/lib/data/goals";
import { KIND_HINTS, type GoalKind } from "@/lib/goals/classify";

const KINDS: GoalKind[] = ["ephemeral", "standing", "routine", "decision"];
const KIND_LABEL: Record<GoalKind, string> = {
  ephemeral: "Ephemeral",
  standing: "Standing",
  routine: "Routine",
  decision: "Decision",
};

export function GoalComposer({
  companies,
  departments,
}: {
  companies: Array<{ id: string; name: string }>;
  departments: Array<{ id: string; name: string; company_id: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [kindOverride, setKindOverride] = useState<GoalKind | "">("");
  const [companyId, setCompanyId] = useState("");
  const [error, formAction, pending] = useActionState(createGoal, null);

  const scopedDepartments = departments.filter((d) => d.company_id === companyId);

  return (
    <>
      <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <Sparkles className="h-3.5 w-3.5" />
        New goal
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full sm:max-w-md">
          <form action={formAction} className="flex h-full flex-col">
            <SheetHeader>
              <SheetTitle>What&apos;s on your mind?</SheetTitle>
              <SheetDescription>
                Describe the outcome in plain language — we&apos;ll classify it into the
                right kind of goal automatically.
              </SheetDescription>
            </SheetHeader>

            <div className="flex flex-1 flex-col gap-4 overflow-auto px-4">
              <Textarea
                name="raw_content"
                required
                rows={4}
                autoFocus
                placeholder="e.g. Reach 25,000 newsletter subscribers by end of year"
                className="resize-none"
              />

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="company_id">Company</Label>
                <Select
                  name="company_id"
                  required
                  onValueChange={(v: unknown) => setCompanyId(typeof v === "string" ? v : "")}
                >
                  <SelectTrigger id="company_id">
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

              {scopedDepartments.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="department_id">Department (optional)</Label>
                  <Select name="department_id">
                    <SelectTrigger id="department_id">
                      <SelectValue placeholder="No department" />
                    </SelectTrigger>
                    <SelectContent>
                      {scopedDepartments.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <button
                type="button"
                className="w-fit text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                onClick={() => setAdvanced((v) => !v)}
              >
                {advanced ? "▾" : "▸"} Force a kind (optional)
              </button>

              {advanced && (
                <input type="hidden" name="kind_override" value={kindOverride} />
              )}
              {advanced && (
                <div className="grid grid-cols-2 gap-2">
                  {KINDS.map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setKindOverride(k === kindOverride ? "" : k)}
                      className={`rounded-lg border p-2.5 text-left text-xs transition-colors ${
                        kindOverride === k
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-secondary"
                      }`}
                    >
                      <div className="font-medium">{KIND_LABEL[k]}</div>
                      <div className="mt-0.5 text-muted-foreground">{KIND_HINTS[k]}</div>
                    </button>
                  ))}
                </div>
              )}

              {error && <p className="text-sm font-medium text-destructive">{error}</p>}
            </div>

            <SheetFooter>
              <Button type="submit" disabled={pending} className="w-full">
                {pending ? "Creating…" : "Create goal"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
