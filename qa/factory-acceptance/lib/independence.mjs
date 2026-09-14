// Independent acceptance oracle derived from the founder-required invariant
//
//     AUTHORING RUN != CERTIFYING RUN
//
// This oracle defines what evidence is SUFFICIENT or INSUFFICIENT for an independent
// certification. It does not define the production implementation: no schema, no migration,
// no storage model. The Home PC chooses how production evidence is represented; the QA harness
// normalizes whatever durable evidence exists into the two objects below and the oracle judges
// them.
//
// Authority derives from WORK ORDER + AGENT RUN + ROLE/CAPABILITY + PROVENANCE. A hostname
// contributes ZERO authority: a different physical hostname is informational only and never
// proof of independence; the same physical hostname is allowed when C1-C9 independently pass.
//
// Normalized evidence schema:
//   candidate  { run_id, agent_id, work_order_id, head_commit, context, finished_at, hostname }
//   certifying { run_id, agent_id, work_order_id, base_commit, bound_commit, context, started_at,
//                capabilities, role, identity_status, provenance_materialized, hostname }
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const CONDITIONS = Object.freeze({
  C1_DISTINCT_RUNS: 'authoring run id and certifying run id are distinct',
  C2_DISTINCT_AGENTS: 'authoring agent and certifying agent are distinct registered agents',
  C3_SAME_WORK_ORDER: 'both runs are bound to the same canonical work order',
  C4_VERIFIER_CAPABILITY: 'the certifying run carries an authorized verifier capability or role',
  C5_VERIFIER_IDENTITY_CURRENT: 'the certifying identity is current, neither stale nor revoked',
  C6_EXACT_PROVENANCE_BINDING: 'the certification is bound to the exact candidate provenance (the candidate head commit)',
  C7_PROVENANCE_MATERIALIZED: 'the certification provenance is materialized as durable structured evidence, not caller prose',
  C8_STARTS_AFTER_AUTHORING_RESULT: 'the certifying run starts after the candidate authoring result exists',
  C9_DISTINCT_CONTEXT: 'the certifying run uses a distinct execution context from the authoring run',
  C10_HOSTNAME_ZERO_AUTHORITY: 'hostname contributes zero authority: a different hostname is never proof, the same hostname is never a bar on its own',
});

const norm = (value) => (value === null || value === undefined ? null : String(value));

export function certificationEvidenceSufficient(candidate, certifying) {
  const c = candidate || {};
  const v = certifying || {};
  const satisfied = [];
  const unsatisfied = [];
  const notes = [];
  const judge = (key, ok) => (ok ? satisfied : unsatisfied).push(key);

  judge('C1_DISTINCT_RUNS', norm(c.run_id) !== null && norm(v.run_id) !== null && norm(c.run_id) !== norm(v.run_id));
  judge('C2_DISTINCT_AGENTS', norm(c.agent_id) !== null && norm(v.agent_id) !== null && norm(c.agent_id) !== norm(v.agent_id));
  judge('C3_SAME_WORK_ORDER', norm(c.work_order_id) !== null && norm(c.work_order_id) === norm(v.work_order_id));

  const capabilities = Array.isArray(v.capabilities) ? v.capabilities.map((x) => String(x).toLowerCase()) : [];
  const role = norm(v.role) === null ? '' : String(v.role).toLowerCase();
  judge('C4_VERIFIER_CAPABILITY', capabilities.includes('verify') || role === 'verifier' || role === 'verification');

  judge('C5_VERIFIER_IDENTITY_CURRENT', norm(v.identity_status) === 'active');

  const head = norm(c.head_commit);
  judge('C6_EXACT_PROVENANCE_BINDING', head !== null && norm(v.bound_commit) === head && norm(v.base_commit) === head);

  judge('C7_PROVENANCE_MATERIALIZED', v.provenance_materialized === true);

  const finished = Date.parse(c.finished_at || '');
  const started = Date.parse(v.started_at || '');
  judge('C8_STARTS_AFTER_AUTHORING_RESULT', Number.isFinite(finished) && Number.isFinite(started) && started >= finished);

  judge('C9_DISTINCT_CONTEXT', norm(v.context) !== null && norm(v.context) !== norm(c.context));

  if (norm(c.hostname) !== null && norm(v.hostname) !== null) {
    notes.push(norm(c.hostname) === norm(v.hostname)
      ? 'same hostname observed: contributes nothing; decided by C1-C9 alone'
      : 'different hostnames observed: informational only; not counted as independence');
  }
  judge('C10_HOSTNAME_ZERO_AUTHORITY', true);

  return { sufficient: unsatisfied.length === 0, satisfied, unsatisfied, notes };
}

