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
// A CONTROL (the unmutated copy) runs each suite first; a suite whose control fails judges nothing and the proof fails.
// KILLED = the suite exits non-zero AND one of the rows named for that defect is among its FAIL lines (other rows failing too is
// collateral, listed, never required). A guard with two layers (the Edge and the front door; the claim gate and the certify floor) is
// reverted in BOTH by one mutant: the invariant is the pair, and a single layer reverted alone is recorded as covered by the other.
// NOTHING IS SKIPPED: an anchor that is absent or not unique makes the mutant VACUOUS and the proof fail.
// Windows x64 (the suites start a disposable PostgreSQL 18 through embedded-postgres; the release rows build Windows SEAs).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const V = 'supabase/control-plane/v1/';
const EDGE = 'supabase/control-plane/edge/supabase/functions/_shared/';
const SUITES = {
  eligibility: 'qa/factory/v1/eligibility_acceptance.mjs', admin: 'qa/factory/v1/admin_acceptance.mjs', schema: 'qa/factory/v1/schema_acceptance.mjs',
  revocation: 'qa/factory/v1/revocation_interleaving.mjs', takeover: 'qa/factory/v1/takeover_acceptance.mjs', independence: 'qa/factory/v1/independence_acceptance.mjs',
  enrollment: 'qa/factory/v1/enrollment_acceptance.mjs', tls: 'qa/factory/v1/edge_db_tls_acceptance.mjs', release: 'qa/factory/v1/release_acceptance.mjs',
};
const SPARSE = ['/supabase/control-plane/', '/scripts/', '/qa/factory/', '/qa/verification/auto-enrollment-v1/', '/package.json', '/package-lock.json', '/.gitignore'];
const RUN_TIMEOUT_MS = 45 * 60 * 1000;
const NODE_MODULES = path.join(ROOT, 'node_modules');

