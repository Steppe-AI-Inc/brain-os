#!/usr/bin/env node
// THE HTTP PROVIDER PATH, PROVED WITHOUT A CREDENTIAL. A stub OpenAI-compatible server on loopback plays DeepSeek, and a
// disposable real PostgreSQL plays the plane, so every promise of provider-http.mjs is measured end to end:
//
//   H1 no DEEPSEEK_API_KEY → BLOCKED_BY_CREDENTIAL and ZERO requests reach the server
//   H2 with a key: a real HTTP POST with the bearer header, the requested model, the answer, usage and a completion
//   H3 the server answers with a DIFFERENT model: the result reports it, and the plane REFUSES completeRun without a
//      fallbackReason (no silent model fallback), then accepts it with one
//   H4 401 → BLOCKED_BY_CREDENTIAL; 429 → PROVIDER_CAPACITY_BLOCKED; 503 → PROVIDER_TRANSIENT_ERROR; each named, none thrown
//   H5 a response that never terminates → STREAM_NEVER_TERMINATED / stream_never_terminated, and such a run does not
//      count as a completion for the model's assurance
//   H6 a 200 whose body stopped for length is NOT a completion (HTTP success != completed run)
//   H7 the credential never lands on the plane: no row in any control-plane table contains it after the runs
//   H8 the node-path gate: with the key present a process intending deepseek-chat is UNVERIFIED (declined verifier work),
//      and after two completed HTTP runs recorded on the plane it is admitted (the same evidence rule as CP-17)
//
// Disposable by construction; nothing here reaches api.deepseek.com or any production host.
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startLocalPg } from './local_pg.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
let pass = 0; const failures = [];
const check = (label, ok, detail) => { if (ok) { pass++; console.log('OK   ' + label); } else { failures.push(label); console.log('FAIL ' + label + (detail ? '\n       ' + String(detail).slice(0, 300) : '')); } };

