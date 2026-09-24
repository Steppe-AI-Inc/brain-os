#!/usr/bin/env node
// EACH ROW GOES RED ON THE DEFECT IT NAMES. For the rows of acceptance.mjs (M-S) and node_truth_acceptance.mjs (N1-N11) added by
// the independent verifications of 2026-09-24, every fix is reverted - alone - in a sparse clone of HEAD, and the suite that
// owns the row is run there: the named row must FAIL. A row that stays green on its own defect proves nothing.
//
//   node qa/factory/acceptance_mutation_proof.mjs [ID ...]      all mutants, or only the named ones
//
// Before anything runs, every anchor is checked in HEAD: a mutation whose anchor text is gone would test nothing.
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const ACC = 'qa/factory/acceptance.mjs', NT = 'qa/factory/node_truth_acceptance.mjs';
const CLAIM = 'scripts/factory-runner/claim.mjs', DB = 'scripts/factory-runner/db.mjs', NODE = 'scripts/factory-runner/node.mjs';
const MUTANTS = [
  { id: 'M', suite: ACC, what: 'a run whose lease was taken over completes the work order', edits: [[CLAIM, "      where run_id = $1 and status = 'in_progress' and ($14::text is null or node_id = $14::text)", "      where run_id = $1 and ($14::text is null or true)"]] },
  { id: 'N', suite: ACC, what: 'the claim transaction opens with no lock or idle limit', edits: [[CLAIM, '    await client.query(claimSessionSql());', "    await client.query('begin');"]] },
  { id: 'O', suite: ACC, what: 'no connect or statement timeout', edits: [[DB, "    connectionTimeoutMillis: pgTimeoutMs('FACTORY_PG_CONNECT_TIMEOUT_MS', 20000),\n    query_timeout: pgTimeoutMs('FACTORY_PG_QUERY_TIMEOUT_MS', 60000),", '']] },
  { id: 'Q', suite: ACC, what: 'no transaction_timeout (a statement stalled before its Sync holds its lock)', edits: [[DB, "    await client.query('set idle_in_transaction_session_timeout = ' + idleTxMs + '; set transaction_timeout = ' + txMs);", "    await client.query('set idle_in_transaction_session_timeout = ' + idleTxMs);"]] },
  { id: 'P', suite: ACC, what: 'the work order is completed by a second statement', edits: [
    [CLAIM, "    finished as (\n      update factory.work_orders\n         set status = $2, completed_at = case when $2 = 'done' then now() else completed_at end, updated_at = now()\n       where work_order_id in (select work_order_id from fin))\n    select work_order_id from fin", "    x as (select 1)\n    select work_order_id from fin"],
    [CLAIM, "  if (!fin.rows.length) return { superseded: true };\n  return { superseded: false };", "  if (!fin.rows.length) return { superseded: true };\n  await db.write(\"update factory.work_orders set status = $2, completed_at = case when $2 = 'done' then now() else completed_at end, updated_at = now() where work_order_id = $1\", [fin.rows[0].work_order_id, status]);\n  return { superseded: false };"]] },
  { id: 'N1', suite: NT, what: 'health and plane-health re-register with a defaulted role', edits: [
    [NODE, '    const role = held ? held.security_role : (stated || "generic");', '    const role = nodeRole();'],
    ['scripts/factory-runner/plane-health.mjs', "const roleArg = args.includes('--role') ? args[args.indexOf('--role') + 1] : null;", "const roleArg = args.includes('--role') ? args[args.indexOf('--role') + 1] : (process.env.FACTORY_NODE_ROLE || 'generic');"]] },
  { id: 'N1', suite: NT, what: 'a health check stamps liveness (a dead node reads ALIVE)', label: 'N1L', edits: [[NODE, "      platform: process.platform + ' ' + hostname(), agentVersion: process.version, stamp: false, onlyIfAbsent: true });", "      platform: process.platform + ' ' + hostname(), agentVersion: process.version });"]] },
  { id: 'N14', suite: NT, what: 'a health check overwrites the running worker\'s record (its commit)', edits: [[NODE, "      platform: process.platform + ' ' + hostname(), agentVersion: process.version, stamp: false, onlyIfAbsent: true });", "      platform: process.platform + ' ' + hostname(), agentVersion: process.version, stamp: false });"]] },
  { id: 'N13', suite: NT, what: 'a run that cannot renew its lease keeps working', edits: [[NODE, "if (!stopped && Date.now() - leaseFrom > leaseMs - margin) abort(", "if (false) abort("]] },
  { id: 'N21', suite: NT, what: 'one failed renewal over a slow link aborts a healthy run (no quick retry; the guard at two thirds of the lease)', edits: [
    [NODE, "      .catch(() => { if (!stopped && !retry) { retry = setTimeout(() => { retry = null; renew(); }, 5000); if (typeof retry.unref === 'function') retry.unref(); } })", "      .catch(() => { /* the next tick */ })"],
    [NODE, '  const margin = Math.min(5000, leaseMs / 3);', '  const margin = leaseMs / 3;']] },
  { id: 'N22', suite: NT, what: 'an admission-only cycle counts as a claim cycle', edits: [[NODE, '    const admitted = !(claimWork.lastAdmission && claimWork.lastAdmission.admit === false);', '    const admitted = true;']] },
  { id: 'N15', suite: NT, what: 'the two-machine acceptance accepts a node on another commit', edits: [['qa/factory/two_machine_real.mjs', '  if (n.head !== EXPECTED || n.dirty || !n.handler) {', '  if (false) {']] },
  { id: 'G3', suite: ACC, what: 'the lease sweep erases which node ran an abandoned run', edits: [[CLAIM, "            set status = 'queued', lease_expires_at = null,", "            set status = 'queued', node_id = null, lease_expires_at = null,"]] },
  { id: 'N2', suite: NT, what: 'the worker never re-asserts its role', edits: [[NODE, "set last_heartbeat_at = now(), security_role = $2, capabilities", "set last_heartbeat_at = now(), security_role = was.security_role, capabilities"]] },
  { id: 'N23', suite: NT, what: 'two_machine_scheduling registers the checkout\'s own node id', label: 'N23s', edits: [['qa/factory/two_machine_scheduling.mjs', "const myNode = process.env.FACTORY_NODE_ID || ('node-tms-' + nodeMod.nodeId().slice(5, 17));", 'const myNode = process.env.FACTORY_NODE_ID || nodeMod.nodeId();']] },
  { id: 'N23', suite: NT, what: 'the worker re-asserts only its role, not its whole registration (an overwritten record stays overwritten)', edits: [[NODE, "capabilities = coalesce($3::jsonb, n.capabilities), agent_version = coalesce($4, n.agent_version) from was", "capabilities = coalesce(n.capabilities, $3::jsonb), agent_version = coalesce(n.agent_version, $4) from was"]] },
  { id: 'N3', suite: NT, what: 'the handler completes an action it does not know', edits: [['scripts/factory-runner/handlers/factory-acceptance.mjs', '  if (!ACTIONS.includes(p.action)) {', '  if (false) {']] },
  { id: 'N4', suite: NT, what: 'a failed run leaves its work order claimed', edits: [[CLAIM, "       where work_order_id in (select work_order_id from fin))\n    select work_order_id from fin", "       where $2 = 'done' and work_order_id in (select work_order_id from fin))\n    select work_order_id from fin"]] },
  { id: 'N5', suite: NT, what: 'a busy node stamps nothing on its node record', edits: [
    [CLAIM, "       where run_id in (select run_id from run)),\n    stamped as (\n      update factory.nodes set last_heartbeat_at = now()\n       where node_id = $2 and exists (select 1 from run))", "       where run_id in (select run_id from run))"],
    [NODE, '    nodeBeat(id, nodeRole(), reg).then((b) =>', '    Promise.resolve({ found: false }).then((b) =>']] },
  { id: 'N6', suite: NT, what: 'one transient plane error ends the worker', edits: [[NODE, "    const run = await retryTransient(() => claimWork({ nodeId: id, leaseSeconds, requestedProvider, requestedModel, workTypes, baseCommit: commit }), 'claim', log);", '    const run = await claimWork({ nodeId: id, leaseSeconds, requestedProvider, requestedModel, workTypes, baseCommit: commit });']] },
  { id: 'N7', suite: NT, what: 'the backoff resets only after ten minutes of uptime', edits: [['scripts/factory-runner/node-supervisor.mjs', 'status.readyAt = new Date().toISOString(); status.consecutiveFailures = 0; writeStatus(status);', 'status.readyAt = new Date().toISOString(); writeStatus(status);']] },
  { id: 'N8', suite: NT, what: 'the backoff resets on registration, and registration stamps liveness (a claim-failing worker crash-loops ALIVE)', edits: [
    ['scripts/factory-runner/node-supervisor.mjs', '/\\] ready: first claim cycle completed/.test(tail)', '/\\] registered; capabilities /.test(tail)'],
    [NODE, "agentVersion: reg.agentVersion, stamp: false });\n  // THE COMMIT ON EVERY RUN", "agentVersion: reg.agentVersion });\n  // THE COMMIT ON EVERY RUN"]] },
  { id: 'N9', suite: NT, what: 'a second worker runs under the same node identity', edits: [[NODE, '      if (!wl.held) {', '      if (false) {']] },
  { id: 'N9b', suite: NT, what: 'a bare worker runs beside the supervisor of the same node', edits: [[NODE, '      if (sup && sup.instance !== mine) {', '      if (false) {']] },
  { id: 'N10', suite: NT, what: 'the handler acts on malformed arguments', edits: [['scripts/factory-runner/handlers/factory-acceptance.mjs', '  if (bad) return {', '  if (false) return {']] },
  { id: 'N10', suite: NT, what: 'a data exception inside a run is retried forever', label: 'N10D', edits: [[NODE, '      } else if (/^22/.test(code)) {', '      } else if (false) {']] },
  { id: 'N11', suite: NT, what: 'a busy claim lock is silent', edits: [[NODE, '    noteBusy();\n', '']] },
  { id: 'N12', suite: NT, what: 'a failed run can be recorded as verified', edits: [[CLAIM, "        where run_id = $1 and (status = 'done' or run_id = $2 or authoring_node_id = $3)\n        returning run_id, authoring_node_id, verification_node_id", "        where run_id = $1\n        returning run_id, authoring_node_id, verification_node_id"]] },
  { id: 'R', suite: ACC, what: 'a close that is never answered hangs the worker', edits: [[DB, 'export async function write(sql, params = []) {\n  assertAllowed(sql);\n  const client = await connect();\n  try { return await client.query(sql, params); } finally { await close(client); }', 'export async function write(sql, params = []) {\n  assertAllowed(sql);\n  const client = await connect();\n  try { return await client.query(sql, params); } finally { await client.end(); }']] },
  { id: 'S', suite: ACC, what: 'a repeated, NULL, empty or oversized surface starves the plane', edits: [
    [CLAIM, "            and not exists (select 1 from unnest(wo.owned_surface) s where s is null or btrim(s) = '' or length(s) > 1000)\n", ''],
    [CLAIM, '      wo.owned_surface = [...new Set(wo.owned_surface || [])];\n', '']] },
  { id: 'N16', suite: NT, what: 'a claim-lock record left by an earlier worker is never replaced', edits: [[NODE, '  let busySeen;', '  let busySeen = null;']] },
  { id: 'N19', suite: NT, what: 'a worker whose record was deleted re-registers as never beaten', edits: [[NODE, 'if (!b.found) { await register(); await nodeBeat(id, nodeRole(), reg); log(', 'if (!b.found) { await register(); log(']] },
  { id: 'N8', suite: NT, what: 'health says "can claim work" while the supervisor is in backoff', label: 'N8H', edits: [[NODE, "  const working = !!(sup && sup.state === 'running' && sup.childPid && sup.readyAt);", '  const working = !!sup;']] },
  { id: 'N20', suite: NT, what: 'composer row 3 counts done runs at any commit', label: 'N20a', edits: [['qa/factory/factory_v1_acceptance.mjs', "where r.status = 'done' and r.base_commit = $1 and r.finished_at", "where r.status = 'done' and r.finished_at"]] },
  { id: 'N20', suite: NT, what: 'composer row 4 counts a verification whose verifying run never completed', label: 'N20b', edits: [['qa/factory/factory_v1_acceptance.mjs', "where a.status = 'done' and v.status = 'done' and a.base_commit", "where a.status = 'done' and a.base_commit"]] },
  { id: 'N20', suite: NT, what: 'composer row 1 counts a machine whose node runs the commit with uncommitted changes', label: 'N20c', edits: [['qa/factory/factory_v1_acceptance.mjs', " and not capabilities ? 'dirty'", '']] },
];
const git = (args, cwd) => spawnSync('git', args, { cwd, encoding: 'utf8' });
const head = git(['rev-parse', 'HEAD'], ROOT).stdout.trim();
const lf = (s) => s.split('\r\n').join('\n');
const pick = process.argv.slice(2);
const chosen = MUTANTS.filter((m) => !pick.length || pick.includes(m.label || m.id));
// every anchor, in HEAD's committed text, exactly once
const missing = [];
for (const m of chosen) for (const [file, from] of m.edits) { const src = lf(git(['show', head + ':' + file], ROOT).stdout || ''); if (src.split(from).length !== 2) missing.push((m.label || m.id) + ' ' + file + ': ' + from.slice(0, 70)); }
if (missing.length) { console.log('MUTATION ANCHORS MISSING - the proof would test nothing:\n  ' + missing.join('\n  ')); process.exit(2); }
console.log('acceptance mutation proof on ' + head + ' (' + chosen.length + ' mutants)');
const results = [];
for (const m of chosen) {
  const S = mkdtempSync(join(tmpdir(), 'accmut-'));
  git(['clone', '--quiet', '--no-hardlinks', '--no-checkout', ROOT, S], tmpdir());
  git(['sparse-checkout', 'set', '--cone', 'scripts', 'qa/factory', 'supabase/control-plane'], S);
  git(['checkout', '--quiet', head], S);
  // the clone runs on this checkout's installed dependencies (a junction; the lock is the same commit's)
  if (process.platform === 'win32') spawnSync('powershell', ['-NoProfile', '-Command', "New-Item -ItemType Junction -Path '" + join(S, 'node_modules') + "' -Target '" + join(ROOT, 'node_modules') + "' | Out-Null"]);
  else spawnSync('ln', ['-s', join(ROOT, 'node_modules'), join(S, 'node_modules')]);
  for (const [file, from, to] of m.edits) { const p = join(S, file); writeFileSync(p, lf(readFileSync(p, 'utf8')).replace(from, () => to)); }
  const r = spawnSync(process.execPath, [join(S, m.suite)], { cwd: S, encoding: 'utf8', timeout: 1200000, maxBuffer: 1 << 26, env: { ...process.env, FACTORY_RUNNER_PG_URL: '', FACTORY_STATE_DIR: '' } });
  const out = (r.stdout || '') + (r.stderr || '');
  const red = new RegExp('^FAIL ' + m.id + ' ', 'm').test(out);
  const summary = (out.match(/(factory acceptance|node_truth_acceptance): .*/) || ['no summary (exit ' + r.status + ')'])[0];
  results.push({ id: m.label || m.id, killed: red });
  console.log((red ? 'KILLED   ' : 'SURVIVED ') + (m.label || m.id) + ' (' + m.what + ') - ' + summary);
  if (process.platform === 'win32') spawnSync('powershell', ['-NoProfile', '-Command', "(Get-Item -LiteralPath '" + join(S, 'node_modules') + "').Delete()"]);
  try { rmSync(S, { recursive: true, force: true }); } catch { /* windows lock */ }
}
const killed = results.filter((x) => x.killed).length;
console.log('');
console.log('acceptance_mutation_proof: ' + killed + ' of ' + results.length + ' mutants killed on ' + head);
process.exit(killed === results.length ? 0 : 1);
