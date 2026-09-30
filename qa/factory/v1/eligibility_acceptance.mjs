#!/usr/bin/env node
// WO-5 / AC-15 / AC-6 DEVELOPER VERIFICATION: the 12 hard gates in the founder's order, ranking only among eligible nodes, the 30 s
// deferral bound, numeric priority, and the S-16(a) authoring restriction - through the Node API with nodes enrolled the product way.
//   G1..G12  each gate refuses, naming itself (a claim of that one work order)
//   O        a node violating two gates is refused by the FIRST in the founder's order
//   D        detection only restricts; resources and hostname never authorize
//   K        ranking: a better-ranked eligible node delays a work order by at most 30 s; an ineligible, stale, draining or foreign
//            "better" node never delays it
//   Y        numeric priority: 100 before 10 before 2 (never lexical); Y2-Y4: ONE ranked pick across authoring and verification work
//            (P-7, contract §2 "chosen automatically by the scheduler"): a claim that lists the reserved type 'verification' is offered
//            both kinds in one order - a p100 verification before p2 authoring, then 50 / 30 (verification) / 2 - with the candidate
//            in the answer (older queued work of either kind takes its own place by priority); a claim that does not list it is never
//            offered verification work; an AUTHORING work order whose type is named 'verification' is never taken through the
//            reserved type
//   H        a Home-computer record (S-16: the bound record, archived or not, or a record that reported a fingerprint the bound record
//            reported - including one enrolled BEFORE the bound record) takes an authoring run only of work whose declared surfaces lie
//            within the Director paths
//   O2       every pair of gates (adjacent ones included, and each gate's sub-checks) through the gate function itself, with synthesized
//            inputs: the first failing gate is always the lower one
//   K3/K4    a preference never excludes: the non-preferred node claims at once while the preferred node is draining or stale, and
//            within 30 s while it is available (the preference only ranks); the preferring node is never refused other work
//   G11b     the per-computer heavy limit refuses by itself (the plane's limit not reached, the computer's run limit not reached)
//   G4r      gate 4 on the server: superseded / adopted / key-revoked / revoked releases, whatever the node itself does
//   RS1-RS4  the resource report: a value the gates and ranking read is a number, at the Edge and in SQL; a malformed stored report never
//            fails another node's claim; a genuine runtime's report is never refused
//   LS1      the lease a claim and a renew grant: 120 s when none (or no number) is named, a named number held to 5..600 s
// Developer verification, never independent. usage: node qa/factory/v1/eligibility_acceptance.mjs [--evidence <file>]
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { compose, sha256 } from '../../../scripts/factory-control-plane/migration.mjs';
import { asEngine } from './fixtures.mjs';
import { world, recorder, RES } from './flows.mjs';
import { directNode } from './nodeclient.mjs';
import { resources } from '../../../scripts/factory-runner/enrolled/identity.mjs';

