-- Verifier #52 — READ-ONLY probe. chat_channel_state (migration 202609020001) is written by the candidate on deploy.
select 'chat_channel_state_exists' as k, to_regclass('public.chat_channel_state') is not null as v
union all select 'chat_channel_state_rows', (select count(*)::text::boolean is not null from public.chat_channel_state)
union all select 'migration_202609020001_applied', exists(select 1 from supabase_migrations.schema_migrations where version = '202609020001');
