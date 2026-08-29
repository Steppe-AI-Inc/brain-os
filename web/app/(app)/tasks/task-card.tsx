"use client";

import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { archiveTask } from "@/lib/data/tasks";

export type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  status: string | null;
  priority: string | null;
  risk_level: string | null;
  approval_required: boolean | null;
  company_id: string | null;
  companies: { name: string } | null;
  owner_person_id: string | null;
  people: { full_name: string } | null;
};

export function TaskCard({
  task,
  onEdit,
  onDeleted,
}: {
  task: TaskRow;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  async function confirmDelete() {
    setDeleting(true);
    const result = await archiveTask(task.id);
    setDeleting(false);
    if (result) {
      setError(result);
      return;
    }
    setConfirmOpen(false);
    onDeleted();
  }

  return (
    <>
      <Card
        ref={setNodeRef}
        style={style}
        {...listeners}
        {...attributes}
        onClick={onEdit}
        className={`group/task-card touch-none cursor-pointer bg-card/90 transition-shadow active:cursor-grabbing ${
          isDragging ? "z-10 opacity-60 shadow-lg" : ""
        }`}
      >
        <CardHeader className="flex flex-row items-start justify-between gap-2 p-3 pb-1">
          <CardTitle className="text-sm font-semibold leading-snug">{task.title}</CardTitle>
          <div
            className="shrink-0"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="opacity-0 group-hover/task-card:opacity-100 data-[popup-open]:opacity-100"
                  />
                }
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onEdit}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={() => setConfirmOpen(true)}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
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
          {task.people?.full_name && (
            <Badge variant="secondary" className="text-xs">
              {task.people.full_name}
            </Badge>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this task?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{task.title}&rdquo; is archived, not destroyed — nothing referencing it
              is touched, and you can restore it from Tasks → Archived at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={deleting} onClick={confirmDelete}>
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