// an edit: { f, line: <needle>, to: <the new line> }   the ONE line containing the needle is replaced (its indentation kept)
//          { f, after: <needle>, add: <new line> }     a line is inserted after the ONE line containing the needle
const gateOff = (n, needle) => ({ f: V + '110_eligibility.sql', line: needle, to: 'null; -- (planted) gate ' + n + ' removed' });
const condOff = (f, needle, to) => ({ f, line: needle, to });
const MUTANTS = [
  // ---- AC-15: each eligibility gate, removed singly (gate 1 is enforced by the per-call credential re-check: RV below)
  { id: 'G2', suite: 'eligibility', expect: ['G1-G12'], what: 'gate 2 (tenant) removed', edits: [gateOff(2, "return factory._gate(2, 'the work order belongs to another tenant');")] },
  { id: 'G3', suite: 'eligibility', expect: ['G1-G12', 'O1'], what: 'gate 3 (company scope) removed', edits: [gateOff(3, "return factory._gate(3, 'the envelope is narrowed to other companies');")] },
  { id: 'G4a', suite: 'eligibility', expect: ['G1-G12', 'O1'], what: 'gate 4 (the envelope\'s work types) removed', edits: [gateOff(4, "return factory._gate(4, 'the envelope does not authorize work type '")] },
  { id: 'G4b', suite: 'eligibility', expect: ['G4r'], what: 'gate 4 (a current certified release) removed', edits: [gateOff(4, "return factory._gate(4, 'the node does not run a current certified release")] },
  { id: 'G5', suite: 'eligibility', expect: ['G1-G12', 'O1'], what: 'gate 5 (required role) removed', edits: [gateOff(5, "return factory._gate(5, 'the envelope does not authorize role '")] },
  { id: 'G6a', suite: 'eligibility', expect: ['G1-G12', 'O1'], what: 'gate 6 (capabilities from the envelope) removed', edits: [condOff(V + '110_eligibility.sql', 'if exists (select 1 from unnest(req) c where not (c = any (p_ctx.authorized_capabilities))) then', 'if false then -- (planted) gate 6 envelope removed')] },
  { id: 'G6b', suite: 'eligibility', expect: ['D1'], what: 'gate 6 (detection only restricts) removed: a capability the node detects as absent no longer makes it ineligible', edits: [condOff(V + '110_eligibility.sql', 'if exists (select 1 from unnest(req) c where absent ? c) then', 'if false then -- (planted) gate 6 detection removed')] },
  { id: 'G7h', suite: 'eligibility', expect: ['H1'], what: 'gate 7 (the S-16(a) authoring restriction) removed', edits: [condOff(V + '110_eligibility.sql', 'if p_ctx.s16a_bound and paths is not null and not factory._surfaces_within(', 'if false then -- (planted) S-16(a) removed')] },
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
  { id: 'LK', suite: 'revocation', expect: ['I1', 'I2', 'I3a', 'I3b', 'I4'], what: 'no share lock on the credential row: a call and a revoke no longer serialize', edits: [condOff(V + '100_node_common.sql', 'where c.credential_id = p_credential_id for share;', 'select c.* into cred from factory.node_credentials c where c.credential_id = p_credential_id; -- (planted) no share lock')] },

  // ---- AC-9: the checkpoint fence inside the front door
  { id: 'FN', suite: 'takeover', expect: ['T6'], what: 'a checkpoint no longer checks that the run is still this node\'s (stale-worker fence removed)', edits: [condOff(V + '120_node_lifecycle.sql', "'node.checkpoint', 'run', p_body ->> 'run_id', 'refused', 'lease_lost');", "null; -- (planted)"), { f: V + '120_node_lifecycle.sql', line: "return factory._refusal('lease_lost', 409, 'this run is no longer this node''s (its lease was taken over): checkpoint not written');", to: 'null; -- (planted) checkpoint fence removed' }] },

  // ---- AC-6: identity, tenant and agent never from the body (both layers: the Edge and the front doors)
  { id: 'ID', suite: 'admin', expect: ['E1'], what: 'a body naming node / tenant / role / principal is accepted at the Edge AND in the front doors', edits: [
    condOff(EDGE + 'node_api.ts', 'if (IDENTITY_FIELDS.has(k)) return', "    if (false) return { ok: false, res: refuse(400, 'identity_from_body_refused', 'planted') }; // (planted)"),
    { f: V + '100_node_common.sql', line: "as $$ select case when factory._names_identity(p) is not null then factory._refusal('identity_from_body_refused', 400,", to: "as $$ select case when false then factory._refusal('identity_from_body_refused', 400," }] },

  // ---- AC-7: the S-7 route list; the tenant_admins condition and its tier
  { id: 'S7', suite: 'admin', expect: ['R1'], what: 'a route outside S-7 (GET /v1/debug) answers', edits: [{ f: EDGE + 'node_api.ts', after: "'GET /v1/time': 'select factory.node_time() as r',", add: "  'GET /v1/debug': 'select factory.node_time() as r', // (planted)" }] },
  { id: 'TA', suite: 'admin', expect: ['P1', 'P2'], what: 'factory.tenant_admins no longer required: the live role alone makes a Factory admin', edits: [condOff(V + '200_admin_common.sql', 'if n = 0 then', 'if false then -- (planted) tenant_admins not required')] },
  { id: 'TF', suite: 'admin', expect: ['P4'], what: 'founder-only actions no longer need tier founder AND live role founder', edits: [condOff(V + '200_admin_common.sql', "if p_founder_only and not (tr = 'founder' and p_live_role = 'founder') then", 'if false then -- (planted) founder tier not required')] },
  { id: 'RT', suite: 'admin', expect: ['R1p', 'X0'], what: 'the platform path prefix is not stripped (every deployed call would be 404)', edits: [condOff(EDGE + 'route.ts', "return basePath && pathname.startsWith(basePath + '/') ? pathname.slice(basePath.length) : pathname;", 'return pathname; // (planted)')] },

  // ---- AC-12: the stricter-only policy guard (both layers: the front door and the table guard)
  { id: 'PS', suite: 'admin', expect: ['G1'], what: 'a policy may be relaxed through the Admin API (front door and guard)', edits: [
    condOff(V + '220_admin_releases_policies_work.sql', 'if (p.require_distinct_run and not b1) or (p.require_distinct_identity and not b2) or (p.require_verifier_authority and not b3)', 'if false and ((p.require_distinct_run and not b1) or (p.require_distinct_identity and not b2) or (p.require_verifier_authority and not b3) -- (planted)'),
    condOff(V + '220_admin_releases_policies_work.sql', 'or not (paths <@ p.director_document_paths) or (b5 and cardinality(paths) = 0) then', 'or not (paths <@ p.director_document_paths) or (b5 and cardinality(paths) = 0)) then'),
    condOff(V + '080_guards.sql', "perform factory._refuse('factory_policy_refused', 'a policy can only be made stricter through the Admin API (S-14)');", 'null; -- (planted) stricter-only guard removed')] },

  // ---- AC-12 / AC-10: the legacy fence and least privilege
  { id: 'LD', suite: 'schema', expect: ['C3', 'C7', 'L1', 'L1r', 'P1', 'X0'], what: 'the baseline default-privilege grant to factory_runner is no longer revoked for the new tables', edits: [condOff(V + '000_preconditions_roles.sql', "execute format('alter default privileges for role %I in schema factory revoke all on tables from factory_runner', r.owner);", 'null; -- (planted)')] },
  { id: 'LX', suite: 'schema', expect: ['C6', 'L2', 'P1', 'X0'], what: 'factory_runner may EXECUTE a node front door', edits: [{ f: V + '190_node_grants.sql', after: '  to factory_node_api;', add: 'grant execute on function factory.node_heartbeat(bytea, jsonb) to factory_runner; -- (planted)' }] },
  { id: 'LR', suite: 'schema', expect: ['C8', 'L7', 'P1', 'X0'], what: 'an API role is granted to factory_runner', edits: [{ f: V + '190_node_grants.sql', after: '  to factory_node_api;', add: 'grant factory_node_api to factory_runner; -- (planted)' }] },
  { id: 'PR', suite: 'schema', expect: ['C9', 'P1', 'X0'], what: 'the Node API role may insert principals directly (a node could mint a principal)', edits: [{ f: V + '190_node_grants.sql', after: '  to factory_node_api;', add: 'grant insert on factory.agent_principals to factory_node_api; -- (planted)' }] },
  { id: 'LG', suite: 'schema', expect: ['L4'], what: 'the legacy guard lets factory_runner update or delete a new-model / enrolled row', edits: [condOff(V + '080_guards.sql', 'if old_nm then', 'if false then -- (planted) legacy writes to new-model rows allowed')] },
  { id: 'LG2', suite: 'schema', expect: ['L5'], what: 'the legacy guard lets factory_runner create a new-model row', edits: [condOff(V + '080_guards.sql', 'if new_nm then', 'if false then -- (planted)')] },
  { id: 'LG3', suite: 'schema', expect: ['M1', 'M2', 'M3'], what: 'the legacy guard FAILS the frozen claim on a lapsed enrolled row instead of leaving it unchanged', edits: [{ f: V + '080_guards.sql', after: 'if old_nm then', add: "      raise exception using errcode = '42501', message = 'factory_legacy_refused (planted)';" }] },
  { id: 'RC', suite: 'schema', expect: ['L3'], what: 'the reserved capability may be written on a node by the legacy path', edits: [condOff(V + '080_guards.sql', "if tg_table_name = 'nodes' and exists (", 'if false and exists ( -- (planted)')] },

  // ---- AC-14 / S-13: independence
  { id: 'IN', suite: 'independence', expect: ['(b)(c)', '(g)', '(j)', '(m)', '(n)'], what: 'independence reduced to run-only: an authoring identity may claim (gate 7) and certify (floor) its own candidate', edits: [
    condOff(V + '110_eligibility.sql', 'a where a.principal_id = p_ctx.principal_id) then', 'if false then -- (planted) S-13 identity gate removed'),
    condOff(V + '130_verification.sql', 'where s.principal_id = ctx.principal_id) then', 'elsif false then -- (planted) S-13 identity floor removed')] },
  { id: 'IN2', suite: 'independence', expect: ['(j)'], what: 'the authoring set reduced to the completing run (a taken-over author may verify)', edits: [condOff(V + '110_eligibility.sql', "where r.work_order_id = p_work_order and coalesce(r.run_kind, 'authoring') = 'authoring'", 'where r.run_id = p_candidate_run -- (planted) only the completing run')] },
  { id: 'CP', suite: 'independence', expect: ['(o2)'], what: 'a certification is not bound to its work order and exact candidate provenance', edits: [
    condOff(V + '130_verification.sql', "elsif (p_body ->> 'work_order_id') is distinct from w.work_order_id::text", "elsif false and ((p_body ->> 'work_order_id') is distinct from w.work_order_id::text -- (planted)"),
    condOff(V + '130_verification.sql', "or ((p_body ->> 'candidate_commit') is not null and (p_body ->> 'candidate_commit') is distinct from cand.head_commit) then", "or ((p_body ->> 'candidate_commit') is not null and (p_body ->> 'candidate_commit') is distinct from cand.head_commit)) then")] },

  // ---- AC-8: pairing
  { id: 'PH', suite: 'enrollment', expect: ['EN9', 'EN19'], what: 'the code\'s HMAC is not compared: any secret with a live locator enrolls', edits: [condOff(V + '150_enrollment.sql', 'if code.pepper_version <> p_pepper_version or not factory._mac_equal(code.code_mac, p_mac) then', 'if false then -- (planted) HMAC not compared')] },
  { id: 'PC', suite: 'enrollment', expect: ['EN9'], what: 'the per-locator failure cap is 500 instead of 5', edits: [
    condOff(V + '150_enrollment.sql', "state = case when failed_attempts + 1 >= 5 then 'PAIRING_REVOKED' else state end,", "state = case when failed_attempts + 1 >= 500 then 'PAIRING_REVOKED' else state end,"),
    condOff(V + '150_enrollment.sql', 'revoked_at = case when failed_attempts + 1 >= 5 then now() else revoked_at end,', 'revoked_at = case when failed_attempts + 1 >= 500 then now() else revoked_at end,'),
    condOff(V + '150_enrollment.sql', "revoke_reason = case when failed_attempts + 1 >= 5 then 'attempts_exceeded' else revoke_reason end", "revoke_reason = case when failed_attempts + 1 >= 500 then 'attempts_exceeded' else revoke_reason end"),
    condOff(V + '150_enrollment.sql', 'if code.failed_attempts + 1 >= 5 then', 'if code.failed_attempts + 1 >= 500 then')] },
  { id: 'PD', suite: 'enrollment', expect: ['EN15'], what: 'the pairing secret generated deterministically (a counter, not the CSPRNG)', edits: [condOff(EDGE + 'pairing.ts', 'const r = randomBytes(LOCATOR_CHARS + SECRET_CHARS);', 'const r = Uint8Array.from({ length: LOCATOR_CHARS + SECRET_CHARS }, (_, i) => (i * 7 + (globalThis.__qaCounter = ((globalThis.__qaCounter || 0) + 1))) & 255); // (planted)')] },

  // ---- S-10: TLS verify-full to the Factory database
  { id: 'TL', suite: 'tls', expect: ['T2', 'T3b', 'T6'], what: 'the Edge connects with ssl: \'require\' again (verifies nothing)', edits: [condOff(EDGE + 'db.ts', 'ssl: { ca: caPem, rejectUnauthorized: true } };', "return { prepare: false, max: pool, idle_timeout: 20, connect_timeout: 10, ssl: 'require' }; // (planted)")] },
  { id: 'IP', suite: 'tls', expect: ['T3a'], what: 'an IP-literal database host is accepted (the certificate\'s name goes unchecked)', edits: [condOff(EDGE + 'db.ts', 'if (!host || ipv4 || ipv6) return', "if (!host) return 'the database URL does not parse'; // (planted)")] },

  // ---- AC-5: the release trust root (the runtime; these rows build Windows SEAs)
  { id: 'RU', suite: 'release', expect: ['R-b'], what: 'an unsigned release is accepted', edits: [condOff('scripts/factory-runner/enrolled/release.mjs', "if (!m.signature || !m.key_id) return refuse('unsigned', 'the release is not signed');", 'if (false) return refuse(\'unsigned\', \'planted\'); // (planted)')] },
  { id: 'RD', suite: 'release', expect: ['R-m'], what: 'a superseded release is installed without an admin adopt (a silent downgrade)', edits: [condOff('scripts/factory-runner/enrolled/upgrade.mjs', 'if (cur && semverCmp(v.version, cur.version) <= 0 && v.digest !== adopted) {', 'if (false) { // (planted) anti-downgrade removed')] },
];

