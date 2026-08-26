# Known Failure Modes

Every entry is a real, reproduced defect (not a theoretical risk) with root cause and
fix status. Update this file whenever a new bug class is found — per CLAUDE.md §12,
finding one instance of a pattern means searching for the whole class before closing it.

## 1. Legacy write-bypass RLS policies (FIXED, 2026-08-26)

**Symptom:** none visible from the UI — this was found by systematically auditing every
`cmd='ALL'` policy in `pg_policies`, not from a bug report.

**Root cause:** five tables (`proposals`, `proposal_items`, `product_lines`,
`inventory_items`, `sales_leads`) each carried an old `*_company_scope` policy
(`cmd=ALL`, `qual=has_company_access(company_id)`) left over from before proper
`*_write_manager` / granular insert-update-delete policies were introduced. Since RLS
policies are PERMISSIVE (OR'd together), the old broad policy silently coexisted with
the new narrow one — any active company member, not just managers, could
INSERT/UPDATE/DELETE these rows.

**Fix:** dropped the five legacy policies (migration `202608260020`). Verified via a
real impersonation test (a non-manager test account's `INSERT` into `proposals` was
rejected with `42501` after the fix).

**Search performed for the same class:** queried every `cmd='ALL'` policy in the schema
(21 total) and manually reviewed each `qual`. Only these five had a redundant broader
sibling. No further instances found as of this writing.

## 2. Storage sensitivity not enforced (FIXED, 2026-08-26)

**Root cause:** `documents_bucket_select` (Storage RLS on the `documents` bucket)
checked only company-folder membership (`has_company_access`), never
`documents.sensitivity`. A confidential document's *row* could be correctly blocked
while its *file bytes* remained fetchable via a signed URL, because Storage RLS never
joined back to the owning document's sensitivity tier.

**Fix:** rewrote the Storage SELECT policy to join `storage.objects.name` to
`documents.storage_path` and gate by the same sensitivity tiers the table uses
(migration `202608260021`/`202608260022`).

## 3. Edge Function deployment has no CI/CD (PARTIALLY FIXED — still blocked on a founder action)

**Symptom:** `.github/workflows/supabase-functions.yml` referenced Supabase project ref
`gyqlkgnyyzpwaswhshlw` — different from production's `pvphxgrtdfrudejjhzjk` — and
triggered on `branches: [main]`, a branch that doesn't exist on `origin` (default is
`master`). Zero runs, ever, in the repo's history; not even registered in GitHub's
workflow list.

**Root cause (both bugs, confirmed):** (1) wrong branch name in the push trigger — this
alone means the workflow could never fire from a normal push, regardless of the project
ref; (2) wrong project ref, so even a `workflow_dispatch` manual run would have deployed
to the wrong Supabase project.

**Fixed 2026-08-27:** corrected both — branch to `master`, project ref to
`pvphxgrtdfrudejjhzjk`, and broadened it to deploy all functions in
`supabase/functions/` (not just `sem-ai-command`) since all 6 are real production
dependencies now. Confirmed the workflow is now registered and `active` in GitHub's
workflow list (`gh api repos/.../actions/workflows`) — it wasn't a YAML parse issue,
GitHub just hadn't processed a push containing this file before.

**Still blocked:** `gh secret list` returns zero configured secrets for this repo.
`SUPABASE_ACCESS_TOKEN` doesn't exist, so the workflow will now run but fail at the
deploy step with an auth error. Generating and adding that secret is a founder action
(Supabase account token generation + GitHub repo secret) — not something to provision
unsupervised. **BLOCKER for founder:** add `SUPABASE_ACCESS_TOKEN` at Settings →
Secrets and variables → Actions, generated from
https://supabase.com/dashboard/account/tokens.

**Until then:** manual deploy + `supabase functions download` + `git diff` verification
(REGRESSION_CATALOG.md) remains the only real safety net — same as before this fix, just
now the automated path is one secret away from working instead of two bugs plus a
secret away.

## 4. AI context presented truncated arrays as complete totals (FIXED, 2026-08-27)

**Symptom (real production example):** founder asked Brain OS chat how many pending
approvals existed; it said "20" (the `.limit(20)` cap on `context.approvals`) when the
real total was 75.

**Root cause:** `sem-ai-command`'s `buildContext()` fetches `context.tasks` capped at
`.limit(30)` and `context.approvals` capped at `.limit(20)`, with no signal in the
payload that these are partial. The model had no way to distinguish "the whole
approvals list" from "the first 20 approvals" and inferred a false total from array
length — plausible LLM behavior given the data shape, not a hallucination.

