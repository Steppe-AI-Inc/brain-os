#!/usr/bin/env node
// THE SHARED PLANE, LIVE: the process-level rows of shared_control_plane_acceptance.mjs that do not stop or restart a server,
// run against the REAL control plane (FACTORY_RUNNER_PG_URL, read from ~/.brain-factory/runner.env unless set) from this
// machine. Nothing here touches the server's lifecycle, nothing here reaches Brain OS production, and every row it writes
// carries the title prefix LP- and a capability only its own worker processes register, so the real node running on this
// machine never claims a test work order and the test never claims real work.
//
//   L0  plane identity, TLS in use, the runner role
//   L1  two runner processes race for one work order: exactly one claims it
//   L2  a worker dies mid-run: the work order is held until the lease expires, then another process resumes it with the checkpoint
//   L3  three processes, two work orders on one surface: the pair never overlaps, the free one is claimed, all complete
//   L4  roles from the plane's node record: generic cannot take verifier work, a verifier can, release_broker work waits for both
//   L5  a liar claimer (capabilities it did not register) is refused by the record
//   L6  independent verification: a different process and node verifies; self-verification is refused by the constraint
//   L7  admission control: a starved process claims nothing and says why
//   L8  heavy limits: two heavy work orders, one per plane: the second waits while the first holds, and completes after
//   L9  assurance gate: a process intending deepseek-chat with no DEEPSEEK_API_KEY is declined verifier work (BLOCKED_BY_CREDENTIAL); the work order waits
//   L10 no silent model fallback: a run reporting a different model than requested is refused at completion
//
// Round trips to the plane are ~1 s, so leases are 20 s and waits are generous; this suite takes several minutes.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const WORKER = join(ROOT, 'qa/factory/shared_pg_worker.mjs');
{
  const { ensureRunnerEnv } = await import(pathToFileURL(join(ROOT, 'scripts/factory-runner/runner-env.mjs')).href);
  const note = ensureRunnerEnv();
  if (!process.env.FACTORY_RUNNER_PG_URL) { console.log(note); process.exit(2); }
}
process.env.FACTORY_ADMISSION = process.env.FACTORY_ADMISSION || 'off';
const db = await import(pathToFileURL(join(ROOT, 'scripts/factory-runner/db.mjs')).href);
const CAP = 'shared-plane-acceptance'; // what shared_pg_worker registers; the real node does not
let pass = 0; const failures = [];
const check = (label, ok, detail) => { if (ok) { pass++; console.log('OK   ' + label); } else { failures.push(label); console.log('FAIL ' + label + (detail ? '\n       ' + String(detail).slice(0, 700) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const runAsync = (args, env = {}) => new Promise((res) => { const c = spawn(process.execPath, args, { cwd: ROOT, env: { ...process.env, ...env }, windowsHide: true }); let out = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; }); c.on('exit', (code) => res({ code, out })); });
const claimedIn = (o) => (/CLAIMED \S+ (\S+)/.exec(o.out) || [])[1] || null;
const runIdIn = (o) => (/CLAIMED (\S+) /.exec(o.out) || [])[1] || null;
const mk = async (title, { surface = null, role = 'generic', weight = 'normal' } = {}) => {
  const id = randomUUID();
  await db.write("insert into factory.work_orders (work_order_id, title, owned_surface, priority, status, requires_security_role, requires_capabilities, weight) values ($1, $2, $3::text[], 'high', 'queued', $4, $5::text[], $6)",
    [id, 'LP-' + title, [surface || ('qa/factory/live/' + id.slice(0, 8))], role, [CAP], weight]);
  return id;
};
const status = async (id) => (await db.read('select status from factory.work_orders where work_order_id = $1', [id])).rows[0]?.status;
const cleanup = async () => {
  const ids = (await db.read("select work_order_id from factory.work_orders where title like 'LP-%'")).rows.map((r) => r.work_order_id);
  for (const id of ids) { await db.write('delete from factory.checkpoints where work_order_id = $1', [id]); await db.write('delete from factory.agent_runs where work_order_id = $1', [id]); await db.write('delete from factory.work_orders where work_order_id = $1', [id]); }
  await db.write("delete from factory.nodes where node_id like 'node-lp-%' and node_id not in (select node_id from factory.agent_runs where node_id is not null)");
  return ids.length;
};
const tag = () => randomUUID().slice(0, 6);
const LEASE = '20';

const swept = await cleanup();
if (swept) console.log('swept ' + swept + ' leftover LP- work order(s)');
try {
  // L0
  const id = (await db.read('select project_ref from factory.plane_identity')).rows[0];
  const who = (await db.read('select current_user u, version() v')).rows[0];
  const ssl = (await db.withClient((c) => c.query('select ssl, version from pg_stat_ssl where pid = pg_backend_pid()'))).rows[0];
  check('L0 live plane ' + (id && id.project_ref) + ' over ' + (ssl && ssl.version) + ' as ' + String(who.u).split('.')[0] + '.<ref> (' + String(who.v).split(',')[0] + ')', !!id && ssl && ssl.ssl === true && /^factory_runner/.test(who.u));

  // L1
  { const t = tag(); const wo = await mk('race');
    const [a, b] = await Promise.all([runAsync([WORKER, 'node-lp-a-' + t, 'complete', LEASE]), runAsync([WORKER, 'node-lp-b-' + t, 'complete', LEASE])]);
    const winners = [a, b].filter((o) => claimedIn(o) === wo).length, losers = [a, b].filter((o) => /NOTHING/.test(o.out)).length;
    check('L1 two processes race for one work order on the live plane: exactly one claims it (' + winners + '), the other finds nothing (' + losers + ')', winners === 1 && losers === 1, a.out + b.out); }

  // L2
  { const t = tag(); const wo = await mk('die-resume');
    const dead = await runAsync([WORKER, 'node-lp-dead-' + t, 'die', '10']);
    const early = await runAsync([WORKER, 'node-lp-early-' + t, 'resume', LEASE]);
    await sleep(14000);
    const late = await runAsync([WORKER, 'node-lp-late-' + t, 'resume', LEASE]);
    check('L2 a dead worker\'s work order is held until its lease expires (early resume: nothing), then resumed by another process with the checkpoint (prior checkpoints 1)',
      dead.code === 3 && claimedIn(dead) === wo && /NOTHING/.test(early.out) && claimedIn(late) === wo && /PRIOR_CHECKPOINTS 1/.test(late.out) && (await status(wo)) === 'done', dead.out + early.out + late.out); }

  // L3
  { const t = tag(); const surface = 'qa/factory/live/shared-' + t;
    const w1 = await mk('conflict one', { surface }), w2 = await mk('conflict two', { surface }), w3 = await mk('free');
    const wave1 = await Promise.all([runAsync([WORKER, 'node-lp-x-' + t, 'hold', LEASE, '5']), runAsync([WORKER, 'node-lp-y-' + t, 'hold', LEASE, '5']), runAsync([WORKER, 'node-lp-z-' + t, 'hold', LEASE, '5'])]);
    const first = wave1.map(claimedIn).filter(Boolean);
    const runs = (await db.read('select work_order_id, started_at, finished_at from factory.agent_runs where work_order_id = any($1::uuid[]) order by started_at', [[w1, w2, w3]])).rows;
    const r1 = runs.find((r) => r.work_order_id === w1), r2 = runs.find((r) => r.work_order_id === w2);
    const overlapped = r1 && r2 ? (+new Date(r1.started_at) < +new Date(r2.finished_at || 0) && +new Date(r2.started_at) < +new Date(r1.finished_at || 0)) : false;
    const wave2 = await Promise.all([runAsync([WORKER, 'node-lp-x2-' + t, 'complete', LEASE]), runAsync([WORKER, 'node-lp-y2-' + t, 'complete', LEASE])]);
    const done = (await db.read("select count(*)::int n from factory.work_orders where work_order_id = any($1::uuid[]) and status = 'done'", [[w1, w2, w3]])).rows[0].n;
    check('L3 three processes, two work orders on one surface: the pair ' + (overlapped ? 'OVERLAPPED' : 'never overlapped') + ', the free one was claimed (' + first.includes(w3) + '), all three done after a second wave (' + done + '/3)', !overlapped && first.includes(w3) && !(first.includes(w1) && first.includes(w2) && overlapped) && done === 3, wave1.map((o) => o.out).join('') + wave2.map((o) => o.out).join('')); }

  // L4
  { const t = tag(); const woV = await mk('needs verifier', { role: 'verifier' }); const woR = await mk('needs release broker', { role: 'release_broker' });
    const g = await runAsync([WORKER, 'node-lp-generic-' + t, 'complete', LEASE], { WORKER_ROLE: 'generic' });
    const v = await runAsync([WORKER, 'node-lp-verifier-' + t, 'complete', LEASE], { WORKER_ROLE: 'verifier' });
    check('L4 roles from the node record: the generic process got nothing (' + /NOTHING/.test(g.out) + '), the verifier process got the verifier work order (' + (claimedIn(v) === woV) + '), the release_broker work order still waits (' + ((await status(woR)) === 'queued') + ')',
      /NOTHING/.test(g.out) && claimedIn(v) === woV && (await status(woR)) === 'queued', g.out + v.out); }

  // L5
  { const t = tag(); const wo = await mk('needs forged cap'); await db.write("update factory.work_orders set requires_capabilities = $2::text[] where work_order_id = $1", [wo, [CAP, 'forged-capability']]);
    const liar = await runAsync([WORKER, 'node-lp-liar-' + t, 'complete', LEASE], { WORKER_CLAIM_CAPS: CAP + ',forged-capability' });
    check('L5 a process claiming a capability its node record does not carry is refused (the plane\'s record decides)', /NOTHING/.test(liar.out) && (await status(wo)) === 'queued', liar.out); }

  // L6
  { const t = tag(); const woA = await mk('authored'); const woV = await mk('verification', { role: 'verifier' }); const woS = await mk('self-verification', { role: 'verifier' });
    const a = await runAsync([WORKER, 'node-lp-author-' + t, 'complete', LEASE]);
    const authored = runIdIn(a);
    const v = await runAsync([WORKER, 'node-lp-verifier2-' + t, 'verify', LEASE, authored], { WORKER_ROLE: 'verifier' });
    const s = await runAsync([WORKER, 'node-lp-selfv-' + t, 'selfverify', LEASE], { WORKER_ROLE: 'verifier' });
    check('L6 independent verification on the live plane: a different process and node verified the authored run (' + /VERIFIED/.test(v.out) + '); a run verifying itself was refused (' + /REJECTED verification_is_independent/.test(s.out) + ')',
      authored && claimedIn(v) === woV && /VERIFIED/.test(v.out) && claimedIn(s) === woS && /REJECTED verification_is_independent/.test(s.out), a.out + v.out + s.out); }

  // L7
  { const t = tag(); const wo = await mk('admission');
    const starved = await runAsync([WORKER, 'node-lp-starved-' + t, 'complete', LEASE], { FACTORY_MIN_FREE_MB: '99999999', FACTORY_ADMISSION: 'on' });
    const fed = await runAsync([WORKER, 'node-lp-fed-' + t, 'complete', LEASE]);
    check('L7 admission control: a process below the memory floor claims nothing and says why; a process with room takes the work', /ADMISSION_REFUSED free memory .* is below FACTORY_MIN_FREE_MB 99999999/.test(starved.out) && claimedIn(fed) === wo, starved.out + fed.out); }

  // L8
  { const t = tag(); const h1 = await mk('heavy one', { weight: 'heavy' }); const h2 = await mk('heavy two', { weight: 'heavy' });
    const env = { FACTORY_HEAVY_PER_PLANE: '1' };
    const pair = await Promise.all([runAsync([WORKER, 'node-lp-h1-' + t, 'hold', LEASE, '6'], env), runAsync([WORKER, 'node-lp-h2-' + t, 'hold', LEASE, '6'], env)]);
    const got = pair.map(claimedIn).filter(Boolean);
    const rest = await runAsync([WORKER, 'node-lp-h3-' + t, 'complete', LEASE], env);
    const doneN = (await db.read("select count(*)::int n from factory.work_orders where work_order_id = any($1::uuid[]) and status = 'done'", [[h1, h2]])).rows[0].n;
    check('L8 heavy limits (one heavy per plane): of two processes reaching for two heavy work orders exactly one held (' + got.length + '), the other completed after (' + doneN + '/2 done)', got.length === 1 && doneN === 2, pair.map((o) => o.out).join('') + rest.out); }

  // L9
  { const t = tag(); const woV = await mk('deepseek verifier work', { role: 'verifier' });
    const ds = await runAsync([WORKER, 'node-lp-ds-' + t, 'complete', LEASE], { WORKER_ROLE: 'verifier', WORKER_PROVIDER: 'deepseek', WORKER_MODEL: 'deepseek-chat', DEEPSEEK_API_KEY: '' });
    check('L9 the assurance gate on the live plane: a process intending deepseek-chat with no key is declined the verifier work order as BLOCKED_BY_CREDENTIAL and the work order waits',
      /\[claim\] declining .*BLOCKED_BY_CREDENTIAL/.test(ds.out) && claimedIn(ds) !== woV && (await status(woV)) === 'queued', ds.out); }

  // L10
  { const t = tag(); const wo = await mk('substitution');
    const swapped = await runAsync([WORKER, 'node-lp-swap-' + t, 'complete', LEASE], { WORKER_PROVIDER: 'stub', WORKER_MODEL: 'stub-model-a', WORKER_ACTUAL_MODEL: 'stub-model-b' });
    check('L10 no silent model fallback on the live plane: a run reporting stub-model-b for a request of stub-model-a is refused at completion (exit 4)', swapped.code === 4 && /SUBSTITUTION_REFUSED .*NO SILENT MODEL FALLBACK/.test(swapped.out) && claimedIn(swapped) === wo, swapped.out); }
} finally {
  const n = await cleanup();
  console.log('cleaned ' + n + ' LP- work order(s) and their runs, checkpoints and test nodes; nothing else touched');
}
console.log('');
console.log('shared_plane_live_acceptance: ' + pass + ' passed, ' + failures.length + ' failed  (live control plane, from ' + (process.env.COMPUTERNAME || 'this machine') + ')');
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log(' - ' + f); process.exit(1); }
process.exit(0);
