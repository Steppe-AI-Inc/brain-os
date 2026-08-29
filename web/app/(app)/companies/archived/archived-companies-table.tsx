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
import { restoreCompany, permanentlyDeleteCompany } from "@/lib/data/companies";

type ArchivedCompanyRow = {
  id: string;
  name: string;
  country: string | null;
  legal_entity_name: string | null;
  status: string | null;
  organization_type: string | null;
  updated_at: string | null;
};

export function ArchivedCompaniesTable({ companies }: { companies: ArchivedCompanyRow[] }) {
  const router = useRouter();
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ArchivedCompanyRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleRestore(id: string) {
    setRestoringId(id);
    setError(null);
    const result = await restoreCompany(id);
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
    const result = await permanentlyDeleteCompany(deleteTarget.id);
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
              <TableHead>Name</TableHead>
              <TableHead>Country</TableHead>
              <TableHead>Archived</TableHead>
              <TableHead className="w-56" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {companies.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell>{c.country ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {c.updated_at ? new Date(c.updated_at).toLocaleDateString() : "—"}
                  </Badge>
                </TableCell>
                <TableCell className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={restoringId === c.id}
                    onClick={() => handleRestore(c.id)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {restoringId === c.id ? "Restoring…" : "Restore"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      setDeleteError(null);
                      setDeleteTarget(c);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Permanently delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {companies.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No archived companies.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This is different from the ordinary Delete action — it actually destroys the
              record and cannot be undone. Founder/admin only. If anything real (projects,
              proposals, leads, org relationships) is still attached, this is refused
              instead of cascading — reassign or remove those first.
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