// ---- the stub provider ------------------------------------------------------------------------------------------
const FAKE_KEY = 'sk-stub-' + randomUUID().replace(/-/g, '');
let mode = 'ok'; let requests = []; let hung = [];
const server = createServer((req, res) => {
  let body = ''; req.on('data', (d) => { body += d; });
  req.on('end', () => {
    const parsed = (() => { try { return JSON.parse(body); } catch { return null; } })();
    requests.push({ path: req.url, auth: req.headers.authorization || '', model: parsed && parsed.model });
    const reply = (status, obj) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
    const completion = (model, finish) => ({ id: 'chatcmpl-' + randomUUID().slice(0, 8), object: 'chat.completion', model, choices: [{ index: 0, message: { role: 'assistant', content: 'stub answer' }, finish_reason: finish }], usage: { prompt_tokens: 12, completion_tokens: 3, prompt_cache_hit_tokens: 4 } });
    if (req.headers.authorization !== 'Bearer ' + FAKE_KEY) return reply(401, { error: { message: 'Authentication Fails' } });
    if (mode === 'ok') return reply(200, completion(parsed.model, 'stop'));
    if (mode === 'substitute') return reply(200, completion('deepseek-reasoner', 'stop'));
    if (mode === '429') return reply(429, { error: { message: 'Rate limit reached' } });
    if (mode === '503') return reply(503, { error: { message: 'Service Unavailable' } });
    if (mode === 'length') return reply(200, completion(parsed.model, 'length'));
    if (mode === 'hang') { res.writeHead(200, { 'content-type': 'application/json' }); res.write('{"id":"never"'); hung.push(res); return; }
    reply(500, { error: { message: 'unknown stub mode' } });
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
process.env.DEEPSEEK_BASE_URL = 'http://127.0.0.1:' + port;
delete process.env.DEEPSEEK_API_KEY;

// ---- the disposable plane ---------------------------------------------------------------------------------------
const pg = await startLocalPg();
const { default: pgLib } = await import('pg');
const admin = new pgLib.Client({ connectionString: pg.superUrl }); await admin.connect();
for (const f of readdirSync(join(ROOT, 'supabase/control-plane')).filter((x) => /^\d{3}_.*\.sql$/.test(x)).sort()) await admin.query(readFileSync(join(ROOT, 'supabase/control-plane', f), 'utf8'));
await admin.query('grant usage on schema factory to ' + pg.runnerRole); await admin.query('grant select, insert, update, delete on all tables in schema factory to ' + pg.runnerRole);
process.env.FACTORY_RUNNER_PG_URL = pg.runnerUrl;
process.env.FACTORY_ADMISSION = 'off';
const claim = await import(pathToFileURL(join(ROOT, 'scripts/factory-runner/claim.mjs')).href);
const db = await import(pathToFileURL(join(ROOT, 'scripts/factory-runner/db.mjs')).href);
const { httpCompletion, completionToRunFields, BLOCKED_BY_CREDENTIAL, STREAM_NEVER_TERMINATED } = await import(pathToFileURL(join(ROOT, 'scripts/factory-runner/provider-http.mjs')).href);
const { PROVIDER_CAPACITY_BLOCKED, PROVIDER_TRANSIENT_ERROR } = await import(pathToFileURL(join(ROOT, 'scripts/factory-runner/provider.mjs')).href);
const { deriveAssurance, mayServe, COMPLETED_TERMINAL_REASONS } = await import(pathToFileURL(join(ROOT, 'scripts/factory-runner/model-assurance.mjs')).href);
const NODE = 'node-http-' + randomUUID().slice(0, 8);
await claim.registerNode({ nodeId: NODE, capabilities: ['http-provider-acceptance'], securityRole: 'generic', platform: 'test' });
const newWo = async (title, role = 'generic') => { const id = randomUUID(); await admin.query("insert into factory.work_orders (work_order_id, title, owned_surface, priority, status, requires_security_role) values ($1, $2, $3::text[], 'medium', 'queued', $4)", [id, title, ['qa/factory/http/' + id.slice(0, 8)], role]); return id; };
const MSGS = [{ role: 'user', content: 'Reply with the single word ok.' }];
const REQ = { provider: 'deepseek', model: 'deepseek-chat' };

try {
  // H1
  const h1 = await httpCompletion({ ...REQ, messages: MSGS });
  check('H1 without DEEPSEEK_API_KEY the call is BLOCKED_BY_CREDENTIAL and no request reaches the server', h1.classification === BLOCKED_BY_CREDENTIAL && h1.requestsMade === 0 && requests.length === 0 && !h1.ok, JSON.stringify(h1));

  // H2
  process.env.DEEPSEEK_API_KEY = FAKE_KEY;
  const h2 = await httpCompletion({ ...REQ, messages: MSGS });
  check('H2 with the key: one POST with the bearer header and the requested model; the answer, usage and a completion come back',
    h2.ok && h2.terminationReason === 'completed' && h2.actualModel === 'deepseek-chat' && h2.content === 'stub answer' && h2.usage.inputTokens === 12 && h2.usage.outputTokens === 3 && h2.usage.cachedTokens === 4
      && requests.length === 1 && requests[0].auth === 'Bearer ' + FAKE_KEY && requests[0].model === 'deepseek-chat' && requests[0].path === '/chat/completions', JSON.stringify(h2) + ' ' + JSON.stringify(requests));
  check('H2b the result carries no credential', !JSON.stringify(h2).includes(FAKE_KEY));

  // H3: substitution refused by the plane without a reason, accepted with one
  mode = 'substitute';
  await newWo('H3 substitution');
  const run3 = await claim.claimWork({ nodeId: NODE, leaseSeconds: 30, requestedProvider: 'deepseek', requestedModel: 'deepseek-chat' });
  const h3 = await httpCompletion({ ...REQ, messages: MSGS });
  let refused = '';
  try { await claim.completeRun({ runId: run3.run_id, ...completionToRunFields(h3) }); } catch (e) { refused = String(e.message); }
  let accepted = false;
  try { await claim.completeRun({ runId: run3.run_id, ...completionToRunFields(h3), fallbackReason: 'provider answered with deepseek-reasoner (stub)' }); accepted = true; } catch (e) { refused += ' | second: ' + e.message; }
  const row3 = (await admin.query('select requested_model, actual_model, fallback_reason, status, termination_reason from factory.agent_runs where run_id = $1', [run3.run_id])).rows[0];
  check('H3 the server answered with a different model: the result names it, the plane refuses completeRun without a fallbackReason and accepts it with one',
    h3.actualModel === 'deepseek-reasoner' && /NO SILENT MODEL FALLBACK/.test(refused) && accepted && row3.actual_model === 'deepseek-reasoner' && row3.fallback_reason && row3.status === 'done', refused + ' ' + JSON.stringify(row3));

  // H4
  mode = '429'; const h4a = await httpCompletion({ ...REQ, messages: MSGS });
  mode = '503'; const h4b = await httpCompletion({ ...REQ, messages: MSGS });
  const savedKey = process.env.DEEPSEEK_API_KEY; process.env.DEEPSEEK_API_KEY = 'sk-wrong'; mode = 'ok';
  const h4c = await httpCompletion({ ...REQ, messages: MSGS });
  process.env.DEEPSEEK_API_KEY = savedKey;
  check('H4 429 → PROVIDER_CAPACITY_BLOCKED (quota); 503 → PROVIDER_TRANSIENT_ERROR; a refused key → BLOCKED_BY_CREDENTIAL (auth_error); none thrown',
    h4a.classification === PROVIDER_CAPACITY_BLOCKED && h4a.terminationReason === 'quota' && h4b.classification === PROVIDER_TRANSIENT_ERROR && h4b.httpStatus === 503 && h4c.classification === BLOCKED_BY_CREDENTIAL && h4c.terminationReason === 'auth_error',
    [h4a, h4b, h4c].map((x) => x.classification + '/' + x.terminationReason).join(' '));

  // H5: a hanging response, recorded on the plane, is not a completion
  mode = 'hang';
  await newWo('H5 hang');
  const run5 = await claim.claimWork({ nodeId: NODE, leaseSeconds: 30, requestedProvider: 'deepseek', requestedModel: 'deepseek-chat' });
  const h5 = await httpCompletion({ ...REQ, messages: MSGS, timeoutMs: 1500 });
  for (const r of hung) { try { r.destroy(); } catch { /* closed */ } }
  await claim.completeRun({ runId: run5.run_id, ...completionToRunFields(h5) });
  const row5 = (await admin.query('select status, termination_reason from factory.agent_runs where run_id = $1', [run5.run_id])).rows[0];
  check('H5 a response that never terminates → STREAM_NEVER_TERMINATED, recorded as failed/stream_never_terminated, not a completion',
    h5.classification === STREAM_NEVER_TERMINATED && h5.terminationReason === 'stream_never_terminated' && row5.status === 'failed' && row5.termination_reason === 'stream_never_terminated' && !COMPLETED_TERMINAL_REASONS.includes(row5.termination_reason), JSON.stringify(h5) + ' ' + JSON.stringify(row5));

  // H6
  mode = 'length';
  const h6 = await httpCompletion({ ...REQ, messages: MSGS });
  check('H6 HTTP 200 whose body stopped for length is NOT a completion (truncated)', !h6.ok && h6.terminationReason === 'truncated' && h6.httpStatus === 200, JSON.stringify(h6));

  // H8 (before H7 so the evidence rows exist): the assurance gate on the plane with the key present
  mode = 'ok';
  await newWo('H8 verifier work', 'verifier');
  await admin.query("update factory.nodes set security_role = 'verifier' where node_id = $1", [NODE]);
  const before = await claim.claimWork({ nodeId: NODE, leaseSeconds: 30, requestedProvider: 'deepseek', requestedModel: 'deepseek-chat' });
    // two completed runs on generic work, served through the real HTTP path
  for (let i = 0; i < 2; i++) {
    await newWo('H8 generic ' + i);
    const r = await claim.claimWork({ nodeId: NODE, leaseSeconds: 30, requestedProvider: 'deepseek', requestedModel: 'deepseek-chat' });
    const c = await httpCompletion({ ...REQ, messages: MSGS });
    await claim.completeRun({ runId: r.run_id, ...completionToRunFields(c) });
  }
  const after = await claim.claimWork({ nodeId: NODE, leaseSeconds: 30, requestedProvider: 'deepseek', requestedModel: 'deepseek-chat' });
  const standing = deriveAssurance((await admin.query("select * from factory.agent_runs where requested_model = 'deepseek-chat' and status in ('done','failed')")).rows, { credentialPresent: true });
  check('H8 with the key present, deepseek-chat is declined verifier work while below PROVEN (FAILING after the hang, HISTORICAL after one completion) and admitted after two completed HTTP runs (' + standing.name + ')',
    !before && after && standing.name === 'PROVEN' && mayServe('verifier_round', standing).allowed === true, 'before=' + JSON.stringify(before) + ' after=' + (after && after.run_id) + ' standing=' + JSON.stringify(standing).slice(0, 200));
  if (after) await claim.completeRun({ runId: after.run_id, status: 'done', terminationReason: 'completed', actualProvider: 'deepseek', actualModel: 'deepseek-chat' });

  // H7: the key is nowhere on the plane
  const tables = (await admin.query("select table_name from information_schema.tables where table_schema = 'factory'")).rows.map((r) => r.table_name);
  let leaks = 0;
  for (const t of tables) { const r = await admin.query('select count(*)::int n from factory."' + t + '" x where x::text like $1', ['%' + FAKE_KEY + '%']); leaks += r.rows[0].n; }
  check('H7 the credential appears in no row of any control-plane table after the runs (' + tables.length + ' tables searched)', leaks === 0, 'rows containing the key: ' + leaks);
} finally {
  await admin.end().catch(() => {});
  await pg.stop();
  server.close();
  for (const r of hung) { try { r.destroy(); } catch { /* closed */ } }
}
console.log('');
console.log('http_provider_acceptance: ' + pass + ' passed, ' + failures.length + ' failed  (stub provider on 127.0.0.1:' + port + ', disposable plane; nothing reached a real provider)');
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log(' - ' + f); process.exit(1); }
process.exit(0);
