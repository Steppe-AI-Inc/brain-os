SCENARIO ID: SC-108-new-agent-charter-checklist

PURPOSE: A reusable template every new AI agent must satisfy BEFORE it exists. Synthetic
worked example: a hypothetical `PROCUREMENT_AGENT`. Matches the real pattern already in
`governance/agents/*.md` (BOOKKEEPING, CHIEF_OF_STAFF, FINANCE_CFO, PEOPLE_OPS, PROPOSAL,
QA, SALES, SOFTWARE, ENGINEERING_DRAFTER).

ACTOR: any engineer / agent adding an AI agent.

ORGANIZATION: n/a (process doc).

ROLE: the agent's own identity is an `agents` row (and `ai_agent` app_role for
agent-owned tasks); it has NO independent authority — an agent-owned task still executes
under real RLS and approval gates.

CAPABILITIES: to be declared in the charter, never assumed.

PRECONDITIONS: a proposal to add an agent.

ACTION: the charter (a new `governance/agents/PROCUREMENT_AGENT.md`) must state, before any
code:

1. **May READ** — which tables/domains (must reduce to existing RLS SELECT scopes; an agent
   cannot read anything its calling user's JWT cannot).
2. **May MODIFY** — which tables, which operations (reduces to existing write policies).
3. **May APPROVE** — normally NOTHING. Agents do not approve; approvals are human-gated
   (`approvals_update_approver`). State explicitly "may approve: none."
4. **May EXECUTE** — which low-risk actions run without approval; which are forced through
   an approval by `detectForcedApprovalKeywords` (finance/legal/salary/deletion/external
   comms — non-negotiable).
5. **PROHIBITED** — explicit forbidden actions (e.g. procurement agent must never approve
   its own purchase, never touch salary, never cross companies).
6. **ESCALATION** — what it does when blocked/ambiguous (create a clarification in chat,
   NOT a spurious task — per the sem-ai-command prompt rule).

EXPECTED RESULT: an agent with a written charter mapping every capability to a real
enforcement mechanism. An agent whose charter says "may approve purchases" without a
corresponding human-gated approval domain is rejected — agents do not self-authorize
(SC-065).

EXPECTED DENIALS / DATABASE STATE / AUDIT / AI VISIBILITY / CLEANUP: n/a (process doc).

AUTOMATION STATUS: MANUAL VERIFICATION ONLY — review checklist. Cross-ref
governance/agents/README.md and every governance/agents/*.md, governance/roles/AI_AGENT.md,
SC-065 (AI may not grant itself authority).

LAST VERIFIED DATE: n/a (checklist)
