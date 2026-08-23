"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { decideApproval } from "@/lib/data/approvals";

export function ApprovalActions({ approvalId }: { approvalId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function decide(decision: "approved" | "rejected") {
    setError(null);
    startTransition(async () => {
      const result = await decideApproval(approvalId, decision);
      if (result) setError(result);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <Button size="sm" disabled={isPending} onClick={() => decide("approved")}>
          Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => decide("rejected")}
        >
          Reject
        </Button>
      </div>
      {error && <p className="max-w-64 text-right text-xs text-destructive">{error}</p>}
    </div>
  );
}
