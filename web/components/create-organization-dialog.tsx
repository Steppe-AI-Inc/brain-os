"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createOwnCompany } from "@/lib/data/organizations";

// Overnight multi-org milestone, Priority 1 — "employee creates their own company" as a
// first-class scenario, live-verified 2026-09-01 (qa/KNOWN_FAILURE_MODES.md #58). This is
// the UI counterpart to create_own_company(): the new company does NOT become a
// subsidiary/business-unit of the caller's employer, does NOT grant the employer's
// admins any access, and does NOT touch the caller's existing employer membership —
// they simply become the sole owner of an additional, independent company. On success
// the new company is set as the active organization and the whole app shell refreshes
// (createOwnCompany's own revalidatePath("/", "layout")), so the effect is immediately
// visible without a manual switch.
export function CreateOrganizationDialog() {
  const [open, setOpen] = useState(false);

  // Wraps the server action so a successful submit (return value null, same convention
  // as createCompany in lib/data/companies.ts) also closes the dialog — useActionState's
  // own state can't distinguish "just succeeded" from "never submitted" since both read
  // as error === null, so the close happens here instead.
  async function submit(prevState: string | null, formData: FormData) {
    const result = await createOwnCompany(prevState, formData);
    if (result === null) setOpen(false);
    return result;
  }
  const [error, formAction, pending] = useActionState(submit, null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant="ghost" size="icon-sm" className="shrink-0" aria-label="Create organization" />}
      >
        <Plus className="h-3.5 w-3.5" />
      </DialogTrigger>
      <DialogContent>
        <form action={formAction}>
          <DialogHeader>
            <DialogTitle>Create your own organization</DialogTitle>
            <DialogDescription>
              You become its sole owner. Your existing employer membership is unchanged —
              this new company is completely independent of it.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="org-name">Company name</Label>
              <Input id="org-name" name="name" required autoFocus />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="org-country">Country (optional)</Label>
              <Input id="org-country" name="country" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="org-legal-name">Legal entity name (optional)</Label>
              <Input id="org-legal-name" name="legal_entity_name" />
            </div>
          </div>
          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create organization"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
