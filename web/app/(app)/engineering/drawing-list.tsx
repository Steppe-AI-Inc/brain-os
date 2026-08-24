"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { deleteEngineeringDrawing } from "@/lib/data/engineering";

type Drawing = {
  id: string;
  title: string;
  description: string;
  svg_content: string;
  dimensions_summary: string | null;
  notes: string | null;
  created_at: string | null;
  companies: { name: string } | null;
};

export function DrawingList({ drawings }: { drawings: Drawing[] }) {
  if (drawings.length === 0) {
    return (
      <Card className="bg-card/80 backdrop-blur">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No drawings generated yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {drawings.map((d) => (
        <DrawingCard key={d.id} drawing={d} />
      ))}
    </div>
  );
}

function DrawingCard({ drawing }: { drawing: Drawing }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmDelete() {
    setDeleting(true);
    const result = await deleteEngineeringDrawing(drawing.id);
    setDeleting(false);
    if (result) {
      setError(result);
      return;
    }
    setConfirmOpen(false);
    router.refresh();
  }

  return (
    <Card className="bg-card/80 backdrop-blur">
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-base">{drawing.title}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {drawing.companies?.name ?? "General"}
            {drawing.dimensions_summary ? ` · ${drawing.dimensions_summary}` : ""}
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={() => setConfirmOpen(true)}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div
          className="overflow-hidden rounded-lg border border-border/60 bg-white [&_svg]:h-auto [&_svg]:w-full"
          dangerouslySetInnerHTML={{ __html: drawing.svg_content }}
        />
        {drawing.notes && <p className="text-xs text-muted-foreground">{drawing.notes}</p>}
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this drawing?</AlertDialogTitle>
            <AlertDialogDescription>This can&apos;t be undone.</AlertDialogDescription>
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
    </Card>
  );
}
