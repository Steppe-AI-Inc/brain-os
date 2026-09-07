-- VERIFIER #53 — READ-ONLY probe: chat_channel_state row count + migration head. No writes.
select
  (select count(*) from public.chat_channel_state) as channel_state_rows,
  (select max(version) from supabase_migrations.schema_migrations) as latest_migration,
  (select count(*) from supabase_migrations.schema_migrations where version = '202609020001') as n_202609020001;
