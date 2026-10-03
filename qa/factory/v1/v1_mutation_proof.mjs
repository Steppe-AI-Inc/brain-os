#!/usr/bin/env node
// FACTORY V1 NEW-INVARIANT MUTATION PROOF (WO-10; the implementer's developer evidence for VERIFICATION_SPEC §3 step 10 - the verifier's
// own mutation checks are separate and never replaced by this): reverting ONE guard makes a named row of a named v1 suite FAIL.
//
//   node qa/factory/v1/v1_mutation_proof.mjs [ID ...]           all mutants, or only the named ones
//   node qa/factory/v1/v1_mutation_proof.mjs --plan [ID ...]    plant only (each anchor found exactly once, the text changes); runs nothing
//
// EACH RUN: `git clone --shared --no-checkout` of this checkout into a fresh temp dir (objects are READ through alternates; nothing is
// written to this repository), a sparse checkout of HEAD (the control plane, scripts, qa/factory, the Director's baseline rows),
// node_modules as a directory junction to this checkout's (read only), the ONE defect planted in the working tree, the suite run there
// with TEMP/TMP inside the run directory, the junction unlinked by itself (never a recursive delete through it), the copy removed.
// A CONTROL (the unmutated copy) runs each suite first; a suite whose control fails a row judges nothing and the proof fails. The one
// exception is a row listed in BY_DESIGN_RED (red on purpose until the change request it names is decided; static P3p was, until the Director's CR-disposition record; the list is empty now): a control
// whose ONLY failing rows are listed there, and that ran to its summary line, judges each mutant on the expected rows it PASSED
// (differential judging; a mutant whose expected rows are all red by design is not judged, and fails the proof). A control failing
// any other row still judges nothing, and the proof exits non-zero.
// KILLED = the suite exits non-zero AND one of the rows named for that defect is among its FAIL lines (other rows failing too is
// collateral, listed, never required). A CONTROL MUTANT (`pass`) also names rows that must still PASS under it: it reverts only a layer
// other mutants share, and proves that their rows are reached by what they add on top of it, not by the shared revert alone. A guard with two layers (the Edge and the front door; the claim gate and the certify floor) is
// reverted in BOTH by one mutant where the invariant is the pair. Where a row reaches one layer past the other - the certification
// floor past gate 7 (independence (k2), (k3), (h), (i2)), the gate's own sub-checks (eligibility O2) - each layer also has a single-layer
// mutant, and that row must name it.
// NOTHING IS SKIPPED: an anchor that is absent or not unique makes the mutant VACUOUS and the proof fail.
// Windows x64 (the suites start a disposable PostgreSQL 18 through embedded-postgres; the release rows build Windows SEAs).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isolatedSuiteEnv, isolationHeader, isolationProof } from './isolation.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const V = 'supabase/control-plane/v1/';
const RT = 'scripts/factory-runner/enrolled/';
const EDGE = 'supabase/control-plane/edge/supabase/functions/_shared/';
const EDGE_FN = 'supabase/control-plane/edge/supabase/functions/';
const SUITES = {
  eligibility: 'qa/factory/v1/eligibility_acceptance.mjs', admin: 'qa/factory/v1/admin_acceptance.mjs', schema: 'qa/factory/v1/schema_acceptance.mjs',
  revocation: 'qa/factory/v1/revocation_interleaving.mjs', takeover: 'qa/factory/v1/takeover_acceptance.mjs', independence: 'qa/factory/v1/independence_acceptance.mjs',
  enrollment: 'qa/factory/v1/enrollment_acceptance.mjs', tls: 'qa/factory/v1/edge_db_tls_acceptance.mjs', release: 'qa/factory/v1/release_acceptance.mjs',
  static: 'qa/scenarios-runner/factory_v1_static_contract.mjs', installer: 'qa/factory/v1/installer_input_acceptance.mjs',
  gate: 'qa/factory/v1/gate_acceptance.mjs', pairing: 'qa/factory/v1/pairing_concurrency_acceptance.mjs', edge: 'qa/factory/v1/edge_boundary_acceptance.mjs',
  units: 'qa/factory/v1/runtime_units.mjs', recovery: 'qa/factory/v1/runtime_recovery_acceptance.mjs', isolation: 'qa/factory/v1/isolation_env_unit.mjs',
  releaseunit: 'qa/factory/v1/release_trust_unit.mjs', legacydirector: 'qa/factory/v1/legacy_director_acceptance.mjs',
};
const SPARSE = ['/supabase/control-plane/', '/scripts/', '/qa/factory/', '/qa/verification/auto-enrollment-v1/', '/package.json', '/package-lock.json', '/.gitignore',
  // the founder's prepared steps (schema rows RO / OB / FS read their SQL) and what the static contract reads
  '/qa/implementation/auto-enrollment-v1/FOUNDER_PREPARED_STEPS.md', '/qa/scenarios-runner/factory_v1_static_contract.mjs', '/.github/workflows/', '/web/lib/factory/',
  '/web/lib/data/factory-computers.ts', '/web/app/(app)/software-factory/computers/shared.tsx',
  // the founder's pepper tool (installer I9) and the evidence tools the static contract's S15 row reads
  '/qa/implementation/auto-enrollment-v1/tools/',
  // the static contract's plane scan (its library and the implementer's class proposals)
  '/qa/scenarios-runner/factory_v1_plane_scan.mjs', '/qa/scenarios-runner/factory_v1_plane_scan_inventory.mjs'];
const RUN_TIMEOUT_MS = 45 * 60 * 1000;
// ROWS RED BY DESIGN: suite -> { row: the undecided change request(s) it waits on }. Only these rows may fail in a control that still
// judges (differentially); remove an entry when its change request is decided and the row is green.
// (static P3p left this list when the Director's CR-disposition record decided CR-021, CR-022 and CR-026 and the row turned green)
const BY_DESIGN_RED = {};
const NODE_MODULES = path.join(ROOT, 'node_modules');

// an edit: { f, line: <needle>, to: <the new line> }   the ONE line containing the needle is replaced (its indentation kept)
//          { f, after: <needle>, add: <new line> }     a line is inserted after the ONE line containing the needle
//          { f, append: <new line> }                  a line appended after the file's last line
// LAYER (L7-12, L7-20): what the row that must fail observes - 'semantic' (a server read-back or the behaviour itself), 'refusal-name'
// (only the refusal's name), 'self-check' (the migration's own in-transaction abort), 'step' (the Director instrument's check aborting
// the step on the copy), 'source' (a static row). Unset: 'source' for the static suite, 'semantic' otherwise. A mutant tagged
// 'semantic' must name a row of its suite's READBACK_ROWS (checked by --plan), so the tag cannot claim a read-back the suite lacks.
const gateOff = (n, needle) => ({ f: V + '110_eligibility.sql', line: needle, to: 'null; -- (planted) gate ' + n + ' removed' });
const condOff = (f, needle, to) => ({ f, line: needle, to });
// B-4 reverted: the amendment reads the envelope in force before authorizing the caller, without the row lock or the tenant filter,
// derives the founder-only flag from that read, passes it to factory._admin, and takes no decision after the lock
const PRELOCK = [
  condOff(V + '210_admin_computers.sql', 'declare a record; e record; m factory.computers; cur factory.authorization_envelopes; nv integer; refused jsonb; ended record;',
    'declare a record; e record; m factory.computers; cur factory.authorization_envelopes; nv integer; refused jsonb; ended record; pre factory.authorization_envelopes; -- (planted)'),
  condOff(V + '210_admin_computers.sql', "select * into a from factory._admin(p_actor, p_live_role, p_body, 'amend_envelope', false);",
    "select x.* into pre from factory.authorization_envelopes x where x.computer_id = factory._uuid(p_body, 'computer_id') and x.version = (select m2.current_envelope_version from factory.computers m2 where m2.computer_id = factory._uuid(p_body, 'computer_id')); select * into a from factory._admin(p_actor, p_live_role, p_body, 'amend_envelope', e.problem is null and 'release_broker' = any (e.roles) and not ('release_broker' = any (coalesce(pre.authorized_roles, '{}')))); -- (planted) decided before the lock"),
  condOff(V + '210_admin_computers.sql', "if 'release_broker' = any (e.roles) and ('release_broker' = any (cur.authorized_roles)) is not true then", 'if false then -- (planted) no decision after the lock')];
// both layers of the identity refusal reverted (the Edge passes an identity field on; the front doors do not refuse it). Alone that is
// the control mutant IDR: F's own claim goes through (E1b) and no victim row moves (E1n / E1t / E1a / E1e must still pass). IDN / IDT /
// IDA add a front door that ACTS on the named node, tenant or agent, each judged by its own victim's read-back row
const ID_BOTH_LAYERS = [
  condOff(EDGE + 'node_api.ts', 'if (IDENTITY_FIELDS.has(k)) return', '    if (IDENTITY_FIELDS.has(k)) continue; // (planted) identity fields passed on'),
  { f: V + '100_node_common.sql', line: "as $$ select case when factory._names_identity(p) is not null then factory._refusal('identity_from_body_refused', 400,", to: "as $$ select case when false then factory._refusal('identity_from_body_refused', 400," }];
