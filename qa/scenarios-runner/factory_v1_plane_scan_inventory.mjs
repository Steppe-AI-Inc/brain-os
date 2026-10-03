// THE IMPLEMENTER'S CLASS PROPOSALS for the NEEDS-CLASS hits of the plane-conditioned-behaviour scan (factory_v1_plane_scan.mjs;
// VERIFICATION_SPEC §3.4 r3). A PROPOSAL ONLY: "A candidate's own annotation never classifies a hit" - the verifier classes every hit
// itself. The static contract uses this list to fail on a hit nobody has thought about (unmatched), on a count that moved (a new use
// of a construct), on an entry whose construct is gone (stale), and on a class that cannot cover a hit a branch depends on.
//
// One entry per (file, construct, function or '-' for a top-level statement / DO block, value for literals and Edge branches), with the
// exact count. cls: production-ref | same-on-every-plane (with its construction) | call-input | own-plane | carried | not-a-hit.
// 'decides' is never a proposal. not-a-hit: a UUID literal naming a row THIS migration inserts, under that id, wherever it runs -
// outside the r3 hit item for literals, which is about a record present on one plane "but not on both"; such an entry
// quotes that item (reading), names the statement that creates the record (construction) and the key column it is inserted under
// (seeded: the library checks that a top-level INSERT of the migration puts this literal in that primary key), and is never pending.
// pending: the change request whose Director decision the class depends on - the static contract lists every such entry in
// its own failing row (P3p) until the decision is recorded, because under the r3 text as ratified the hit may fit no class.
// ruling: { cr, quote } - the Director decision a class rests on once it is recorded, with a verbatim quote of the decision that states
// the class. The static contract's P3p holds each ruling to the Director's CR-disposition record: decided by the DIRECTOR, APPROVED, the
// quote in the decision's text, and the CR's recorded sha256 equal to the CR file at HEAD. Still a proposal: the verifier classes
// every hit itself and names each hit's construction in its receipt (as the rulings say).
// UNTRACED (below): reads and branches this approximation cannot follow on its own, listed by hand so that they are still judged.
const V = 'supabase/control-plane/v1/';
const EDGE = 'supabase/control-plane/edge/supabase/functions/';
const STEPS = 'qa/implementation/auto-enrollment-v1/FOUNDER_PREPARED_STEPS.md';
const OPERATOR = 'a1e0f000-0000-4000-8000-000000000001';
// the r3 hit item a UUID literal is read against (VERIFICATION_SPEC §3.4 r3, quoted)
const R3_LITERAL = '§3.4 r3 hit item: "a literal naming a record or object that exists on the live plane or on a disposable one, but not on both (an id, name, host or project ref)". The row this literal names is on both: this migration inserts it, under this id, wherever it runs';
const SEEDED_OPERATOR = '010_tenancy.sql inserts the one operator tenant row (contract §1: "It seeds exactly the policy rows above and the one operator tenant row") with tenant_id a1e0f000-0000-4000-8000-000000000001, in the same transaction as every statement that names it; read back on every plane by schema C12 and migration_rows W2 / W5 (§3.5)';
const SEEDED_POLICY = (which) => '050_verification.sql inserts contract §1\'s ' + which + ' policy row into factory.verification_policies with this policy_id; read back on every plane by schema C11 and migration_rows W2 / W5 (§3.5)';
// the Director's rulings (CR-disposition record of 2026-09-30); each quote is verbatim from the decision
const CR021_MIG = { cr: 'CR-021', quote: 'an in-migration catalog check over objects and grants the same transaction created is classed same-on-every-plane' };
const CR021_EDGE = { cr: 'CR-021', quote: '(_shared/db.ts dbRefusal on the database URL and CA; _shared/pairing.ts importPepper; and the refused/misconfigured/pepper_unavailable values derived from them in the two entry points and handlers) is classed own-plane addressing' };
const CR022_CHANNEL = { cr: 'CR-022', quote: 'class the call’s input / a fixed domain constraint, not a plane marker' };
const CR022_ENGINE = { cr: 'CR-022', quote: 'factory_owner is created by the V1 migration, with that name, on every plane, so the read is identical on every plane and is classable' };
const FACTORY_OWNER = 'factory_owner, created by this migration with that name on every plane (part 000), NOSUPERUSER (schema C1), and the owner of every object the migration creates: the test is true exactly for a write inside a SECURITY DEFINER front door (the owner) and false for a direct legacy write (factory_runner); the typed comparison the B-2 regression requires (schema C16, L9, L9b)';

