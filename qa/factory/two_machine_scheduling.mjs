#!/usr/bin/env node
// TWO-MACHINE CONFLICT-AWARE SCHEDULING AND VERIFIER INDEPENDENCE (Factory V1 milestones 3 and 4 on real machines).
//
// The one-machine proofs (CP-8, CP-9..CP-11) used processes. This script asks the same questions of MACHINES, coordinated
// through the plane alone: one stamp names four work orders - two that own the SAME surface (they may never run at the
// same time), one free, and one that requires the verifier role - and each machine runs one `wave` against them. The
// waves hold their claims for a while so the other machine's wave overlaps them in time; `verify` then reads intervals,
// hostnames and roles from the plane. Two node ids on one hostname prove the instrument; two hostnames prove the milestone.
//
//   node qa/factory/two_machine_scheduling.mjs seed                      either PC: queue the four work orders; prints STAMP
//   node qa/factory/two_machine_scheduling.mjs wave <stamp> [holdSec]    EACH PC, within a minute of each other: claim what this
//                                                                        node may, hold it (heartbeating) for holdSec (default 45), complete it;
//                                                                        a verifier node also records a verification of the other machine's run
//   node qa/factory/two_machine_scheduling.mjs verify <stamp>            either PC: exit 0 TWO MACHINES, 3 SAME MACHINE, 1 FAIL
//   node qa/factory/two_machine_scheduling.mjs cleanup [<stamp>|all]
//   node qa/factory/two_machine_scheduling.mjs rehearse                  one machine, two node ids (generic + verifier), real processes; must end in 3
//
// The node's role comes from FACTORY_NODE_ROLE (the Work PC is `verifier`), its id from .factory/node-id; FACTORY_NODE_ID
// overrides the id for the rehearsal. Needs FACTORY_RUNNER_PG_URL (judged by db.mjs).
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const [mode, stampArg, holdArg] = process.argv.slice(2);
const TITLE = 'TM-sched';
if (!mode) { console.log('usage: two_machine_scheduling.mjs seed | wave <stamp> [holdSec] | verify <stamp> | cleanup [<stamp>|all] | rehearse'); process.exit(2); }
if (!process.env.FACTORY_RUNNER_PG_URL) { console.log('FACTORY_RUNNER_PG_URL is not set (the designed refusal)'); process.exit(2); }
const db = await import(pathToFileURL(join(ROOT, 'scripts/factory-runner/db.mjs')).href);
const claim = await import(pathToFileURL(join(ROOT, 'scripts/factory-runner/claim.mjs')).href);
const nodeMod = await import(pathToFileURL(join(ROOT, 'scripts/factory-runner/node.mjs')).href);
const myNode = process.env.FACTORY_NODE_ID || nodeMod.nodeId();
const role = nodeMod.nodeRole();
const HOST = hostname();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const KINDS = ['conflict-a', 'conflict-b', 'free', 'verifier'];
const register = () => claim.registerNode({ nodeId: myNode, capabilities: ['two-machine-scheduling'], securityRole: role, platform: process.platform + ' ' + HOST, agentVersion: process.version });
const stampWos = async (stamp) => (await db.read('select work_order_id, title, requires_security_role, status from factory.work_orders where title like $1 order by title', [TITLE + ' ' + stamp + ' %'])).rows;

if (mode === 'seed') {
  await register();
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '') + '-' + randomUUID().slice(0, 4);
  const shared = 'qa/factory/two_machine/sched/' + stamp + '/shared';
  for (const k of KINDS) {
    const id = randomUUID();
    const surface = k.startsWith('conflict') ? shared : 'qa/factory/two_machine/sched/' + stamp + '/' + k;
    await db.write("insert into factory.work_orders (work_order_id, title, owned_surface, priority, status, requires_security_role) values ($1, $2, $3::text[], 'high', 'queued', $4)",
      [id, TITLE + ' ' + stamp + ' ' + k, [surface], k === 'verifier' ? 'verifier' : 'generic']);
  }
  console.log('STAMP ' + stamp);
  console.log('queued 4 work orders (two on one surface, one free, one requiring the verifier role) by ' + myNode.slice(0, 13) + ' on ' + HOST);
  console.log('next, on EACH PC within a minute of each other:  node qa/factory/two_machine_scheduling.mjs wave ' + stamp);
  process.exit(0);
}

