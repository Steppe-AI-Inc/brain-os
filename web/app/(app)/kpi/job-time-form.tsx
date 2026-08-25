"use client";

import { useState, useTransition } from "react";
import { Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { logTechnicianJobTime } from "@/lib/data/kpi";

type Person = { id: string; full_name: string; role_title: string | null };

function currentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function JobTimeForm({ eligiblePeople }: { eligiblePeople: Person[] }) {
  const [personId, setPersonId] = useState("");
  const [period, setPeriod] = useState(currentPeriod());
  const [jobLabel, setJobLabel] = useState("");
  const [targetHours, setTargetHours] = useState("");
  const [actualHours, setActualHours] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (eligiblePeople.length === 0) return null;

  function submit() {
    setMessage(null);
    startTransition(async () => {
      const result = await logTechnicianJobTime({
        personId,
        period,
        jobLabel,
        targetHours: Number(targetHours),
        actualHours: Number(actualHours),
      });
      if (typeof result === "string") {
        setMessage(`Error: ${result}`);
        return;
      }
      setMessage(`Scored: ${result.scorePct}% → ${result.bonusPct}% bonus for this job.`);
      setJobLabel("");
      setTargetHours("");
      setActualHours("");
    });
  }

  return (
    <Card className="flex flex-col gap-3 bg-card/80 p-4 backdrop-blur">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Clock className="h-4 w-4" /> Log a technician job time
      </div>
      <p className="text-xs text-muted-foreground">
        No time-clock system exists yet — log actual vs. target hours per job here. The bonus % is computed
        automatically from the active efficiency-bonus rule, not chosen manually.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label>Technician</Label>
          <Select value={personId} onValueChange={(v) => setPersonId(v as string)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select…">
                {() => eligiblePeople.find((p) => p.id === personId)?.full_name ?? "Select…"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {eligiblePeople.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.full_name} — {p.role_title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Period</Label>
          <Input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="2026-08" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Target hrs</Label>
          <Input type="number" min="0" step="0.1" value={targetHours} onChange={(e) => setTargetHours(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Actual hrs</Label>
          <Input type="number" min="0" step="0.1" value={actualHours} onChange={(e) => setActualHours(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Job / contract</Label>
        <Input value={jobLabel} onChange={(e) => setJobLabel(e.target.value)} placeholder="e.g. CLIX GPS install — Unit 14" />
      </div>
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          className="w-fit"
          disabled={isPending || !personId || !jobLabel.trim() || !targetHours || !actualHours}
          onClick={submit}
        >
          {isPending ? "Logging…" : "Log job time"}
        </Button>
        {message && <span className="text-sm text-muted-foreground">{message}</span>}
      </div>
    </Card>
  );
}
