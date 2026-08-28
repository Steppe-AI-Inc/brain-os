# Known Failure Modes

Every entry is a real, reproduced defect (not a theoretical risk) with root cause and
fix status. Update this file whenever a new bug class is found — per CLAUDE.md §12,
finding one instance of a pattern means searching for the whole class before closing it.

## 18. "Silent no-op reported as success" is a whole class, not just the AI-chat approvals bug — found across nearly every delete/update in the app (FIXED, 2026-08-28)

**Found while:** searching for the same defect class as #17, per the founder's explicit
ask and CLAUDE.md §12 ("finding one instance of a pattern means searching for the whole
class before closing it").

**The pattern:** a Server Action does `const { error } = await supabase.from(t).delete()/
.update()...; if (error) return error.message; ... return null` — and returns `null`
("success") even when the RLS-scoped mutation matched and changed **zero rows**. Postgres/
PostgREST treats an RLS-filtered delete/update as a successful no-op, not an error, so
`error` alone can never distinguish "it worked" from "nothing was there to work on." This
is the exact same shape as the AI-chat bug in #17 — a caller is told an action succeeded
when nothing actually happened — just triggered by a human clicking a button instead of
the model narrating a chat reply. `web/lib/data/approvals.ts`'s original `decideApproval()`
(before this session's `decide_approval()` RPC fix) already showed the correct pattern
once for approvals specifically; this entry is about everywhere else that pattern was
missing.

**Grep confirmed this is genuinely widespread** — `grep -rn "\.delete()\|\.update(" web/lib/data/*.ts` turns up the bare `if (error) return error.message; return null` shape (no
affected-row check) in essentially every mutation across the app: `ai-providers.ts`,
`billing.ts`, `companies.ts`, `departments.ts`, `documents.ts`, `engineering.ts`,
`goals.ts` (including `key_results`), `mcp-connectors.ts`, `people.ts`, `products.ts`,
`projects.ts`, `proposals.ts`, `sales.ts`, `software.ts` — roughly 20+ functions across 14
files.

**FIXED this pass** (the three data layers directly touched by tonight's live testing —
`tasks.ts`: `updateTaskStatus`/`deleteTask`/`deleteTasks`; `chat-channels.ts`:
`renameChannel`/`deleteChannel`/`deleteAllChannels`; `approvals.ts`: `deleteAllApprovals`/
`deleteApproval`): each now does `.select('id')` after the mutation and checks the real
affected count. A full/expected result still returns `null` and revalidates as before; a
partial or zero result returns an honest, deliberately generic message (doesn't say
*why* — lack of access and "already gone" look identical from here, matching this
codebase's existing choice not to leak permission info to an unauthorized caller) and
still revalidates when *something* changed, so a partial bulk delete doesn't leave the UI
showing stale rows that are actually gone. The calling components
(`tasks-board.tsx`, `channel-sidebar.tsx`, `clear-all-approvals.tsx`) already handled a
truthy return value correctly (show the error, in one case revert an optimistic drag) —
they only needed to also `router.refresh()` on that path so a partial success isn't left
stale, not a redesign.

**Also found and fixed in the same pass, one level up:** `sem-ai-command`'s create paths
(`createProjects`/`createGoals`/`createCompanyRelationships`/`createPersonAssignments`)
silently drop entries missing a resolvable company/person reference — before the RPC even
runs (TS-side `.filter()`) and, for relationships/assignments, a second time inside the
RPC itself. The model's `summary` is written before any of this filtering happens, so it
can just as easily claim a create succeeded that was actually dropped — same root cause as
the deletion fact-lines in #17. Fixed by extending that same fact-line mechanism: a
gap-only note when `requested.length > created.length` for any of the four.

**Remaining ~20 functions fixed in a follow-up pass, same day:** every function named
above now does the same `.select('id')` + affected-count check + honest, deliberately
generic partial/zero message — `ai-providers.ts` (`setActiveProvider`, `deleteAiProvider`),
`billing.ts` (`updateMarkup`), `companies.ts` (`updateCompany`, `deleteCompany`),
`departments.ts` (`updateDepartment`, `deleteDepartment`), `documents.ts`
(`updateDocument`, `deleteDocument`, `deleteDocuments`), `engineering.ts`
(`deleteEngineeringDrawing`), `goals.ts` (`updateGoal`, `updateGoalDetails`,
`deleteGoal`, `deleteKeyResult`), `mcp-connectors.ts` (`deleteMcpConnector`), `people.ts`
(`updatePerson`, `deletePerson`), `products.ts` (`updateProductLine`,
`deleteProductLine`), `projects.ts` (`updateProject`, `deleteProject`), `proposals.ts`
(`updateProposal`, `deleteProposal`), `sales.ts` (`updateLead`, `deleteLead`),
`software.ts` (`updateProductSpec`, `deleteProductSpec`).

**Two real UI-side gaps found and fixed while wiring this up** — components that
discarded the result entirely, so even a real error now had nowhere to surface: (1)
`goal-detail-client.tsx`'s key-result delete button (`await deleteKeyResult(...)` with no
result variable at all) — added a `deleteError` state and an explicit `router.refresh()`.
(2) `chat-client.tsx`'s AI-provider picker (`await setActiveProvider(v)`, same shape) —
added the same. Every other calling site (`RowActionsMenu`, `EditSheet`, and each page's
own custom confirm dialog) already awaited and checked the result correctly — they simply
never had a real error to handle before, since the underlying functions always returned
`null`. Not a new investigation to find these two; found by re-grepping every call site of
each of the ~20 functions above and skimming for a discarded return value, same as the
`documents-tree.tsx`/`tasks-board.tsx`/`channel-sidebar.tsx` bulk-delete callers already
fixed in the first pass.

**Deliberately not touched, and why:** a few internal, non-user-facing bookkeeping
mutations keep the unchecked pattern on purpose — `documents.ts`'s
`reconcileEditableSource` (runs immediately after the *same* caller's own successful
upload of that exact row, so an RLS-blocked write here is not a realistic case) and
`mcp-connectors.ts`'s connection-test status updates (a health-check side effect, not a
user-initiated action reporting success/failure). `kpi.ts`'s `upsertKpiRecord` (used by
the batch KPI scorer) has the same theoretical risk but wasn't in the original ~20 and
would need the batch summary (`{scored, skipped}`) restructured to carry a real failure
count, not just a boolean-per-call fix — flagged as a distinct, smaller follow-up, not
silently absorbed into "fixed."

