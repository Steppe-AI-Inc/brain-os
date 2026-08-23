// Ported from js/modules/proposalFactory.js's approvalRisk() — same thresholds, same
// reasons. Pure function per the rewrite plan, unit-testable independent of the UI.
export type RiskLevel = "low" | "medium" | "high" | "critical";

export type ProposalRiskInput = {
  discountPct: number;
  marginPct: number;
  paymentTerms: string;
  shortageLines: string[]; // e.g. ["Lock: need 50, available 20"]
};

export type ProposalRiskResult = {
  risk: RiskLevel;
  approver: string;
  reasons: string[];
};

export function approvalRisk(q: ProposalRiskInput): ProposalRiskResult {
  const reasons: string[] = [];
  let risk: RiskLevel = "low";
  let approver = "Manager";

  if (q.discountPct > 5) {
    risk = "medium";
    reasons.push("Discount above 5% requires manager approval.");
  }
  if (q.discountPct > 15) {
    risk = "high";
    approver = "Founder";
    reasons.push("Discount above 15% requires founder approval.");
  }
  if (q.marginPct < 0) {
    risk = "critical";
    approver = "Founder";
    reasons.push("Negative margin is blocked until repriced.");
  }
  if (/barter|fuel|financing|installment|90/i.test(q.paymentTerms || "")) {
    risk = risk === "critical" ? "critical" : "high";
    approver = "Founder / Finance";
    reasons.push("Barter, fuel, or financing terms require approval.");
  }
  if (q.shortageLines.length > 0) {
    risk = risk === "critical" ? "critical" : "high";
    reasons.push(`Inventory shortage: ${q.shortageLines.join("; ")}`);
  }

  return { risk, approver, reasons: reasons.length ? reasons : ["Standard approval only before external sending."] };
}

// Maps risk reasons to the approval_domain enum used by the RLS policy
// (approvals_update_approver): finance-flagged reasons route to HR-finance,
// everything else stays with the company manager.
export function domainForRisk(result: ProposalRiskResult): "general" | "finance" {
  const financial = result.reasons.some((r) => /discount|margin|barter|fuel|financing/i.test(r));
  return financial ? "finance" : "general";
}