export const INVENTORY = [
  // ---------------------------------------------------------------- the migration: part 990's checks (c) and (d), the only catalog reads left
  // (part 000 carries no precondition block, and part 990's checks (a), (b), (e)-(h) are gone: each fact they checked is read back after
  // the migration - schema C3, C4, C9, C10, C15, C18-C20, static R5, R8, R10, R11 - and by the verifier's §3.5 and AC-12)
  { file: V + '990_finalize.sql', construct: 'catalog_lookup', fn: '-', count: 4, cls: 'same-on-every-plane', ruling: CR021_MIG,
    why: 'checks (c) and (d): \'factory_runner\'::regrole (the declared runner oid), \'factory\'::regnamespace in each check, and the regprocedure text of an offending function in (c)\'s error message',
    construction: 'the schema and the role by their fixed names: factory_runner and schema factory are 69df2f52\'s, equal on every plane the fidelity check admits (§3.3)' },
  { file: V + '990_finalize.sql', construct: 'catalog_read', fn: '-', count: 2, cls: 'same-on-every-plane', ruling: CR021_MIG,
    why: 'check (c): the pg_proc rows of schema factory (their ACLs); check (d): the pg_default_acl rows of schema factory; each raises on a difference, never chooses a behaviour',
    construction: 'the function ACLs this transaction set (functions born without PUBLIC EXECUTE, then its named grants), and the default-privilege entries after part 000\'s revoke by the login that provisioned the plane as 69df2f52' },
  { file: V + '990_finalize.sql', construct: 'privilege_probe', fn: '-', count: 2, cls: 'same-on-every-plane', ruling: CR021_MIG,
    why: 'aclexplode of those two ACLs (checks (c) and (d))',
    construction: 'the grants this transaction made, and the default-privilege entries it revoked' },
  // ---------------------------------------------------------------- constants
  // the ids of the rows this migration seeds (contract §1): not a hit - each names a row present wherever the migration has run, the
  // live plane and every disposable one alike (formerly listed under CR-022 (c); see its amendment)
  { file: V + '010_tenancy.sql', construct: 'uuid_literal', fn: '-', value: OPERATOR, count: 9, cls: 'not-a-hit', reading: R3_LITERAL, seeded: 'factory.tenants.tenant_id', why: 'the operator tenant: the seed row itself, and the column default of the tenant_id this migration adds to each 69df2f52 table', construction: SEEDED_OPERATOR },
  { file: V + '050_verification.sql', construct: 'uuid_literal', fn: '-', value: OPERATOR, count: 2, cls: 'not-a-hit', reading: R3_LITERAL, seeded: 'factory.tenants.tenant_id', why: 'the seeded policy rows\' tenant', construction: SEEDED_OPERATOR },
  { file: V + '050_verification.sql', construct: 'uuid_literal', fn: '-', value: 'a1e0f000-0000-4000-8000-000000000101', count: 1, cls: 'not-a-hit', reading: R3_LITERAL, seeded: 'factory.verification_policies.policy_id', why: 'the tenant-default policy row (contract §1), in its seed', construction: SEEDED_POLICY('tenant-default') },
  { file: V + '050_verification.sql', construct: 'uuid_literal', fn: '-', value: 'a1e0f000-0000-4000-8000-000000000102', count: 1, cls: 'not-a-hit', reading: R3_LITERAL, seeded: 'factory.verification_policies.policy_id', why: 'the campaign policy row (contract §1), in its seed', construction: SEEDED_POLICY('campaign (Auto-Enrollment V1)') },
  { file: V + '080_guards.sql', construct: 'uuid_literal', fn: 'factory._operator_tenant', value: OPERATOR, count: 1, cls: 'not-a-hit', reading: R3_LITERAL, seeded: 'factory.tenants.tenant_id', why: 'the operator tenant\'s id, returned (the one tenant of V1; its callers choose that tenant\'s records with it)', construction: SEEDED_OPERATOR },
  { file: V + '080_guards.sql', construct: 'uuid_literal', fn: 'factory._legacy_guard', value: OPERATOR, count: 1, cls: 'not-a-hit', reading: R3_LITERAL, seeded: 'factory.tenants.tenant_id', why: 'a legacy INSERT carries the operator tenant (its column default) or is refused; the guard runs as the legacy role, which may read no factory table and execute no factory function, so the id is a literal here', construction: SEEDED_OPERATOR },
  { file: V + '060_releases.sql', construct: 'channel_literal', fn: '-', value: 'dev', count: 1, cls: 'call-input', ruling: CR022_CHANNEL, why: 'CHECK (channel in (\'production\', \'dev\')): the one rule for a release row\'s channel, whatever the value (S-5); the only writer is admin_publish_release, where it is the request\'s parameter' },
  { file: V + '060_releases.sql', construct: 'channel_literal', fn: '-', value: 'production', count: 1, cls: 'call-input', ruling: CR022_CHANNEL, why: 'the same CHECK' },
  { file: V + '220_admin_releases_policies_work.sql', construct: 'channel_literal', fn: 'factory.admin_publish_release', value: 'dev', count: 1, cls: 'call-input', ruling: CR022_CHANNEL, why: 'the request\'s channel parameter validated against the two channels: one rule whatever its value' },
  { file: V + '220_admin_releases_policies_work.sql', construct: 'channel_literal', fn: 'factory.admin_publish_release', value: 'production', count: 2, cls: 'call-input', ruling: CR022_CHANNEL,
    why: 'the same validation; and the request\'s channel decides whether the fresh password entry is asked (a production release needs it, on every plane; founder decision 2026-10-03): one rule on the call\'s input, whatever plane it runs on' },
  { file: V + '220_admin_releases_policies_work.sql', construct: 'channel_literal', fn: 'factory.admin_authorize_update', value: 'production', count: 1, cls: 'call-input', ruling: CR022_CHANNEL,
    why: 'the one channel the plane\'s signer signs, as a constant: the request\'s channel must equal it or the call is refused bad_request - a fixed domain constraint on the call\'s input, the same rule on every plane (the signer itself builds only production-channel manifests; scripts/factory-control-plane/release_signer.sql)' },
  // ---------------------------------------------------------------- the engine and caller tests
  { file: V + '080_guards.sql', construct: 'current_user', fn: 'factory._legacy_guard', count: 1, cls: 'same-on-every-plane', ruling: CR022_ENGINE, construction: FACTORY_OWNER, why: 'the engine test of the INVOKER legacy guard: the writer of the row - the owner of the front door that runs the statement (factory_owner) or the legacy session role - one rule for every writer (the typed comparison the B-2 regression requires)' },
  { file: V + '080_guards.sql', construct: 'current_user', fn: 'factory._authority_guard', count: 1, cls: 'same-on-every-plane', ruling: CR022_ENGINE, construction: FACTORY_OWNER, why: 'the engine test of the INVOKER authority guard (as above)' },
  { file: V + '080_guards.sql', construct: 'session_user', fn: 'factory._via_api', count: 1, cls: 'call-input', why: 'the calling API role, read from session_user inside the SECURITY DEFINER front doors that call it (§3.4 r3)' },
  { file: V + '100_node_common.sql', construct: 'session_user', fn: 'factory._refuse_superuser', count: 1, cls: 'call-input', why: 'the refusal of a superuser caller (§3.4 r3): the session\'s own role' },
  { file: V + '100_node_common.sql', construct: 'role_attribute', fn: 'factory._refuse_superuser', count: 1, cls: 'call-input', why: 'rolsuper of the session\'s own role: the refusal of a superuser caller' },
  { file: V + '100_node_common.sql', construct: 'catalog_read', fn: 'factory._refuse_superuser', count: 1, cls: 'call-input', why: 'pg_catalog.pg_roles, the session\'s own row only: the refusal of a superuser caller' },
  // ---------------------------------------------------------------- identity columns (row ids; P8 proves no fixed-value comparison)
  { file: V + '030_enrollment.sql', construct: 'sequence', fn: '-', count: 2, cls: 'carried', why: 'enrollment_transitions.transition_id and pairing_attempts.attempt_id: identity row ids, stored and used to order rows' },
  { file: V + '040_audit.sql', construct: 'sequence', fn: '-', count: 1, cls: 'carried', why: 'audit_events.event_id: an identity row id, stored and used to order rows' },
  // ---------------------------------------------------------------- the founder's prepared steps: read-backs shown to the founder
  { file: STEPS, construct: 'catalog_read', fn: '-', count: 4, cls: 'carried', why: 'read-back SELECTs of steps 1b, 2 and R over pg_catalog: their output is shown to the founder; nothing is written or decided from it' },
  { file: STEPS, construct: 'catalog_lookup', fn: '-', count: 6, cls: 'carried', why: 'the same read-backs (regclass / regnamespace / regrole)' },
  { file: STEPS, construct: 'privilege_probe', fn: '-', count: 4, cls: 'carried', why: 'the same read-backs (has_table_privilege / aclexplode): displayed only' },
  { file: STEPS, construct: 'role_attribute', fn: '-', count: 1, cls: 'carried', why: 'step 2\'s read-back of rolcanlogin of the two API roles by their fixed names (neither the applying login nor an object owner): displayed only' },
  // ---------------------------------------------------------------- the Edge
  { file: EDGE + '_shared/db.ts', construct: 'production_ref_refusal', fn: '-', value: 'FACTORY_ADMIN_DB_URL+FACTORY_NODE_DB_URL', count: 2, cls: 'production-ref', why: 'the database URL naming the Brain OS production project is refused: the one exception (§3.4 r3). Judged twice by dbTarget: on the text of the URL, and on what was read from it - the host, user, database and password the driver is given (C2-S1)' },
  { file: EDGE + '_shared/db.ts', construct: 'project_ref_literal', fn: '-', value: 'pvphxgrtdfrudejjhzjk', count: 1, cls: 'production-ref', why: 'PRODUCTION_REF, used only by that refusal' },
  { file: EDGE + '_shared/peer.ts', construct: 'peer_address', fn: '-', count: 2, cls: 'call-input', why: 'the peer address the Edge platform reports (S-6): the per-address pairing key, one rule whatever its value' },
  ...[['factory-node-api', 'FACTORY_NODE_DB_URL'], ['factory-admin-api', 'FACTORY_ADMIN_DB_URL']].flatMap(([fn, dbVar]) => [
    { file: EDGE + fn + '/index.ts', construct: 'env:' + dbVar, fn: '-', count: 1, cls: 'own-plane', why: 'the plane\'s database endpoint and API login: the connection' },
    { file: EDGE + fn + '/index.ts', construct: 'env:FACTORY_DB_CA_PEM', fn: '-', count: 1, cls: 'own-plane', why: 'the plane\'s database server CA: TLS verify-full' },
    { file: EDGE + fn + '/index.ts', construct: 'env:FACTORY_PAIRING_PEPPER', fn: '-', count: 1, cls: 'own-plane', why: 'the S-6 pepper as the HMAC key' },
    // (the pepper's version is no longer read from the environment: PEPPER_VERSION, one constant of _shared/pairing.ts; static X1v)
  ]),
  { file: EDGE + 'factory-admin-api/index.ts', construct: 'env:BRAIN_OS_URL', fn: '-', count: 1, cls: 'own-plane', why: 'the issuer a caller\'s token is verified against, and where it is verified' },
  { file: EDGE + 'factory-admin-api/index.ts', construct: 'env:BRAIN_OS_ANON_KEY', fn: '-', count: 1, cls: 'own-plane', why: 'the key the token check is sent with' },
  { file: EDGE + 'factory-admin-api/index.ts', construct: 'env:SUPABASE_URL', fn: '-', count: 1, cls: 'own-plane', why: 'this plane\'s own project address, given to every function by the platform, read once: where the signed manifest of a release authorize-update published is placed (_shared/release_storage.ts), and where the prepared update the Director staged and its installer are read for authorize-update\'s staged check (_shared/release_stage.ts; WO-6 r4, S-10)' },
  { file: EDGE + 'factory-admin-api/index.ts', construct: 'env:SUPABASE_SERVICE_ROLE_KEY', fn: '-', count: 1, cls: 'own-plane', why: 'this plane\'s own storage key, given to every function by the platform, read once: sent only to that address, for those objects of the release bucket (S-10)' },
  { file: EDGE + 'factory-release-stage/index.ts', construct: 'env:SUPABASE_URL', fn: '-', count: 1, cls: 'own-plane', why: 'this plane\'s own project address, given to every function by the platform: where the prepared update the Director signed is written and the installer\'s one-object upload address is asked for (CR-028)' },
  { file: EDGE + 'factory-release-stage/index.ts', construct: 'env:SUPABASE_SERVICE_ROLE_KEY', fn: '-', count: 1, cls: 'own-plane', why: 'this plane\'s own storage key: sent only to that address, for those objects' },
  { file: EDGE + '_shared/release_stage.ts', construct: 'channel_literal', fn: '-', value: 'production', count: 1, cls: 'call-input', ruling: CR022_CHANNEL,
    why: 'a staged statement names the production channel or it is no statement (parseStatement): a fixed domain constraint on the caller\'s input, the same rule on every plane - the release signer signs production manifests only' },
  // the Edge handlers' fail-closed validation of their own configuration (unset; not the one postgresql://USER:PASS@HOST:PORT/DATABASE
  // form the file reads; an IP-literal host; no PEM certificate; a pepper that is not base64 of 32 bytes): 503 misconfigured /
  // pepper_unavailable, never another behaviour. Every test only refuses: nothing is defaulted, and no test chooses between two targets
  { file: EDGE + '_shared/db.ts', construct: 'env-branch', fn: '-', value: 'FACTORY_ADMIN_DB_URL+FACTORY_NODE_DB_URL', count: 17, cls: 'own-plane', ruling: CR021_EDGE,
    why: 'dbRefusal, through dbTarget (the one reading of the URL; C2-S1): the database URL unset; not printable ASCII on one line; not postgresql://; not the form user:password@host:port/database (a query, a fragment, a missing part); no user or password; no port, or one outside 1..65535; an IP address (TLS verify-full needs the host name); a host that is not a plain DNS name; a malformed escape; a user, password or database name outside its characters - the API answers 503 misconfigured. dbOptions throws for a URL dbTarget refuses, so the driver is given a read target or nothing' },
  { file: EDGE + '_shared/db.ts', construct: 'env-branch', fn: '-', value: 'FACTORY_DB_CA_PEM', count: 1, cls: 'own-plane', ruling: CR021_EDGE, why: 'dbRefusal: no PEM certificate' },
  { file: EDGE + '_shared/pairing.ts', construct: 'env-branch', fn: '-', value: 'FACTORY_PAIRING_PEPPER', count: 3, cls: 'own-plane', ruling: CR021_EDGE, why: 'importPepper: an unset pepper, one that is not base64, or shorter than 32 bytes is no key: pairing answers pepper_unavailable' },
  { file: EDGE + 'factory-node-api/index.ts', construct: 'env-branch', fn: '-', value: 'FACTORY_DB_CA_PEM+FACTORY_NODE_DB_URL', count: 4, cls: 'own-plane', ruling: CR021_EDGE, why: 'the entry point serves 503 misconfigured when dbRefusal refused, and opens no pool then' },
  // (BRAIN_OS_URL and BRAIN_OS_ANON_KEY reach no branch of the entry point: only the token check uses them - edge_boundary EB8,
  // edge_peer EP6-EP8 under Deno)
  { file: EDGE + 'factory-admin-api/index.ts', construct: 'env-branch', fn: '-', value: 'FACTORY_ADMIN_DB_URL+FACTORY_DB_CA_PEM', count: 4, cls: 'own-plane', ruling: CR021_EDGE, why: 'the entry point serves 503 misconfigured when dbRefusal refused, and opens no pool then' },
  // the key importPepper returns, as each entry point hands it to its handlers: null when importPepper found no key
  ...['factory-node-api', 'factory-admin-api'].map((fn) => ({ file: EDGE + fn + '/index.ts', construct: 'env-branch', fn: '-', value: 'FACTORY_PAIRING_PEPPER', count: 1, cls: 'own-plane', ruling: CR021_EDGE,
    why: 'the pepper dependency answers null when importPepper returned no key; the handlers then refuse pairing by name (pepper_unavailable; UNTRACED below)' })),
];

