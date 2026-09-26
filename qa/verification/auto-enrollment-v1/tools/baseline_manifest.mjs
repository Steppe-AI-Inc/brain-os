// Director tool (READ-ONLY on the live plane): materialize the closed 69df2f52 two-machine baseline evidence as a hash manifest,
// so AC-11 / AC-13 have a concrete referent. SELECT only. Never prints or stores the runner URL.
// Credential, module pinning, the read-only pinned session and the observed identity: plane_access.mjs. ROOT (FACTORY_BASELINE_CHECKOUT)
// is a checkout whose database modules are the 69df2f52 files (the Director-branch checkout after npm ci, a fresh 69df2f52 clone, or,
// for the Director on the Home machine, the frozen legacy checkout read-only); never the candidate tree. On a disposable plane the
// verifier compares the full set hashes printed here with the committed manifest's; the output file there is labelled VERIFIER and
// names no live plane.
// usage: FACTORY_TARGET=live|disposable <one credential variable> node baseline_manifest.mjs <outFile>
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { openPlane } from './plane_access.mjs';

const ROOT = process.env.FACTORY_BASELINE_CHECKOUT || 'C:/Users/Dell/dev/brain-os-factory-cp';
const WR = 'C:/Users/Dell/dev/brain-os-wo-resolver';
const out = process.argv[2];
if (!out) { console.log('usage: baseline_manifest.mjs <outFile>'); process.exit(2); }
const { target, observed, session } = await openPlane(ROOT);

// canonical JSON: sorted keys, ISO timestamps
const canon = (v) => {
  if (v instanceof Date) return JSON.stringify(v.toISOString());
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
};
const h = (o) => createHash('sha256').update(canon(o)).digest('hex');

const TS = new Set(['started_at','finished_at','completed_at','created_at']);
const sel = (fields) => fields.map((f) => TS.has(f) ? "to_char(" + f + " at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') as " + f : f).join(', ');
const RUN_FIELDS = ['run_id', 'work_order_id', 'node_id', 'status', 'base_commit', 'head_commit', 'started_at', 'finished_at', 'authoring_run_id', 'authoring_node_id', 'verification_run_id', 'verification_node_id', 'verification_status', 'summary', 'error'];
const WO_FIELDS = ['work_order_id', 'title', 'work_type', 'status', 'owned_surface', 'requires_security_role', 'requires_capabilities', 'completed_at', 'handoff'];
const CP_FIELDS = ['checkpoint_id', 'run_id', 'work_order_id', 'location', 'scenario', 'payload', 'created_at'];
const ROWS_OUT = process.env.FACTORY_BASELINE_ROWS_OUT;

const got = await session(async (q) => {
  const runs = await q(`select ${sel(RUN_FIELDS)} from factory.agent_runs where base_commit like '69df2f52%' order by started_at, run_id`);
  const woIds = [...new Set(runs.map((r) => r.work_order_id))];
  const wos = await q(`select ${sel(WO_FIELDS)} from factory.work_orders where work_order_id = any($1::uuid[]) order by created_at, work_order_id`, [woIds]);
  const cps = await q(`select ${sel(CP_FIELDS)} from factory.checkpoints where work_order_id = any($1::uuid[]) or payload::text like '%69df2f52%' order by created_at, checkpoint_id`, [woIds]);
  if (!ROWS_OUT) return { runs, wos, cps };
  // The complete rows (EVERY column, as to_jsonb renders them in this UTC session), so a verifier loads an unchanged COPY into a
  // disposable plane provisioned as 69df2f52 and re-hashes after the candidate migration (AC-11 at candidate stage). The set is
  // closed under the 69df2f52 foreign keys: the manifest's runs, work orders and checkpoints, every work order and run they
  // reference, every node a run references, and the dependency rows between exported work orders.
  const J = async (sql, p) => (await q(sql, p)).map((r) => r.j);
  const cpAll = await J('select to_jsonb(t) j from factory.checkpoints t where checkpoint_id = any($1::uuid[]) order by created_at, checkpoint_id', [cps.map((c) => c.checkpoint_id)]);
  const runIds = [...new Set([...runs.map((r) => r.run_id), ...cpAll.map((c) => c.run_id)])];
  const runAll = await J('select to_jsonb(t) j from factory.agent_runs t where run_id = any($1::uuid[]) order by started_at, run_id', [runIds]);
  const woIdsAll = [...new Set([...runAll.map((r) => r.work_order_id), ...cpAll.map((c) => c.work_order_id)])];
  const woAll = await J('select to_jsonb(t) j from factory.work_orders t where work_order_id = any($1::uuid[]) order by created_at, work_order_id', [woIdsAll]);
  const nodeIds = [...new Set(runAll.map((r) => r.node_id).filter(Boolean))];
  const nodeAll = await J('select to_jsonb(t) j from factory.nodes t where node_id = any($1::text[]) order by node_id', [nodeIds]);
  const depAll = await J('select to_jsonb(t) j from factory.work_order_dependencies t where work_order_id = any($1::uuid[]) and depends_on = any($1::uuid[]) order by 1', [woIdsAll]);
  return { runs, wos, cps, rowsExport: { nodeAll, woAll, depAll, runAll, cpAll } };
});
const { runs, wos, cps } = got;

