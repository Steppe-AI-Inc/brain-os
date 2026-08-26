"use client";

import { useState, useTransition } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createTask, updateTask, type TaskInput } from "@/lib/data/tasks";
import type { Database } from "@/types/database";

type PriorityLevel = Database["public"]["Enums"]["priority_level"];
type RiskLevel = Database["public"]["Enums"]["risk_level"];
type WorkStatus = Database["public"]["Enums"]["work_status"];

const PRIORITY_OPTIONS: PriorityLevel[] = ["low", "medium", "high", "critical"];
const RISK_OPTIONS: RiskLevel[] = ["low", "medium", "high", "critical"];

const EMPTY: TaskInput = {
  title: "",
  description: "",
  companyId: null,
  priority: "medium",
  riskLevel: "low",
  approvalRequired: false,
};

export type EditingTask = {
  mode: "create";
  status: WorkStatus;
} | {
  mode: "edit";
  id: string;
  values: TaskInput;
};

export function TaskSheet({
  target,
  companies,
  onOpenChange,
  onSaved,
}: {
  target: EditingTask | null;
  companies: Array<{ id: string; name: string }>;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<TaskInput>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [prevTarget, setPrevTarget] = useState<EditingTask | null>(null);

  // Reset the form whenever a new target is opened — done during render, not an effect,
  // per React's "adjusting state on a prop change" pattern.
  if (target !== prevTarget) {
    setPrevTarget(target);
    if (target) {
      setError(null);
      setValues(target.mode === "edit" ? target.values : EMPTY);
    }
  }

  function set<K extends keyof TaskInput>(key: K, value: TaskInput[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function save() {
    if (!target) return;
    setError(null);
    startTransition(async () => {
      const result =
        target.mode === "create"
          ? await createTask(target.status, values)
          : await updateTask(target.id, values);
      if (result) {
        setError(result);
        return;
      }
      onSaved();
      onOpenChange(false);
    });
  }

  return (
    <Sheet open={!!target} onOpenChange={onOpenChange}>
      <SheetContent className="gap-0 overflow-y-auto p-0">
        <SheetHeader className="border-b border-border/60">
          <SheetTitle>{target?.mode === "create" ? "New task" : "Edit task"}</SheetTitle>
          <SheetDescription>
            {target?.mode === "create"
              ? "Adds directly to the board — same tasks table Brain OS writes to."
              : "Changes save to the real tasks row."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 p-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              value={values.title}
              onChange={(e) => set("title", e.target.value)}
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="task-description">Description</Label>
            <Textarea
              id="task-description"
              value={values.description}
              onChange={(e) => set("description", e.target.value)}
              className="min-h-24"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="task-company">Company</Label>
            <Select
              value={values.companyId ?? "none"}
              onValueChange={(v: unknown) => set("companyId", v === "none" ? null : (v as string))}
            >
              <SelectTrigger id="task-company" className="w-full">
                <SelectValue>
                  {() => companies.find((c) => c.id === values.companyId)?.name ?? "No company"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No company</SelectItem>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="task-priority">Priority</Label>
              <Select value={values.priority} onValueChange={(v: unknown) => set("priority", v as PriorityLevel)}>
                <SelectTrigger id="task-priority" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="task-risk">Risk level</Label>
              <Select value={values.riskLevel} onValueChange={(v: unknown) => set("riskLevel", v as RiskLevel)}>
                <SelectTrigger id="task-risk" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RISK_OPTIONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={values.approvalRequired}
              onChange={(e) => set("approvalRequired", e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            Approval required
          </label>

          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
        </div>

        <SheetFooter className="flex-row justify-end gap-2 border-t border-border/60">
          <SheetClose render={<Button variant="outline" />}>Cancel</SheetClose>
          <Button onClick={save} disabled={pending || !values.title.trim()}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
