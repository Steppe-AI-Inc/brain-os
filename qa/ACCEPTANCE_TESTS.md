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
4. An employee sees only assigned work. ⬜ — `tasks_select_scope` includes an
   "own task" clause, not independently re-verified via impersonation this session.
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
10. All transitions appear in the audit timeline. ⬜ not directly tested this session.
11. Employee cannot read ownership/cash/salaries/margins/founder memory. ✅ — extensively
    verified this session and the prior one (see SECURITY_MATRIX.md).
12. Cross-company access returns zero rows. ✅ — tested live: a test account with
    `manager` role at CLIX GPS correctly saw 0 rows for `financial_reports`/`proposals`
    belonging to a different company, while correctly retaining full access to its own
    company's data (1/1 and company-scoped data respectively).
13. Duplicate submissions do not duplicate work. ✅ (found broken, now fixed) — see
    KNOWN_FAILURE_MODES.md #5.
14. Missing AI credentials cannot silently create real production work. ⬜ not tested —
    `fallbackPlan()` exists in `sem-ai-command` for the no-API-key case but its behavior
    hasn't been exercised deliberately.
15. Out-of-schema model output rejected without partial persistence. ⬜ not tested.
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

7 of 18 fully or partially verified with real evidence this session or a recent one.
The rest are genuinely untested, not assumed-passing — listed here specifically so they
don't get silently forgotten.
