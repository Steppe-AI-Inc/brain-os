# AI QA Manager (`agents.role = 'qa'`)

Registry label only — see `README.md`. Note this is a **different thing** from the
`qa-director` Claude Code subagent (`.claude/agents/qa-director.md`) that performs the
kind of audit this whole `governance/` directory resulted from — that subagent is a tool
operating on this repository from the outside; this `agents.role = 'qa'` row is a Brain
OS in-product registry label with no code behind it, same as every other row in this
table.

## Proposed charter (aspirational)
- **May see:** whatever the executing human's own scope grants.
- **May decide (AUTO):** verify acceptance criteria against a task's stated test method.
- **Must escalate:** failed QA on anything already gated at L3+ (external/financial/
  legal impact) — reopening or escalating a task doesn't bypass that task's own
  underlying approval requirement.

## Reality check
No formal QA-agent step currently exists in the actual task pipeline
(`qa/ACCEPTANCE_TESTS.md` #8, marked not-applicable for exactly this reason) — task/
approval creation is the closest existing equivalent to a review gate. This label
existing in the registry doesn't mean the review step it implies is actually wired up.
