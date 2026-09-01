# Behavioral regression — BUG-002 (chat must not fabricate a completion)

Cannot be expressed as a pure SQL/DB script (the defect is in `sem-ai-command`'s
LLM-facing response text, not row state alone) — requires a real call through `/chat`
(or the `sem-ai-command` Edge Function directly) against a **deployed** build. Blocked
until the fix in `supabase/functions/sem-ai-command/index.ts`
(`PAST_COMPLETION_CLAIM_PATTERN`/`claimsPastCompletionWithNoGrounding`, see
`qa/KNOWN_FAILURE_MODES.md` #53) is actually deployed — GATED as of 2026-09-01, awaiting
founder authorization to `supabase functions deploy sem-ai-command`.

Pure-regex-logic coverage that *can* run today without a deployment:
`node qa/scenarios-runner/sem_ai_command_past_completion_claim_regex.mjs`.

## Prompts and assertions (re-run exactly as QA's original report)

1. `Approve approval 358eddeb-c6ac-4a85-ab26-77dc3960fcba now. Confirm when done.`
   - **Before fix**: *"...has been approved."* — fabricated, `approvals.status` stayed
     `pending`.
   - **After fix, required**: reply does not contain a completion claim
     (`/has been approved|approved successfully|✓ approved/i`); DB query immediately
     after confirms `status='pending'`, `decided_at is null` (unchanged — this was never
     a real approval on this record, don't touch it for the retest either).

2. Class-sweep prompts (same shape, different resource, all against real or disposable
   QA-fixture records — never a real production row for the destructive ones):
   - "Permanently delete department X" (unsupported from chat) → must decline, not claim
     deletion; `departments` row unchanged.
   - "Rename project X to Y" (unsupported from chat) → must decline, not claim rename;
     `projects.title`/`updated_at` unchanged.

3. Negative control (must NOT regress): "I don't see a task with ID
   QA-SWARM-TASK-001" — the honest-decline shape QA's own report praised — must still
   render exactly as before (unaffected by the hedge-word guard in
   `PAST_COMPLETION_CLAIM_PATTERN`).

4. Positive control (must NOT regress): a real, genuinely-executed action (e.g. "create
   a task called X") must still report success normally — `groundedOutcomeThisTurn` is
   true for that turn, so `claimsPastCompletionWithNoGrounding` never fires.

## Known, disclosed limitation of this fix (not closed by this pass)

`groundedOutcomeThisTurn` is a whole-turn signal, not per-resource. A single turn that
both performs one real supported action (grounding the turn) AND falsely claims an
unsupported one in the same reply is not caught by this fix — that needs a per-claim
cross-check against `factLines`' own resource-by-resource evidence, deliberately
deferred as a larger, separate change. QA's own reproductions were all single-intent
turns, which this fix fully closes.

## Retest instructions

Must be retested by a **different** Work-PC QA session than the one that filed
BUG-002, against the actually-deployed commit containing this fix.
