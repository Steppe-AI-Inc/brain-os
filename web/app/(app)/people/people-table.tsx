"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GraduationCap, UserPlus, CheckCircle2, RotateCcw } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RowActionsMenu } from "@/components/row-actions-menu";
import { EditSheet } from "@/components/edit-sheet";
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
import { updatePerson, endPersonEmployment, restorePersonEmployment, invitePerson, type PersonInput } from "@/lib/data/people";
import { generateOnboardingPlan } from "@/lib/data/onboarding";

type PersonRow = {
  id: string;
  full_name: string;
  email: string | null;
  role_title: string | null;
  company_id: string | null;
  active: boolean | null;
  profile_id: string | null;
  companies: { name: string } | null;
};

const EMPTY: PersonInput = { fullName: "", email: "", roleTitle: "", companyId: null };

export function PeopleTable({
  people,
  companies,
}: {
  people: PersonRow[];
  companies: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<PersonRow | null>(null);
  const [values, setValues] = useState<PersonInput>(EMPTY);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [genMessage, setGenMessage] = useState<string | null>(null);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [inviteConfirm, setInviteConfirm] = useState<PersonRow | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function restore(p: PersonRow) {
    setRestoringId(p.id);
    setRestoreMessage(null);
    startTransition(async () => {
      const result = await restorePersonEmployment(p.id);
      setRestoringId(null);
      if (result) {
        setRestoreMessage(`${p.full_name}: ${result}`);
        return;
      }
      router.refresh();
    });
  }

  function openEdit(p: PersonRow) {
    setValues({
      fullName: p.full_name,
      email: p.email ?? "",
      roleTitle: p.role_title ?? "",
      companyId: p.company_id,
    });
    setEditing(p);
  }

  function generatePlan(p: PersonRow) {
    setGeneratingId(p.id);
    setGenMessage(null);
    startTransition(async () => {
      const result = await generateOnboardingPlan(p.id);
      setGeneratingId(null);
      if (typeof result === "string") {
        setGenMessage(`${p.full_name}: ${result}`);
        return;
      }
      setGenMessage(`${p.full_name}: induction plan + certification test saved to Documents & Knowledge (HR).`);
      router.refresh();
    });
  }

  function confirmInvite() {
    const p = inviteConfirm;
    if (!p) return;
    setInvitingId(p.id);
    setInviteMessage(null);
    startTransition(async () => {
      const result = await invitePerson(p.id);
      setInvitingId(null);
      setInviteConfirm(null);
      setInviteMessage(result.message);
      if (result.ok) router.refresh();
    });
  }

  return (
    <>
      <Card className="overflow-hidden bg-card/80 backdrop-blur">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {people.map((p) => (
              <TableRow key={p.id} className={`group/row ${p.active === false ? "opacity-60" : ""}`}>
                <TableCell className="font-medium">
                  {p.full_name}
                  {p.active === false && (
                    <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
                      Employment ended
                    </span>
                  )}
                </TableCell>
                <TableCell>{p.role_title ?? "—"}</TableCell>
                <TableCell>{p.companies?.name ?? "—"}</TableCell>
                <TableCell>{p.email ?? "—"}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {p.profile_id ? (
                      <span title="Has a login account" className="flex h-7 w-7 items-center justify-center text-emerald-600">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </span>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title={p.email ? "Invite to log in" : "Add an email before inviting"}
                        disabled={!p.email || (isPending && invitingId === p.id)}
                        className="opacity-70 hover:opacity-100 group-hover/row:opacity-100"
                        onClick={() => setInviteConfirm(p)}
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Generate 1-week onboarding plan"
                      disabled={isPending && generatingId === p.id}
                      className="opacity-70 hover:opacity-100 group-hover/row:opacity-100"
                      onClick={() => generatePlan(p)}
                    >
                      <GraduationCap className="h-3.5 w-3.5" />
                    </Button>
                    {p.active === false && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Restore employment"
                        disabled={isPending && restoringId === p.id}
                        className="opacity-70 hover:opacity-100 group-hover/row:opacity-100"
                        onClick={() => restore(p)}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <RowActionsMenu
                      itemLabel="person"
                      className="opacity-70 hover:opacity-100 group-hover/row:opacity-100"
                      onEdit={() => openEdit(p)}
                      onDelete={() => endPersonEmployment(p.id)}
                      deleteLabel="End employment"
                      deletingLabel="Ending…"
                      deleteDescription="Ends their current work assignment and marks them inactive. Their record, compensation history, and KPI history are kept — this does not delete anything. You can restore employment later."
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {people.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No people visible yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        {genMessage && <p className="border-t p-3 text-sm text-muted-foreground">{genMessage}</p>}
        {inviteMessage && <p className="border-t p-3 text-sm text-muted-foreground">{inviteMessage}</p>}
        {restoreMessage && <p className="border-t p-3 text-sm text-muted-foreground">{restoreMessage}</p>}
      </Card>

      <AlertDialog open={!!inviteConfirm} onOpenChange={(open) => !open && setInviteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Invite {inviteConfirm?.full_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This sends a real login-invite email to {inviteConfirm?.email}. They&apos;ll be able to sign in
              and use Brain OS chat as an employee of {inviteConfirm?.companies?.name ?? "their company"} once they accept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!invitingId}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={!!invitingId} onClick={confirmInvite}>
              {invitingId ? "Sending…" : "Send invite"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EditSheet
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
        title="Edit person"
        saveDisabled={!values.fullName.trim()}
        onSave={async () => {
          if (!editing) return null;
          const result = await updatePerson(editing.id, values);
          if (!result) router.refresh();
          return result;
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-person-name">Full name</Label>
          <Input id="edit-person-name" value={values.fullName} onChange={(e) => setValues((v) => ({ ...v, fullName: e.target.value }))} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-person-role">Role title</Label>
          <Input id="edit-person-role" value={values.roleTitle} onChange={(e) => setValues((v) => ({ ...v, roleTitle: e.target.value }))} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-person-email">Email</Label>
          <Input id="edit-person-email" type="email" value={values.email} onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-person-company">Company</Label>
          <Select
            value={values.companyId ?? "none"}
            onValueChange={(v: unknown) => typeof v === "string" && setValues((prev) => ({ ...prev, companyId: v === "none" ? null : v }))}
          >
            <SelectTrigger id="edit-person-company" className="w-full">
              <SelectValue>
                {() => companies.find((c) => c.id === values.companyId)?.name ?? "No company"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No company</SelectItem>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </EditSheet>
    </>
  );
}
