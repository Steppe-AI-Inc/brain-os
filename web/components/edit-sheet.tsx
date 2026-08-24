"use client";

import { useState, type ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

// Generic Sheet chrome (title, save/cancel, pending + error state) shared across every
// list page's edit form — each page supplies only its own field inputs as children and
// an onSave callback that calls its own updateX() data function.
export function EditSheet({
  open,
  onOpenChange,
  title,
  description,
  onSave,
  saveDisabled,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  onSave: () => Promise<string | null>;
  saveDisabled?: boolean;
  children: ReactNode;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    setPending(true);
    const result = await onSave();
    setPending(false);
    if (result) {
      setError(result);
      return;
    }
    onOpenChange(false);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) setError(null);
        onOpenChange(next);
      }}
    >
      <SheetContent className="gap-0 overflow-y-auto p-0">
        <SheetHeader className="border-b border-border/60">
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>

        <div className="flex flex-col gap-4 p-4">
          {children}
          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
        </div>

        <SheetFooter className="flex-row justify-end gap-2 border-t border-border/60">
          <SheetClose render={<Button variant="outline" />}>Cancel</SheetClose>
          <Button onClick={save} disabled={pending || saveDisabled}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
