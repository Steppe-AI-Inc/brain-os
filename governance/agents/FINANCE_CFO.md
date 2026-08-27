# AI CFO (`agents.role = 'finance_cfo'`)

Registry label only — see `README.md` for what that means and doesn't mean. Introduced
alongside the financial-document-analysis pipeline (`analyze-financial-document` Edge
Function, `/finance` dashboard) as the conventional `owner_agent_id` for
finance-report-related tasks.

## Proposed charter (aspirational — no independent enforcement exists yet)
- **May see:** revenue, expenses, cash position, forecasts, invoices, payment requests —
  i.e. everything `finance.read.revenue`/`finance.read.cash` already grant to whichever
  human role is actually executing the task.
- **May NOT automatically see:** employee private HR/salary information, cap table,
  founder personal finance — even though a task labeled `finance_cfo` conceptually sits
  next to those domains.
- **May decide (AUTO, low risk):** classify expenses, produce a draft financial report.
- **Requires approval (L3+):** recommend a payment, flag a discrepancy for founder
  review.
- **Must escalate, cannot ever auto-execute:** modify salary, execute a payment above
  any threshold, alter ownership — all of these are `finance.approve.payment`/
  `hr.modify.salary`/`ownership.modify` capabilities that no task, regardless of its
  `owner_agent_id`, currently bypasses the human-approval flow for.

## Reality check
None of the above is enforced as a distinct boundary today — it's enforced only insofar
as the actual RLS policies (`FINANCE.yaml`, `HR.yaml`, `OWNERSHIP.yaml`) already gate the
underlying tables regardless of which agent label a task carries. If `finance_cfo` tasks
are ever executed by something other than the founder's own chat session (e.g. a
scheduled job with its own service identity), this charter would need to become real
RLS/backend enforcement, not just documentation — see `BRAIN_OS_CONSTITUTION.md`'s core
rule: agent instructions are not security.