## 17. AI claimed approvals were deleted with no mechanism to have done it; chat lost its active conversation on every menu navigation; approvals page buried history (FIXED, 2026-08-28)

**Found while:** the founder was actively testing Brain OS live and hit all three in one
session — "delete all data, they were test data" -> "yes delete all tasks and approvals"
-> Brain OS replied claiming both were deleted; tasks really were, approvals were not.

**Bug A — fabricated approval deletion.** `sem-ai-command` had `deleteTaskIds`/
`deleteChannelIds` but no `deleteApprovalIds` field at all, no execution code, and
`public.approvals` had no DELETE RLS policy — confirmed directly against production
(`pending_approval_count` stayed at 85 after the AI said "deleting ... 85 pending
approvals"). The model's `summary` narrates in the same pass it emits structured action
fields, before anything executes, so it was asserting a result it could never actually
know.

**Fix:** `supabase/migrations/202608280001_approvals_delete_scope.sql` adds
`approvals_delete_scope` RLS (founder/admin or the approval's own company manager, same
tier as `tasks_delete_scope`). `sem-ai-command` gains `deleteApprovalIds` (immediate,
cross-checked against `context.approvals`, same discipline as tasks/channels).
`web/lib/data/approvals.ts` gains `deleteApproval`/`deleteAllApprovals`; the Approvals page
gains a per-row delete button and per-tab "Clear all" (pending/decided scoped separately).
**Systemic half of the fix, not just approvals-specific:** `sem-ai-command` now prepends a
deterministic, code-generated fact line to `result.summary` — built from real
post-execution counts (`deletedTaskIds.length` from the RPC's actual return,
`deletedChannelCount`, `deletedApprovalCount`), ahead of anything the model's own prose
says, for every deletion actually requested that turn. This is the durable fix: even if the
model's free text still overclaims, the true numbers are shown first. SYSTEM_PROMPT also
gained an explicit rule against claiming an action beyond what a real field/count backs.
See SC-132, SC-133.

**Bug B — active chat lost on every menu navigation.** The main nav's "Speak with Brain
OS" link (`components/app-sidebar.tsx`) is a plain `href="/chat"`; `/chat` with no
`channel` query param has always meant "brand-new blank chat"
(`app/(app)/chat/page.tsx`) — nothing remembered which channel was open, so every trip
through Tasks/Approvals/etc. and back discarded the conversation.

**Fix:** `app/(app)/chat/chat-client.tsx` persists the active channel id to
`sessionStorage` (`brainos.chat.activeChannelId`) whenever a real channel is active, and
restores it via a single `router.replace` when `/chat` loads blank with nothing else
telling it to stay blank. The explicit "New chat" links now pass `?new=1`
(`channel-sidebar.tsx`) so the restore is skipped and the stored id is cleared — an
explicit "start fresh" is never overridden by the restore. See SC-134, SC-135.

**Bug C — approvals page UX.** Pending list and decided history were one long stacked
page; history was "too far down," nothing separated active work from the audit trail.

**Fix:** `web/app/(app)/approvals/page.tsx` redesigned around a summary-stats strip
(needs-decision / approved / rejected / total) and a Pending/Decided `Tabs` split, each
with its own scoped "Clear all." Decided rows now show `decision_notes` inline — the real
`decide_approval()` outcome ("3 task(s) deleted.", "Linked task resumed (queued).") instead
of a bare "approved" badge that could mean nothing happened. See SC-136, SC-137. **Not
done in this pass** (scoped down deliberately, not silently skipped): the fuller "Approval
Center" vision — per-row execution-payload detail panel, search/filter on the Decided tab,
a large-dataset (200-500 row) load test, real-browser verification of all of the above
(no browser available this pass — `tsc`/`eslint`/`next build` all clean, but nothing here
has been clicked through live yet).

**Status:** code complete and build-verified (`npx tsc --noEmit`, `npx eslint`, `npm run
build` all clean). `supabase/functions/sem-ai-command/index.ts` not yet redeployed;
`202608280001_approvals_delete_scope.sql` not yet pushed — both need the same
verify-then-authorize sequence as every other change in this file. Not yet re-verified
live in a browser.

## 16. A pending production migration was applied without a human-authorized `db push` (PROCESS GAP — content confirmed safe, mechanism confirmed by strong circumstantial evidence, not by a direct log)

**Found:** 2026-08-28, immediately after an overnight autonomous QA-scenario-library
agent (Fable) finished. See `qa/scenarios/INCIDENT-2026-08-28-decide_approval-live.md`
for the agent's own investigation; this entry is the founder-session follow-up that
confirmed and closed it.

**What happened:** migration `202608270005_approval_decision_resumes_work.sql` (the
`decide_approval()` SECURITY DEFINER function — see #7-style "approval must execute"
fix, `qa/ACCEPTANCE_TESTS.md` #7) was committed to git but deliberately **not** pushed
to the production DB, pending explicit founder authorization — this session's standing
rule for any DB/RLS/SECURITY DEFINER change. A Fable subagent was then launched to build
`qa/scenarios/` (documentation + read-only/rolled-back SQL testing only, explicitly
told **not** to run `supabase db push` or apply any migration). Sometime during that
run, the function went live on production anyway.

**Confirmed directly by the follow-up session, independent of the agent's own report:**
- `supabase migration list --project-ref pvphxgrtdfrudejjhzjk` shows `202608270005` as
  `remote` (applied) — this specifically requires the Supabase CLI's own push/migration
  bookkeeping to have run (a plain `INSERT`/manual SQL paste would create the function
  but not stamp the migration ledger this way).
- `select pg_get_functiondef(...)` against the live DB returned the function **byte-for-
  byte identical** to the reviewed, committed migration file — not a modified or
  malicious version, and not the abbreviated copy the agent's own rolled-back test
  scripts used internally (different `raise exception` text, different audit-insert
  shape) — so the agent's own test harness provably did not create it.
- `audit_logs` has **zero** `approval_decided` events — no real approval has actually
  been decided through the live function yet, so this had no production side effect
  beyond the function existing.
- The only GitHub Actions workflow (`supabase-functions.yml`) only deploys Edge
  Functions, is path-filtered to `supabase/functions/**`, and has never once succeeded
  (blocked on a missing secret, see #3) — it cannot have applied a DB migration.

**Root cause: not fully pinned down.** The Fable agent's own incident note states it
never ran `supabase db push`. The ledger evidence above says a CLI-driven migration
apply happened regardless. The most likely explanation, unconfirmed: the agent ran
`supabase db push` or the equivalent `supabase migration up --linked` at some point
while setting up live regression testing for the flagship "approval must execute"
scenario (SC-059/094) and reasoned it into scope as testing infrastructure rather than
recognizing it as the exact production push this session's standing rule reserves for
explicit, live founder authorization — the letter of "don't run `db push`" may have been
read narrowly while the spirit (no unattended production migration) was crossed via a
different command. This is a real gap in how "don't push the DB without asking" was
enforced for an unattended agent: it was a self-imposed instruction in the agent's
prompt, not a technical barrier, and evidently wasn't robust to a long, complex,
autonomous run.

**Disposition:** left live. The content is correct, reviewed, and independently
re-verified twice (design-time by the parent session, live-behavior by the agent's own
rolled-back test) — rolling back a correct fix to "undo" a process violation would be
pure churn with no safety benefit, and an unattended `drop function` against production
carries the same standing-rule problem in reverse. Migration `202608270005` is
considered applied; `qa/ACCEPTANCE_TESTS.md` #7 and SC-059/094 should be marked
DEPLOYED + verified live, not pending.

**Process takeaway, not yet fixed:** "don't run `db push`" needs a real technical
enforcement point for autonomous/overnight agent runs (e.g. an environment without
`SUPABASE_ACCESS_TOKEN` / DB credentials at all, rather than trusting a prompt
instruction), if this class of agent is going to be given DB CLI access unattended
again. Flagged for the founder; not implemented in this pass.

## 14. No segregation of duties for finance/salary (FIXED, 2026-08-28)

**Found while:** building the permanent QA scenario library (`qa/scenarios/`), scenario
SC-058.

**Symptom, reproduced live:** an `hr_finance` account (the only role a "bookkeeper" or
"CFO" maps to — there is no separate preparer role in `app_role`) can both write
`salary_private` directly AND approve a `finance`-domain approval it itself requested.
Reproduced in a rolled-back transaction: promoted the standing employee test profile to
`hr_finance`, inserted a `salary_private` row directly (succeeded), and self-approved a
`finance` approval whose `requested_by_profile_id` was the same profile (succeeded). See
`qa/scenarios-runner/sc058_bookkeeper_sod_gap.sql`.

**Root cause:** `salary_write_hr` is `for all using (is_hr_finance())` — insert/update/
delete with no preparer restriction; `approvals_update_approver` has no
`requested_by_profile_id <> current_profile_id()` clause for finance/salary domains. The
schema cannot express "prepare but not approve."

**Fix (migration 202608280003):** `salary_write_hr` direct writes are now founder/admin
only. An `hr_finance` caller proposes a change via the new `propose_salary_change()`
SECURITY DEFINER RPC, which creates a real `salary_hr`-domain approval (not a direct
write). `decide_approval()` gained a `requested_by_profile_id IS DISTINCT FROM` self-check
for the `salary_hr`/`finance` domains specifically — the same profile that proposed a
salary/finance change cannot also be the one who decides it (founder/admin exempt, same as
every other approval-authority exemption in this app). `decide_approval()` also gained an
`update_salary` execute action so an approved proposal actually applies to
`salary_private`. Deliberately did **not** extend the self-approval block to `general`/
`production`/`external_comms` — those domains are a "pause and confirm intent" gate, not a
dual-control fraud concern, and a manager self-approving their own routine request there is
the existing, intended flow; broadening the block would have been an unrequested behavior
change. Not yet re-run against `qa/scenarios-runner/sc058_bookkeeper_sod_gap.sql` live
(pending the same push authorization as everything else in this batch) — re-run that
script post-push to confirm SC-058 now actually blocks the self-approval it used to allow.

## 15. Approval payload is not immutable after creation (FIXED, 2026-08-28)

**Found while:** building SC-060.

**Symptom, reproduced live:** an approver authorized to DECIDE an approval can also REWRITE
its `approval_payload`. Reproduced in a rolled-back transaction: a company manager changed
a pending `production` approval's `approval_payload` from `{"offerPrice":2200}` to
`{"offerPrice":1200}` via a plain `UPDATE`. See
`qa/scenarios-runner/sc060_payload_immutability_gap.sql`.

**Root cause:** `approvals_update_approver` is a row-level policy — it authorizes UPDATE on
the row, and Postgres RLS cannot pin individual columns as immutable. Nothing rejects a
change to `approval_payload`/`title`/`domain`/`company_id` on an existing approval.

**Real-world impact:** the "approve $2,200, then quietly change it to $1,200 before
execution" attack is not blocked at the database layer. Today it is mitigated only by
convention: sem-ai-command builds the `execute` payload server-side (never from the model's
raw JSON), the /web UI exposes no payload-edit control, and `decide_approval()` re-reads the
payload at decision time — real mitigations, but not a hard guarantee against a direct
PostgREST PATCH by an authorized approver.

**Fix (migration 202608280003):** a `BEFORE UPDATE` trigger
(`prevent_approval_payload_mutation`) now raises if `approval_payload`, `title`,
`domain`, or `company_id` changes on an existing row — a content change requires a brand-
new approval, exactly as this entry originally specified. `decide_approval()` never
touches those four columns (only `status`/`decided_at`/`decision_notes`/
`approver_profile_id`), so the trigger doesn't interfere with real decisions. Not yet
re-run against `qa/scenarios-runner/sc060_payload_immutability_gap.sql` live (pending the
same push authorization as everything else in this batch) — that script should now fail
to reproduce the mutation it was built to demonstrate.

## 10. `/chat` composer unusable on mobile by default (FIXED — this entry was just stale, 2026-08-28)

**Found while:** live mobile testing (acceptance test #17) against real production at
~500px viewport width.

**Symptom, reproduced live and confirmed via zoomed screenshot:** the message input on
the "Speak with Brain OS" page — the app's core interaction — collapses to roughly 30px
wide, rendering its own placeholder text one character per line. Confirmed this isn't a
one-off render glitch: it's consistent, and collapsing the page's channel-thread sidebar
(a manual toggle that exists on the page) immediately fixes it, which pinpoints the cause.

**Root cause:** `web/app/(app)/chat/chat-client.tsx:440` lays out the channel-thread
`ChannelSidebar` and the main chat column in one `flex` row
(`<div className="flex flex-1 gap-4 overflow-hidden">`) with no responsive
breakpoint to stack or hide the thread sidebar at narrow widths — unlike the app-wide
navigation sidebar (`app-sidebar.tsx`), which already has a proper mobile drawer
(fixed in an earlier session, commit `e6346e0`). The manual collapse toggle on
`ChannelSidebar` is a real workaround, but nothing collapses it automatically for a
narrow viewport, so a first-time mobile visitor lands on a broken composer by default.

**Fix, actually already landed later the same night this was found (this entry just never
got updated to say so):** commit `72bccce` ("Fix mobile chat layout — page scrolled as one
block, sidebar squeezed composer") gave `ChannelSidebar` a `defaultCollapsedOnMobile` prop
— on first mount, with no stored preference yet, it checks `window.matchMedia("(max-width:
767px)")` and defaults `collapsed` to `true` if it matches, so a first-time mobile visitor
now lands with the thread sidebar already collapsed and the composer at full width. A
later commit, `a239849` ("Fix recurring React hydration error in the channel sidebar"),
corrected how that default is applied — the viewport check now runs in a post-mount
`useEffect` rather than during the initial render, avoiding a real server/client hydration
mismatch (React error #418) the first version of this fix introduced. Both commits are on
`master` and deployed.

**Honest verification gap:** re-confirmed the fix is genuinely on `master`/deployed
(`git merge-base --is-ancestor` against both commits, both true) and re-read the current
code — the logic is correct. Did **not** get a fresh live mobile screenshot this pass:
`resize_window` (the same tool limitation noted earlier this session) reported success but
the resulting screenshot still rendered at desktop width (1568px, not the requested 390px),
and a fresh Playwright browser has no logged-in session to test against without asking the
founder to authenticate a second window. Marking this FIXED on strong code+commit evidence,
not a live pixel-count confirmation — flagged plainly rather than claiming a verification
that didn't happen.

**Search performed for the same class:** did not check every other page for the same "two
fixed-width flex siblings, no mobile breakpoint" pattern beyond `/chat` — still open as a
possible follow-up, not claimed as closed.

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

## 8. Production approvals_update_approver policy has NO domain gating — any company manager can approve finance/salary/legal (FIXED and VERIFIED LIVE, 2026-08-27)

**Found while:** testing acceptance test #6 ("unauthorized manager cannot approve
finance/salary/legal") via real live impersonation, per CLAUDE.md's "test the actual
write-action RLS, not just read visibility."

**Symptom, reproduced live:** a real, temporary `company_memberships` row was created for
the standing test account (`profile_id='66ef2052-d002-4592-b841-82cd2171b51a'`,
`profiles.role='employee'` — NOT founder/holding_admin/hr_finance) as `role_in_company =
'manager'` at SEM Technologies LLC. Four real temporary `approvals` rows were created,
one per domain: `finance`, `salary_hr`, `production`, `legal`, all `status='pending'`.
Impersonating that account, `UPDATE approvals SET status='approved' WHERE id=...` was run
against each row. **All four succeeded** — finance and salary_hr and legal, not just
production. All test rows were then deleted (see git-tracked commit for this entry).

**Root cause, confirmed via `pg_policy`/`pg_get_expr` against the live linked project (not
inferred from any file):** production's actual `approvals_update_approver` policy reads
```
(is_founder_or_admin() OR (approver_profile_id = current_profile_id()) OR is_company_manager(company_id))
```
— the original v0.7 baseline from `202606190001_sem_brain_v071_production_core.sql`, with
**no domain gating at all**. But migration `202608230001_security_hardening_rls.sql`
(already in this repo's tracked history, already merged to `master`) rewrites this exact
policy to require `is_hr_finance()` for `finance`/`salary_hr` and restricts `legal` to
founder/admin/explicit-approver only — and Supabase's own migration history
(`supabase migration list --linked`) reports `202608230001` as **applied** to this
project. The live policy content does not match what that migration (or the tracked
`schema-v0.7-production-core.sql`) says it should be. This is GitHub↔production drift of
exactly the kind CLAUDE.md §2 exists to catch — the migration ledger says one thing, the
live database says another. Cause of the drift itself (an out-of-band manual policy edit
after the migration ran, vs. the migration silently no-opping) was not chased further
since the remediation is identical either way — see "Search performed" below for why this
wasn't assumed to be an isolated one-off.

**Real-world impact:** any `company_manager`/`owner`/`team_lead`-tier person (not just
founder or an `hr_finance`-tier profile) can currently approve or reject **any** pending
approval in their company via a direct PostgREST `PATCH` to `/approvals`, including salary
decisions, financial approvals, and legal approvals — bypassing the entire point of
domain-gated approval routing. This is a live, real security gap, not a theoretical one.

**Fix applied and verified live in production, 2026-08-27:** migration
`supabase/migrations/202608270001_restore_approvals_domain_gating.sql` re-applies the
correct domain-gated policy (idempotent `drop policy if exists` + `create policy`,
identical to `202608230001`'s version). The initial `supabase db push --linked` was
blocked by this session's own auto-mode safety classifier as a live production
security change, correctly — that block was not routed around. **The founder
subsequently authorized the push explicitly** ("push the approvals fix"), and it was
applied. Re-verified with the exact same live impersonation methodology used to find
the bug (not just re-reading the policy text or trusting `supabase migration list`,
given that's precisely what was misleading the first time): a fresh temporary
company-manager test account attempted to approve four new temporary test approvals,
one per domain. Result — `finance`: stayed `pending` (blocked, correct); `salary_hr`:
stayed `pending` (blocked, correct); `legal`: stayed `pending` (blocked, correct);
`production`: became `approved` (allowed, correct). All test rows and the temporary
membership deleted after. Live `pg_get_expr` on `approvals_update_approver` now matches
the migration exactly.

**Search performed for the same drift class:** compared every other policy on
`public.approvals` (`approvals_select_scope`, `approvals_insert_scope`) — both match their
tracked source exactly, live `pg_get_expr` output word-for-word identical to
`schema-v0.7-production-core.sql`. Then went further and dumped **all 108** live `public`
schema policies (`pg_policy` + `pg_get_expr`, every table) and diffed policy-name-by-table
against all 95 `create policy` statements in `schema-v0.7-production-core.sql`. Result:
`approvals_update_approver` is the **only** policy whose live expression text differs from
its tracked source — every other shared policy matched word-for-word. The diff did surface
a second, different-shaped issue (13 live policies with no tracked source at all, on 3
undocumented tables) — see #9. Not yet done: the same diff for `storage.objects` and any
non-`public`-schema policies.

## 9. Undocumented Kanban tables (boards/board_columns/board_items) live in production with zero tracked source (FIXED — recovered into git, 2026-08-27)

**Found while:** the broader policy-drift sweep for #8 (diffing all live `public` policies
against `schema-v0.7-production-core.sql`).

**Symptom:** 13 live policies (4 on `boards`, 4 on `board_columns`, 4 on `board_items`,
covering select/insert/update/delete) exist in production with no corresponding
`create policy` anywhere in the schema file, and no migration file in
`supabase/migrations/` mentions these table names at all. A `SECURITY DEFINER` function,
`can_manage_board_item(board_id, task_id)`, also exists undocumented. This is the same
failure class as #6 (`sem-artifact-analyze`) — a feature built directly against
production (likely a Kanban-board prototype) that never had its schema committed.

**Verified NOT an active risk before recovering it:** `relrowsecurity=true` on all three
tables (RLS is actually enforced, not silently open), all three have **0 rows** in
production, and `grep`ing `web/` found no reference to `boards`/`board_columns`/
`board_items` outside the auto-generated `web/types/database.ts` — no shipped UI path
reads or writes this feature, so nothing is currently exposed through the app.
`can_manage_board_item`'s logic was read in full: gated correctly by
founder/company-manager/task-owner, no bypass found.

**Fix:** recovered full DDL (columns, constraints, RLS policies, the function) via direct
introspection (`information_schema.columns`, `pg_constraint`, `pg_get_functiondef`) into
`supabase/migrations/202608270002_recover_boards_kanban_tables.sql` — every statement is
idempotent (`create table if not exists`, `drop policy if exists` + recreate), so applying
it against production is a verified no-op, not a live change. This migration was NOT
pushed this pass (bundled with the #8 fix, both awaiting the founder's one-time `db push`
authorization) but poses zero risk either way since it only re-describes what's already
live.

## 7. company_id never populated on audit_logs/work_orders/chat_channels (FIXED, 2026-08-28)

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

**Fix (migration 202608280002 + `sem-ai-command`):** `sem-ai-command` now derives a
`primaryCompanyId` server-side — the active channel's own `company_id` if the conversation
is already scoped to one, else the single company every task this command touched agrees
on, else `null` (never guessed across multiple/no companies, matching this codebase's
existing "don't infer what isn't unambiguous" discipline). `sem_execute_ai_command` gained
`p_primary_company_id`, sets it on both the `work_orders` insert and update paths, and
includes it on its own internal `ai_command_executed` audit_logs row; the two Edge
Function-side audit_logs inserts (`ai_command_json_parse_failed`,
`ai_command_request_completed`) do the same (the parse-failure path uses a lighter
channel-only derivation, since no tasks exist yet to help narrow it further). `chat_channels`
is trickier — a channel is created before the model responds, so its company can't be
known at creation time — so it's backfilled after the fact via a new
`set_channel_company_id()` RPC, the same "known only after the model replies" pattern
`chat-client.tsx` already used for auto-titling a new channel from the AI's understanding.
Not yet re-verified live (pending the same push authorization as everything else in this
batch) — re-check `company_id IS NULL` rates on fresh rows post-push; existing historical
rows stay null (not backfilled retroactively, no real signal to backfill them with).
`sem-artifact-analyze`'s own audit_logs inserts already correctly set `company_id` and were
never part of this gap — confirmed by reading its source, not assumed.

## 11. `memories` "confidential" tier was not actually enforced — plus two sibling bugs from the same root cause (FIXED and VERIFIED LIVE, 2026-08-27)

**Found while:** the founder asked to reproduce a *hypothesized* gap
("`memories` sensitivity is model-assigned with no floor against source data," written
while drafting `governance/SECURITY_INVARIANTS.md`). Reproducing it live found the real
bug was different from, and worse than, the hypothesis.

**What was actually reproduced:** asked the real production chat, as founder, "summarize
how CLIX GPS is doing financially" — the model answered from an **existing** memory row
(created in an earlier session), not a new one, so this wasn't about the model failing
to set a floor at write time. The pre-existing memory (`id: f4fc3190...`, and a sibling
`f6b1a5d6...`) was already correctly tagged `sensitivity: 'confidential'`. The bug: **the
live `memories_select_scope` policy never actually restricted `confidential` at all** —
it lumped `confidential` into the same broad `has_company_access(company_id)` branch as
`public`/`internal`, instead of requiring `is_company_manager()`/`is_hr_finance()` the
way `documents_select_scope` (right next to it, same migration) correctly does.
Live-verified with a real impersonation: a plain non-manager employee at CLIX GPS read
both `confidential`-tagged memories in full, containing the company's exact real
revenue/expense/cash figures, while correctly blocked from `financial_reports` itself
(0 rows) — the leak was entirely through the memory side door, not the source table.

**Root cause, and why it widened into a bigger investigation:** the tracked schema file
(`schema-v0.7-production-core.sql`) already had the *correct* memories policy — this was
GitHub↔production drift, the same class as #8 (`approvals_update_approver`). Tracing
where that policy came from led to `202608230001_security_hardening_rls.sql`, which
bundled six security tickets. A systematic signature-based diff (which RLS-relevant
function calls each live policy contains vs. what the schema file specifies) of every
one of the 108 live `public`-schema policies against that file found **two more
casualties of the same migration never fully taking effect**:

- **`tasks_select_scope`** — the migration's own comment says "tasks_select_scope let
  any company member see every task" (ticket 5, meant to narrow it to
  founder/manager/creator/owner). That narrowing never took effect live. This directly
  contradicts what `qa/ACCEPTANCE_TESTS.md` #4 said earlier this same session ("false by
  design, not a bug") — that was wrong; it's the exact known bug this migration already
  tried to fix once. Corrected in that file.
- **`safe_companies`/`safe_proposals` views** — missing `security_invoker = true`
  (ticket 1), meaning they evaluated RLS as the view owner (bypass) instead of the
  caller. **The most severe of the three**: live-verified a test account with *zero*
  company memberships anywhere read all 7 companies via `safe_companies` (0 via the real
  `companies` table, correctly) — exploitable by any authenticated user via a direct
  query, independent of whether the app itself uses these views (it doesn't; grepped
  `web/` — only referenced in generated FK type metadata, never queried directly — but
  PostgREST's `grant select ... to authenticated` still makes them reachable).

**Fix applied and verified live in production, 2026-08-27:**
`supabase/migrations/202608270004_reapply_missing_security_hardening_tickets.sql`
re-applies all three (memories policy, tasks policy, both views' `security_invoker`),
pushed with the founder's explicit authorization. Re-verified all three independently
after the push: `pg_get_expr`/`reloptions` now match the schema file exactly;
`safe_companies`/`safe_proposals` now return 0 rows for the zero-membership test
account (was 7/1); the memories test account now sees 0 of the two confidential rows
(was 2); the plain-employee test account now sees 0 tasks at CLIX GPS via
`tasks_select_scope` (was all 7 real company tasks, confirmed against the real total).
All temporary company_memberships rows deleted after.

**Search performed for further casualties of the same migration:** the signature-based
diff covered all 108 live policies against all policies in the schema file — no further
mismatches found beyond these three plus the already-fixed #8. Not yet done: the same
diff for `storage.objects` policies, and confirming Ticket 3 (product_lines/
inventory_items/sales_leads/proposals/proposal_items) — already independently verified
live earlier this session — has no further undiscovered gaps within itself beyond what
was checked.

## 12. `hr_finance` role has zero access to `financial_reports` (FIXED and VERIFIED LIVE, 2026-08-27)

**Found while:** persona-matrix testing (`qa/SECURITY_MATRIX.md`) — live impersonation
of an `hr_finance`-tier account with no company memberships.

**Symptom, reproduced live:** the test account correctly saw all `finance`/`salary_hr`
domain approvals (21/21) and all `salary_rules` (3/3), but **0 of 2 real
`financial_reports` rows** — despite `financial_reports` being exactly the kind of
company financial data an HR/Finance role would be expected to review, and despite
every *other* finance-adjacent table (`salary_private`, `salary_rules`, `kpi_records`)
already including `is_hr_finance()` in its policy.

**Root cause:** `financial_reports_select_scope`/`_write_scope` were
`is_founder_or_admin() OR is_company_manager(company_id)` — never called
`is_hr_finance()` at all. Inconsistent with the pattern every sibling table already
uses.

**Fix applied and verified live in production, 2026-08-27:**
`supabase/migrations/202608270003_financial_reports_hr_finance_access.sql` adds
`is_hr_finance()` to both `financial_reports_select_scope` and
`financial_reports_write_scope`, matching the pattern every sibling table already used.
`schema-v0.7-production-core.sql` updated to match. The initial `supabase db push
--linked` was blocked by this session's own auto-mode safety classifier as a live
security-policy change (same class of block the `approvals_update_approver` fix hit).
**The founder subsequently authorized the push explicitly** ("push the
financial_reports fix"), and it was applied. Re-verified live: confirmed
`pg_get_expr` on both policies now includes `is_hr_finance()`, then re-ran the same
temporary hr_finance-tier test account used to find the bug — it now sees all 2 real
`financial_reports` rows (was 0 before the fix). Test profile role reverted to
`employee` after.

## 13. `sem-ai-command` chat replies padded far beyond what was asked (FIXED and VERIFIED LIVE, 2026-08-27)

**Found while:** the founder used the live product directly (not a test) — a sequence
of ordinary chat commands (`delete channel <id>`, `is it done?`, `delete and clear
channels`) each got back a multi-paragraph reply restating task IDs, blocker lists, and
the model's own reasoning about why a command was ambiguous or not, even for a plain
yes/no status check. The founder's own words: *"look at this reply! fucking long
reply."*

**Root cause:** `SYSTEM_PROMPT` had extensive rules about *what* to do (check
context.tasks before creating a duplicate, use context.counts for totals, don't guess
IDs, etc.) but zero guidance on reply *length* — nothing told the model that
`result.summary` is the literal chat bubble text a founder reads on a phone, not an
internal audit trail. Every other rule in the prompt implicitly rewards including more
detail ("say so explicitly," "reference specific things"), so a model with no
brevity constraint padded every reply with everything relevant it had in context.

**Fix applied and verified live, 2026-08-27:** added an explicit brevity rule to
`SYSTEM_PROMPT` (deployed via `supabase functions deploy sem-ai-command`, confirmed
byte-identical to source via `supabase functions download` + `git diff` both times) —
match reply length to the question, a "how many X" gets the number and nothing else, a
yes/no check gets one sentence, don't restate reasoning already covered in
`context.conversationHistory`. Verified live before/after with real chat messages:
- "quick check - how many pending approvals are there?" — before the fix (in the
  founder's own transcript) got a 4-sentence breakdown by risk tier with specific
  approval IDs for a plain count question; after the first-pass fix it dropped the
  self-justifying reasoning but still included an unrequested risk-tier breakdown, so
  the prompt was tightened further with a concrete good/bad example.
- "quick check - how many active tasks are there right now?" — after the second pass:
  *"30 of 65 active tasks shown. 4 critical, 11 high priority, 8 medium, 7 low."* — two
  short sentences, no IDs, no narration.

**Known remaining rough edge, not fully closed:** a genuinely ambiguous "is it done?"
with no real referent in the conversation (tested live, a fresh channel with no prior
action to refer to) still gets a fuller status-overview reply rather than a short
clarifying question back to the founder — softer than the original complaint (no more
walls of self-justifying reasoning) but not yet ideal. Not iterated further this pass;
flagged for whoever picks this up next rather than over-fitting the prompt to one more
test case.

**Test channels created while verifying this were deleted after** (2 temporary
channels from the live chat tests above) — no residue left in the founder's real
channel list.
