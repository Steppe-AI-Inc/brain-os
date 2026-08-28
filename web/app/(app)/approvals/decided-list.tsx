"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApprovalDeleteButton } from "./approval-delete-button";
import { ClearAllApprovals } from "./clear-all-approvals";

type DecidedApproval = {
  id: string;
  title: string;
  reason: string | null;
  status: string | null;
  domain: string | null;
  decision_notes: string | null;
  approval_payload: unknown;
  companies: { name: string } | null;
};

const DOMAINS = ["all", "general", "salary_hr", "finance", "legal", "production", "external_comms"];

// Client-side search/filter over an already-loaded list (getApprovals() has no limit, so
// this is filtering the real total, not a truncated page) — no round-trip needed for a
// dataset this size. "Clear all" respects the current filter, not the full decided set,
// so a founder searching for one domain and hitting Clear all doesn't unexpectedly wipe
// everything else too.
export function DecidedList({ approvals }: { approvals: DecidedApproval[] }) {
  const [query, setQuery] = useState("");
  const [domain, setDomain] = useState("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return approvals.filter((a) => {
      if (domain !== "all" && a.domain !== domain) return false;
      if (!q) return true;
      return (
        a.title.toLowerCase().includes(q) ||
        (a.reason || "").toLowerCase().includes(q) ||
        (a.decision_notes || "").toLowerCase().includes(q) ||
        (a.companies?.name || "").toLowerCase().includes(q)
      );
    });
  }, [approvals, query, domain]);

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, reason, outcome, company…"
            className="h-8 pl-8 text-xs"
          />
        </div>
        <Select value={domain} onValueChange={(v) => setDomain(v ?? "all")}>
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue placeholder="Domain" />
          </SelectTrigger>
          <SelectContent>
            {DOMAINS.map((d) => (
              <SelectItem key={d} value={d}>
                {d === "all" ? "All domains" : d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto">
          <ClearAllApprovals ids={filtered.map((a) => a.id)} scopeLabel={query || domain !== "all" ? "filtered" : "decided"} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {filtered.map((a) => {
          const execute =
            a.approval_payload && typeof a.approval_payload === "object"
              ? (a.approval_payload as Record<string, unknown>).execute
              : null;
          const isExpanded = expanded.has(a.id);
          return (
            <div key={a.id} className="rounded-lg border border-border/60 text-sm">
              <div className="flex items-center justify-between gap-4 px-4 py-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{a.title}</span>
                    <Badge variant="outline" className="text-[10px]">{a.domain}</Badge>
                    {a.companies?.name && (
                      <Badge variant="secondary" className="text-[10px]">{a.companies.name}</Badge>
                    )}
                  </div>
                  {/* decision_notes is the real "what actually happened" record — a task
                      resumed, a deletion executed, or nothing at all if this approval had
                      no linked action. Showing it here is the direct fix for "approved"
                      silently meaning nothing happened. */}
                  {a.decision_notes && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{a.decision_notes}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={a.status === "approved" ? "default" : "destructive"}>
                    {a.status}
                  </Badge>
                  {!!execute && (
                    <button
                      type="button"
                      onClick={() => toggleExpanded(a.id)}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      title="Show the exact execution payload"
                    >
                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      Payload
                    </button>
                  )}
                  <ApprovalDeleteButton approvalId={a.id} title={a.title} />
                </div>
              </div>
              {isExpanded && !!execute && (
                <div className="border-t border-border/60 bg-muted/30 px-4 py-2">
                  <pre className="overflow-x-auto text-[11px] text-muted-foreground">
                    {JSON.stringify(execute, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {approvals.length === 0 ? "No decided approvals yet." : "No decided approvals match this search/filter."}
          </p>
        )}
      </div>
    </div>
  );
}
