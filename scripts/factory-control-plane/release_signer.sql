-- THE FACTORY RELEASE SIGNER: its one-time bootstrap (founder decision 2026-10-03, "system-managed release signer"; S-5; WO-6).
--
-- WHAT THIS FILE IS
--   * The founder holds no release key. The Factory owns one Ed25519 signing key, created HERE, by the plane's own database server,
--     and never seen by a person or a PC. A release is signed only inside factory.admin_authorize_update (v1/220), the founder-only
--     front door that a fresh password entry of the founder's own Brain OS account opens.
--   * It is NOT part of the V1 migration and it runs BEFORE it: once per plane, as the plane's applying login, inside ONE
--     transaction the caller opens (no statement here opens or closes one). It lives outside supabase/control-plane/ on purpose:
--     every .sql file added under that directory IS the migration. The migration names what this file creates (part 000 grants
--     factory_owner the one signing function), so on a plane without a signer the migration aborts and nothing commits.
--   * WHY BEFORE: a node trusts only the public keys fixed into its installer at build time (S-5). The public half must therefore
--     exist before the candidate that pins it is frozen, and the live plane's key is created before that candidate is certified.
--   * A second application fails at `create schema factory_signer` and changes nothing: one plane has one signer. A new key is a
--     new candidate that pins it; this file never replaces a key.
--   * Like the migration, it decides nothing from a value that tells the live plane from a disposable one (S-10): it reads no plane
--     identity, no setting and no login's name. A judging plane and a developer plane run these same bytes and get a key of their own.
--   * Like schema factory, everything here belongs to the login that applies it. It creates no role and changes no membership.
--
-- WHERE THE PRIVATE KEY IS, AND WHO CAN USE IT
--   * THE PLATFORM'S SECRET STORE, never a table of ours: the 32-byte seed is one Supabase Vault secret (vault.create_secret; the
--     name factory_release_signer_seed), encrypted at rest with a key the database does not hold. It is drawn from the server's own
--     cryptographic random source (gen_random_uuid) inside the call that stores it, so it is in no statement text, no result, no
--     log line, no file and no dump. A role that may read every table (pg_read_all_data: a read-only or an observer login) reads
--     the ciphertext only: the store's decrypted view needs EXECUTE on the store's own decrypt function.
--     A plane without Supabase Vault carries a stand-in with the same two names (qa/factory/v1/vault_standin.sql).
--   * NOTHING RETURNS THE SEED TO A CALLER. sign_release is SECURITY DEFINER: it reads the store with the rights of the login that
--     applied this file, and returns a signature. It signs ONE THING: the canonical bytes of a production-channel release manifest
--     it builds itself from four validated values and its own key id. It cannot be asked to sign other bytes, another channel or
--     another key id. When the stored seed is not the one this plane's public key belongs to, or there is none, it answers NULL.
--   * EXECUTE on every function here is revoked from PUBLIC, except public_key(). The V1 migration grants sign_release to
--     factory_owner, the role the SECURITY DEFINER front doors run as; neither API login can call it directly. The login that
--     applied this file is the plane's owner-level login: the platform already lets it read the store itself.
--   * The public half is public: public_key() answers {key_id, public_key} to any login. That is what the installer's trust set
--     (scripts/factory-runner/enrolled/trust/production.json) carries, and what a verifier reads back to see that the pinned key is
--     this plane's.
--
-- THE SIGNATURE IS THE ONE THE INSTALLER ALREADY VERIFIES (scripts/factory-runner/enrolled/release.mjs; nothing there changes):
-- Ed25519 (RFC 8032) over canonicalManifestBytes - the manifest's seven fields as JSON with sorted keys - and
-- key_id = "ed25519:" + sha256(public key). Ed25519 is deterministic, so the arithmetic below is held to the RFC's own vectors
-- (_selftest, run by this file before the key is drawn: a server that computes anything else aborts the transaction) and, in the
-- developer suite, byte for byte to node:crypto over random keys and messages.
--
-- THE ARITHMETIC is RFC 8032 section 5.1 on PostgreSQL's exact numeric type and its built-in sha512: no extension of its own, so the
-- same bytes run on the live plane and on a plain PostgreSQL judging plane. It is not constant-time; the only caller is the
-- founder-only front door, and a key is used a handful of times.

create schema factory_signer;

