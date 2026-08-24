"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { deleteTask } from "@/lib/data/tasks";

type TaskRow = {
  id: string;
  title: string;
  priority: string | null;
  risk_level: string | null;
  approval_required: boolean | null;
  companies: { name: string } | null;
};

export function TaskCard({ task }: { task: TaskRow }) {
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await deleteTask(task.id);
      if (result) setError(result);
    });
  }

  return (
    <Card className="bg-card/90">
      <CardHeader className="flex flex-row items-start justify-between gap-2 p-3 pb-1">
        <CardTitle className="text-sm font-semibold leading-snug">{task.title}</CardTitle>
        <button
          type="button"
          className="shrink-0 text-muted-foreground hover:text-destructive disabled:opacity-50"
          disabled={busy}
          onClick={remove}
          title="Delete task"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-1.5 p-3 pt-1">
        <Badge variant="outline" className="text-xs">
          {task.priority}
        </Badge>
        <Badge variant="outline" className="text-xs">
          {task.risk_level}
        </Badge>
        {task.approval_required && (
          <Badge variant="destructive" className="text-xs">
            approval required
          </Badge>
        )}
        {task.companies?.name && (
          <span className="text-xs text-muted-foreground">{task.companies.name}</span>
        )}
        {error && <p className="w-full text-xs font-medium text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
