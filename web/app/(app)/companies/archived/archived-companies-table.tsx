"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { restoreCompany } from "@/lib/data/companies";

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

  return (
    <Card className="overflow-hidden bg-card/80 backdrop-blur">
      {error && <p className="px-4 pt-4 text-sm font-medium text-destructive">{error}</p>}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Country</TableHead>
            <TableHead>Archived</TableHead>
            <TableHead className="w-32" />
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
              <TableCell>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={restoringId === c.id}
                  onClick={() => handleRestore(c.id)}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {restoringId === c.id ? "Restoring…" : "Restore"}
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
  );
}
