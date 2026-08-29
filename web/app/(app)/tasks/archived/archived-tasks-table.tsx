"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Trash2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { restoreTask, deleteTask } from "@/lib/data/tasks";

type ArchivedTaskRow = {
  id: string;
  title: string;
  company_id: string | null;
  companies: { name: string } | null;
  updated_at: string | null;
};

export function ArchivedTasksTable({ tasks }: { tasks: ArchivedTaskRow[] }) {
  const router = useRouter();
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ArchivedTaskRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleRestore(id: string) {
    setRestoringId(id);
    setError(null);
    const result = await restoreTask(id);
    setRestoringId(null);
    if (result) {
      setError(result);
      return;
    }
    router.refresh();
  }

  async function confirmPermanentDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const result = await deleteTask(deleteTarget.id);
    setDeleting(false);
    if (result) {
      setDeleteError(result);
      return;
    }
    setDeleteTarget(null);
    router.refresh();
  }

  return (
    <>
      <Card className="overflow-hidden bg-card/80 backdrop-blur">
        {error && <p className="px-4 pt-4 text-sm font-medium text-destructive">{error}</p>}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Archived</TableHead>
              <TableHead className="w-56" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.title}</TableCell>
                <TableCell>{t.companies?.name ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {t.updated_at ? new Date(t.updated_at).toLocaleDateString() : "—"}
                  </Badge>
                </TableCell>
                <TableCell className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={restoringId === t.id}
                    onClick={() => handleRestore(t.id)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {restoringId === t.id ? "Restoring…" : "Restore"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      setDeleteError(null);
                      setDeleteTarget(t);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Permanently delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {tasks.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No archived tasks.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete &ldquo;{deleteTarget?.title}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This is different from the ordinary Delete action — it actually destroys the
              record and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && <p className="text-sm font-medium text-destructive">{deleteError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={deleting} onClick={confirmPermanentDelete}>
              {deleting ? "Deleting…" : "Permanently delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
