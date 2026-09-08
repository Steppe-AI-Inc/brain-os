// V38 battery runner. Executes every .mjs suite in qa/scenarios-runner/ as a CHILD PROCESS
// and records its real exit status directly (never through a shell pipeline, which is the
// measurement error the implementing session had to retract).
import { readdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = resolve(HERE, '../../../scenarios-runner');
const SRC = process.env.SEM_INDEX_SRC || resolve(HERE, '../../../../supabase/functions/sem-ai-command/index.ts');

const files = readdirSync(DIR).filter((f) => f.endsWith('.mjs')).sort();
const rows = [];
for (const f of files) {
  const r = spawnSync(process.execPath, [join(DIR, f)], {
    encoding: 'utf8', timeout: 180000, env: { ...process.env, SEM_INDEX_SRC: SRC },
  });
  const out = (r.stdout || '') + (r.stderr || '');
  const status = r.status;
  // classify from OUTPUT TEXT as well as status
  const failMatch = out.match(/(\d+)\s+failed/i);
  const passMatch = out.match(/(\d+)\s+passed/i);
  rows.push({
    file: f, status,
    passed: passMatch ? Number(passMatch[1]) : null,
    failed: failMatch ? Number(failMatch[1]) : null,
    helper: /export (function|const)/.test('') ? true : false,
    tail: out.trim().split('\n').slice(-3).join(' | ').slice(0, 220),
  });
}
const executed = rows.filter((r) => r.status !== null);
const nonzero = rows.filter((r) => r.status !== 0);
console.log(`SUITES DISCOVERED (.mjs): ${files.length}`);
console.log(`EXIT 0: ${rows.filter((r) => r.status === 0).length}`);
console.log(`NONZERO/ERROR: ${nonzero.length}`);
console.log('');
for (const r of rows) {
  const mark = r.status === 0 ? 'ok  ' : 'FAIL';
  console.log(`${mark} status=${String(r.status).padEnd(5)} p=${String(r.passed).padEnd(5)} f=${String(r.failed).padEnd(5)} ${r.file}`);
}
if (nonzero.length) {
  console.log('\n--- NONZERO DETAIL ---');
  for (const r of nonzero) console.log(`\n${r.file} (status ${r.status})\n  ${r.tail}`);
}
writeFileSync(join(HERE, 'battery_report.json'), JSON.stringify(rows, null, 1));
