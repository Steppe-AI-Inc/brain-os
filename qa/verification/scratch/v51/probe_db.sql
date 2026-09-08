-- VERIFIER #51 read-only probe (Q4): is 202609020001 applied, does chat_channel_state exist, rows / pending binds.
select version, name from supabase_migrations.schema_migrations where version >= '202609010000' order by version;
select to_regclass('public.chat_channel_state')::text as chat_channel_state_table;
select count(*) as rows_total,
       count(*) filter (where pending_action is not null) as rows_with_pending_action,
       count(*) filter (where pending_action_expires_at > now()) as pending_unexpired
  from public.chat_channel_state;
