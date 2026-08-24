"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { updateGoal } from "@/lib/data/goals";

type GoalCard = {
  id: string;
  title: string;
  kind: string;
  status: string;
  progress: number | null;
  due_at: string | null;
};

type ColumnId = "draft" | "active" | "paused" | "achieved";

const COLUMNS: Array<{ id: ColumnId; label: string; sub: string }> = [
  { id: "draft", label: "Backlog", sub: "queued" },
  { id: "active", label: "In progress", sub: "being worked" },
  { id: "paused", label: "Blocked", sub: "needs you" },
  { id: "achieved", label: "Done", sub: "this period" },
];

function dueLabel(dueAt: string | null): string | null {
  if (!dueAt) return null;
  const days = Math.round((new Date(dueAt).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "today";
  return `${days}d`;
}

export function BoardColumns({ goals }: { goals: GoalCard[] }) {
  const [overrides, setOverrides] = useState<Record<string, ColumnId>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const columnFor = (g: GoalCard): ColumnId => overrides[g.id] ?? (g.status as ColumnId);

  function drop(column: ColumnId) {
    if (!dragId) return;
    const goalId = dragId;
    setDragId(null);
    const previous = columnFor(goals.find((g) => g.id === goalId)!);
    if (previous === column) return;

    setOverrides((o) => ({ ...o, [goalId]: column }));
    setBusy((b) => ({ ...b, [goalId]: true }));
    startTransition(async () => {
      const result = await updateGoal(goalId, { status: column });
      setBusy((b) => ({ ...b, [goalId]: false }));
      if (result) {
        setError(`Move failed: ${result}`);
        setOverrides((o) => ({ ...o, [goalId]: previous }));
      } else {
        setOverrides((o) => {
          const next = { ...o };
          delete next[goalId];
          return next;
        });
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {COLUMNS.map((col) => {
          const columnGoals = goals.filter((g) => columnFor(g) === col.id);
          return (
            <div
              key={col.id}
              className="flex flex-col gap-3 rounded-xl bg-muted/40 p-3"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => drop(col.id)}
            >
              <div className="flex items-baseline justify-between px-1">
                <div>
                  <h2 className="text-sm font-semibold">{col.label}</h2>
                  <p className="text-xs text-muted-foreground">{col.sub}</p>
                </div>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {columnGoals.length}
                </span>
              </div>
              {columnGoals.map((g) => {
                const pct = g.progress != null ? Math.max(0, Math.min(100, Number(g.progress))) : null;
                return (
                  <Card
                    key={g.id}
                    draggable
                    onDragStart={() => setDragId(g.id)}
                    className={`cursor-grab border-border/80 p-3 shadow-none transition-opacity active:cursor-grabbing ${
                      busy[g.id] ? "opacity-60" : ""
                    } ${dragId === g.id ? "opacity-40" : ""}`}
                  >
                    <Link href={`/goals/${g.id}`} className="flex flex-col gap-2">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="capitalize">{g.kind}</span>
                        {busy[g.id] && <span>saving…</span>}
                      </div>
                      <div className="text-sm font-medium leading-snug">{g.title}</div>
                      {pct != null && pct > 0 && <Progress value={pct} className="h-1" />}
                      {g.due_at && (
                        <div className="flex justify-end">
                          <Badge variant="outline" className="text-[10px]">
                            {dueLabel(g.due_at)}
                          </Badge>
                        </div>
                      )}
                    </Link>
                  </Card>
                );
              })}
              {columnGoals.length === 0 && (
                <p className="px-1 text-xs text-muted-foreground">Nothing here.</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