export function sufficientExample() {
  const candidate = {
    run_id: 'run-author-1',
    agent_id: 'agent-implementation',
    work_order_id: 'wo-1',
    head_commit: 'c0ffee00c0ffee00c0ffee00c0ffee00c0ffee00',
    context: 'worktree-impl',
    finished_at: '2026-09-14T10:00:00Z',
    hostname: 'HOST-A',
  };
  const certifying = {
    run_id: 'run-verify-1',
    agent_id: 'agent-verifier',
    work_order_id: 'wo-1',
    base_commit: candidate.head_commit,
    bound_commit: candidate.head_commit,
    context: 'worktree-verify',
    started_at: '2026-09-14T10:05:00Z',
    capabilities: ['verify'],
    role: 'verifier',
    identity_status: 'active',
    provenance_materialized: true,
    hostname: 'HOST-A',
  };
  return { candidate, certifying };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { candidate, certifying } = sufficientExample();
  let failures = 0;
  const expect = (name, ok) => { console.log((ok ? 'ok   ' : 'FAIL ') + name); if (!ok) failures += 1; };
  const base = certificationEvidenceSufficient(candidate, certifying);
  expect('sufficient example is sufficient', base.sufficient === true && base.unsatisfied.length === 0);
  expect('same hostname is informational only', base.notes.length === 1 && /same hostname/.test(base.notes[0]));
  const differentHost = certificationEvidenceSufficient(candidate, { ...certifying, hostname: 'HOST-B', agent_id: candidate.agent_id });
  expect('different hostname does not rescue a same-agent certification', differentHost.sufficient === false && differentHost.unsatisfied.includes('C2_DISTINCT_AGENTS'));
  const negatives = [
    ['C1_DISTINCT_RUNS', { run_id: candidate.run_id }],
    ['C2_DISTINCT_AGENTS', { agent_id: candidate.agent_id }],
    ['C3_SAME_WORK_ORDER', { work_order_id: 'wo-2' }],
    ['C4_VERIFIER_CAPABILITY', { capabilities: [], role: 'implementation' }],
    ['C5_VERIFIER_IDENTITY_CURRENT', { identity_status: 'revoked' }],
    ['C6_EXACT_PROVENANCE_BINDING', { bound_commit: 'deadbeef' }],
    ['C7_PROVENANCE_MATERIALIZED', { provenance_materialized: false }],
    ['C8_STARTS_AFTER_AUTHORING_RESULT', { started_at: '2026-09-14T09:00:00Z' }],
    ['C9_DISTINCT_CONTEXT', { context: candidate.context }],
  ];
  for (const [key, patch] of negatives) {
    const result = certificationEvidenceSufficient(candidate, { ...certifying, ...patch });
    expect('negative ' + key, result.sufficient === false && result.unsatisfied.length === 1 && result.unsatisfied[0] === key);
  }
  const empty = certificationEvidenceSufficient({}, {});
  expect('empty evidence fails every substantive condition', empty.sufficient === false && empty.unsatisfied.length === 9);
  console.log(failures === 0 ? 'INDEPENDENCE_ORACLE_SELFTEST_OK' : 'INDEPENDENCE_ORACLE_SELFTEST_FAILED ' + failures);
  process.exit(failures === 0 ? 0 : 1);
}
