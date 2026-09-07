select 'session_identity' as probe,
       current_user::text as v1, session_user::text as v2,
       coalesce(auth.uid()::text,'NULL') as v3,
       public.is_founder_or_admin()::text as v4
union all
select 'work_status_values', string_agg(e.enumlabel, ',' order by e.enumsortorder), null, null, null
  from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='work_status'
union all
select 'retry_cols_present', coalesce(string_agg(column_name, ','),'(none)'), null, null, null
  from information_schema.columns
 where table_schema='public' and table_name='agent_runs'
   and column_name in ('blocked_at','retry_after','attempt_count','checkpoint_location','source_sha','worktree','claimed_by','claimed_at','requested_provider','actual_provider','fallback_reason')
union all
select 'prereq_cols_present', coalesce(string_agg(column_name, ','),'(none)'), null, null, null
  from information_schema.columns
 where table_schema='public' and table_name='agent_runs'
   and column_name in ('branch','last_event','last_heartbeat_at','blocked_reason','status','company_id')
union all
select 'claim_fn_exists', count(*)::text, null, null, null
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='claim_blocked_run_for_retry'
union all
select 'agent_runs_user_triggers', coalesce(string_agg(tgname,','),'(none)'), null, null, null
  from pg_trigger where tgrelid='public.agent_runs'::regclass and not tgisinternal;
