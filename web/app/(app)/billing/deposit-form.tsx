"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PlusCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { recordDeposit } from "@/lib/data/billing";

export function DepositForm({ companies }: { companies: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await recordDeposit(companyId, Number(amount), description);
      if (result) {
        setError(result);
        return;
      }
      setAmount("");
      setDescription("");
      router.refresh();
    });
  }

  return (
    <Card className="flex flex-col gap-3 bg-card/80 p-4 backdrop-blur">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <PlusCircle className="h-4 w-4" /> Record a deposit
      </div>
      <p className="text-xs text-muted-foreground">
        Confirms a real bank transfer already received and logs it to the ledger — not a live payment flow.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>Company</Label>
          <Select value={companyId} onValueChange={(v) => setCompanyId(v as string)}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Select…">{() => companies.find((c) => c.id === companyId)?.name ?? "Select…"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Amount (USD)</Label>
          <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-32" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Description</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} className="w-64" placeholder="e.g. Wire transfer ref #1234" />
        </div>
        <Button disabled={isPending || !companyId || !amount} onClick={submit}>
          {isPending ? "Recording…" : "Record deposit"}
        </Button>
      </div>
      {error && <p className="text-sm font-medium text-destructive">{error}</p>}
    </Card>
  );
}