const { results, row } = recorder();
const W = await world();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const gateOf = (r) => { const m = /gate (\d+) ([a-z_]+)/.exec((r && r.message) || ''); return m ? Number(m[1]) : (r && r.claimed ? 0 : null); };
try {
  const { founder, sup, admin } = W;
  const env = (o = {}) => ({ roles: ['generic'], max_concurrent_runs: 2, max_heavy: 1, ...o });
  const claim = (x, wo, res = RES(64000)) => x.n.op('claim', { only_work_order_id: wo, resources: res });
  const beat = (x, res = RES(64000)) => x.n.op('heartbeat', { phase: 'AVAILABLE', resources: res });
  // THE 30 s BOUND ON THE SERVER'S CLOCK (P-6): each claim answer carries the server's time; every answer that deferred must have come
  // less than 30 s after the work order's queued_at, and the last one claimed. No client stopwatch, so a slow host cannot fail it.
  const bound30 = async (wo, answers) => {
    const secs = (await sup.query(`select extract(epoch from (x::timestamptz - w.queued_at))::float8 s from unnest($2::text[]) with ordinality as a(x, i)
        join factory.work_orders w on w.work_order_id = $1 order by a.i`, [wo, answers.map((r) => r.server_time)])).rows.map((x) => x.s);
    const deferred = answers.map((r) => !r.claimed && !!(r.considered && r.considered[0] && r.considered[0].deferred));
    const last = answers[answers.length - 1];
    const ok = answers.every((r) => typeof r.server_time === 'string') && !!(last && last.claimed)
      && answers.slice(0, -1).every((r, i) => deferred[i] && secs[i] < 30);
    return { ok, detail: 'claimed ' + (secs.length ? secs[secs.length - 1].toFixed(2) : '?') + ' s after queueing (server clock); ' + (answers.length - 1) + ' deferred answers, the last at '
      + (secs.length > 1 ? secs[secs.length - 2].toFixed(2) : '-') + ' s' };
  };

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
  // G11b: gate 11 decided by the computer's own heavy limit and nothing else - one heavy run held (max_heavy 1), the run limit (3)
  // and the plane's heavy limit (2) both with room: the next heavy claim answers gate 11, named
  const HV = await W.enroll('G11b-heavy', env({ max_concurrent_runs: 3, max_heavy: 1 }), { res: RES(1e8) });
  const h1 = await claim(HV, await W.submit({ title: 'g11b heavy 1', weight: 'heavy' }), RES(1e8));
  const h2 = await claim(HV, await W.submit({ title: 'g11b heavy 2', weight: 'heavy' }), RES(1e8));
  const hvState = (await sup.query(`select (select count(*)::int from factory.agent_runs where computer_id = $1 and status = 'in_progress') runs,
      (select count(*)::int from factory.agent_runs r join factory.work_orders w using (work_order_id) where r.status = 'in_progress' and w.weight = 'heavy') plane_heavy,
      (select max_heavy_per_plane from factory.tenants where is_operator) plane_limit`, [HV.computer_id])).rows[0];
  row('G11b gate 11 decided by the computer\'s own heavy limit: with 1 heavy run held (envelope max_heavy 1), 1 of 3 runs on the computer and 1 of 2 heavy runs on the plane, the next heavy claim answers gate 11 "1 of 1 heavy runs on this computer"',
    h1.claimed && gateOf(h2) === 11 && /1 of 1 heavy runs on this computer/.test(h2.message || '') && hvState.runs === 1 && hvState.plane_heavy === 1 && hvState.plane_limit === 2,
    JSON.stringify({ h1: h1.claimed ? 'claimed' : h1.message, h2: h2.message, ...hvState }));
  if (h1.claimed) await HV.n.op('complete', { run_id: h1.claimed.run_id, status: 'done', termination_reason: 'completed' });
  await admin.call('archive', { computer_id: HV.computer_id }, founder.token);
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
  // gate 7 (authoring): S-16(a). U is an unbound record enrolled on the Home machine BEFORE its bound record H, reporting the same
  // machine fingerprint FX: once H reports FX, U is a Home-computer record too (S-16)
  const FX = 'f0'.repeat(32);
  const U = await W.enroll('U: unbound, same machine, enrolled first', env({ roles: ['generic', 'verifier'] }), { fingerprint: FX });
  const H = await W.enroll('Home (S-16a)', env({ roles: ['generic', 'verifier'] }), { bindS16a: true, fingerprint: FX });
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
  // H2 (S-16, AC-15): the unbound record U enrolled before the bound record, reporting its fingerprint, is a Home-computer record
  // (U reports more free RAM than any other node here, so ranking never decides these claims)
  const uProduct = await claim(U, await W.submit({ title: 'U: product code', owned_surface: ['scripts/factory-runner/u.mjs'] }), RES(70000));
  const uEmpty = await claim(U, await W.submit({ title: 'U: no declared surface' }), RES(70000));
  const uDocs = await claim(U, await W.submit({ title: 'U: docs only', owned_surface: ['docs/u.md'] }), RES(70000));
  if (uDocs.claimed) await U.n.op('complete', { run_id: uDocs.claimed.run_id, status: 'done', termination_reason: 'completed' });
  const uView = (await admin.call('get-computer', { computer_id: U.computer_id }, founder.token)).computer;
  row('H2 an unbound record enrolled on the Home machine BEFORE its bound record, reporting the same fingerprint, is a Home-computer record: product code and a work order with no declared surface are refused at gate 7 (S-16(a)); Director-document work is still claimed (a restriction only); it is not bound',
    gateOf(uProduct) === 7 && /Home-computer record/.test(uProduct.message || '') && gateOf(uEmpty) === 7 && uDocs.claimed && uView.s16a_bound === false,
    [uProduct, uEmpty, uDocs].map(gateOf).join(','));
  // H3 (S-14, S-16, AC-15): the bound record archived and restored keeps its binding and stays restricted
  await admin.call('archive', { computer_id: H.computer_id }, founder.token);
  const hArchived = (await admin.call('get-computer', { computer_id: H.computer_id }, founder.token)).computer;
  const hRst = await admin.call('restore', { computer_id: H.computer_id }, founder.token);
  const H2 = await W.pair({ ...hRst, computer_id: H.computer_id }, { fingerprint: FX, name: 'Home (S-16a) restored' });
  const h3Product = await claim(H2, await W.submit({ title: 'restored Home: product code', owned_surface: ['web/app/x.tsx'] }), RES(80000));
  const h3Docs = await claim(H2, await W.submit({ title: 'restored Home: docs', owned_surface: ['governance/x.md'] }), RES(80000));
  if (h3Docs.claimed) await H2.n.op('complete', { run_id: h3Docs.claimed.run_id, status: 'done', termination_reason: 'completed' });
  const hRestored = (await admin.call('get-computer', { computer_id: H.computer_id }, founder.token)).computer;
  row('H3 the bound record, archived (it keeps its binding) and restored (re-paired, reporting its fingerprint), is still refused product code at gate 7 and still takes Director-document work',
    hArchived.state === 'ARCHIVED' && hArchived.s16a_bound === true && hRst.ok && gateOf(h3Product) === 7 && h3Docs.claimed && hRestored.s16a_bound === true && hRestored.state === 'ALIVE',
    JSON.stringify({ archived: [hArchived.state, hArchived.s16a_bound], product: gateOf(h3Product), docs: gateOf(h3Docs), restored: [hRestored.state, hRestored.s16a_bound] }));

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

  // ---- O2 (AC-15, WO-5): EVERY pair of gates - adjacent ones included, and each gate's sub-checks - through factory._first_failing_gate with
  // synthesized inputs (O's own context, a claimable work order row and O's node row, each changed only by the violations named). The
  // base passes every gate; each violation alone fails exactly its gate; every pair fails the lower gate. A verification-kind base
  // (O authored the candidate, so gate 7 fails) checks the verification branch's place between 6 and 8.
  await other.n.op('renew', { run_id: holding.claimed.run_id, lease_seconds: 600 }); // 'g/8' stays held
  const o2wo = await W.submit({ title: 'o2 base', company_id: co, requires_capabilities: ['cap-x'], owned_surface: ['o2/base'] });
  const o2v = await W.submit({ title: 'o2 verified', company_id: co, requires_verification: true, owned_surface: ['o2/v'] });
  const o2a = await claim(O, o2v, RES(1e8)); // the best resources here: ranking never defers this fixture claim
  const o2d = o2a.claimed && await O.n.op('complete', { run_id: o2a.claimed.run_id, status: 'done', termination_reason: 'completed', head_commit: 'a'.repeat(40), candidate_tree: 'b'.repeat(40) });
  const o2rows = (await sup.query(`select to_jsonb(factory._peek_ctx($1)) c, (select to_jsonb(n) from factory.nodes n where n.node_id = $2) n,
      (select to_jsonb(w) from factory.work_orders w where w.work_order_id = $3) w, (select to_jsonb(v) from factory.work_orders v where v.work_order_id = $4) v`,
    [O.principal_id, O.node_id, o2wo, o2d && o2d.verification_work_order_id])).rows[0];
  const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString();
  const baseC = { ...o2rows.c, company_ids: [co], allowed_work_types: ['software_development'], authorized_roles: ['generic'], authorized_capabilities: ['cap-x'],
    max_concurrent_runs: 5, max_heavy: 1, draining: false };
  const baseN = { ...o2rows.n, last_heartbeat_at: iso(0), runtime_phase: 'AVAILABLE', release_id: W.rel.releaseId, machine_fingerprint: 'e0'.repeat(32), reported_resources: RES(64000) };
  const baseW = o2rows.w;
  const VIOL = {
    1: { g: 1, c: { credential_id: null } },
    2: { g: 2, w: { tenant_id: 'b2e0f000-0000-4000-8000-000000000002' } },
    3: { g: 3, w: { company_id: otherCo } },
    '4a': { g: 4, w: { work_type: 'deploy' } },
    '4b': { g: 4, n: { release_id: null } },
    5: { g: 5, w: { requires_security_role: 'verifier' } },
    '6a': { g: 6, w: { requires_capabilities: [...baseW.requires_capabilities, 'gpu'] } },
    '6b': { g: 6, n: { reported_resources: { ...RES(64000), capabilities_absent: ['cap-x'] } } },
    7: { g: 7, n: { machine_fingerprint: FX } },
    8: { g: 8, w: { owned_surface: [...baseW.owned_surface, 'g/8'] } },
    9: { g: 9, c: { draining: true } },
    '10a': { g: 10, n: { last_heartbeat_at: iso(181000) } },
    '10b': { g: 10, n: { runtime_phase: 'RECOVERING' } },
    '11a': { g: 11, c: { max_concurrent_runs: 0 } },
    '11b': { g: 11, w: { weight: 'heavy' }, c: { max_heavy: 0 } },
    '11c': { g: 11, w: { weight: 'heavy' }, planeZero: true },
    12: { g: 12, w: { min_resources: { ram_mb: 1e9 } } },
  };
  const withViolations = (base, kind, ks) => {
    const x = { k: ks.join('+') || 'base', kind, c: { ...base.c }, w: { ...base.w }, n: { ...base.n } };
    for (const k of ks) for (const part of ['c', 'w', 'n']) Object.assign(x[part], VIOL[k][part] || {});
    return x;
  };
  const cases = [];
  const keys = Object.keys(VIOL);
  const A0 = { c: baseC, w: baseW, n: baseN };
  cases.push({ ...withViolations(A0, 'authoring', []), want: null });
  for (const k of keys) cases.push({ ...withViolations(A0, 'authoring', [k]), want: VIOL[k].g, planeZero: !!VIOL[k].planeZero });
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
    const [a, b] = [keys[i], keys[j]];
    if (VIOL[a].g === VIOL[b].g) continue;
    cases.push({ ...withViolations(A0, 'authoring', [a, b]), want: Math.min(VIOL[a].g, VIOL[b].g), planeZero: !!(VIOL[a].planeZero || VIOL[b].planeZero) });
  }
  const V0 = { c: { ...baseC, authorized_roles: ['generic', 'verifier'], allowed_work_types: null }, w: o2rows.v, n: baseN };
  cases.push({ ...withViolations(V0, 'verification', []), want: 7 });
  for (const k of ['1', '2', '3', '4b', '6a', '8', '9', '10a', '10b', '11a', '11b', '12']) {
    cases.push({ ...withViolations(V0, 'verification', [k]), want: Math.min(VIOL[k].g, 7) });
  }
  cases.push({ ...withViolations({ ...V0, c: { ...V0.c, authorized_roles: ['generic'] } }, 'verification', []), k: 'no-verifier-role', want: 5 });
  const evalCases = async (list) => (await sup.query(`select x ->> 'k' k, x ->> 'kind' kind, (factory._first_failing_gate(
        jsonb_populate_record(null::factory.node_ctx, x -> 'c'), jsonb_populate_record(null::factory.work_orders, x -> 'w'), x ->> 'kind',
        jsonb_populate_record(null::factory.nodes, x -> 'n')) ->> 'gate')::int g
      from jsonb_array_elements($1::jsonb) x`, [JSON.stringify(list.map(({ k, kind, c, w, n }) => ({ k, kind, c, w, n })))])).rows;
  const got = [...await evalCases(cases.filter((x) => !x.planeZero))];
  await asEngine(sup, () => sup.query(`update factory.tenants set max_heavy_per_plane = 0 where is_operator`));
  try { got.push(...await evalCases(cases.filter((x) => x.planeZero))); } finally { await asEngine(sup, () => sup.query(`update factory.tenants set max_heavy_per_plane = 2 where is_operator`)); }
  const want = new Map(cases.map((x) => [x.kind + ':' + x.k, x.want]));
  const o2bad = got.filter((r) => (r.g ?? null) !== want.get(r.kind + ':' + r.k)).map((r) => r.kind[0] + ':' + r.k + '=' + r.g + '(want ' + want.get(r.kind + ':' + r.k) + ')');
  row('O2 through the gate function, for synthesized inputs: the base passes every gate; each of 17 single violations (every gate, and the sub-checks 4 release, 6 detection, 10 RECOVERING, 11 heavy on the computer and on the plane) fails exactly its gate; every pair of violations of different gates - adjacent gates included - fails the LOWER gate; the verification branch of gate 7 sits between gates 6 and 8',
    o2d && o2d.ok && got.length === cases.length && o2bad.length === 0, (o2d && o2d.ok ? '' : 'the fixture claim: ' + JSON.stringify(o2a).slice(0, 300) + ' ') + (o2bad.slice(0, 12).join(' ') || got.length + ' cases'));

  // ---- D: detection only restricts
  const D = await W.enroll('D-node', env({ capabilities: ['gpu'] }));
  const gw = await W.submit({ title: 'gpu work', requires_capabilities: ['gpu'] });
  const dAbsent = await claim(D, gw, { ...RES(64000), capabilities_absent: ['gpu'] });
  const dPresent = await claim(D, gw, RES(64000));
  row('D1 detection only restricts: an envelope capability the node detects as absent makes it ineligible (gate 6); without that detection it is eligible',
    gateOf(dAbsent) === 6 && dPresent.claimed, gateOf(dAbsent) + ',' + (dPresent.claimed ? 'claimed' : dPresent.message));
  if (dPresent.claimed) await D.n.op('complete', { run_id: dPresent.claimed.run_id, status: 'done', termination_reason: 'completed' });

  // ---- K: ranking and the 30 s bound - only the nodes each scenario names are active from here
  for (const x of [N, other, H, D, O, U]) await admin.call('archive', { computer_id: x.computer_id }, founder.token);
  const K1 = await W.enroll('K-weaker', env()); const K2 = await W.enroll('K-better', env());
  await beat(K1, RES(1000)); await beat(K2, RES(64000));
  const kw = await W.submit({ title: 'ranked', priority: 1 });
  const t0 = Date.now();
  const first = await claim(K1, kw, RES(1000));
  let late = null; let waited = 0; const k1answers = [first];
  while (!late || !late.claimed) { await sleep(1000); await beat(K2, RES(64000)); late = await claim(K1, kw, RES(1000)); k1answers.push(late); waited = Date.now() - t0; if (waited > 45000) break; }
  const k1bound = await bound30(kw, k1answers);
  row('K1 a strictly better-ranked, fresh, AVAILABLE, eligible node delays the weaker node\'s claim - and never past 30 s from queueing (then the weaker node claims)',
    first.claimed === null && first.considered && first.considered[0] && first.considered[0].deferred && late && late.claimed && k1bound.ok,
    k1bound.detail);
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
  // ---- Y2-Y4: one ranked pick across both kinds. The author A2 is authorized only for 'y-author' and the claimer Y2 only for 'prio-x'
  // and 'verification', so neither ever ranks against the other (no deferral decides a row)
  await admin.call('archive', { computer_id: Y.computer_id }, founder.token);
  const A2 = await W.enroll('Y-author', env({ work_types: ['y-author'], max_concurrent_runs: 4 }), { res: RES(9.5e7) });
  const Y2 = await W.enroll('Y2-both-kinds', env({ roles: ['generic', 'verifier'], work_types: ['prio-x', 'verification'], max_concurrent_runs: 4 }), { res: RES(9e7) });
  const author = async (priority, title) => {
    const wo = await W.submit({ title, priority, work_type: 'y-author', requires_verification: true, owned_surface: ['ya/' + priority + '/' + title.length] });
    await beat(A2, RES(9.5e7));
    const c = await A2.n.op('claim', { only_work_order_id: wo, resources: RES(9.5e7) });
    if (!c.claimed) throw new Error('Y2: the author could not claim ' + title + ': ' + JSON.stringify(c).slice(0, 300));
    const tree = createHash('sha1').update('tree ' + wo).digest('hex'), head = createHash('sha1').update('head ' + wo).digest('hex');
    const d = await A2.n.op('complete', { run_id: c.claimed.run_id, status: 'done', termination_reason: 'completed', head_commit: head, candidate_tree: tree });
    return { wo, v: d.verification_work_order_id, run: c.claimed.run_id, tree, head };
  };
  const both = ['prio-x', 'verification'];
  const claimBoth = (types = both) => Y2.n.op('claim', { work_types: types, resources: RES(9e7) });
  const finish = async (r) => {
    if (!r.claimed) return;
    if (r.claimed.kind === 'verification') {
      const v = r.claimed.verifies;
      await Y2.n.op('certify', { run_id: r.claimed.run_id, verdict: 'PASS', work_order_id: v.work_order.work_order_id, candidate_run_id: v.candidate.run_id,
        candidate_tree: v.candidate.candidate_tree, candidate_commit: v.candidate.head_commit, reason: 'Y rows' });
    } else await Y2.n.op('complete', { run_id: r.claimed.run_id, status: 'done', termination_reason: 'completed' });
  };
  const w100 = await author(100, 'Y2 p100 candidate');
  const p2 = [];
  for (let i = 0; i < 3; i++) p2.push(await W.submit({ title: 'Y2 p2 authoring ' + i, priority: 2, work_type: 'prio-x', owned_surface: ['y2/' + i] }));
  await beat(Y2, RES(9e7));
  const y2 = await claimBoth();
  row('Y2 a node authorized for both kinds, with a p100 verification and three p2 authoring work orders queued, is given the verification on its FIRST claim (one claim naming \'prio-x\' and \'verification\'): kind verification, the candidate in the answer',
    y2.ok && y2.claimed && y2.claimed.kind === 'verification' && y2.claimed.work_order.work_order_id === w100.v && y2.claimed.verifies && y2.claimed.verifies.candidate
      && y2.claimed.verifies.candidate.run_id === w100.run && y2.claimed.verifies.candidate.candidate_tree === w100.tree && y2.claimed.assignment_role === 'verifier',
    JSON.stringify({ kind: y2.claimed && y2.claimed.kind, got: y2.claimed ? (y2.claimed.work_order.work_order_id === w100.v ? 'V100' : 'other') : y2 }).slice(0, 400));
  await finish(y2);
  // Y3: authoring p50, a verification p30, and the p2 authoring work: claimed (and finished) in the order 50, 30, 2
  const p50 = await W.submit({ title: 'Y3 p50 authoring', priority: 50, work_type: 'prio-x', owned_surface: ['y3/50'] });
  const w30 = await author(30, 'Y3 p30 candidate');
  // (older work of this plane may also be queued: every claim is recorded with its priority, until a p2 authoring one is taken)
  const seq = [];
  for (let i = 0; i < 8 && !seq.some((x) => x.label === '2'); i++) {
    await beat(Y2, RES(9e7));
    const r = await claimBoth();
    if (!r.claimed) { seq.push({ label: 'none', priority: null }); break; }
    const id = r.claimed.work_order.work_order_id;
    seq.push({ label: id === p50 ? '50' : id === w30.v ? '30v' : p2.includes(id) ? '2' : 'other:' + r.claimed.kind, priority: r.claimed.work_order.priority });
    await finish(r);
  }
  const mine = seq.filter((x) => !x.label.startsWith('other')).map((x) => x.label);
  const nonIncreasing = seq.every((x, i) => x.priority !== null && (i === 0 || x.priority <= seq[i - 1].priority));
  row('Y3 across both kinds numeric priority decides, never the kind: authoring p50, then the verification p30, then authoring p2 - every successive claim, whatever its kind, at a priority no higher than the one before',
    mine.join(',') === '50,30v,2' && nonIncreasing, JSON.stringify(seq));
  // Y4: a claim that does not list 'verification' is never offered verification work; an authoring work order NAMED 'verification'
  // is never taken through the reserved type (nor completed as failed)
  const w99 = await author(99, 'Y4 p99 candidate');
  const named = await W.submit({ title: 'Y4 authoring typed verification', priority: 98, work_type: 'verification', owned_surface: ['y4/named'] });
  const onlyAuthoring = [];
  for (let i = 0; i < 3; i++) { await beat(Y2, RES(9e7)); const r = await claimBoth(['prio-x']); onlyAuthoring.push(r.claimed ? (r.claimed.kind + ':' + (r.claimed.work_order.work_order_id === w99.v ? 'V99' : r.claimed.work_order.work_order_id === named ? 'NAMED' : 'authoring')) : 'none'); await finish(r); }
  await beat(Y2, RES(9e7));
  const viaReserved = await claimBoth();
  const reservedGot = viaReserved.claimed ? (viaReserved.claimed.work_order.work_order_id === w99.v ? 'V99' : viaReserved.claimed.work_order.work_order_id === named ? 'NAMED' : 'other') : 'none';
  await finish(viaReserved);
  await beat(Y2, RES(9e7));
  const after = await claimBoth();
  await finish(after);
  const namedState = (await sup.query('select w.status, (select count(*)::int from factory.agent_runs r where r.work_order_id = w.work_order_id) runs from factory.work_orders w where w.work_order_id = $1', [named])).rows[0];
  row('Y4 a claim listing only \'prio-x\' never gets the queued p99 verification (only authoring work, then nothing); through the reserved type the verification is taken, and an authoring work order whose type is named \'verification\' is never taken as verification work - it stays queued with no run',
    onlyAuthoring.every((x) => x === 'none' || x === 'authoring:authoring') && reservedGot === 'V99' && (!after.claimed || after.claimed.work_order.work_order_id !== named) && namedState.status === 'queued' && namedState.runs === 0,
    JSON.stringify({ onlyAuthoring, viaReserved: reservedGot, after: after.claimed ? after.claimed.work_order.work_order_id : null, namedState }));
  for (const x of [A2, Y2]) await admin.call('archive', { computer_id: x.computer_id }, founder.token);

  // ---- K3 / K4 / K4b (AC-15 "a preference never excludes"; WO-5 "the preferred node unavailable")
  await admin.call('archive', { computer_id: Y.computer_id }, founder.token);
  const KP = await W.enroll('K-prefers pref-class', env({ preferred_work_class: 'pref-class' }));
  const KN = await W.enroll('K-no preference', env({ work_types: ['pref-class'] }));
  const RK = RES(50000);
  const doneBy = async (x, r) => { if (r && r.claimed) await x.n.op('complete', { run_id: r.claimed.run_id, status: 'done', termination_reason: 'completed' }); };
  await admin.call('drain', { computer_id: KP.computer_id }, founder.token); await beat(KP, RK);
  const k3a = await claim(KN, await W.submit({ title: 'pref-class while the preferring node drains', work_type: 'pref-class' }), RK); await doneBy(KN, k3a);
  await admin.call('drain', { computer_id: KP.computer_id, drain: false }, founder.token); await beat(KP, RK);
  await asEngine(sup, () => sup.query(`update factory.nodes set last_heartbeat_at = now() - interval '181 seconds' where node_id = $1`, [KP.node_id]));
  const k3b = await claim(KN, await W.submit({ title: 'pref-class while the preferring node is stale', work_type: 'pref-class' }), RK); await doneBy(KN, k3b);
  row('K3 a preference never excludes: while the node that prefers the class is draining, and again while it is stale, a node without the preference claims that class\'s work on its FIRST claim',
    k3a.claimed && k3b.claimed, JSON.stringify([k3a, k3b].map((r) => (r.claimed ? 'claimed' : r.considered))).slice(0, 300));
  await beat(KP, RK);
  const k4w = await W.submit({ title: 'pref-class, the preferring node available', work_type: 'pref-class' });
  const t4 = Date.now();
  const k4first = await claim(KN, k4w, RK);
  let k4 = k4first; let k4waited = 0; const k4answers = [k4first];
  while (!k4.claimed) { await sleep(1000); await beat(KP, RK); k4 = await claim(KN, k4w, RK); k4answers.push(k4); k4waited = Date.now() - t4; if (k4waited > 45000) break; }
  const k4bound = await bound30(k4w, k4answers);
  await doneBy(KN, k4);
  row('K4 with EQUAL resources the preference alone ranks the preferring (available, fresh) node higher: the other node\'s first claim is deferred, and it claims within 30 s of queueing - the preference delays, it never excludes',
    k4first.claimed === null && k4first.considered && k4first.considered[0] && k4first.considered[0].deferred && k4.claimed && k4bound.ok,
    k4bound.detail);
  const k4b = await claim(KP, await W.submit({ title: 'other-class, only the preferring node is eligible', work_type: 'other-class' }), RK); await doneBy(KP, k4b);
  row('K4b the node that prefers a class is never refused other work: the only eligible node for an other-class work order, it claims it at once',
    !!k4b.claimed, k4b.claimed ? 'claimed' : JSON.stringify(k4b).slice(0, 300));
  for (const x of [KP, KN]) await admin.call('archive', { computer_id: x.computer_id }, founder.token);
  // ---- RS: THE RESOURCE REPORT (L2-F6; P-6, P-9): a value the gates or the ranking read is a number, at both layers; a malformed report
  // already stored (planted as the engine: no product path writes one now) never fails ANOTHER node's claim
  await admin.call('archive', { computer_id: Y.computer_id }, founder.token);
  const RSp = await W.enroll('RS-peer', env(), { res: RES(64000) });
  const RSc = await W.enroll('RS-claimer', env(), { res: RES(1000) });
  const stored = async (x) => JSON.stringify((await sup.query('select reported_resources r from factory.nodes where node_id = $1', [x.node_id])).rows[0].r);
  const rs0 = await stored(RSc);
  const EDGE_MSG = /^field resources is an object of at most 8 KiB whose/;
  const viaApi = [await RSc.n.op('heartbeat', { phase: 'AVAILABLE', resources: { ...RES(1000), cpu_pct: 'x' } }), await RSc.n.op('claim', { resources: { ...RES(1000), cpu_pct: 'x' } }),
    await RSc.n.op('register', { runtime_version: '0.1.0', runtime_digest: W.rel.digest, resources: { ...RES(1000), ram_free_mb: 'lots' } })];
  const d = await directNode(W.plane.nodeApiUrl, RSc.identity); await d.session();
  const viaSql = [await d.op('heartbeat', { phase: 'AVAILABLE', resources: { ...RES(1000), cpu_pct: 'x' } }), await d.op('claim', { resources: { ...RES(1000), cpu_pct: 'x' } }),
    await d.op('register', { runtime_version: '0.1.0', runtime_digest: W.rel.digest, resources: { ...RES(1000), ram_free_mb: 'lots' } })];
  await d.close();
  const rs1 = await stored(RSc);
  row('RS1 a resource value that is not a number is refused 400 bad_request by name at BOTH layers - the Node API (its own message) and the SQL front door called directly ("resources.<key> is a number") - for heartbeat, claim and register; nothing is stored',
    viaApi.every((r) => r.http === 400 && r.refused === 'bad_request' && EDGE_MSG.test(r.message || ''))
      && viaSql.every((r) => r.refused === 'bad_request' && r.http === 400) && /resources\.cpu_pct is a number/.test(viaSql[0].message) && /resources\.cpu_pct is a number/.test(viaSql[1].message)
      && /resources\.ram_free_mb is a number/.test(viaSql[2].message) && rs1 === rs0,
    JSON.stringify({ api: viaApi.map((r) => [r.http, r.refused, String(r.message || '').slice(0, 50)]), sql: viaSql.map((r) => [r.http, r.refused, r.message]), unchanged: rs1 === rs0 }));
  // RS2 / RS3: a fresh, AVAILABLE peer that passes the gates carries a malformed stored report (planted); another node's claim is judged
  const plantRes = (r) => asEngine(sup, () => sup.query(`update factory.nodes set reported_resources = $2::jsonb, runtime_phase = 'AVAILABLE', last_heartbeat_at = now() where node_id = $1`, [RSp.node_id, JSON.stringify(r)]));
  await beat(RSc, RES(1000));
  await plantRes({ cpu_cores: 8, cpu_pct: 'x', ram_free_mb: 64000, disk_free_mb: 50000 });
  const w2 = await W.submit({ title: 'rs2' });
  const r2 = await claim(RSc, w2, RES(1000));
  const r2ok = !!r2.claimed || !!(r2.considered && r2.considered[0] && (r2.considered[0].deferred || r2.considered[0].gate));
  if (r2.claimed) await RSc.n.op('complete', { run_id: r2.claimed.run_id, status: 'done', termination_reason: 'completed' });
  row('RS2 while an eligible, fresh, AVAILABLE peer has a stored cpu_pct that is not a number, another node\'s claim is still answered - claimed, or deferred by ranking - and never 500 server_refused',
    r2ok && r2.refused !== 'server_refused' && r2.http !== 500, JSON.stringify({ claimed: !!r2.claimed, refused: r2.refused, message: r2.message, considered: r2.considered }).slice(0, 300));
  await plantRes({ cpu_cores: 8, cpu_pct: 10, ram_free_mb: 'lots', disk_free_mb: 50000 });
  const w3 = await W.submit({ title: 'rs3', min_resources: { ram_mb: 1 } });
  const r3 = await claim(RSc, w3, RES(1000));
  if (r3.claimed) await RSc.n.op('complete', { run_id: r3.claimed.run_id, status: 'done', termination_reason: 'completed' });
  row('RS3 for a work order with a hard minimum (ram_mb 1), a peer whose stored ram_free_mb is not a number is excluded at gate 12 (narrowing only), and the other eligible node claims on its first try',
    !!r3.claimed && r3.refused !== 'server_refused', JSON.stringify({ claimed: !!r3.claimed, refused: r3.refused, message: r3.message }).slice(0, 300));
  // RS4: what a genuine runtime reports is accepted - identity.mjs resources() of this machine, and its edge values (a busy share outside
  // 0..100 from counters that went backwards, no cores, a huge disk, an unknown value, a partial report)
  const genuine = [resources(), resources(), { ...RES(1000), cpu_pct: -3 }, { ...RES(1000), cpu_pct: 140 }, { ...RES(1000), cpu_cores: 0 }, { ...RES(1000), disk_free_mb: 1e12 },
    { ...RES(1000), ram_free_mb: null }, { cpu_cores: 4 }];
  const rs4 = [];
  for (const r of genuine) rs4.push(await RSc.n.op('heartbeat', { phase: 'AVAILABLE', resources: r }));
  row('RS4 a genuine runtime\'s report is never refused: this machine\'s identity.mjs resources() and the edge values (cpu_pct -3 and 140, 0 cores, a 1e12 MB disk, a null value, a partial report) are accepted',
    rs4.every((r) => r.ok), JSON.stringify(rs4.filter((r) => !r.ok).map((r) => [r.http, r.refused, r.message])));
  for (const x of [RSp, RSc]) await admin.call('archive', { computer_id: x.computer_id }, founder.token);
  // ---- LS1: THE LEASE A CLAIM AND A RENEW GRANT (P-2: the ported 69df2f52 default, scripts/factory-runner/claim.mjs DEFAULT_LEASE_SECONDS
  // = 120; a requested value is held to 5..600). The enrolled runtime claims without lease_seconds and renews with what the claim
  // granted, so the default is the lease of every genuine run. Read from the run row: lease_expires_at - last_heartbeat_at (both the
  // call's now()). Through the Node API (the value absent, or a number) and through the front door directly (a string, a JSON null).
  const LSn = await W.enroll('LS-node', env(), { res: RES(3e7) });
  const leaseOf = async (run) => Number((await sup.query('select extract(epoch from lease_expires_at - last_heartbeat_at)::float8 s from factory.agent_runs where run_id = $1', [run])).rows[0].s);
  const ls = {};
  const lc1 = await claim(LSn, await W.submit({ title: 'ls-default' }), RES(3e7));
  const lr1 = lc1.claimed && lc1.claimed.run_id;
  ls.claimAbsent = lr1 ? await leaseOf(lr1) : 'not claimed: ' + JSON.stringify(lc1).slice(0, 160);
  const lsRenew = async (x, body) => { const r = await x.op('renew', { run_id: lr1, ...body }); return r.ok ? await leaseOf(lr1) : r.refused + ':' + r.http; };
  ls.renew30 = await lsRenew(LSn.n, { lease_seconds: 30 });
  ls.renewAbsent = await lsRenew(LSn.n, {});
  const dl = await directNode(W.plane.nodeApiUrl, LSn.identity); await dl.session();
  ls.renewString = await lsRenew(dl, { lease_seconds: 'x' });
  ls.renewNull = await lsRenew(dl, { lease_seconds: null });
  ls.renewHuge = await lsRenew(dl, { lease_seconds: 1e9 });
  ls.renewTiny = await lsRenew(dl, { lease_seconds: 1 });
  if (lr1) await LSn.n.op('complete', { run_id: lr1, status: 'done', termination_reason: 'completed' });
  const lc2 = await dl.op('claim', { only_work_order_id: await W.submit({ title: 'ls-string' }), lease_seconds: 'x', resources: RES(3e7) });
  ls.claimString = lc2.claimed ? await leaseOf(lc2.claimed.run_id) : 'not claimed: ' + JSON.stringify(lc2).slice(0, 160);
  if (lc2.claimed) await dl.op('complete', { run_id: lc2.claimed.run_id, status: 'done', termination_reason: 'completed' });
  await dl.close();
  await admin.call('archive', { computer_id: LSn.computer_id }, founder.token);
  row('LS1 the lease: a claim and a renew that name no lease_seconds, or name it as a string or a JSON null, are granted 120 s (the 69df2f52 default); a number is honoured (30 s) and held to 5..600 s (1e9 -> 600, 1 -> 5)',
    ls.claimAbsent === 120 && ls.renewAbsent === 120 && ls.renewString === 120 && ls.renewNull === 120 && ls.claimString === 120 && ls.renew30 === 30 && ls.renewHuge === 600 && ls.renewTiny === 5,
    JSON.stringify(ls));
  // ---- G4r: gate 4 is enforced BY THE SERVER for a superseded, an adopted, a key-revoked and a revoked release - whatever the node
  // itself does (an honest runtime stands by on its own; this client does not, so only the server stands between it and the work)
  // R4 outranks Z (more resources), so Z never defers to an ineligible R4 and R4 never defers to Z: only the gate is observed
  const R4 = await W.enroll('G4-release', env(), { res: RES(2e7) });
  const Z = await W.enroll('G4-z', env(), { res: RES(1e7) });
  const claimDone = async (x) => {
    const res = RES(x === R4 ? 2e7 : 1e7);
    await beat(x, res);
    const r = await claim(x, await W.submit({ title: 'g4r' }), res);
    if (r.claimed) await x.n.op('complete', { run_id: r.claimed.run_id, status: 'done', termination_reason: 'completed' });
    return r;
  };
  const g4r = {};
  g4r.before = gateOf(await claimDone(R4));
  const P2 = await admin.call('publish-release', { channel: 'dev', version: '0.2.0', source_sha: 'a'.repeat(40), digest: 'b'.repeat(64), key_id: 'dev-key-0002', signature: 'A'.repeat(86), receipt_sha256: 'c'.repeat(64), manifest: {} }, founder.token);
  const zreg = await Z.n.op('register', { runtime_version: '0.2.0', runtime_digest: 'b'.repeat(64), fingerprint: Z.fingerprint, hostname: 'G4-z', os: 'Windows' });
  g4r.zPublished = gateOf(await claimDone(Z));
  g4r.superseded = gateOf(await claimDone(R4));
  const ad1 = await admin.call('adopt-release', { computer_id: R4.computer_id, release_id: W.rel.releaseId }, founder.token);
  g4r.adopted = gateOf(await claimDone(R4));
  await admin.call('revoke-key', { key_id: 'dev-key-0001', reason: 'G4r' }, founder.token);
  g4r.keyRevoked = gateOf(await claimDone(R4));
  const ad2 = await admin.call('adopt-release', { computer_id: R4.computer_id, release_id: W.rel.releaseId }, founder.token);
  g4r.otherKey = gateOf(await claimDone(Z));
  await admin.call('revoke-release', { release_id: P2.release_id, reason: 'G4r' }, founder.token);
  g4r.releaseRevoked = gateOf(await claimDone(Z));
  row('G4r gate 4 on the server: a superseded release without an adopt is refused; an admin adopt restores it; a release signed by a revoked key is refused even adopted, and never adopted again (key_revoked); another key\'s release is unaffected; a revoked release is refused',
    P2.ok && zreg.ok && g4r.before === 0 && g4r.zPublished === 0 && g4r.superseded === 4 && ad1.ok && g4r.adopted === 0 && g4r.keyRevoked === 4
      && ad2.refused === 'key_revoked' && g4r.otherKey === 0 && g4r.releaseRevoked === 4,
    JSON.stringify({ ...g4r, P2: P2.ok || P2.refused, zreg: zreg.ok || zreg.refused, ad1: ad1.ok || ad1.refused, ad2: ad2.refused || ad2.ok }));
} catch (e) {
  // a crash is a named row, never a silent exit: the suite did not complete
  row('X0 eligibility_acceptance did not complete', false, (e && e.stack) || String(e));
} finally {
  await W.stop();
}
const failed = results.filter((r) => !r.ok);
console.log('\neligibility_acceptance: ' + (results.length - failed.length) + '/' + results.length + ' OK' + (failed.length ? '; FAILED: ' + failed.map((r) => r.id.split(' ')[0]).join(', ') : ''));
const ev = process.argv.indexOf('--evidence');
if (ev > 0) writeFileSync(process.argv[ev + 1], ['qa/factory/v1/eligibility_acceptance.mjs', 'migration sha256 ' + sha256(compose()), '',
  ...results.map((r) => (r.ok ? 'OK   ' : 'FAIL ') + r.id + (r.detail ? ' - ' + r.detail : '')), '', (results.length - failed.length) + '/' + results.length + ' OK'].join('\n') + '\n');
process.exit(failed.length ? 1 : 0);
