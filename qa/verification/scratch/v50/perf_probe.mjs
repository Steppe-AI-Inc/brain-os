// VERIFIER #50 — runtime bound under the cap, tail-floor cost, EOL/bare-CR inventory, and the
// literal-';' check inside the readsAsCompletion declaration (V48-D7).
import { readFileSync } from 'node:fs';
import { buildGate, extractConst } from '../../lib/belt_extract.mjs';
import { CAND_PATH } from './harness.mjs';
const raw = readFileSync(CAND_PATH);
const s = raw.toString('utf8');
console.log('bytes=' + raw.length + ' CRLF=' + (s.match(/\r\n/g) || []).length + ' bareLF=' + (s.match(/(?<!\r)\n/g) || []).length + ' bareCR=' + (s.match(/\r(?!\n)/g) || []).length + ' lines=' + s.split(/\r\n|\n/).length);
for (const m of s.matchAll(/\r(?!\n)/g)) { const line = s.slice(0, m.index).split(/\r\n|\n/).length; console.log('  bare CR at line ' + line + ': ' + JSON.stringify(s.slice(Math.max(0, m.index - 60), m.index + 40))); }
const decl = extractConst(s, 'readsAsCompletion');
console.log('readsAsCompletion declaration: literal ";" count = ' + (decl.match(/;/g) || []).length + ' (1 = the terminator only)');
const NAMES = ['No Limits Inc', 'Nothing Bundt Cakes', 'Khangai Cement'];
const g = buildGate(CAND_PATH, (c) => c, NAMES);
const t = (fn) => { const t0 = process.hrtime.bigint(); const v = fn(); return [Number(process.hrtime.bigint() - t0) / 1e6, v]; };
const clause = ('No Limits Inc and Nothing Bundt Cakes with no open tasks ').repeat(280) + 'was archived';
let [ms, v] = t(() => g.readsAsCompletion(clause)); console.log(`15 KB unsplittable clause (skipped negators): ${ms.toFixed(1)} ms verdict=${v} (tail floor: LEGACY on slice(4000) => ${v})`);
const times = [];
for (const n of [500, 1000, 2000, 4000]) { const x = ('No Limits Inc with no open tasks ').repeat(Math.ceil(n / 34)).slice(0, n - 12) + 'was archived'; times.push([n, t(() => g.readsAsCompletion(x))[0]]); }
console.log('growth under cap: ' + times.map(([n, m]) => n + 'ch=' + m.toFixed(1) + 'ms').join(', ') + '  exponent(1000->4000)=' + (Math.log(times[3][1] / times[1][1]) / Math.log(4)).toFixed(2));
const long = 'Here is the current picture for the workspace. '.repeat(700) + 'Nothing was changed.';
[ms] = t(() => g.readsAsCompletion(long)); console.log(`33 KB ordinary prose: ${ms.toFixed(1)} ms`);
const worst = ('No Limits Inc and Nothing Bundt Cakes with no open tasks ').repeat(150) + 'was archived ' + ('and nothing else with no open tasks ').repeat(400);
[ms, v] = t(() => g.readsAsCompletion(worst)); console.log(`23 KB: claim UNDER the cap + long tail: ${ms.toFixed(1)} ms verdict=${v}`);
