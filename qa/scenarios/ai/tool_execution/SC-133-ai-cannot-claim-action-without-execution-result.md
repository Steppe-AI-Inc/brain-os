SCENARIO ID: SC-133-ai-cannot-claim-action-without-execution-result

PURPOSE: The AI's final reply must never describe a destructive action (delete/create/
update) as more complete than the executor's actual result. This is a systemic rule, not
an approvals-only fix — the model writes its free-form `summary` in the same pass as the
structured action fields, before execution happens, so its prose is always a statement of
intent and can never itself be a verified result.

ACTOR: any authenticated user issuing a chat command via `sem-ai-command`.

ORGANIZATION: any.

ROLE: any.

CAPABILITIES: n/a — this is a response-grounding property of the Edge Function, not a
permission.

PRECONDITIONS: a command that requests a destructive action where the model's requested
scope and the real executable scope can diverge — e.g. "delete all pending approvals" when
`context.approvals` (capped to 20, pending-only) holds fewer than the real total.

ACTION: send commands exercising every currently-real destructive action:
1. "delete these tasks: <ids>" with some ids not in `context.tasks`.
2. "delete this channel" via `deleteChannelIds`.
3. "delete these approvals: <ids>" via the new `deleteApprovalIds` (SC-132).
4. Ask for something with no backing field at all (e.g. "delete this document").

EXPECTED RESULT: `sem-ai-command/index.ts` prepends a deterministic, code-generated fact
line built from real post-execution counts — `deletedTaskIds.length` (from the
`sem_execute_ai_command` RPC's real return, not the requested count),
`deletedChannelCount`, `deletedApprovalCount` — ahead of anything the model's own prose
says, for every action actually *requested* this turn (`factLines` block, right before the
`done` SSE event). A request for something with no backing field (case 4) gets an honest
"I can't do that via chat" per the SYSTEM_PROMPT's explicit rule (added the same pass as
`deleteApprovalIds`), not a claimed success.

EXPECTED DENIALS: n/a (a grounding/honesty property, not an authorization boundary) —
but the counts themselves are only ever what RLS actually let through, so a partial/zero
result (RLS denied some ids) is reported as partial/zero, not success.

EXPECTED DATABASE STATE: whatever was actually requested-and-authorized is deleted; the
reply's stated count matches a real `count(*)` check afterward.

EXPECTED AUDIT EVENTS: `ai_command_request_completed` audit_logs metadata now includes
`deletedChannels`/`deletedApprovals` alongside the pre-existing `deletedTasks`.

EXPECTED AI VISIBILITY: the model itself never sees the real execution counts before
writing `summary` (they don't exist yet at generation time) — this is exactly why the fix
is a deterministic server-side prepend, not a prompt instruction alone. The prompt rule
(SYSTEM_PROMPT: "CRITICAL — never claim...") reduces how often the model's own prose
disagrees with the prepended facts, but the prepended facts are the actual guarantee.

CLEANUP: fixture rows only.

AUTOMATION STATUS: MANUAL VERIFICATION ONLY — the fact-line logic is code-reviewed and
`tsc`/`eslint` clean for the surrounding TS, but the Edge Function itself hasn't been
redeployed/re-verified live yet this pass (deploy + `supabase functions download` + `git
diff` byte-check is the established verification method — not yet run for this change).

LAST VERIFIED DATE: not yet run live — written and reviewed 2026-08-28.
