// VERIFIER #69 — run the WHOLE scenarios-runner battery against one mutant, to answer "does ANY suite
// catch this?" rather than "does the suite I guessed catch this?".
// usage: node mutant_vs_battery.mjs <mutantFile>
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const mutant = process.argv[2];
if (!mutant || !fs.existsSync(mutant)) { console.error('mutant file missing'); process.exit(2); }
// Two suites fail on this machine for reasons unrelated to index.ts (repo-level Actions secret;
// the factory production-write inventory, which its own header declares expected-to-fail today).
const EXCLUDE = new Set(['production_write_authority.regression.test.mjs', 'factory_production_write_inventory.regression.test.mjs']);
const suites = fs.readdirSync('qa/scenarios-runner').filter((f) => f.endsWith('.mjs') && !f.startsWith('_') && !EXCLUDE.has(f));
const caught = [];
for (const s of suites) {
  let code = 0;
  try { execFileSync(process.execPath, ['qa/scenarios-runner/' + s], { env: { ...process.env, SEM_INDEX_SRC: mutant }, encoding: 'utf8', timeout: 600000, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { code = typeof e.status === 'number' ? e.status : -1; }
  if (code !== 0) caught.push(s);
}
console.log(mutant + ' -> ' + (caught.length ? 'KILLED by ' + caught.join(', ') : 'SURVIVED the whole battery (' + suites.length + ' suites)'));
