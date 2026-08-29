# Live Post-Deployment Verification — Canonical Work Order Migration

`supabase db push` for `202608290002_canonical_work_order_model.sql` ran successfully
against production (project `pvphxgrtdfrudejjhzjk`) on 2026-08-29. Everything below was
exercised for real against the live, post-migration database — not a rollback-tested
simulation. All synthetic/test rows created during this pass were cleaned up immediately
after (verified with a final zero-leftover check), except two `audit_logs` entries
deliberately kept as an honest record that a real `sem_execute_ai_command`/
`create_pending_work_order` live test happened (audit_logs is append-only by design;
these don't affect any dashboard count or business data).

## Legacy behavior — LIVE VERIFIED

- `work_orders` has exactly 14 columns (13 original + `canonical_work_order_id`); RLS
  policy names unchanged (`work_orders_insert_auth`, `work_orders_select_scope`,
  `work_orders_update_admin`); `create_pending_work_order`/`mark_work_order_failed`/
  `sem_execute_ai_command` all still exist under their original names.
- `create_pending_work_order` — called for real, produced a real row.
- `mark_work_order_failed` — called for real against that row, `status` correctly
  transitioned to `rejected`.
- `sem_execute_ai_command` — called for real as an authenticated employee session,
  returned the exact expected shape (`workOrderId`, empty `createdTasks`/
  `createdApprovals`/etc. arrays for trivial input) — confirms the function body is
  genuinely unmodified from before the migration.
- `model_usage`/`ai_reply_log` FK integrity — both FKs still correctly target
  `work_orders(id)`; zero orphaned `model_usage` rows.
- Representative pre-existing rows (3 real rows from 2026-08-23, well before this
  session) read back with their original content intact; `canonical_work_order_id` is
  `null` on all of them, as expected — nothing legacy was silently linked.
- Total real production `work_orders` row count: 219 before this pass, 220 after (one
  real row landed from genuine concurrent production usage during testing — expected on
  a live system, not an anomaly).

## New canonical model — LIVE VERIFIED

- Real chain inserted and traversed: `Goal` (`fc52eda3-...`) -> `canonical_work_orders`
  (`763a9a50-...`) -> `Task` (`b822753d-...`) -> `agent_runs` (`c7ac8c13-...`) — FK joins
  resolve correctly.
- Adversarial spoofing attempt (ordinary authenticated employee, `company_id = null`,
  `created_by_profile_id` set to a different real profile, `verification_status` set to
  a fabricated `'live_verified'`) — genuinely rejected by RLS in production.
- Legitimate self-attributed insert (same employee, `created_by_profile_id` matching
  their own profile) — succeeds, confirming the fix isn't overly restrictive.
- All test rows deleted immediately after; zero leftover confirmed.

## Security regressions — LIVE VERIFIED

All 5 run in one transaction against the live schema (each internally self-contained
and rolled back per its own design — SC-070/SC-103/SC-093/approval-deletion never
persist synthetic audit data by design, and the adversarial regression's synthetic
companies/rows are likewise rolled back): `sc070_audit_log_leak.sql`,
`sc103_audit_integrity.sql`, `sc093_security_definer_audit.sql`,
`approval_deletion_audit_trail.sql`, `canonical_work_order_model_adversarial.sql`
(26 assertions). Final result: `all_pass: true`. Zero synthetic rows leaked into
production (explicit post-run check).

## Application deploys

`git push origin master` completed (`0deb0ae`, then `e0636cb` after regenerating
`web/types/database.ts` for real from the live schema via `supabase gen types
typescript --linked` — `tsc --noEmit` clean). **No Edge Function or web/ behavioral
changes were needed or deployed** — Deployment A is additive-only by design; nothing the
currently-deployed app code does was ever touched by this migration, so there is nothing
new to activate. Vercel's existing auto-deploy picked up the `database.ts` regeneration
commit automatically (types-only change, zero behavioral difference).

## Conclusion

Every item on the mandatory live-verification checklist passed. No live regression
failed — the "stop and root-cause" branch of the verification protocol was not needed.
Proceeding to Phase 5 (bootstrap acceptance test) using these real, now-live canonical
resources.