const MUTANTS = [
  // ---- AC-15: each eligibility gate, removed singly (gate 1 is enforced by the per-call credential re-check: RV below)
  { id: 'G2', suite: 'eligibility', expect: ['G1-G12'], what: 'gate 2 (tenant) removed', edits: [gateOff(2, "return factory._gate(2, 'the work order belongs to another tenant');")] },
  { id: 'G3', suite: 'eligibility', expect: ['G1-G12', 'O1'], what: 'gate 3 (company scope) removed', edits: [gateOff(3, "return factory._gate(3, 'the envelope is narrowed to other companies');")] },
  { id: 'G4a', suite: 'eligibility', expect: ['G1-G12', 'O1'], what: 'gate 4 (the envelope\'s work types) removed', edits: [gateOff(4, "return factory._gate(4, 'the envelope does not authorize work type '")] },
  { id: 'G4b', suite: 'eligibility', expect: ['G4r'], what: 'gate 4 (a current certified release) removed', edits: [gateOff(4, "return factory._gate(4, 'the node does not run a current certified release")] },
  { id: 'G5', suite: 'eligibility', expect: ['G1-G12', 'O1'], what: 'gate 5 (required role) removed', edits: [gateOff(5, "return factory._gate(5, 'the envelope does not authorize role '")] },
  { id: 'G6a', suite: 'eligibility', expect: ['G1-G12', 'O1'], what: 'gate 6 (capabilities from the envelope) removed', edits: [condOff(V + '110_eligibility.sql', 'if exists (select 1 from unnest(req) c where not (c = any (p_ctx.authorized_capabilities))) then', 'if false then -- (planted) gate 6 envelope removed')] },
  { id: 'G6b', suite: 'eligibility', expect: ['D1'], what: 'gate 6 (detection only restricts) removed: a capability the node detects as absent no longer makes it ineligible', edits: [condOff(V + '110_eligibility.sql', 'if exists (select 1 from unnest(req) c where absent ? c) then', 'if false then -- (planted) gate 6 detection removed')] },
  { id: 'G7h', suite: 'eligibility', expect: ['H1'], what: 'gate 7 (the S-16(a) authoring restriction) removed', edits: [condOff(V + '110_eligibility.sql', 'if paths is not null and factory._home_computer(p_ctx.computer_id, p_node.machine_fingerprint) and not factory._surfaces_within(', 'if false then -- (planted) S-16(a) removed')] },
  { id: 'G7f', suite: 'eligibility', expect: ['H2'], what: 'gate 7 restricts only the bound record itself, not a record that reported the bound record\'s fingerprint', edits: [condOff(V + '110_eligibility.sql', 'if paths is not null and factory._home_computer(p_ctx.computer_id, p_node.machine_fingerprint) and not factory._surfaces_within(', 'if paths is not null and p_ctx.s16a_bound and not factory._surfaces_within(p_wo.owned_surface, paths) then -- (planted)')] },
  { id: 'G11b', suite: 'eligibility', expect: ['G11b'], what: 'gate 11 (the per-computer heavy limit) removed', edits: [gateOff(11, "heavy runs on this computer'")] },
  { id: 'PX1', suite: 'eligibility', expect: ['K3', 'K4'], what: 'a preference excludes: a node without it defers for as long as any active computer prefers the class', edits: [condOff(V + '110_eligibility.sql', "p_wo.queued_at <= now() - interval '30 seconds' then return false; end if;",
    "if exists (select 1 from factory.computers m join factory.authorization_envelopes e on e.computer_id = m.computer_id and e.version = m.current_envelope_version where m.tenant_id = p_ctx.tenant_id and m.archived_at is null and m.computer_id <> p_ctx.computer_id and e.preferred_work_class = p_wo.work_type) and p_ctx.preferred_work_class is distinct from p_wo.work_type then return true; end if; if p_wo.queued_at is null or p_wo.queued_at <= now() - interval '30 seconds' then return false; end if; -- (planted)")] },
  { id: 'PX2', suite: 'eligibility', expect: ['K4b'], what: 'a preference is a hard gate: a node that prefers another class is refused this work', edits: [{ f: V + '110_eligibility.sql', after: '-- 12 hard minimum resources (narrowing only)',
    add: "    if p_ctx.preferred_work_class is not null and p_ctx.preferred_work_class <> p_wo.work_type then return factory._gate(12, 'planted'); end if; -- (planted)" }] },
  { id: 'ORD67', suite: 'eligibility', expect: ['O2'], what: 'gate 7\'s authoring restriction checked before gate 6', edits: [{ f: V + '110_eligibility.sql', after: '-- 6 required capabilities: from the ENVELOPE',
    add: "    if p_kind = 'authoring' and factory._bound_authoring_paths(p_ctx.tenant_id) is not null and factory._home_computer(p_ctx.computer_id, p_node.machine_fingerprint) and not factory._surfaces_within(p_wo.owned_surface, factory._bound_authoring_paths(p_ctx.tenant_id)) then return factory._gate(7, 'planted'); end if; -- (planted)" }] },
  { id: 'ORD1011', suite: 'eligibility', expect: ['O2'], what: 'gate 11\'s run limit checked before gate 10', edits: [{ f: V + '110_eligibility.sql', after: '-- 10 health',
    add: "    if (select count(*) from factory.agent_runs r where r.computer_id = p_ctx.computer_id and r.status = 'in_progress') >= p_ctx.max_concurrent_runs then return factory._gate(11, 'planted'); end if; -- (planted)" }] },
  { id: 'ORD1112', suite: 'eligibility', expect: ['O2'], what: 'gate 12 checked before gate 11', edits: [{ f: V + '110_eligibility.sql', after: '-- 11 max concurrency',
    add: "    if exists (select 1 from jsonb_object_keys(need) as q(x) where q.x in ('ram_mb', 'disk_mb', 'cpu_cores') and jsonb_typeof(need -> q.x) = 'number' and coalesce((res ->> (case q.x when 'ram_mb' then 'ram_free_mb' when 'disk_mb' then 'disk_free_mb' else 'cpu_cores' end))::numeric, -1) < (need ->> q.x)::numeric) then return factory._gate(12, 'planted'); end if; -- (planted)" }] },
  { id: 'G8', suite: 'eligibility', expect: ['G1-G12', 'O1'], what: 'gate 8 (surface locks) removed', edits: [gateOff(8, "return factory._gate(8, 'a surface this work order owns is held');")] },
  { id: 'G9', suite: 'eligibility', expect: ['G1-G12', 'O1'], what: 'gate 9 (drain) removed', edits: [gateOff(9, "return factory._gate(9, 'this computer is draining');")] },
  { id: 'G10a', suite: 'eligibility', expect: ['G1-G12'], what: 'gate 10 (heartbeat freshness) removed', edits: [gateOff(10, "return factory._gate(10, 'no heartbeat within 180 s');")] },
  { id: 'G10b', suite: 'eligibility', expect: ['G1-G12'], what: 'gate 10 (a RECOVERING node) removed', edits: [gateOff(10, "return factory._gate(10, 'the node is RECOVERING")] },
  { id: 'G11a', suite: 'eligibility', expect: ['G1-G12'], what: 'gate 11 (the computer\'s max concurrency) removed', edits: [gateOff(11, "concurrent runs in progress on this computer'")] },
  { id: 'G11c', suite: 'eligibility', expect: ['G1-G12'], what: 'gate 11 (the tenant\'s plane-wide heavy limit) removed', edits: [gateOff(11, "heavy runs on the plane'")] },
  { id: 'G12', suite: 'eligibility', expect: ['G1-G12', 'O1'], what: 'gate 12 (hard minimum resources) removed', edits: [gateOff(12, "return factory._gate(12, format('below the minimum")] },
  { id: 'DB', suite: 'eligibility', expect: ['K1'], what: 'the preference-deferral bound is 300 s instead of 30 s', edits: [condOff(V + '110_eligibility.sql', "p_wo.queued_at <= now() - interval '30 seconds' then return false; end if;", "if p_wo.queued_at is null or p_wo.queued_at <= now() - interval '300 seconds' then return false; end if; -- (planted)")] },
  { id: 'NP', suite: 'eligibility', expect: ['Y1'], what: 'priority ordered as text (lexical) instead of numerically', edits: [condOff(V + '120_node_lifecycle.sql', 'order by wo.priority_num desc, wo.queued_at, wo.work_order_id', 'order by wo.priority_num::text desc, wo.queued_at, wo.work_order_id -- (planted)')] },
  { id: 'KR', suite: 'eligibility', expect: ['G4r'], what: 'a release signed by a revoked key counts as current again (the 4eec9f0 defect)', edits: [condOff(V + '110_eligibility.sql', "and not exists (select 1 from factory.release_revocations v where v.tenant_id = r.tenant_id and v.kind = 'key' and v.key_id = r.key_id)", '-- (planted) key revocation ignored')] },

  // ---- AC-4 / R-4: the revocation re-check inside the transaction; its serialization
  { id: 'RV', suite: 'admin', expect: ['L1', 'L7'], what: 'the per-call credential status re-check removed (gate 1): a revoked credential keeps working', edits: [condOff(V + '100_node_common.sql', "if cred.status <> 'active' then", "if false then -- (planted) revocation re-check removed")] },
  // ---- S-14: an unbound registration reporting a bound record's fingerprint is refused by name, every retry; the refused record takes
  // no work and never leaves its walk
  { id: 'SB', suite: 'admin', expect: ['G2'], what: 'the S-14 registration refusal removed: an unbound re-enrollment of a bound machine reaches ALIVE', edits: [condOff(V + '120_node_lifecycle.sql', 'if not ctx.s16a_bound and factory._computer_fingerprints(ctx.computer_id, fp) && factory._s16a_fingerprints(ctx.tenant_id) then', 'if false then -- (planted)')] },
  { id: 'SB2', suite: 'admin', expect: ['G2'], what: 'the S-14 refusal judges only the fingerprint this call reports, not the record\'s history (a retry reporting another one passes)', edits: [condOff(V + '120_node_lifecycle.sql', 'if not ctx.s16a_bound and factory._computer_fingerprints(ctx.computer_id, fp) && factory._s16a_fingerprints(ctx.tenant_id) then', 'if not ctx.s16a_bound and array[fp] && factory._s16a_fingerprints(ctx.tenant_id) then -- (planted)')] },
  { id: 'G1n', suite: 'admin', expect: ['G2'], what: 'gate 1 no longer requires the credential\'s enrollment walk to be ALIVE (a REGISTRATION_FAILED record takes work)', edits: [condOff(V + '110_eligibility.sql', "or factory._credential_walk_state(p_ctx.credential_id) is distinct from 'ALIVE' then", 'then -- (planted)')] },
  { id: 'RTN', suite: 'admin', expect: ['G2'], what: 'a credential whose walk is not ALIVE may rotate (a new credential leaves REGISTRATION_FAILED behind)', edits: [condOff(V + '140_sessions.sql', "if factory._credential_walk_state(ctx.credential_id) is distinct from 'ALIVE' then", 'if false then -- (planted)')] },
  { id: 'WSC', suite: 'admin', expect: ['L6', 'L3b'], what: 'a rotated credential no longer carries the walk it came from (its own row only)', edits: [condOff(V + '100_node_common.sql', 'from ch join factory.node_credentials c on c.credential_id = ch.prev', 'from ch join factory.node_credentials c on false -- (planted)')] },
  { id: 'WSD', suite: 'admin', expect: ['L3b'], what: 'the rotation chain is followed to a fixed depth again (64): a credential rotated more often loses its walk', edits: [condOff(V + '100_node_common.sql', 'where not ch.enrolled and not (c.credential_id = any (ch.seen)))', 'where not ch.enrolled and not (c.credential_id = any (ch.seen)) and ch.d < 64) -- (planted)')] },
  { id: 'WT', suite: 'admin', expect: ['G2r'], what: 'the worker retries an S-14 registration refusal (exit 3) instead of stopping REFUSED', edits: [condOff('scripts/factory-runner/enrolled/worker.mjs', "if (reg.reason === 's16a_bound_fingerprint') {", 'if (false) { // (planted)')] },
  { id: 'G1s', suite: 'admin', expect: ['G2d'], what: 'gate 1 no longer refuses a record whose registration S-14 refused (an ALIVE record keeps taking work)', edits: [condOff(V + '110_eligibility.sql', 'if exists (select 1 from factory.computers m where m.computer_id = p_ctx.computer_id and m.s14_registration_refused_at is not null) then', 'if false then -- (planted)')] },
  { id: 'SBM', suite: 'admin', expect: ['G2d'], what: 'the S-14 refusal no longer marks the record (only the answer names it)', edits: [condOff(V + '120_node_lifecycle.sql', 'update factory.computers set s14_registration_refused_at = now() where computer_id = ctx.computer_id and s14_registration_refused_at is null;', 'null; -- (planted)')] },
  { id: 'FPE', suite: 'admin', expect: ['G2e'], what: 'a fingerprint reported only at enroll/start no longer counts as reported', edits: [condOff(V + '110_eligibility.sql', 'union select e.reported_fingerprint from factory.enrollments e where e.computer_id = p_computer and e.reported_fingerprint is not null', 'union select null::text where false -- (planted)')] },
  // ---- contract §1 Derived: the computer's state over every principal
  { id: 'DS', suite: 'admin', expect: ['S1'], what: 'the computer\'s state is its first principal\'s again', edits: [condOff(V + '200_admin_common.sql', "'state', factory._derived_computer_state(c.archived_at is not null, (select array_agg(j ->> 'state') from ps)),",
    "'state', case when c.archived_at is not null then 'ARCHIVED' else (select j ->> 'state' from ps join factory.agent_principals p0 on p0.node_id = ps.node_id where p0.created_via = 'add_computer') end, -- (planted)")] },
  { id: 'DS2', suite: 'admin', expect: ['S2'], what: 'the contract\'s order of enrollment states changed (INSTALL_FAILED and REGISTERING swapped)', edits: [
    condOff(V + '200_admin_common.sql', "'PAIRING_VERIFIED', 'NODE_ID_ISSUED', 'NODE_CREDENTIAL_ISSUED', 'RUNTIME_INSTALLING', 'INSTALL_FAILED',", "'PAIRING_VERIFIED', 'NODE_ID_ISSUED', 'NODE_CREDENTIAL_ISSUED', 'RUNTIME_INSTALLING', 'REGISTERING', -- (planted)"),
    condOff(V + '200_admin_common.sql', "'REGISTERING', 'REGISTRATION_FAILED']::text[], s) $$;", "'INSTALL_FAILED', 'REGISTRATION_FAILED']::text[], s) $$;")] },
  // ---- S-16(b): a campaign_key is a campaign row of the tenant or refused; a campaign work order is verified
  { id: 'CK', suite: 'admin', expect: ['G3'], what: 'submission accepts and stores an unknown or malformed campaign_key', edits: [
    condOff(V + '220_admin_releases_policies_work.sql', 'if camp is null or not exists (select 1 from factory.verification_policies q', 'if false and (camp is null or not exists (select 1 from factory.verification_policies q -- (planted)'),
    condOff(V + '220_admin_releases_policies_work.sql', "where q.tenant_id = (a.ctx).tenant_id and q.scope = 'campaign' and q.campaign_key = camp) then", "where q.tenant_id = (a.ctx).tenant_id and q.scope = 'campaign' and q.campaign_key = camp)) then")] },
  { id: 'CKV', suite: 'admin', expect: ['G3'], what: 'a campaign work order may be submitted with requires_verification false', edits: [condOff(V + '220_admin_releases_policies_work.sql', "if not coalesce((p_body ->> 'requires_verification')::boolean, true) then", 'if false then -- (planted)')] },
  { id: 'LK', suite: 'revocation', expect: ['I1', 'I2', 'I3a', 'I3b', 'I4'], what: 'no share lock on the credential row: a call and a revoke no longer serialize', edits: [condOff(V + '100_node_common.sql', 'where c.credential_id = p_credential_id for share;', 'select c.* into cred from factory.node_credentials c where c.credential_id = p_credential_id; -- (planted) no share lock')] },

  // ---- AC-9: the checkpoint fence inside the front door
  { id: 'FN', suite: 'takeover', expect: ['T6'], what: 'a checkpoint no longer checks that the run is still this node\'s (stale-worker fence removed)', edits: [condOff(V + '120_node_lifecycle.sql', "'node.checkpoint', 'run', p_body ->> 'run_id', 'refused', 'lease_lost');", "null; -- (planted)"), { f: V + '120_node_lifecycle.sql', line: "return factory._refusal('lease_lost', 409, 'this run is no longer this node''s (its lease was taken over): checkpoint not written');", to: 'null; -- (planted) checkpoint fence removed' }] },

  // ---- AC-6: identity, tenant and agent never from the body (both layers: the Edge and the front doors)
  { id: 'ID', suite: 'admin', layer: 'refusal-name', expect: ['E1'], what: 'a body naming node / tenant / role / principal is accepted at the Edge AND in the front doors', edits: [
    condOff(EDGE + 'node_api.ts', 'if (IDENTITY_FIELDS.has(k)) return', "    if (false) return { ok: false, res: refuse(400, 'identity_from_body_refused', 'planted') }; // (planted)"),
    { f: V + '100_node_common.sql', line: "as $$ select case when factory._names_identity(p) is not null then factory._refusal('identity_from_body_refused', 400,", to: "as $$ select case when false then factory._refusal('identity_from_body_refused', 400," }] },

  // ---- AC-7: the S-7 route list; the tenant_admins condition and its tier
  { id: 'S7', suite: 'admin', expect: ['R1'], what: 'a route outside S-7 (GET /v1/debug) answers', edits: [{ f: EDGE + 'node_api.ts', after: "'GET /v1/time': 'select factory.node_time() as r',", add: "  'GET /v1/debug': 'select factory.node_time() as r', // (planted)" }] },
  { id: 'TA', suite: 'admin', expect: ['P1', 'P2'], what: 'factory.tenant_admins no longer required: the live role alone makes a Factory admin', edits: [condOff(V + '200_admin_common.sql', 'if n = 0 then', 'if false then -- (planted) tenant_admins not required')] },
  { id: 'TF', suite: 'admin', expect: ['P4'], what: 'founder-only actions no longer need tier founder AND live role founder (the one definition, factory._founder_only)', edits: [condOff(V + '200_admin_common.sql', "if p_ctx.tier = 'founder' and p_ctx.live_role = 'founder' then return null; end if;", 'return null; -- (planted) founder tier not required')] },
  { id: 'RT', suite: 'admin', expect: ['R1p', 'X0'], what: 'the platform path prefix is not stripped (every deployed call would be 404)', edits: [condOff(EDGE + 'route.ts', "return basePath && pathname.startsWith(basePath + '/') ? pathname.slice(basePath.length) : pathname;", 'return pathname; // (planted)')] },

  // ---- S-8 r3 / CR-003 / AC-7 (L7-13): each founder-only action's own wiring, one mutant each
  { id: 'FP', suite: 'admin', expect: ['P4'], what: 'publishing - and so superseding - a release is no longer founder-only', edits: [condOff(V + '220_admin_releases_policies_work.sql', "select * into a from factory._admin(p_actor, p_live_role, p_body, 'publish_release', true);", "select * into a from factory._admin(p_actor, p_live_role, p_body, 'publish_release', false); -- (planted)")] },
  { id: 'FR', suite: 'admin', expect: ['P4'], what: 'revoking a release is no longer founder-only', edits: [condOff(V + '220_admin_releases_policies_work.sql', "select * into a from factory._admin(p_actor, p_live_role, p_body, 'revoke_release', true);", "select * into a from factory._admin(p_actor, p_live_role, p_body, 'revoke_release', false); -- (planted)")] },
  { id: 'FK', suite: 'admin', expect: ['P4'], what: 'revoking a release key is no longer founder-only', edits: [condOff(V + '220_admin_releases_policies_work.sql', "select * into a from factory._admin(p_actor, p_live_role, p_body, 'revoke_key', true);", "select * into a from factory._admin(p_actor, p_live_role, p_body, 'revoke_key', false); -- (planted)")] },
  { id: 'FA', suite: 'admin', expect: ['P4'], what: 'Add Computer granting release_broker is no longer founder-only', edits: [condOff(V + '210_admin_computers.sql', "select * into a from factory._admin(p_actor, p_live_role, p_body, 'add_computer', e.problem is null and 'release_broker' = any (e.roles));", "select * into a from factory._admin(p_actor, p_live_role, p_body, 'add_computer', false); -- (planted)")] },
  { id: 'FE', suite: 'admin', expect: ['P4'], what: 'an amendment granting release_broker is no longer founder-only', edits: [condOff(V + '210_admin_computers.sql', "if 'release_broker' = any (e.roles) and ('release_broker' = any (cur.authorized_roles)) is not true then", 'if false then -- (planted) the grant is not founder-only')] },
  // ---- B-4: the amendment's founder-only status decided from a read taken before its row lock and outside the caller's tenant (the
  // decision as 412ac14 took it), judged by the forced interleaving, by the foreign-tenant answers and by the static row
  { id: 'PL', suite: 'revocation', expect: ['I5a', 'I5c'], what: 'the amendment decides founder-only from an unlocked, untenanted read taken before the caller is authorized', edits: PRELOCK },
  { id: 'PL2', suite: 'admin', expect: ['P3b'], what: 'the same pre-lock decision: a foreign admin\'s answer depends on this tenant\'s envelope', edits: PRELOCK },
  { id: 'PLS', suite: 'static', expect: ['A1', 'A2'], what: 'the same pre-lock decision, read from the source', edits: PRELOCK },
  { id: 'NA', suite: 'admin', expect: ['P3b'], what: 'a not_found (a foreign or an unknown id) leaves no audited receipt (contract §9)', edits: [condOff(V + '210_admin_computers.sql', "perform factory._audit(p_ctx.tenant_id, 'admin', p_ctx.actor::text, 'admin.' || p_op, kind, left(p_body ->> p_key, 100), 'refused', 'not_found');", 'null; -- (planted) not_found unaudited')] },
  // ---- L2-F3: a pairing code only in a receipt that stored it (the Edge; the web)
  { id: 'CS', suite: 'admin', expect: ['L7r', 'L12'], what: 'every ok answer of a code-issuing op carries the drawn code, stored or not', edits: [condOff(EDGE + 'admin_api.ts', 'const stored = code !== null && r.already !== true', 'const stored = code !== null; // (planted) any ok answer shows the drawn code')] },
  { id: 'CSS', suite: 'static', expect: ['A4'], what: 'the same, read from the source', edits: [condOff(EDGE + 'admin_api.ts', 'const stored = code !== null && r.already !== true', 'const stored = code !== null; // (planted) any ok answer shows the drawn code')] },
  { id: 'WA', suite: 'static', expect: ['A3'], what: 'the Computers page shows a pairing code from an "already" receipt', edits: [condOff('web/app/(app)/software-factory/computers/shared.tsx', '{!result.already && typeof result.pairing_code === "string" && <PairingCodePanel', '{typeof result.pairing_code === "string" && <PairingCodePanel code={result.pairing_code} expiresAt={typeof result.expires_at === "string" ? result.expires_at : undefined} downloads={downloads} />}')] },
  // ---- L2-F5: the op, route and body-field tables by own property only
  { id: 'PO', suite: 'admin', expect: ['R2'], what: 'the Admin API op lookup follows the prototype chain (constructor is an op)', edits: [condOff(EDGE + 'admin_api.ts', "const op = m && req.method === 'POST' && Object.hasOwn(ADMIN_OPS, m[1]) ? ADMIN_OPS[m[1]] : undefined;", "const op = m && req.method === 'POST' ? ADMIN_OPS[m[1]] : undefined; // (planted)")] },
  { id: 'POS', suite: 'static', expect: ['A4'], what: 'the same, read from the source', edits: [condOff(EDGE + 'admin_api.ts', "const op = m && req.method === 'POST' && Object.hasOwn(ADMIN_OPS, m[1]) ? ADMIN_OPS[m[1]] : undefined;", "const op = m && req.method === 'POST' ? ADMIN_OPS[m[1]] : undefined; // (planted)")] },
  { id: 'PN', suite: 'admin', expect: ['R2'], what: 'the node body schema is indexed without an own-property test, so an inherited name such as constructor passes as a known field', edits: [condOff(EDGE + 'node_api.ts', 'const t = Object.hasOwn(schema, k) ? schema[k] : undefined;', 'const t = schema[k]; // (planted)')] },
  // ---- L3-F8 and its class: a code revocation ends exactly the enrollments started from the revoked codes; a principal_id is a uuid
  { id: 'RC2', suite: 'admin', expect: ['L9b'], what: 'revoking a code ends every in-flight enrollment on its computer instead of only those begun with the revoked codes', edits: [condOff(V + '200_admin_common.sql', "for eid in select e.enrollment_id from factory.enrollments e where e.code_id = any (p_code_ids) and e.state = 'PAIRING_STARTED' order by e.enrollment_id for update loop", "for eid in select e.enrollment_id from factory.enrollments e where e.computer_id in (select c.computer_id from factory.pairing_codes c where c.code_id = any (p_code_ids)) and e.state = 'PAIRING_STARTED' order by e.enrollment_id for update loop -- (planted) by computer")] },
  { id: 'SW', suite: 'admin', expect: ['L9d'], what: 'the locator sweep expires a code and leaves the enrollment started from it as it was', edits: [condOff(V + '200_admin_common.sql', "perform factory._end_enrollments(swept, 'PAIRING_EXPIRED', 'server', 'pairing code expired (its locator was drawn again)');", 'null; -- (planted) the swept code\'s enrollments left as they were')] },
  { id: 'PW', suite: 'admin', expect: ['L9c'], what: 'a principal_id that is not a uuid reads as "none named": the action widens to every principal or retargets the first', edits: [condOff(V + '200_admin_common.sql', "refusal := factory._refusal('bad_request', 400, 'principal_id is the uuid of a principal of this computer'); return;", 'return; -- (planted) a malformed principal_id reads as none')] },
  // ---- L5-F9: revoke and archive give a verifier's claim back immediately, judged by the run rows this call itself released
  { id: 'VR', suite: 'independence', expect: ['(r)'], what: 'after revoke or archive the verifier keeps holding its claim; others wait for the lease to run out', edits: [condOff(V + '210_admin_computers.sql', "vc := factory._return_verification_claims(p_principal, 'the verifier''s credential was revoked');", 'vc := 0; -- (planted) the claim is not returned')] },
  { id: 'VS', suite: 'revocation', expect: ['I6'], what: 'the returned claim is derived from the statement snapshot, not from the runs this revoke gave back (a claim a concurrent reaper passed on is flipped back)', edits: [condOff(V + '210_admin_computers.sql', 'and exists (select 1 from gone g join factory.work_orders v on v.work_order_id = g.work_order_id', "and exists (select 1 from factory.agent_runs g join factory.work_orders v on v.work_order_id = g.work_order_id and g.principal_id = p_principal and g.status = 'in_progress' and g.run_kind = 'verification' -- (planted) the snapshot")] },
  // ---- L7-24 / AC-4 / AC-6(e): "already" writes nothing; audits carry who, when, from, to; refusals of stale state are audited; the
  // optimistic check cannot be skipped
  { id: 'AU', suite: 'admin', expect: ['L6'], what: 'a second drain writes an audit row before answering "already"', edits: [{ f: V + '210_admin_computers.sql', after: 'if on_ = (m.drain_requested_at is not null) then', add: "      perform factory._audit(m.tenant_id, 'admin', (a.ctx).actor::text, 'computer.drained', 'computer', m.computer_id::text, 'ok', null); -- (planted)" }] },
  { id: 'AD', suite: 'admin', expect: ['L10'], what: 'the amendment\'s audit no longer records the envelope it replaced (from)', edits: [condOff(V + '210_admin_computers.sql', "jsonb_build_object('computer_id', m.computer_id, 'from', factory._envelope_json(cur),", "jsonb_build_object('computer_id', m.computer_id, 'from', null::jsonb, -- (planted)")] },
  { id: 'SAU', suite: 'admin', expect: ['L8'], what: 'the amendment\'s stale_state refusal is not audited', edits: [condOff(V + '210_admin_computers.sql', "'admin.amend_envelope', 'computer', m.computer_id::text, 'refused', 'stale_state'", 'null; -- (planted) stale_state not audited')] },
  { id: 'EV', suite: 'admin', expect: ['L8b'], what: 'an amendment without expected_version skips the optimistic check (a three-valued IF)', edits: [condOff(V + '210_admin_computers.sql', "if jsonb_typeof(p_body -> 'expected_version') is distinct from 'number' then", "if jsonb_typeof(p_body -> 'expected_version') <> 'number' then -- (planted)")] },
  { id: 'EVP', suite: 'admin', expect: ['L8b'], what: 'a policy update without expected_version skips the optimistic check (a three-valued IF)', edits: [condOff(V + '220_admin_releases_policies_work.sql', "if jsonb_typeof(p_body -> 'expected_version') is distinct from 'number' then", "if jsonb_typeof(p_body -> 'expected_version') <> 'number' then -- (planted)")] },
  // ---- the "is there already one?" admin decisions, serialized (a named answer, never an unnamed 23505)
  { id: 'LT', suite: 'revocation', expect: ['I7a'], what: 'Add Computer\'s S-16(a) check is not serialized per tenant', edits: [condOff(V + '210_admin_computers.sql', 'if bind then perform factory._lock_tenant((a.ctx).tenant_id); end if;', 'null; -- (planted)')] },
  { id: 'LTR', suite: 'revocation', expect: ['I7e'], what: 'Restore\'s S-16(a) check is not serialized per tenant', edits: [condOff(V + '210_admin_computers.sql', 'if m.s16a_bound_at is not null then perform factory._lock_tenant(m.tenant_id); end if;', 'null; -- (planted)')] },
  { id: 'LP', suite: 'revocation', expect: ['I7b'], what: 'two publishes on one channel are not serialized', edits: [condOff(V + '220_admin_releases_policies_work.sql', 'perform factory._lock_tenant((a.ctx).tenant_id); -- publishes and key revokes', 'null; -- (planted)')] },
  { id: 'LA', suite: 'revocation', expect: ['I7c', 'I7d'], what: 'an adoption reads its release without a share lock', edits: [condOff(V + '210_admin_computers.sql', "select x.* into r from factory.releases x where x.release_id = factory._uuid(p_body, 'release_id') and x.tenant_id = m.tenant_id for share;", "select x.* into r from factory.releases x where x.release_id = factory._uuid(p_body, 'release_id') and x.tenant_id = m.tenant_id; -- (planted) no share lock")] },
  { id: 'LKK', suite: 'revocation', expect: ['I7d'], what: 'a key revoke does not lock the key\'s releases first', edits: [condOff(V + '220_admin_releases_policies_work.sql', 'perform 1 from factory.releases x where x.tenant_id = (a.ctx).tenant_id and x.key_id = k order by x.release_id for no key update;', 'null; -- (planted)')] },
  { id: 'LKP', suite: 'revocation', expect: ['I7f', 'I7g'], what: 'a key revoke does not queue on the tenant row: a publish of that key goes through while the revoke is uncommitted, and a second revoke of an unused key fails on the unique index', edits: [condOff(V + '220_admin_releases_policies_work.sql', 'perform factory._lock_tenant((a.ctx).tenant_id); -- a key revoke queues', 'null; -- (planted)')] },
  { id: 'LTF', suite: 'revocation', expect: ['I7h'], what: 'the tenant serialization lock is FOR UPDATE: every foreign-key insert of the tenant (FOR KEY SHARE) waits behind an open publish', edits: [condOff(V + '200_admin_common.sql', 'perform 1 from factory.tenants t where t.tenant_id = p_tenant for no key update;', 'perform 1 from factory.tenants t where t.tenant_id = p_tenant for update; -- (planted)')] },
  // the locator sweep of _issue_code and node_enroll_complete both take a pairing code before the enrollment started from it; each
  // mutant takes the enrollment first on one side, and the interleaving that holds the other row then ends in a deadlock (40P01)
  { id: 'SWL', suite: 'revocation', expect: ['I8c'], what: 'the locator sweep locks the enrollments of the elapsed codes before it expires those codes', edits: [
    { f: V + '200_admin_common.sql', after: "until := now() + (ttl || ' seconds')::interval;", add: "perform 1 from factory.enrollments e join factory.pairing_codes k on k.code_id = e.code_id where k.locator = loc and k.state in ('PAIRING_CODE_ISSUED', 'PAIRING_STARTED') and k.expires_at <= now() and e.state = 'PAIRING_STARTED' for update of e; -- (planted) the enrollment before the code" }] },
  { id: 'CEL', suite: 'revocation', expect: ['I8d'], what: 'enroll/complete locks its enrollment before the pairing code', edits: [
    condOff(V + '150_enrollment.sql', 'select x.* into code from factory.pairing_codes x where x.code_id = e0.code_id for no key update;',
      'select x.* into e from factory.enrollments x where x.enrollment_id = e0.enrollment_id for update; select x.* into code from factory.pairing_codes x where x.code_id = e0.code_id for no key update; -- (planted) the enrollment before the code')] },
  { id: 'LTFS', suite: 'static', expect: ['A5'], what: 'the same lock strength, read from the source', edits: [condOff(V + '200_admin_common.sql', 'perform 1 from factory.tenants t where t.tenant_id = p_tenant for no key update;', 'perform 1 from factory.tenants t where t.tenant_id = p_tenant for update; -- (planted)')] },

  // ---- AC-12: the stricter-only policy guard (both layers: the front door and the table guard)
  { id: 'PS', suite: 'admin', expect: ['G1'], what: 'a policy may be relaxed through the Admin API (front door and guard)', edits: [
    condOff(V + '220_admin_releases_policies_work.sql', 'if (p.require_distinct_run and not b1) or (p.require_distinct_identity and not b2) or (p.require_verifier_authority and not b3)', 'if false and ((p.require_distinct_run and not b1) or (p.require_distinct_identity and not b2) or (p.require_verifier_authority and not b3) -- (planted)'),
    condOff(V + '220_admin_releases_policies_work.sql', 'or not (paths <@ p.director_document_paths) or (b5 and cardinality(paths) = 0) then', 'or not (paths <@ p.director_document_paths) or (b5 and cardinality(paths) = 0)) then'),
    condOff(V + '080_guards.sql', "perform factory._refuse('factory_policy_refused', 'a policy can only be made stricter through the Admin API (S-14)');", 'null; -- (planted) stricter-only guard removed')] },

  // ---- AC-12 / AC-10: the legacy fence and least privilege
  { id: 'LD', suite: 'schema', layer: 'self-check', expect: ['P1', 'X0'], what: 'the baseline default-privilege grant to factory_runner is no longer revoked (990 check (d) must abort the migration)', edits: [condOff(V + '000_preconditions_roles.sql', 'alter default privileges in schema factory revoke all on tables from factory_runner;', 'select 1; -- (planted) the 69df2f52 default grant kept')] },
  // planted AFTER 990's self-check, still as factory_owner (a grant earlier in the migration makes check (c) abort it - that layer is
  // intact here), so the rows that must see a legacy EXECUTE are the ones judged
  { id: 'LX', suite: 'schema', expect: ['C6', 'L2'], what: 'factory_runner may EXECUTE a node front door (granted after the migration\'s self-check)', edits: [{ f: V + '990_finalize.sql', after: '$finalize$;', add: 'grant execute on function factory.node_heartbeat(bytea, jsonb) to factory_runner; -- (planted)' }] },
  // planted where the applying login acts as itself (it holds ADMIN on every role it created, and on factory_runner): the migration no
  // longer reads memberships, so it commits, and the read-backs must see it; the static contract's R2 refuses the statement too
  { id: 'LR', suite: 'schema', expect: ['C8', 'L7', 'AL1'], what: 'an API role is granted to factory_runner', edits: [{ f: V + '990_finalize.sql', after: 'revoke create on schema factory from factory_owner;', add: 'grant factory_node_api to factory_runner; -- (planted)' }] },
  { id: 'LR2', suite: 'schema', expect: ['C8', 'AL1'], what: 'factory_runner is granted to an API role (the reverse membership)', edits: [{ f: V + '990_finalize.sql', after: 'revoke create on schema factory from factory_owner;', add: 'grant factory_runner to factory_node_api; -- (planted)' }] },

  // ---- the migration under the live applying login (NOSUPERUSER): its privilege model
  // part 990's revokes by name are a second layer: they only take effect as the relations' owner. Run by the applying login, which
  // is not the owner and holds no grant option on them, PostgreSQL revokes nothing (a warning, no error), and on a correct migration
  // nothing shows. So F1 also keeps the transient PUBLIC REFERENCES of part 010 (which alone is taken back by 990 run as the owner):
  // the leak must then survive to the read-backs
  { id: 'F1', suite: 'schema', layer: 'semantic', expect: ['C9', 'C3'], what: 'part 990 runs as the applying login instead of factory_owner, and part 010 keeps its transient PUBLIC REFERENCES on factory.tenants: the revoke by name takes nothing back, and the read-backs must see PUBLIC\'s REFERENCES', edits: [
    condOff(V + '990_finalize.sql', 'set local role factory_owner;', 'select 1; -- (planted) part 990 runs as the applying login'),
    condOff(V + '010_tenancy.sql', 'revoke references on factory.tenants from public;', 'select 1; -- (planted) PUBLIC REFERENCES kept')] },
  { id: 'SG', suite: 'schema', expect: ['P1', 'X0'], what: 'no SET grant on factory_owner for its creator (createrole_self_grant \'\'): SET ROLE factory_owner is refused to the applying login', edits: [condOff(V + '000_preconditions_roles.sql', "set local createrole_self_grant = 'set';", "set local createrole_self_grant = ''; -- (planted)")] },
  { id: 'SI', suite: 'schema', expect: ['AL1', 'AL2', 'RO2'], what: 'the applying login INHERITS factory_owner (createrole_self_grant \'set, inherit\'): it holds the authority tables\' privileges, and a re-run provisioning grant reaches factory_runner', edits: [condOff(V + '000_preconditions_roles.sql', "set local createrole_self_grant = 'set';", "set local createrole_self_grant = 'set, inherit'; -- (planted)")] },
  { id: 'TR', suite: 'schema', expect: ['AL3'], what: 'factory_owner keeps the TRIGGER it held to attach the legacy guard', edits: [
    condOff(V + '080_guards.sql', 'revoke trigger on factory.nodes, factory.work_orders', 'select 1; -- (planted) TRIGGER kept'),
    condOff(V + '080_guards.sql', 'factory.director_lease from factory_owner;', '-- (planted)')] },
  // part 990 revokes nothing on functions: a function left executable by PUBLIC is caught by check (c) in the migration itself
  { id: 'DP', suite: 'schema', layer: 'self-check', expect: ['P1', 'X0'], what: 'the default-privilege revoke of PUBLIC EXECUTE is per-schema again (a no-op against the global default): every function keeps PUBLIC EXECUTE, and check (c) must abort the migration', edits: [condOff(V + '000_preconditions_roles.sql', 'alter default privileges revoke execute on functions from public;', 'alter default privileges in schema factory revoke execute on functions from public; -- (planted)')] },
  { id: 'FX', suite: 'schema', layer: 'self-check', expect: ['P1', 'X0'], what: 'the default revoke of PUBLIC EXECUTE is gone: every function keeps PUBLIC EXECUTE, and check (c) must abort the migration', edits: [
    condOff(V + '000_preconditions_roles.sql', 'alter default privileges revoke execute on functions from public;', 'select 1; -- (planted) no default revoke')] },
  // the migration no longer re-checks the relation ACLs itself (990 check (a) is gone): the read-backs judge it, and static R5 reads the
  // revoke's grantees from the source (PXS)
  { id: 'SQR', suite: 'schema', layer: 'semantic', expect: ['C3s'], what: 'factory_runner is granted USAGE and SELECT on an identity sequence of a new table (audit_events) after part 990\'s revokes: the read-back C3s must see it', edits: [{ f: V + '990_finalize.sql', append: 'set local role factory_owner; grant usage, select on sequence factory.audit_events_event_id_seq to factory_runner; reset role; -- (planted)' }] },
  { id: 'PX', suite: 'schema', layer: 'semantic', expect: ['C9', 'C3'], what: 'the transient PUBLIC REFERENCES on factory.tenants is kept and 990\'s table revoke no longer names PUBLIC: the read-backs must see PUBLIC\'s REFERENCES, which every role holds (C9: the API roles; C3: factory_runner)', edits: [
    condOff(V + '010_tenancy.sql', 'revoke references on factory.tenants from public;', 'select 1; -- (planted) PUBLIC REFERENCES kept'),
    condOff(V + '990_finalize.sql', 'factory.releases, factory.release_revocations from public, factory_runner;', 'factory.releases, factory.release_revocations from factory_runner; -- (planted) PUBLIC not revoked')] },
  { id: 'PXS', suite: 'static', expect: ['R5'], what: 'part 990\'s table revoke no longer names PUBLIC (read from the source)', edits: [
    condOff(V + '990_finalize.sql', 'factory.releases, factory.release_revocations from public, factory_runner;', 'factory.releases, factory.release_revocations from factory_runner; -- (planted) PUBLIC not revoked')] },
  { id: 'AX', suite: 'schema', expect: ['AL7'], what: 'the API roles also get CREATE on schema factory (a privilege beyond USAGE there)', edits: [condOff(V + '000_preconditions_roles.sql', 'grant usage on schema factory to factory_node_api, factory_admin_api;', 'grant usage, create on schema factory to factory_node_api, factory_admin_api; -- (planted)')] },
  { id: 'SC', suite: 'schema', expect: ['AL6'], what: 'a relation the migration creates is missing from 990\'s table revoke by name (read against every relation factory_owner owns)', edits: [condOff(V + '990_finalize.sql', 'factory.releases, factory.release_revocations from public, factory_runner;', 'factory.releases from public, factory_runner; -- (planted) one relation out of the revoke')] },
  { id: 'OB', suite: 'schema', expect: ['OB1'], what: 'the prepared observer step omits a relation the migration adds', edits: [condOff('qa/implementation/auto-enrollment-v1/FOUNDER_PREPARED_STEPS.md', '  factory.releases, factory.release_revocations,', '  factory.releases,')] },
  { id: 'RR', suite: 'schema', expect: ['RO1'], what: 'the prepared rotation step re-runs the 69df2f52 provisioner instead of \\password', edits: [condOff('qa/implementation/auto-enrollment-v1/FOUNDER_PREPARED_STEPS.md', '\\password factory_runner', 'node scripts/factory-runner/provision-control-plane.mjs --allow-dedicated-supabase npvhuoozkbexddnvkqsj --write-env runner.env')] },
  // the static contract (S-10 / VERIFICATION_SPEC §3.4 r3 source facts)
  { id: 'CU', suite: 'static', expect: ['R1', 'R2'], what: 'a migration statement names the applying login (grant factory_owner to current_user)', edits: [{ f: V + '000_preconditions_roles.sql', after: 'create role factory_owner nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;', add: 'grant factory_owner to current_user with inherit false, set true; -- (planted)' }] },
  { id: 'OW', suite: 'static', expect: ['R1'], what: 'part 990 scopes its check (c) by reading object owners again', edits: [condOff(V + '990_finalize.sql', "where p.pronamespace = 'factory'::regnamespace", "where pg_catalog.pg_get_userbyid(p.proowner) = 'factory_owner' -- (planted)")] },
  { id: 'LN', suite: 'static', expect: ['R3'], what: 'the claim catches lock_not_available and returns a refusal instead of re-raising', edits: [condOff(V + '120_node_lifecycle.sql', "got := pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtext('factory.claim'));", "begin perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('factory.claim')); got := true; exception when lock_not_available then got := false; end; -- (planted)")] },
  { id: 'RL', suite: 'static', expect: ['R4'], what: 'the migration ends as factory_owner (its last `reset role` removed)', edits: [{ f: V + '990_finalize.sql', line: 'reset role;', to: '-- (planted) reset role removed' }] },
  { id: 'RS', suite: 'static', expect: ['R5'], what: 'a relation the migration creates is missing from part 080\'s authority-guard list', edits: [condOff(V + '080_guards.sql', "'certifications', 'releases', 'release_revocations'] loop", "'certifications', 'releases'] loop -- (planted) one relation out of the authority list")] },
  { id: 'RSR', suite: 'static', expect: ['R5'], what: 'a relation the migration creates is missing from 990\'s table revoke', edits: [condOff(V + '990_finalize.sql', 'factory.releases, factory.release_revocations from public, factory_runner;', 'factory.releases from public, factory_runner; -- (planted)')] },
  { id: 'RSS', suite: 'static', expect: ['R5'], what: 'an identity sequence is missing from 990\'s sequence revoke', edits: [condOff(V + '990_finalize.sql', 'factory.enrollment_transitions_transition_id_seq, factory.pairing_attempts_attempt_id_seq, factory.audit_events_event_id_seq', 'factory.enrollment_transitions_transition_id_seq, factory.pairing_attempts_attempt_id_seq -- (planted)')] },
  { id: 'FS', suite: 'static', expect: ['R6'], what: 'a founder step reads the attributes of the object owner again', edits: [condOff('qa/implementation/auto-enrollment-v1/FOUNDER_PREPARED_STEPS.md', "select rolname, rolcanlogin from pg_catalog.pg_roles where rolname in ('factory_node_api', 'factory_admin_api');", "select rolname, rolcanlogin, rolsuper, rolcreaterole, rolcreatedb, rolbypassrls from pg_roles where rolname like 'factory_%';")] },
  { id: 'S1W', suite: 'static', expect: ['R7'], what: 'founder step 1 composes the migration with migration.mjs again', edits: [{ f: 'qa/implementation/auto-enrollment-v1/FOUNDER_PREPARED_STEPS.md', after: '## 1. Apply the control-plane migration (WO-1 r3; AC-11)', add: '- node scripts/factory-control-plane/migration.mjs compose > factory_control_plane_v1.sql (planted)' }] },
  { id: 'AV', suite: 'static', expect: ['X4'], what: 'the developer migration tool takes the admin URL from its command line again', edits: [
    condOff('scripts/factory-control-plane/migration.mjs', 'if (process.argv.length > 3) {', '// (planted) arguments after the subcommand accepted'),
    condOff('scripts/factory-control-plane/migration.mjs', 'const url = process.env.FACTORY_DISPOSABLE_ADMIN_URL;', "const url = process.env.FACTORY_DISPOSABLE_ADMIN_URL || process.argv[process.argv.indexOf('--admin') + 1]; // (planted)")] },
  { id: "MTT", suite: "static", expect: ["X4b"], what: "the developer migration tool judges only the text of its URL again (not what pg's parser reads, and a tab or a line break is not refused)", edits: [condOff('scripts/factory-control-plane/migration.mjs', "if (!/^[\\x21-\\x7e]+$/.test(raw)) return 'REFUSING - the URL is empty", "void 0; // (planted)"), condOff('scripts/factory-control-plane/migration.mjs', "const inTarget = named(JSON.stringify(read));", "const inTarget = null; // (planted)")] },
  { id: "MTE", suite: "static", expect: ["X4b"], what: "the developer migration tool accepts a URL that names no user, host or database (pg takes it from the environment)", edits: [condOff('scripts/factory-control-plane/migration.mjs', "if (!read.host || !read.user || !read.database) return", "void 0; // (planted)")] },
  { id: "MTC", suite: "static", expect: ["X4b"], what: "the developer migration tool connects with the text of the URL again, not with the configuration it judged", edits: [condOff('scripts/factory-control-plane/migration.mjs', "const client = new pg.Client(driverReading(adminUrl));", "const client = new pg.Client({ connectionString: adminUrl }); // (planted)")] },
  { id: 'AR', suite: 'static', expect: ['X4'], what: 'the developer migration tool no longer refuses the live Factory ref', edits: [condOff('scripts/factory-control-plane/migration.mjs', "export const REFUSED_REFS = ['pvphxgrtdfrudejjhzjk', 'npvhuoozkbexddnvkqsj'];", "export const REFUSED_REFS = ['pvphxgrtdfrudejjhzjk']; // (planted)")] },
  { id: 'SA', suite: 'static', expect: ['H1'], what: 'a developer suite applies the migration with the superuser URL again', edits: [{ f: 'qa/factory/v1/enrollment_acceptance.mjs', after: "import { ROOT, startV1Plane, connect } from './plane.mjs';", add: "import { apply } from '../../../scripts/factory-control-plane/migration.mjs'; // (planted)" }] },
  { id: 'MQ1', suite: 'static', expect: ['H1'], what: 'a developer suite sends compose() to the plane over the superuser connection with a plain query', edits: [{ f: 'qa/factory/v1/enrollment_acceptance.mjs', after: "import { ROOT, startV1Plane, connect } from './plane.mjs';", add: "const plantedSend = async (p) => (await connect(p.superUrl)).query('begin; ' + compose() + ' commit;'); // (planted)" }] },
  { id: 'MQ2', suite: 'static', expect: ['H1'], what: 'the same, through a variable holding the composed text', edits: [{ f: 'qa/factory/v1/enrollment_acceptance.mjs', after: "import { ROOT, startV1Plane, connect } from './plane.mjs';", add: "const plantedText = ['begin;', compose(), 'commit;'].join(' '); const plantedSend = async (p) => (await connect(p.superUrl)).query(plantedText); // (planted)" }] },
  { id: 'MQ3', suite: 'static', expect: ['H1'], what: 'a developer suite reads a migration file and sends it with its own query call', edits: [{ f: 'qa/factory/v1/schema_acceptance.mjs', after: "import { compose, sha256 } from '../../../scripts/factory-control-plane/migration.mjs';", add: "const plantedSql = readFileSync(join(ROOT, 'supabase', 'control-plane', 'v1', '000_preconditions_roles.sql'), 'utf8'); const plantedSend = (c) => c.query(plantedSql); // (planted)" }] },
  { id: 'PR', suite: 'schema', expect: ['C9', 'P1', 'X0'], what: 'the Node API role may insert principals directly (a node could mint a principal)', edits: [{ f: V + '190_node_grants.sql', after: '  to factory_node_api;', add: 'grant insert on factory.agent_principals to factory_node_api; -- (planted)' }] },
  { id: 'LG', suite: 'schema', expect: ['L4'], what: 'the legacy guard lets factory_runner update or delete a new-model / enrolled row', edits: [condOff(V + '080_guards.sql', 'if old_nm then', 'if false then -- (planted) legacy writes to new-model rows allowed')] },
  { id: 'LG2', suite: 'schema', expect: ['L5'], what: 'the legacy guard lets factory_runner create a new-model row', edits: [condOff(V + '080_guards.sql', 'if new_nm then', 'if false then -- (planted)')] },
  { id: 'LG3', suite: 'schema', expect: ['M1', 'M2', 'M3'], what: 'the legacy guard FAILS the frozen claim on a lapsed enrolled row instead of leaving it unchanged', edits: [{ f: V + '080_guards.sql', after: 'if old_nm then', add: "      raise exception using errcode = '42501', message = 'factory_legacy_refused (planted)';" }] },
  { id: 'RC', suite: 'schema', expect: ['L3'], what: 'the reserved capability may be written on a node by the legacy path', edits: [condOff(V + '080_guards.sql', "if tg_table_name = 'nodes' and exists (", 'if false and exists ( -- (planted)')] },
  // S-8 (CR-001, CR-003): factory.tenant_admins is written only by the founder's prepared step, never through an API
  { id: 'TAG', suite: 'schema', expect: ['E10b'], what: 'the tenant-admins guard no longer refuses a write that arrives through an API login', edits: [condOff(V + '080_guards.sql', "'factory.tenant_admins is written only by the founder''s provisioning step, never through an API');", "'the tenant-admins guard disabled (planted)') where false;")] },

  // ---- the pinned search_path of the guards and front doors, and the typed identity tests
  // SP / SPA / SPN / SPD set one function back to the empty search_path (and, for the guards, a ::text identity comparison); the
  // migration still commits (it no longer re-checks the pin itself: C10 and static R8 read it), and the named row must then fail.
  // (SPE is retired with factory._is_engine, which the migration no longer creates; SP and SPA plant the same defect in the two
  // engine tests that remain.)
  { id: 'SP', suite: 'schema', expect: ['L9'], what: 'the legacy guard pins the empty search_path and compares current_user::text: L9 must see a legacy write succeed', edits: [
    condOff(V + '080_guards.sql', '-- pinned: _legacy_guard', "language plpgsql set search_path = '' -- (planted) empty search_path"),
    condOff(V + '080_guards.sql', "if current_user = 'factory_owner'::pg_catalog.name then  -- the engine test of the legacy guard", "if current_user::text = 'factory_owner' then -- (planted) text comparison")] },
  { id: 'SPA', suite: 'schema', expect: ['L9b'], what: 'the authority guard pins the empty search_path and compares current_user::text: L9b must see an authority write succeed', edits: [
    condOff(V + '080_guards.sql', '-- pinned: _authority_guard', "language plpgsql set search_path = '' -- (planted) empty search_path"),
    condOff(V + '080_guards.sql', "if current_user <> 'factory_owner'::pg_catalog.name then  -- the engine test of the authority guard", "if current_user::text <> 'factory_owner' then -- (planted) text comparison")] },
  { id: 'SPN', suite: 'schema', expect: ['L11'], what: 'node_session_open pins the empty search_path: L11 must see the calling session\'s domain CHECK evaluated', edits: [
    condOff(V + '140_sessions.sql', '-- pinned: node_session_open', "language plpgsql volatile security definer set search_path = '' set lock_timeout = '15s' -- (planted) empty search_path")] },
  { id: 'SPD', suite: 'schema', expect: ['L11b'], what: 'admin_add_computer pins the empty search_path: L11b must see the calling session\'s domain CHECK evaluated', edits: [
    condOff(V + '210_admin_computers.sql', '-- pinned: admin_add_computer', "language plpgsql volatile security definer set search_path = '' set lock_timeout = '15s' -- (planted) empty search_path")] },
  { id: 'SPS', suite: 'schema', expect: ['C10'], what: 'one front door (admin_add_computer) pins the empty search_path: the read-back C10 must see it (static R8 reads the same from the source)', edits: [condOff(V + '210_admin_computers.sql', '-- pinned: admin_add_computer', "language plpgsql volatile security definer set search_path = '' set lock_timeout = '15s' -- (planted) empty search_path")] },
  { id: 'ENG', suite: 'schema', expect: ['C16'], what: 'the legacy guard\'s engine test compares current_user::text again, search_path still pinned: C16 must fail', edits: [condOff(V + '080_guards.sql', "if current_user = 'factory_owner'::pg_catalog.name then  -- the engine test of the legacy guard", "if current_user::text = 'factory_owner' then -- (planted) text comparison, search_path still pinned")] },
  { id: 'ENC', suite: 'schema', expect: ['C16'], what: 'the authority guard\'s engine test also reads CAST(current_user AS text) (no :: cast), search_path still pinned: C16 must fail', edits: [condOff(V + '080_guards.sql', "if current_user <> 'factory_owner'::pg_catalog.name then  -- the engine test of the authority guard", "if current_user <> 'factory_owner'::pg_catalog.name and cast(current_user as text) <> 'factory_owner' then -- (planted) CAST form")] },
  { id: 'ENS', suite: 'static', expect: ['R9'], what: 'the authority guard\'s engine test also reads CAST(current_user AS text): the static R9 must fail', edits: [condOff(V + '080_guards.sql', "if current_user <> 'factory_owner'::pg_catalog.name then  -- the engine test of the authority guard", "if current_user <> 'factory_owner'::pg_catalog.name and cast(current_user as text) <> 'factory_owner' then -- (planted) CAST form")] },

  // ---- the enrolled node-id namespace: no legacy write bears an id in it
  { id: 'F3', suite: 'schema', expect: ['L10'], what: 'the new-model test no longer treats an enrolled node id on an agent_runs row as new-model', edits: [condOff(V + '080_guards.sql', "or r->>'node_id' ~ enrolled_id or r->>'authoring_node_id' ~ enrolled_id or r->>'verification_node_id' ~ enrolled_id  -- enrolled node-id namespace (agent_runs)", 'or false -- (planted) agent_runs node-id rule removed')] },
  { id: 'F3L', suite: 'schema', expect: ['L10'], what: 'the new-model test no longer treats an enrolled node id on a surface_locks row as new-model', edits: [condOff(V + '080_guards.sql', "or r->>'node_id' ~ enrolled_id  -- enrolled node-id namespace (surface_locks): held in an enrolled node's name", 'or false -- (planted) surface_locks node-id rule removed')] },
  { id: 'F3N', suite: 'schema', expect: ['L10'], what: 'the new-model test no longer treats a nodes row under an id in the enrolled namespace as new-model (a node row could be written ahead of an enrollment)', edits: [condOff(V + '080_guards.sql', "or r->>'node_id' ~ enrolled_id  -- enrolled node-id namespace (nodes): before or after the enrollment", 'or false -- (planted) nodes node-id rule removed')] },
  { id: 'F3R', suite: 'schema', expect: ['L10g'], what: 'a lock is new-model through its run only when the run has a principal (the run\'s enrolled node id no longer counts)', edits: [condOff(V + '080_guards.sql', "and (x.principal_id is not null or x.node_id ~ enrolled_id))  -- enrolled node-id namespace (surface_locks): of an enrolled run", 'and (x.principal_id is not null)) -- (planted) run node-id no longer counts for a lock')] },
  { id: 'F3E', suite: 'enrollment', expect: ['EN20'], what: 'enrollment completion adopts a node row under the principal\'s node id that is not the principal\'s', edits: [condOff(V + '150_enrollment.sql', 'if exists (select 1 from factory.nodes n where n.node_id = prin.node_id and n.principal_id is distinct from prin.principal_id) then', 'if false then -- (planted) identity-conflict check removed')] },
  // ---- the legacy guard's base column lists equal factory._baseline_columns(): read back from the plane (C15) and from the source (R10)
  { id: 'GB', suite: 'schema', expect: ['C15'], what: 'a new-model column (principal_id) is added to the legacy guard\'s surface_locks base list: the read-back C15 must see the lists differ', edits: [condOff(V + '080_guards.sql', "when 'surface_locks' then array['surface', 'run_id', 'node_id', 'acquired_at', 'lease_expires_at']", "when 'surface_locks' then array['surface', 'run_id', 'node_id', 'acquired_at', 'lease_expires_at', 'principal_id']")] },
  { id: 'GB2', suite: 'schema', expect: ['C15'], what: 'the legacy guard\'s surface_locks base list is extended past its array (`array[...] || array[\'principal_id\']`): the read-back C15 must not find the arm in its one shape', edits: [condOff(V + '080_guards.sql', "when 'surface_locks' then array['surface', 'run_id', 'node_id', 'acquired_at', 'lease_expires_at']", "when 'surface_locks' then array['surface', 'run_id', 'node_id', 'acquired_at', 'lease_expires_at'] || array['principal_id']")] },
  { id: 'GBS', suite: 'static', expect: ['R10'], what: 'the same added column, read from the source: R10 must see the guard\'s list differ from part 000\'s reference list', edits: [condOff(V + '080_guards.sql', "when 'surface_locks' then array['surface', 'run_id', 'node_id', 'acquired_at', 'lease_expires_at']", "when 'surface_locks' then array['surface', 'run_id', 'node_id', 'acquired_at', 'lease_expires_at', 'principal_id']")] },
  { id: 'GB2S', suite: 'static', expect: ['R10'], what: 'the same arm extended past its array, read from the source: R10 must not find the arm in its one shape', edits: [condOff(V + '080_guards.sql', "when 'surface_locks' then array['surface', 'run_id', 'node_id', 'acquired_at', 'lease_expires_at']", "when 'surface_locks' then array['surface', 'run_id', 'node_id', 'acquired_at', 'lease_expires_at'] || array['principal_id']")] },
  // a 69df2f52 column retyped, renamed or dropped by a migration statement (the migration only adds to the 69df2f52 tables): static R11
  { id: 'BCT', suite: 'static', expect: ['R11'], what: 'a migration statement changes the type of a 69df2f52 column (nodes.max_heavy)', edits: [{ f: V + '990_finalize.sql', after: 'revoke create on schema factory from factory_owner;', add: 'alter table factory.nodes alter column max_heavy type bigint; -- (planted)' }] },
  { id: 'BCR', suite: 'static', expect: ['R11'], what: 'a migration statement renames a 69df2f52 column (work_orders.handoff), inside a DO block', edits: [{ f: V + '990_finalize.sql', after: 'revoke create on schema factory from factory_owner;', add: "do $p$ begin alter table factory.work_orders rename column handoff to handoff_v0; end $p$; -- (planted)" }] },
  { id: 'BCD', suite: 'static', expect: ['R11'], what: 'a migration statement drops a 69df2f52 column (agent_runs.summary) without the COLUMN keyword', edits: [{ f: V + '990_finalize.sql', after: 'revoke create on schema factory from factory_owner;', add: 'alter table factory.agent_runs drop summary; -- (planted)' }] },
  { id: 'BCX', suite: 'static', expect: ['R11'], what: 'a DO block drops a 69df2f52 column through a dynamic statement: format() with placeholders for the table and the column (nodes.platform)', edits: [{ f: V + '990_finalize.sql', after: 'revoke create on schema factory from factory_owner;', add: "do $p$ begin execute pg_catalog.format('alter table factory.%I drop column %I', 'nodes', 'platform'); end $p$; -- (planted)" }] },
  { id: 'BCY', suite: 'static', expect: ['R11'], what: 'a DO block retypes a 69df2f52 column through a dynamic statement, keeping every value (nodes.platform to varchar(4000)): no read-back row sees the type', edits: [{ f: V + '990_finalize.sql', after: 'revoke create on schema factory from factory_owner;', add: "do $p$ begin execute pg_catalog.format('alter table factory.%I alter column platform type varchar(4000)', 'nodes'); end $p$; -- (planted)" }] },
  // the reference list itself against the 69df2f52 referent: one column dropped from BOTH copies keeps R10 and C15 green
  { id: 'GBB', suite: 'static', expect: ['R12'], what: 'a 69df2f52 column (nodes.max_heavy) is dropped from part 000\'s reference list and from the legacy guard\'s copy alike: the two lists still agree (R10, C15), and R12 must see them differ from the referent', edits: [
    condOff(V + '000_preconditions_roles.sql', "        'agent_version', 'max_heavy']", "        'agent_version'] -- (planted) max_heavy dropped from the reference list"),
    condOff(V + '080_guards.sql', "        'agent_version', 'max_heavy']", "        'agent_version'] -- (planted) max_heavy dropped from the guard's copy")] },

  // ---- AC-14 / S-13: independence
  { id: 'IN', suite: 'independence', expect: ['(b)(c)', '(g)', '(j)', '(m)', '(n)'], what: 'independence reduced to run-only: an authoring identity may claim (gate 7) and certify (floor) its own candidate', edits: [
    condOff(V + '110_eligibility.sql', 'a where a.principal_id = p_ctx.principal_id) then', 'if false then -- (planted) S-13 identity gate removed'),
    condOff(V + '130_verification.sql', 'where s.principal_id = ctx.principal_id) then', 'elsif false then -- (planted) S-13 identity floor removed')] },
  { id: 'IN2', suite: 'independence', expect: ['(j)', '(j2)'], what: 'the authoring set reduced to the completing run (a taken-over author may verify)', edits: [condOff(V + '110_eligibility.sql', "where r.work_order_id = p_work_order and coalesce(r.run_kind, 'authoring') = 'authoring'", 'where r.run_id = p_candidate_run -- (planted) only the completing run')] },
  // the certification floor, one check at a time, reached past gate 7 ((k2), (h), (i2)); and gate 7's campaign checks alone
  { id: 'FLP', suite: 'independence', expect: ['(k2)'], what: 'the floor no longer refuses a candidate that is not the work order\'s current one', edits: [condOff(V + '130_verification.sql', "if w.current_candidate_run_id is distinct from v.verifies_run_id or w.verification_state <> 'VERIFICATION_CLAIMED' then", 'if false then -- (planted)')] },
  { id: 'FLR', suite: 'independence', expect: ['(k2)'], what: 'the floor no longer refuses a certifying run that is in the authoring set', edits: [condOff(V + '130_verification.sql', 'elsif exists (select 1 from factory._authoring_set(w.work_order_id, cand.run_id) s where s.run_id = vr.run_id) then', 'elsif false then -- (planted)')] },
  { id: 'FLI', suite: 'independence', expect: ['(k2)'], what: 'the floor no longer refuses an authoring identity (the gate kept)', edits: [condOff(V + '130_verification.sql', 'where s.principal_id = ctx.principal_id) then', 'elsif false then -- (planted)')] },
  { id: 'FLA', suite: 'independence', expect: ['(h)'], what: 'the floor no longer requires verifier authority in the CURRENT envelope', edits: [condOff(V + '130_verification.sql', "elsif not ('verifier' = any (ctx.authorized_roles)) then", 'elsif false then -- (planted)')] },
  { id: 'FLS', suite: 'independence', expect: ['(k2)'], what: 'the floor\'s campaign check of the same computer record removed (the fingerprint check kept)', edits: [condOff(V + '130_verification.sql', 'if exists (select 1 from factory._authoring_set(w.work_order_id, cand.run_id) s where s.computer_id = ctx.computer_id) then', 'if false then -- (planted)')] },
  { id: 'FLF', suite: 'independence', expect: ['(k2)'], what: 'the floor\'s campaign fingerprint check removed', edits: [condOff(V + '130_verification.sql', 'elsif factory._authoring_fingerprints(w.work_order_id, cand.run_id) && mine then', 'elsif false then -- (planted)')] },
  { id: 'FLC', suite: 'independence', expect: ['(k2)'], what: 'the floor applies no campaign check at all', edits: [condOff(V + '130_verification.sql', 'if why is null and phys then', 'if false then -- (planted)')] },
  { id: 'G7c', suite: 'independence', expect: ['(m)'], what: 'gate 7\'s campaign check of the same computer record removed (the floor kept)', edits: [condOff(V + '110_eligibility.sql', 'a where a.computer_id = p_ctx.computer_id) then', 'if false then -- (planted)')] },
  { id: 'G7p', suite: 'independence', expect: ['(i)(e)', '(p)', '(p2)'], what: 'gate 7\'s campaign fingerprint check removed (the floor kept)', edits: [condOff(V + '110_eligibility.sql', 'if fps && mine then', 'if false then -- (planted)')] },
  { id: 'CKG', suite: 'independence', expect: ['(i2)'], what: 'gate 7 reads a campaign with no policy row as the tenant default', edits: [condOff(V + '110_eligibility.sql', 'if not factory._campaign_known(p_ctx.tenant_id, camp) then', 'if false then -- (planted)')] },
  { id: 'CKF', suite: 'independence', expect: ['(i2)'], what: 'the certification reads a campaign with no policy row as the tenant default', edits: [condOff(V + '130_verification.sql', 'elsif not factory._campaign_known(w.tenant_id, w.campaign_key) then', 'elsif false then -- (planted)')] },
  // AC-14(p): every fingerprint ever reported counts, on both sides; an unknown one fails closed under the campaign
  { id: 'FPH', suite: 'independence', expect: ['(p2)'], what: 'the authoring side counts only its runs\' own fingerprints, not what its computers reported before', edits: [condOff(V + '110_eligibility.sql', 'union select unnest(factory._reported_fingerprints(a.computer_id)) from factory._authoring_set(p_work_order, p_candidate_run) a where a.computer_id is not null', 'union select null::text where false -- (planted)')] },
  { id: 'FPM', suite: 'independence', expect: ['(p2)'], what: 'the certifier side counts only the fingerprint of this call, not what its computer reported before', edits: [condOff(V + '110_eligibility.sql', 'select unnest(factory._reported_fingerprints(p_computer)) f', 'select null::text f where false -- (planted)')] },
  { id: 'FPN', suite: 'independence', expect: ['(p3)'], what: 'an unknown fingerprint under the campaign no longer refuses (gate and floor)', edits: [
    condOff(V + '110_eligibility.sql', 'if factory._fingerprint_unknown(p_wo.verifies_work_order_id, cand, mine) then', 'if false then -- (planted)'),
    condOff(V + '130_verification.sql', 'elsif factory._fingerprint_unknown(w.work_order_id, cand.run_id, mine) then', 'elsif false then -- (planted)')] },
  { id: 'FPA', suite: 'independence', expect: ['(p5)'], what: 'an author whose computer never reported a fingerprint no longer counts as unknown (the shared helper: gate 7 and the floor; the certifier side kept)', edits: [condOff(V + '110_eligibility.sql', 'or exists (select 1 from factory._authoring_set(p_work_order, p_candidate_run) a', 'or false and exists (select 1 from factory._authoring_set(p_work_order, p_candidate_run) a -- (planted)')] },
  { id: 'FLU', suite: 'independence', expect: ['(k3)'], what: 'the floor\'s own unknown-fingerprint check removed (gate 7 kept)', edits: [condOff(V + '130_verification.sql', 'elsif factory._fingerprint_unknown(w.work_order_id, cand.run_id, mine) then', 'elsif false then -- (planted)')] },
  { id: 'FPV', suite: 'independence', expect: ['(p4)'], what: 'the runtime\'s fingerprint varies per process (per install)', edits: [condOff('scripts/factory-runner/enrolled/identity.mjs', 'if (r && r.ok) { value = fingerprintOf(r.bytes); problem = null; return value; }', "if (r && r.ok) { value = fingerprintOf(Buffer.concat([r.bytes, Buffer.from(':' + process.pid)])); problem = null; return value; } // (planted)")] },
  // AC-16 / P-6 / P-10: after a refused resubmission the work order is in the queue again at once, the refusal named, its queue age kept
  { id: 'RSW', suite: 'independence', expect: ['(o3)'], what: 'a refused resubmission leaves the work order out of the queue (withheld from the next repair)', edits: [condOff(V + '120_node_lifecycle.sql', "update factory.work_orders set status = 'queued', updated_at = now(),", "update factory.work_orders set status = 'claimed', updated_at = now(), -- (planted)")] },
  { id: 'RSN', suite: 'independence', expect: ['(o3)'], what: 'a refused resubmission is not named on the work order', edits: [condOff(V + '120_node_lifecycle.sql', "verification_reason = 'resubmission refused: its content (tree '", 'verification_reason = verification_reason -- (planted)')] },
  { id: 'RQR', suite: 'independence', expect: ['(o3)'], what: 'a refused resubmission resets the work order\'s queue age', edits: [condOff(V + '120_node_lifecycle.sql', "update factory.work_orders set status = 'queued', updated_at = now(),", "update factory.work_orders set status = 'queued', queued_at = now(), updated_at = now(), -- (planted)")] },
  { id: 'RQF', suite: 'independence', expect: ['(o3)'], what: 'a FAIL resets the work order\'s queue age', edits: [condOff(V + '130_verification.sql', "set verification_state = 'VERIFICATION_FAILED', verification_state_at = now(), status = 'queued',", "set verification_state = 'VERIFICATION_FAILED', verification_state_at = now(), status = 'queued', queued_at = now(), -- (planted)")] },
  { id: 'CP', suite: 'independence', expect: ['(o2)'], what: 'a certification is not bound to its work order and exact candidate provenance', edits: [
    condOff(V + '130_verification.sql', "elsif (p_body ->> 'work_order_id') is distinct from w.work_order_id::text", "elsif false and ((p_body ->> 'work_order_id') is distinct from w.work_order_id::text -- (planted)"),
    condOff(V + '130_verification.sql', "or ((p_body ->> 'candidate_commit') is not null and (p_body ->> 'candidate_commit') is distinct from cand.head_commit) then", "or ((p_body ->> 'candidate_commit') is not null and (p_body ->> 'candidate_commit') is distinct from cand.head_commit)) then")] },

  // ---- P-2 / AC-9 / P-6: takeover keeps queue age; AC-5(g): every run and checkpoint stamped with the node's release
  { id: 'RQ', suite: 'takeover', expect: ['T11'], what: 'the takeover resets the work order\'s queue age', edits: [condOff(V + '120_node_lifecycle.sql', "set status = 'queued', updated_at = now()  -- queued_at is kept", "set status = 'queued', updated_at = now(), queued_at = now() -- (planted)")] },
  { id: 'RS1', suite: 'takeover', expect: ['T12'], what: 'a run is not stamped with its node\'s release', edits: [condOff(V + '120_node_lifecycle.sql', 'me.release_id, me.runtime_version, me.runtime_digest, coalesce(fp, me.machine_fingerprint), resume.checkpoint_id, p_ctx.tenant_id)', 'null, me.runtime_version, me.runtime_digest, coalesce(fp, me.machine_fingerprint), resume.checkpoint_id, p_ctx.tenant_id) -- (planted)')] },
  { id: 'RS2', suite: 'takeover', expect: ['T12'], what: 'a checkpoint is not stamped with its node\'s release', edits: [condOff(V + '120_node_lifecycle.sql', 'me.release_id, me.runtime_version, me.runtime_digest, ctx.tenant_id)', 'null, me.runtime_version, me.runtime_digest, ctx.tenant_id) -- (planted)')] },
  // ---- contract §1 r3: the machine fingerprint is the MachineGuid string exactly as stored
  { id: 'FPX', suite: 'installer', expect: ['I10'], what: 'the fingerprint upper-cases the stored MachineGuid', edits: [condOff('scripts/factory-runner/enrolled/identity.mjs', "return bytes ? createHash('sha256').update(bytes).digest('hex') : null;", "return bytes ? createHash('sha256').update(Buffer.from(bytes.toString('utf8').toUpperCase(), 'utf8')).digest('hex') : null; // (planted)")] },
  { id: 'FPL', suite: 'installer', expect: ['I10'], what: 'the fingerprint lower-cases the stored MachineGuid again', edits: [condOff('scripts/factory-runner/enrolled/identity.mjs', "return bytes ? createHash('sha256').update(bytes).digest('hex') : null;", "return bytes ? createHash('sha256').update(Buffer.from(bytes.toString('utf8').toLowerCase(), 'utf8')).digest('hex') : null; // (planted)")] },
  { id: 'FPS', suite: 'installer', expect: ['I10'], what: 'the fingerprint accepts only a 36-character GUID shape again', edits: [condOff('scripts/factory-runner/enrolled/identity.mjs', "return bytes ? createHash('sha256').update(bytes).digest('hex') : null;", "return bytes && /^[0-9a-fA-F-]{36}$/.test(bytes.toString('utf8')) ? createHash('sha256').update(bytes).digest('hex') : null; // (planted)")] },

  // ---- AC-8: pairing
  { id: 'PH', suite: 'enrollment', expect: ['EN9', 'EN19'], what: 'the code\'s HMAC is not compared: any secret with a live locator enrolls', edits: [condOff(V + '150_enrollment.sql', 'if code.pepper_version <> p_pepper_version or not factory._mac_equal(code.code_mac, p_mac) then', 'if false then -- (planted) HMAC not compared')] },
  { id: 'PC', suite: 'enrollment', expect: ['EN9'], what: 'the per-locator failure cap is 500 instead of 5', edits: [
    condOff(V + '150_enrollment.sql', "state = case when failed_attempts + 1 >= 5 then 'PAIRING_REVOKED' else state end,", "state = case when failed_attempts + 1 >= 500 then 'PAIRING_REVOKED' else state end,"),
    condOff(V + '150_enrollment.sql', 'revoked_at = case when failed_attempts + 1 >= 5 then start_at else revoked_at end,', 'revoked_at = case when failed_attempts + 1 >= 500 then start_at else revoked_at end,'),
    condOff(V + '150_enrollment.sql', "revoke_reason = case when failed_attempts + 1 >= 5 then 'attempts_exceeded' else revoke_reason end", "revoke_reason = case when failed_attempts + 1 >= 500 then 'attempts_exceeded' else revoke_reason end"),
    condOff(V + '150_enrollment.sql', 'if code.failed_attempts + 1 >= 5 then', 'if code.failed_attempts + 1 >= 500 then')] },
  { id: 'PD', suite: 'enrollment', expect: ['EN15'], what: 'the pairing secret generated deterministically (a counter, not the CSPRNG)', edits: [condOff(EDGE + 'pairing.ts', 'const r = randomBytes(LOCATOR_CHARS + SECRET_CHARS);', 'const r = Uint8Array.from({ length: LOCATOR_CHARS + SECRET_CHARS }, (_, i) => (i * 7 + (globalThis.__qaCounter = ((globalThis.__qaCounter || 0) + 1))) & 255); // (planted)')] },

  // ---- S-10: TLS verify-full to the Factory database
  { id: 'TL', suite: 'tls', expect: ['T2', 'T3b', 'T6'], what: 'the Edge connects with ssl: \'require\' again (verifies nothing)', edits: [condOff(EDGE + 'db.ts', 'ssl: { ca: caPem, rejectUnauthorized: true } };', "return { host, port, user, password, database, prepare: false, max: pool, idle_timeout: 20, connect_timeout: 10, ssl: 'require' }; // (planted)")] },
  { id: 'IP', suite: 'tls', expect: ['T3a'], what: 'an IP-literal database host is accepted (the certificate\'s name goes unchecked)', edits: [condOff(EDGE + 'db.ts', 'if (!host || ipv4 || ipv6) return', "if (!host) return no('the database URL does not parse'); // (planted)")] },
  // ---- C2-S1: the production project is refused on the target the driver is given, and the driver is given only what was read
  { id: "DTW", suite: "tls", expect: ["T6"], what: "the Node API entry point hands the database URL to the driver again (the driver reads it a second time, by its own rules)", edits: [condOff(EDGE_FN + 'factory-node-api/index.ts', "const db = refused ? null : postgres(dbOptions(dbUrl, caPem));", "const db = refused ? null : postgres(dbUrl, dbOptions(dbUrl, caPem)); // (planted)")] },
  { id: "DTWs", suite: "static", expect: ["P4"], what: "the Admin API entry point hands the database URL to the driver again", edits: [condOff(EDGE_FN + 'factory-admin-api/index.ts', "const db = refused ? null : postgres(dbOptions(dbUrl, caPem));", "const db = refused ? null : postgres(dbUrl, dbOptions(dbUrl, caPem)); // (planted)")] },
  { id: "DTE", suite: "tls", expect: ["T8"], what: "the production project is no longer refused on what was read (the decoded user, the host, the database), only on the text", edits: [condOff(EDGE + 'db.ts', "if (effective.toLowerCase().includes(PRODUCTION_REF)) return no(PRODUCTION);", "void effective; // (planted)")] },
  { id: "DTX", suite: "tls", expect: ["T5"], what: "the production project is no longer refused on the text (a ref in a part the form does not read is refused only as a malformed URL)", edits: [condOff(EDGE + 'db.ts', "if (url.toLowerCase().includes(PRODUCTION_REF)) return no(PRODUCTION);", "void 0; // (planted)")] },
  { id: "DTQ", suite: "tls", expect: ["T8"], what: "a query string is read past instead of refused (?user= and ?options= are what a pooler picks the project from)", edits: [condOff(EDGE + 'db.ts', "const parts = /^[a-z]+:", "const parts = /^[a-z]+:\\/\\/([^@/?#]*)@([^@/?#]*)\\/([^@/?#]*)(?:\\?.*)?$/i.exec(url); // (planted)")] },
  { id: "DTA", suite: "tls", expect: ["T9"], what: "a URL that is not printable ASCII on one line is no longer refused as such (a tab or a line break inside a name)", edits: [condOff(EDGE + 'db.ts', "if (!/^[\\x21-\\x7e]+$/.test(url)) return no(", "void 0; // (planted)")] },
  { id: "DTL", suite: "tls", expect: ["T7"], what: "the host is no longer taken in lower case", edits: [condOff(EDGE + 'db.ts', "const host = address[1].toLowerCase();", "const host = address[1]; // (planted)")] },
  { id: "DTU", suite: "tls", expect: ["T7"], what: "the user name is no longer decoded before it is judged and handed to the driver", edits: [condOff(EDGE + 'db.ts', "const user = unescaped(login[1]);", "const user = login[1]; // (planted)")] },
  { id: "DTP", suite: "tls", expect: ["T7"], what: "the password is no longer decoded before it is handed to the driver", edits: [condOff(EDGE + 'db.ts', "const password = unescaped(login[2]);", "const password = login[2]; // (planted)")] },
  { id: "DTC", suite: "tls", expect: ["T8", "T9"], what: "the decoded user name is no longer held to its characters (a user that still carries an escape after one decoding is accepted)", edits: [condOff(EDGE + 'db.ts', "if (!/^[A-Za-z0-9._-]+$/.test(user)) return no(", "void user; // (planted)")] },
  { id: "DTT", suite: "tls", expect: ["T8", "T9"], what: "dbOptions gives the driver options for a URL that was refused (without a target the driver takes one from its environment)", edits: [condOff(EDGE + 'db.ts', "if (read.target === null) throw new Error('no database connection: ' + read.why);", "if (read.target === null) return { prepare: false, max: pool, ssl: { ca: caPem, rejectUnauthorized: true } }; // (planted)")] },
  { id: "DTN", suite: "tls", expect: ["T9"], what: "only the dotted form of an IPv4 address is refused (one decimal number, hex and the short forms are read as names)", edits: [condOff(EDGE + 'db.ts', "const ipv4 = /^(0x[0-9a-f]*|[0-9]+)$/.test(host.slice(host.lastIndexOf('.') + 1));", "const ipv4 = /^\\d{1,3}(\\.\\d{1,3}){3}$/.test(host); // (planted)")] },
  { id: "DTD", suite: "tls", expect: ["T9"], what: "a missing port is defaulted instead of refused", edits: [condOff(EDGE + 'db.ts', "const address = /^(.*):([0-9]{1,5})$/.exec(parts[2]);", "const address = /^(.*):([0-9]{1,5})$/.exec(parts[2]) || [parts[2], parts[2], '5432']; // (planted)")] },

  // ---- AC-5: the release trust root (the runtime; these rows build Windows SEAs)
  { id: 'RU', suite: 'release', layer: 'refusal-name', expect: ['R-b'], what: 'an unsigned release is accepted', edits: [condOff('scripts/factory-runner/enrolled/release.mjs', "if (!m.signature || !m.key_id) return refuse('unsigned', 'the release is not signed');", 'if (false) return refuse(\'unsigned\', \'planted\'); // (planted)')] },
  { id: 'HS', suite: 'release', expect: ['R-t'], what: 'the supervisor no longer verifies itself first (a tampered supervisor goes on)', edits: [condOff('scripts/factory-runner/enrolled/supervisor.mjs', 'if (!sv.ok) {', 'if (false) { // (planted) the self-verification refusal skipped (its own digest kept)')] },
  { id: 'HO', suite: 'release', expect: ['R-i2'], what: 'the supervisor outlives a switch: no handoff, the logon task keeps the superseded exe', edits: [condOff('scripts/factory-runner/enrolled/supervisor.mjs', 'if (selfDigest && !standby && v.digest !== selfDigest && startSupervisor) {', 'if (false) { // (planted) no handoff')] },
  { id: 'RD', suite: 'release', expect: ['R-m', 'R-B5a'], what: 'a superseded release is installed without an admin adopt (a silent downgrade), through upgrade or setup', edits: [condOff('scripts/factory-runner/enrolled/upgrade.mjs', 'if (cur && semverCmp(v.version, cur.version) <= 0 && !adopted) {', 'if (false) { // (planted) anti-downgrade removed')] },
  // ---- AC-5 / S-5 / §3.10 (A8): every named refusal reached, and nothing received at run time in the trust decision. Each guard has a
  // fast function-level mutant (suite releaseunit) and, where the built artifact carries it, a mutant judged on the built artifacts
  { id: 'RSG', suite: 'release', layer: 'refusal-name', expect: ['R-bs1', 'R-bs2', 'R-bs3'], what: 'the release-signature check removed (a pinned key id with a signature that does not verify is accepted)', edits: [condOff(RT + 'release.mjs', "if (!sigOk) return refuse('bad_signature',", "if (false) return refuse('bad_signature', 'planted'); // (planted) signature check removed")] },
  { id: 'RSGu', suite: 'releaseunit', expect: ['U1'], what: 'the same, judged at function level', edits: [condOff(RT + 'release.mjs', "if (!sigOk) return refuse('bad_signature',", "if (false) return refuse('bad_signature', 'planted'); // (planted) signature check removed")] },
  { id: 'MK', suite: 'release', layer: 'refusal-name', expect: ['R-e2'], what: 'a key named by the manifest is used when its key id is not pinned', edits: [condOff(RT + 'release.mjs', 'const k = trust.keys.find((x) => x.key_id === m.key_id);', 'const k = trust.keys.find((x) => x.key_id === m.key_id) || (m.public_key ? { key_id: m.key_id, public_key: m.public_key } : null); // (planted) a manifest-named key')] },
  { id: 'MKu', suite: 'releaseunit', expect: ['U7'], what: 'the same, judged at function level', edits: [condOff(RT + 'release.mjs', 'const k = trust.keys.find((x) => x.key_id === m.key_id);', 'const k = trust.keys.find((x) => x.key_id === m.key_id) || (m.public_key ? { key_id: m.key_id, public_key: m.public_key } : null); // (planted) a manifest-named key')] },
  { id: 'DR', suite: 'release', expect: ['R-f/k', 'R-f2', 'R-k1', 'R-k3'], what: 'the dev-key refusal of a production-mode runtime removed', edits: [condOff(RT + 'release.mjs', "if (trust.mode !== 'dev' && KNOWN_DEV_KEY_IDS.includes(m.key_id)) return refuse('dev_key_on_production_channel',", "if (false) return refuse('dev_key_on_production_channel', 'planted'); // (planted) dev-key refusal removed")] },
  { id: 'DK', suite: 'releaseunit', expect: ['U2'], what: 'the dev-key refusal applies only when the dev key is outside the trust set (the 412ac14 order): a production set holding the dev entry verifies a dev signature', edits: [condOff(RT + 'release.mjs', "if (trust.mode !== 'dev' && KNOWN_DEV_KEY_IDS.includes(m.key_id)) return refuse('dev_key_on_production_channel',", "if (trust.mode !== 'dev' && KNOWN_DEV_KEY_IDS.includes(m.key_id) && !trust.keys.some((x) => x.key_id === m.key_id)) return refuse('dev_key_on_production_channel', 'planted'); // (planted) only when outside the set")] },
  { id: 'DKb', suite: 'releaseunit', expect: ['U5'], what: 'the build accepts a production trust set that holds a dev key', edits: [condOff('scripts/factory-build/build-sea.mjs', 'if (hit) throw new BuildError(EXIT.POLICY,', "if (false) throw new BuildError(EXIT.POLICY, 'planted'); // (planted) a dev key in production accepted")] },
  { id: 'DKd', suite: 'releaseunit', expect: ['U5'], what: 'the build accepts a dev trust set that holds a key that is not a dev key', edits: [condOff('scripts/factory-build/build-sea.mjs', 'if (foreign) throw new BuildError(EXIT.POLICY,', "if (false) throw new BuildError(EXIT.POLICY, 'planted'); // (planted) a foreign key in dev accepted")] },
  // WO-6 (the live trust set): a well-formed key the Director's WO-6 does not record, planted in the production trust source (a
  // throwaway public key; nobody holds its private half), and the build's strict reading of a production entry
  { id: 'TKu', suite: 'releaseunit', expect: ['U3'], what: 'trust/production.json holds a key the Director\'s WO-6 does not record', edits: [condOff(RT + 'trust/production.json', '"keys": [', '"keys": [{ "key_id": "ed25519:2a404456e1c8445158081f5778a0f22d26e0afc73adb79fc0cb3063cc1ed7872", "public_key": "MVtnSI7izIWWqnJpOYBeTv-D1_tiGRsf-4j0b4OR_UI" }]')] },
  { id: 'TKr', suite: 'release', expect: ['R-h'], what: 'the same, judged on the built production artifact: its trust set holds a key the Director\'s WO-6 does not record', edits: [condOff(RT + 'trust/production.json', '"keys": [', '"keys": [{ "key_id": "ed25519:2a404456e1c8445158081f5778a0f22d26e0afc73adb79fc0cb3063cc1ed7872", "public_key": "MVtnSI7izIWWqnJpOYBeTv-D1_tiGRsf-4j0b4OR_UI" }]')] },
  { id: 'TMb', suite: 'releaseunit', expect: ['U5b'], what: 'the build takes a production entry that is not bound to its public key', edits: [condOff('scripts/factory-build/build-sea.mjs', "if (raw.length !== 32 || k.key_id !== 'ed25519:' + sha256(raw)) throw new BuildError(EXIT.USAGE,", "if (false) throw new BuildError(EXIT.USAGE, 'planted'); // (planted) the binding of an entry is not checked")] },
  { id: 'TMr', suite: 'releaseunit', expect: ['U5b'], what: 'the build takes a production trust set in which a key id repeats', edits: [condOff('scripts/factory-build/build-sea.mjs', 'if (ids.has(k.key_id)) throw new BuildError(EXIT.USAGE,', "if (false) throw new BuildError(EXIT.USAGE, 'planted'); // (planted) a repeated key id accepted")] },
  { id: 'TMm', suite: 'releaseunit', expect: ['U5b'], what: 'the build takes a trust file whose mode is not its channel', edits: [condOff('scripts/factory-build/build-sea.mjs', 'if (t.channel !== channel || t.mode !== channel || !Array.isArray(t.keys)) throw new BuildError(EXIT.USAGE,', "if (!Array.isArray(t.keys)) throw new BuildError(EXIT.USAGE, 'trust/' + channel + '.json: keys an array (planted: the mode is not checked)');")] },
  { id: 'CM', suite: 'release', expect: ['R-cm'], what: 'the channel check removed (a production-channel release verifies on a dev runtime)', edits: [condOff(RT + 'release.mjs', "if (m.channel !== trust.channel) return refuse('channel_mismatch',", "if (false) return refuse('channel_mismatch', 'planted'); // (planted) channel check removed")] },
  { id: 'CMu', suite: 'releaseunit', expect: ['U6'], what: 'the same, judged at function level', edits: [condOff(RT + 'release.mjs', "if (m.channel !== trust.channel) return refuse('channel_mismatch',", "if (false) return refuse('channel_mismatch', 'planted'); // (planted) channel check removed")] },
  { id: 'MF', suite: 'release', expect: ['R-mf'], what: 'the malformed refusal skipped (a manifest without its receipt hash, or of another format version, goes on to the later checks)', edits: [condOff(RT + 'release.mjs', "return refuse('malformed',", 'void 0; // (planted) the malformed refusal skipped')] },
  { id: 'MFu', suite: 'releaseunit', expect: ['U6'], what: 'the same, judged at function level', edits: [condOff(RT + 'release.mjs', "return refuse('malformed',", 'void 0; // (planted) the malformed refusal skipped')] },
  { id: 'BD', suite: 'releaseunit', expect: ['U6'], what: 'a pinned entry is used although its key id is not the id of the public key it carries', edits: [condOff(RT + 'release.mjs', 'if (raw.length !== 32 || keyIdOf(raw) !== k.key_id) return refuse(', "if (raw.length !== 32) return refuse('key_outside_trust_set', 'planted'); // (planted) the binding is not checked")] },
  { id: 'NTu', suite: 'releaseunit', expect: ['U6'], what: 'a runtime that carries no trust set reads it as an empty one of the manifest\'s channel instead of refusing no_trust_set', edits: [condOff(RT + 'release.mjs', "if (!trust || !Array.isArray(trust.keys) || !trust.channel || !trust.mode) return refuse('no_trust_set',",
    "if (!trust || !Array.isArray(trust.keys) || !trust.channel || !trust.mode) trust = { channel: String((manifest || {}).channel), mode: 'production', keys: [] }; // (planted) no trust set read as an empty one")] },
  { id: 'RUV', suite: 'release', expect: ['R-ru', 'R-B5d'], what: 'the upgrade gate goes on when the plane does not answer, as if nothing were revoked (the list already stored decides)', edits: [condOff(RT + 'upgrade.mjs', "if (!hb.ok || !hb.revocations) return { ok: false, refused: 'revocations_unavailable',",
    "if (!hb.ok || !hb.revocations) hb = { ok: true, revocations: { key_ids: [], releases: [] }, adopted_release: null, published_releases: [] }; // (planted) no answer read as nothing revoked")] },
  { id: 'KE', suite: 'release', expect: ['R-k0', 'R-k1', 'R-k2', 'R-k3', 'R-k4'], what: 'the trust mode and keys are taken from the environment', edits: [condOff(RT + 'release.mjs', "const EMBEDDED_TRUST = typeof __TRUST__ !== 'undefined' ? __TRUST__ : null;",
    "const EMBEDDED_TRUST = ((t) => (t && process.env.BRAIN_FACTORY_TRUST_MODE === 'dev' ? { ...t, mode: 'dev', keys: [...t.keys, ...JSON.parse(process.env.BRAIN_FACTORY_TRUST_KEYS || '[]')] } : t))(typeof __TRUST__ !== 'undefined' ? __TRUST__ : null); // (planted) trust mode and keys from the environment")] },
  { id: 'KEu', suite: 'releaseunit', expect: ['U4'], what: 'the same, judged from the source structure', edits: [condOff(RT + 'release.mjs', "const EMBEDDED_TRUST = typeof __TRUST__ !== 'undefined' ? __TRUST__ : null;",
    "const EMBEDDED_TRUST = ((t) => (t && process.env.BRAIN_FACTORY_TRUST_MODE === 'dev' ? { ...t, mode: 'dev', keys: [...t.keys, ...JSON.parse(process.env.BRAIN_FACTORY_TRUST_KEYS || '[]')] } : t))(typeof __TRUST__ !== 'undefined' ? __TRUST__ : null); // (planted) trust mode and keys from the environment")] },
  { id: 'KC', suite: 'release', expect: ['R-k1'], what: 'setup verifies its release against a trust set named in the home\'s configuration file', edits: [condOff(RT + 'setup.mjs', 'const v = verifyRelease({ manifest, artifact, revocations: NO_REVOCATIONS });',
    'const v = verifyRelease({ manifest, artifact, revocations: NO_REVOCATIONS, ...((readJson(p.config) || {}).trust ? { trust: readJson(p.config).trust } : {}) }); // (planted) trust from the configuration file')] },
  { id: 'KCu', suite: 'releaseunit', expect: ['U4'], what: 'the same, judged from the source structure', edits: [condOff(RT + 'setup.mjs', 'const v = verifyRelease({ manifest, artifact, revocations: NO_REVOCATIONS });',
    'const v = verifyRelease({ manifest, artifact, revocations: NO_REVOCATIONS, ...((readJson(p.config) || {}).trust ? { trust: readJson(p.config).trust } : {}) }); // (planted) trust from the configuration file')] },
  { id: 'KX', suite: 'release', expect: ['R-k1'], what: 'setup verifies its release against a trust file beside the exe', edits: [condOff(RT + 'setup.mjs', 'const v = verifyRelease({ manifest, artifact, revocations: NO_REVOCATIONS });',
    "const v = verifyRelease({ manifest, artifact, revocations: NO_REVOCATIONS, ...(readJson(join(dirname(exe), 'trust.json')) ? { trust: readJson(join(dirname(exe), 'trust.json')) } : {}) }); // (planted) trust from a file beside the exe")] },
  { id: 'KA', suite: 'release', expect: ['R-k3'], what: 'upgrade verifies against a trust set the plane\'s answer names', edits: [
    condOff(RT + 'upgrade.mjs', 'return { ok: true, revocations, adopted_release: hb.adopted_release || null, published_releases: hb.published_releases };',
      'return { ok: true, revocations, adopted_release: hb.adopted_release || null, published_releases: hb.published_releases, trust: hb.trust || (hb.revocations && hb.revocations.trust) || null }; // (planted)'),
    condOff(RT + 'upgrade.mjs', 'const v = verifyRelease({ manifest, artifact: bytes, revocations: fresh.revocations });',
      'const v = verifyRelease({ manifest, artifact: bytes, revocations: fresh.revocations, ...(fresh.trust ? { trust: fresh.trust } : {}) }); // (planted) trust from the API answer')] },
  { id: 'KAu', suite: 'releaseunit', expect: ['U4'], what: 'the same, judged from the source structure', edits: [
    condOff(RT + 'upgrade.mjs', 'return { ok: true, revocations, adopted_release: hb.adopted_release || null, published_releases: hb.published_releases };',
      'return { ok: true, revocations, adopted_release: hb.adopted_release || null, published_releases: hb.published_releases, trust: hb.trust || (hb.revocations && hb.revocations.trust) || null }; // (planted)'),
    condOff(RT + 'upgrade.mjs', 'const v = verifyRelease({ manifest, artifact: bytes, revocations: fresh.revocations });',
      'const v = verifyRelease({ manifest, artifact: bytes, revocations: fresh.revocations, ...(fresh.trust ? { trust: fresh.trust } : {}) }); // (planted) trust from the API answer')] },
  { id: 'KS', suite: 'release', expect: ['R-k4'], what: 'the supervisor\'s start path verifies against a trust set named in the home\'s revocation file', edits: [condOff(RT + 'supervisor.mjs', 'const v = verifyRelease({ manifest, artifact: readFileSync(exe), revocations });',
    'const v = verifyRelease({ manifest, artifact: readFileSync(exe), revocations, ...(revocations && revocations.trust ? { trust: revocations.trust } : {}) }); // (planted) trust from the revocation file')] },
  { id: 'KSu', suite: 'releaseunit', expect: ['U4'], what: 'the same, judged from the source structure', edits: [condOff(RT + 'supervisor.mjs', 'const v = verifyRelease({ manifest, artifact: readFileSync(exe), revocations });',
    'const v = verifyRelease({ manifest, artifact: readFileSync(exe), revocations, ...(revocations && revocations.trust ? { trust: revocations.trust } : {}) }); // (planted) trust from the revocation file')] },
  { id: 'CT', suite: 'release', expect: ['R-n', 'R-n2', 'R-n3'], what: 'trust material read from the certificate table of the running exe', edits: [condOff(RT + 'release.mjs', "const EMBEDDED_TRUST = typeof __TRUST__ !== 'undefined' ? __TRUST__ : null;",
    "const EMBEDDED_TRUST = ((t) => { try { const b = process.getBuiltinModule('node:fs').readFileSync(process.execPath); const x = /BRAIN-FACTORY-TRUST (\\{[^\\n]*\\})/.exec(b.subarray(Math.max(0, b.length - 8192)).toString('latin1')); if (t && x) { const j = JSON.parse(x[1]); return { ...t, mode: j.mode || t.mode, keys: [...t.keys, ...(j.keys || [])] }; } } catch { /* planted */ } return t; })(typeof __TRUST__ !== 'undefined' ? __TRUST__ : null); // (planted) trust read from the certificate table")] },
  { id: 'CTu', suite: 'releaseunit', expect: ['U4'], what: 'the same, judged from the source structure', edits: [condOff(RT + 'release.mjs', "const EMBEDDED_TRUST = typeof __TRUST__ !== 'undefined' ? __TRUST__ : null;",
    "const EMBEDDED_TRUST = ((t) => { try { const b = process.getBuiltinModule('node:fs').readFileSync(process.execPath); const x = /BRAIN-FACTORY-TRUST (\\{[^\\n]*\\})/.exec(b.subarray(Math.max(0, b.length - 8192)).toString('latin1')); if (t && x) { const j = JSON.parse(x[1]); return { ...t, mode: j.mode || t.mode, keys: [...t.keys, ...(j.keys || [])] }; } } catch { /* planted */ } return t; })(typeof __TRUST__ !== 'undefined' ? __TRUST__ : null); // (planted) trust read from the certificate table")] },
  { id: 'CE', suite: 'release', expect: ['R-n2'], what: 'setup takes its endpoint from the certificate table when the build has none (the dev channel)', edits: [condOff(RT + 'setup.mjs', 'const api = o.api || (readJson(p.config) || {}).api || CHANNEL.default_api;',
    "const api = o.api || (readJson(p.config) || {}).api || CHANNEL.default_api || (/BRAIN-FACTORY-API (\\S+)/.exec(readFileSync(exe).subarray(-8192).toString('latin1')) || [])[1]; // (planted) the endpoint read from the certificate table")] },
  { id: 'TRB', suite: 'release', expect: ['R-h'], what: 'the exe\'s trust read-back hashes the public key\'s text instead of its 32 bytes', edits: [condOff(RT + 'release.mjs', "public_key_sha256: createHash('sha256').update(Buffer.from(k.public_key, 'base64url')).digest('hex') }))",
    "public_key_sha256: createHash('sha256').update(String(k.public_key)).digest('hex') })) }; // (planted) sha of the text")] },
  { id: 'TB', suite: 'release', expect: ['R-h'], what: 'build-info records the sha256 of the public key\'s text instead of its 32 bytes', edits: [condOff('scripts/factory-build/build-sea.mjs', "public_key_sha256: sha256(Buffer.from(k.public_key, 'base64url'))",
    "channel, trust: { channel: trust.channel, mode: trust.mode, keys: trust.keys.map((k) => ({ key_id: k.key_id, public_key_sha256: sha256(Buffer.from(String(k.public_key))) })) }, // (planted) sha of the text")] },
  { id: 'RRV', suite: 'release', expect: ['R-d'], what: 'the revoked-release refusal removed', edits: [condOff(RT + 'release.mjs', "return refuse('release_revoked',", "if (false) return refuse('release_revoked', 'planted'); // (planted)")] },
  { id: 'EX', suite: 'release', expect: ['R-a', 'R-b', 'R-e', 'R-bs1', 'R-f2', 'R-d'], what: 'upgrade runs the offered artifact before it is verified', edits: [condOff(RT + 'upgrade.mjs', 'const v = await gateOffer({ home, manifest: m, bytes });',
    "process.getBuiltinModule('node:child_process').spawnSync(artifact, ['version'], { windowsHide: true, timeout: 60000 }); const v = await gateOffer({ home, manifest: m, bytes }); // (planted) the offered artifact runs first")] },
  { id: 'EXP', suite: 'release', expect: ['R-f2'], what: 'the production-channel runtime\'s upgrade runs the offered artifact before it is verified (the dev channel\'s does not)', edits: [condOff(RT + 'upgrade.mjs', 'const v = await gateOffer({ home, manifest: m, bytes });',
    "if (typeof __CHANNEL__ !== 'undefined' && __CHANNEL__.channel === 'production') process.getBuiltinModule('node:child_process').spawnSync(artifact, ['version'], { windowsHide: true, timeout: 60000 }); const v = await gateOffer({ home, manifest: m, bytes }); // (planted) the production channel runs the offered artifact first")] },
  { id: 'NC', suite: 'release', expect: ['R-j0', 'R-c0'], what: 'the node never claims (R-j and R-c alone would still pass)', edits: [condOff(RT + 'worker.mjs', "const c = check(await api.op('claim', { work_types: [...CLAIM_TYPES]",
    'const c = { ok: true, claimed: null }; void fpv; // (planted) the node never claims')] },

  // ---- S-12 / B-3: no pairing code on a command line; a refusal shows no argument; setup's one input
  { id: 'CA', suite: 'installer', expect: ['I1'], what: 'the command line takes a pairing code again (--code refused no more, and mapped as an option)', edits: [
    condOff('scripts/factory-runner/sea/argv-guard.mjs', "if (a === '--code' || a.startsWith('--code=')) return CODE_REFUSAL;", "if (false) return CODE_REFUSAL; // (planted) --code no longer refused"),
    condOff('scripts/factory-runner/sea/main.mjs', "const VALUE_OPTIONS = { '--api': 'api',", "const VALUE_OPTIONS = { '--code': 'code', '--api': 'api', '--manifest': 'manifest', '--home': 'home', '--task-name': 'taskName', '--artifact': 'artifact' }; // (planted)")] },
  { id: 'CA2', suite: 'release', expect: ['R-B3d', 'R-B3p'], what: 'the same, judged on the built dev and production artifacts', edits: [
    condOff('scripts/factory-runner/sea/argv-guard.mjs', "if (a === '--code' || a.startsWith('--code=')) return CODE_REFUSAL;", "if (false) return CODE_REFUSAL; // (planted) --code no longer refused"),
    condOff('scripts/factory-runner/sea/main.mjs', "const VALUE_OPTIONS = { '--api': 'api',", "const VALUE_OPTIONS = { '--code': 'code', '--api': 'api', '--manifest': 'manifest', '--home': 'home', '--task-name': 'taskName', '--artifact': 'artifact' }; // (planted)")] },
  { id: 'AG', suite: 'installer', expect: ['I1'], what: 'an argument with the form of a pairing code is accepted as an option value (it names a home, a task, a manifest)', edits: [condOff('scripts/factory-runner/sea/argv-guard.mjs', 'if (pairingCodesIn(a).length) {', 'if (false) { // (planted) the code form no longer refused')] },
  { id: 'EC', suite: 'installer', expect: ['I1'], what: 'the unknown-command refusal shows the argument', edits: [condOff('scripts/factory-runner/sea/main.mjs', "process.stderr.write('REFUSED - the first argument is not a Brain Factory command (arguments are never shown). Commands: '", "process.stderr.write('REFUSED - ' + String(cmd) + ' is not a Brain Factory command\\n'); // (planted) the argument shown")] },
  { id: 'EC2', suite: 'static', expect: ['C2'], what: 'the same, read from the source', edits: [condOff('scripts/factory-runner/sea/main.mjs', "process.stderr.write('REFUSED - the first argument is not a Brain Factory command (arguments are never shown). Commands: '", "process.stderr.write('REFUSED - ' + String(cmd) + ' is not a Brain Factory command\\n'); // (planted) the argument shown")] },
  { id: 'EO', suite: 'installer', expect: ['I1'], what: 'the unknown-option refusal shows the argument', edits: [condOff('scripts/factory-runner/sea/main.mjs', "else throw new UsageRefusal('argument ' + (i + 1) + ' is not an option", "else throw new UsageRefusal('unknown option ' + a); // (planted) the argument shown")] },
  { id: 'YN', suite: 'installer', expect: ['I6', 'I7'], what: 'setup asks a second question (a confirmation) after the pairing code', edits: [{ f: 'scripts/factory-runner/enrolled/setup.mjs', after: "say('enrolling this computer as \"' + s.computer + '\" in \"' + s.tenant + '\"');",
    add: "  { const rl2 = createInterface({ input: input || process.stdin, output: output || process.stdout }); const a = await new Promise((ok) => { rl2.once('line', ok); rl2.once('close', () => ok('')); rl2.setPrompt('Enroll this computer? [y/N] '); rl2.prompt(); }); rl2.close(); if (!/^y/i.test(String(a))) { say('declined (planted)'); return { ok: false, exit: 8 }; } } // (planted) a second question" }] },
  { id: 'CL', suite: 'static', expect: ['C1'], what: 'a harness puts an issued pairing code on the setup command line', edits: [condOff('qa/factory/v1/runtime_acceptance.mjs', "const r = await run(exe, ['setup', '--api', W.node.baseUrl, '--home', home, '--task-name', task]", "const r = await run(exe, ['setup', '--code', add.pairing_code, '--api', W.node.baseUrl, '--home', home, '--task-name', task]); // (planted) the code on argv")] },
  { id: 'ON', suite: 'installer', expect: ['I1'], what: 'the argv guard stops reading O as 0 and I / L as 1: a code spelled that way, without dashes, passes as an option value', edits: [condOff('scripts/factory-runner/sea/argv-guard.mjs', ".replace(/O/g, '0').replace(/[IL]/g, '1');", "export const normalizeCodeForm = (s) => String(s).toUpperCase().replace(/[\\s-]/g, ''); // (planted) O / I / L no longer read as 0 / 1")] },
  { id: 'ON2', suite: 'static', expect: ['C4'], what: 'the same, judged against pairing.ts', edits: [condOff('scripts/factory-runner/sea/argv-guard.mjs', ".replace(/O/g, '0').replace(/[IL]/g, '1');", "export const normalizeCodeForm = (s) => String(s).toUpperCase().replace(/[\\s-]/g, ''); // (planted) O / I / L no longer read as 0 / 1")] },
  { id: 'EM', suite: 'installer', expect: ['I1'], what: 'the argv guard stops looking for a displayed code inside a longer argument (a path, a URL, a file name)', edits: [condOff('scripts/factory-runner/sea/argv-guard.mjs', 'for (const m of str.matchAll(DISPLAY_INSIDE)) candidates.push(m[0]);', 'void DISPLAY_INSIDE; // (planted) only whole arguments are looked at')] },
  { id: 'WP', suite: 'static', expect: ['C7'], what: 'the dev-channel command on the Computers page loses its .\\ (PowerShell does not run it as shown)', edits: [condOff('web/app/(app)/software-factory/computers/shared.tsx', 'font-mono text-xs">.\\BrainFactorySetup.exe setup --api', '              <code className="rounded bg-background/60 px-1 font-mono text-xs">BrainFactorySetup.exe setup --api {downloads.nodeApi ?? t("fc.code.nodeApiUnknown", "<this plane\'s Factory Node API URL>")}</code>.{" "}')] },
  { id: 'FV', suite: 'static', expect: ['C3'], what: 'the founder\'s pepper tool decides where it may write from an environment value again', edits: [{ f: 'qa/implementation/auto-enrollment-v1/tools/founder_secrets.mjs', after: 'export function placeRefusal(dir) {',
    add: "  if (process.env.OneDrive && resolve(String(dir)).toLowerCase().startsWith(resolve(process.env.OneDrive).toLowerCase())) return 'under OneDrive (planted)';" }] },
  { id: 'AL', suite: 'static', expect: ['C4'], what: 'the argv guard\'s code alphabet drifts from pairing.ts (L instead of Z)', edits: [condOff('scripts/factory-runner/sea/argv-guard.mjs', "export const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';", "export const ALPHABET = '0123456789ABCDEFGHJKLMNPQRSTVWXY'; // (planted)")] },
  // ---- L4-F4 (the page half): the Computers page lists the steps each channel's artifact needs
  { id: 'WS', suite: 'static', expect: ['C7'], what: 'the Computers page tells a dev-channel operator the production step (run it and enter the code), which that artifact cannot do', edits: [condOff('web/app/(app)/software-factory/computers/shared.tsx', '{downloads && downloads.channel !== "production" ? (', '{false ? ( // (planted) one step for every channel')] },
  // ---- L4-F7: https or loopback only
  { id: 'EP', suite: 'installer', expect: ['I3'], what: 'the node client accepts any endpoint (a cleartext network address receives the code and the tokens)', edits: [{ f: 'scripts/factory-runner/enrolled/api.mjs', after: "const refuse = (message) => ({ ok: false, refused: 'endpoint_refused', message });", add: '  return null; // (planted) every endpoint accepted' }] },
  // ---- L4-F6: DPAPI or nothing
  { id: 'KD', suite: 'installer', expect: ['I4', 'I7'], what: 'the node key is stored without DPAPI when DPAPI is unavailable (acl_only)', edits: [condOff('scripts/factory-runner/enrolled/keys.mjs', 'const r = await writeSecret(file, key.privateKeyDer, { requireDpapi: true, ...(dpapi ? { dpapi } : {}) });', 'const r = await writeSecret(file, key.privateKeyDer, { ...(dpapi ? { dpapi } : {}) }); // (planted) DPAPI no longer required')] },
  // ---- L4-F10: the locked toolchain
  { id: 'TK', suite: 'installer', expect: ['I5'], what: 'the build no longer compares its toolchain with package-lock.json', edits: [{ f: 'scripts/factory-build/build-sea.mjs', after: "const off = (name, why) => new BuildError(EXIT.USAGE, 'toolchain_off_lock: '",
    add: "  return LOCKED_TOOLS.map((name) => ({ name, version: lock.packages['node_modules/' + name].version, integrity: lock.packages['node_modules/' + name].integrity })); // (planted) nothing compared" }] },
  // ---- B-5: one gate for every release switch, setup included
  { id: 'GS', suite: 'release', expect: ['R-B5a', 'R-B5b', 'R-B5c', 'R-B5d'], what: 'setup on an enrolled home skips the upgrade gate (no fresh revocations, no anti-downgrade)', edits: [condOff('scripts/factory-runner/enrolled/setup.mjs', "const g = await gateOffer({ home, manifest, bytes: artifact, retries: 3, idlePhase: 'RECOVERING' });", "const g = { ...verifyRelease({ manifest, artifact, revocations: NO_REVOCATIONS }), same: false, current: readJson(p.current) }; // (planted) setup skips the gate")] },
  { id: 'GS2', suite: 'installer', expect: ['I6'], what: 'the same, read from the source', edits: [condOff('scripts/factory-runner/enrolled/setup.mjs', "const g = await gateOffer({ home, manifest, bytes: artifact, retries: 3, idlePhase: 'RECOVERING' });", "const g = { ...verifyRelease({ manifest, artifact, revocations: NO_REVOCATIONS }), same: false, current: readJson(p.current) }; // (planted) setup skips the gate")] },
  { id: 'GAS', suite: 'gate', expect: ['GA1'], what: 'the gate also accepts a downgrade that only the local status.json names as adopted', edits: [condOff('scripts/factory-runner/enrolled/upgrade.mjs', 'const g = releaseGate({ v, cur, plane: fresh });',
    "const g = releaseGate({ v, cur, plane: { ...fresh, adopted_release: fresh.adopted_release || (readJson(p.status) || {}).adopted_release || null } }); // (planted) the local record trusted")] },
  { id: 'GRT', suite: 'gate', expect: ['GA2'], what: 'the gate gives up on the first failed session opening or heartbeat (no retry)', edits: [condOff('scripts/factory-runner/enrolled/upgrade.mjs', 'if (!transient || attempt >= retries) break;', 'break; // (planted) never asked again')] },
  { id: 'GCU', suite: 'gate', expect: ['GA3'], what: 'upgrade switches although current.json moved after the gate', edits: [condOff('scripts/factory-runner/enrolled/upgrade.mjs', "if (!currentUnchanged(p, v.current)) return { ok: false, refused: 'current_changed',", 'void currentUnchanged; // (planted) a moved current.json goes unnoticed')] },
  { id: 'GCS', suite: 'gate', expect: ['GA4'], what: 'setup switches although current.json moved after the gate', edits: [condOff('scripts/factory-runner/enrolled/setup.mjs', 'if (!currentUnchanged(p, g.current)) {', 'if (false) { // (planted) a moved current.json goes unnoticed')] },
  { id: 'NR', suite: 'installer', expect: ['I8'], what: 'verifyRelease reads an omitted revocation list as "nothing revoked" again', edits: [condOff('scripts/factory-runner/enrolled/release.mjs', 'export function verifyRelease({ manifest, artifact = null, trust = EMBEDDED_TRUST, revocations }) {', 'export function verifyRelease({ manifest, artifact = null, trust = EMBEDDED_TRUST, revocations = { key_ids: [], releases: [] } }) { // (planted)')] },
  // ---- L6-3: the founder's generated secret, never displayed
  { id: 'FSP', suite: 'installer', expect: ['I9'], what: 'the founder\'s pepper tool prints the value it generates', edits: [condOff('qa/implementation/auto-enrollment-v1/tools/founder_secrets.mjs', "writeSync(fd, 'FACTORY_PAIRING_PEPPER=' + randomBytes(32).toString('base64')",
    "{ const v = randomBytes(32).toString('base64'); console.log(v); writeSync(fd, 'FACTORY_PAIRING_PEPPER=' + v + '\\n'); } // (planted) the value printed")] },
  { id: 'PK', suite: 'static', expect: ['C3'], what: 'the founder\'s prepared steps generate the pepper with console.log again', edits: [{ f: 'qa/implementation/auto-enrollment-v1/FOUNDER_PREPARED_STEPS.md', after: "| `BRAIN_OS_ANON_KEY` | the Brain OS project's public anon key |",
    add: "   | `FACTORY_PAIRING_PEPPER` | base64 of 32 random bytes: `node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"` |" }] },
  // the pepper's version is one constant of _shared/pairing.ts (static X1v): an entry point that reads it from the environment again
  { id: 'PVE', suite: 'static', expect: ['X1v'], what: 'the Node API entry point takes the pepper\'s version from FACTORY_PAIRING_PEPPER_VERSION again (a configured value can differ from the version the Admin API issues codes with)', edits: [condOff(EDGE_FN + 'factory-node-api/index.ts', 'pepper: async () => { const key = await pepperKey; return key ? { key, version: PEPPER_VERSION } : null; },',
    "pepper: async () => { const key = await pepperKey; return key ? { key, version: Number(Deno.env.get('FACTORY_PAIRING_PEPPER_VERSION') || '1') || 1 } : null; }, // (planted)")] },
  // ---- pairing under concurrency, the enrollment walk, every attempt recorded, the peer, the Edge's errors (L3-F3, L3-F6, L3-F7, L3-F9,
  // L2-F4/L3-F4, L2-F6, L7-02, L7-03, L7-04, L7-15, L7-26; S-12)
  { id: 'PKS', suite: 'pairing', expect: ['PC1', 'PC2', 'PC3'], what: 'the S-6 caps are counted with no serialization (both enrollment front doors take no key)', edits: [
    condOff(V + '150_enrollment.sql', 'perform factory._pairing_serialize(p_peer, ten);', 'null; -- (planted) no S-6 serialization (start)'),
    condOff(V + '150_enrollment.sql', 'perform factory._pairing_serialize(p_peer, ctenant);', 'null; -- (planted) no S-6 serialization (complete)')] },
  { id: 'PKP', suite: 'pairing', expect: ['PC1x'], what: 'the per-peer serialization key is dropped (the tenant key alone)', edits: [
    condOff(V + '150_enrollment.sql', "perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('factory.pairing.peer'), pg_catalog.hashtext(pg_catalog.host(p_peer)));", 'null; -- (planted) no per-peer key')] },
  { id: 'PKT', suite: 'pairing', expect: ['PC2'], what: 'the per-tenant serialization key is dropped (the peer key alone)', edits: [
    condOff(V + '150_enrollment.sql', "perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('factory.pairing.tenant'), pg_catalog.hashtext(p_tenant::text));", 'null; -- (planted) no per-tenant key')] },
  { id: 'PKF', suite: 'pairing', expect: ['PC8'], what: 'complete takes the S-6 keys before its row locks (a key held across a row wait)', edits: [
    condOff(V + '150_enrollment.sql', 'perform factory._pairing_serialize(p_peer, ctenant);', 'null; -- (planted) moved'),
    { f: V + '150_enrollment.sql', after: 'ctenant := coalesce(e0.tenant_id, factory._operator_tenant());', add: '    perform factory._pairing_serialize(p_peer, ctenant); -- (planted) the keys before the row locks' }] },
  { id: 'LOE', suite: 'pairing', expect: ['PC4'], what: 'complete locks its enrollment before the computer (the pre-change order: enrollment, then code, then computer)', edits: [
    condOff(V + '150_enrollment.sql', 'select x.* into e0 from factory.enrollments x where x.enrollment_id = p_enrollment;', 'select x.* into e0 from factory.enrollments x where x.enrollment_id = p_enrollment for update; -- (planted) the enrollment first')] },
  { id: 'LOS', suite: 'static', expect: ['PA3'], what: 'the same lock order, read from the source', edits: [
    condOff(V + '150_enrollment.sql', 'select x.* into e0 from factory.enrollments x where x.enrollment_id = p_enrollment;', 'select x.* into e0 from factory.enrollments x where x.enrollment_id = p_enrollment for update; -- (planted) the enrollment first')] },
  { id: 'CKN', suite: 'pairing', expect: ['PC5'], what: 'the consume judges expiry at the transaction\'s start (now()), before its lock waits', edits: [
    condOff(V + '150_enrollment.sql', 'consume_at := pg_catalog.clock_timestamp();', 'consume_at := now(); -- (planted)')] },
  { id: 'CCB', suite: 'pairing', expect: ['PC6'], what: 'the code-consumed refusal is removed (a second complete of a consumed code falls through)', edits: [
    condOff(V + '150_enrollment.sql', "if code.state = 'PAIRING_CONSUMED' then", 'if false then -- (planted) no consumed branch')] },
  { id: 'ALD', suite: 'pairing', expect: ['PC4'], what: 'the principal_enrolled refusal of issue-code writes no audit row', edits: [
    condOff(V + '210_admin_computers.sql', "perform factory._audit(m.tenant_id, 'admin', (a.ctx).actor::text, 'admin.issue_code', 'computer', m.computer_id::text, 'refused', 'principal_enrolled', jsonb_build_object('computer_id', m.computer_id, 'principal_id', pid));", 'null; -- (planted) not audited')] },
  { id: 'AFU', suite: 'pairing', expect: ['PC7'], what: 'the admin computer lock is FOR UPDATE again (a node call\'s foreign-key check then waits on it while holding its credential)', edits: [
    condOff(V + '200_admin_common.sql', 'select x.* into m from factory.computers x where x.computer_id = p_computer and x.tenant_id = p_ctx.tenant_id for no key update;', 'select x.* into m from factory.computers x where x.computer_id = p_computer and x.tenant_id = p_ctx.tenant_id for update; -- (planted)')] },
  { id: 'AFS', suite: 'static', expect: ['PA3'], what: 'the same lock strength, read from the source', edits: [
    condOff(V + '200_admin_common.sql', 'select x.* into m from factory.computers x where x.computer_id = p_computer and x.tenant_id = p_ctx.tenant_id for no key update;', 'select x.* into m from factory.computers x where x.computer_id = p_computer and x.tenant_id = p_ctx.tenant_id for update; -- (planted)')] },
  { id: 'RFW', suite: 'pairing', expect: ['PC7'], what: 'a node call\'s fingerprint record writes the computers row again, under its credential lock', edits: [
    { f: V + '120_node_lifecycle.sql', after: 'on conflict (computer_id, fingerprint) do update set last_reported_at = now();', add: '    update factory.computers set registered_fingerprint = p_fp where computer_id = p_ctx.computer_id and registered_fingerprint is null; -- (planted)' }] },
  { id: 'RXL', suite: 'pairing', expect: ['PC7'], what: 'node_register takes no computer lock before its credential (FOR KEY SHARE, which an admin lock does not exclude)', edits: [
    condOff(V + '120_node_lifecycle.sql', '       for no key update;', '       for key share; -- (planted)')] },
  { id: 'AUA', suite: 'enrollment', expect: ['EN23'], what: 'the complete-time refusals of server state (archived computer or changed envelope; an active credential) write no attempt row', edits: [
    condOff(V + '150_enrollment.sql', "perform factory._attempt(ctenant, p_peer, 'complete', code.locator, code.code_id, 'code_revoked');", 'null; -- (planted)'),
    condOff(V + '150_enrollment.sql', "perform factory._attempt(ctenant, p_peer, 'complete', code.locator, code.code_id, 'principal_has_active_credential');", 'null; -- (planted)')] },
  { id: 'AUS', suite: 'static', expect: ['PA1'], what: 'the same, read from the source', edits: [
    condOff(V + '150_enrollment.sql', "perform factory._attempt(ctenant, p_peer, 'complete', code.locator, code.code_id, 'principal_has_active_credential');", 'null; -- (planted)')] },
  { id: 'PPA', suite: 'enrollment', expect: ['PE1', 'PE2', 'PE3'], what: 'a request with no usable peer is refused without its attempt row', edits: [
    condOff(V + '150_enrollment.sql', "perform factory._attempt(ten, null, 'start', p_locator, seen, 'peer_unavailable');", 'null; -- (planted)'),
    condOff(V + '150_enrollment.sql', "perform factory._attempt(ctenant, null, 'complete', null, e0.code_id, 'peer_unavailable');", 'null; -- (planted)')] },
  { id: 'PPS', suite: 'static', expect: ['PA1'], what: 'the same, read from the source', edits: [
    condOff(V + '150_enrollment.sql', "perform factory._attempt(ten, null, 'start', p_locator, seen, 'peer_unavailable');", 'null; -- (planted)')] },
  { id: 'AEE', suite: 'enrollment', expect: ['EN22'], what: 'the Edge answers its own refusals of the enrollment routes without calling the front door (no attempt row)', edits: [
    { f: EDGE + 'enroll.ts', after: "const meta = refusal ? '{}' : JSON.stringify({ fingerprint: body.fingerprint ?? null, hostname: body.hostname ?? null });", add: '    if (refusal) return answer(refusal); // (planted)' },
    condOff(EDGE + 'enroll.ts', 'const res = await frontDoor(deps, route, [eid, refusal ? null : thumb, refusal ? null : challenge, address, refusal ? refusal.refused : null]);', 'if (refusal) return answer(refusal); const res = await frontDoor(deps, route, [eid, thumb, challenge, address, null]); // (planted)')] },
  { id: 'ATR', suite: 'enrollment', expect: ['EN24'], what: 'an attempt on a no-longer-live locator is no longer attributed to its code\'s tenant', edits: [
    condOff(V + '150_enrollment.sql', 'ten := coalesce(code.tenant_id, past.tenant_id, latest.tenant_id, op);', 'ten := coalesce(code.tenant_id, past.tenant_id, op); -- (planted)'),
    condOff(V + '150_enrollment.sql', 'seen := coalesce(code.code_id, past.code_id, latest.code_id);', 'seen := coalesce(code.code_id, past.code_id); -- (planted)'),
    condOff(V + '150_enrollment.sql', "when latest.code_id is not null then 'bad_code_not_live' else 'unknown_locator' end);", "else 'unknown_locator' end); -- (planted)")] },
  { id: 'TRG', suite: 'enrollment', expect: ['EN21'], what: 'the enrollment transition log is not attached (the walk is written only where a statement writes it)', edits: [
    condOff(V + '080_guards.sql', 'create trigger factory_v1_d_transition_log after insert or update of state on factory.enrollments', '-- (planted) no transition log'),
    condOff(V + '080_guards.sql', 'for each row execute function factory._enrollment_transition_log();', '-- (planted)')] },
  { id: 'TAS', suite: 'static', expect: ['PA2'], what: 'an enrollment state update that names no actor', edits: [
    condOff(V + '120_node_lifecycle.sql', 'update factory.enrollments set state = p_to, state_actor = p_actor, state_reason = left(p_reason, 200), state_at = now()', 'update factory.enrollments set state = p_to, state_reason = left(p_reason, 200), state_at = now() -- (planted)')] },
  { id: 'CEX', suite: 'enrollment', expect: ['EN25'], what: 'an enrollment whose challenge window ended expires its code too (before the code\'s TTL)', edits: [
    condOff(V + '150_enrollment.sql', "if code.state = 'PAIRING_REVOKED' or code.state = 'PAIRING_EXPIRED' or code.expires_at <= consume_at then", "if code.state = 'PAIRING_REVOKED' or code.state = 'PAIRING_EXPIRED' or code.expires_at <= consume_at or e.challenge_expires_at <= consume_at then -- (planted)")] },
  { id: 'RSE', suite: 'eligibility', expect: ['RS1'], what: 'the Node API accepts any resources object (the Edge layer alone reverted)', edits: [
    condOff(EDGE + 'node_api.ts', ": t === 'res' ? resourcesOk(v)", ": t === 'res' ? !!v && typeof v === 'object' // (planted)")] },
  { id: 'RSQ', suite: 'eligibility', expect: ['RS1'], what: 'the front doors accept any resources object (the SQL layer alone reverted)', edits: [
    condOff(V + '100_node_common.sql', "when jsonb_typeof(p_body) is distinct from 'object' or not (p_body ? 'resources') or jsonb_typeof(p_body -> 'resources') = 'null' then null", 'when true then null -- (planted)')] },
  { id: 'RKC', suite: 'eligibility', expect: ['RS2'], what: 'the ranking casts a peer\'s reported cpu_pct unchecked', edits: [
    condOff(V + '110_eligibility.sql', "coalesce(100 - (select factory._num(r, 'cpu_pct') from res), 0),", "coalesce(100 - (select (r ->> 'cpu_pct')::numeric from res), 0), -- (planted)")] },
  { id: 'RGC', suite: 'eligibility', expect: ['RS3'], what: 'gate 12 casts a peer\'s reported resource unchecked', edits: [
    condOff(V + '110_eligibility.sql', "if coalesce(factory._num(res, case k when 'ram_mb' then 'ram_free_mb' when 'disk_mb' then 'disk_free_mb' else 'cpu_cores' end), -1)", "if coalesce((res ->> (case k when 'ram_mb' then 'ram_free_mb' when 'disk_mb' then 'disk_free_mb' else 'cpu_cores' end))::numeric, -1) -- (planted)")] },
  { id: 'SGV', suite: 'enrollment', expect: ['SE1'], what: 'the session exchange does not verify the assertion\'s signature', edits: [
    condOff(EDGE + 'node_api.ts', "if (!(await ed25519Verify(pk, sig, payloadBytes))) return refuse(401, 'bad_signature', 'the assertion signature does not verify');", "if (false) return refuse(401, 'bad_signature', 'x'); // (planted)")] },
  { id: 'SAD', suite: 'enrollment', expect: ['SE3'], what: 'the session exchange does not check the audience', edits: [condOff(V + '140_sessions.sql', "if p_audience is distinct from 'factory-node-api' then", 'if false then -- (planted)')] },
  { id: 'SXP', suite: 'enrollment', expect: ['SE4'], what: 'the session exchange does not check the assertion\'s lifetime', edits: [
    condOff(V + '140_sessions.sql', "if p_exp <= t_open or p_exp - p_iat > interval '60 seconds' or p_exp <= p_iat or p_iat > t_open + interval '120 seconds' then", 'if false then -- (planted)')] },
  { id: 'SJT', suite: 'enrollment', expect: ['SE5'], what: 'the session exchange accepts a replayed jti', edits: [condOff(V + '140_sessions.sql', 'if inserted = 0 then', 'if false then -- (planted)')] },
  { id: 'SU1', suite: 'schema', expect: ['C20'], what: 'the node session check does not refuse a superuser', edits: [condOff(V + '100_node_common.sql', 'perform factory._refuse_superuser();   -- S-10: every node operation', 'null; -- (planted)')] },
  { id: 'SU2', suite: 'schema', expect: ['C20'], what: 'the session exchange does not refuse a superuser', edits: [condOff(V + '140_sessions.sql', 'perform factory._refuse_superuser();', 'null; -- (planted)')] },
  { id: 'SU3', suite: 'schema', expect: ['C20'], what: 'enroll/start does not refuse a superuser', edits: [condOff(V + '150_enrollment.sql', 'perform factory._refuse_superuser();   -- S-10 (enroll/start)', 'null; -- (planted)')] },
  { id: 'SU4', suite: 'schema', expect: ['C20'], what: 'enroll/complete does not refuse a superuser', edits: [condOff(V + '150_enrollment.sql', 'perform factory._refuse_superuser();   -- S-10 (enroll/complete)', 'null; -- (planted)')] },
  { id: 'SU5', suite: 'schema', expect: ['C20'], what: 'the admin check does not refuse a superuser', edits: [condOff(V + '200_admin_common.sql', 'perform factory._refuse_superuser();', 'null; -- (planted)')] },
  { id: 'SU6', suite: 'schema', expect: ['C20'], what: 'GET /v1/time does not refuse a superuser', edits: [condOff(V + '100_node_common.sql', 'perform factory._refuse_superuser();   -- S-10: GET /v1/time too', 'null; -- (planted)')] },
  { id: 'S7N', suite: 'schema', expect: ['C18'], what: 'an extra node_* operation granted to the Node API role: the read-back C18 must see the role execute a function outside the S-7 list', edits: [
    { f: V + '190_node_grants.sql', after: '  to factory_node_api;', add: "create function factory.node_debug() returns jsonb language sql security definer set search_path = pg_catalog, pg_temp as $d$ select '{}'::jsonb $d$; grant execute on function factory.node_debug() to factory_node_api; -- (planted)" }] },
  { id: 'S7A', suite: 'schema', expect: ['C19'], what: 'an extra admin_* function granted to the Admin API role: the read-back C19 must see the role execute a function outside ADMIN_OPS', edits: [
    { f: V + '290_admin_grants.sql', after: '  to factory_admin_api;', add: "create function factory.admin_debug(p_actor uuid, p_live_role text, p_body jsonb) returns jsonb language sql security definer set search_path = pg_catalog, pg_temp as $d$ select '{}'::jsonb $d$; grant execute on function factory.admin_debug(uuid, text, jsonb) to factory_admin_api; -- (planted)" }] },
  { id: 'PRP', suite: 'enrollment', expect: ['PE1', 'PE3'], what: 'peerOf hands on the runtime\'s value unchecked', edits: [
    condOff(EDGE + 'peer.ts', 'return { address: canonicalAddress(hostname) };', 'return { address: (info as any).remoteAddr.hostname }; // (planted)')] },
  { id: 'BTK', suite: 'enrollment', expect: ['EN26'], what: 'the session token\'s raw bytes are stored instead of its SHA-256', edits: [
    condOff(EDGE + 'node_api.ts', 'const tokenHash = hex(await sha256(enc.encode(token)));', 'const tokenHash = hex(b64u.dec(token)!); // (planted)')] },
  { id: 'GS5', suite: 'static', expect: ['G5'], what: 'the Node API entry point reads the peer itself again, around withPeer', edits: [
    condOff(EDGE.replace('_shared/', '') + 'factory-node-api/index.ts', 'return serveNode(req, info);', "const addr = info.remoteAddr as Deno.NetAddr; return handler(req, { address: addr && addr.hostname ? addr.hostname : '' }); // (planted)")] },
  { id: 'G6C', suite: 'static', expect: ['G6'], what: 'a Brain OS answer that is not JSON becomes "no user" again (an error turned into a decision)', edits: [
    condOff(EDGE + 'admin_api.ts', 'const user = await u.json();   // not JSON: the error goes to the request boundary', 'const user = await u.json().catch(() => null); // (planted)')] },
  { id: 'G4S', suite: 'static', expect: ['G4'], what: 'a SQL 503 refusal that the gate inventory does not classify', edits: [
    condOff(V + '150_enrollment.sql', "if p_refusal = 'pepper_unavailable' then", "if p_refusal = 'pepper_unavailable' then return factory._refusal('planted_gate', 503, 'x'); -- (planted)")] },
  { id: 'EBU', suite: 'edge', expect: ['EB1'], what: 'a Brain OS error status is "not authenticated" again', edits: [
    condOff(EDGE + 'admin_api.ts', "if (u.status !== 200) throw brainOsUnavailable('/auth/v1/user ' + u.status);", 'if (u.status !== 200) return null; // (planted)')] },
  { id: 'EBJ', suite: 'edge', expect: ['EB2'], what: 'a Brain OS body that is not JSON is "no user" again', edits: [
    condOff(EDGE + 'admin_api.ts', 'const user = await u.json();   // not JSON: the error goes to the request boundary', 'const user = await u.json().catch(() => null); // (planted)'),
    condOff(EDGE + 'admin_api.ts', "if (!id) throw brainOsUnavailable('/auth/v1/user without a user id');", 'if (!id) return null; // (planted)')] },
  { id: 'EBP', suite: 'edge', expect: ['EB3'], what: 'a profiles error status is "no live role" again (not_authorized)', edits: [
    condOff(EDGE + 'admin_api.ts', "if (p.status !== 200) throw brainOsUnavailable('/rest/v1/profiles ' + p.status);", 'if (p.status !== 200) return { userId: id, role: null }; // (planted)')] },
  { id: 'EBC', suite: 'edge', expect: ['EB6'], what: 'a WebCrypto failure is "the signature does not verify" again', edits: [
    condOff(EDGE + 'node_api.ts', "const key = await crypto.subtle.importKey('raw', own(publicKey), { name: 'Ed25519' }, false, ['verify']);", "try { const key = await crypto.subtle.importKey('raw', own(publicKey), { name: 'Ed25519' }, false, ['verify']); // (planted)"),
    condOff(EDGE + 'node_api.ts', "return await crypto.subtle.verify({ name: 'Ed25519' }, key, own(signature), own(message));", "return await crypto.subtle.verify({ name: 'Ed25519' }, key, own(signature), own(message)); } catch { return false; } // (planted)")] },
  // ---- the A5 verifier follow-up: the lease default, the boundary's SQLSTATE, the clock reads after a lock wait, node_register's order,
  // the pepper's name before the caps
  { id: 'LSD', suite: 'eligibility', expect: ['LS1'], what: 'the lease default is applied after the bounds again (least/greatest skip the null: 600 s instead of 120 s)', edits: [
    condOff(V + '120_node_lifecycle.sql', "as $$ select greatest(5, least(600, coalesce(factory._jint(p_body, 'lease_seconds'), 120))) $$;", "as $$ select coalesce(greatest(5, least(600, factory._jint(p_body, 'lease_seconds'))), 120) $$; -- (planted)")] },
  { id: 'EBS', suite: 'edge', expect: ['EB7'], what: 'the request boundary reads any five-capital error code as the server\'s SQLSTATE again (a transport EPIPE becomes "nothing changed")', edits: [
    condOff(EDGE + 'db.ts', "if (!(e instanceof Error) || e.name !== 'PostgresError') return null;", "if (!e || typeof e !== 'object') return null; // (planted)"),
    condOff(EDGE + 'db.ts', "const fromServer = typeof x.severity === 'string' || typeof x.severity_local === 'string';", 'const fromServer = true; // (planted)')] },
  { id: 'SOT', suite: 'pairing', expect: ['PC9'], what: 'the session exchange judges the assertion\'s lifetime at the transaction\'s start (now()), before its credential wait', edits: [
    condOff(V + '140_sessions.sql', 't_open := pg_catalog.clock_timestamp();', 't_open := now(); -- (planted)')] },
  { id: 'NSR', suite: 'pairing', expect: ['PC9'], what: 'a node call does not judge its session\'s expiry again after the credential wait', edits: [
    condOff(V + '100_node_common.sql', 'if r.refusal is null and s.expires_at <= pg_catalog.clock_timestamp() then', 'if false then -- (planted)')] },
  { id: 'SST', suite: 'pairing', expect: ['PC9'], what: 'enroll/start judges the code\'s TTL at the transaction\'s start (now()), before its lock wait', edits: [
    condOff(V + '150_enrollment.sql', 'start_at := pg_catalog.clock_timestamp();', 'start_at := now(); -- (planted)')] },
  { id: 'SU7', suite: 'pairing', expect: ['PC10'], what: 'node_register leaves the superuser refusal to _node_session (after its computer lock)', edits: [
    condOff(V + '120_node_lifecycle.sql', 'perform factory._refuse_superuser();   -- S-10 (register)', 'null; -- (planted)')] },
  { id: 'RXE', suite: 'pairing', expect: ['PC10'], what: 'node_register locks the computer of any session its token names, an ended one included', edits: [
    condOff(V + '120_node_lifecycle.sql', "where s.token_hash = p_token_hash and s.revoked_at is null and s.expires_at > now() and c.status = 'active')", 'where s.token_hash = p_token_hash) -- (planted)')] },
  { id: 'PUC', suite: 'enrollment', expect: ['PU1'], what: 'pepper_unavailable is judged after the caps (a 429 in place of the cause)', edits: [
    condOff(V + '150_enrollment.sql', "if p_refusal = 'pepper_unavailable' then", "if false then -- (planted) moved after the caps"),
    { f: V + '150_enrollment.sql', after: '-- 6. a request the Edge refused: recorded under its own name',
      add: "    if p_refusal = 'pepper_unavailable' then perform factory._attempt(ten, p_peer, 'start', p_locator, seen, 'pepper_unavailable'); return factory._refusal('pepper_unavailable', 503, 'planted'); end if; -- (planted)" }] },
  // ---- the enrolled runtime (A7): the fingerprint's exact encoding, the revocation union, the lease guard's durations, the instance
  // pipes, the recovery of a rotation or an enrollment whose answer was lost, the one ranked pick, exact side-effect counts, isolation
  { id: 'UFL', suite: 'units', expect: ['FP1'], what: 'the fingerprint hashes the MachineGuid lower-cased (not exactly as stored)', edits: [
    condOff(RT + 'identity.mjs', "return bytes ? createHash('sha256').update(bytes).digest('hex') : null;", "return bytes ? createHash('sha256').update(Buffer.from(bytes.toString('utf8').toLowerCase(), 'utf8')).digest('hex') : null; // (planted)")] },
  { id: 'UFE', suite: 'units', expect: ['FP3'], what: 'the fingerprint hashes a value\'s Latin-1 bytes instead of its UTF-8 bytes', edits: [
    condOff(RT + 'identity.mjs', "const bytes = typeof value === 'string' ? Buffer.from(value, 'utf8') : Buffer.isBuffer(value) ? value : null;", "const bytes = typeof value === 'string' ? Buffer.from(value, 'latin1') : Buffer.isBuffer(value) ? value : null; // (planted)")] },
  { id: 'UFU', suite: 'units', expect: ['FP4'], what: 'the registry reader sends the value\'s UTF-16 bytes instead of its UTF-8 bytes', edits: [
    condOff(RT + 'identity.mjs', "[Text.Encoding]::UTF8.GetBytes($v)", "+ \"if ($v -is [string]) { [Console]::Out.Write('B64:' + [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($v))) } \" // (planted)")] },
  { id: 'UFC', suite: 'units', expect: ['FP5'], what: 'a failed fingerprint read is kept for the life of the process (never read again)', edits: [
    condOff(RT + 'identity.mjs', 'const due = () => !(lastFailure !== null && now() - lastFailure < retryMs);', 'const due = () => lastFailure === null; // (planted)')] },
  { id: 'RVW', suite: 'units', expect: ['RV2'], what: 'the worker overwrites state\\revocations.json with each heartbeat\'s list again (no union)', edits: [
    condOff(RT + 'worker.mjs', 'if (hb.revocations) { const rev = mergeRevocations(home, hb.revocations); if (ownReleaseRevoked(p, runtime, rev)) standby = true; }',
      'if (hb.revocations) { writeJson(p.revocations, hb.revocations); if (ownReleaseRevoked(p, runtime, hb.revocations)) standby = true; } // (planted)')] },
  { id: 'LCW', suite: 'units', expect: ['LC1', 'LC2'], what: 'the lease guard sizes the lease from the server\'s expiry minus the node\'s wall clock again', edits: [
    condOff(RT + 'worker.mjs', 'const grantedMs = grantedLeaseMs(claimed.lease_expires_at, serverTime);', 'const grantedMs = Math.max(5000, Date.parse(claimed.lease_expires_at) - Date.now()); // (planted)')] },
  { id: 'SIP', suite: 'units', expect: ['SI1'], what: 'the supervisor again treats a lock record naming a live (or EPERM) pid as a running supervisor', edits: [
    condOff(RT + 'supervisor.mjs', 'if (!inst.held) {', "if (!inst.held || (() => { const c = readJson(p.lock); if (!c || !c.pid || c.pid === process.pid) return false; try { process.kill(c.pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } })()) { // (planted)")] },
  { id: 'WKP', suite: 'units', expect: ['SI3'], what: 'the worker goes on when another worker holds the home\'s worker pipe', edits: [
    condOff(RT + 'worker.mjs', "if (!pipe.held) { log('another worker runs for this home", 'if (!pipe.held) pipe.close = async () => {}; // (planted) it goes on without the pipe')] },
  { id: 'CGB', suite: 'units', expect: ['CL1'], what: 'a lost claim answer is never read as lost (nothing given back; the orphan waits out its lease)', edits: [
    condOff(RT + 'worker.mjs', 'export const claimAnswerLost = (c) =>', 'export const claimAnswerLost = () => false; // (planted)')] },
  { id: 'RPA', suite: 'units', expect: ['RR1'], what: 'the pending key is promoted on any probe answer other than unknown_key (a 404, a 400, a body without a refusal name)', edits: [
    condOff(RT + 'credential.mjs', "if (s.refused !== 'unknown_key' || s.http !== 401) return { state: 'unknown'", "if (s.refused !== 'unknown_key' || s.http !== 401) return promote(null, 'planted'); // (planted)")] },
  { id: 'RFP', suite: 'units', expect: ['RR2'], what: 'a repeated rotation refused credential_superseded discards the pending key without the final probe', edits: [
    condOff(RT + 'credential.mjs', "oldInactive = r.refused !== 'key_reused';", "discardPending(home); return { state: 'discarded', why: 'planted' }; // (planted)")] },
  { id: 'RKS', suite: 'recovery', expect: ['RC1'], what: 'the rotation\'s new key is not stored before the request (only a reply that arrives stores it)', edits: [
    condOff(RT + 'credential.mjs', 'try { await keyIo.storeKey(p.pendingKey, nk); } catch (e) {', 'void nk; // (planted)')] },
  { id: 'ENL', suite: 'recovery', expect: ['RC5'], what: 'setup ignores the enrollment in progress on a re-run', edits: [
    condOff(RT + 'setup.mjs', 'const pending = cfg.pending_enrollment || null;', 'const pending = null; // (planted)')] },
  { id: 'ENR', suite: 'recovery', expect: ['RC5'], what: 'an enroll/complete answer that proves nothing (a 429) clears the enrollment in progress', edits: [
    condOff(RT + 'setup.mjs', "return keep('the answer to enroll/complete was lost or deferred (", "{ const c0 = readJson(p.config) || {}; delete c0.pending_enrollment; writeJsonDurable(p.config, c0); return { ok: false, exit: EXIT_SETUP.PAIRING_REFUSED }; } // (planted)")] },
  { id: 'SCI', suite: 'recovery', expect: ['RC1'], what: 'a session no longer names its credential (a lost rotation cannot learn which credential the new key holds)', edits: [
    condOff(V + '140_sessions.sql', "'principal_id', cred.principal_id, 'computer_id', cred.computer_id, 'credential_id', cred.credential_id);", "'principal_id', cred.principal_id, 'computer_id', cred.computer_id); -- (planted)")] },
  { id: 'VKD', suite: 'recovery', expect: ['RL1', 'RL2'], what: 'the claim door no longer offers verification work (only the verification door does)', edits: [
    condOff(V + '120_node_lifecycle.sql', "offer_verification boolean := p_door = 'verification' or (types is not null and 'verification' = any (types));", "offer_verification boolean := p_door = 'verification'; -- (planted)")] },
  { id: 'CKI', suite: 'recovery', expect: ['CK1'], what: 'a probe step\'s checkpoint carries no id (a repeat after a lost answer writes a second row)', edits: [
    condOff(RT + 'handlers.mjs', 'const checkpointId = randomUUID();', 'const checkpointId = undefined; // (planted)')] },
  { id: 'VTY', suite: 'eligibility', expect: ['Y4'], what: 'authoring work orders are matched against the listed types INCLUDING the reserved one', edits: [
    condOff(V + '120_node_lifecycle.sql', 'else offer_authoring and (authoring_types is null or wo.work_type = any (authoring_types)) end)', 'else offer_authoring and (types is null or wo.work_type = any (types)) end) -- (planted)')] },
  { id: 'UPG', suite: 'gate', expect: ['GA5'], what: 'the gate no longer refuses a release that is neither published in its channel nor adopted here', edits: [
    condOff(RT + 'upgrade.mjs', 'if (!adopted && !published) {', 'if (false) { // (planted)')] },
  { id: 'DWE', suite: 'takeover', expect: ['T7'], what: 'a completion records its evidence (verification.waiting) twice', edits: [
    { f: V + '120_node_lifecycle.sql', after: 'v := gen_random_uuid();', add: "      perform factory._audit(w.tenant_id, 'server', null, 'verification.waiting', 'work_order', w.work_order_id::text, 'ok', 'planted duplicate'); -- (planted)" }] },
  { id: 'DSN', suite: 'takeover', expect: ['T7'], what: 'a retried completion records one more successful side effect (an ok audit naming the run), outside the listed counts', edits: [
    { f: V + '120_node_lifecycle.sql', after: "perform factory._audit(ctx.tenant_id, 'node', ctx.principal_id::text, 'node.complete', 'run', p_body ->> 'run_id', 'refused', 'superseded');",
      add: "      perform factory._audit(ctx.tenant_id, 'node', ctx.principal_id::text, 'node.complete', 'run', p_body ->> 'run_id', 'ok', 'planted'); -- (planted)" }] },
  { id: 'ISE', suite: 'isolation', expect: ['IS1', 'IS3'], what: 'the isolated suite environment empties FACTORY_RUNNER_ENV_FILE again', edits: [
    condOff('qa/factory/v1/isolation.mjs', "const env = { ...base, FACTORY_RUNNER_PG_URL: '', FACTORY_RUNNER_ENV_FILE: envFile };", "const env = { ...base, FACTORY_RUNNER_PG_URL: '', FACTORY_RUNNER_ENV_FILE: '' }; // (planted)")] },
  // ---- A7 verifier follow-up: each wiring of a rotation's recovery, setup's resume, a renewal's start, the renew answer's clock,
  // config.json rewrites, the supervisor's rotation paths, no kill by a reported pid, the fingerprint read off the event loop
  { id: 'WRS', suite: 'recovery', expect: ['RC7'], what: 'the worker no longer resolves a pending rotation at its start (it starts on the superseded key)', edits: [
    condOff(RT + 'worker.mjs', 'const leftPending = pendingRotation(home).any;', 'const leftPending = false; // (planted)')] },
  { id: 'WRT', suite: 'recovery', expect: ['RC6'], what: 'a credential_superseded refusal is final even while a rotation of this node is pending (no settle, no exit 7)', edits: [
    condOff(RT + 'worker.mjs', "if (e.refusal.refused === 'credential_superseded') {", 'if (false) { // (planted)')] },
  { id: 'SRS', suite: 'recovery', expect: ['RC3'], what: 'setup no longer continues an enrollment in progress: it starts a new one (a new key, a code asked for)', edits: [
    condOff(RT + 'setup.mjs', 'const r = await resumeEnrollment({ api, home, channel: v.channel, say, fetchImpl: o.fetchImpl });', "const r = { state: 'none' }; // (planted)")] },
  { id: 'RNS', suite: 'recovery', expect: ['RN1'], what: 'the renew answer no longer states the clock of the plane (server_time)', edits: [
    condOff(V + '120_node_lifecycle.sql', "return jsonb_build_object('ok', true, 'run_id', run, 'lease_expires_at', until, 'server_time', now());", "return jsonb_build_object('ok', true, 'run_id', run, 'lease_expires_at', until); -- (planted)")] },
  { id: 'LCR', suite: 'units', expect: ['LC3'], what: 'a renewed lease is counted from the answer to the renewal instead of from when it was sent', edits: [
    condOff(RT + 'worker.mjs', 'if (r && r.ok) { leaseEnd = rs + grantedLeaseMs(r.lease_expires_at, r.server_time); lastFailed = false; }', 'if (r && r.ok) { leaseEnd = performance.now() + grantedLeaseMs(r.lease_expires_at, r.server_time); lastFailed = false; } // (planted)')] },
  { id: 'CFE', suite: 'units', expect: ['CF1'], what: 'a rotation starts from {} when config.json cannot be read', edits: [
    condOff(RT + 'credential.mjs', "try { cfg = readConfigForRewrite(p); } catch (e) { return { sent: false, refused: 'config_unreadable'", 'cfg = readJson(p.config) || {}; // (planted)')] },
  { id: 'SVR', suite: 'units', expect: ['SV1'], what: 'a REFUSED record keeps the worker from starting even while a rotation of the home is pending', edits: [
    condOff(RT + 'supervisor.mjs', "if (status.state === 'REFUSED' && cfg && !cfg.pending_rotation && !existsSync(p.pendingKey) && status.credential_id === cfg.credential_id) {", "if (status.state === 'REFUSED' && cfg && status.credential_id === cfg.credential_id) { // (planted)")] },
  { id: 'SV7', suite: 'units', expect: ['SV2'], what: 'an exit 7 of the worker is treated as a crash (restarted only after the backoff)', edits: [
    condOff(RT + 'supervisor.mjs', "if (code === 7) { log('worker restarts on its rotated key'); backoffMs = 5000; continue; }", 'void 0; // (planted)')] },
  { id: 'SIK', suite: 'units', expect: ['SI3'], what: 'a pipe holder that does not stop is ended by the pid it reports', edits: [
    { f: RT + 'instance.mjs', after: 'no process is ended by a pid it reports, and no second worker is started', add: "  { const x = await askPipe(home, 'worker', 'whois', 2000); if (x && Number.isInteger(x.pid)) { try { process.kill(x.pid); } catch { /* planted */ } } } // (planted)" }] },
  { id: 'UFS', suite: 'units', expect: ['FP7'], what: 'the fingerprint read of the worker blocks the event loop again (the synchronous read)', edits: [
    condOff(RT + 'identity.mjs', 'running = Promise.resolve().then(() => readAsync())', 'running = Promise.resolve().then(() => read()) // (planted) the blocking read')] },
  // ---- C2-P1: a thrown handler leaves its run to the lease; only a failure the same input meets on every attempt fails it
  { id: "HFT", suite: "units", expect: ["HF1", "HF5"], what: "every handler error fails its authoring run again (the Candidate #2 behaviour: a transient refusal is terminal)", edits: [condOff(RT + 'worker.mjs', "const reason = terminalFailure(outcome.error);", "const reason = terminalFailure(outcome.error) || 'handler_error'; // (planted)")] },
  { id: "HFTr", suite: "recovery", expect: ["TR1", "TR2"], what: "every handler error fails its authoring run again, on a real plane (no lease is left to lapse, no node takes the work over)", edits: [condOff(RT + 'worker.mjs', "const reason = terminalFailure(outcome.error);", "const reason = terminalFailure(outcome.error) || 'handler_error'; // (planted)")] },
  { id: "HFG", suite: "units", expect: ["HF1"], what: "a run whose handler threw is given back at once instead of being left to its lease", edits: [condOff(RT + 'worker.mjs', "log('leaving the lease to expire so the work is recoverable rather than lost');", "await api.op('release', { run_id: claimed.run_id }); // (planted)")] },
  { id: "HFGr", suite: "recovery", expect: ["TR1", "TR2"], what: "a run whose handler threw is given back at once, on a real plane (the node names the run after the failure)", edits: [condOff(RT + 'worker.mjs', "log('leaving the lease to expire so the work is recoverable rather than lost');", "await api.op('release', { run_id: claimed.run_id }); // (planted)")] },
  { id: "HFD", suite: "units", expect: ["HF2"], what: "a data exception the plane's server raised no longer fails the run (it is claimed and thrown again every lease)", edits: [condOff(RT + 'worker.mjs', "if (r.refused === 'server_refused') return typeof r.sqlstate", "if (r.refused === 'server_refused') return null; // (planted)")] },
  { id: "HFS", suite: "units", expect: ["HF1"], what: "any SQLSTATE the server raised fails the run, not only a data exception (a lock wait is terminal again)", edits: [condOff(RT + 'worker.mjs', "if (r.refused === 'server_refused') return typeof r.sqlstate", "if (r.refused === 'server_refused') return typeof r.sqlstate === 'string' ? 'data_exception_' + r.sqlstate : null; // (planted)")] },
  { id: "HFR", suite: "units", expect: ["HF2"], what: "a request the API refused as malformed no longer fails the run", edits: [condOff(RT + 'worker.mjs', "return !unknownOutcome(r) && REQUEST_REFUSALS.has(r.refused)", "return null; // (planted)")] },
  { id: "HFA", suite: "units", expect: ["HF1"], what: "a request refusal's name is trusted on any status (a gateway's 502 carrying it fails the run)", edits: [condOff(RT + 'worker.mjs', "return !unknownOutcome(r) && REQUEST_REFUSALS.has(r.refused)", "return REQUEST_REFUSALS.has(r.refused) ? 'request_refused_' + r.refused : null; // (planted)")] },
  { id: "HFL", suite: "units", expect: ["HF3"], what: "a lost lease is treated as a request refusal: the node completes a run it no longer holds as failed", edits: [condOff(RT + 'worker.mjs', "const REQUEST_REFUSALS = new Set([", "const REQUEST_REFUSALS = new Set(['bad_request', 'identity_from_body_refused', 'body_too_large', 'lease_lost']); // (planted)")] },
  { id: "HFC", suite: "units", expect: ["HF4", "HF8"], what: "a terminal credential refusal met by a handler no longer stops the worker (it is read as a transient failure)", edits: [condOff(RT + 'worker.mjs', "if (refusal) check(refusal);", "void check; // (planted)")] },
  { id: "HFV", suite: "units", expect: ["HF6"], what: "a verification handler's error no longer gives its claim back", edits: [condOff(RT + 'worker.mjs', "await api.op('release', { run_id: claimed.run_id });", "void 0; // (planted)")] },
  { id: "HFK", suite: "units", expect: ["HF7"], what: "the give-back after a lost claim answer names no run this process claimed (a run left to its lease is given back as an orphan)", edits: [condOff(RT + 'worker.mjs', "const kept = () => {", "const kept = () => []; // (planted)")] },
  { id: "HFQ", suite: "recovery", expect: ["TR2"], what: "the Node API no longer states the SQLSTATE of a server refusal (the node cannot tell a data exception from a lock wait)", edits: [condOff(EDGE + 'node_api.ts', "if (state) return refuse(500, 'server_refused', 'the control plane refused the call (' + state + '); nothing changed', { sqlstate: state });", "if (state) return refuse(500, 'server_refused', 'the control plane refused the call (' + state + '); nothing changed'); // (planted)")] },

  // ---- A9: semantic variants judged by a read-back row (L7-12, L7-20, L7-25), and a mutant for every §3.10 guard that had none (L7-21)
  // AC-6(b) identity, tenant and agent from the body. IDR, the CONTROL: both refusal layers reverted and nothing else - F's own claim
  // goes through (E1, E1b fail), and no victim row may move; IDN / IDT / IDA then add the front door acting on the named value
  { id: 'IDR', suite: 'admin', layer: 'semantic', expect: ['E1', 'E1b'], pass: ['E1n', 'E1t', 'E1a', 'E1e'], what: 'CONTROL: both identity-refusal layers reverted and nothing else (no front door acts on a named node, tenant, agent or capability)', edits: [...ID_BOTH_LAYERS] },
  { id: 'IDN', suite: 'admin', layer: 'semantic', expect: ['E1n'], what: 'the node id taken from the body: the Edge passes identity fields on, the front doors do not refuse them, and heartbeat acts on the named node', edits: [
    ...ID_BOTH_LAYERS, condOff(V + '120_node_lifecycle.sql', "if ctx.draining and phase in ('AVAILABLE', 'CLAIMING') then phase := 'DRAINING'; end if;",
      "ctx.node_id := coalesce(p_body ->> 'node_id', ctx.node_id); if ctx.draining and phase in ('AVAILABLE', 'CLAIMING') then phase := 'DRAINING'; end if; -- (planted) the node taken from the body")] },
  { id: 'IDT', suite: 'admin', layer: 'semantic', expect: ['E1t'], what: 'the tenant taken from the body: the claim selects the work order of the tenant the body names, and gate 2 no longer refuses another tenant\'s work', edits: [
    ...ID_BOTH_LAYERS,
    condOff(V + '120_node_lifecycle.sql', 'if only_wo is not null and not exists (select 1 from factory.work_orders x where x.work_order_id = only_wo and x.tenant_id = p_ctx.tenant_id',
      "if only_wo is not null and not exists (select 1 from factory.work_orders x where x.work_order_id = only_wo and x.tenant_id = coalesce((p_body ->> 'tenant_id')::uuid, p_ctx.tenant_id) -- (planted)"),
    condOff(V + '120_node_lifecycle.sql', "where wo.tenant_id = p_ctx.tenant_id and wo.status = 'queued'", "where wo.tenant_id = coalesce((p_body ->> 'tenant_id')::uuid, p_ctx.tenant_id) and wo.status = 'queued' -- (planted) the tenant taken from the body"),
    gateOff(2, "return factory._gate(2, 'the work order belongs to another tenant');")] },
  { id: 'IDA', suite: 'admin', layer: 'semantic', expect: ['E1a'], what: 'the agent taken from the body: the claim records the run under the principal and computer the body names', edits: [
    ...ID_BOTH_LAYERS, condOff(V + '120_node_lifecycle.sql', 'p_ctx.principal_id, p_ctx.computer_id, p_ctx.credential_id, picked_kind, picked.requires_security_role, p_ctx.envelope_version,',
      "coalesce((p_body ->> 'principal_id')::uuid, p_ctx.principal_id), coalesce((p_body ->> 'computer_id')::uuid, p_ctx.computer_id), p_ctx.credential_id, picked_kind, picked.requires_security_role, p_ctx.envelope_version, -- (planted) the agent taken from the body")] },
  // AC-6 envelope self-change: a node changes its own envelope through a front door (the capabilities it reports become its envelope)
  { id: 'ESf', suite: 'admin', layer: 'semantic', expect: ['E1e'], what: 'envelope self-change: a heartbeat naming capabilities writes the next envelope version with them and moves the computer\'s envelope pointer', edits: [
    condOff(EDGE + 'node_api.ts', "'capabilities', 'envelope', 'envelope_version', 'authorized_roles', 'authorized_capabilities', 'company_ids', 'max_concurrent_runs',",
      "'envelope', 'envelope_version', 'authorized_roles', 'authorized_capabilities', 'company_ids', 'max_concurrent_runs', // (planted) capabilities accepted"),
    condOff(EDGE + 'node_api.ts', "'POST /v1/node/heartbeat': { phase: 'str64', resources: 'res', fingerprint: 'hex64' },", "'POST /v1/node/heartbeat': { phase: 'str64', resources: 'res', fingerprint: 'hex64', capabilities: 'strs' }, // (planted)"),
    condOff(V + '100_node_common.sql', "where k in ('node_id', 'tenant_id', 'principal_id', 'computer_id', 'credential_id', 'security_role', 'role', 'roles', 'capabilities',",
      "where k in ('node_id', 'tenant_id', 'principal_id', 'computer_id', 'credential_id', 'security_role', 'role', 'roles', -- (planted) capabilities accepted"),
    condOff(V + '120_node_lifecycle.sql', "if ctx.draining and phase in ('AVAILABLE', 'CLAIMING') then phase := 'DRAINING'; end if;",
      "if p_body ? 'capabilities' then insert into factory.authorization_envelopes (tenant_id, computer_id, version, authorized_roles, authorized_capabilities, allowed_work_types, company_ids, max_concurrent_runs, max_heavy, preferred_work_class, created_by) select e.tenant_id, e.computer_id, e.version + 1, e.authorized_roles, array(select jsonb_array_elements_text(p_body -> 'capabilities')), e.allowed_work_types, e.company_ids, e.max_concurrent_runs, e.max_heavy, e.preferred_work_class, e.created_by from factory.authorization_envelopes e join factory.computers m on m.computer_id = e.computer_id and m.current_envelope_version = e.version where m.computer_id = ctx.computer_id; update factory.computers set current_envelope_version = current_envelope_version + 1 where computer_id = ctx.computer_id; end if; if ctx.draining and phase in ('AVAILABLE', 'CLAIMING') then phase := 'DRAINING'; end if; -- (planted) the node writes its own envelope")] },
  { id: 'G6s', suite: 'admin', layer: 'semantic', expect: ['E2'], what: 'gate 6 reads the capabilities the node reports (self-report) besides its envelope', edits: [condOff(V + '110_eligibility.sql', 'if exists (select 1 from unnest(req) c where not (c = any (p_ctx.authorized_capabilities))) then',
    "if exists (select 1 from unnest(req) c where not (c = any (p_ctx.authorized_capabilities || array(select jsonb_array_elements_text(case when jsonb_typeof(res -> 'capabilities') = 'array' then res -> 'capabilities' else '[]'::jsonb end))))) then -- (planted) self-report")] },
  // AC-12 (the row of 'a SECURITY DEFINER body conditioned on the applying role's superuser status'): a front door conditioned on its
  // owner's superuser status behaves otherwise on this plane (factory_owner is NOSUPERUSER on every plane): the drain no longer shows
  { id: 'DSU', suite: 'admin', layer: 'semantic', expect: ['L6'], what: 'a SECURITY DEFINER front door (heartbeat) conditioned on its owner\'s superuser status: a draining computer\'s runtime is no longer held DRAINING when the owner is not a superuser', edits: [
    condOff(V + '120_node_lifecycle.sql', "if ctx.draining and phase in ('AVAILABLE', 'CLAIMING') then phase := 'DRAINING'; end if;",
      "if ctx.draining and phase in ('AVAILABLE', 'CLAIMING') and (select r.rolsuper from pg_catalog.pg_roles r where r.rolname = current_user) then phase := 'DRAINING'; end if; -- (planted) conditioned on the owner's superuser status")] },
  // AC-7: the tier founder check and the live-role founder check, each removed alone
  { id: 'TF1', suite: 'admin', layer: 'semantic', expect: ['P4'], what: 'founder-only actions no longer need tier founder (the live role founder alone suffices)', edits: [condOff(V + '200_admin_common.sql', "if p_ctx.tier = 'founder' and p_ctx.live_role = 'founder' then return null; end if;", "if p_ctx.live_role = 'founder' then return null; end if; -- (planted) tier check removed")] },
  { id: 'TF2', suite: 'admin', layer: 'semantic', expect: ['P4'], what: 'founder-only actions no longer need the live role founder (a tier-founder row alone suffices)', edits: [condOff(V + '200_admin_common.sql', "if p_ctx.tier = 'founder' and p_ctx.live_role = 'founder' then return null; end if;", "if p_ctx.tier = 'founder' then return null; end if; -- (planted) live-role check removed")] },
  // AC-7 / AC-9 the S-7 route list and one engine: a route answered outside the table; a second statement per request
  { id: 'S7b', suite: 'admin', layer: 'semantic', expect: ['R1'], what: 'a route answered outside FRONT_DOORS (a pathname branch before the 404)', edits: [{ f: EDGE + 'node_api.ts', after: "const route = req.method + ' ' + routePath(url.pathname, deps.basePath);",
    add: "    if (url.pathname.endsWith('/v1/node/sync')) return await frontDoor(deps, 'GET /v1/time', []); // (planted) a route outside the table" }] },
  { id: 'S7bs', suite: 'static', expect: ['S2'], what: 'the same, read from the source', edits: [{ f: EDGE + 'node_api.ts', after: "const route = req.method + ' ' + routePath(url.pathname, deps.basePath);",
    add: "    if (url.pathname.endsWith('/v1/node/sync')) return await frontDoor(deps, 'GET /v1/time', []); // (planted) a route outside the table" }] },
  { id: 'SQ', suite: 'admin', layer: 'semantic', expect: ['Q1'], what: 'the Node API runs a second SQL statement per request', edits: [{ f: EDGE + 'node_api.ts', after: 'const rows = await deps.sql(FRONT_DOORS[route], params);', add: "  await deps.sql('select 1 as r', []); // (planted) a second statement" }] },
  { id: 'SQa', suite: 'admin', layer: 'semantic', expect: ['Q1'], what: 'the Admin API runs a second SQL statement per request', edits: [{ f: EDGE + 'admin_api.ts', after: "const rows = await deps.sql('select factory.' + op.fn + '($1::uuid, $2, $3::text::jsonb) as r', [who.userId, who.role, JSON.stringify(body)]);", add: "      await deps.sql('select 1 as r', []); // (planted) a second statement" }] },
  { id: 'SQs', suite: 'static', expect: ['O4'], what: 'the Node API\'s second statement, read from the source', edits: [{ f: EDGE + 'node_api.ts', after: 'const rows = await deps.sql(FRONT_DOORS[route], params);', add: "  await deps.sql('select 1 as r', []); // (planted) a second statement" }] },
  { id: 'SQas', suite: 'static', expect: ['O2', 'O4'], what: 'the Admin API\'s second statement, read from the source', edits: [{ f: EDGE + 'admin_api.ts', after: "const rows = await deps.sql('select factory.' + op.fn + '($1::uuid, $2, $3::text::jsonb) as r', [who.userId, who.role, JSON.stringify(body)]);", add: "      await deps.sql('select 1 as r', []); // (planted) a second statement" }] },
  // AC-14: rotate or re-pair issues a new principal
  { id: 'RPn', suite: 'admin', layer: 'semantic', expect: ['L5'], what: 're-pair issues its code for a NEW principal of the computer', edits: [condOff(V + '210_admin_computers.sql', "issued := factory._issue_code(a.ctx, m, pid, 'repair', p_body);",
    "pid := gen_random_uuid(); insert into factory.agent_principals (principal_id, tenant_id, computer_id, node_id, created_via, created_by) values (pid, m.tenant_id, m.computer_id, 'node-' || replace(pid::text, '-', ''), 'admin_create', (a.ctx).actor); issued := factory._issue_code(a.ctx, m, pid, 'repair', p_body); -- (planted) a new principal")] },
  { id: 'RRn', suite: 'admin', layer: 'semantic', expect: ['L3'], what: 'a rotation binds the new credential to a NEW principal it mints', edits: [{ f: V + '140_sessions.sql', after: "update factory.node_credentials set status = 'superseded', superseded_at = now() where credential_id = ctx.credential_id;",
    add: "    ctx.principal_id := gen_random_uuid(); insert into factory.agent_principals (principal_id, tenant_id, computer_id, node_id, created_via, created_by) values (ctx.principal_id, ctx.tenant_id, ctx.computer_id, 'node-' || replace(ctx.principal_id::text, '-', ''), 'admin_create', ctx.principal_id); -- (planted) a rotation mints a principal" }] },
  // AC-12 / AC-15: the S-16(a) binding dropped on archive
  { id: 'BA', suite: 'admin', layer: 'semantic', expect: ['G2'], what: 'archive drops the S-16(a) binding (and the computers guard lets it change)', edits: [
    condOff(V + '080_guards.sql', "'s14_registration_refused_at']) then", "'s14_registration_refused_at', 's16a_bound_at', 's16a_bound_by']) then -- (planted)"),
    condOff(V + '210_admin_computers.sql', 'update factory.computers set archived_at = now(), archived_by = (a.ctx).actor where computer_id = m.computer_id;', 'update factory.computers set archived_at = now(), archived_by = (a.ctx).actor, s16a_bound_at = null, s16a_bound_by = null where computer_id = m.computer_id; -- (planted)')] },
  // AC-8 atomic consume: the code row is read without its lock
  { id: 'ATC', suite: 'pairing', layer: 'semantic', expect: ['PC4', 'PC6'], what: 'enroll/complete reads the code without locking it (a complete consumes a code a racing revoke or reissue ended)', edits: [condOff(V + '150_enrollment.sql', 'select x.* into code from factory.pairing_codes x where x.code_id = e0.code_id for no key update;', 'select x.* into code from factory.pairing_codes x where x.code_id = e0.code_id; -- (planted) no code lock')] },
  // AC-12 (L7-20): the legacy-privilege grants planted AFTER the migration's self-check, judged by the read-backs alone
  { id: 'LDa', suite: 'schema', layer: 'semantic', expect: ['C7'], what: 'the 69df2f52 default-privilege grant to factory_runner restored after the self-check', edits: [{ f: V + '990_finalize.sql', append: 'alter default privileges in schema factory grant select, insert, update, delete on tables to factory_runner; -- (planted) after the self-check' }] },
  { id: 'CG', suite: 'schema', layer: 'semantic', expect: ['C4'], what: 'a column-level grant to factory_runner on an authority table (after the self-check)', edits: [{ f: V + '990_finalize.sql', append: 'set local role factory_owner; grant select (tenant_id) on factory.tenants to factory_runner; reset role; -- (planted)' }] },
  // AC-12 (the row of 'a migration statement conditioned on the applying role's superuser status or memberships'): a statement the
  // migration runs AS the applying login, branching on that login's superuser status or its memberships, grants a legacy privilege
  // on this plane (the applying login is NOSUPERUSER and holds factory_runner with ADMIN); planted after the self-check, so only the
  // catalog read-back can see it
  { id: 'SUd', suite: 'schema', layer: 'semantic', expect: ['C3'], what: 'a migration statement conditioned on the applying login\'s superuser status grants factory_runner a privilege on an authority table', edits: [{ f: V + '990_finalize.sql', append: "do $p$ begin if not (select r.rolsuper from pg_catalog.pg_roles r where r.rolname = current_user) then set local role factory_owner; grant insert on factory.computers to factory_runner; reset role; end if; end $p$; -- (planted)" }] },
  { id: 'MBd', suite: 'schema', layer: 'semantic', expect: ['C3'], what: 'a migration statement conditioned on the applying login\'s membership in factory_runner grants factory_runner a privilege on an authority table', edits: [{ f: V + '990_finalize.sql', append: "do $p$ begin if exists (select 1 from pg_catalog.pg_auth_members m join pg_catalog.pg_roles g on g.oid = m.roleid join pg_catalog.pg_roles u on u.oid = m.member where g.rolname = 'factory_runner' and u.rolname = current_user) then set local role factory_owner; grant select on factory.computers to factory_runner; reset role; end if; end $p$; -- (planted)" }] },
  // §3.5 / contract §1 "What a candidate migration writes" (R3-c): each planted AFTER the self-check, judged by W1-W6
  { id: 'SMa', suite: 'schema', layer: 'semantic', expect: ['W2'], what: 'the migration writes a row into a table it created (an audit row)', edits: [{ f: V + '990_finalize.sql', append: "set local role factory_owner; insert into factory.audit_events (tenant_id, actor_kind, action, outcome) values ('a1e0f000-0000-4000-8000-000000000001', 'server', 'migration.applied', 'ok'); reset role; -- (planted)" }] },
  { id: 'SMv', suite: 'schema', layer: 'semantic', expect: ['W2', 'C12'], what: 'the migration seeds the policy-version rows again', edits: [{ f: V + '990_finalize.sql', append: "set local role factory_owner; insert into factory.verification_policy_versions (policy_id, version, tenant_id, snapshot, recorded_by) select p.policy_id, p.version, p.tenant_id, to_jsonb(p) - 'updated_at', p.updated_by from factory.verification_policies p; reset role; -- (planted)" }] },
  { id: 'SMc', suite: 'schema', layer: 'semantic', expect: ['W2', 'W3'], what: 'the migration seeds a computer record (with its envelope)', edits: [{ f: V + '990_finalize.sql', append: "set local role factory_owner; insert into factory.computers (computer_id, tenant_id, display_name, created_by) values ('c0ffee00-0000-4000-8000-0000000000c1', 'a1e0f000-0000-4000-8000-000000000001', 'seeded', 'c0ffee00-0000-4000-8000-0000000000ad'); insert into factory.authorization_envelopes (tenant_id, computer_id, version, authorized_roles, created_by) values ('a1e0f000-0000-4000-8000-000000000001', 'c0ffee00-0000-4000-8000-0000000000c1', 1, '{generic}', 'c0ffee00-0000-4000-8000-0000000000ad'); reset role; -- (planted)" }] },
  { id: 'SMp', suite: 'schema', layer: 'semantic', expect: ['W3'], what: 'the migration seeds a computer and its agent principal', edits: [{ f: V + '990_finalize.sql', append: "set local role factory_owner; insert into factory.computers (computer_id, tenant_id, display_name, created_by) values ('c0ffee00-0000-4000-8000-0000000000c1', 'a1e0f000-0000-4000-8000-000000000001', 'seeded', 'c0ffee00-0000-4000-8000-0000000000ad'); insert into factory.authorization_envelopes (tenant_id, computer_id, version, authorized_roles, created_by) values ('a1e0f000-0000-4000-8000-000000000001', 'c0ffee00-0000-4000-8000-0000000000c1', 1, '{generic}', 'c0ffee00-0000-4000-8000-0000000000ad'); insert into factory.agent_principals (principal_id, tenant_id, computer_id, node_id, created_via, created_by) values ('c0ffee00-0000-4000-8000-0000000000c2', 'a1e0f000-0000-4000-8000-000000000001', 'c0ffee00-0000-4000-8000-0000000000c1', 'node-c0ffee000000400080000000000000c2', 'add_computer', 'c0ffee00-0000-4000-8000-0000000000ad'); reset role; -- (planted)" }] },
  { id: 'SMk', suite: 'schema', layer: 'semantic', expect: ['W3'], what: 'the migration seeds a credential, with the computer, envelope, principal, pairing code and enrollment the credential guard binds it to', edits: [{ f: V + '990_finalize.sql', append: "set local role factory_owner; insert into factory.computers (computer_id, tenant_id, display_name, created_by) values ('c0ffee00-0000-4000-8000-0000000000c1', 'a1e0f000-0000-4000-8000-000000000001', 'seeded', 'c0ffee00-0000-4000-8000-0000000000ad'); insert into factory.authorization_envelopes (tenant_id, computer_id, version, authorized_roles, created_by) values ('a1e0f000-0000-4000-8000-000000000001', 'c0ffee00-0000-4000-8000-0000000000c1', 1, '{generic}', 'c0ffee00-0000-4000-8000-0000000000ad'); insert into factory.agent_principals (principal_id, tenant_id, computer_id, node_id, created_via, created_by) values ('c0ffee00-0000-4000-8000-0000000000c2', 'a1e0f000-0000-4000-8000-000000000001', 'c0ffee00-0000-4000-8000-0000000000c1', 'node-c0ffee000000400080000000000000c2', 'add_computer', 'c0ffee00-0000-4000-8000-0000000000ad'); insert into factory.pairing_codes (code_id, tenant_id, computer_id, principal_id, envelope_version, purpose, locator, code_mac, pepper_version, issued_by, expires_at) values ('c0ffee00-0000-4000-8000-0000000000c3', 'a1e0f000-0000-4000-8000-000000000001', 'c0ffee00-0000-4000-8000-0000000000c1', 'c0ffee00-0000-4000-8000-0000000000c2', 1, 'add_computer', 'ABCD', decode(repeat('00', 32), 'hex'), 1, 'c0ffee00-0000-4000-8000-0000000000ad', now() + interval '10 minutes'); insert into factory.enrollments (enrollment_id, tenant_id, code_id, computer_id, principal_id, public_key, key_thumbprint, challenge, challenge_expires_at) values ('c0ffee00-0000-4000-8000-0000000000c4', 'a1e0f000-0000-4000-8000-000000000001', 'c0ffee00-0000-4000-8000-0000000000c3', 'c0ffee00-0000-4000-8000-0000000000c1', 'c0ffee00-0000-4000-8000-0000000000c2', decode(repeat('ab', 32), 'hex'), encode(sha256(decode(repeat('ab', 32), 'hex')), 'hex'), decode(repeat('00', 32), 'hex'), now() + interval '5 minutes'); insert into factory.node_credentials (tenant_id, computer_id, principal_id, public_key, key_thumbprint, issued_via, enrollment_id) values ('a1e0f000-0000-4000-8000-000000000001', 'c0ffee00-0000-4000-8000-0000000000c1', 'c0ffee00-0000-4000-8000-0000000000c2', decode(repeat('ab', 32), 'hex'), encode(sha256(decode(repeat('ab', 32), 'hex')), 'hex'), 'enrollment', 'c0ffee00-0000-4000-8000-0000000000c4'); reset role; -- (planted)" }] },
  { id: 'SR', suite: 'schema', layer: 'semantic', expect: ['W1'], what: 'the migration changes a value of a pre-existing row outside the manifest\'s evidence fields (nodes.agent_version)', edits: [{ f: V + '990_finalize.sql', append: "update factory.nodes set agent_version = coalesce(agent_version, '') || '+'; -- (planted)" }] },
  { id: 'SA2', suite: 'schema', layer: 'semantic', expect: ['W4'], what: 'the migration fills an added column that identifies a machine (nodes.machine_fingerprint) on the pre-existing legacy nodes', edits: [{ f: V + '990_finalize.sql', append: "set local role factory_owner; update factory.nodes set machine_fingerprint = repeat('ab', 32) where principal_id is null; reset role; -- (planted)" }] },
  { id: 'SK', suite: 'schema', layer: 'semantic', expect: ['W5'], what: 'the migration defines a function holding an identifying UUID (before part 990, while factory_owner may still create)', edits: [{ f: V + '290_admin_grants.sql', append: "set local role factory_owner; create function factory._qa_planted() returns uuid language sql immutable set search_path = pg_catalog, pg_temp as $q$ select 'c0ffee00-0000-4000-8000-000000000042'::uuid $q$; reset role; -- (planted)" }] },
  { id: 'SKd', suite: 'schema', layer: 'semantic', expect: ['W5'], what: 'the migration sets an identifying UUID as the default of a PRE-EXISTING column (a 69df2f52 table)', edits: [{ f: V + '990_finalize.sql', append: "alter table factory.work_orders alter column title set default 'c0ffee00-0000-4000-8000-000000000042'; -- (planted)" }] },
  { id: 'SBd', suite: 'schema', layer: 'semantic', expect: ['W6'], what: 'the migration gives the S-16(a) binding a column default', edits: [{ f: V + '990_finalize.sql', append: 'set local role factory_owner; alter table factory.computers alter column s16a_bound_at set default now(); reset role; -- (planted)' }] },
  // AC-11 (the step aborts on the copy): the Director instrument's own check, reached through a real planted statement
  { id: 'EVF', suite: 'schema', layer: 'step', expect: ['P1'], what: 'the migration changes one manifest evidence field (the step\'s check must abort it)', edits: [{ f: V + '990_finalize.sql', append: "set local role factory_owner; update factory.agent_runs set summary = coalesce(summary, '') || '.' where base_commit like '69df2f52%'; reset role; -- (planted)" }] },
  { id: 'DCT', suite: 'schema', layer: 'step', expect: ['P1'], what: 'the migration leaves a deferrable constraint trigger (the step\'s check must abort it)', edits: [{ f: V + '990_finalize.sql', append: 'set local role factory_owner; create function factory._qa_ct() returns trigger language plpgsql set search_path = pg_catalog, pg_temp as $t$ begin return null; end $t$; create constraint trigger qa_ct after insert on factory.tenants deferrable initially deferred for each row execute function factory._qa_ct(); reset role; -- (planted)' }] },
  // AC-9 the lapsed enrolled lock: the claim front door writes a lock that lapses with the run
  { id: 'LL', suite: 'takeover', layer: 'semantic', expect: ['T8', 'X4'], what: 'the enrolled lock lapses with its run: the front door writes the run\'s lease on the lock (and the constraint no longer requires infinity)', edits: [
    condOff(V + '070_baseline_columns.sql', "add constraint surface_locks_enrolled_never_lapses check (principal_id is null or lease_expires_at = 'infinity');", 'add constraint surface_locks_enrolled_never_lapses check (true); -- (planted)'),
    condOff(V + '120_node_lifecycle.sql', "values (v_surface, v_run, p_ctx.node_id, 'infinity', p_ctx.principal_id, p_ctx.tenant_id);", 'values (v_surface, v_run, p_ctx.node_id, lease_until, p_ctx.principal_id, p_ctx.tenant_id); -- (planted)')] },
  // AC-9 r3 the legacy director and director_lease
  { id: 'DW', suite: 'legacydirector', layer: 'semantic', expect: ['LD7'], what: 'new-model dispatch waits on the legacy lease (the claim locks director_lease)', edits: [{ f: V + '120_node_lifecycle.sql', after: 'perform factory._reap();', add: '    perform 1 from factory.director_lease for update; -- (planted)' }] },
  { id: 'DWv', suite: 'legacydirector', layer: 'semantic', expect: ['LD7'], what: 'new-model dispatch waits on the legacy lease only once a VERIFICATION work order is picked (a verification claim that claims nothing never reaches it)', edits: [{ f: V + '120_node_lifecycle.sql', after: 'where work_order_id = picked.verifies_work_order_id;', add: '      perform 1 from factory.director_lease for update; -- (planted) after the verification pick' }] },
  { id: 'LDP', suite: 'legacydirector', layer: 'semantic', expect: ['LD6'], what: 'a legacy update of a new-model row goes through (the legacy director changes new-model dispatcher state)', edits: [condOff(V + '080_guards.sql', 'if old_nm then', 'if old_nm then return case when tg_op = \'DELETE\' then old else new end; end if; if false then -- (planted)')] },
  { id: 'LGD', suite: 'legacydirector', layer: 'semantic', expect: ['LD5'], what: 'a legacy update of a new-model row raises (the legacy director\'s transaction fails)', edits: [condOff(V + '080_guards.sql', 'if old_nm then', 'if false then -- (planted)')] },
  { id: 'LDE', suite: 'legacydirector', layer: 'semantic', expect: ['LD5'], what: 'every legacy write of director_lease raises', edits: [condOff(V + '080_guards.sql', "if tg_op <> 'INSERT' then r_old := to_jsonb(old); end if;", "if tg_table_name = 'director_lease' then raise exception using errcode = '42501', message = 'factory_legacy_refused (planted)'; end if; if tg_op <> 'INSERT' then r_old := to_jsonb(old); end if;")] },
  { id: 'LD2x', suite: 'legacydirector', layer: 'semantic', expect: ['LD1', 'LD2'], what: 'legacy writes of director_lease are silently skipped (every director believes it holds the lease)', edits: [condOff(V + '080_guards.sql', "if tg_op <> 'INSERT' then r_old := to_jsonb(old); end if;", "if tg_table_name = 'director_lease' then return null; end if; if tg_op <> 'INSERT' then r_old := to_jsonb(old); end if; -- (planted)")] },
  // AC-5 the release-signature check: both layers reverted (the unsigned check, and the plane's published-state gate that would refuse
  // the unpublished sentinel next), so the unsigned offer reaches installation and the read-back row sees it
  { id: 'RUa', suite: 'release', layer: 'semantic', expect: ['R-b0'], what: 'an unsigned release is accepted, and the published-state gate that would refuse it next is removed', edits: [
    condOff(RT + 'release.mjs', "if (!m.signature || !m.key_id) return refuse('unsigned', 'the release is not signed');", 'if (!m.signature || !m.key_id) return { ok: true, channel: trust.channel, version: m.version, digest: m.digest, key_id: m.key_id }; // (planted) unsigned accepted'),
    condOff(RT + 'upgrade.mjs', 'if (!adopted && !published) {', 'if (false) { // (planted)')] },
  // AC-9 static scan (§3.4 r3): each construct class planted, judged by the scan rows
  { id: 'PC1', suite: 'static', expect: ['P2'], what: 'a new function branches on current_catalog', edits: [{ f: V + '100_node_common.sql', append: "create function factory._qa_pc1() returns boolean language sql stable set search_path = pg_catalog, pg_temp as $p$ select current_catalog = 'postgres' $p$; -- (planted)" }] },
  { id: 'PC1i', suite: 'static', expect: ['P2'], what: 'a new function branches on current_catalog AND the inventory proposes a branch-permitting class for it (an inventory entry never covers a branch on a plane value)', edits: [
    { f: V + '100_node_common.sql', append: "create function factory._qa_pc1() returns boolean language sql stable set search_path = pg_catalog, pg_temp as $p$ select current_catalog = 'postgres' $p$; -- (planted)" },
    { f: 'qa/scenarios-runner/factory_v1_plane_scan_inventory.mjs', after: 'export const INVENTORY = [', add: "  { file: V + '100_node_common.sql', construct: 'database', fn: 'factory._qa_pc1', count: 1, cls: 'same-on-every-plane', why: 'planted', construction: 'planted' }, // (planted)" }] },
  { id: 'PC2', suite: 'static', expect: ['P2'], what: 'a DO block branches on the applying login\'s superuser status', edits: [{ f: V + '010_tenancy.sql', append: "do $p$ begin if (select r.rolsuper from pg_catalog.pg_roles r where r.rolname = current_user) then raise notice 'x'; end if; end $p$; -- (planted)" }] },
  { id: 'PC3', suite: 'static', expect: ['P7', 'P2'], what: 'a function swallows insufficient_privilege', edits: [{ f: V + '100_node_common.sql', append: 'create function factory._qa_pc3() returns boolean language plpgsql set search_path = pg_catalog, pg_temp as $p$ begin perform 1; return true; exception when insufficient_privilege then return null; end $p$; -- (planted)' }] },
  { id: 'PC4', suite: 'static', expect: ['P3'], what: 'the Node API reads a new environment value', edits: [{ f: EDGE + 'node_api.ts', after: 'const MAX_BODY = 65536;', add: "const QA_PC4 = Deno.env.get('QA_PC4'); void QA_PC4; // (planted)" }] },
  { id: 'PC5', suite: 'static', expect: ['P6'], what: 'the migration sets a secret-named setting', edits: [{ f: V + '990_finalize.sql', append: "set local app.jwt_secret = 'x'; -- (planted)" }] },
  { id: 'PC6', suite: 'static', expect: ['P5'], what: 'the migration grants on a platform schema', edits: [{ f: V + '990_finalize.sql', append: 'grant usage on schema auth to factory_node_api; -- (planted)' }] },
  { id: 'PC7', suite: 'static', expect: ['P2'], what: 'a function compares the current time with a fixed date', edits: [{ f: V + '100_node_common.sql', append: "create function factory._qa_pc7() returns boolean language plpgsql set search_path = pg_catalog, pg_temp as $p$ begin if now() > '2026-10-01'::timestamptz then return true; end if; return false; end $p$; -- (planted)" }] },
  { id: 'PC8', suite: 'static', expect: ['P2'], what: 'the Edge compares its database URL with a loopback address', edits: [{ f: EDGE + 'db.ts', after: "if (!url) return no('the database URL is unset');", add: "  if (url.includes('127.0.0.1')) return no('planted'); // (planted)" }] },
  { id: 'PC10', suite: 'static', expect: ['P3'], what: 'a new function branches on a setting whose value differs between planes', edits: [{ f: V + '100_node_common.sql', append: "create function factory._qa_pc10() returns boolean language sql stable set search_path = pg_catalog, pg_temp as $p$ select current_setting('server_version_num')::int >= 170000 $p$; -- (planted)" }] },
  { id: 'PC9', suite: 'static', expect: ['P2'], what: 'a SECURITY DEFINER body reads the superuser status of current_user (the owner)', edits: [{ f: V + '100_node_common.sql', append: 'create function factory._qa_pc9() returns boolean language plpgsql security definer set search_path = pg_catalog, pg_temp as $p$ begin return (select r.rolsuper from pg_catalog.pg_roles r where r.rolname = current_user); end $p$; -- (planted)' }] },
  // the plane scan's Director rulings (CR-disposition record): a ruling is held to the Director's record, and only the CR-021 ruling
  // admits a branch in own-plane addressing
  { id: 'RLQ', suite: 'static', expect: ['P3p'], what: 'an inventory ruling quotes a class the Director\'s decision does not contain', edits: [
    { f: 'qa/scenarios-runner/factory_v1_plane_scan_inventory.mjs', line: "const CR021_EDGE = { cr: 'CR-021', quote:", to: "const CR021_EDGE = { cr: 'CR-021', quote: 'is classed own-plane addressing, a branch on any configuration value included' }; // (planted) a quote the decision does not contain" }] },
  { id: 'RLA', suite: 'static', expect: ['P3p'], what: 'an inventory class rests on a change request the Director RECORDED, not APPROVED (CR-010)', edits: [
    { f: 'qa/scenarios-runner/factory_v1_plane_scan_inventory.mjs', line: "const CR022_CHANNEL = { cr: 'CR-022',", to: "const CR022_CHANNEL = { cr: 'CR-010', quote: 'r3 reading stands' }; // (planted) a decision that approves no class" }] },
  { id: 'RLP', suite: 'static', expect: ['P3p'], what: 'a ruled UNTRACED entry is marked pending again', edits: [
    { f: 'qa/scenarios-runner/factory_v1_plane_scan_inventory.mjs', line: "called by the trigger factory._tenant_admins_guard)', cls: 'same-on-every-plane', ruling: CR026, construction: STEP3_FIXED,", to: "  { file: STEPS, construct: 'session_user (factory._via_api, called by the trigger factory._tenant_admins_guard)', cls: 'same-on-every-plane', ruling: CR026, construction: STEP3_FIXED, pending: 'CR-026 (planted)'," }] },
  { id: 'RLB', suite: 'static', expect: ['P3'], what: 'an Edge configuration branch is proposed own-plane without the CR-021 ruling (own-plane admits no branch otherwise)', edits: [
    { f: 'qa/scenarios-runner/factory_v1_plane_scan_inventory.mjs', line: "value: 'FACTORY_ADMIN_DB_URL+FACTORY_NODE_DB_URL', count: 17, cls: 'own-plane', ruling: CR021_EDGE,", to: "  { file: EDGE + '_shared/db.ts', construct: 'env-branch', fn: '-', value: 'FACTORY_ADMIN_DB_URL+FACTORY_NODE_DB_URL', count: 17, cls: 'own-plane', // (planted) no ruling" }] },
  { id: 'RLD', suite: 'static', expect: ['P3p'], what: 'the static contract reads the rulings at r3, which records no CR decision, instead of the Director\'s CR-disposition record', edits: [
    { f: 'qa/scenarios-runner/factory_v1_static_contract.mjs', line: "const CR_DISPOSITION_COMMIT = '", to: "const CR_DISPOSITION_COMMIT = 'c7a845b61a3b0b419e8c9dfeff397547fdc75b03'; // (planted) the r3 commit" }] },
  { id: 'M0F', suite: 'static', expect: ['M0'], what: 'a 69df2f52 control-plane file is changed', edits: [{ f: 'supabase/control-plane/001_factory_control_plane.sql', append: '-- (planted) a changed 69df2f52 control-plane file' }] },
  { id: 'TXC', suite: 'static', expect: ['M1'], what: 'a transaction-control statement added to the migration', edits: [{ f: V + '990_finalize.sql', append: 'commit; -- (planted)' }] },
  { id: 'SM2s', suite: 'static', expect: ['M3'], what: 'a migration statement calls a function that writes the S-16(a) binding', edits: [
    { f: V + '100_node_common.sql', append: 'create function factory._qa_sm2() returns void language sql set search_path = pg_catalog, pg_temp as $p$ update factory.computers set s16a_bound_at = now(), s16a_bound_by = created_by $p$; -- (planted)' },
    { f: V + '990_finalize.sql', append: 'select factory._qa_sm2(); -- (planted)' }] },
  { id: 'SM3d', suite: 'static', expect: ['M3'], what: 'a migration statement drops the S-16(a) binding column', edits: [{ f: V + '990_finalize.sql', append: 'set local role factory_owner; alter table factory.computers drop column s16a_bound_by; reset role; -- (planted)' }] },
  { id: 'SM3y', suite: 'static', expect: ['M3'], what: 'a DO block writes the S-16(a) binding through dynamic SQL whose identifiers are format() arguments', edits: [{ f: V + '990_finalize.sql', append: "do $p$ begin execute format('update %I.%I set s16a_bound_at = now()', 'factory', 'computers'); end $p$; -- (planted)" }] },
  { id: 'SM3t', suite: 'static', expect: ['M3'], what: 'a trigger attached through format() on factory.%I fires a function that writes the S-16(a) binding when the migration writes a factory table', edits: [
    { f: V + '100_node_common.sql', append: 'create function factory._qa_bind() returns trigger language plpgsql set search_path = pg_catalog, pg_temp as $p$ begin update factory.computers set s16a_bound_at = now(), s16a_bound_by = created_by; return null; end $p$; -- (planted)' },
    { f: V + '100_node_common.sql', append: "do $p$ begin execute format('create trigger qa_bind after insert on factory.%I for each statement execute function factory._qa_bind()', 'tenants'); end $p$; -- (planted)" }] },
  { id: 'ATCs', suite: 'static', expect: ['PA3'], what: 'the atomic consume\'s code lock, read from the source', edits: [condOff(V + '150_enrollment.sql', 'select x.* into code from factory.pairing_codes x where x.code_id = e0.code_id for no key update;', 'select x.* into code from factory.pairing_codes x where x.code_id = e0.code_id; -- (planted) no code lock')] },
];

// the rows of each suite that read server state back, or observe the behaviour itself (a 'semantic' mutant must name one of them)
const READBACK_ROWS = {
  admin: ['E1b', 'E1n', 'E1t', 'E1a', 'E1e', 'Q1', 'R1', 'E2', 'P4', 'L3', 'L5', 'L6', 'G2', 'L1', 'L7'],
  schema: ['C3', 'C3s', 'C4', 'C7', 'C8', 'C9', 'C12', 'L4', 'L5', 'L7', 'W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'E9', 'M1', 'M2', 'M3'],
  takeover: ['T6', 'T7', 'T8', 'X4'],
  legacydirector: ['LD0', 'LD1', 'LD2', 'LD3', 'LD4', 'LD5', 'LD6', 'LD7'],
  release: ['R-b0'],
  pairing: ['PC4', 'PC6'],
};
const layerOf = (m) => m.layer || (m.suite === 'static' ? 'source' : 'semantic');

// THE §3.10 COVERAGE MAP (L7-21): every guard of VERIFICATION_SPEC §3 step 10's table - read from the designated Director commit, the
// first cell of each row split at '; ' - is mapped to its sub-guards, and each sub-guard to the developer mutants that revert it, or to
// the reason no developer mutant can (a clean-VM rehearsal, the Director instrument, the verifier's own procedure). `accept` names the
// layers that count for that row (the table's row: a read-back or behaviour row by default; "the static scan" or "the tool refuses to
// build the step" accept a source row; "the step aborts on the copy" accepts the Director instrument's check). Every sub-guard needs a
// mutant at an accepted layer or a stated reason (COV4); a `layered` note only explains why some of its mutants are judged at another
// layer, and never stands in for one. The verifier plants its own mutants; this map is the implementer's evidence.
const SRC = ['source'], STEP = ['step'];
const SPEC_310 = {
  'revocation re-check inside the transaction': [{ g: 'the per-call credential re-check, and its serialization with a revoke', mutants: ['RV', 'LK'] }],
  'release-signature check': [{ g: 'an unsigned or badly signed release refused', mutants: ['RUa', 'RU', 'RSG', 'RSGu'] }],
  'pinned trust set (a manifest-named key accepted)': [{ g: 'a key named by the manifest used', mutants: ['MK', 'MKu'],
    layered: 'the plane\'s published-state gate (S-5, L4-F2) refuses the unpublished sentinel next, so the single-layer revert is observed by the refusal name and the sentinel never runs; RUa proves the signature layer with that gate also reverted' }],
  'dev-key refusal in a production-channel build': [{ g: 'the runtime\'s dev-key refusal, and the build\'s', mutants: ['DR', 'DK', 'DKb', 'DKd'],
    layered: 'the pinned production trust set holds no dev key, so a runtime whose dev-key refusal is removed still refuses the signature by key_outside_trust_set (the same outcome, another name): DR\'s rows read the sentinel not run; DK/DKb prove the order and the build refusal' }],
  'trust mode or key taken from runtime input': [{ g: 'from the environment, a configuration file, a file beside the exe, the API\'s answer, the revocation file', mutants: ['KE', 'KC', 'KX', 'KA', 'KS', 'KEu', 'KCu', 'KAu', 'KSu'] }],
  'anti-downgrade': [{ g: 'the runtime\'s and the server\'s', mutants: ['RD', 'G4b', 'KR'] }],
  'checkpoint fence inside the front door': [{ g: 'a stale run\'s checkpoint refused', mutants: ['FN'] }],
  'envelope self-change': [{ g: 'a node writes its own envelope through a front door', mutants: ['ESf'] }],
  'tenant / identity / agent taken from the body': [
    { g: 'the tenant (E1t: the named tenant\'s work order, its runs and lock)', mutants: ['IDT'] }, { g: 'the identity (node) (E1n: the named node\'s row)', mutants: ['IDN'] },
    { g: 'the agent (principal and computer) (E1a: the runs under the named agent)', mutants: ['IDA'] },
    { g: 'both refusal layers (E1b: the caller\'s own work order moves; the control IDR also proves no victim row moves without IDN / IDT / IDA\'s act)', mutants: ['IDR', 'ID'] }],
  'each eligibility gate, removed singly': [{ g: 'gates 2-12 and their sub-checks', mutants: ['G2', 'G3', 'G4a', 'G4b', 'G5', 'G6a', 'G6b', 'G7h', 'G7f', 'G8', 'G9', 'G10a', 'G10b', 'G11a', 'G11b', 'G11c', 'G12', 'G1n', 'G1s', 'RV'] }],
  'envelope-sourced gate 6 replaced by self-report': [{ g: 'gate 6 reads self-reported capabilities', mutants: ['G6s'] }],
  'the preference-deferral bound': [{ g: 'the 30 s bound', mutants: ['DB', 'PX1', 'PX2'] }],
  'independence reduced to run-only': [{ g: 'identity at gate 7 and the floor', mutants: ['IN'] }],
  'the authoring set reduced to the completing run': [{ g: 'the authoring set', mutants: ['IN2'] }],
  'the policy floor in the front door': [{ g: 'each floor check, reached past gate 7', mutants: ['FLP', 'FLR', 'FLI', 'FLA', 'FLS', 'FLF', 'FLC', 'FLU', 'CKF'] }],
  'the stricter-only policy guard': [{ g: 'front door and table guard', mutants: ['PS'] }],
  'the legacy-privilege revocation and guard': [
    { g: 'the default-privilege revocation', mutants: ['LDa', 'LD'] }, { g: 'the legacy EXECUTE revocation', mutants: ['LX'] },
    { g: 'the guard', mutants: ['LG', 'LG2'] }],
  'the legacy guard on new-model and enrolled rows': [{ g: 'updates, inserts and the enrolled node-id namespace', mutants: ['LG', 'LG2', 'LG3', 'F3', 'F3L', 'F3N', 'F3R', 'RC'] }],
  'a role granted to `factory_runner`, or an API role that is a member of it': [{ g: 'a role granted to factory_runner', mutants: ['LR'] }, { g: 'an API role a member of factory_runner', mutants: ['LR2'] }],
  'rotate or re-pair issues a new principal': [{ g: 'rotate', mutants: ['RRn'] }, { g: 're-pair', mutants: ['RPn'] }],
  'certification not bound to its work order and exact provenance': [{ g: 'work order and candidate provenance', mutants: ['CP'] }],
  'the watchdog or autostart removed': [{ g: 'the watchdog and the autostart', env: 'the R-1 rehearsal on a freshly installed machine, logged on as a standard user: runtime_acceptance U2 / U4b need the logon task of such a machine; not reproducible as a developer mutant on the implementing PC' }],
  'a retry that issues a new code or credential': [{ g: 'setup and the runtime retrying', mutants: ['SRS', 'ENL', 'ENR'],
    env: 'and the R-1 rehearsal on a freshly installed machine for the double-clicked artifact' }],
  'setup that requires elevation': [{ g: 'elevation', env: 'the R-1 rehearsal on a freshly installed machine, logged on as a standard user: the implementing PC\'s user is an administrator' }],
  'a migration statement that changes one manifest evidence field, directly or through a deferred constraint trigger': [
    { g: 'directly', mutants: ['EVF'], accept: STEP }, { g: 'through a deferred constraint trigger', mutants: ['DCT'], accept: STEP, layered: 'DCT leaves the deferrable trigger the step\'s check refuses; one that also changed a field would abort the same way' }],
  'a deferrable constraint trigger, a deferrable exclusion constraint or a holdable cursor left by the migration': [
    { g: 'a deferrable constraint trigger', mutants: ['DCT'], accept: STEP },
    { g: 'a deferrable exclusion constraint or a holdable cursor', director: 'the Director instrument\'s check 4 (build_live_migration_step.mjs); rehearsed by the verifier on the copy' }],
  'a transaction-control statement, a backslash outside a dollar-quoted body, a psql variable reference or a COPY added to the migration': [
    { g: 'each construct', mutants: ['TXC'], accept: SRC, layered: 'static M1n plants each of the eight constructs into the step build and requires the refusal of each' }],
  'a guard, front door or handler conditioned on plane identity, on a setting whose value differs between planes, or on the current time compared with a fixed date': [
    { g: 'plane identity', mutants: ['PC1', 'PC1i'], accept: SRC }, { g: 'a setting', mutants: ['PC10'], accept: SRC }, { g: 'the current time against a fixed date', mutants: ['PC7'], accept: SRC },
    { g: 'an Edge handler', mutants: ['PC4', 'PC8'], accept: SRC }],
  'a column-level grant to `factory_runner` on an authority table': [{ g: 'a column grant', mutants: ['CG'] }],
  'a migration file left out of the step': [{ g: 'the file list', verifier: 'the verifier builds the step from every file the candidate adds (§3.1, §3.3); the developer M1 builds from the same git-derived list' }],
  'a change to a `69df2f52` control-plane file or to a file a founder-applied step embedded': [{ g: 'a 69df2f52 control-plane file', mutants: ['M0F'], accept: SRC },
    { g: 'a file a founder-applied step embedded', verifier: 'no founder-applied step exists yet; the verifier compares against the event log (§3.1)' }],
  'a migration that ends with SET ROLE and a row-security policy whose function writes an evidence field': [{ g: 'SET ROLE and a policy', director: 'the Director instrument\'s wrapper (reset session authorization; reset role; row_security off) and its check abort the step; rehearsed by the verifier on the copy' }],
  'a migration statement or SECURITY DEFINER body conditioned on the applying role\'s superuser status or memberships': [
    { g: 'a migration statement (AC-9, the static scan)', mutants: ['PC2', 'CU'], accept: SRC }, { g: 'a SECURITY DEFINER body (AC-9, the static scan)', mutants: ['PC9'], accept: SRC },
    { g: 'a migration statement (AC-12, read back on the applying-role plane: superuser status; membership)', mutants: ['SUd', 'MBd'] },
    { g: 'a SECURITY DEFINER body (AC-12, the front door\'s behaviour on a plane whose owner is not a superuser)', mutants: ['DSU'] }],
  'a lapsed enrolled lock that the legacy pick treats as free': [{ g: 'the lock the front door writes', mutants: ['LL'] }],
  'trust material or configuration read from the certificate table': [{ g: 'trust and endpoint', mutants: ['CT', 'CTu', 'CE'] }],
  'the legacy guard failing the frozen claim when an enrolled lease has lapsed': [{ g: 'skip, never fail', mutants: ['LG3'] }],
  'pairing HMAC / atomic consume / per-locator cap': [{ g: 'the HMAC', mutants: ['PH'] }, { g: 'atomic consume', mutants: ['ATC', 'CCB'], layered: 'two completes of ONE enrollment are also serialized by the enrollment row lock (PC6 holds without the code lock); the code lock is observed by PC4, a complete racing the revocation or reissue of its code' }, { g: 'the per-locator cap', mutants: ['PC'] }],
  'numeric priority': [{ g: 'priority ordered as a number', mutants: ['NP'] }],
  'an unbound registration reporting a bound record\'s fingerprint accepted': [{ g: 'the S-14 refusal', mutants: ['SB', 'SB2'] }],
  'the binding dropped on archive': [{ g: 'archive keeps the binding', mutants: ['BA'] }],
  'the Home-computer restriction keyed to the bound record alone': [{ g: 'a record reporting the bound fingerprint', mutants: ['G7f'] }],
  'the pairing secret generated deterministically': [{ g: 'the CSPRNG', mutants: ['PD'] }],
  'legacy EXECUTE on a front door': [{ g: 'EXECUTE for factory_runner', mutants: ['LX'] }],
  'the reserved-capability guard': [{ g: 'factory-enrolled-v1 written by the legacy path', mutants: ['RC'] }],
  'principal minting by a node': [{ g: 'a node front door mints a principal', mutants: ['RRn'] },
    { g: 'the Node API role may insert principals', mutants: ['PR'], layered: 'the authority guard refuses the insert next; C9 reads the grant back from the catalog' }],
  'a candidate migration that seeds a computer, agent principal or credential, or writes an S-16(a) binding': [
    { g: 'a computer', mutants: ['SMc'] }, { g: 'an agent principal', mutants: ['SMp'] },
    { g: 'a credential', mutants: ['SMk'], layered: 'a credential needs the computer, principal, pairing code and enrollment the credential guard binds it to, which SMk seeds with it; W3 fails with node_credentials = 1 in its detail' },
    { g: 'the S-16(a) binding (a default; a write through a called function; a dropped column; dynamic SQL; a trigger attached through format())', mutants: ['SBd', 'SM2s', 'SM3d', 'SM3y', 'SM3t'] }],
  'the S-7 route and operation list': [{ g: 'the Node API routes', mutants: ['S7', 'S7b', 'S7bs'] }, { g: 'the API roles\' operations', mutants: ['S7N', 'S7A'] }],
  'the `tenant_admins` condition': [{ g: 'tenant_admins required', mutants: ['TA'] }],
  'the tier `founder` check': [{ g: 'tier founder', mutants: ['TF1', 'TF'] }],
  'the live-role-founder check on founder-only actions': [{ g: 'live role founder', mutants: ['TF2', 'TF'] }],
};
/** the guard phrases of the Director's table (§3 step 10), read from the designated Director commit */
function specPhrases() {
  const director = process.env.FACTORY_DESIGNATED_DIRECTOR || 'f6ec0bf3ca01443121fa09644213ae9214f78ba5';
  const r = spawnSync('git', ['-C', ROOT, 'show', director + ':qa/verification/auto-enrollment-v1/VERIFICATION_SPEC.md'], { encoding: 'utf8', maxBuffer: 1 << 26, windowsHide: true });
  if (r.status !== 0) throw new Error('the designated Director commit ' + director + ' is not in this repository');
  const lines = r.stdout.replace(/\r\n/g, '\n').split('\n');
  const at = lines.findIndex((l) => /^\s*\| guard reverted \| row that fails \|\s*$/.test(l));
  if (at < 0) throw new Error('VERIFICATION_SPEC.md at ' + director.slice(0, 8) + ' has no step-10 table');
  const out = [];
  for (let i = at + 2; i < lines.length && /^\s*\|/.test(lines[i]); i++) {
    const first = lines[i].trim().replace(/^\|\s*/, '').split(/\s\|\s/)[0];
    for (const p of first.split('; ')) out.push({ phrase: p.trim(), row: lines[i].trim().split(/\s\|\s/).slice(-1)[0].replace(/\s*\|\s*$/, '') });
  }
  return out;
}
function coverage() {
  const phrases = specPhrases();
  const ids = new Set(MUTANTS.map((m) => m.id));
  const byId = new Map(MUTANTS.map((m) => [m.id, m]));
  const bad = [];
  for (const { phrase } of phrases) if (!SPEC_310[phrase]) bad.push('COV1 unmapped guard: ' + phrase);
  for (const p of Object.keys(SPEC_310)) if (!phrases.some((x) => x.phrase === p)) bad.push('COV2 stale entry (no such guard in the table): ' + p);
  for (const [p, subs] of Object.entries(SPEC_310)) {
    if (!Array.isArray(subs) || !subs.length) { bad.push('COV4 no sub-guard: ' + p); continue; }
    for (const s of subs) {
      for (const id of s.mutants || []) if (!ids.has(id)) bad.push('COV3 no mutant ' + id + ' (' + p + ')');
      const accept = s.accept || ['semantic'];
      const reason = s.env || s.director || s.verifier;
      const counted = (s.mutants || []).filter((id) => byId.has(id) && accept.includes(layerOf(byId.get(id))));
      // (a `layered` note explains a mutant judged at another layer; it never stands in for a mutant at an accepted layer)
      if (!reason && !counted.length) bad.push('COV4 ' + p + ' / ' + s.g + ': no mutant at an accepted layer (' + accept.join(', ') + '), and no stated reason');
    }
  }
  // a 'semantic' mutant names a row that reads state back in its suite
  for (const m of MUTANTS) if (m.layer === 'semantic' && !(READBACK_ROWS[m.suite] || []).some((r) => m.expect.includes(r))) bad.push('COV5 ' + m.id + ' is tagged semantic but names no read-back row of suite ' + m.suite);
  // a control mutant's rows that must still pass are read-back rows of its suite, and none of them is also expected to fail
  for (const m of MUTANTS) if (m.pass && (!m.pass.length || m.pass.some((r) => m.expect.includes(r) || !(READBACK_ROWS[m.suite] || []).includes(r)))) bad.push('COV6 ' + m.id + ': its pass rows must be read-back rows of suite ' + m.suite + ' and disjoint from its expected rows');
  return { phrases: phrases.length, entries: Object.keys(SPEC_310).length, bad };
}

// ---------------------------------------------------------------------------------------------------------------------------------
const args = process.argv.slice(2);
const planOnly = args.includes('--plan');
if (args.includes('--coverage')) {
  const cov = coverage();
  for (const b of cov.bad) console.log(b);
  console.log('v1_mutation_proof --coverage: ' + cov.phrases + ' guard phrases in the Director\'s §3.10 table, ' + cov.entries + ' mapped; ' + (cov.bad.length ? cov.bad.length + ' problem(s)' : 'every guard mapped to a mutant at an accepted layer or a stated reason'));
  if (cov.bad.length) process.exit(1);
  if (!planOnly) process.exit(0);
}
const ids = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--controls');
const chosen = ids.length ? MUTANTS.filter((m) => ids.includes(m.id)) : MUTANTS;
const unknown = ids.filter((i) => !MUTANTS.some((m) => m.id === i));
const say = (s) => console.log(s);
const lf = (s) => s.replace(/\r\n/g, '\n');
const git = (a, cwd = ROOT) => spawnSync('git', a, { cwd, encoding: 'utf8', windowsHide: true });
if (unknown.length) { say('unknown mutant id(s): ' + unknown.join(', ')); process.exit(2); }

/** apply a mutant's edits to text by file; returns { texts } or throws VACUOUS */
function plant(m, readFile) {
  const texts = {};
  for (const e of m.edits) {
    let t = texts[e.f] ?? lf(readFile(e.f));
    // { f, append }: one line after the file's last line (a statement planted after everything the file does, e.g. after part 990's
    // self-check); an absent file is VACUOUS like an absent anchor
    if (e.append !== undefined) { texts[e.f] = t.replace(/\n*$/, '\n') + e.append + '\n'; continue; }
    const needle = e.line || e.after;
    const lines = t.split('\n');
    const hits = lines.map((l, i) => (l.includes(needle) ? i : -1)).filter((i) => i >= 0);
    if (hits.length !== 1) throw new Error('VACUOUS ' + m.id + ': "' + needle.slice(0, 70) + '" is on ' + hits.length + ' lines of ' + e.f + ' (must be exactly 1)');
    const i = hits[0];
    const indent = /^\s*/.exec(lines[i])[0];
    if (e.line) lines[i] = indent + e.to.trimStart();
    else lines.splice(i + 1, 0, e.add);
    const next = lines.join('\n');
    if (next === t) throw new Error('VACUOUS ' + m.id + ': the planted text equals the original in ' + e.f);
    texts[e.f] = next;
  }
  return texts;
}

const head = git(['rev-parse', 'HEAD']).stdout.trim();
// S-15: every suite of this proof runs with FACTORY_RUNNER_ENV_FILE naming an ABSENT absolute path (never the default
// runner.env), proved before anything runs (isolation.mjs)
const ISO = isolatedSuiteEnv();
const ISO_PROOF = planOnly ? null : isolationProof(ISO);
if (ISO_PROOF && !ISO_PROOF.ok) { say('REFUSED: the isolation proof failed - ' + isolationHeader(ISO, ISO_PROOF).join(' / ') + ' ' + (ISO_PROOF.error || '')); process.exit(2); }
if (ISO_PROOF) for (const l of isolationHeader(ISO, ISO_PROOF)) say(l);
say('v1_mutation_proof: ' + chosen.length + ' mutant' + (chosen.length === 1 ? '' : 's') + (planOnly ? ' (plan only)' : '') + ' on ' + ROOT + ' @ ' + head);
let vacuous = 0;
for (const m of chosen) {
  try { plant(m, (f) => fs.readFileSync(path.join(ROOT, f), 'utf8')); if (planOnly) say('PLANTED  ' + m.id.padEnd(5) + ' ' + m.suite.padEnd(12) + ' [' + layerOf(m) + '] expected FAIL ' + m.expect.join('|') + (m.pass ? ', must still PASS ' + m.pass.join(' ') : '') + ' - ' + m.what); }
  catch (e) { vacuous++; say(String(e.message)); }
}
if (planOnly || vacuous) { say('\nv1_mutation_proof: ' + (planOnly ? 'plan only - ' : '') + (chosen.length - vacuous) + ' of ' + chosen.length + ' mutants plant' + (vacuous ? '; ' + vacuous + ' VACUOUS' : '') + '; nothing was run'); process.exit(vacuous ? 1 : 0); }

function makeCopy(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bos-v1mut-'));
  const repo = path.join(dir, 'repo');
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
  for (const k of Object.keys(env)) if (/^GIT_(DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|COMMON_DIR)$/i.test(k)) delete env[k];
  const steps = [['clone', '-q', '--shared', '--no-checkout', ROOT, repo], ['-C', repo, 'sparse-checkout', 'set', '--no-cone', ...SPARSE], ['-C', repo, 'checkout', '-q', '--detach', head]];
  for (const s of steps) { const r = spawnSync('git', s, { encoding: 'utf8', env, windowsHide: true }); if (r.status !== 0) throw new Error('copy (' + label + '): git ' + s.slice(0, 3).join(' ') + ' failed: ' + (r.stderr || r.stdout)); }
  const top = spawnSync('git', ['-C', repo, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).stdout.trim();
  if (path.resolve(top).toLowerCase() !== path.resolve(repo).toLowerCase()) throw new Error('copy (' + label + '): its git top level is ' + top);
  fs.symlinkSync(NODE_MODULES, path.join(repo, 'node_modules'), 'junction');
  fs.mkdirSync(path.join(dir, 'tmp'));
  return { dir, repo };
}
function dropCopy(c) {
  const j = path.join(c.repo, 'node_modules');
  try { if (fs.lstatSync(j, { throwIfNoEntry: false })) fs.unlinkSync(j); } catch { try { fs.rmdirSync(j); } catch { /* checked */ } }
  if (fs.lstatSync(j, { throwIfNoEntry: false })) { say('LEFT     ' + c.dir + ' (its node_modules junction could not be unlinked; not deleted)'); return; }
  try { fs.rmSync(c.dir, { recursive: true, force: true }); } catch (e) { say('LEFT     ' + c.dir + ' (' + e.code + ')'); }
}
function runSuite(c, suite) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [SUITES[suite]], { cwd: c.repo, encoding: 'utf8', timeout: RUN_TIMEOUT_MS, maxBuffer: 1 << 28, windowsHide: true,
    env: { ...ISO.env, TEMP: path.join(c.dir, 'tmp'), TMP: path.join(c.dir, 'tmp'), FACTORY_RUNNER_PG_URL: '', FACTORY_RUNNER_ENV_FILE: ISO.envFile } });
  const out = (r.stdout || '') + (r.stderr || '');
  const failed = [...out.matchAll(/^FAIL (\S+)/gm)].map((x) => x[1]);
  const passed = [...out.matchAll(/^(?:OK|PASS)\s+(\S+)/gm)].map((x) => x[1]);
  const summary = (out.trim().split('\n').filter((l) => /_acceptance:|_interleaving:|_contract:|: \d+\/\d+ OK/.test(l)).pop() || '(no summary: exit ' + r.status + (r.error ? ' ' + r.error.code : '') + ')').trim();
  return { code: r.status, failed, passed, summary, secs: Math.round((Date.now() - t0) / 1000), tail: out.slice(-1200) };
}

// BOUNDED CHUNKS (one heavy job at a time, each short): --controls <file> keeps each suite's control result keyed by suite AND commit, so a
// later chunk on the SAME commit reuses it (a control from another commit is never reused); --control-only runs the controls and stops.
const ctlFileArg = args.indexOf('--controls');
const ctlFile = ctlFileArg >= 0 ? path.resolve(args[ctlFileArg + 1]) : null;
const cached = ctlFile && fs.existsSync(ctlFile) ? JSON.parse(fs.readFileSync(ctlFile, 'utf8')) : {};
const controls = {};
for (const [k, v] of Object.entries(cached)) if (k.endsWith('@' + head)) controls[k.slice(0, -head.length - 1)] = { ...v, cachedAt: v.at };
let killed = 0;
const survivors = [];
/** a control's standing: passed (every row), judges (passed, or failed ONLY rows red by design and ran to its summary), or failed */
function standing(suite, k) {
  const allowed = BY_DESIGN_RED[suite] || {};
  const passed = k.code === 0 && !k.failed.length;
  const completed = /_contract: \d+ passed|: \d+\/\d+ OK/.test(k.summary || '');   // a control that stopped part-way judges nothing
  const redByDesign = k.failed.filter((r) => allowed[r]);
  const redOther = k.failed.filter((r) => !allowed[r]);
  const judges = passed || (completed && k.failed.length > 0 && redOther.length === 0);
  return { passed, judges, redByDesign, redOther, allowed,
    label: passed ? 'passed' : judges ? 'FAILED ONLY ROWS RED BY DESIGN (' + redByDesign.map((r) => r + ': ' + allowed[r]).join('; ') + ')' : 'FAILED' };
}
for (const m of chosen) {
  if (!(m.suite in controls)) {
    const c = makeCopy('control ' + m.suite);
    try { controls[m.suite] = { ...runSuite(c, m.suite), at: new Date().toISOString() }; } finally { dropCopy(c); }
    const k = controls[m.suite];
    say('CONTROL  ' + m.suite.padEnd(12) + standing(m.suite, k).label + ' - ' + k.summary + ' (' + k.secs + ' s)');
    if (!standing(m.suite, k).passed) say(k.tail);
    if (ctlFile) { const all = fs.existsSync(ctlFile) ? JSON.parse(fs.readFileSync(ctlFile, 'utf8')) : {}; all[m.suite + '@' + head] = { code: k.code, failed: k.failed, passed: k.passed, summary: k.summary, secs: k.secs, at: k.at }; fs.writeFileSync(ctlFile, JSON.stringify(all, null, 2)); }
  } else if (controls[m.suite].cachedAt && !controls[m.suite].said) {
    controls[m.suite].said = true;
    say('CONTROL  ' + m.suite.padEnd(12) + standing(m.suite, controls[m.suite]).label + ' - ' + controls[m.suite].summary + ' (this commit, run ' + controls[m.suite].cachedAt + ')');
  }
  if (args.includes('--control-only')) continue;
  const k = controls[m.suite];
  // DIFFERENTIAL JUDGING, ONLY FOR ROWS RED BY DESIGN (BY_DESIGN_RED): a control whose only failing rows are listed there judges a
  // mutant on the expected rows it PASSED; a control failing any other row judges nothing (NOT JUDGED: the proof fails)
  const st = standing(m.suite, k);
  const controlOk = st.passed;
  const judgeable = !st.judges ? [] : controlOk ? m.expect : m.expect.filter((e) => (k.passed || []).includes(e) && !st.allowed[e]);
  // a control mutant's rows that must still pass were passed by the control
  const spare = m.pass || [];
  const spareUnjudgeable = spare.filter((e) => !(controlOk || (k.passed || []).includes(e)));
  if (!judgeable.length || spareUnjudgeable.length) {
    survivors.push(m.id);
    say('NOT JUDGED ' + m.id + ': ' + (!st.judges ? 'the ' + m.suite + ' control failed ' + (st.redOther.join(' ') || '(no FAIL line: it stopped part-way)') + ' - not a row red by design'
      : !judgeable.length ? 'every expected row (' + m.expect.join('|') + ') is red by design or failed in the control' : 'the control did not pass ' + spareUnjudgeable.join(' ')));
    continue;
  }
  const c = makeCopy(m.id);
  let r;
  try {
    const texts = plant(m, (f) => fs.readFileSync(path.join(c.repo, f), 'utf8'));
    for (const [f, t] of Object.entries(texts)) fs.writeFileSync(path.join(c.repo, f), t);
    for (const [f, t] of Object.entries(texts)) if (lf(fs.readFileSync(path.join(c.repo, f), 'utf8')) !== t) throw new Error('the planted text did not read back: ' + f);
    r = runSuite(c, m.suite);
  } finally { dropCopy(c); }
  const hit = judgeable.filter((e) => r.failed.includes(e));
  // (a row that must still pass has to be seen PASSING, not merely absent from the FAIL lines)
  const spareBad = spare.filter((e) => !r.passed.includes(e));
  const ok = r.code !== 0 && hit.length > 0 && spareBad.length === 0;
  if (ok) killed++; else survivors.push(m.id);
  say((ok ? 'CAUGHT   ' : 'SURVIVED ') + m.id.padEnd(5) + ' ' + m.suite.padEnd(12) + ' [' + layerOf(m) + '] expected FAIL ' + m.expect.join('|')
    + (spare.length ? ', must still PASS ' + spare.join(' ') + (spareBad.length ? ' (NOT PASSED: ' + spareBad.join(' ') + ')' : ' (passed)') : '')
    + '; seen FAIL [' + r.failed.join(' ') + ']; ' + r.summary + ' (' + r.secs + ' s)'
    + (controlOk ? '' : ' (judged differentially: the control failed only ' + st.redByDesign.join(' ') + ', red by design)') + ' - ' + m.what);
  if (!ok) say(r.tail);
}
if (args.includes('--control-only')) {
  const bad = Object.entries(controls).filter(([s, k]) => !standing(s, k).judges).map(([s]) => s);
  const byDesign = Object.entries(controls).filter(([s, k]) => standing(s, k).judges && !standing(s, k).passed).map(([s, k]) => s + ' (' + k.failed.join(' ') + ')');
  say('\nv1_mutation_proof: controls only - ' + (bad.length ? 'FAILED: ' + bad.join(', ') : 'every control passed' + (byDesign.length ? ', except rows red by design: ' + byDesign.join(', ') : '')));
  process.exit(bad.length ? 1 : 0);
}
say('\nv1_mutation_proof: ' + killed + ' of ' + chosen.length + ' mutants killed' + (survivors.length ? '; NOT killed: ' + survivors.join(', ') : ''));
process.exit(survivors.length ? 1 : 0);