if (mode === 'wave') {
  if (!stampArg) { console.log('wave needs the stamp'); process.exit(2); }
  const hold = Number(holdArg || 45);
  await register();
  const wos = await stampWos(stampArg);
  if (wos.length !== 4) { console.log('expected 4 stamped work orders, found ' + wos.length + ' - run seed first'); process.exit(1); }
  const held = [];
  const until = Date.now() + (hold + 60) * 1000;
  console.log('wave on ' + HOST + ' as ' + myNode.slice(0, 13) + ' (' + role + '); trying each stamped work order for up to ' + (hold + 60) + ' s, holding claims ' + hold + ' s');
  // claim what this node MAY (role, surface lock): each work order is tried by id so nothing else on the plane is touched
  while (Date.now() < until) {
    for (const wo of wos) {
      if (held.some((h) => h.wo === wo.work_order_id)) continue;
      const done = (await db.read('select status from factory.work_orders where work_order_id = $1', [wo.work_order_id])).rows[0];
      if (!done || done.status === 'done') continue;
      const run = await claim.claimWork({ nodeId: myNode, leaseSeconds: 60, onlyWorkOrderId: wo.work_order_id });
      if (run) {
        held.push({ wo: wo.work_order_id, run: run.run_id, kind: wo.title.split(' ').pop(), at: Date.now() });
        await claim.checkpoint({ runId: run.run_id, workOrderId: wo.work_order_id, location: 'qa/factory/two_machine_scheduling.mjs', scenario: 'wave', payload: { nodeId: myNode, hostname: HOST, role, kind: wo.title.split(' ').pop() } });
        console.log('  claimed ' + wo.title.split(' ').pop() + ' as run ' + run.run_id.slice(0, 8));
      }
    }
    // heartbeat what is held; complete what has been held long enough
    for (const h of held.filter((x) => !x.completed)) {
      await claim.heartbeat({ runId: h.run, nodeId: myNode, leaseSeconds: 60 });
      if (Date.now() - h.at >= hold * 1000) {
        // a verifier node, on the verifier work order, records a verification of a run authored elsewhere for this stamp
        let verified = null;
        if (h.kind === 'verifier' && role === 'verifier') {
          const others = (await db.read("select r.run_id, r.node_id, n.platform from factory.agent_runs r join factory.work_orders w on w.work_order_id = r.work_order_id join factory.nodes n on n.node_id = r.node_id where w.title like $1 and r.node_id <> $2 and r.status in ('in_progress','done') order by r.started_at limit 1", [TITLE + ' ' + stampArg + ' conflict-%', myNode])).rows;
          if (others.length) { const v = await claim.recordVerification({ authoringRunId: others[0].run_id, verificationRunId: h.run }); verified = v.accepted ? others[0].run_id : 'REJECTED ' + v.reason; }
          else verified = 'no run from another node to verify yet';
          console.log('  verification: ' + verified);
        }
        await claim.completeRun({ runId: h.run, status: 'done', summary: h.kind + ' by ' + myNode + ' on ' + HOST + (verified ? '; verified ' + verified : ''), terminationReason: 'two_machine_scheduling_completed' });
        h.completed = true;
        console.log('  completed ' + h.kind);
      }
    }
    if (held.length && held.every((x) => x.completed)) {
      const remaining = (await db.read("select count(*)::int n from factory.work_orders where title like $1 and status <> 'done'", [TITLE + ' ' + stampArg + ' %'])).rows[0].n;
      if (remaining === 0) break;
    }
    await sleep(2000);
  }
  console.log('wave done on ' + HOST + ': ' + held.map((h) => h.kind).join(', ') + (held.length ? '' : ' (nothing claimed - the other machine held everything this node may take)'));
  console.log('next, on either PC:  node qa/factory/two_machine_scheduling.mjs verify ' + stampArg);
  process.exit(0);
}

