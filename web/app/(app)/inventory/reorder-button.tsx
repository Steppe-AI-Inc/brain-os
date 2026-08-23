"use client";

import { useState, useTransition } from "react";
import { PackageSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { runReorderCheck } from "@/lib/data/inventory";

export function ReorderButton() {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run() {
    setMessage(null);
    startTransition(async () => {
      const result = await runReorderCheck();
      if (typeof result === "string") setMessage(`Error: ${result}`);
      else if (result.created === 0) setMessage("All stock levels are healthy.");
      else setMessage(`Created ${result.created} reorder task(s) + 1 approval.`);
    });
  }

  return (
    <div className="flex items-center gap-3">
      <Button onClick={run} disabled={isPending} variant="outline" className="gap-1.5">
        <PackageSearch className="h-4 w-4" />
        {isPending ? "Checking…" : "Run reorder check"}
      </Button>
      {message && <span className="text-sm text-muted-foreground">{message}</span>}
    </div>
  );
}
