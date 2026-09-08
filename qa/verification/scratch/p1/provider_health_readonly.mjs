// READ-ONLY provider / semantic-memory health surface (work order AI_PROVIDER_RELIABILITY §4).
//
// Reports what the founder asked to be visible: embedding coverage, last successful embedding, last
// embedding failure, active provider/model, and the failure classes actually present in production.
// It SELECTs and nothing else — the refusal below is enforced, not documented.
//
// The point of this file is the rule it exists to serve: if embedding coverage is degraded, Brain must not
// pretend semantic memory is healthy. This tells you the truth from the database; making the PRODUCT say it
// is the P2 in the work order and needs a source change.
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DIR = mkdtempSync(join(tmpdir(), 'provider-health-'));
function q(sql) {
  if (/\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|merge)\b/i.test(sql)) {
    throw new Error('REFUSED — this surface is read-only');
  }
  const f = join(DIR, 'q.sql');
  writeFileSync(f, sql);
  // Windows will not spawn `npx` (a .cmd shim) from execFileSync without a shell, and passing `.cmd`
  // directly raises EINVAL — so go through the command processor explicitly rather than shell:true,
  // which would re-introduce the argument-splitting that mangled these SQL strings once already.
  const win = process.platform === 'win32';
  const out = win
    ? execFileSync(process.env.ComSpec || 'cmd.exe',
      ['/d', '/s', '/c', 'npx supabase db query --linked -f "' + f + '"'],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
    : execFileSync('npx', ['supabase', 'db', 'query', '--linked', '-f', f],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  return JSON.parse(out.slice(out.indexOf('{'))).rows || [];
}

const cov = q(`select count(*) filter (where embedding is not null) as with_embedding,
       count(*) as total,
       to_char(max(created_at) filter (where embedding is not null), 'YYYY-MM-DD HH24:MI') as last_success,
       to_char(max(created_at) filter (where embedding is null), 'YYYY-MM-DD HH24:MI') as last_failure
from public.memories;`)[0] || {};

const active = q(`select provider, model, label from public.ai_providers where is_active = true limit 1;`)[0] || {};

const usage = q(`select model_name, count(*) as calls,
       to_char(max(created_at), 'YYYY-MM-DD HH24:MI') as last_call
from public.model_usage group by model_name order by max(created_at) desc limit 8;`);

const failures = q(`select to_char(created_at, 'YYYY-MM-DD HH24:MI') as at,
       left(coalesce(output->>'error', ''), 90) as error_text
from public.work_orders
where status = 'rejected' or (output ? 'error')
order by created_at desc limit 5;`);

const total = Number(cov.total || 0);
const withEmb = Number(cov.with_embedding || 0);
const pct = total ? Math.round((withEmb / total) * 1000) / 10 : 0;

console.log('SEMANTIC MEMORY');
console.log('  embedding coverage       : ' + withEmb + '/' + total + '  (' + pct + '%)');
console.log('  last successful embedding: ' + (cov.last_success || 'never'));
console.log('  last embedding failure   : ' + (cov.last_failure || 'none'));
console.log('  embedding provider/model : openai / text-embedding-3-small (hardcoded; never follows ai_providers)');
// A threshold, not a vibe: anything below full coverage means retrieval is silently partial, and the
// founder's rule is that the ACTUAL retrieval mode must be visible rather than implied.
console.log('  RETRIEVAL MODE           : ' + (pct >= 99 ? 'SEMANTIC (healthy)'
  : pct <= 5 ? 'LEXICAL / CURRENT-CONTEXT ONLY — semantic retrieval is effectively dead'
    : 'PARTIAL — semantic retrieval covers only ' + pct + '% of memories'));

console.log('\nACTIVE PROVIDER');
console.log('  ' + (active.provider ? active.provider + ' / ' + active.model + '  (' + active.label + ')' : 'none configured'));
console.log('  NOTE: active means SELECTED, never PROVEN. Only serving evidence below proves a model works.');

console.log('\nRECENT SERVING EVIDENCE (model_usage — successes only; a failed call writes no row)');
for (const u of usage) console.log('  ' + String(u.model_name).padEnd(30) + String(u.calls).padStart(5) + '   last ' + u.last_call);

console.log('\nRECENT FAILED TURNS (work_orders — the ONLY place a provider failure is recorded today)');
if (!failures.length) console.log('  (none)');
for (const f of failures) console.log('  ' + f.at + '  ' + f.error_text);
console.log('\nNo audit event and no model_usage row is written when a provider call fails, so absence here');
console.log('is never evidence that nothing failed (work order AI_PROVIDER_RELIABILITY §3).');
