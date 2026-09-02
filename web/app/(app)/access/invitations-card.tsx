"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { XCircle } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArchivedCompanyBadge } from "@/components/archived-company-badge";
import { revokeInvitation } from "@/lib/data/invitations";
import type { CompanyRef } from "@/lib/data/company-ref";

type InvitationRow = {
  id: string;
  email: string;
  invited_role: string;
  status: string;
  expires_at: string;
  created_at: string;
  companies: CompanyRef;
};

export function InvitationsCard({ invitations }: { invitations: InvitationRow[] }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function revoke(inv: InvitationRow) {
    setRevokingId(inv.id);
    setMessage(null);
    startTransition(async () => {
      const result = await revokeInvitation(inv.id);
      setRevokingId(null);
      if (result) {
        setMessage(`${inv.email}: ${result}`);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card className="overflow-hidden bg-card/80 backdrop-blur">
      <CardHeader>
        <CardTitle className="text-base">Pending invitations</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {invitations.map((inv) => {
              const expired = new Date(inv.expires_at) < new Date();
              return (
                <TableRow key={inv.id} className={expired ? "opacity-60" : ""}>
                  <TableCell className="font-medium">{inv.email}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      {inv.companies?.name ?? "—"}
                      <ArchivedCompanyBadge status={inv.companies?.status} />
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="capitalize">
                      {inv.invited_role.replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {expired ? (
                      <Badge variant="outline">expired</Badge>
                    ) : (
                      new Date(inv.expires_at).toLocaleDateString()
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Revoke invitation"
                      disabled={revokingId === inv.id}
                      onClick={() => revoke(inv)}
                    >
                      <XCircle className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {invitations.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No pending invitations.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        {message && <p className="border-t p-3 text-sm text-muted-foreground">{message}</p>}
      </CardContent>
    </Card>
  );
}