if (mode === 'verify') {
  if (!stampArg) { console.log('verify needs the stamp'); process.exit(2); }
  const wos = await stampWos(stampArg);
  const runs = (await db.read("select r.run_id, r.work_order_id, r.status, r.node_id, r.started_at, r.finished_at, r.authoring_node_id, r.verification_run_id, r.verification_node_id, w.title, n.platform, n.security_role from factory.agent_runs r join factory.work_orders w on w.work_order_id = r.work_order_id left join factory.nodes n on n.node_id = r.node_id where w.title like $1 and r.status = 'done' order by r.started_at", [TITLE + ' ' + stampArg + ' %'])).rows;
  const kind = (r) => r.title.split(' ').pop();
  const host = (p) => String(p || '').split(' ')[1] || '';
  let ok = true;
  const say = (good, label, detail) => { if (!good) ok = false; console.log((good ? 'OK   ' : 'FAIL ') + label + (detail ? '  — ' + detail : '')); };
  say(wos.length === 4 && wos.every((w) => w.status === 'done'), 'all four work orders are done', wos.map((w) => kind(w) + ':' + w.status).join(', '));
  const a = runs.find((r) => kind(r) === 'conflict-a'), b = runs.find((r) => kind(r) === 'conflict-b');
  const disjoint = a && b && (new Date(a.finished_at) <= new Date(b.started_at) || new Date(b.finished_at) <= new Date(a.started_at));
  say(Boolean(a && b) && disjoint, 'the two work orders on ONE surface never ran at the same time (intervals disjoint)', a && b ? kind(a) + ' [' + a.started_at + ' → ' + a.finished_at + '] ' + kind(b) + ' [' + b.started_at + ' → ' + b.finished_at + ']' : 'missing runs');
  const free = runs.find((r) => kind(r) === 'free');
  say(Boolean(free), 'the free work order completed', free ? 'on ' + host(free.platform) : '');
  const hosts = new Set(runs.map((r) => host(r.platform)).filter(Boolean));
  say(runs.length >= 4, 'four completed runs recorded (' + runs.length + ') from ' + hosts.size + ' hostname(s): ' + [...hosts].join(', '));
  const v = runs.find((r) => kind(r) === 'verifier');
  say(Boolean(v) && v.security_role === 'verifier', 'the verifier-role work order was completed by a verifier-role node', v ? host(v.platform) + ' ' + v.security_role : 'no verifier run');
  const verified = runs.find((r) => r.verification_run_id && r.verification_node_id);
  const vHost = verified ? host((await db.read('select platform from factory.nodes where node_id = $1', [verified.verification_node_id])).rows[0]?.platform) : '';
  say(Boolean(verified) && verified.verification_node_id !== verified.authoring_node_id, 'a run was verified by a DIFFERENT node than its author (the plane\'s constraint held)', verified ? 'author ' + String(verified.authoring_node_id).slice(0, 13) + ' on ' + host(verified.platform) + ', verifier ' + String(verified.verification_node_id).slice(0, 13) + ' on ' + vHost : 'no verification recorded');
  const genericHeldVerifier = runs.some((r) => kind(r) === 'verifier' && r.security_role !== 'verifier');
  say(!genericHeldVerifier, 'no generic node ever held the verifier work order');
  const twoMachines = hosts.size >= 2 && verified && vHost && vHost !== host(verified.platform);
  console.log('');
  if (!ok) { console.log('VERDICT: FAIL'); process.exit(1); }
  if (twoMachines) { console.log('VERDICT: TWO MACHINES — conflict-aware scheduling and verifier independence held across ' + [...hosts].join(' and ') + '. Milestones 3 and 4 proved on real machines.'); process.exit(0); }
  console.log('VERDICT: SAME MACHINE (' + [...hosts].join(', ') + ') — the instrument works; the milestones are NOT proved until the waves run on different hostnames.');
  process.exit(3);
}

if (mode === 'cleanup') {
  const which = stampArg || 'all';
  const ids = (await db.read('select work_order_id from factory.work_orders where title like $1', [which === 'all' ? TITLE + ' %' : TITLE + ' ' + which + ' %'])).rows.map((r) => r.work_order_id);
  for (const id of ids) { await db.write('delete from factory.checkpoints where work_order_id = $1', [id]); await db.write('delete from factory.agent_runs where work_order_id = $1', [id]); await db.write('delete from factory.work_orders where work_order_id = $1', [id]); }
  console.log('removed ' + ids.length + ' scheduling work order(s) and their runs and checkpoints; nothing else touched');
  process.exit(0);
}

if (mode === 'rehearse') {
  const self = fileURLToPath(import.meta.url);
  const child = (args, env = {}) => new Promise((resolve) => { const c = spawn(process.execPath, [self, ...args], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }); let out = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; }); c.on('exit', (code) => resolve({ code, out })); });
  const seeded = await child(['seed']);
  const stamp = (seeded.out.match(/STAMP (\S+)/) || [])[1];
  console.log(seeded.out.trim());
  if (!stamp) process.exit(1);
  const tag = randomUUID().slice(0, 8);
  const [wa, wb] = await Promise.all([
    child(['wave', stamp, '8'], { FACTORY_NODE_ID: 'node-rehearsal-generic-' + tag, FACTORY_NODE_ROLE: 'generic' }),
    child(['wave', stamp, '8'], { FACTORY_NODE_ID: 'node-rehearsal-verifier-' + tag, FACTORY_NODE_ROLE: 'verifier' }),
  ]);
  console.log(wa.out.trim() + '\n' + wb.out.trim());
  const ver = await child(['verify', stamp]);
  console.log(ver.out.trim());
  console.log((await child(['cleanup', stamp])).out.trim());
  const expected = wa.code === 0 && wb.code === 0 && ver.code === 3;
  console.log(expected ? 'REHEARSAL OK: both waves completed and verify reported SAME MACHINE (3) as it must on one machine' : 'REHEARSAL FAILED: waves ' + wa.code + '/' + wb.code + ', verify ' + ver.code);
  process.exit(expected ? 0 : 1);
}
console.log('unknown mode ' + mode);
process.exit(2);