// ---------------------------------------------------------------------------------------------------------------------------------
const args = process.argv.slice(2);
const planOnly = args.includes('--plan');
const ids = args.filter((a) => !a.startsWith('--'));
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
say('v1_mutation_proof: ' + chosen.length + ' mutant' + (chosen.length === 1 ? '' : 's') + (planOnly ? ' (plan only)' : '') + ' on ' + ROOT + ' @ ' + head);
let vacuous = 0;
for (const m of chosen) {
  try { plant(m, (f) => fs.readFileSync(path.join(ROOT, f), 'utf8')); if (planOnly) say('PLANTED  ' + m.id.padEnd(5) + ' ' + m.suite.padEnd(12) + ' expected FAIL ' + m.expect.join('|') + ' - ' + m.what); }
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
    env: { ...process.env, TEMP: path.join(c.dir, 'tmp'), TMP: path.join(c.dir, 'tmp'), FACTORY_RUNNER_PG_URL: '', FACTORY_RUNNER_ENV_FILE: '' } });
  const out = (r.stdout || '') + (r.stderr || '');
  const failed = [...out.matchAll(/^FAIL (\S+)/gm)].map((x) => x[1]);
  const summary = (out.trim().split('\n').filter((l) => /_acceptance:|_interleaving:|: \d+\/\d+ OK/.test(l)).pop() || '(no summary: exit ' + r.status + (r.error ? ' ' + r.error.code : '') + ')').trim();
  return { code: r.status, failed, summary, secs: Math.round((Date.now() - t0) / 1000), tail: out.slice(-1200) };
}

