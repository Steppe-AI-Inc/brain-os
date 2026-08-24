"use client";

import { useActionState, useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Trash2 } from "lucide-react";
import {
  updateGoal,
  createKeyResult,
  deleteKeyResult,
  saveGoalContext,
} from "@/lib/data/goals";

type KeyResult = {
  id: string;
  label: string;
  target_value: string | null;
  current_value: string | null;
  unit: string | null;
  weight: number;
};

type Goal = {
  id: string;
  status: string;
  kind: string;
  progress: number | null;
};

function krPercent(kr: KeyResult): number | null {
  const target = Number(kr.target_value);
  const current = Number(kr.current_value);
  if (!Number.isFinite(target) || target === 0 || !Number.isFinite(current)) return null;
  return Math.max(0, Math.min(100, Math.round((current / target) * 100)));
}

export function GoalKindActions({ goal }: { goal: Goal; keyResults?: KeyResult[] }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function apply(patch: Parameters<typeof updateGoal>[1]) {
    setError(null);
    startTransition(async () => {
      const result = await updateGoal(goal.id, patch);
      if (result) setError(result);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap justify-end gap-2">
        {goal.kind === "decision" && (
          <>
            <Button size="sm" disabled={pending} onClick={() => apply({ status: "achieved" })}>
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => apply({ status: "archived" })}
            >
              Decline
            </Button>
          </>
        )}
        {goal.kind === "routine" && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => apply({ status: goal.status === "paused" ? "active" : "paused" })}
          >
            {goal.status === "paused" ? "Resume" : "Pause"}
          </Button>
        )}
        {goal.kind === "ephemeral" && goal.status !== "achieved" && (
          <Button
            size="sm"
            disabled={pending}
            onClick={() => apply({ status: "achieved", progress: 100 })}
          >
            Mark done
          </Button>
        )}
        {goal.kind === "standing" && goal.status !== "archived" && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => apply({ status: "archived" })}
          >
            Archive
          </Button>
        )}
      </div>
      {error && <p className="max-w-64 text-right text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function KeyResultsSection({ goalId, keyResults }: { goalId: string; keyResults: KeyResult[] }) {
  const [error, formAction, pending] = useActionState(createKeyResult, null);
  const [, startDelete] = useTransition();

  return (
    <Card className="border-border/80 shadow-none">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Key results</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {keyResults.length === 0 && (
          <p className="text-sm text-muted-foreground">No key results yet.</p>
        )}
        {keyResults.map((kr) => {
          const pct = krPercent(kr);
          return (
            <div key={kr.id} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{kr.label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {kr.current_value ?? "—"} / {kr.target_value ?? "—"} {kr.unit ?? ""}
                  </span>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() =>
                      startDelete(async () => {
                        await deleteKeyResult(kr.id, goalId);
                      })
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {pct != null && <Progress value={pct} className="h-1.5" />}
            </div>
          );
        })}

        <form action={formAction} className="flex flex-wrap items-end gap-2 border-t border-border pt-4">
          <input type="hidden" name="goal_id" value={goalId} />
          <div className="flex flex-col gap-1">
            <Label htmlFor="label" className="text-xs">
              Label
            </Label>
            <Input id="label" name="label" required className="h-8 w-40 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="target_value" className="text-xs">
              Target
            </Label>
            <Input id="target_value" name="target_value" className="h-8 w-24 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="current_value" className="text-xs">
              Current
            </Label>
            <Input id="current_value" name="current_value" className="h-8 w-24 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="unit" className="text-xs">
              Unit
            </Label>
            <Input id="unit" name="unit" className="h-8 w-20 text-sm" />
          </div>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Adding…" : "Add"}
          </Button>
        </form>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

export function GoalContextEditor({
  goalId,
  initialContent,
}: {
  goalId: string;
  initialContent: string;
}) {
  const [value, setValue] = useState(initialContent);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(true);
  const [pending, startTransition] = useTransition();

  return (
    <Card className="border-border/80 shadow-none">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Goal context</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">
          Notes the agent should always remember about this goal — audience, tone, key
          constraints, prior decisions. Markdown welcome.
        </p>
        <Textarea
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSaved(false);
          }}
          rows={6}
          placeholder="Add context for this goal…"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {value.length.toLocaleString()} characters
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={pending || saved}
            onClick={() =>
              startTransition(async () => {
                const result = await saveGoalContext(goalId, value);
                if (result) setError(result);
                else {
                  setError(null);
                  setSaved(true);
                }
              })
            }
          >
            {pending ? "Saving…" : saved ? "Saved" : "Save"}
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

export function StandingRollup({ keyResults }: { keyResults: KeyResult[] }) {
  const weighted = keyResults
    .map((kr) => ({ pct: krPercent(kr), weight: kr.weight || 1 }))
    .filter((k): k is { pct: number; weight: number } => k.pct != null);
  if (weighted.length === 0) return null;
  const totalWeight = weighted.reduce((s, k) => s + k.weight, 0);
  const rollup = Math.round(weighted.reduce((s, k) => s + k.pct * k.weight, 0) / totalWeight);
  return (
    <Badge variant="secondary" className="tabular-nums">
      {rollup}% weighted
    </Badge>
  );
}
