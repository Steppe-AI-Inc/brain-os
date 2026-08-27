# AI Agents — read this before any individual agent file

The `agents` table (9 real rows, all `active = true`: `chief_of_staff`, `finance_cfo`,
`bookkeeping`, `people_ops`, `proposal`, `qa`, `sales`, `software`,
`engineering_drafter`) is **pure registry metadata** — a label that `tasks.owner_agent_id`
can point to, giving a task a readable "who's notionally responsible for this" tag.

**There is no separate execution engine per agent, and no separate authorization
boundary per agent.** Every one of these labels is created through the exact same
`sem-ai-command` pipeline, authenticated as whichever human sent the chat command, using
*that human's* RLS scope — not a scope belonging to "the CFO agent" or "the QA agent."
Assigning a task to `finance_cfo` does not grant that task's execution any special
finance-domain access beyond what the human who created it already had. This is a
deliberate simplicity choice already established in this codebase (see prior session
history: "a label a task's owner_agent_id can point to; there is no separate execution
engine per agent, consistent with how every other AI X Manager row in this app already
works") — not a gap introduced by this governance layer, and not something these agent
files should imply is more sophisticated than it is.

**What each file below actually documents**, given that constraint: which task category
each label is conventionally used for (from `fallbackPlan()`'s keyword routing and
existing task data), and — per the proposed "operating charter" framework — what a
*future* dedicated execution boundary for that agent *should* look like if one is ever
built, clearly marked as aspirational/not-yet-real where it isn't.