-- the PUBLIC half, one row
create table factory_signer.signer (
  only_one    boolean primary key default true check (only_one),
  public_key  bytea not null check (octet_length(public_key) = 32),
  key_id      text not null check (key_id = 'ed25519:' || encode(sha256(public_key), 'hex')),
  created_at  timestamptz not null default now()
);

-- little-endian bytes <-> a non-negative integer
create function factory_signer._le(b bytea) returns numeric
  language plpgsql immutable strict parallel safe set search_path = pg_catalog, pg_temp
  as $$
  declare n numeric := 0; i integer;
  begin
    for i in reverse octet_length(b) - 1 .. 0 loop n := n * 256 + get_byte(b, i); end loop;
    return n;
  end $$;

create function factory_signer._bytes(n numeric, len integer) returns bytea
  language plpgsql immutable strict parallel safe set search_path = pg_catalog, pg_temp
  as $$
  declare o bytea := decode(repeat('00', len), 'hex'); v numeric := n; i integer;
  begin
    if n < 0 then raise exception 'factory_signer: a negative value has no encoding'; end if;
    for i in 0 .. len - 1 loop o := set_byte(o, i, mod(v, 256)::integer); v := div(v, 256); end loop;
    if v <> 0 then raise exception 'factory_signer: a value does not fit % bytes', len; end if;
    return o;
  end $$;

-- s * B on edwards25519, encoded (RFC 8032 5.1.2). Extended coordinates (X, Y, Z, T); the addition of 5.1.4, which is complete, so
-- the same formula doubles. p = 2^255 - 19; d2 = 2 * d, d = -121665/121666; B = (x, 4/5) with the even x.
create function factory_signer._mulbase(s numeric) returns bytea
  language plpgsql immutable strict parallel safe set search_path = pg_catalog, pg_temp
  as $$
  declare
    p  constant numeric := 57896044618658097711785492504343953926634992332820282019728792003956564819949;
    d2 constant numeric := 16295367250680780974490674513165176452449235426866156013048779062215315747161;
    qx numeric := 0; qy numeric := 1; qz numeric := 1; qt numeric := 0;   -- the sum so far: the neutral element
    px numeric := 15112221349535400772501151409588531511454012693041857206046113283949847762202;
    py numeric := 46316835694926478169428394003475163141307993866256225615783033603165251855960;
    pz numeric := 1; pt numeric;                                          -- the running power-of-two multiple of B
    k numeric := s; a numeric; b numeric; c numeric; dd numeric; e numeric; f numeric; g numeric; h numeric;
    zi numeric := 1; sq numeric; ex numeric; x numeric; y numeric;
  begin
    if s < 0 or s <> trunc(s) then raise exception 'factory_signer: a scalar is a non-negative integer'; end if;
    pt := mod(px * py, p);
    while k > 0 loop
      if mod(k, 2) = 1 then   -- Q := Q + P
        a := mod((qy - qx) * (py - px), p); b := mod((qy + qx) * (py + px), p);
        c := mod(mod(qt * d2, p) * pt, p); dd := mod(2 * qz * pz, p);
        e := b - a; f := dd - c; g := dd + c; h := b + a;
        qx := mod(e * f, p); qy := mod(g * h, p); qt := mod(e * h, p); qz := mod(f * g, p);
      end if;
      -- P := P + P
      a := mod((py - px) * (py - px), p); b := mod((py + px) * (py + px), p);
      c := mod(mod(pt * d2, p) * pt, p); dd := mod(2 * pz * pz, p);
      e := b - a; f := dd - c; g := dd + c; h := b + a;
      px := mod(e * f, p); py := mod(g * h, p); pt := mod(e * h, p); pz := mod(f * g, p);
      k := div(k, 2);
    end loop;
    -- affine: x = X / Z, y = Y / Z, with 1 / Z = Z^(p - 2)
    sq := mod(mod(qz, p) + p, p); ex := p - 2;
    while ex > 0 loop
      if mod(ex, 2) = 1 then zi := mod(zi * sq, p); end if;
      sq := mod(sq * sq, p); ex := div(ex, 2);
    end loop;
    x := mod(mod(qx * zi, p) + p, p); y := mod(mod(qy * zi, p) + p, p);
    -- 32 bytes little-endian: y, with the low bit of x in the top bit
    return factory_signer._bytes(y + mod(x, 2) * 57896044618658097711785492504343953926634992332820282019728792003956564819968, 32);
  end $$;

