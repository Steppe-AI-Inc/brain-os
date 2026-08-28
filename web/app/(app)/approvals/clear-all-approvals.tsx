"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
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
import { deleteAllApprovals } from "@/lib/data/approvals";

// The reliable bulk-clear path — deletes every id the page actually loaded (getApprovals()
// has no limit/pagination), unlike asking chat to "delete all approvals": that request
// only ever sees a truncated page of context.approvals, so it can't enumerate the rest
// even if a chat-side delete existed. Scoped per tab (pending-only / decided-only) rather
// than one blanket "everything" button, so clearing a stale pending backlog doesn't also
// wipe decided history by accident.
export function ClearAllApprovals({
  ids,
  scopeLabel,
}: {
  ids: string[];
  scopeLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (ids.length === 0) return null;

  function confirmClearAll() {
    setError(null);
    startTransition(async () => {
      const result = await deleteAllApprovals(ids);
      if (result) {
        setError(result);
        // A partial result still deleted some real rows — refresh so the list reflects
        // that, even though the dialog stays open on the error.
        router.refresh();
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-2 text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
        Clear all {scopeLabel}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Clear all {ids.length} {scopeLabel} approval{ids.length === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes these approval records — including their decision
              history. This does not undo anything a decided approval already did (a
              resumed task or executed deletion stays as it is); it only removes the
              approval records themselves.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={isPending} onClick={confirmClearAll}>
              {isPending ? "Clearing…" : `Clear all ${ids.length}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
