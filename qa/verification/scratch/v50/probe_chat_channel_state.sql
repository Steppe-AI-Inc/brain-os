-- Verifier #50 — READ-ONLY probe: is the chat_channel_state path LIVE in production (202609020001 applied)?
-- No writes. Establishes whether the candidate's durable-pendingAction read/write is dormant or live on deploy.
select to_regclass('public.chat_channel_state')::text as chat_channel_state_table;
select version, name from supabase_migrations.schema_migrations where version like '202609020001%' or version like '2026090200%' order by version;
select count(*) as rows_total,
       count(pending_action) as rows_with_pending_action,
       count(*) filter (where pending_action_expires_at > now()) as pending_unexpired_now,
       max(updated_at) as last_write_at
  from public.chat_channel_state;