const fileHashes = (dir) => readdirSync(dir).filter((f) => statSync(join(dir, f)).isFile()).sort().map((f) => ({ file: f, sha256: createHash('sha256').update(readFileSync(join(dir, f))).digest('hex') }));
let wr = null;
try {
  const ev = join(WR, 'qa/verification/factory-two-machine-2026-09-26');
  wr = {
    repo: WR, branch: execFileSync('git', ['-C', WR, 'branch', '--show-current'], { encoding: 'utf8' }).trim(),
    ledger_218_commit: 'bf59ea34bd7ea9c10950e52ac7166e22922269be',
    ledger_218_commit_present: (() => { try { execFileSync('git', ['-C', WR, 'cat-file', '-e', 'bf59ea34bd7ea9c10950e52ac7166e22922269be']); return true; } catch { return false; } })(),
    pushed: (() => { try { return execFileSync('git', ['-C', WR, 'branch', '-r', '--contains', 'bf59ea34bd7ea9c10950e52ac7166e22922269be'], { encoding: 'utf8' }).trim() || null; } catch { return null; } })(),
    evidence_dir: 'qa/verification/factory-two-machine-2026-09-26', evidence_files: fileHashes(ev),
  };
} catch (e) { wr = { error: String(e.message).split('\n')[0] }; }

const manifest = {
  manifest: 'closed two-machine baseline evidence at 69df2f52f71fd2bc9415c34fb2be4dab4ee08dd6',
  purpose: 'Referent for AC-11 (baseline intact) and AC-13 part (1). Evidence fields only; columns added later (e.g. tenant_id) are outside the hash.',
  materialized_by: target === 'live' ? 'DIRECTOR (read-only SELECT on the live plane npvhuoozkbexddnvkqsj)' : 'VERIFIER (a disposable plane; the observed identity is printed)',
  plane: target === 'live' ? 'npvhuoozkbexddnvkqsj' : 'disposable',
  hash_rule: 'row sha256 = sha256 of canonical JSON of exactly the listed fields: object keys sorted recursively (jsonb included), timestamps rendered by SQL as UTC text with microseconds (YYYY-MM-DDTHH24:MI:SS.USZ), null as null, numbers as JSON numbers; set_sha256 = sha256 of the canonical JSON array of the row objects in the query order (runs: started_at, run_id; work orders: created_at, work_order_id; checkpoints: created_at, checkpoint_id)', instrument: 'qa/verification/auto-enrollment-v1/tools/baseline_manifest.mjs',
  fields: { agent_runs: RUN_FIELDS, work_orders: WO_FIELDS, checkpoints: CP_FIELDS },
  counts: { agent_runs: runs.length, work_orders: wos.length, checkpoints: cps.length },
  agent_runs: runs.map((r) => ({ run_id: r.run_id, sha256: h(r) })),
  work_orders: wos.map((w) => ({ work_order_id: w.work_order_id, title: w.title, sha256: h(w) })),
  checkpoints: cps.map((c) => ({ checkpoint_id: c.checkpoint_id, sha256: h(c) })),
  set_sha256: { agent_runs: h(runs), work_orders: h(wos), checkpoints: h(cps) },
  certification_record: wr,
};
writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n');
if (got.rowsExport) {
  const { nodeAll, woAll, depAll, runAll, cpAll } = got.rowsExport;
  writeFileSync(ROWS_OUT, JSON.stringify({
    rows_of: manifest.manifest, load_order: ['nodes', 'work_orders', 'work_order_dependencies', 'agent_runs', 'checkpoints'],
    rule: 'complete rows as to_jsonb renders them; load unchanged into a plane provisioned as 69df2f52; the verifier adds no row and fills no column',
    nodes: nodeAll, work_orders: woAll, work_order_dependencies: depAll, agent_runs: runAll, checkpoints: cpAll,
  }, null, 2) + '\n');
  console.log('rows export: nodes', nodeAll.length, 'wos', woAll.length, 'deps', depAll.length, 'runs', runAll.length, 'cps', cpAll.length);
}
console.log('counts runs', runs.length, 'wos', wos.length, 'cps', cps.length, '| ledger218 present', wr && wr.ledger_218_commit_present, 'pushed', wr && wr.pushed);
console.log('set_sha256 agent_runs', manifest.set_sha256.agent_runs);
console.log('set_sha256 work_orders', manifest.set_sha256.work_orders);
console.log('set_sha256 checkpoints', manifest.set_sha256.checkpoints);
console.log('observed:', observed.mode, observed.target, 'as', observed.current_user, 'plane', JSON.stringify(observed.plane_identity), 'root', observed.root_head.slice(0, 8), 'session', JSON.stringify(observed.session));
process.exit(0);
