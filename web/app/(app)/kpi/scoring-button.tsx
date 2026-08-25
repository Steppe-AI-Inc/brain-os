"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { runAutomatedKpiScoring } from "@/lib/data/kpi";

export function ScoringButton() {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run() {
    setMessage(null);
    startTransition(async () => {
      const result = await runAutomatedKpiScoring();
      if (typeof result === "string") setMessage(`Error: ${result}`);
      else
        setMessage(
          `Scored ${result.scored} — non-negotiable, formula-computed bonus, no manager discretion. ${result.skipped} skipped (no applicable data this period).`
        );
    });
  }

  return (
    <div className="flex items-center gap-3">
      <Button onClick={run} disabled={isPending} className="gap-1.5">
        <Sparkles className="h-4 w-4" />
        {isPending ? "Scoring…" : "Run automated bonus scoring"}
      </Button>
      {message && <span className="text-sm text-muted-foreground">{message}</span>}
    </div>
  );
}
