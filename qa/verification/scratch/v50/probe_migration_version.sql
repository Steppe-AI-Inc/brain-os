-- Verifier #50 — READ-ONLY: which 2026-09-02 migrations are recorded applied (202609020001 = chat_channel_state)?
select version, name from supabase_migrations.schema_migrations where version >= '202609010000' order by version;
