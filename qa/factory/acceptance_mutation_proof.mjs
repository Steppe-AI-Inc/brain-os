#!/usr/bin/env node
// EACH ROW GOES RED ON THE DEFECT IT NAMES. For the rows of acceptance.mjs (M-Q) and node_truth_acceptance.mjs (N1-N7) added by
// the independent verification of 2026-09-24, every fix is reverted - alone - in a sparse clone of HEAD, and the suite that
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
  { id: 'N2', suite: NT, what: 'the worker never re-asserts its role', edits: [[NODE, "set last_heartbeat_at = now(), security_role = $2 from factory.nodes o", "set last_heartbeat_at = now(), security_role = o.security_role from factory.nodes o"]] },
  { id: 'N3', suite: NT, what: 'the handler completes an action it does not know', edits: [['scripts/factory-runner/handlers/factory-acceptance.mjs', '  if (!ACTIONS.includes(p.action)) {', '  if (false) {']] },
  { id: 'N4', suite: NT, what: 'a failed run leaves its work order claimed', edits: [[CLAIM, "       where work_order_id in (select work_order_id from fin))\n    select work_order_id from fin", "       where $2 = 'done' and work_order_id in (select work_order_id from fin))\n    select work_order_id from fin"]] },
  { id: 'N5', suite: NT, what: 'a busy node stamps nothing on its node record', edits: [
    [CLAIM, "       where run_id in (select run_id from run)),\n    stamped as (\n      update factory.nodes set last_heartbeat_at = now()\n       where node_id = $2 and exists (select 1 from run))", "       where run_id in (select run_id from run))"],
    [NODE, '    nodeBeat(id).then((b) =>', '    Promise.resolve({ found: false }).then((b) =>']] },
  { id: 'N6', suite: NT, what: 'one transient plane error ends the worker', edits: [[NODE, "    const run = await retryTransient(() => claimWork({ nodeId: id, leaseSeconds, requestedProvider, requestedModel, workTypes }), 'claim', log);", '    const run = await claimWork({ nodeId: id, leaseSeconds, requestedProvider, requestedModel, workTypes });']] },
  { id: 'N7', suite: NT, what: 'the backoff resets only after ten minutes of uptime', edits: [['scripts/factory-runner/node-supervisor.mjs', 'status.registeredAt = new Date().toISOString(); status.consecutiveFailures = 0; writeStatus(status);', 'status.registeredAt = new Date().toISOString(); writeStatus(status);']] },
];
const git = (args, cwd) => spawnSync('git', args, { cwd, encoding: 'utf8' });
const head = git(['rev-parse', 'HEAD'], ROOT).stdout.trim();
const lf = (s) => s.split('\r\n').join('\n');
const pick = process.argv.slice(2);
const chosen = MUTANTS.filter((m) => !pick.length || pick.includes(m.id));
// every anchor, in HEAD's committed text, exactly once
const missing = [];
for (const m of chosen) for (const [file, from] of m.edits) { const src = lf(git(['show', head + ':' + file], ROOT).stdout || ''); if (src.split(from).length !== 2) missing.push(m.id + ' ' + file + ': ' + from.slice(0, 70)); }
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
  results.push({ id: m.id, killed: red });
  console.log((red ? 'KILLED   ' : 'SURVIVED ') + m.id + ' (' + m.what + ') - ' + summary);
  if (process.platform === 'win32') spawnSync('powershell', ['-NoProfile', '-Command', "(Get-Item -LiteralPath '" + join(S, 'node_modules') + "').Delete()"]);
  try { rmSync(S, { recursive: true, force: true }); } catch { /* windows lock */ }
}
const killed = results.filter((x) => x.killed).length;
console.log('');
console.log('acceptance_mutation_proof: ' + killed + ' of ' + results.length + ' mutants killed on ' + head);
process.exit(killed === results.length ? 0 : 1);
