-- SUPABASE-COMPATIBLE BOOTSTRAP for the PGlite validation harness.
--
-- The migrations were written against a Supabase database, so they assume objects Supabase
-- provisions before any project migration runs: the `auth` schema, `auth.uid()`, the
-- `anon` / `authenticated` / `service_role` / `authenticator` / `supabase_admin` roles, a
-- `storage` schema, and a few extensions. A blank PostgreSQL has none of them.
--
-- THIS SHIM IS PART OF THE EVIDENCE, NOT A DETAIL. Anything defined here is something the
-- validation ASSUMES rather than verifies, so it is kept as small as possible and reported
-- by the harness. A migration that passes only because the shim is more permissive than
-- real Supabase has not been validated — it has been flattered.

-- ---- 1. Roles Supabase provisions (FIRST — later grants depend on them). ---------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator noinherit login; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_admin') then create role supabase_admin superuser; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then create role supabase_auth_admin; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_storage_admin') then create role supabase_storage_admin; end if;
end $$;

grant anon, authenticated, service_role to authenticator;

-- ---- 2. Extensions. --------------------------------------------------------------------
-- pgcrypto IS in PGlite's contrib set and is loaded by the runner before this file, so this
-- is real, not shimmed. gen_random_uuid() is core in PG13+ regardless.
create extension if not exists pgcrypto;

-- SHIMMED: pgvector is not in this PGlite build. `vector` becomes a domain so the
-- 2026-06-19 production-core migration can create its embedding columns and the chain can
-- proceed. NONE of the four migrations under test uses `vector`, so this cannot flatter
-- them — but any finding about embedding columns from this harness is worthless.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'vector') then
    create domain public.vector as text;
  end if;
end $$;

-- ---- 3. The auth schema and the request-context functions RLS depends on. --------------
create schema if not exists auth;

-- Supabase reads the JWT from a GUC. The harness sets `request.jwt.claims` exactly as the
-- production acceptance scripts do, so persona switching behaves the same way here.
create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
$$;

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid;
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(auth.jwt() ->> 'role', 'anon');
$$;

create or replace function auth.email() returns text
language sql stable as $$
  select auth.jwt() ->> 'email';
$$;

-- auth.users must carry the columns PROJECT TRIGGERS actually read, or the harness tests a
-- shape production does not have. `handle_new_auth_user()` reads raw_user_meta_data, and
-- the first acceptance run failed on exactly that — the shim being thinner than the real
-- table is itself a finding, and the fix is to widen the shim, never to stop firing the
-- trigger.
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  encrypted_password text,
  email_confirmed_at timestamptz,
  last_sign_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---- 4. Storage schema (only what project migrations reference). ----------------------
create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  created_at timestamptz not null default now(),
  metadata jsonb
);

-- Supabase keeps extensions in their own schema and migrations call them schema-qualified
-- (e.g. extensions.gen_random_bytes). pgcrypto is REAL here (PGlite contrib), so these are
-- thin re-exports of genuine pgcrypto functions rather than fakes.
create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated, service_role;

create or replace function extensions.gen_random_bytes(n integer) returns bytea
language sql volatile as $$ select public.gen_random_bytes(n) $$;

create or replace function extensions.gen_random_uuid() returns uuid
language sql volatile as $$ select gen_random_uuid() $$;

create or replace function extensions.digest(data text, type text) returns bytea
language sql immutable as $$ select public.digest(data, type) $$;

create or replace function extensions.crypt(password text, salt text) returns text
language sql immutable as $$ select public.crypt(password, salt) $$;

create or replace function extensions.gen_salt(type text) returns text
language sql volatile as $$ select public.gen_salt(type) $$;

-- SHIMMED: pgvector's cosine-distance operator, so RAG function bodies referencing
-- `embedding <=> query` compile. It returns a constant — this harness proves those
-- functions CREATE, and proves nothing whatever about similarity search.
create or replace function public.vector_cosine_distance_shim(a text, b text) returns float8
language sql immutable as $$ select 0.0::float8 $$;

do $$
begin
  if not exists (
    select 1 from pg_operator o join pg_namespace n on n.oid = o.oprnamespace
     where o.oprname = '<=>' and n.nspname = 'public'
  ) then
    create operator public.<=> (leftarg = text, rightarg = text, function = public.vector_cosine_distance_shim);
  end if;
end $$;

-- Supabase's storage helper used by financial-report RLS policies.
create or replace function storage.foldername(name text) returns text[]
language sql immutable as $$
  select string_to_array(coalesce(name, ''), '/');
$$;

-- Supabase's realtime publication. Migrations add tables to it.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

-- ---- 5. Grants (LAST — every role and schema above now exists). ------------------------
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema storage to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated, service_role;
grant select on storage.buckets to authenticated, service_role;
