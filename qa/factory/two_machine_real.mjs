#!/usr/bin/env node
// THE REAL-MACHINE ACCEPTANCE, DRIVEN FROM ONE PC THROUGH THE PLANE. The supervised workers on each machine execute
// `factory_acceptance` work orders (handlers/factory-acceptance.mjs); this script only seeds them, waits, and reads
// what the workers recorded. Nobody types anything on the Work PC beyond its bootstrap.
//
//   node qa/factory/two_machine_real.mjs nodes                       the ALIVE nodes on the plane, by hostname and role
//   node qa/factory/two_machine_real.mjs run [--home <nodeId>] [--work <nodeId>]
//        S1 failover home→work   the home node dies on the work order, the work node takes it over from the checkpoint
//        S2 failover work→home   the other way round
//        S3 scheduling           two work orders on one surface + one free, held 25 s: the pair never overlaps
//        S4 verifier independence  the work node (verifier role) records a verification of a run the home node completed
//        verdict: exit 0 TWO MACHINES (the two nodes are on different hostnames), 3 SAME MACHINE, 1 FAIL
//   node qa/factory/two_machine_real.mjs cleanup                      remove this script's work orders (title prefix TMR-)
//
// Defaults: --home is this checkout's node id; --work is the ALIVE verifier-role node with a different id (the Work PC once
// bootstrapped; a rehearsal node on this machine otherwise). Needs FACTORY_RUNNER_PG_URL (or ~/.brain-factory/runner.env).
import { existsSync, readFileSync } from 'node:fs';
import { homedir, hostname } from 'node:os';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
if (!process.env.FACTORY_RUNNER_PG_URL) {
  const f = process.env.FACTORY_RUNNER_ENV_FILE || join(homedir(), '.brain-factory', 'runner.env');
  const line = existsSync(f) ? readFileSync(f, 'utf8').split(/\r?\n/).find((l) => l.startsWith('FACTORY_RUNNER_PG_URL=')) : null;
  if (!line) { console.log('FACTORY_RUNNER_PG_URL is not set and ' + f + ' has no line for it'); process.exit(2); }
  process.env.FACTORY_RUNNER_PG_URL = line.slice('FACTORY_RUNNER_PG_URL='.length).trim();
}
const db = await import(pathToFileURL(join(ROOT, 'scripts/factory-runner/db.mjs')).href);
const nodeMod = await import(pathToFileURL(join(ROOT, 'scripts/factory-runner/node.mjs')).href);
const argv = process.argv.slice(2);
const mode = argv[0];
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TITLE = 'TMR-';
const hostOf = (platform) => String(platform || '').split(' ')[1] || '';

const aliveNodes = async () => (await db.read("select node_id, security_role, platform, extract(epoch from (now() - last_heartbeat_at)) as age from factory.nodes where last_heartbeat_at > now() - interval '3 minutes' order by last_heartbeat_at desc")).rows
  .map((n) => ({ nodeId: n.node_id, role: n.security_role, host: hostOf(n.platform), ageS: Math.round(Number(n.age)) }));

if (mode === 'nodes') {
  const nodes = await aliveNodes();
  if (!nodes.length) console.log('no ALIVE node on the plane (heartbeat within 3 min)');
  for (const n of nodes) console.log(n.nodeId.slice(0, 20) + '  ' + n.role.padEnd(14) + ' ' + n.host + '  heartbeat ' + n.ageS + ' s ago');
  process.exit(0);
}
if (mode === 'cleanup') {
  const ids = (await db.read('select work_order_id from factory.work_orders where title like $1', [TITLE + '%'])).rows.map((r) => r.work_order_id);
  for (const id of ids) { await db.write('delete from factory.checkpoints where work_order_id = $1', [id]); await db.write('delete from factory.agent_runs where work_order_id = $1', [id]); await db.write('delete from factory.work_orders where work_order_id = $1', [id]); }
  console.log('removed ' + ids.length + ' TMR- work order(s) and their runs and checkpoints');
  process.exit(0);
}
if (mode !== 'run') { console.log('usage: two_machine_real.mjs nodes | run [--home <nodeId>] [--work <nodeId>] | cleanup'); process.exit(2); }

