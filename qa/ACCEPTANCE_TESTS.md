# Acceptance Tests

Status against the 18 required tests in CLAUDE.md §15, as of 2026-08-27. `✅` = actually
verified this session or a prior one with real evidence. `⬜` = not yet tested. `➖` = not
applicable to this product's current scope (noted why).

1. Unauthenticated visitor redirects to login. ✅ — verified live against real production
   (2026-08-27), not just the middleware source: `curl` with no session cookie against
   `brain.open-spot.ai/dashboard`, `/approvals`, `/finance`, `/tasks` all returned a real
   `307` redirect to `/login`; `/login` itself returned `200` (not redirect-looped).
2. Founder command mentions a real company/device/employee; correct entities resolve
   without invented IDs. ✅ — confirmed repeatedly across tonight's chat tests (e.g. the
   onboarding-plan generation correctly referenced real tasks/goals/teammates by name).
3. Goal + work order created; atomic tasks + acceptance criteria persisted. ✅ — verified
   via the same live RPC read done for #15 (`pg_get_functiondef` on the deployed
   `sem_execute_ai_command`): the work_order row, every task (with
   `acceptance_criteria`/`test_method` populated from the model's output), and any goal
   the model requests all insert inside one plpgsql function body, so they commit or
   roll back together — genuinely atomic, not just sequential inserts that happen to
   usually succeed. One real caveat found while verifying this: a task's link to its
   goal is a free-text `parent_goal` column (copied from `result.strategicGoal`), not a
   foreign key to `goals.id` — tasks and goals created by the same command share a
   label, not a real relational link. Worth knowing if a future feature needs to query
   "tasks under goal X" reliably.
4. An employee sees only assigned work. ✅ **CORRECTION of an earlier entry in this same
   file** (2026-08-27): originally marked "false by design, not a bug" after finding a
   plain employee saw all 30 of a company's tasks. That was wrong — it was a real,
   reproduced bug, not a design choice, discovered while reproducing a separate issue
   (`qa/KNOWN_FAILURE_MODES.md` #11). Root cause: `tasks_select_scope` was supposed to
   be narrowed to founder/company-manager/task-creator/task-owner by migration
   `202608230001` (its own comment literally says "tasks_select_scope let any company
   member see every task," describing this exact bug as something already fixed) — that
   narrowing never took effect live, the same GitHub↔production drift class as #8/#11.
   **Fixed and re-verified live**: migration `202608270004` re-applied the narrowed
   policy; the same plain-employee test account (not a creator or owner of any of CLIX
   GPS's tasks) now sees 0 tasks there (real total: 7), down from seeing the full
   company total before the fix. One caveat carried over from the original
   investigation, still real: the "owner" branch of this policy
   (`pe.profile_id = current_profile_id()`) is still effectively unreachable — 0 of the
   6 real tasks with `owner_person_id` set have a `profile_id` link on that `people`
   row — so today this policy's real behavior is "founder, company manager, or whoever
   created the task," not yet "or whoever it's assigned to." Not a security issue
   (narrower than intended, not broader), but worth knowing before relying on assignee-
   based visibility.
5. Low-risk task executes without founder interruption; high-risk/external action
   waits for approval. ✅ (partially) — confirmed high-risk channel deletion always
   creates a forced approval record regardless of outcome; low-risk task creation
   confirmed not blocked.
6. Unauthorized manager cannot approve finance/salary/legal. ✅ **Found broken, fixed,
   and re-verified live in production** (2026-08-27). Originally found via real
   impersonation: a test company-manager account (not founder/hr_finance) successfully
   approved finance, salary_hr, AND legal domain approvals — root cause was
   GitHub↔production drift (migration ledger said the domain-gated policy from
   `202608230001` was applied; the live policy didn't match it). Fix migration
   `202608270001_restore_approvals_domain_gating.sql` was pushed to production with the
   founder's explicit authorization, then re-verified with a fresh live impersonation
   test (new temp manager account, new temp approvals, one per domain): `finance`/
   `salary_hr`/`legal` all correctly stayed `pending`, `production` correctly became
   `approved`. See KNOWN_FAILURE_MODES.md #8 for full before/after evidence.
7. Authorized approver approves an immutable payload; correct work-order step resumes
   exactly once. ✅ **FIXED and VERIFIED LIVE, 2026-08-28**
   (`supabase/migrations/202608270005_approval_decision_resumes_work.sql` — the
   `decide_approval()` SECURITY DEFINER RPC). Re-checks the same domain-gated approver
   authority as `approvals_update_approver` RLS, only transitions a still-`pending`
   approval (idempotent by construction — deciding twice is a safe no-op), resumes a
   linked task (`needs_approval` → `queued`/`rejected`), and executes a deferred
   deletion captured in `approval_payload.execute` (built server-side in
   `sem-ai-command/index.ts` from `pendingDeleteTaskIds`/`pendingDeleteChannelIds`,
   cross-checked against real context ids, never trusted from the model's own JSON —
   see KNOWN_FAILURE_MODES.md #16 for the deployment story, which was not the clean
   authorized-push path this session otherwise used). `web/lib/data/approvals.ts`'s
   `decideApproval()` now calls this RPC instead of a bare status update. Confirmed live
   directly against production: `pg_get_functiondef` matches the reviewed migration
   byte-for-byte, and a rolled-back live transaction test (deletion targets deleted
   exactly, control task untouched, idempotent re-run) passed —
   `qa/scenarios-runner/sc059b_live_decide_approval.sql`. The payload-immutability half
   (below) is still real and separately tracked as SC-060/KNOWN_FAILURE_MODES.md #15 —
   `approval_payload` still has no write-protection after creation; only decide_approval
   reading `.execute` from it exists now, not a guarantee nothing else can rewrite it
   first.
   **Original bug, now fixed:** the founder asked to "approve the 68-task deletion" for
   a real pending approval whose `approval_payload` had no task IDs at all (`task_id`
   was also `null`) — the model had recorded *that* deletion was needed but never
   *which* tasks, so there was nothing an approval-driven executor could have acted on
   even if one had existed. Clicking Approve would have flipped the status and deleted
   nothing. At the time this was resolved by executing the actual intent directly (the
   real per-column "Clear all" UI action); going forward, the fix above is the real
   mechanism.
8. QA verifies acceptance criteria; failed QA reopens/escalates. ➖ no formal QA-agent
   step exists in the current pipeline yet — task/approval creation is the closest
   equivalent.
9. Successful work updates outcome/memory; founder receives only the requested
   exception/final result. ✅ (partially) — memory RAG pipeline confirmed working in an
   earlier session (financial report summary retrievable via chat).
10. All transitions appear in the audit timeline. ❌ **FAILED for manual UI actions,
    confirmed by code search** (2026-08-27): `grep`ing every file under `web/lib/data/`
    for `audit_logs` found exactly one match (`chat-history.ts`, and that's a *read*, not
    a write). No write to `audit_logs` exists anywhere outside the AI-command path
    (`sem_execute_ai_command`, which does log `ai_command_executed`/
    `ai_command_json_parse_failed`/`ai_command_request_completed`). Concretely: approving
    or rejecting an approval through the Approvals page (`web/lib/data/approvals.ts`,
    the `.update({status: decision, decided_at: ...})` call) creates **zero** audit
    trail — same for manual task status changes, KPI/salary edits, document uploads, and
    proposal edits done through their respective forms. Only actions routed through AI
    chat are auditable today. Real gap, not a leak — worth the founder knowing before
    relying on the audit timeline as a complete record of who-did-what.
11. Employee cannot read ownership/cash/salaries/margins/founder memory. ✅ — extensively
    verified this session and the prior one (see SECURITY_MATRIX.md).
12. Cross-company access returns zero rows. ✅ — tested live: a test account with
    `manager` role at CLIX GPS correctly saw 0 rows for `financial_reports`/`proposals`
    belonging to a different company, while correctly retaining full access to its own
    company's data (1/1 and company-scoped data respectively).
13. Duplicate submissions do not duplicate work. ✅ (found broken, now fixed) — see
    KNOWN_FAILURE_MODES.md #5.
14. Missing AI credentials cannot silently create real production work. ⚠️ **Verified
    against the actual deployed source (2026-08-27) — partially true, not fully.** When
    no provider key is available, `sem-ai-command` calls `fallbackPlan()` (index.ts:566),
    a deterministic rule-based planner that DOES create real tasks/approvals through the
    exact same transactional persistence path (`sem_execute_ai_command`) as a genuine LLM
    response — it is not blocked or refused. It is not fully silent, though: the reply
    sent to the user always includes `summary: 'Fallback planner created tasks because AI
    provider is not configured or failed.'`, so a human reading the chat reply is told no
    real AI was involved. Whether "creates real work with a disclosure message" satisfies
    the founder's intent behind this acceptance criterion, or whether missing credentials
    should instead hard-block, is a product decision — flagging for the founder rather
    than unilaterally judging pass/fail. Currently low real-world risk since production
    has a working key today (this path isn't firing), but it would activate silently the
    moment the key is deleted/expires with no other alarm.
15. Out-of-schema model output rejected without partial persistence. ✅ — verified against
    the actual live RPC definition (`pg_get_functiondef` on the deployed
    `sem_execute_ai_command`, not the migration file). All task/approval/company/person/
    project/goal/relationship/assignment/memory inserts for one command happen inside a
    single plpgsql function body with no internal savepoints, so any single bad value
    (confirmed concretely: `tasks.title` is `not null` in the schema and the RPC passes
    the model's `title` through with no fallback/default — a task missing a title raises
    a real constraint violation) aborts and rolls back the entire function invocation.
    The TypeScript caller's `if(rpcError)` branch (index.ts:1060) then marks the pending
    work_order 'failed' and sends an `error` event — confirmed this is the same pattern
    already used for the malformed-JSON case, not new/untested code.
16. Strategic Control Map shows only authorized data. ✅ (mapped to the closest real
    page) — no page named "Strategic Control Map" exists; `web/app/(app)/mindmap/page.tsx`
    ("Operating Mindmap") is the actual equivalent. Read in full: `buildGraph()` uses
    `createClient()` (the caller's own cookie-based, RLS-scoped Supabase client, not a
    service-role client) for every query, and selects only fields already established
    elsewhere this session as non-sensitive (id/name/status/risk_score — no unit_cost,
    salary, or revenue columns). Authorization here rides entirely on the same RLS
    policies already verified live in SECURITY_MATRIX.md, not a separate/parallel check
    that could drift out of sync — no additional live test needed beyond confirming the
    query shape, which was done here.
17. Mobile login/command/task/approval works; EN/MN navigation works. ⚠️ **Tested live
    against real production at ~500px viewport width (2026-08-27) — mixed result, one
    real bug found.** The main app sidebar's mobile drawer works correctly (hamburger
    opens a proper slide-in overlay, dashboard content reflows into a readable 2-column
    layout, cards truncate cleanly). EN/MN toggle works and translates most nav labels
    (confirmed: "AI FIRST"→"АЙ ЭХЭНД", "Speak with Brain OS"→"Brain OS-той ярих", etc.)
    — minor, lower-priority gap: some section headers ("GOALS", "Board") stay in
    English while sibling sections translate. **Real bug: the `/chat` page (the core
    "Speak with Brain OS" interaction) is unusable on first load at mobile width** — the
    message composer collapses to ~30px wide (placeholder text renders one character per
    line, confirmed via zoomed screenshot) because `chat-client.tsx:440`'s
    `<div className="flex flex-1 gap-4 ...">` places the channel-thread sidebar
    (`ChannelSidebar`) and the chat column side-by-side with no responsive
    stacking/hiding breakpoint — unlike the main app sidebar, which does have one. A
    manual collapse toggle on the channel sidebar exists and fixes it once found (verified:
    collapsing it restores a normal, fully usable composer), but nothing collapses it
    automatically for a narrow viewport, so a first-time mobile user hits the broken
    composer by default. Did not test login itself (already-authenticated session was
    reused) or task/approval actions at mobile width — flagged as remaining.
18. Vercel production passes build/lint/unit/RLS/critical browser tests. ✅ (partially)
    — build+lint clean as of the last web/ app code change; no dedicated unit test
    suite exists in this repo yet (flagged as a gap, not silently assumed passing).

## Honest summary

All 18 now have real evidence behind them (up from 7 at the start of this pass). 13
passing (#1, #2, #3, #4, #5, #6, #9, #11, #12, #13, #15, #16, #18 — several partial), 2
confirmed failing with root cause identified (#7 not implemented, #10 no audit trail for
manual UI actions), 1 flagged as a product-intent question rather than pass/fail (#14),
1 mixed pass/fail with a concrete bug found (#17 — mobile nav/EN-MN mostly works,
`/chat` composer broken by default), 1 not applicable (#8). **Two of the 18 moved from
failing to passing within this sweep, both real production bugs, both fixed and
re-verified live with the founder's explicit authorization to push:** #6
(`approvals_update_approver` domain gating) and #4 (`tasks_select_scope` — note #4 was
*first marked passing-by-design in this same file*, then corrected to failing, then
fixed and re-verified, all within this one sweep — see its entry above for why, and
treat any "X is fine by design" conclusion in this project with appropriate suspicion
until it's actually been tried to fail). Every "passing" mark above is backed by either
a live production test (curl against real `brain.open-spot.ai`, real RLS impersonation,
or a real browser session) or a read of the actual deployed source
(`pg_get_functiondef`/`pg_get_expr` against the live database, not the migration file)
— none are assumed from intent alone.