-- the secret scalar of a seed's SHA-512 (RFC 8032 5.1.5): the lower half, clamped
create function factory_signer._scalar(h bytea) returns numeric
  language plpgsql immutable strict parallel safe set search_path = pg_catalog, pg_temp
  as $$
  declare a bytea := substring(h from 1 for 32);
  begin
    a := set_byte(a, 0, get_byte(a, 0) & 248);
    a := set_byte(a, 31, (get_byte(a, 31) & 127) | 64);
    return factory_signer._le(a);
  end $$;

create function factory_signer._public(seed bytea) returns bytea
  language sql immutable strict parallel safe set search_path = pg_catalog, pg_temp
  as $$ select factory_signer._mulbase(factory_signer._scalar(sha512(seed))) $$;

-- RFC 8032 5.1.6: R = r B with r = SHA-512(prefix || M) mod L; S = (r + SHA-512(R || A || M) a) mod L; the signature is R || S.
-- A is derived here from the seed, never taken from a caller: a signer that can be given another A gives its key away.
create function factory_signer._sign(seed bytea, message bytea) returns bytea
  language plpgsql immutable strict parallel safe set search_path = pg_catalog, pg_temp
  as $$
  declare
    l constant numeric := 7237005577332262213973186563042994240857116359379907606001950938285454250989;
    h bytea := sha512(seed); a numeric; pub bytea; r numeric; rb bytea; k numeric;
  begin
    if octet_length(seed) <> 32 then raise exception 'factory_signer: a seed is 32 bytes'; end if;
    a := factory_signer._scalar(h);
    pub := factory_signer._mulbase(a);
    r := mod(factory_signer._le(sha512(substring(h from 33 for 32) || message)), l);
    rb := factory_signer._mulbase(r);
    k := mod(factory_signer._le(sha512(rb || pub || message)), l);
    return rb || factory_signer._bytes(mod(r + k * a, l), 32);
  end $$;

-- RFC 8032 section 7.1, TEST 1 to TEST 3: the public key and the signature of each, byte for byte, or an error
create function factory_signer._selftest() returns void
  language plpgsql immutable set search_path = pg_catalog, pg_temp
  as $$
  declare v record;
  begin
    for v in select * from (values
        (1, '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60', 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a', '',
            'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b'),
        (2, '4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb', '3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c', '72',
            '92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00'),
        (3, 'c5aa8df43f9f837bedb7442f31dcb7b166d38535076f094b85ce3a2e0b4458f7', 'fc51cd8e6218a1a38da47ed00230f0580816ed13ba3303ac5deb911548908025', 'af82',
            '6291d657deec24024827e69c3abe01a30ce548a284743a445e3680d7db5ac3ac18ff9b538d16f290ae67f760984dc6594a7c15e9716ed28dc027beceea1ec40a')
      ) as t(n, seed, pub, msg, sig) loop
      if factory_signer._public(decode(v.seed, 'hex')) is distinct from decode(v.pub, 'hex') then
        raise exception 'factory_signer self-test: RFC 8032 TEST % gives another public key on this server', v.n;
      end if;
      if factory_signer._sign(decode(v.seed, 'hex'), decode(v.msg, 'hex')) is distinct from decode(v.sig, 'hex') then
        raise exception 'factory_signer self-test: RFC 8032 TEST % gives another signature on this server', v.n;
      end if;
    end loop;
  end $$;

-- the arithmetic is the RFC's on this server, or nothing of this file commits and no key is drawn
select factory_signer._selftest();

-- THE KEY: 32 bytes from the server's cryptographic random source (four random uuids, 488 random bits, through SHA-256), stored
-- by the call that draws them. A plane that already holds a secret of this name refuses here (the store's names are unique).
select vault.create_secret(
  encode(sha256(uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid())), 'hex'),
  'factory_release_signer_seed',
  'Factory release signer: the Ed25519 seed (hex). Read only inside factory_signer.sign_release().') is not null as stored;

-- its public half, derived from the stored seed as it is read back from the store: a store this login cannot read stops the file here
insert into factory_signer.signer (public_key, key_id)
select r.pub, 'ed25519:' || encode(sha256(r.pub), 'hex')
  from (select factory_signer._public(decode(s.decrypted_secret, 'hex')) as pub from vault.decrypted_secrets s where s.name = 'factory_release_signer_seed') r;

