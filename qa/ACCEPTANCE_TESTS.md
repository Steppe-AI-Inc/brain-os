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
4. An employee sees only assigned work. ⚠️ **Tested live, and the literal wording is
   FALSE by design, not a bug** (2026-08-27): a non-manager `employee`-tier test account
   with company membership saw all 30 of that company's tasks, not just tasks it owns
   — confirmed both directions: 0 visible tasks with no membership at all, 30 visible
   (the company's full total) once given plain `employee` membership. Root cause:
   `tasks_select_scope`'s `has_company_access(company_id)` branch grants visibility to
   any active company member regardless of ownership; the narrower "own task" branch
   (`pe.profile_id = current_profile_id()`) exists in the policy but is effectively
   unreachable in production today — checked globally, only 6 of 72 real tasks have
   `owner_person_id` set at all, and **zero** of those linked `people` rows have a
   `profile_id` (auth account) attached, so the per-owner clause has never actually
   matched a real row. This is company-wide task visibility (a legitimate,
   probably-intentional "team transparency" design — company boundary is still
   correctly enforced, verified above), not a data leak. Flagging because the
   acceptance-test wording assumes per-assignee restriction, which is not what's
   built; worth the founder confirming this is the intended behavior rather than
   silently treating it as passing.
5. Low-risk task executes without founder interruption; high-risk/external action
   waits for approval. ✅ (partially) — confirmed high-risk channel deletion always
   creates a forced approval record regardless of outcome; low-risk task creation
   confirmed not blocked.
6. Unauthorized manager cannot approve finance/salary/legal. ❌ **FAILED — real production
   bug found and reproduced live** (2026-08-27). A test company-manager account (not
   founder/hr_finance) successfully approved finance, salary_hr, AND legal domain
   approvals — should only have been able to approve `general`/`production`/
   `external_comms`. Root cause: production's live `approvals_update_approver` policy is
   the old ungated v0.7 baseline, not the domain-gated version from migration
   `202608230001` that Supabase's own migration ledger claims is applied (GitHub↔
   production drift). Fix prepared as migration `202608270001_restore_approvals_domain_gating.sql`,
   verified via `db push --dry-run`, but the actual push was blocked by this session's
   safety classifier as a live production security change — needs founder authorization.
   See KNOWN_FAILURE_MODES.md #8.
7. Authorized approver approves an immutable payload; correct work-order step resumes
   exactly once. ❌ **Not implemented, confirmed by code search** (2026-08-27):
   `decideApproval()` (`web/lib/data/approvals.ts`) only updates the `approvals` row
   itself (`status`, `decided_at`). Even though `approvals.task_id` links back to the
   originating task, nothing — no application code, no database trigger, no RPC —
   updates that task's status or "resumes" any work-order step when an approval is
   decided (grepped `supabase/migrations/` and the consolidated schema file for any
   trigger touching `approvals`; none exists). The "approve → work resumes" half of the
   approval loop described in CLAUDE.md §10/§15 doesn't exist yet; today, approving
   something only records the decision. The payload-immutability half is real, though:
   `approval_payload` is written once at creation and nothing ever updates it.
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

All 18 now have real evidence behind them (up from 7 at the start of this pass). 11
passing (#1, #2, #3, #5, #9, #11, #12, #13, #15, #16, #18 — several partial), 3 confirmed
failing with root cause identified (#6 critical/fix pending founder push, #7 not
implemented, #10 no audit trail for manual UI actions), 1 confirmed working-but-not-
matching-its-literal-wording by design (#4), 1 flagged as a product-intent question
rather than pass/fail (#14), 1 mixed pass/fail with a concrete bug found (#17 — mobile
nav/EN-MN mostly works, `/chat` composer broken by default), 1 not applicable (#8). Every
"passing" mark above is backed by either a live production test (curl against real
`brain.open-spot.ai`, real RLS impersonation, or a real browser session) or a read of the
actual deployed source (`pg_get_functiondef` against the live database, not the
migration file) — none are assumed from intent alone.
