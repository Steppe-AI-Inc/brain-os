-- A STAND-IN FOR SUPABASE VAULT on a plain PostgreSQL plane (a developer plane, a judging plane). Applied by the plane's bootstrap
-- superuser BEFORE scripts/factory-control-plane/release_signer.sql, which names three things of the platform's secret store:
--   vault.create_secret(new_secret text, new_name text, new_description text) returns uuid
--   vault.update_secret(secret_id uuid, new_secret text)
--   vault.decrypted_secrets (name, decrypted_secret)
-- The names, the argument lists, the columns and the privilege shape are Supabase Vault 0.3's (supabase/vault,
-- sql/supabase_vault--0.3.0.sql) with the platform's own grants (supabase/postgres, the extension's after-create script):
--   * EXECUTE on the store's functions is revoked from PUBLIC;
--   * `postgres` holds the store, with the grant option;
--   * `service_role` holds it too - usage, select and delete on the secrets and on the decrypted view, EXECUTE on create, update and
--     decrypt. That grant is the platform's, and the signer is built for it: the store holds only ONE of the two parts of the seed;
--   * the decrypted view calls the decrypt function with the CALLER's rights, so a role that may read every table
--     (pg_read_all_data) still reads no secret.
-- What is NOT reproduced is the encryption: here the stored text is base64 of the secret and the "decrypt" function returns its
-- input. A stand-in proves the signer's privileges and its code path, never the store's confidentiality at rest; that is the
-- platform's, on the live plane only.

create schema vault;

create table vault.secrets (
  id          uuid primary key default gen_random_uuid(),
  name        text,
  description text not null default '',
  secret      text not null,
  key_id      uuid,
  nonce       bytea,
  created_at  timestamptz not null default current_timestamp,
  updated_at  timestamptz not null default current_timestamp
);
create unique index secrets_name_idx on vault.secrets (name) where name is not null;

create function vault._crypto_aead_det_decrypt(message bytea, additional bytea, key_id bigint, context bytea default 'pgsodium', nonce bytea default null)
  returns bytea language sql immutable as $$ select message $$;

create function vault.create_secret(new_secret text, new_name text default null, new_description text default '', new_key_id uuid default null)
  returns uuid language plpgsql security definer set search_path = ''
  as $$
  declare rec record;
  begin
    insert into vault.secrets (secret, name, description)
    values (pg_catalog.encode(pg_catalog.convert_to(new_secret, 'utf8'), 'base64'), new_name, new_description) returning * into rec;
    return rec.id;
  end $$;

create function vault.update_secret(secret_id uuid, new_secret text default null, new_name text default null, new_description text default null, new_key_id uuid default null)
  returns void language plpgsql security definer set search_path = ''
  as $$
  begin
    update vault.secrets s
       set secret = case when new_secret is null then s.secret else pg_catalog.encode(pg_catalog.convert_to(new_secret, 'utf8'), 'base64') end,
           name = coalesce(new_name, s.name), description = coalesce(new_description, s.description), updated_at = pg_catalog.now()
     where s.id = secret_id;
  end $$;

create view vault.decrypted_secrets as
select s.id, s.name, s.description, s.secret,
       convert_from(vault._crypto_aead_det_decrypt(message := decode(s.secret, 'base64'), additional := convert_to(s.id::text, 'utf8'),
                                                   key_id := 0, context := 'pgsodium'::bytea, nonce := s.nonce), 'utf8') as decrypted_secret,
       s.key_id, s.nonce, s.created_at, s.updated_at
  from vault.secrets s;

revoke all on function vault._crypto_aead_det_decrypt(bytea, bytea, bigint, bytea, bytea), vault.create_secret(text, text, text, uuid),
  vault.update_secret(uuid, text, text, text, uuid) from public;

-- the platform's grants to the applying login ...
grant usage on schema vault to postgres with grant option;
grant select, delete, truncate, references on vault.secrets, vault.decrypted_secrets to postgres with grant option;
grant execute on function vault.create_secret(text, text, text, uuid), vault.update_secret(uuid, text, text, text, uuid),
  vault._crypto_aead_det_decrypt(bytea, bytea, bigint, bytea, bytea) to postgres with grant option;
-- ... and to service_role
grant usage on schema vault to service_role;
grant select, delete on vault.secrets, vault.decrypted_secrets to service_role;
grant execute on function vault.create_secret(text, text, text, uuid), vault.update_secret(uuid, text, text, text, uuid),
  vault._crypto_aead_det_decrypt(bytea, bytea, bigint, bytea, bytea) to service_role;
