// VERIFIER #57 — faithful re-runs of the two unfaithful survivors (m5: a REAL pack collection; m6: a web file that does
// NOT import COMPANY_REF), each against the whole battery, in place, restored and sha-asserted.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
const ROOT = resolve(new URL('../../../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const IDX = resolve(ROOT, 'supabase/functions/sem-ai-command/index.ts');
const REQUIRED_SHA = 'ccde932fa5b1aeca77cb91d730df89ea16c100432d83dd80782b4217b85fe871';
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
if (sha(IDX) !== REQUIRED_SHA) throw new Error('index.ts sha mismatch at start');
const DIR = resolve(ROOT, 'qa/scenarios-runner');
const SUITES = readdirSync(DIR).filter((f) => f.endsWith('.mjs') && !f.startsWith('_') && !/production_write_authority|factory_production_write_inventory/.test(f)).sort();
const battery = () => SUITES.filter((f) => spawnSync(process.execPath, [resolve(DIR, f)], { cwd: ROOT, encoding: 'utf8', timeout: 300000 }).status !== 0);
function walk(dir, out = []) { for (const n of readdirSync(dir)) { const p = join(dir, n); if (n === 'node_modules' || n === '.next') continue; if (statSync(p).isDirectory()) walk(p, out); else if (/\.tsx?$/.test(n)) out.push(p); } return out; }
const noRefFile = walk(resolve(ROOT, 'web/app')).find((p) => { const t = readFileSync(p, 'utf8'); return !/COMPANY_REF|companyRefVia|companies\(name/.test(t) && /supabase/.test(t); });
function mustReplace(s, a, b, label) { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`anchor not unique (${n}) for ${label}`); return s.replace(a, () => b); }
const MUTANTS = [
  ['m5b_real_pack_envelope_dropped', IDX, (s) => mustReplace(s, "channels: envelope(channels, undefined, 'not archived'), departments: envelope(departments), leads: envelope(leads),", "channels: envelope(channels, undefined, 'not archived'), leads: envelope(leads),", 'm5b')],
  ['m6b_web_handwritten_join_in_a_file_without_COMPANY_REF', noRefFile, (s) => s + "\r\nexport const __v57_mutant = supabase.from('people').select('id, companies(name, status)');\r\n"],
];
const results = [];
for (const [name, file, mutate] of MUTANTS) {
  const before = readFileSync(file); const beforeSha = createHash('sha256').update(before).digest('hex');
  writeFileSync(file, mutate(before.toString('utf8')));
  let red; try { red = battery(); } finally { writeFileSync(file, before); }
  if (createHash('sha256').update(readFileSync(file)).digest('hex') !== beforeSha) throw new Error('RESTORE FAILED ' + file);
  results.push({ name, file: file.slice(ROOT.length + 1), killed: red.length > 0, red });
  console.log((red.length ? 'KILLED   ' : 'SURVIVED ') + name + ' in ' + file.slice(ROOT.length + 1) + ' red=' + JSON.stringify(red));
}
if (sha(IDX) !== REQUIRED_SHA) throw new Error('index.ts sha mismatch at END');
console.log('index.ts sha256 at end: ' + sha(IDX));
writeFileSync(resolve(ROOT, 'qa/verification/scratch/v57/vacuity2.json'), JSON.stringify(results, null, 1));
