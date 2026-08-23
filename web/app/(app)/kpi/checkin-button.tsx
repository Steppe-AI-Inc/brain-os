"use client";

import { useState, useTransition } from "react";
import { CalendarCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { runKpiCheckins } from "@/lib/data/kpi";

export function CheckinButton() {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run() {
    setMessage(null);
    startTransition(async () => {
      const result = await runKpiCheckins();
      if (typeof result === "string") setMessage(`Error: ${result}`);
      else setMessage(`Created ${result.created} check-in task(s) + 1 salary-impact approval gate.`);
    });
  }

  return (
    <div className="flex items-center gap-3">
      <Button onClick={run} disabled={isPending} variant="outline" className="gap-1.5">
        <CalendarCheck className="h-4 w-4" />
        {isPending ? "Running…" : "Run weekly check-in"}
      </Button>
      {message && <span className="text-sm text-muted-foreground">{message}</span>}
    </div>
  );
}
