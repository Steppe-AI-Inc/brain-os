"use client";

import { useState, useTransition } from "react";
import { BookOpenCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requestRoleKnowledgePacks } from "@/lib/data/knowledge-packs";

export function KnowledgePackButton() {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run() {
    setMessage(null);
    startTransition(async () => {
      const result = await requestRoleKnowledgePacks();
      if (typeof result === "string") setMessage(`Error: ${result}`);
      else setMessage(`Requested from ${result.created} senior-role people (${result.skipped} skipped, role not senior-tier).`);
    });
  }

  return (
    <div className="flex items-center gap-3">
      <Button onClick={run} disabled={isPending} variant="outline" className="gap-1.5">
        <BookOpenCheck className="h-4 w-4" />
        {isPending ? "Requesting…" : "Request Role Knowledge Packs"}
      </Button>
      {message && <span className="text-sm text-muted-foreground">{message}</span>}
    </div>
  );
}