**Fix:** added real `COUNT` queries (`{count:'exact', head:true}`, same RLS as the row
queries) for tasks/approvals/companies/people/projects/goals/sales_leads/inventory as
`context.counts`, and required the prompt to use them for any "how many" question,
stating "X of Y shown" when truncated. Verified live: asked the exact question again
post-fix, got "67 pending approvals... 20 of 67 approvals... shown" — cross-checked
against direct `SELECT COUNT(*)` and it matched exactly (67/67, 61/61).

**Search performed for the same class:** checked `web/app/(app)/dashboard/page.tsx`'s
stat counters (the other executive-summary surface) — all already use real `COUNT`
queries, no truncation-as-total issue there. Checked all 12 files under
`web/lib/data/` using `.limit()` — the rest are ordinary UI list pagination (a
"recent N" widget, never presented as "the total"), not the same bug class.

## 5. Duplicate clarification/blocker tasks for repeated ambiguous requests (FIXED, 2026-08-27)

**Symptom:** the founder said variations of "delete channels" / "clear chat" across
roughly 10 hours (multiple separate sessions); Brain OS created **9 separate
near-duplicate** "URGENT/CRITICAL: confirm scope" tasks (and 9 matching pending
approvals) instead of recognizing the repeated question.

**Root cause:** `sem-ai-command`'s system prompt explicitly instructs the model to
check `context.companies`/`context.people`/`context.projects`/`context.goals`/
`context.companyRelationships`/`context.personAssignments` before creating a duplicate
— but had **no equivalent instruction for ordinary tasks**, even though `context.tasks`
already includes existing open clarification tasks the model could have checked
against.

**Fix:** added an explicit "check context.tasks for an existing equivalent request
before creating a new task" rule to the prompt, called out clarification/blocker tasks
by name as the primary case this affects.

**Cleanup:** consolidated the 9 existing duplicates — marked `done` (tasks) /
`cancelled` (approvals) with a resolution note explaining why, not deleted (audit trail
preserved per CLAUDE.md's "never silently create fake production work" / preserve
audit principle applied in reverse — don't silently erase real audit history either).

**Not yet done:** this fix is prompt-level (LLM judgment), which is appropriate for a
fuzzy "is this the same question" decision but isn't a hard guarantee the way a
database constraint would be. A deterministic secondary guard (e.g. reject an insert if
an open task with the exact same title already exists for the same company) was
considered but not implemented — flagged as a possible future hardening, not required
given task titles vary in wording turn to turn (an exact-title check would have caught
0 of these 9 duplicates, since the model varied the wording each time).

## 6. Undocumented (previously untracked) deployed Edge Function (FIXED, 2026-08-27)

See LIVE_SYSTEM_MAP.md "Resolved this pass" — `sem-artifact-analyze` was live in
production with no corresponding file anywhere in git history. Recovered and committed.
Search performed: all 6 deployed functions cross-checked against `supabase functions
list`; no other undocumented functions found.

## 7. company_id never populated on audit_logs/work_orders/chat_channels (OPEN — functional gap, not a leak)

**Found while:** closing out SECURITY_MATRIX.md's impersonation-testing gap for these
three tables.

**Symptom:** `company_id IS NULL` on 100% of real rows — 141/141 `audit_logs`, 99/99
`work_orders`, 3/3 `chat_channels`. The `is_company_manager(company_id)` RLS branch
added in migration `202608260024` is therefore inert in current practice: real access
to these tables is entirely governed by `is_founder_or_admin() OR actor/creator = self`.

**Verified this is NOT a leak:** a non-manager test account's visible rows matched its
own actor/creator rows exactly (4/4 `audit_logs`, 6/6 `work_orders`, 0/0
`chat_channels`) — precise match, not "fewer than everything."

**Real consequence:** a company_manager who is not the founder currently cannot see any
audit trail, work order, or chat history for their own company, because nothing ever
sets `company_id` on these rows at creation time. The "manager reviews their team's
activity" capability implied by the RLS design doesn't actually work — not because the
policy is wrong, but because the data feeding it is incomplete.

**Fix:** not done this pass. Would need `company_id` set at creation time in
`sem-ai-command` (for `work_orders`/`chat_channels`, from context when the command is
clearly about one company) and wherever `audit_logs` rows get inserted. Lower priority
than the leaks fixed tonight since it's over-restrictive (blocks legitimate access)
rather than under-restrictive (leaks data), but worth fixing before a real
company_manager persona is onboarded and expects to use this.
