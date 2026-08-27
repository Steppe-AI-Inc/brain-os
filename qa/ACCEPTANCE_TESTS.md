# Acceptance Tests

Status against the 18 required tests in CLAUDE.md §15, as of 2026-08-27. `✅` = actually
verified this session or a prior one with real evidence. `⬜` = not yet tested. `➖` = not
applicable to this product's current scope (noted why).

1. Unauthenticated visitor redirects to login. ⬜ not re-verified this session (was true
   in earlier project phases per `proxy.ts` middleware; not re-checked live).
2. Founder command mentions a real company/device/employee; correct entities resolve
   without invented IDs. ✅ — confirmed repeatedly across tonight's chat tests (e.g. the
   onboarding-plan generation correctly referenced real tasks/goals/teammates by name).
3. Goal + work order created; atomic tasks + acceptance criteria persisted. ⬜ not
   re-tested this session specifically, though `work_orders`/`tasks` creation is
   confirmed working via many other tests tonight.
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
   exactly once. ⬜ not tested this session.
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
16. Strategic Control Map shows only authorized data. ➖ / ⬜ — no page by this exact name
    was found; may map to the Operating Mindmap (confirmed stale/incomplete, see
    KNOWN_FAILURE_MODES — not yet its own numbered entry).
17. Mobile login/command/task/approval works; EN/MN navigation works. ⬜ mobile
    responsiveness was fixed for the sidebar in an earlier session but not re-tested
    end-to-end this pass; EN/MN toggle exists in the UI but hasn't been exercised.
18. Vercel production passes build/lint/unit/RLS/critical browser tests. ✅ (partially)
    — build+lint clean as of the last web/ app code change; no dedicated unit test
    suite exists in this repo yet (flagged as a gap, not silently assumed passing).

## Honest summary

13 of 18 now have real evidence behind them (up from 7): 8 passing (#2, #5, #9, #11, #12,
#13, #15, #18 — all partial except #11/#12/#13/#15), 2 confirmed failing with root cause
identified (#6 critical/fix pending founder push, #10), 1 confirmed as working-but-not-
matching-its-literal-wording by design (#4), 1 flagged as a product-intent question
rather than pass/fail (#14), 1 not applicable (#8). Still genuinely untested: #1, #3, #7,
#16, #17 — listed here specifically so they don't get silently forgotten.