// ---------------------------------------------------------------- UNTRACED: what this approximation cannot follow, listed by hand
// Each entry names reads or branches the scan does not report, its class and the Director ruling it rests on, and ANCHORS: [file, regular
// expression source, role] triples that must all be found in the current source (multi-line mode). role 'hit' marks a line that is
// itself one of the entry's reads or branches (its hits are the lines where those matches start); role 'chain' marks the source
// facts that connect them to where the value comes from. The static contract fails P3 when an anchor is gone (the entry no longer
// describes the code), and lists an entry in P3p while its change request is undecided; a decided entry carries its class and ruling.
// CR-026 (founder step 3 inserts into factory.tenant_admins, and the insert fires two guards of the migration that read session_user and
// current_user): decided on the same basis as CR-022 (b)
const CR026 = { cr: 'CR-026', quote: 'Both reads are the S-10 authority mechanism and have the same outcome on every plane; classable, not a plane or verifier-run marker.' };
const STEP3_FIXED = 'founder step 3 runs as the applying login under `set local role factory_owner`, on every plane: session_user is the applying login (never an API login) and current_user is factory_owner (created by this migration with that name on every plane), so both guard tests are false and the write goes on wherever the step runs; through an API the same guard refuses every write to factory.tenant_admins (S-8; CR-001, CR-003; schema E10, E10b, mutant TAG)';
const STEP3_INSERT = [STEPS, '^insert into factory\\.tenant_admins \\(tenant_id, auth_user_id, tier\\)$', 'hit'];
const PEPPER_DEP = (fn) => [EDGE + fn + '/index.ts', '^  pepper: async \\(\\) => \\{ const key = await pepperKey; return key \\? \\{ key, version: PEPPER_VERSION \\} : null; \\},$', 'chain'];
export const UNTRACED = [
  { file: STEPS, construct: 'session_user (factory._via_api, called by the trigger factory._tenant_admins_guard)', cls: 'same-on-every-plane', ruling: CR026, construction: STEP3_FIXED,
    anchors: [STEP3_INSERT,
      [V + '080_guards.sql', '^create trigger factory_v1_c_invariants before insert or update or delete on factory\\.tenant_admins\\s+for each row execute function factory\\._tenant_admins_guard\\(\\);', 'chain'],
      [V + '080_guards.sql', '^create function factory\\._tenant_admins_guard\\(\\) returns trigger[^;]*?\\bas \\$\\$\\s+begin\\s+if factory\\._via_api\\(\\) then', 'chain'],
      [V + '080_guards.sql', "^  as \\$\\$ select session_user in \\('factory_node_api'::pg_catalog\\.name, 'factory_admin_api'::pg_catalog\\.name\\) \\$\\$;", 'chain']],
    why: 'the step runs as the applying login under `set local role factory_owner`; the guard\'s test is false there (the applying login is no API login), so the write goes on' },
  { file: STEPS, construct: 'current_user (the trigger factory._authority_guard on factory.tenant_admins)', cls: 'same-on-every-plane', ruling: CR026, construction: STEP3_FIXED,
    anchors: [STEP3_INSERT,
      [V + '080_guards.sql', "foreach t in array array\\['tenants', 'tenant_admins',", 'chain'],
      [V + '080_guards.sql', "for each row execute function factory\\._authority_guard\\(\\)', t\\);", 'chain'],
      [V + '080_guards.sql', "^    if current_user <> 'factory_owner'::pg_catalog\\.name then", 'chain']],
    why: 'in the step current_user is factory_owner, the role the step sets; the engine test is false there, so the write goes on' },
  // the pepper as the handlers receive it (deps.pepper(), a dependency object's property: not traced by the scan)
  { file: EDGE + '_shared/admin_api.ts', construct: 'env-branch (FACTORY_PAIRING_PEPPER, through deps.pepper())', cls: 'own-plane', ruling: CR021_EDGE,
    anchors: [[EDGE + '_shared/admin_api.ts', "^\\s+if \\(!pepper\\) return refuse\\(503, 'pepper_unavailable'", 'hit'],
      [EDGE + '_shared/admin_api.ts', '^\\s+const pepper = await deps\\.pepper\\(\\);$', 'chain'], PEPPER_DEP('factory-admin-api')],
    why: 'a code-issuing admin action answers 503 pepper_unavailable when the entry point\'s pepper dependency gave no key' },
  { file: EDGE + '_shared/enroll.ts', construct: 'env-branch (FACTORY_PAIRING_PEPPER, through deps.pepper())', cls: 'own-plane', ruling: CR021_EDGE,
    anchors: [[EDGE + '_shared/enroll.ts', "\\(!pepper \\? \\{ status: 503, refused: 'pepper_unavailable'", 'hit'],
      [EDGE + '_shared/enroll.ts', '!refusal && n && pepper \\? hex\\(await codeMac\\(pepper\\.key, n\\.normalized\\)\\) : null', 'hit'],
      [EDGE + '_shared/enroll.ts', 'pepper \\? pepper\\.version : null', 'hit'],
      [EDGE + '_shared/enroll.ts', '^\\s+const pepper = deps\\.pepper \\? await deps\\.pepper\\(\\) : null;$', 'chain'], PEPPER_DEP('factory-node-api')],
    why: 'enroll/start and enroll/complete: no key means no MAC and no version, and the request is recorded and refused by name (pepper_unavailable)' },
];

// the platform-schema inventory (§3.4 r3): statements that create, alter, drop, grant on, comment on or write to an object of the
// Director catalog tool's PLATFORM list, each with the contract rule it serves. Expected empty.
export const PLATFORM_WRITES = [];
// the secret-setting inventory (§3.4 r3): statements that set or reset a setting whose name matches the tool's SECRETISH. Expected empty.
export const SECRET_SETTINGS = [];
