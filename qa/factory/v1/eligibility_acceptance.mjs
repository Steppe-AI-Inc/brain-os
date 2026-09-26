#!/usr/bin/env node
// WO-5 / AC-15 / AC-6 DEVELOPER VERIFICATION: the 12 hard gates in the founder's order, ranking only among eligible nodes, the 30 s
// deferral bound, numeric priority, and the S-16(a) authoring restriction - through the Node API with nodes enrolled the product way.
//   G1..G12  each gate refuses, naming itself (a claim of that one work order)
//   O        a node violating two gates is refused by the FIRST in the founder's order
//   D        detection only restricts; resources and hostname never authorize
//   K        ranking: a better-ranked eligible node delays a work order by at most 30 s; an ineligible, stale, draining or foreign
//            "better" node never delays it
//   Y        numeric priority: 100 before 10 before 2 (never lexical)
//   H        the S-16(a)-bound computer takes an authoring run only of work whose declared surfaces lie within the Director paths
// Developer verification, never independent. usage: node qa/factory/v1/eligibility_acceptance.mjs [--evidence <file>]
import { writeFileSync } from 'node:fs';
import { compose, sha256 } from '../../../scripts/factory-control-plane/migration.mjs';
import { asEngine } from './fixtures.mjs';
import { world, recorder, RES } from './flows.mjs';

