import { describe, expect, it } from "vitest";
import { classifyGoal } from "../../lib/goals/classify";
import { approvalRisk, domainForRisk } from "../../lib/proposals/risk-score";

describe("deterministic business rules", () => {
  it("classifies recurring founder intent without an LLM call", () => {
    expect(classifyGoal("Review unresolved maintenance tasks every week").kind).toBe("routine");
  });

  it("routes high commercial risk to founder/finance approval", () => {
    const result = approvalRisk({
      discountPct: 20,
      marginPct: 18,
      paymentTerms: "90-day financing",
      shortageLines: [],
    });

    expect(result.risk).toBe("high");
    expect(result.approver).toBe("Founder / Finance");
    expect(domainForRisk(result)).toBe("finance");
  });

  it("blocks negative-margin proposals at critical risk", () => {
    const result = approvalRisk({
      discountPct: 0,
      marginPct: -1,
      paymentTerms: "Standard",
      shortageLines: [],
    });

    expect(result.risk).toBe("critical");
    expect(result.approver).toBe("Founder");
  });
});
