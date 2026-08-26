# Release Evidence

## 2026-08-27 — "delete is not working" investigation + systemic fixes

```
COMMIT: 515497e (master)
PRODUCTION DEPLOYMENT: dpl_GDMydVQq7HK6WUP9jcHDP2CevU4Q (verified for commit dc35905;
  515497e's deployment not individually re-checked via the GitHub status API, but
  followed the same auto-deploy-on-push path)
SUPABASE PROJECT: pvphxgrtdfrudejjhzjk
MIGRATIONS: 202608260020 through 202608260024 applied (write-bypass fix, storage
  sensitivity, cost/margin column separation, domain-aware approvals/audit/etc.)
EDGE FUNCTIONS: sem-ai-command redeployed twice this session (dedup-task fix +
  truncated-count fix); all 6 deployed functions confirmed byte-identical to git HEAD
  via download+diff

TESTS:
  Build: not re-run this pass (no web/ app code changed — Edge Function + SQL only)
  Lint: not applicable (Edge Function is Deno, not linted by the Next.js ESLint config)
  RLS: 7/7 impersonation checks passed (documents, storage, proposals write, product_costs,
    proposal_financials, proposal_item_costs, approvals domain-gating) — see SECURITY_MATRIX.md
  E2E (browser, live production):
    - Task delete via UI: PASS (create → delete → confirm → verified gone via direct query)
    - Chat channel delete via AI (unambiguous request): PASS (created test channel →
      asked Brain OS to delete by exact name → verified gone via direct query)
    - Chat channel delete via AI (ambiguous request, "delete channels"/"clear chat"):
      correctly declined with clarification — NOT a bug, confirmed by design intent
    - Real-count question via chat: PASS (asked "how many pending approvals/tasks" →
      got "67... 20 of 67 shown" / "61... 30 of 61 shown" → cross-checked against
      direct SELECT COUNT(*) → exact match, 67/67 and 61/61)

FAILED TESTS: none in this pass (all reproductions either confirmed non-bugs or were
  fixed and re-verified)

KNOWN LIMITATIONS:
  - Full 11-persona matrix not built (see TEST_PERSONAS.md)
  - audit_logs/integration_queue/work_orders/chat_channels/sales_leads RLS tightening
    verified by reading policy definitions post-migration, not by live impersonation
    per-table (see SECURITY_MATRIX.md gaps section)
  - Mobile and EN/MN acceptance tests not run this pass
  - Duplicate-task fix is prompt-level (LLM judgment), no deterministic DB-level guard

UNVERIFIED:
  - sem-artifact-analyze's internal logic not line-by-line reviewed (only checked for
    the RLS-bypass class of issue before committing)
  - GitHub Actions "Deploy Supabase Edge Functions" workflow config still references
    the wrong Supabase project ref and has never run — not fixed, only diagnosed
    (KNOWN_FAILURE_MODES.md #3)
```

## Prior session — 2026-08-26 security hardening pass

See commit `111f0b1` ("Security hardening pass: fix real RLS gaps found by independent
audit") for the write-bypass discovery precursor, financial_reports RLS fix, and the
first round of impersonation-tested RLS fixes. That pass's evidence is summarized
inline in the commit message rather than in this file (predates this file's creation).