const { results, row } = recorder();
const W = await world();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const gateOf = (r) => { const m = /gate (\d+) ([a-z_]+)/.exec((r && r.message) || ''); return m ? Number(m[1]) : (r && r.claimed ? 0 : null); };
try {
  const { founder, sup, admin } = W;
  const env = (o = {}) => ({ roles: ['generic'], max_concurrent_runs: 2, max_heavy: 1, ...o });
  const claim = (x, wo, res = RES(64000)) => x.n.op('claim', { only_work_order_id: wo, resources: res });
  const beat = (x, res = RES(64000)) => x.n.op('heartbeat', { phase: 'AVAILABLE', resources: res });

  // ---- each gate, alone
  const N = await W.enroll('G-node', env({ capabilities: ['gpu'], company_ids: ['11111111-1111-4111-8111-111111111111'], work_types: ['software_development', 'docs'] }));
  const co = '11111111-1111-4111-8111-111111111111', otherCo = '22222222-2222-4222-8222-222222222222';
  const g = {};
  g[3] = gateOf(await claim(N, await W.submit({ title: 'g3', company_id: otherCo })));
  g[4] = gateOf(await claim(N, await W.submit({ title: 'g4', company_id: co, work_type: 'deploy' })));
  g[5] = gateOf(await claim(N, await W.submit({ title: 'g5', company_id: co, requires_security_role: 'verifier' })));
  g[6] = gateOf(await claim(N, await W.submit({ title: 'g6', company_id: co, requires_capabilities: ['browser'] })));
  const other = await W.enroll('G-holder', env({ company_ids: [co] }));
  const held = await W.submit({ title: 'holder', company_id: co, owned_surface: ['g/8'] });
  const holding = await claim(other, held, RES(1e7));
  if (!holding.claimed) throw new Error('the lock holder did not claim: ' + JSON.stringify(holding));
  await beat(other, RES(1000));
  g[8] = gateOf(await claim(N, await W.submit({ title: 'g8', company_id: co, owned_surface: ['g/8'] })));
  g[12] = gateOf(await claim(N, await W.submit({ title: 'g12', company_id: co, min_resources: { ram_mb: 1000000 } })));
  const ok12 = await claim(N, await W.submit({ title: 'g12-ok', company_id: co, min_resources: { ram_mb: 1000 } }));
  // gate 11: max concurrency (2 runs: ok12 + one more fills it)
  const fill = await claim(N, await W.submit({ title: 'fill', company_id: co }));
  const r11 = await claim(N, await W.submit({ title: 'g11', company_id: co }));
  g[11] = gateOf(r11);
  if (g[11] !== 11) console.log('DEBUG g11', JSON.stringify({ ok12: ok12.claimed ? 'claimed' : ok12, fill: fill.claimed ? 'claimed' : fill, r11 }).slice(0, 900));
  for (const r of [ok12, fill]) if (r.claimed) await N.n.op('complete', { run_id: r.claimed.run_id, status: 'done', termination_reason: 'completed' });
  // gate 11 (heavy on the plane): the tenant's plane-wide heavy limit set to 0
  await asEngine(sup, () => sup.query(`update factory.tenants set max_heavy_per_plane = 0 where is_operator`));
  const g11h = gateOf(await claim(N, await W.submit({ title: 'g11 heavy', company_id: co, weight: 'heavy' })));
  await asEngine(sup, () => sup.query(`update factory.tenants set max_heavy_per_plane = 2 where is_operator`));
  // gate 9: drain
  await admin.call('drain', { computer_id: N.computer_id }, founder.token);
  g[9] = gateOf(await claim(N, await W.submit({ title: 'g9', company_id: co })));
  await admin.call('drain', { computer_id: N.computer_id, drain: false }, founder.token);
  // gate 10: health (a heartbeat 181 s old; RECOVERING)
  await asEngine(sup, () => sup.query(`update factory.nodes set last_heartbeat_at = now() - interval '181 seconds' where node_id = $1`, [N.node_id]));
  const g10wo = await W.submit({ title: 'g10', company_id: co });
  g[10] = gateOf(await N.n.op('claim', { only_work_order_id: g10wo, resources: RES(64000) }));
  await N.n.op('report-state', { phase: 'RECOVERING' });
  await asEngine(sup, () => sup.query(`update factory.nodes set runtime_phase = 'RECOVERING', last_heartbeat_at = now() where node_id = $1`, [N.node_id]));
  const g10b = gateOf(await N.n.op('claim', { only_work_order_id: g10wo, resources: RES(64000) }));
  await N.n.op('heartbeat', { phase: 'AVAILABLE', resources: RES(64000) });
  // gate 1: a revoked credential (its own calls are refused before any gate; the gate itself is shown on the admin view)
  const R = await W.enroll('G-revoked', env({ roles: ['generic', 'verifier'] }));
  await admin.call('revoke-credential', { computer_id: R.computer_id }, founder.token);
  const g1call = await R.n.op('claim', {});
  // gate 2: another tenant's work order answers like a missing one (no leak); the gate function names gate 2
  await asEngine(sup, () => sup.query(`insert into factory.tenants (tenant_id, name) values ('b2e0f000-0000-4000-8000-000000000002', 'second')`));
  const t2admin = W.brain.persona('founder'); await W.grantAdmin(t2admin, 'founder', 'b2e0f000-0000-4000-8000-000000000002');
  const foreignWo = await W.submit({ title: 'foreign' }, t2admin);
  const g2call = await claim(N, foreignWo);
  const missing = await claim(N, '99999999-9999-4999-8999-999999999999');
  const g2fn = (await sup.query(`select (factory._first_failing_gate(factory._peek_ctx($1), w, 'authoring', n)) ->> 'gate' g
      from factory.work_orders w, factory.nodes n where w.work_order_id = $2 and n.node_id = $3`, [N.principal_id, foreignWo, N.node_id])).rows[0].g;
  // gate 7 (authoring): S-16(a)
  const H = await W.enroll('Home (S-16a)', env({ roles: ['generic', 'verifier'] }), { bindS16a: true });
  const hProduct = await claim(H, await W.submit({ title: 'product code', owned_surface: ['scripts/factory-runner/x.mjs'] }));
  const hEmpty = await claim(H, await W.submit({ title: 'no declared surface' }));
  const hMixed = await claim(H, await W.submit({ title: 'mixed', owned_surface: ['docs/a.md', 'web/app.tsx'] }));
  const hDocs = await claim(H, await W.submit({ title: 'docs only', owned_surface: ['docs/architecture/x.md', 'qa/verification/y.md'] }));
  const hDots = await claim(H, await W.submit({ title: 'dot-dot', owned_surface: ['docs/../scripts/x.mjs'] }));
  if (hDocs.claimed) await H.n.op('complete', { run_id: hDocs.claimed.run_id, status: 'done', termination_reason: 'completed' });
  g[7] = gateOf(hProduct);
  row('G1-G12 each gate refuses alone and names itself (1 credential, 2 tenant, 3 company scope, 4 authorization, 5 role, 6 capability, 7 independence, 8 locks, 9 drain, 10 health x2, 11 concurrency x2, 12 minimum resources)',
    g1call.refused === 'credential_revoked' && g2fn === '2' && [3, 4, 5, 6, 7, 8, 9, 10, 11, 12].every((k) => g[k] === k) && g10b === 10 && g11h === 11,
    JSON.stringify({ ...g, g10b, g11h, g2fn }));
  row('G2b a claim naming another tenant\'s work order is answered exactly like one naming no work order (no existence leak)',
    g2call.refused === 'not_enrolled_work' && missing.refused === 'not_enrolled_work' && g2call.message === missing.message);
  row('H1 S-16(a): the bound computer never takes authoring of product code - a surface outside the Director-document paths, no declared surface, a mixed set, or a ".." path; only docs/ qa/verification/ qa/work-orders/ governance/ work',
    [hProduct, hEmpty, hMixed, hDots].every((r) => gateOf(r) === 7) && hDocs.claimed, [hProduct, hEmpty, hMixed, hDots].map(gateOf).join(','));
  const view = await admin.call('get-computer', { computer_id: R.computer_id }, founder.token);
  row('G1b the revoked computer shows CREDENTIAL_REVOKED on the Computers view', view.computer.state === 'CREDENTIAL_REVOKED', view.computer.state);

  // ---- O: two gates at once -> the first in the founder's order
  const O = await W.enroll('O-node', env({ company_ids: [co], work_types: ['software_development'] }));
  const pairs = [];
  const pair = async (name, wo, expect) => { const r = await claim(O, wo); pairs.push(name + ':' + gateOf(r)); return gateOf(r) === expect; };
  const o = [];
  o.push(await pair('3+5', await W.submit({ title: 'o35', company_id: otherCo, requires_security_role: 'verifier' }), 3));
  o.push(await pair('4+6', await W.submit({ title: 'o46', company_id: co, work_type: 'deploy', requires_capabilities: ['gpu'] }), 4));
  o.push(await pair('5+8', await W.submit({ title: 'o58', company_id: co, requires_security_role: 'verifier', owned_surface: ['g/8'] }), 5));
  o.push(await pair('6+12', await W.submit({ title: 'o612', company_id: co, requires_capabilities: ['gpu'], min_resources: { ram_mb: 1e7 } }), 6));
  o.push(await pair('8+12', await W.submit({ title: 'o812', company_id: co, owned_surface: ['g/8'], min_resources: { ram_mb: 1e7 } }), 8));
  await admin.call('drain', { computer_id: O.computer_id }, founder.token);
  o.push(await pair('5+9', await W.submit({ title: 'o59', company_id: co, requires_security_role: 'verifier' }), 5));
  o.push(await pair('8+9', await W.submit({ title: 'o89', company_id: co, owned_surface: ['g/8'] }), 8));
  o.push(await pair('9+12', await W.submit({ title: 'o912', company_id: co, min_resources: { ram_mb: 1e7 } }), 9));
  await admin.call('drain', { computer_id: O.computer_id, drain: false }, founder.token);
  row('O1 a node violating two gates is refused by the FIRST in the founder\'s order (3<5, 4<6, 5<8, 6<12, 8<12, 5<9, 8<9, 9<12)', o.every(Boolean), pairs.join(' '));

  // ---- D: detection only restricts
  const D = await W.enroll('D-node', env({ capabilities: ['gpu'] }));
  const gw = await W.submit({ title: 'gpu work', requires_capabilities: ['gpu'] });
  const dAbsent = await claim(D, gw, { ...RES(64000), capabilities_absent: ['gpu'] });
  const dPresent = await claim(D, gw, RES(64000));
  row('D1 detection only restricts: an envelope capability the node detects as absent makes it ineligible (gate 6); without that detection it is eligible',
    gateOf(dAbsent) === 6 && dPresent.claimed, gateOf(dAbsent) + ',' + (dPresent.claimed ? 'claimed' : dPresent.message));
  if (dPresent.claimed) await D.n.op('complete', { run_id: dPresent.claimed.run_id, status: 'done', termination_reason: 'completed' });

  // ---- K: ranking and the 30 s bound - only the nodes each scenario names are active from here
  for (const x of [N, other, H, D, O]) await admin.call('archive', { computer_id: x.computer_id }, founder.token);
  const K1 = await W.enroll('K-weaker', env()); const K2 = await W.enroll('K-better', env());
  await beat(K1, RES(1000)); await beat(K2, RES(64000));
  const kw = await W.submit({ title: 'ranked', priority: 1 });
  const t0 = Date.now();
  const first = await claim(K1, kw, RES(1000));
  let late = null; let waited = 0;
  while (!late || !late.claimed) { await sleep(1000); await beat(K2, RES(64000)); late = await claim(K1, kw, RES(1000)); waited = Date.now() - t0; if (waited > 40000) break; }
  row('K1 a strictly better-ranked, fresh, AVAILABLE, eligible node delays the weaker node\'s claim - and never past 30 s from queueing (then the weaker node claims)',
    first.claimed === null && first.considered && first.considered[0] && first.considered[0].deferred && late && late.claimed && waited <= 33000,
    'claimed after ' + Math.round(waited / 1000) + ' s');
  if (late && late.claimed) await K1.n.op('complete', { run_id: late.claimed.run_id, status: 'done', termination_reason: 'completed' });
  // a "better" node that is draining, stale, ineligible or foreign never delays
  const k = [];
  await admin.call('drain', { computer_id: K2.computer_id }, founder.token); await beat(K2, RES(64000));
  const kd = await W.submit({ title: 'better is draining' }); const rd = await claim(K1, kd, RES(1000)); k.push(!!rd.claimed);
  if (rd.claimed) await K1.n.op('complete', { run_id: rd.claimed.run_id, status: 'done', termination_reason: 'completed' });
  await admin.call('drain', { computer_id: K2.computer_id, drain: false }, founder.token); await beat(K2, RES(64000));
  await asEngine(sup, () => sup.query(`update factory.nodes set last_heartbeat_at = now() - interval '181 seconds' where node_id = $1`, [K2.node_id]));
  const ks = await W.submit({ title: 'better is stale' }); const rs = await claim(K1, ks, RES(1000)); k.push(!!rs.claimed);
  if (rs.claimed) await K1.n.op('complete', { run_id: rs.claimed.run_id, status: 'done', termination_reason: 'completed' });
  await beat(K2, RES(64000));
  const K3 = await W.enroll('K-better-no-authority', env({ roles: ['generic'], work_types: ['docs'] })); await beat(K3, RES(1e6));
  await admin.call('archive', { computer_id: K2.computer_id }, founder.token);
  const ki = await W.submit({ title: 'better lacks authority', work_type: 'software_development' }); const ri = await claim(K1, ki, RES(1000)); k.push(!!ri.claimed);
  if (ri.claimed) await K1.n.op('complete', { run_id: ri.claimed.run_id, status: 'done', termination_reason: 'completed' });
  await admin.call('publish-release', { channel: 'dev', version: '0.1.0', source_sha: 'f'.repeat(40), digest: W.rel.digest, key_id: 'dev-key-0001', signature: 'A'.repeat(86), receipt_sha256: 'e'.repeat(64), manifest: {} }, t2admin.token);
  const T2 = await W.enroll('K-foreign', env(), { as: t2admin }); await beat(T2, RES(1e6));
  const kf = await W.submit({ title: 'better is foreign' }); const rf = await claim(K1, kf, RES(1000)); k.push(!!rf.claimed);
  row('K2 a "better" node that is draining, stale, not authorized for the work, or in another tenant never delays an eligible node (it claims at once)', k.every(Boolean), k.join(','));

  // ---- Y: numeric priority
  const Y = await W.enroll('Y-node', env({ max_concurrent_runs: 4 }));
  await admin.call('archive', { computer_id: K3.computer_id }, founder.token);
  await admin.call('archive', { computer_id: K1.computer_id }, founder.token);
  const ids = {};
  for (const p of [2, 100, 10]) ids[await W.submit({ title: 'priority ' + p, priority: p, owned_surface: ['y/' + p], work_type: 'prio-test' })] = p;
  const order = [];
  for (let i = 0; i < 3; i++) { const r = await Y.n.op('claim', { work_types: ['prio-test'], resources: RES(64000) }); if (r.claimed && ids[r.claimed.work_order.work_order_id]) order.push(ids[r.claimed.work_order.work_order_id]); }
  row('Y1 numeric priority: 100 before 10 before 2 (lexical text order would give 2, 100, 10)', order.join(',') === '100,10,2', order.join(','));
} finally {
  await W.stop();
}
const failed = results.filter((r) => !r.ok);
console.log('\neligibility_acceptance: ' + (results.length - failed.length) + '/' + results.length + ' OK' + (failed.length ? '; FAILED: ' + failed.map((r) => r.id.split(' ')[0]).join(', ') : ''));
const ev = process.argv.indexOf('--evidence');
if (ev > 0) writeFileSync(process.argv[ev + 1], ['qa/factory/v1/eligibility_acceptance.mjs', 'migration sha256 ' + sha256(compose()), '',
  ...results.map((r) => (r.ok ? 'OK   ' : 'FAIL ') + r.id + (r.detail ? ' - ' + r.detail : '')), '', (results.length - failed.length) + '/' + results.length + ' OK'].join('\n') + '\n');
process.exit(failed.length ? 1 : 0);