const nodes = await aliveNodes();
const home = nodes.find((n) => n.nodeId === (opt('--home') || nodeMod.nodeId()));
const work = opt('--work') ? nodes.find((n) => n.nodeId === opt('--work')) : nodes.find((n) => n.role === 'verifier' && n.nodeId !== (home && home.nodeId));
if (!home) { console.log('the home node (' + (opt('--home') || nodeMod.nodeId()).slice(0, 20) + ') is not ALIVE on the plane - is its supervisor running?'); process.exit(1); }
if (!work) { console.log('no ALIVE verifier-role node other than the home node - bootstrap the Work PC (install-autostart.ps1 -Role verifier -Start) and wait for its heartbeat'); process.exit(1); }
console.log('home ' + home.nodeId.slice(0, 20) + ' (' + home.role + ') on ' + home.host + ' | work ' + work.nodeId.slice(0, 20) + ' (' + work.role + ') on ' + work.host);

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '') + '-' + randomUUID().slice(0, 4);
const seed = async (name, payload, { caps = ['factory_acceptance'], role = 'generic', surface = null } = {}) => {
  const id = randomUUID();
  await db.write("insert into factory.work_orders (work_order_id, title, work_type, owned_surface, priority, status, requires_security_role, requires_capabilities, handoff) values ($1, $2, 'factory_acceptance', $3::text[], 'high', 'queued', $4, $5::text[], $6)",
    [id, TITLE + stamp + ' ' + name, [surface || ('qa/factory/real/' + stamp + '/' + name)], role, caps, JSON.stringify(payload)]);
  return id;
};
const status = async (id) => (await db.read('select status from factory.work_orders where work_order_id = $1', [id])).rows[0]?.status;
const waitDone = async (ids, ms) => { const until = Date.now() + ms; while (Date.now() < until) { const st = await Promise.all(ids.map(status)); if (st.every((s) => s === 'done')) return true; await sleep(5000); } return false; };
const cps = async (id) => (await db.read('select scenario, payload, created_at from factory.checkpoints where work_order_id = $1 order by created_at', [id])).rows;
const runsOf = async (id) => (await db.read("select r.run_id, r.status, r.node_id, r.started_at, r.finished_at, r.termination_reason, r.verification_node_id, r.authoring_node_id, n.platform from factory.agent_runs r left join factory.nodes n on n.node_id = r.node_id where r.work_order_id = $1 order by r.started_at", [id])).rows;
let ok = true;
const say = (good, label, detail) => { if (!good) ok = false; console.log((good ? 'OK   ' : 'FAIL ') + label + (detail ? '  — ' + detail : '')); };

const failover = async (label, from, to) => {
  const wo = await seed('failover ' + from.host + '>' + to.host, { action: 'die', dieOn: from.nodeId, takeoverNode: to.nodeId }, { caps: ['factory_acceptance', 'node:' + from.nodeId] });
  console.log('  seeded ' + label + ' (' + wo.slice(0, 8) + '); waiting for the die, the lease lapse and the takeover...');
  const done = await waitDone([wo], 6 * 60000);
  const c = await cps(wo);
  const p1 = c.find((x) => x.scenario === 'phase-1-hold'), p2 = c.find((x) => x.scenario === 'phase-2-takeover');
  const runs = await runsOf(wo);
  const doneRun = runs.find((r) => r.status === 'done');
  say(done && p1 && p1.payload.nodeId === from.nodeId, label + ': the named node died on the work order', p1 ? p1.payload.nodeId.slice(0, 20) + ' on ' + p1.payload.hostname : 'no phase-1 checkpoint');
  say(done && p2 && p2.payload.nodeId === to.nodeId && p2.payload.resumedFrom === from.nodeId, label + ': the takeover node completed it from the dead node\'s checkpoint', p2 ? p2.payload.nodeId.slice(0, 20) + ' on ' + p2.payload.hostname + ' resumed from ' + String(p2.payload.resumedFrom).slice(0, 20) : 'no phase-2 checkpoint');
  say(!!doneRun && doneRun.termination_reason === 'factory_acceptance_takeover' && doneRun.node_id === to.nodeId, label + ': the done run belongs to the takeover node with the stated termination reason', doneRun ? doneRun.termination_reason : 'no done run');
  return { p1, p2, doneRun };
};

