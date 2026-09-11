"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserMinus } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { deactivateCompanyMembership } from "@/lib/data/memberships";
import type { CompanyRef } from "@/lib/data/company-ref";

// THE SCREEN THAT CAN TAKE ACCESS AWAY (BUG-035, IM-D5).
//
// Company memberships used to render as three read-only columns. Invitations could be revoked; the
// MEMBERSHIP an accepted invitation creates could not be touched by anything a founder could open — so an
// accepted invitation produced an active member with no way back. A governed lifecycle that can only ever
// add is not governed.
//
// It shows `active` as well, because a list that hides the difference between current and ended access is
// not a record of access at all — and after a removal the row stays, which is the point of deactivating
// rather than deleting.
//
// REMOVING ACCESS IS NOT REVERSIBLE FROM HERE, deliberately. There is no "restore" button, because
// re-granting membership from the application is the founder's prohibition in its exact words: authority is
// granted at ACCEPTANCE and nowhere else. Someone who should have access again is INVITED again.

type MembershipRow = {
  id: string;
  role_in_company: string;
  // NULLABLE, because the column is. A row whose `active` is null is not a row whose access is on: the
  // consumers that matter all filter on `active = true`, so null reads as "no access" everywhere else and
  // must read that way here too. Typing it `boolean` made the compiler reject the real query's result,
  // which was the query telling the truth.
  active: boolean | null;
  companies: CompanyRef;
  profiles: { full_name: string | null } | { full_name: string | null }[] | null;
};

function personName(m: MembershipRow): string {
  if (!m.profiles) return "—";
  const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
  return p?.full_name ?? "—";
}

export function MembershipsCard({ memberships }: { memberships: MembershipRow[] }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<MembershipRow | null>(null);
  const [, startTransition] = useTransition();

  function remove() {
    const m = confirming;
    if (!m) return;
    setRemovingId(m.id);
    setMessage(null);
    startTransition(async () => {
      // FINALLY, NOT AFTER THE AWAIT (BUG-037). A Server Action that REJECTS never reaches the line after
      // its await, and the row would spin for ever with no message. The action returns a terminal outcome
      // for every failure it can see; this catch is for the ones it cannot — a dropped connection, a
      // timeout, a deploy mid-request.
      try {
        const result = await deactivateCompanyMembership(m.id);
        setMessage(result.message);
        if (result.ok) router.refresh();
      } catch {
        setMessage(
          "Access could not be changed and the server did not answer. Nothing has been reported as done — you can try again.",
        );
      } finally {
        setRemovingId(null);
        setConfirming(null);
      }
    });
  }

  return (
    <Card className="overflow-hidden bg-card/80 backdrop-blur">
      <CardHeader>
        <CardTitle className="text-base">Company memberships</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {message && <p className="px-4 pb-2 text-sm text-muted-foreground">{message}</p>}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Person</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Access</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {memberships.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-medium">{personName(m)}</TableCell>
                <TableCell>{m.companies?.name ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant="outline">{m.role_in_company}</Badge>
                </TableCell>
                <TableCell>
                  {m.active ? (
                    <Badge variant="outline">Active</Badge>
                  ) : (
                    <Badge variant="secondary">Ended</Badge>
                  )}
                </TableCell>
                <TableCell>
                  {m.active && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${personName(m)}'s access`}
                      disabled={removingId === m.id}
                      onClick={() => setConfirming(m)}
                    >
                      <UserMinus className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {memberships.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No memberships yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      <AlertDialog open={!!confirming} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {confirming ? personName(confirming) : "this person"}&apos;s access?</AlertDialogTitle>
            <AlertDialogDescription>
              They lose access to {confirming?.companies?.name ?? "this company"} immediately. The membership
              record is kept, so when they had access and when it ended stay on file. Giving access back means
              inviting them again and them accepting — there is no undo button here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!removingId}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={!!removingId} onClick={remove}>
              {removingId ? "Removing…" : "Remove access"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
