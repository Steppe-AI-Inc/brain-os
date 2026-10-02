-- FACTORY CONTROL PLANE V1 - PART 060: release records and revocations (contract §1 Runtime release, §2 Release; S-5; WO-6).
--
-- WHAT THE PLANE HOLDS, AND WHAT IT NEVER HOLDS. The plane records a release only through a founder-only action, which cites the
-- CERTIFIED receipt. The trust set and the trust mode are fixed in the artifact at build time, per channel (S-5): nothing here can
-- add a key to any node, and no table here holds a key. What the API may deliver to a node is a REVOCATION (of a release or of a
-- key id), never a key.
-- WHO SIGNS (founder decision 2026-10-03). A live release is signed by the plane's own signer (factory_signer, created before this
-- migration; its private key is in the platform's secret store, outside this schema), and only inside the founder-only
-- factory.admin_authorize_update (part 220), which records beside the release the fresh password entry that authorized it. A
-- release published with a signature made elsewhere (admin_publish_release: the dev channel on a disposable plane) carries none.

set local role factory_owner;

create table factory.releases (
  release_id                uuid primary key default gen_random_uuid(),
  tenant_id                 uuid not null references factory.tenants (tenant_id),
  channel                   text not null check (channel in ('production', 'dev')),
  version                   text not null check (version ~ $r$^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]{1,40})?$$r$),
  source_sha                text not null check (source_sha ~ '^[0-9a-f]{40}$'),
  -- the artifact digest: the SHA-256 PE Authenticode image hash (S-5), equal to the receipt's reproduced digest
  digest                    text not null check (digest ~ '^[0-9a-f]{64}$'),
  key_id                    text not null check (key_id ~ '^[A-Za-z0-9:_-]{8,80}$'),
  signature                 text not null check (signature ~ '^[A-Za-z0-9_-]{86}$'),   -- Ed25519, base64url, no padding
  receipt_sha256            text not null check (receipt_sha256 ~ '^[0-9a-f]{64}$'),
  manifest                  jsonb not null check (jsonb_typeof(manifest) = 'object' and octet_length(manifest::text) <= 16384),
  state                     text not null default 'published' check (state in ('published', 'superseded', 'revoked')),
  published_at              timestamptz not null default now(),
  published_by              uuid not null,
  superseded_at             timestamptz,
  superseded_by_release_id  uuid references factory.releases (release_id) deferrable initially deferred,
  revoked_at                timestamptz,
  revoked_by                uuid,
  revoke_reason             text check (revoke_reason is null or length(revoke_reason) <= 300),
  -- a release the Factory signed: the Brain OS session whose password entry authorized it, and when that entry was made (both
  -- read by the Admin API from the caller's own token). Null, both, for a release published with a signature made elsewhere.
  authorized_session        uuid,
  authorized_password_at    timestamptz,
  check ((authorized_session is null) = (authorized_password_at is null)),
  unique (tenant_id, channel, version),
  unique (tenant_id, channel, digest),
  -- published: never superseded yet; superseded: says when; revoked: may have been superseded first
  check (state <> 'published' or (superseded_at is null and superseded_by_release_id is null)),
  check (state <> 'superseded' or superseded_at is not null),
  check ((state = 'revoked') = (revoked_at is not null and revoked_by is not null))
);
-- one published (current) release per channel: publishing a newer one supersedes it
create unique index releases_one_published_per_channel on factory.releases (tenant_id, channel) where state = 'published';
-- one password entry authorizes one release
create unique index releases_one_per_authorizing_session on factory.releases (authorized_session) where authorized_session is not null;

create table factory.release_revocations (
  revocation_id  uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references factory.tenants (tenant_id),
  kind           text not null check (kind in ('release', 'key')),
  release_id     uuid references factory.releases (release_id),
  key_id         text check (key_id is null or key_id ~ '^[A-Za-z0-9:_-]{8,80}$'),
  revoked_at     timestamptz not null default now(),
  revoked_by     uuid not null,
  reason         text check (reason is null or length(reason) <= 300),
  check ((kind = 'release') = (release_id is not null)),
  check ((kind = 'key') = (key_id is not null))
);
create unique index release_revocations_one_per_key on factory.release_revocations (tenant_id, key_id) where kind = 'key';
create unique index release_revocations_one_per_release on factory.release_revocations (release_id) where kind = 'release';

alter table factory.computers
  add constraint computers_adopted_release_fk foreign key (adopted_release_id) references factory.releases (release_id);

reset role;
