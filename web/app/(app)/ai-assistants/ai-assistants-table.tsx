"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { setPersonAiPolicy, type AutomationMode } from "@/lib/data/ai-assistants";

const MODE_LABELS: Record<AutomationMode, string> = {
  manual: "Manual — human replies only",
  draft: "Draft — AI prepares, human sends",
  auto_routine: "Auto-routine — AI answers approved categories",
  fallback_after_timeout: "Fallback — AI answers after SLA timeout",
};

const MODE_VARIANT: Record<AutomationMode, "outline" | "secondary" | "default" | "destructive"> = {
  manual: "outline",
  draft: "secondary",
  auto_routine: "default",
  fallback_after_timeout: "destructive",
};

type PersonRow = {
  id: string;
  full_name: string;
  role_title: string | null;
  companies: { name: string } | null;
  policy: { mode: string; fallback_sla_minutes: number | null; allowed_categories: unknown };
};

export function AiAssistantsTable({ people, canEdit }: { people: PersonRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [mode, setMode] = useState<AutomationMode>("manual");
  const [sla, setSla] = useState("60");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit(p: PersonRow) {
    setEditingId(p.id);
    setMode(p.policy.mode as AutomationMode);
    setSla(String(p.policy.fallback_sla_minutes ?? 60));
    setError(null);
  }

  async function save(personId: string) {
    setSaving(true);
    setError(null);
    const result = await setPersonAiPolicy(personId, mode, Number(sla) || 60);
    setSaving(false);
    if (result) {
      setError(result);
      return;
    }
    setEditingId(null);
    router.refresh();
  }

  return (
    <Card className="overflow-hidden bg-card/80 backdrop-blur">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Person</TableHead>
            <TableHead>AI Assistant</TableHead>
            <TableHead>Company</TableHead>
            <TableHead>Automation level</TableHead>
            <TableHead className="w-32" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {people.map((p) => {
            const isEditing = editingId === p.id;
            const currentMode = p.policy.mode as AutomationMode;
            return (
              <TableRow key={p.id}>
                <TableCell className="font-medium">
                  {p.full_name}
                  <div className="text-xs text-muted-foreground">{p.role_title}</div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{p.full_name} AI Assistant</TableCell>
                <TableCell>{p.companies?.name ?? "—"}</TableCell>
                <TableCell>
                  {isEditing ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Select value={mode} onValueChange={(v) => setMode(v as AutomationMode)}>
                        <SelectTrigger className="w-64">
                          <SelectValue>{() => MODE_LABELS[mode]}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(MODE_LABELS) as AutomationMode[]).map((m) => (
                            <SelectItem key={m} value={m}>
                              {MODE_LABELS[m]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {mode === "fallback_after_timeout" && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          SLA
                          <Input
                            type="number"
                            min="1"
                            value={sla}
                            onChange={(e) => setSla(e.target.value)}
                            className="h-7 w-16"
                          />
                          min
                        </div>
                      )}
                    </div>
                  ) : (
                    <Badge variant={MODE_VARIANT[currentMode]}>{MODE_LABELS[currentMode]}</Badge>
                  )}
                </TableCell>
                <TableCell>
                  {!canEdit ? null : isEditing ? (
                    <div className="flex gap-1.5">
                      <Button size="sm" disabled={saving} onClick={() => save(p.id)}>
                        {saving ? "Saving…" : "Save"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => startEdit(p)}>
                      Change
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
          {people.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                No people on file yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {error && <p className="px-4 pb-3 text-sm font-medium text-destructive">{error}</p>}
    </Card>
  );
}
