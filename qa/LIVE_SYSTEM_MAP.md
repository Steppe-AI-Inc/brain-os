# Live System Map

Last verified: 2026-08-27, via the chain in CLAUDE.md §1. Re-verify before trusting any
number here more than a few hours old — this file records a point-in-time snapshot, not
a live dashboard.

| Layer | Value | Verified by |
|---|---|---|
| GitHub repo | `Steppe-AI-Inc/brain-os`, default branch `master` | `gh repo view` |
| GitHub master SHA (last known) | `efe9cb8` | `git log origin/master` |
| Vercel project | `steppe-ai/brain-os` (the only project under `steppe-ai`) | `web/CLAUDE.md`, `vercel inspect` |
| Vercel production domain | `brain.open-spot.ai` | `vercel inspect` aliases |
| GitHub → Vercel link | Commit status check `Vercel` = `success`, `target_url` deployment ID matches the live production deployment | `gh api repos/.../commits/<sha>/status` cross-checked against `vercel inspect` |
| Supabase project ref | `pvphxgrtdfrudejjhzjk` | `web/.env.production.local` (`NEXT_PUBLIC_SUPABASE_URL`), matches every migration/query run against production |
| Edge Functions deployed | All 6 confirmed byte-identical to tracked git source via download+diff: `sem-ai-command`, `embed-text`, `analyze-financial-document`, `sem-artifact-analyze`, `generate-technical-drawing` (v2), `generate-onboarding-plan` | `supabase functions list` + `supabase functions download` + `git diff`, done for all 6, not just the one investigated first |
| Edge Function deployment mechanism | **Manual CLI only** (`supabase functions deploy`) — see KNOWN_FAILURE_MODES.md #3 | GitHub Actions run history: the registered `supabase-functions.yml` workflow has 0 runs ever |
| Migrations | Applied via `supabase db push` (proper migration-history tracking; `supabase db query --file` was used earlier in the project and caused one duplicate-insert incident — now avoided in favor of `db push`) | `supabase_migrations.schema_migrations` |

## Resolved this pass

- `sem-artifact-analyze` had **zero tracked git source** despite being live in
  production (real document/company-matching logic, explains the previously-mysterious
  `documents.suggested_company_id`/`company_match_*` columns). Downloaded the actual
  deployed source and committed it — verified first that it uses the caller's JWT
  (`Authorization` header), not a service-role key, so no RLS bypass was introduced by
  recovering it.
- Diffed **every** live `public` schema RLS policy (`pg_policy`/`pg_get_expr` against the
  linked project — 108 policies) against `schema-v0.7-production-core.sql` (95 tracked
  policies). Found and recovered `boards`/`board_columns`/`board_items` (an unused Kanban
  feature — 0 rows, RLS enabled, zero app code references outside generated types) as
  migration `202608270002_recover_boards_kanban_tables.sql`. See
  KNOWN_FAILURE_MODES.md #9.

## Resolved this pass (continued)

- **`approvals_update_approver` production policy had no domain gating** — reproduced
  live, a plain company manager could approve finance/salary_hr/legal decisions.
  Migrations `202608270001` (the fix) and `202608270002` (the boards recovery, idempotent
  no-op) were pushed to production with the founder's explicit authorization
  ("push the approvals fix") and both now show `local`==`remote` in
  `supabase migration list --linked`. Re-verified live with a fresh impersonation test
  (not just trusting the migration ledger, given that's exactly what was misleading
  before the fix): finance/salary_hr/legal domain approvals correctly stay `pending` for
  a plain company manager, production domain correctly becomes `approved`. Confirmed
  `boards`/`board_columns`/`board_items` are still empty (0 rows) post-push — the
  recovery migration was a true no-op as designed. See KNOWN_FAILURE_MODES.md #8 for
  full before/after evidence.

## Resolved this pass (continued 2) — the same drift class hit three more policies

Asked to reproduce a hypothesized `memories` gap; reproducing it live found the real bug
was different (see KNOWN_FAILURE_MODES.md #11) and traced back to the same migration
(`202608230001`) as the approvals fix above. A proper signature-based diff (which
authorization function calls each policy contains, not just whether the policy name
exists) of all 108 live policies against the schema file — the name-only diff done
earlier in this pass wasn't sufficient, see REGRESSION_CATALOG.md's corrected
methodology — found two more casualties: `tasks_select_scope` (was letting any company
member see the full company task list, not just founder/manager/creator/owner) and both
`safe_companies`/`safe_proposals` views (missing `security_invoker`, the most severe of
the three — a caller with zero company memberships anywhere could read all 7 companies
via direct query, complete RLS bypass). Fixed via migration `202608270004`, pushed with
the founder's explicit authorization, independently re-verified live for all three
(fresh impersonation tests, not trusted from the push report): memories now 0/2,
safe_companies/safe_proposals now 0/0, tasks now 0 for a non-creator/non-owner employee
(real total 7). All temporary test data cleaned up after.

## Not yet done

- Full persona × table RLS matrix (see SECURITY_MATRIX.md) — 5 personas now tested
  (founder, non-manager employee, holding_admin, hr_finance, investor_viewer) of the
  11-persona list in CLAUDE.md §4; the rest confirmed as inert no-ops by code search
  (see SECURITY_MATRIX.md), not individually live-tested.
- `sem-artifact-analyze`'s logic itself has not been deeply code-reviewed line by line,
  only checked for the RLS-bypass class of issue.
- The policy-drift diff covered `public` schema tables only — `storage.objects` and any
  other non-`public` schema policies have not been diffed the same way yet. **Given the
  drift class just found affected 3 of 6 tickets in one migration alone, this should not
  be assumed clean until actually checked.**
- `engineering_drawings` policies exist correctly in a migration file
  (`202608260012_engineering_drawings.sql`) but were never folded into the consolidated
  `schema-v0.7-production-core.sql` — a documentation-consistency gap, not a live drift
  (content matches), lower priority than the two items above.
