"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, User, Trash2 } from "lucide-react";
import {
  DndContext,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TASK_COLUMNS } from "@/lib/data/task-columns";
import { updateTaskStatus, deleteTasks } from "@/lib/data/tasks";
import { TaskCard, type TaskRow } from "./task-card";
import { TaskSheet, type EditingTask } from "./task-sheet";
import type { Database } from "@/types/database";

type PriorityLevel = Database["public"]["Enums"]["priority_level"];
type RiskLevel = Database["public"]["Enums"]["risk_level"];
type WorkStatus = Database["public"]["Enums"]["work_status"];

const COLUMN_LABELS: Record<(typeof TASK_COLUMNS)[number], string> = {
  queued: "Queued",
  in_progress: "In Progress",
  needs_approval: "Needs Approval",
  done: "Done",
};

function Column({ status, children }: { status: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col gap-3 rounded-xl bg-muted/40 p-3 transition-colors ${
        isOver ? "bg-muted/70 ring-2 ring-primary/30" : ""
      }`}
    >
      {children}
    </div>
  );
}

export function TasksBoard({
  tasks: initialTasks,
  companies,
  currentPersonId,
}: {
  tasks: TaskRow[];
  companies: Array<{ id: string; name: string }>;
  currentPersonId: string | null;
}) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initialTasks);
  const [prevInitialTasks, setPrevInitialTasks] = useState(initialTasks);
  const [target, setTarget] = useState<EditingTask | null>(null);
  const [myTasksOnly, setMyTasksOnly] = useState(false);
  const [clearingColumn, setClearingColumn] = useState<(typeof TASK_COLUMNS)[number] | null>(null);
  const [clearBusy, setClearBusy] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const visibleTasks = myTasksOnly && currentPersonId ? tasks.filter((t) => t.owner_person_id === currentPersonId) : tasks;

  async function confirmClearColumn() {
    if (!clearingColumn) return;
    const ids = visibleTasks.filter((t) => t.status === clearingColumn).map((t) => t.id);
    setClearBusy(true);
    const result = await deleteTasks(ids);
    setClearBusy(false);
    if (result) {
      setClearError(result);
      return;
    }
    setClearingColumn(null);
    router.refresh();
  }

  // Reconcile local (optimistic) state with fresh server data after router.refresh() —
  // done during render, not an effect, per React's "adjusting state on a prop change"
  // pattern (avoids the extra render an effect-based sync would cause).
  if (initialTasks !== prevInitialTasks) {
    setPrevInitialTasks(initialTasks);
    setTasks(initialTasks);
  }

  function refresh() {
    router.refresh();
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const taskId = String(active.id);
    const newStatus = over.id as WorkStatus;
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;

    const prevStatus = task.status;
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)));

    updateTaskStatus(taskId, newStatus).then((result) => {
      if (result) {
        setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: prevStatus } : t)));
        return;
      }
      router.refresh();
    });
  }

  function openCreate(status: WorkStatus) {
    setTarget({ mode: "create", status });
  }

  function openEdit(task: TaskRow) {
    setTarget({
      mode: "edit",
      id: task.id,
      values: {
        title: task.title,
        description: task.description ?? "",
        companyId: task.company_id,
        priority: (task.priority ?? "medium") as PriorityLevel,
        riskLevel: (task.risk_level ?? "low") as RiskLevel,
        approvalRequired: !!task.approval_required,
      },
    });
  }

  return (
    <>
      {currentPersonId && (
        <Button
          variant={myTasksOnly ? "default" : "outline"}
          size="sm"
          className="w-fit gap-1.5"
          onClick={() => setMyTasksOnly((v) => !v)}
        >
          <User className="h-3.5 w-3.5" />
          {myTasksOnly ? "Showing my tasks" : "Show only my tasks"}
        </Button>
      )}
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {TASK_COLUMNS.map((status) => {
            const columnTasks = visibleTasks.filter((t) => t.status === status);
            return (
              <Column key={status} status={status}>
                <div className="flex items-center justify-between px-1">
                  <h2 className="text-sm font-bold">{COLUMN_LABELS[status]}</h2>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">{columnTasks.length}</span>
                    {columnTasks.length > 0 && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="h-5 w-5 text-muted-foreground hover:text-destructive"
                        title={`Clear all ${COLUMN_LABELS[status]} tasks`}
                        onClick={() => setClearingColumn(status)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
                {columnTasks.map((task) => (
                  <TaskCard key={task.id} task={task} onEdit={() => openEdit(task)} onDeleted={refresh} />
                ))}
                {columnTasks.length === 0 && (
                  <p className="px-1 text-xs text-muted-foreground">No tasks.</p>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start gap-1.5 text-muted-foreground"
                  onClick={() => openCreate(status)}
                >
                  <Plus className="h-3.5 w-3.5" /> Add task
                </Button>
              </Column>
            );
          })}
        </div>
      </DndContext>

      <TaskSheet
        target={target}
        companies={companies}
        onOpenChange={(open) => !open && setTarget(null)}
        onSaved={refresh}
      />

      <AlertDialog
        open={!!clearingColumn}
        onOpenChange={(open) => {
          if (!open) {
            setClearingColumn(null);
            setClearError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Clear all {clearingColumn ? visibleTasks.filter((t) => t.status === clearingColumn).length : 0}{" "}
              {clearingColumn ? COLUMN_LABELS[clearingColumn] : ""} tasks?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes these tasks — unlike channels, there&apos;s no recovery bucket for
              deleted tasks. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {clearError && <p className="text-sm font-medium text-destructive">{clearError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={clearBusy} onClick={confirmClearColumn}>
              {clearBusy ? "Clearing…" : "Clear all"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
