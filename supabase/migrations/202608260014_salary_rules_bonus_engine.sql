-- Frozen-base + non-negotiable, formula-driven bonus policy (founder directive, 2026-08-25):
-- base salaries no longer increase on their own; all upside comes from a bonus computed
-- by fixed rules, not manager discretion. bonus_amount holds a currency figure (used by
-- commission-type rules, where "% of base" doesn't apply); salary_impact_pct keeps its
-- existing meaning of "% on top of base" for efficiency-band rules.
alter table public.kpi_records add column if not exists bonus_amount numeric;

insert into public.salary_rules (company_id, role_title, rule_name, formula, approval_required, active)
select c.id, 'Installation Technician', 'Installation/service time efficiency bonus',
  jsonb_build_object(
    'type', 'efficiency_bonus',
    'input', 'manual_time_log',
    'direction', 'lower_is_better',
    'metric_label', 'Installation/service time vs. target (per job)',
    'bonus_bands', jsonb_build_array(
      jsonb_build_object('min_score_pct', 100, 'bonus_pct', 30),
      jsonb_build_object('min_score_pct', 85, 'bonus_pct', 20),
      jsonb_build_object('min_score_pct', 70, 'bonus_pct', 10),
      jsonb_build_object('min_score_pct', 0, 'bonus_pct', 0)
    ),
    'base_frozen', true,
    'notes', 'score_pct = target_hours / actual_hours * 100 (faster than target = higher score). No time-clock system exists yet, so target/actual hours are logged manually per job until one does.'
  ),
  true, true
from public.companies c
where c.name = 'CLIX GPS';

insert into public.salary_rules (company_id, role_title, rule_name, formula, approval_required, active)
values (
  null, 'Sales', 'Sales commission — uncapped',
  jsonb_build_object(
    'type', 'commission',
    'input', 'won_proposals_via_lead_owner',
    'rate_pct', 7,
    'uncapped', true,
    'metric_label', 'Won contract value (7%, no cap)',
    'base_frozen', true,
    'notes', 'commission = 7% of proposals.total for proposals whose sales_leads.owner_person_id is this person, status = won, in the period.'
  ),
  true, true
);

insert into public.salary_rules (company_id, role_title, rule_name, formula, approval_required, active)
values (
  null, null, 'Default productivity bonus — task on-time completion',
  jsonb_build_object(
    'type', 'efficiency_bonus',
    'input', 'tasks_on_time_completion_rate',
    'direction', 'higher_is_better',
    'metric_label', 'Tasks completed by deadline, this period',
    'bonus_bands', jsonb_build_array(
      jsonb_build_object('min_score_pct', 90, 'bonus_pct', 20),
      jsonb_build_object('min_score_pct', 75, 'bonus_pct', 10),
      jsonb_build_object('min_score_pct', 50, 'bonus_pct', 5),
      jsonb_build_object('min_score_pct', 0, 'bonus_pct', 0)
    ),
    'base_frozen', true,
    'notes', 'Fallback rule for any role without a dedicated formula above. Computed automatically from real tasks data (status vs. deadline) — no manual entry.'
  ),
  true, true
);