const controls = {};
let killed = 0;
const survivors = [];
for (const m of chosen) {
  if (!(m.suite in controls)) {
    const c = makeCopy('control ' + m.suite);
    try { controls[m.suite] = runSuite(c, m.suite); } finally { dropCopy(c); }
    const k = controls[m.suite];
    say('CONTROL  ' + m.suite.padEnd(12) + (k.code === 0 && !k.failed.length ? 'passed' : 'FAILED') + ' - ' + k.summary + ' (' + k.secs + ' s)');
    if (!(k.code === 0 && !k.failed.length)) say(k.tail);
  }
  const k = controls[m.suite];
  if (!(k.code === 0 && !k.failed.length)) { survivors.push(m.id); say('NOT JUDGED ' + m.id + ': the ' + m.suite + ' control did not pass'); continue; }
  const c = makeCopy(m.id);
  let r;
  try {
    const texts = plant(m, (f) => fs.readFileSync(path.join(c.repo, f), 'utf8'));
    for (const [f, t] of Object.entries(texts)) fs.writeFileSync(path.join(c.repo, f), t);
    for (const [f, t] of Object.entries(texts)) if (lf(fs.readFileSync(path.join(c.repo, f), 'utf8')) !== t) throw new Error('the planted text did not read back: ' + f);
    r = runSuite(c, m.suite);
  } finally { dropCopy(c); }
  const hit = m.expect.filter((e) => r.failed.includes(e));
  const ok = r.code !== 0 && hit.length > 0;
  if (ok) killed++; else survivors.push(m.id);
  say((ok ? 'CAUGHT   ' : 'SURVIVED ') + m.id.padEnd(5) + ' ' + m.suite.padEnd(12) + ' expected FAIL ' + m.expect.join('|') + '; seen FAIL [' + r.failed.join(' ') + ']; ' + r.summary + ' (' + r.secs + ' s) - ' + m.what);
  if (!ok) say(r.tail);
}
say('\nv1_mutation_proof: ' + killed + ' of ' + chosen.length + ' mutants killed' + (survivors.length ? '; NOT killed: ' + survivors.join(', ') : ''));
process.exit(survivors.length ? 1 : 0);
