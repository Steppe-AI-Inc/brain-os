-- PERMANENT GLOBAL INTEGRITY ASSERTIONS - required by the brain-os-truth-verification
-- skill ("maintain a reusable, permanent SQL script that computes and reports this table").
-- Added 2026-09-01 by the independent verifier of the c9dfab5 Edge Function deploy
-- (qa/KNOWN_FAILURE_MODES.md #61).
--
-- READ-ONLY. Safe to run against production at any time. No begin/rollback needed because
-- it never writes.
--
-- Every assertion must return 0 EXCEPT the BASELINE_* rows, which are drift checks against
-- the founder-stated pre-deploy baseline (approval 358eddeb pending / 6 active / 10
-- archived companies) - a real legal-restructuring approval that QA must never decide.
--
-- Rows the skill also requires but which CANNOT be expressed in SQL, and where their
-- evidence lives instead:
--   AI false execution claims   = checked by live Brain Chat acceptance (BLOCKED in the
--                                 c9dfab5 campaign - no session could be minted; see
--                                 qa/verification/CURRENT_CAMPAIGN.json task4)
--   UI <-> DB contradictions    = checked by browser verification (BLOCKED, no browser tools)
--   AI <-> DB contradictions    = same as above
--
-- KNOWN NON-ZERO AS OF 2026-09-01: active_task_under_archived_company = 2. Both are
-- synthetic QA fixtures, NOT real business data:
--   QA-VERIFY-TASK        under QA-VERIFY-BU              (prior-campaign residue, 2026-08-29)
--   QA-SWARM-TASK-001     under QA-SWARM-TEST-CO-VIA-CHAT (2026-08-31) - this company is the
--                         exact one the issue #5 Class B defect wrongly archived; it was
--                         never restored, so production still carries that damage.
-- archive_company() deliberately does NOT cascade (verified against the live function
-- definition), so "dependents PRESERVED" is the intended contract - but getTasks() in
-- web/lib/data/tasks.ts neither excludes nor LABELS a task whose parent company is
-- archived, so such a task renders as a normal active row with an unmarked company name.
-- That is the canonical-truth violation shape the skill calls an automatic FAIL.

-- Global integrity assertions (READ-ONLY) - brain-os-truth-verification skill.
-- Campaign: verify-c9dfab5-edge-function-deploy. Every count must be 0 except where noted.
select 'tasks_orphan_company' as assertion, count(*)::text as value
  from tasks t left join companies c on c.id = t.company_id
  where t.company_id is not null and c.id is null
union all
select 'active_task_under_archived_company', count(*)::text
  from tasks t join companies c on c.id = t.company_id
  where c.status = 'archived' and t.status not in ('done','rejected','archived')
union all
select 'goals_orphan_company', count(*)::text
  from goals g left join companies c on c.id = g.company_id
  where g.company_id is not null and c.id is null
union all
select 'person_assignment_orphan_company', count(*)::text
  from person_assignments pa left join companies c on c.id = pa.operating_company_id
  where pa.operating_company_id is not null and c.id is null
union all
select 'person_assignment_orphan_person', count(*)::text
  from person_assignments pa left join people p on p.id = pa.person_id
  where pa.person_id is not null and p.id is null
union all
select 'person_assignment_orphan_manager', count(*)::text
  from person_assignments pa left join people p on p.id = pa.manager_person_id
  where pa.manager_person_id is not null and p.id is null
union all
select 'tasks_orphan_owner_person', count(*)::text
  from tasks t left join people p on p.id = t.owner_person_id
  where t.owner_person_id is not null and p.id is null
union all
select 'work_orders_orphan_channel', count(*)::text
  from work_orders w left join chat_channels ch on ch.id = w.channel_id
  where w.channel_id is not null and ch.id is null
union all
select 'duplicate_company_names_active', count(*)::text from (
  select lower(name) n from companies where status='active' group by 1 having count(*)>1
) d
union all
-- DRIFT CHECK against the founder-stated pre-deploy baseline
select 'BASELINE_approval_358eddeb', coalesce((select status::text from approvals where id='358eddeb-c6ac-4a85-ab26-77dc3960fcba'),'MISSING')
union all
select 'BASELINE_companies_active', count(*)::text from companies where status='active'
union all
select 'BASELINE_companies_archived', count(*)::text from companies where status='archived';
