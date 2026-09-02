"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArchivedCompanyBadge } from "@/components/archived-company-badge";
import { GOAL_STATUS_DOT, GOAL_STATUS_LABEL } from "@/lib/goals/classify";
import type { CompanyRef } from "@/lib/data/company-ref";

type GoalRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  kind: string;
  progress: number | null;
  due_at: string | null;
  companies: CompanyRef;
  departments: { name: string } | null;
};

// BUG-008 (Work-PC C002): "archived" was a tab here, but getGoals() routes archived
// goals to /goals/archived — so the tab always read "Archived 0" and rendered an empty
// view while the sibling page held the real rows. The dead tab is gone; the archived
// count lives on the /goals/archived link the page header already provides.
const STATUS_FILTERS = ["all", "active", "draft", "paused", "achieved"] as const;

function dueLabel(dueAt: string | null): string | null {
  if (!dueAt) return null;
  const d = new Date(dueAt);
  const days = Math.round((d.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return `overdue ${Math.abs(days)}d`;
  if (days === 0) return "due today";
  return `due in ${days}d`;
}

export function GoalList({ goals }: { goals: GoalRow[] }) {
  const [filter, setFilter] = useState<(typeof STATUS_FILTERS)[number]>("all");

  const counts = Object.fromEntries(
    STATUS_FILTERS.map((s) => [s, s === "all" ? goals.length : goals.filter((g) => g.status === s).length])
  ) as Record<(typeof STATUS_FILTERS)[number], number>;

  const visible = filter === "all" ? goals : goals.filter((g) => g.status === filter);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-full border px-3 py-1 text-xs capitalize transition-colors ${
              filter === s
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-secondary"
            }`}
          >
            {s} <span className="tabular-nums">{counts[s]}</span>
          </button>
        ))}
      </div>

      <Card className="overflow-hidden border-border/80 shadow-none">
        <div className="flex flex-col divide-y divide-border">
          {visible.map((g) => {
            const due = dueLabel(g.due_at);
            const pct = g.progress != null ? Math.max(0, Math.min(100, Number(g.progress))) : null;
            return (
              <Link
                key={g.id}
                href={`/goals/${g.id}`}
                className="flex items-center gap-4 px-4 py-3 text-sm transition-colors hover:bg-secondary/50"
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${GOAL_STATUS_DOT[g.status]}`} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{g.title}</div>
                  {/* The label may resolve to the department, but the archived ancestor
                      being flagged is always the company — so the badge reads companies.status
                      regardless of which name is shown. */}
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="truncate">{g.departments?.name ?? g.companies?.name ?? "—"}</span>
                    <ArchivedCompanyBadge status={g.companies?.status} />
                  </div>
                </div>
                {pct != null && (
                  <div className="hidden w-28 items-center gap-2 sm:flex">
                    <Progress value={pct} className="h-1.5 w-20" />
                    <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">
                      {pct}%
                    </span>
                  </div>
                )}
                <Badge variant="outline" className="capitalize">
                  {g.kind}
                </Badge>
                {due && (
                  <span className="hidden w-20 shrink-0 text-right text-xs text-muted-foreground sm:block">
                    {due}
                  </span>
                )}
                <Badge variant="secondary" className="capitalize">
                  {GOAL_STATUS_LABEL[g.status]}
                </Badge>
              </Link>
            );
          })}
          {visible.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              No goals in this view.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