-- the public half, for the installer's trust set and for anyone who reads it back: {key_id, public_key (base64url)}
create function factory_signer.public_key() returns jsonb
  language sql stable security definer set search_path = pg_catalog, pg_temp
  as $$
    select jsonb_build_object('key_id', s.key_id, 'public_key', translate(encode(s.public_key, 'base64'), E'+/=\n\r', '-_'))
      from factory_signer.signer s
  $$;

-- THE ONE USE OF THE KEY: the signed manifest of a production-channel release. The four values are held to the forms the release
-- record holds them to (v1/060), so nothing in them needs a JSON escape and the text built here is canonicalManifestBytes exactly.
-- NULL - never a signature - when this plane has no usable signer: no public half, no stored seed, or a stored seed that is not the
-- one the public half belongs to.
create function factory_signer.sign_release(p_version text, p_source_sha text, p_digest text, p_receipt_sha256 text) returns jsonb
  language plpgsql stable security definer set search_path = pg_catalog, pg_temp
  as $$
  declare s factory_signer.signer; seed bytea; sig bytea;
  begin
    if p_version is null or p_version !~ '^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]{1,40})?$'
       or p_source_sha is null or p_source_sha !~ '^[0-9a-f]{40}$' or p_digest is null or p_digest !~ '^[0-9a-f]{64}$'
       or p_receipt_sha256 is null or p_receipt_sha256 !~ '^[0-9a-f]{64}$' then
      raise exception using errcode = '22023', message = 'factory_signer: not a release (version, source_sha, digest, receipt_sha256)';
    end if;
    select * into s from factory_signer.signer;
    select case when v.decrypted_secret ~ '^[0-9a-f]{64}$' then decode(v.decrypted_secret, 'hex') end into seed
      from vault.decrypted_secrets v where v.name = 'factory_release_signer_seed';
    if s.key_id is null or seed is null or factory_signer._public(seed) is distinct from s.public_key then return null; end if;
    sig := factory_signer._sign(seed, convert_to('{"channel":"production","digest":"' || p_digest || '","key_id":"' || s.key_id
      || '","receipt_sha256":"' || p_receipt_sha256 || '","source_sha":"' || p_source_sha || '","v":1,"version":"' || p_version || '"}', 'UTF8'));
    return jsonb_build_object('v', 1, 'channel', 'production', 'version', p_version, 'source_sha', p_source_sha, 'digest', p_digest,
      'key_id', s.key_id, 'receipt_sha256', p_receipt_sha256, 'signature', translate(encode(sig, 'base64'), E'+/=\n\r', '-_'));
  end $$;

-- the public half is readable by every login; nothing else here is executable by anyone but the login that applied this file
revoke all on all functions in schema factory_signer from public;
grant usage on schema factory_signer to public;
grant execute on function factory_signer.public_key() to public;

-- AND THAT IS WHAT THE CATALOG SAYS NOW, or nothing of this file commits. A plane may carry default privileges this file knows
-- nothing about (a platform's, for the login that applies it); a function born executable by another role would be a way to the
-- key. The check reads the ACLs this transaction left on its own objects and can only abort: no function of the signer executable
-- by any role but its owner (public_key by PUBLIC aside), and no privilege on its table for any role but its owner.
do $check$
declare bad text;
begin
  select string_agg(p.oid::regprocedure::text || ' -> ' || case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end, ', ') into bad
    from pg_catalog.pg_proc p, pg_catalog.aclexplode(p.proacl) a
   where p.pronamespace = 'factory_signer'::regnamespace and a.grantee <> p.proowner
     and not (p.oid = 'factory_signer.public_key()'::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE');
  if bad is not null then raise exception 'factory_signer self-check: a function is executable by a role other than its owner: %', bad; end if;
  if exists (select 1 from pg_catalog.pg_proc p where p.pronamespace = 'factory_signer'::regnamespace and p.proacl is null) then
    raise exception 'factory_signer self-check: a function kept the built-in default (PUBLIC may execute it)';
  end if;
  select string_agg(case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end || ':' || a.privilege_type, ', ') into bad
    from pg_catalog.pg_class c, pg_catalog.aclexplode(c.relacl) a
   where c.oid = 'factory_signer.signer'::regclass and a.grantee <> c.relowner;
  if bad is not null then raise exception 'factory_signer self-check: another role holds a privilege on the signer table: %', bad; end if;
end
$check$;