// S1, S2
const s1 = await failover('S1 home→work', home, work);
const s2 = await failover('S2 work→home', work, home);

// S3 scheduling
{
  const surface = 'qa/factory/real/' + stamp + '/shared';
  const a = await seed('conflict-a', { action: 'hold', seconds: 25 }, { surface });
  const b = await seed('conflict-b', { action: 'hold', seconds: 25 }, { surface });
  const f = await seed('free', { action: 'hold', seconds: 25 });
  console.log('  seeded S3 (3 work orders, two on one surface, held 25 s each); waiting...');
  const done = await waitDone([a, b, f], 6 * 60000);
  const ra = (await runsOf(a)).find((r) => r.status === 'done'), rb = (await runsOf(b)).find((r) => r.status === 'done'), rf = (await runsOf(f)).find((r) => r.status === 'done');
  const disjoint = ra && rb && (new Date(ra.finished_at) <= new Date(rb.started_at) || new Date(rb.finished_at) <= new Date(ra.started_at));
  const hosts = new Set([ra, rb, rf].filter(Boolean).map((r) => hostOf(r.platform)));
  say(done && disjoint, 'S3: the two work orders on one surface never ran at the same time', ra && rb ? '[' + ra.started_at + ' → ' + ra.finished_at + '] vs [' + rb.started_at + ' → ' + rb.finished_at + ']' : 'missing runs');
  say(done && !!rf, 'S3: the free work order completed', rf ? 'on ' + hostOf(rf.platform) : '');
  console.log('     S3 runs came from ' + hosts.size + ' hostname(s): ' + [...hosts].join(', ') + (hosts.size < 2 ? ' (both workers were free to take any of the three; one may have taken them all)' : ''));
}

// S4 verifier independence: the work node verifies the run the HOME node completed in S2 (authored on home)
{
  const authored = s2.doneRun && s2.doneRun.run_id;
  const v = await seed('verify', { action: 'verify', authoringRunId: authored }, { role: 'verifier' });
  console.log('  seeded S4 (a verifier-role work order verifying run ' + String(authored).slice(0, 8) + ' completed on ' + home.host + '); waiting...');
  const done = await waitDone([v], 4 * 60000);
  const c = (await cps(v)).find((x) => x.scenario === 'verify');
  const rv = (await runsOf(v)).find((r) => r.status === 'done');
  const auth = authored ? (await db.read('select a.verification_node_id, a.authoring_node_id, nv.platform vp, na.platform ap from factory.agent_runs a left join factory.nodes nv on nv.node_id = a.verification_node_id left join factory.nodes na on na.node_id = a.authoring_node_id where a.run_id = $1', [authored])).rows[0] : null;
  say(done && c && c.payload.accepted === true && rv && rv.node_id === work.nodeId, 'S4: the work node (verifier role) recorded a verification of the home node\'s run through the runner\'s own path', c ? 'accepted=' + c.payload.accepted + (c.payload.reason ? ' ' + c.payload.reason : '') : 'no verify checkpoint');
  say(auth && auth.verification_node_id === work.nodeId && auth.authoring_node_id === home.nodeId, 'S4: the plane records the verifier node ≠ the authoring node', auth ? 'author ' + String(auth.authoring_node_id).slice(0, 20) + ' on ' + hostOf(auth.ap) + ', verifier ' + String(auth.verification_node_id).slice(0, 20) + ' on ' + hostOf(auth.vp) : 'no run');
}

console.log('');
if (!ok) { console.log('VERDICT: FAIL (stamp ' + stamp + ')'); process.exit(1); }
if (home.host && work.host && home.host !== work.host) { console.log('VERDICT: TWO MACHINES — ' + home.host + ' and ' + work.host + ': failover both ways, conflict-aware scheduling and verifier independence held on real machines (stamp ' + stamp + ').'); process.exit(0); }
console.log('VERDICT: SAME MACHINE (' + home.host + ') — the instrument works end to end through the live plane and the supervised workers; the milestones are NOT proved until the work node is on another hostname (stamp ' + stamp + ').');
process.exit(3);
